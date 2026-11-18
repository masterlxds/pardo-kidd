import type {
  AudioApi,
  LevelTheme,
  Background,
  Camera,
  Difficulty,
  Entity,
  FxKind,
  GameState,
  Level,
  Rect,
  Scene,
  SpriteAtlas,
  World,
} from '../core/types';
import { AIR_BUBBLE_TIME, COINS_PER_LIFE, EASY_LIVES, AIR_COUNTDOWN, MAX_AIR, MAX_HYDRATION, RENDER_SCALE, START_LIVES, TILE, VIEW_H, VIEW_W } from '../core/constants';
import { UBER, uberStars } from './uberRules';
import { overlaps } from '../core/physics';
import type { Input } from '../core/input';
import { createPlayer, LICK_STAFF_OFFSET, type PardoPlayer } from './player';
import { LEVEL_COUNT, LEVELS } from './levels';
import { createBonusStage, type BonusStage } from './bonus';
import {
  drawBonusEnd,
  drawBonusHud,
  drawBonusIntro,
  drawGameOver,
  drawHud,
  drawIntro,
  drawPaused,
  drawTitle,
  drawWin,
} from './hud';
import { createBackground } from '../gfx/background';
import { createAmazonBackground } from '../gfx/background2';
import { createBahiaBackground } from '../gfx/background3';
import { createRioBackground } from '../gfx/background4';
import { createSampaBackground } from '../gfx/background6';
import { createUberBackground } from '../gfx/background5';
import { createAtlas } from '../gfx/atlas';
import { createAudio } from '../audio/audio';
import { drawText } from '../gfx/font';

// ── Tuning ───────────────────────────────────────────────────────────────────
/** Look-ahead horizontal da câmera (px) na direção em que o Pardo olha. */
const CAM_LOOKAHEAD = 28;
const CAM_LOOK_RATE = 3;
const CAM_FOLLOW_X = 10;
const CAM_FOLLOW_Y = 6;
/** Posição vertical do Pardo na tela (fração da altura). */
const CAM_ANCHOR_Y = 0.58;
/** Entidades além desta distância da câmera não são atualizadas. */
const ACTIVE_MARGIN = VIEW_W * 1.5;
/**
 * Entidades presas ao Pardo ou à tela no autoscroller (Fase 5): SEMPRE atualizadas e desenhadas, sem
 * culling por distância (issue #10: o carro recriado longe da câmera congelava e sumia).
 */
const NO_CULL_KINDS: ReadonlySet<string> = new Set(['uber_car', 'truck_bau']);
/** Fase 5: x de tela em que a rolagem para com o desembarque (`uber_goal`) à vista. */
const UBER_GOAL_SCREEN_X = 150;
const DYING_TIME = 1.8;
const END_CONFIRM_DELAY = 0.8;
/** Duração do cartão "FASE N" antes de cada fase. */
const INTRO_TIME = 2.2;
/** Tempo mínimo no cartão antes de aceitar Enter/toque para pular. */
const INTRO_SKIP_DELAY = 0.25;
/** Distância (px) entre o centro do Pardo e o centro do alien ao receber a mamadeira. */
const GOAL_STAND_OFF = 14;
/**
 * Idem para o Maia (Fase 6): hitbox 22 (vs. 16 do Amaro) e sprite 34 com o braço da xícara indo até a borda.
 * 17 mantém a mesma folga de 1px entre as hitboxes que o Amaro tem e deixa a mão do Maia sobre o Pardo.
 */
const MAIA_STAND_OFF = 24;
const TIME_BONUS_PAR = 300;
const TIME_BONUS_RATE = 10;
const POPUP_LIFE = 0.9;
const MAX_PARTICLES = 160;

interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  t: number;
  life: number;
  /** quadro fixo (≥0) ou -1 para animar pela vida */
  frame: number;
  /** oscilação horizontal (bolhas): amplitude px/s e fase */
  wob?: number;
  ph?: number;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface Game {
  readonly world: GameWorld;
  readonly state: GameState;
  /** Um passo fixo de simulação. */
  update(dt: number): void;
  render(): void;
  /** Aba oculta: pausa se estiver jogando. */
  onHidden(): void;
}

export interface GameOptions {
  /** índice (0-based) da fase em que o primeiro jogo começa (ex.: ?fase=2 → 1) */
  startLevel?: number;
  /** inicia diretamente na Fase Bônus após o título (ex.: ?fase=bonus ou ?bonus=1) */
  startBonus?: boolean;
}

export class GameWorld implements World {
  level: Level;
  readonly player: PardoPlayer;
  readonly entities: Entity[] = [];
  readonly camera: Camera = { x: 0, y: 0 };
  readonly state: GameState;
  readonly audio: AudioApi;
  readonly sprites: SpriteAtlas;
  readonly bonusStage: BonusStage = createBonusStage();
  background: Background;
  time = 0;
  /** fase do primeiro "jogar" a partir do título (depois sempre volta à fase 0) */
  private startLevel: number;
  private startBonusMode: boolean;
  private pausedFrom: 'playing' | 'bonus' = 'playing';
  private backgrounds = new Map<LevelTheme, Background>();

  readonly particles: Particle[] = [];
  readonly popups: Popup[] = [];
  private pending: Entity[] = [];
  private shakeI = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private lookAhead = CAM_LOOKAHEAD;
  private checkpoint = -1;
  /** fitinhas da fase atual, na ordem de criação, e os índices já coletados (sobrevivem à morte) */
  private ribbonEntities: Entity[] = [];
  private collectedRibbons = new Set<number>();
  private lastPunchId = -1;
  private punchedEntities = new Set<Entity>();
  private punchedTiles = new Set<number>();
  /** último número da contagem regressiva de oxigênio tocado (0 = nenhum) */
  private lastCountdown = 0;
  /**
   * Autoscroller (Fase 5): velocidade ATUAL da rolagem da câmera (px/s), lida por player.ts. UBER.speed em
   * cruzeiro, cai até 0 nos últimos UBER.stopBars compassos; 0 fora de 'playing' e nas outras fases.
   */
  scrollSpeed = 0;
  /** Autoscroller: camera.x em que a rolagem para (desembarque à vista). */
  private scrollStopX = 0;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly input: Input,
    opts: GameOptions = {},
  ) {
    this.sprites = createAtlas();
    this.audio = createAudio();
    this.startLevel = clampLevel(opts.startLevel ?? 0);
    this.startBonusMode = Boolean(opts.startBonus);
    this.level = makeLevel(this.startLevel);
    this.background = this.backgroundFor(this.level.theme);
    this.state = {
      scene: 'title',
      sceneTime: 0,
      score: 0,
      lives: START_LIVES,
      coins: 0,
      hydration: MAX_HYDRATION,
      maxHydration: MAX_HYDRATION,
      elapsed: 0,
      timeBonus: 0,
      muted: false,
      levelIndex: this.startLevel,
      air: MAX_AIR,
      rideHits: 0,
      maxAir: MAX_AIR,
      ribbons: 0,
      ribbonsTotal: 0,
      dialogue: null,
      difficulty: 'normal',
      bonus: {
        active: false,
        coins: 0,
        target: 20,
        stage: 1,
        cleared: false,
        endedByCheckpoint: false,
      },
    };
    const sp = this.level.playerSpawn;
    this.player = createPlayer(sp.x, sp.y);
    this.replaceEntities();
    if (this.level.autoscroll) this.prepareRide();
    this.snapCamera();
    input.onGesture(() => this.audio.unlock());
  }

  // ── World API ──────────────────────────────────────────────────────────────
  spawn(e: Entity): void {
    this.pending.push(e);
  }

  addScore(points: number, x?: number, y?: number): void {
    if (!Number.isFinite(points) || points === 0) return;
    this.state.score += points;
    if (x !== undefined && y !== undefined) this.popup(String(points), x, y);
  }

  addCoin(): void {
    const st = this.state;
    st.coins += 1;
    if (st.coins >= COINS_PER_LIFE) {
      // 100 moedas → +1 vida e o contador zera
      st.coins -= COINS_PER_LIFE;
      st.lives = Math.min(EASY_LIVES, st.lives + 1);
      this.audio.play('oneup');
      if (st.scene === 'bonus' || st.scene === 'bonus_intro' || st.scene === 'bonus_end') {
        this.popup('1UP', VIEW_W / 2, VIEW_H - 54, '#4fc65a');
      } else {
        this.popup('1UP', this.player.centerX, this.player.y - 10, '#4fc65a');
      }
    }
  }

  fx(kind: FxKind, x: number, y: number, dir?: 1 | -1): void {
    const d = dir ?? 0;
    const add = (p: Omit<Particle, 'kind' | 't'>): void => {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({ kind, t: 0, ...p });
    };
    switch (kind) {
      case 'impact':
        add({ x, y, vx: 0, vy: 0, g: 0, life: 0.16, frame: -1 });
        break;
      case 'dust':
        for (let i = 0; i < 3; i++) {
          add({
            x: x + (i - 1) * 4,
            y,
            vx: (i - 1) * 18 + d * 20 + rand(-6, 6),
            vy: rand(-22, -8),
            g: 0,
            life: 0.3 + i * 0.04,
            frame: -1,
          });
        }
        break;
      case 'debris':
        for (let i = 0; i < 6; i++) {
          add({
            x: x + rand(-5, 5),
            y: y + rand(-5, 5),
            vx: rand(-70, 70) + d * 40,
            vy: rand(-220, -90),
            g: 700,
            life: 0.9,
            frame: i % 2,
          });
        }
        break;
      case 'splash':
        for (let i = 0; i < 5; i++) {
          add({ x, y, vx: rand(-50, 50) + d * 20, vy: rand(-150, -70), g: 500, life: 0.55, frame: i % 2 });
        }
        break;
      case 'bubble':
        // sobe com leve oscilação; tamanho aleatório (2 quadros)
        add({
          x: x + rand(-1.5, 1.5),
          y,
          vx: d * 10,
          vy: rand(-34, -22),
          g: -12,
          life: rand(1.1, 1.7),
          frame: Math.random() < 0.6 ? 1 : 0,
          wob: rand(10, 18),
          ph: rand(0, Math.PI * 2),
        });
        break;
      case 'sparkle':
        for (let i = 0; i < 2; i++) {
          add({
            x: x + rand(-4, 4),
            y: y + rand(-4, 4),
            vx: rand(-14, 14) + d * 10,
            vy: rand(-26, -8),
            g: 0,
            life: rand(0.4, 0.7),
            frame: Math.random() < 0.5 ? 0 : 1,
          });
        }
        break;
    }
  }

  shake(intensity: number, duration = 0.2): void {
    if (intensity >= this.shakeI * (this.shakeT / Math.max(this.shakeDur, 1e-6)) || this.shakeT <= 0) {
      this.shakeI = intensity;
      this.shakeT = duration;
      this.shakeDur = duration;
    }
  }

  win(): void {
    if (this.state.scene !== 'playing' || this.player.dead) return;
    const px = this.player.centerX;
    let goal: Entity | null = null;
    let best = Infinity;
    for (const e of this.entities) {
      if (e.dead || (e.kind !== 'mug' && e.kind !== 'goal' && e.kind !== 'staff' && e.kind !== 'amaro' && e.kind !== 'uber_goal' && e.kind !== 'maia')) continue;
      const d = Math.abs(e.x + e.w / 2 - px);
      if (d < best) {
        best = d;
        goal = e;
      }
    }
    if (goal && goal.kind === 'staff') {
      // Cajado Jailnesco: para de modo que o cajado do sprite pardo_lick caia sobre o centro do altar
      const cx = goal.x + goal.w / 2;
      this.player.startDrink(cx - LICK_STAFF_OFFSET, 'staff', 1);
      this.audio.stopMusic();
      this.audio.play('fanfare');
      this.setScene('winning');
      return;
    }
    if (goal && goal.kind === 'maia') {
      // Renan Maia entrega o café: ele sempre encara a esquerda (de onde o Pardo vem), então o Pardo
      // para à esquerda dele, ao alcance do braço estendido, e olha para ele
      const cx = goal.x + goal.w / 2;
      this.player.startDrink(cx - MAIA_STAND_OFF, 'coffee', 1);
    } else if (goal && goal.kind === 'uber_goal') {
      const cx = goal.x + goal.w / 2;
      const side: 1 | -1 = px <= cx ? -1 : 1;
      this.player.startDrink(cx + side * GOAL_STAND_OFF, 'mineral', side === -1 ? 1 : -1);
    } else if (goal && goal.kind === 'amaro') {
      const cx = goal.x + goal.w / 2;
      const side: 1 | -1 = px <= cx ? -1 : 1;
      this.player.startDrink(cx + side * GOAL_STAND_OFF, 'mineral', side === -1 ? 1 : -1);
    } else if (goal && goal.kind === 'goal') {
      // alien: o Pardo para um pouco antes, do lado de onde veio, e olha para ele
      const cx = goal.x + goal.w / 2;
      const side: 1 | -1 = px <= cx ? -1 : 1;
      this.player.startDrink(cx + side * GOAL_STAND_OFF, 'bottle', side === -1 ? 1 : -1);
    } else {
      this.player.startDrink(goal ? goal.x + goal.w / 2 : px, 'mug');
    }
    this.audio.stopMusic();
    this.audio.play('win');
    this.setScene('winning');
  }

  say(speaker: string, text: string, duration = 3.5): void {
    this.state.dialogue = { speaker, text, t: 0, duration };
  }

  addRibbon(): void {
    // identifica QUAL fitinha foi pega (a mais próxima do Pardo) para ela não voltar após morrer
    const px = this.player.centerX, py = this.player.y + this.player.h / 2;
    let best = -1, bestD = Infinity;
    this.ribbonEntities.forEach((e, i) => {
      if (this.collectedRibbons.has(i)) return;
      const d = Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) this.collectedRibbons.add(best);
    this.state.ribbons = this.collectedRibbons.size;
  }

  private setDifficulty(d: Difficulty): void {
    if (this.state.difficulty === d) return;
    this.state.difficulty = d;
    this.audio.play('coin');
  }

  // ── Fluxo de jogo ──────────────────────────────────────────────────────────
  setScene(s: Scene): void {
    if (s !== 'playing') this.scrollSpeed = 0;
    this.state.scene = s;
    this.state.sceneTime = 0;
  }

  /** Pausa a partida atual ('playing' ou 'bonus'), guardando a cena de origem. */
  pause(): void {
    const sc = this.state.scene;
    if (sc !== 'playing' && sc !== 'bonus') return;
    this.pausedFrom = sc;
    this.setScene('paused');
    this.audio.stopMusic();
  }

  /** Inicia a Fase Bônus ("Tubo do Bonfim"), preservando pontos, moedas e vidas. */
  startBonus(): void {
    this.state.dialogue = null;
    this.particles.length = 0;
    this.popups.length = 0;
    this.shakeT = 0;
    this.bonusStage.reset(this);
    this.state.bonus.active = true;
    this.setScene('bonus_intro');
    this.audio.play('start');
    this.audio.startMusic('bonus');
  }

  /** Começo do zero (título, game over ou fim do jogo → jogar) na fase `index`. */
  newGame(index = 0): void {
    const st = this.state;
    st.score = 0;
    st.lives = st.difficulty === 'amaro' ? EASY_LIVES : START_LIVES;
    st.coins = 0;
    st.bonus = {
      active: false,
      coins: 0,
      target: 20,
      stage: 1,
      cleared: false,
      endedByCheckpoint: false,
    };
    this.pausedFrom = 'playing';
    this.loadLevel(index);
    this.setScene('intro');
    this.audio.play('start');
    this.audio.startMusic(this.level.theme);
  }

  /**
   * Monta a fase `index` (level, cenário por tema, entidades, câmera). Mantém pontos/vidas/moedas;
   * zera hidratação (cheia), tempo, bônus e checkpoint.
   */
  loadLevel(index: number): void {
    const i = clampLevel(index);
    const st = this.state;
    if (i !== this.level.index) {
      this.level = makeLevel(i);
      this.background = this.backgroundFor(this.level.theme);
    }
    st.levelIndex = i;
    st.elapsed = 0;
    st.timeBonus = 0;
    st.rideHits = 0; // avaliação da corrida (Fase 5): zera ao (re)iniciar a fase, não ao renascer
    this.checkpoint = -1;
    this.time = 0;
    this.collectedRibbons.clear(); // fase nova (ou jogo novo): fitinhas voltam
    this.respawnAt(this.level.playerSpawn.x, this.level.playerSpawn.y);
  }

  private backgroundFor(theme: LevelTheme): Background {
    let bg = this.backgrounds.get(theme);
    if (!bg) {
      bg =
        theme === 'uber'
          ? createUberBackground()
          : theme === 'sampa'
            ? createSampaBackground()
            : theme === 'rio'
              ? createRioBackground()
              : theme === 'bahia'
                ? createBahiaBackground()
                : theme === 'amazonia'
                  ? createAmazonBackground()
                  : createBackground();
      this.backgrounds.set(theme, bg);
    }
    return bg;
  }

  /** Vitória → próxima fase, mantendo pontos/vidas/moedas. */
  private nextLevel(): void {
    this.loadLevel(this.state.levelIndex + 1);
    this.setScene('intro');
    this.audio.play('start');
    this.audio.startMusic(this.level.theme);
  }

  private respawnAt(x: number, y: number): void {
    this.level.reset();
    this.replaceEntities();
    this.player.respawn(x, y);
    if (this.level.autoscroll) this.prepareRide();
    this.state.hydration = this.state.maxHydration;
    this.state.air = this.state.maxAir;
    this.state.dialogue = null;
    this.lastCountdown = 0;
    this.particles.length = 0;
    this.popups.length = 0;
    this.shakeT = 0;
    this.lastPunchId = -1;
    this.punchedEntities.clear();
    this.punchedTiles.clear();
    this.lookAhead = CAM_LOOKAHEAD;
    this.snapCamera();
  }

  private respawnAtCheckpoint(): void {
    const cp = this.checkpoint >= 0 ? this.level.checkpoints[this.checkpoint] : undefined;
    const p = cp ?? this.level.playerSpawn;
    this.respawnAt(p.x, p.y);
  }

  /**
   * Autoscroller: posiciona o carro sob o Pardo (issue #10: createEntities o cria no spawn) e calcula onde
   * a rolagem para. Chamado depois de replaceEntities + player.respawn.
   */
  private prepareRide(): void {
    const cx = this.player.centerX;
    let goalCx = -1;
    for (const e of this.entities) {
      if (e.kind === 'uber_car') e.x = cx - e.w / 2;
      else if (e.kind === 'uber_goal') goalCx = e.x + e.w / 2;
    }
    const camMax = Math.max(0, this.level.widthPx - VIEW_W);
    this.scrollStopX = goalCx >= 0 ? clamp(goalCx - UBER_GOAL_SCREEN_X, 0, camMax) : camMax;
    this.scrollSpeed = UBER.speed;
  }

  /**
   * Autoscroller: avança camera.x pela rolagem (antes de entidades e Pardo, que leem a câmera deste passo).
   * Nos últimos UBER.stopBars compassos antes de scrollStopX a velocidade cai linearmente NO TEMPO até 0
   * (v = speed·√(resto/D), desaceleração constante speed²/2D), parando exatamente em scrollStopX.
   */
  private advanceScroll(dt: number): void {
    const c = this.camera;
    const rest = this.scrollStopX - c.x;
    if (rest <= 0.25) {
      c.x = Math.max(c.x, this.scrollStopX);
      this.scrollSpeed = 0;
      return;
    }
    const D = UBER.stopBars * UBER.barCols * TILE;
    this.scrollSpeed = rest >= D ? UBER.speed : Math.max(UBER.speed * Math.sqrt(rest / D), 6);
    c.x = Math.min(this.scrollStopX, c.x + this.scrollSpeed * dt);
  }

  private replaceEntities(): void {
    this.entities.length = 0;
    this.pending.length = 0;
    // fitinhas já coletadas continuam coletadas após morrer (a ordem de criação é estável → índice = identidade)
    this.ribbonEntities = [];
    for (const e of this.level.createEntities()) {
      if (e.kind === 'ribbon') {
        const i = this.ribbonEntities.push(e) - 1;
        if (this.collectedRibbons.has(i)) continue;
      }
      this.entities.push(e);
    }
    this.state.ribbons = this.collectedRibbons.size;
    this.state.ribbonsTotal = this.ribbonEntities.length;
  }

  private toggleMute(): void {
    const st = this.state;
    st.muted = !st.muted;
    this.audio.setMuted(st.muted);
    const btn = document.getElementById('btn-mute');
    if (btn) {
      btn.classList.toggle('muted', st.muted);
      btn.setAttribute('aria-pressed', String(st.muted));
    }
  }

  // ── Passo fixo ─────────────────────────────────────────────────────────────
  step(dt: number): void {
    const st = this.state;
    const input = this.input;
    st.sceneTime += dt;
    if (input.pressed('mute')) this.toggleMute();

    switch (st.scene) {
      case 'title':
        this.time += dt;
        this.updateParticles(dt);
        // seleção de dificuldade: ←/→ alternam; toque/clique numa metade da tela escolhe e inicia
        if (input.pressed('left')) this.setDifficulty('normal');
        if (input.pressed('right')) this.setDifficulty('amaro');
        if (input.pressed('confirm') || input.pressed('start')) {
          const tap = input.tapPos();
          if (tap) st.difficulty = tap.x < VIEW_W / 2 ? 'normal' : 'amaro';
          if (this.startBonusMode) {
            st.score = 0;
            st.lives = st.difficulty === 'amaro' ? EASY_LIVES : START_LIVES;
            st.coins = 0;
            this.startBonusMode = false;
            this.startLevel = 0;
            this.startBonus();
          } else {
            this.newGame(this.startLevel);
            this.startLevel = 0;
          }
        }
        break;

      case 'intro':
        // mundo parado por trás do cartão (sem simular o Pardo)
        this.time += dt;
        this.updateParticles(dt);
        if (
          st.sceneTime >= INTRO_TIME ||
          (st.sceneTime >= INTRO_SKIP_DELAY && (input.pressed('confirm') || input.pressed('start')))
        ) {
          this.setScene('playing');
        }
        break;

      case 'playing':
        if (input.pressed('pause')) {
          this.pause();
          break;
        }
        this.time += dt;
        st.elapsed += dt;
        this.stepPlaying(dt);
        this.updateAir(dt);
        this.updateDialogue(dt);
        if (this.player.dead && st.scene === 'playing') {
          st.lives = Math.max(0, st.lives - 1);
          this.audio.stopMusic();
          this.setScene('dying');
        }
        break;

      case 'paused':
        if (input.pressed('pause') || input.pressed('start')) {
          if (this.pausedFrom === 'bonus') {
            this.setScene('bonus');
            this.audio.startMusic('bonus');
          } else {
            this.setScene('playing');
            this.audio.startMusic(this.level.theme);
          }
        }
        break;

      case 'dying':
        this.time += dt;
        this.updateDialogue(dt);
        this.player.update(dt, this, input);
        this.updateParticles(dt);
        this.updatePopups(dt);
        this.updateShake(dt);
        if (st.sceneTime >= DYING_TIME) {
          if (st.lives > 0) {
            this.respawnAtCheckpoint();
            this.setScene('playing');
            if (this.level.autoscroll) this.audio.stopMusic(); // Fase 5: faixa recomeça do início, em sincronia com os compassos
            this.audio.startMusic(this.level.theme);
          } else {
            this.setScene('gameover');
            this.audio.play('gameover');
          }
        }
        break;

      case 'winning':
        this.time += dt;
        this.updateDialogue(dt);
        this.updateEntities(dt);
        this.player.update(dt, this, input);
        this.updateParticles(dt);
        this.updatePopups(dt);
        this.flushEntities();
        this.updateCamera(dt);
        if (this.player.drinkDone) {
          st.timeBonus = Math.max(0, Math.floor(TIME_BONUS_PAR - st.elapsed)) * TIME_BONUS_RATE;
          st.score += st.timeBonus;
          // Fase 5: avaliação da corrida (bônus = UBER.starBonus × estrelas)
          if (this.level.autoscroll) st.score += UBER.starBonus * uberStars(st.rideHits);
          this.setScene('win');
        }
        break;

      case 'gameover':
        this.time += dt;
        this.updateParticles(dt);
        this.updatePopups(dt);
        if (st.sceneTime >= END_CONFIRM_DELAY && (input.pressed('confirm') || input.pressed('start'))) {
          this.newGame(0);
        }
        break;

      case 'win':
        this.time += dt;
        this.updateParticles(dt);
        this.updatePopups(dt);
        if (st.sceneTime >= END_CONFIRM_DELAY && (input.pressed('confirm') || input.pressed('start'))) {
          const unlockBonus =
            st.levelIndex === 2 &&
            st.ribbonsTotal > 0 &&
            st.ribbons >= st.ribbonsTotal;
          if (unlockBonus) {
            this.startBonus();
          } else if (st.levelIndex + 1 < LEVEL_COUNT) {
            this.nextLevel();
          } else {
            this.newGame(0);
          }
        }
        break;

      case 'bonus_intro':
        this.time += dt;
        this.updateParticles(dt);
        if (
          st.sceneTime >= INTRO_TIME ||
          (st.sceneTime >= INTRO_SKIP_DELAY && (input.pressed('confirm') || input.pressed('start')))
        ) {
          this.setScene('bonus');
        }
        break;

      case 'bonus': {
        if (input.pressed('pause')) {
          this.pause();
          break;
        }
        this.time += dt;
        const res = this.bonusStage.update(dt, this, input);
        this.updateParticles(dt);
        this.updatePopups(dt);
        this.updateShake(dt);
        if (res === 'cleared' || res === 'failed') {
          this.audio.stopMusic();
          this.setScene('bonus_end');
        }
        break;
      }

      case 'bonus_end':
        this.time += dt;
        this.updateParticles(dt);
        this.updatePopups(dt);
        this.updateShake(dt);
        if (st.sceneTime >= END_CONFIRM_DELAY && (input.pressed('confirm') || input.pressed('start'))) {
          st.bonus.active = false;
          this.pausedFrom = 'playing';
          this.loadLevel(3);
          this.setScene('intro');
          this.audio.play('start');
          this.audio.startMusic(this.level.theme);
        }
        break;
    }
    input.endStep();
  }

  /** Ordem do PLAN §3. */
  private stepPlaying(dt: number): void {
    if (this.level.autoscroll) this.advanceScroll(dt);
    else this.scrollSpeed = 0;
    this.updateEntities(dt);
    this.player.update(dt, this, this.input);
    if (!this.player.dead) {
      this.resolvePunch();
      this.resolveContacts();
      this.checkCheckpoints();
    }
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.flushEntities();
    this.updateCamera(dt);
  }

  /** Oxigênio (só em fase subaquática): drena, contagem regressiva e afogamento. */
  private updateAir(dt: number): void {
    const st = this.state;
    if (!this.level.underwater || st.scene !== 'playing' || this.player.dead) return;
    st.air = Math.max(0, Math.min(st.maxAir, st.air - dt / AIR_BUBBLE_TIME));
    if (st.air <= 0) {
      this.lastCountdown = 0;
      this.player.drown(this);
      return;
    }
    if (st.air <= 1) {
      const n = Math.ceil(st.air * AIR_COUNTDOWN);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        this.audio.play('countdown');
      }
    } else {
      this.lastCountdown = 0;
    }
  }

  private updateDialogue(dt: number): void {
    const d = this.state.dialogue;
    if (!d) return;
    d.t += dt;
    if (d.t >= d.duration) this.state.dialogue = null;
  }

  private updateEntities(dt: number): void {
    const minX = this.camera.x - ACTIVE_MARGIN;
    const maxX = this.camera.x + VIEW_W + ACTIVE_MARGIN;
    for (const e of this.entities) {
      if (e.dead) continue;
      if ((e.x + e.w < minX || e.x > maxX) && !NO_CULL_KINDS.has(e.kind)) continue;
      e.update(dt, this);
    }
  }

  private flushEntities(): void {
    let j = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e && !e.dead) this.entities[j++] = e;
    }
    this.entities.length = j;
    if (this.pending.length > 0) {
      for (const e of this.pending) this.entities.push(e);
      this.pending.length = 0;
    }
  }

  private resolvePunch(): void {
    const p = this.player;
    if (p.punchId !== this.lastPunchId) {
      this.lastPunchId = p.punchId;
      this.punchedEntities.clear();
      this.punchedTiles.clear();
    }
    const box = p.punchBox();
    if (!box) return;
    const dir = p.facing;
    let connected = false;
    let hx = 0;
    let hy = 0;

    // entidades
    for (const e of this.entities) {
      if (e.dead || !e.onPunch || this.punchedEntities.has(e)) continue;
      if (!overlaps(box, e)) continue;
      this.punchedEntities.add(e);
      if (e.onPunch(this, dir)) {
        connected = true;
        const r = intersect(box, e);
        hx = r.x + r.w / 2;
        hy = r.y + r.h / 2;
      }
    }

    // tiles: só a primeira coluna (a partir do Pardo) que contém algo sólido — não atravessa paredes
    const lv = this.level;
    const ty0 = Math.floor(box.y / TILE);
    const ty1 = Math.floor((box.y + box.h - 0.001) / TILE);
    const txNear = Math.floor((dir === 1 ? box.x : box.x + box.w - 0.001) / TILE);
    const txFar = Math.floor((dir === 1 ? box.x + box.w - 0.001 : box.x) / TILE);
    let solidHit = false;
    for (let tx = txNear; dir === 1 ? tx <= txFar : tx >= txFar; tx += dir) {
      let any = false;
      for (let ty = ty0; ty <= ty1; ty++) {
        if (!lv.isSolid(tx, ty)) continue;
        any = true;
        if (tx < 0 || tx >= lv.cols || ty < 0 || ty >= lv.rows) continue;
        const key = ty * lv.cols + tx;
        if (this.punchedTiles.has(key)) continue;
        this.punchedTiles.add(key);
        const cx = tx * TILE + TILE / 2;
        const cy = Math.min(Math.max(box.y + box.h / 2, ty * TILE + 2), ty * TILE + TILE - 2);
        const edgeX = dir === 1 ? tx * TILE : tx * TILE + TILE;
        if (lv.punchTile(tx, ty, this)) {
          connected = true;
          hx = cx;
          hy = cy;
          this.shake(2, 0.12);
        } else if (!solidHit) {
          // rocha indestrutível: só um "tok"
          solidHit = true;
          this.fx('impact', edgeX, cy);
          this.audio.play('hit');
        }
      }
      if (any) break;
    }

    if (connected) {
      this.fx('impact', hx, hy, dir);
      this.audio.play('hit');
      this.shake(1.5, 0.1);
    }
  }

  private resolveContacts(): void {
    const p = this.player;
    for (const e of this.entities) {
      if (e.dead || !e.onTouchPlayer) continue;
      if (p.dead || this.state.scene !== 'playing') break;
      if (overlaps(p, e)) e.onTouchPlayer(this);
    }
  }

  private checkCheckpoints(): void {
    const cps = this.level.checkpoints;
    const cx = this.player.centerX;
    for (let i = this.checkpoint + 1; i < cps.length; i++) {
      const cp = cps[i];
      if (!cp || cx < cp.x) break;
      this.checkpoint = i;
      this.audio.play('checkpoint');
      this.popup('CHECKPOINT', cx, this.player.y - 6, '#7fe0ff');
    }
  }

  private popup(text: string, x: number, y: number, color = '#ffffff'): void {
    if (this.popups.length > 24) this.popups.shift();
    this.popups.push({ text, x, y, t: 0, color });
  }

  private updateParticles(dt: number): void {
    let j = 0;
    for (const p of this.particles) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      if (p.wob) p.x += Math.cos(p.t * 5 + (p.ph ?? 0)) * p.wob * dt;
      p.y += p.vy * dt;
      this.particles[j++] = p;
    }
    this.particles.length = j;
  }

  private updatePopups(dt: number): void {
    let j = 0;
    for (const p of this.popups) {
      p.t += dt;
      if (p.t >= POPUP_LIFE) continue;
      p.y -= (28 * (1 - p.t / POPUP_LIFE)) * dt;
      this.popups[j++] = p;
    }
    this.popups.length = j;
  }

  private updateShake(dt: number): void {
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
  }

  private cameraTarget(): { x: number; y: number } {
    const p = this.player;
    return {
      x: p.centerX - VIEW_W / 2 + this.lookAhead,
      y: p.y + p.h / 2 - VIEW_H * CAM_ANCHOR_Y,
    };
  }

  private clampCamera(): void {
    const c = this.camera;
    c.x = clamp(c.x, 0, Math.max(0, this.level.widthPx - VIEW_W));
    c.y = clamp(c.y, 0, Math.max(0, this.level.heightPx - VIEW_H));
  }

  private snapCamera(): void {
    if (this.level.autoscroll) {
      // Fase 5: Pardo na posição neutra; câmera Y travada
      this.camera.x = this.player.centerX - UBER.screenNeutral;
      this.camera.y = UBER.camY;
      this.clampCamera();
      return;
    }
    const t = this.cameraTarget();
    this.camera.x = t.x;
    this.camera.y = t.y;
    this.clampCamera();
  }

  private updateCamera(dt: number): void {
    const p = this.player;
    const c = this.camera;
    if (this.level.autoscroll) {
      // X avança em advanceScroll (início do passo); Y travada
      c.y = UBER.camY;
      this.clampCamera();
      this.updateShake(dt);
      return;
    }
    // look-ahead suave na direção em que olha (mais forte correndo)
    const want = p.facing * CAM_LOOKAHEAD * (Math.abs(p.vx) > 20 ? 1 : 0.6);
    this.lookAhead += (want - this.lookAhead) * Math.min(1, dt * CAM_LOOK_RATE);
    const t = this.cameraTarget();
    c.x += (t.x - c.x) * Math.min(1, dt * CAM_FOLLOW_X);
    // vertical: segue mais devagar, mas nunca deixa o Pardo sair da tela
    if (!p.dead) {
      c.y += (t.y - c.y) * Math.min(1, dt * CAM_FOLLOW_Y);
      const top = p.y - 24;
      const bottom = p.y + p.h + 16;
      if (top < c.y) c.y = top;
      if (bottom > c.y + VIEW_H) c.y = bottom - VIEW_H;
    }
    this.clampCamera();
    this.updateShake(dt);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render(): void {
    const ctx = this.ctx;
    const st = this.state;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0 && st.scene !== 'paused') {
      const k = this.shakeI * (this.shakeT / Math.max(this.shakeDur, 1e-6));
      ox = Math.round(rand(-k, k));
      oy = Math.round(rand(-k, k));
    }

    const inBonus =
      st.scene === 'bonus_intro' ||
      st.scene === 'bonus' ||
      st.scene === 'bonus_end' ||
      (st.scene === 'paused' && this.pausedFrom === 'bonus');
    if (inBonus) {
      ctx.save();
      ctx.translate(ox, oy);
      this.bonusStage.render(ctx, this);
      this.drawParticles(ctx);
      this.drawPopups(ctx);
      ctx.restore();

      switch (st.scene) {
        case 'bonus_intro':
          drawBonusIntro(ctx, this);
          break;
        case 'bonus':
          drawBonusHud(ctx, this);
          break;
        case 'paused':
          drawBonusHud(ctx, this);
          drawPaused(ctx, this);
          break;
        case 'bonus_end':
          drawBonusEnd(ctx, this);
          break;
      }
      return;
    }

    const camX = Math.round(this.camera.x);
    const camY = Math.round(this.camera.y);

    this.background.draw(ctx, camX, camY, this.time);

    ctx.save();
    ctx.translate(-camX + ox, -camY + oy);
    this.level.draw(ctx, this);
    const minX = camX - 64;
    const maxX = camX + VIEW_W + 64;
    for (const e of this.entities) {
      if (e.dead) continue;
      if ((e.x + e.w < minX || e.x > maxX) && !NO_CULL_KINDS.has(e.kind)) continue;
      e.draw(ctx, this);
    }
    this.player.draw(ctx, this);
    this.drawParticles(ctx);
    ctx.restore();

    // primeiro plano (coordenadas de tela), antes da HUD
    this.background.drawForeground?.(ctx, camX, camY, this.time);

    ctx.save();
    ctx.translate(-camX + ox, -camY + oy);
    this.drawPopups(ctx);
    ctx.restore();

    switch (st.scene) {
      case 'title':
        drawTitle(ctx, this);
        break;
      case 'intro':
        drawIntro(ctx, this);
        break;
      case 'playing':
      case 'dying':
      case 'winning':
        drawHud(ctx, this);
        break;
      case 'paused':
        drawHud(ctx, this);
        drawPaused(ctx, this);
        break;
      case 'gameover':
        drawGameOver(ctx, this);
        break;
      case 'win':
        drawWin(ctx, this);
        break;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    const spr = this.sprites;
    for (const p of this.particles) {
      if (!spr.has(p.kind)) continue;
      const s = spr.size(p.kind);
      const f = p.frame >= 0 ? p.frame : Math.min(s.frames - 1, Math.floor((p.t / p.life) * s.frames));
      spr.draw(ctx, p.kind, f, p.x - s.w / 2, p.y - s.h / 2, p.vx < 0);
    }
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.popups) {
      // pisca no fim da vida
      if (p.t > POPUP_LIFE * 0.75 && Math.floor(p.t * 20) % 2 === 0) continue;
      drawText(ctx, p.text, Math.round(p.x), Math.round(p.y), { color: p.color, align: 'center', shadow: '#1a1423' });
    }
  }
}

function clampLevel(i: number): number {
  return Number.isFinite(i) ? clamp(Math.floor(i), 0, LEVEL_COUNT - 1) : 0;
}

function makeLevel(i: number): Level {
  const make = LEVELS[clampLevel(i)] ?? LEVELS[0];
  if (!make) throw new Error('nenhuma fase definida');
  return make();
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

/** Cria o jogo completo (atlas, áudio, cenário, level, Pardo) sobre o contexto 320x180. */
export function createGame(ctx: CanvasRenderingContext2D, input: Input, opts: GameOptions = {}): Game {
  const world = new GameWorld(ctx, input, opts);
  return {
    world,
    state: world.state,
    update: (dt) => world.step(dt),
    render: () => world.render(),
    onHidden() {
      if (world.state.scene === 'playing' || world.state.scene === 'bonus') {
        world.pause();
      }
      input.clear();
    },
  };
}
