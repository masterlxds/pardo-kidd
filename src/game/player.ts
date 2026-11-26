import type { Entity, Player, PlayerState, Rect, World } from '../core/types';
import { Tile } from '../core/types';
import { PHYS, PLAYER_H, PLAYER_W, SWIM, TILE, SWIM_CEILING } from '../core/constants';
import { UBER, uberRampOffset } from './uberRules';
import { LEVEL5_RAMP_COLS } from './level5';
import { moveBody } from '../core/physics';
import type { Input } from '../core/input';

/** Ajuste fino de game feel (o envelope de pulo continua o de PHYS). */
export const FEEL = {
  /** aceleração no chão (px/s²) — atinge runMax em ~0.12s */
  groundAccel: 950,
  /** desaceleração sem input no chão */
  groundFriction: 1100,
  /** aceleração ao inverter a direção no chão (derrapagem curta) */
  turnAccel: 1800,
  /** aceleração no ar (controle aéreo reduzido) */
  airAccel: 620,
  /** arrasto no ar sem input (mantém a inércia) */
  airDrag: 160,
  /** fator que corta vy ao soltar o pulo subindo */
  jumpCut: 0.55,
  coyote: 0.1,
  jumpBuffer: 0.1,
  /** limiar de |vx| para idle ⇄ run */
  runThreshold: 8,
  /** soco */
  punchTime: 0.22,
  punchWindup: 0.04,
  punchActive: 0.1,
  /** dano */
  hurtTime: 0.35,
  invulnTime: 1.5,
  knockbackX: 120,
  knockbackY: 170,
  /** salto de morte */
  deathVy: 280,
  /** afundando na água (px/s) */
  sinkVy: 26,
  /** sequência de vitória */
  drinkWalk: 50,
  drinkSip: 1.8,
  /** velocidade de queda a partir da qual o pouso faz som/poeira */
  landFxVy: 170,
} as const;

/**
 * Nado (só em `level.underwater`). Envelope de SWIM (constants.ts): afunda até ~45px/s, braçada
 * -115px/s (sobe ~1.5 tile com a desaceleração maior subindo), horizontal até 80px/s com deslize.
 */
export const SWIM_FEEL = {
  /** gravidade afundando (vy ≥ 0) */
  sinkGravity: SWIM.gravity,
  /** desaceleração subindo (vy < 0): 115²/(2·280) ≈ 24px ≈ 1.5 tile por braçada */
  riseGravity: 280,
  maxSink: SWIM.maxSink,
  strokeVel: SWIM.strokeVel,
  maxRise: SWIM.maxRise,
  /** fração da subida atual mantida ao encadear braçadas */
  strokeCarry: 0.35,
  strokeCooldown: 0.15,
  /** duração da animação de braçada (3 quadros) */
  strokeAnim: 0.36,
  swimMax: SWIM.swimMax,
  /** andando no fundo */
  walkMax: 55,
  accel: 300,
  /** deslize sem input (água) */
  drag: 110,
  /** atrito no fundo sem input */
  groundFriction: 420,
  turnAccel: 520,
  knockbackX: 70,
  knockbackY: 60,
  /** afundando morto */
  deadSink: 22,
  /** bolhinhas do snorkel: intervalo aleatório */
  bubbleMin: 0.9,
  bubbleMax: 2.0,
  /** drink subaquático: timeout de segurança para chegar ao chão em alvoX */
  drinkTimeout: 5,
  /** lambida no cajado */
  lickSip: 3.2,
} as const;

/**
 * Cutscene de chegada da Fase 5 (rolagem parada): o carro (= o Pardo no teto) acelera a ARRIVE_ACCEL até
 * UBER.arriveSpeed, freia a ARRIVE_BRAKE até parar no alvo, buzina, espera ARRIVE_PARK s e o Pardo desce do
 * teto num pulinho (impulso ARRIVE_HOP_VY) até o chão do totem. ARRIVE_WIN_FALLBACK: se o toque no totem não
 * disparar a vitória depois do pouso, game.ts chama world.win() após esse tempo.
 */
const ARRIVE_ACCEL = 120;
const ARRIVE_BRAKE = 120;
const ARRIVE_PARK = 0.45;
const ARRIVE_HOP_VY = 180;
export const ARRIVE_WIN_FALLBACK = 0.3;
/** Etapas da cutscene de chegada (Fase 5); 'none' = jogo normal. */
export type ArrivePhase = 'none' | 'drive' | 'park' | 'hop' | 'landed';
/** tranco vertical ao levar dano em cima do carro (só se estiver no teto) */
const RIDE_HURT_VY = 90;
/** Início (px, borda esquerda) de cada rampa `J` da Fase 5. */
const RAMP_STARTS_PX: readonly number[] = LEVEL5_RAMP_COLS.map((c) => c * TILE);

/**
 * Velocidade ATUAL da rolagem (px/s), exposta por game.ts em `GameWorld.scrollSpeed`
 * (UBER.speed em cruzeiro, desacelerando até 0 no desembarque). Fora de 'playing' vale 0.
 */
function rideScroll(world: World): number {
  const v = (world as World & { readonly scrollSpeed?: number }).scrollSpeed;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** y de mundo do chão do Pardo no autoscroller: teto do carro, subindo nas rampas. */
export function rideFloorY(centerX: number): number {
  return UBER.roofY - uberRampOffset(centerX, RAMP_STARTS_PX);
}

/** Sprite do corpo 20x24 centralizado na base da hitbox. */
const SPR_W = 20;
const SPR_H = 24;

type DrinkPhase = 'walk' | 'sip' | 'done';
/**
 * O que o Pardo bebe na vitória: caneca (Fase 1), mamadeira do alien (Fase 2), Cajado Jailnesco (Fase 3, lambida),
 * água mineral do Amaro (Fase 4) ou café do Renan Maia (Fase 6).
 */
export type DrinkItem = 'mug' | 'bottle' | 'staff' | 'mineral' | 'coffee';

/** Sprite da lambida: 24x32, corpo do Pardo nas colunas 0-19 (como o quadro 20x24), cajado ~17-23. */
const LICK_W = 24;
const LICK_H = 32;
/** Distância do centro do corpo (coluna 10) ao centro do cajado (coluna ~20.5) no sprite pardo_lick. */
export const LICK_STAFF_OFFSET = 10;

/** Pardo — implementa a interface `Player` com a máquina de estados do PLAN §4. */
export class PardoPlayer implements Player {
  x = 0;
  y = 0;
  w = PLAYER_W;
  h = PLAYER_H;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  state: PlayerState = 'idle';
  onGround = false;
  invuln = 0;
  dead = false;

  /** Incrementa a cada soco (game.ts usa para "1× por alvo por soco"). */
  punchId = 0;
  /** true quando a sequência `drink` terminou. */
  drinkDone = false;

  private coyoteT = 0;
  private bufferT = 0;
  private jumping = false;
  private punchT = 0;
  private hurtT = 0;
  private stateT = 0;
  private animT = 0;
  private standingOn: Entity | null = null;
  private drinkPhase: DrinkPhase = 'done';
  private drinkX = 0;
  private drinkT = 0;
  private drinkItem: DrinkItem = 'mug';
  private drinkFace: 1 | -1 = 1;
  /** y da superfície da água em que está afundando (morte por água), senão null */
  private sinkY: number | null = null;
  /** morreu debaixo d'água (afunda devagar com colisão, sprite pardo_swim_dead) */
  private swimDead = false;
  private drowning = false;
  /** cooldown entre braçadas */
  private strokeCd = 0;
  /** tempo desde a última braçada (animação) */
  private strokeT = 99;
  /** próxima bolhinha do snorkel */
  private bubbleT = 1;
  /** Fase 5: etapa da cutscene de chegada (sem controle, invulnerável) */
  private arrive: ArrivePhase = 'none';
  private arriveT = 0;
  private arriveV = 0;
  /** centro do Pardo em que o carro estaciona */
  private arriveX = 0;
  /** centro do Pardo ao pousar ao lado do totem */
  private dismountX = 0;
  private dismountY = 0;
  /** chão (y) depois de descer do teto do carro; null = teto do carro (rideFloorY) */
  private dismountFloor: number | null = null;

  constructor(x: number, y: number) {
    this.respawn(x, y);
  }

  /** Reinicia o Pardo em (x,y) = canto sup. esq. da hitbox. */
  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.state = 'idle';
    this.onGround = false;
    this.invuln = 0;
    this.dead = false;
    this.punchId = 0;
    this.drinkDone = false;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.jumping = false;
    this.punchT = 0;
    this.hurtT = 0;
    this.stateT = 0;
    this.animT = 0;
    this.standingOn = null;
    this.drinkPhase = 'done';
    this.drinkItem = 'mug';
    this.sinkY = null;
    this.swimDead = false;
    this.strokeCd = 0;
    this.strokeT = 99;
    this.bubbleT = 1;
    this.arrive = 'none';
    this.arriveT = 0;
    this.arriveV = 0;
    this.dismountFloor = null;
  }

  /** Fase da sequência de vitória (lida pelo alien para esconder a mamadeira da mão). */
  get drinkStage(): DrinkPhase {
    return this.drinkPhase;
  }

  get centerX(): number {
    return this.x + this.w / 2;
  }

  /** Fase 5: etapa da cutscene de chegada ('none' fora dela). */
  get arrivePhase(): ArrivePhase {
    return this.arrive;
  }

  /** Fase 5: segundos na etapa atual da cutscene de chegada. */
  get arriveTime(): number {
    return this.arriveT;
  }

  /** Fase 5: o carro estacionou e o Pardo desceu (game.ts para de reposicionar o carro sob ele). */
  get carParked(): boolean {
    return this.arrive === 'hop' || this.arrive === 'landed';
  }

  /**
   * Fase 5 — inicia a cutscene de chegada (chamada por game.ts quando a rolagem para): o carro leva o Pardo
   * até o centro `stopX`; ele então desce do teto e pousa com o centro em `dismountX` sobre o chão `footY`.
   * Sem efeito se já estiver na cutscene, morto ou bebendo.
   */
  beginArrival(stopX: number, dismountX: number, footY: number): void {
    if (this.arrive !== 'none' || this.dead || this.state === 'drink') return;
    this.arrive = 'drive';
    this.arriveT = 0;
    this.arriveV = 0;
    this.arriveX = Math.max(stopX, this.centerX);
    this.dismountX = dismountX;
    this.dismountY = footY;
    this.punchT = 0;
    this.hurtT = 0;
    this.bufferT = 0;
    this.jumping = false;
    this.facing = 1;
  }

  // ── API de Player ──────────────────────────────────────────────────────────
  hurt(world: World, sourceX: number, amount = 1): void {
    if (this.dead || this.invuln > 0 || this.state === 'drink' || this.arrive !== 'none' || world.state.scene !== 'playing') return;
    const st = world.state;
    st.hydration = Math.max(0, st.hydration - amount);
    if (world.level.autoscroll) st.rideHits++;
    if (st.hydration <= 0) {
      this.kill(world);
      return;
    }
    if (world.level.autoscroll) {
      this.hurtRide(world);
      return;
    }
    const dir: 1 | -1 = this.centerX >= sourceX ? 1 : -1;
    const water = world.level.underwater;
    this.vx = dir * (water ? SWIM_FEEL.knockbackX : FEEL.knockbackX);
    this.vy = -(water ? SWIM_FEEL.knockbackY : FEEL.knockbackY);
    this.facing = dir === 1 ? -1 : 1;
    this.onGround = false;
    this.standingOn = null;
    this.jumping = false;
    this.punchT = 0;
    this.hurtT = FEEL.hurtTime;
    this.invuln = FEEL.invulnTime;
    this.setState('hurt');
    world.audio.play('hurt');
    world.shake(2, 0.15);
  }

  /** Dano no autoscroller: sem empurrão horizontal, tranco vertical só no teto, invulnerabilidade curta. */
  private hurtRide(world: World): void {
    if (this.onGround) {
      this.vy = -RIDE_HURT_VY;
      this.onGround = false;
    }
    this.facing = 1;
    this.standingOn = null;
    this.jumping = false;
    this.punchT = 0;
    this.hurtT = FEEL.hurtTime;
    this.invuln = UBER.invuln;
    this.setState('hurt');
    world.audio.play('hurt');
    world.shake(2, 0.15);
  }

  /** Morte imediata. waterY (opcional) = superfície da água → afunda com splash em vez do salto de morte. */
  kill(world: World, waterY?: number): void {
    if (this.dead || this.state === 'drink' || this.arrive !== 'none') return;
    this.dead = true;
    this.vx = 0;
    this.onGround = false;
    this.standingOn = null;
    this.punchT = 0;
    this.invuln = 0;
    this.setState('dead');
    if (world.level.underwater) {
      // debaixo d'água: sem salto de morte — vira e afunda devagar
      this.swimDead = true;
      this.sinkY = null;
      this.vy = Math.min(Math.max(this.vy, 0), SWIM_FEEL.deadSink);
      if (!this.drowning) world.audio.play('die');
      world.fx('bubble', this.centerX, this.y + 2);
      world.fx('bubble', this.centerX + 3, this.y + 6);
      world.shake(2, 0.2);
      return;
    }
    if (waterY !== undefined) {
      this.sinkY = waterY;
      this.vy = FEEL.sinkVy;
      world.audio.play('splash');
      world.fx('splash', this.centerX - 3, waterY, -1);
      world.fx('splash', this.centerX + 3, waterY, 1);
      world.shake(1.5, 0.15);
      return;
    }
    this.sinkY = null;
    this.vy = -FEEL.deathVy;
    world.audio.play('die');
    world.shake(3, 0.25);
  }

  /** Afogamento (oxigênio acabou): como kill, mas com sfx 'drown'. */
  drown(world: World): void {
    if (this.dead || this.state === 'drink') return;
    this.drowning = true;
    this.kill(world);
    this.drowning = false;
    world.audio.play('drown');
  }

  heal(world: World, n: number): number {
    const st = world.state;
    const before = st.hydration;
    st.hydration = Math.min(st.maxHydration, st.hydration + Math.max(0, n));
    return st.hydration - before;
  }

  refillAir(world: World): void {
    world.state.air = world.state.maxAir;
  }

  shove(world: World, vx: number, vy: number, dt: number): void {
    if (this.dead) return;
    // mesmas regras da física do Pardo: tiles sólidos + topo dos one-way (padrão do moveBody, como em physics())
    const b = { x: this.x, y: this.y, w: this.w, h: this.h, vx, vy };
    moveBody(b, world.level, dt);
    this.x = b.x;
    this.y = b.y;
    // teto do nado (linha d'água), como em updateSwim()
    if (world.level.underwater && this.y < SWIM_CEILING) {
      this.y = SWIM_CEILING;
      if (this.vy < 0) this.vy = 0;
    }
    // empurrado para dentro de um perigo (ouriço): mesmo tratamento do update (morte imediata)
    const hz = this.touchedHazard(world);
    if (hz !== null) this.kill(world, hz >= 0 ? hz : undefined);
  }

  // ── Extras usados por game.ts ──────────────────────────────────────────────
  /**
   * Inicia a sequência de vitória: anda até targetX (centro) e bebe.
   * item: 'mug' (pardo_drink), 'bottle' (pardo_drink_bottle), 'mineral' (pardo_drink_mineral), 'coffee' (pardo_drink_coffee, sfx 'sip') ou 'staff'; face: para onde olha ao beber.
   */
  startDrink(targetX: number, item: DrinkItem = 'mug', face: 1 | -1 = 1): void {
    if (this.dead) return;
    this.drinkX = targetX;
    this.drinkItem = item;
    this.drinkFace = face;
    this.drinkPhase = 'walk';
    this.drinkT = 0;
    this.drinkDone = false;
    this.punchT = 0;
    this.hurtT = 0;
    this.invuln = 0;
    this.jumping = false;
    this.setState('drink');
  }

  /** Caixa de acerto do soco (só na fase ativa), senão null. */
  punchBox(): Rect | null {
    if (this.state !== 'punch') return null;
    const t = FEEL.punchTime - this.punchT;
    if (t < FEEL.punchWindup || t >= FEEL.punchWindup + FEEL.punchActive) return null;
    const w = 20;
    const h = 12;
    const x = this.facing === 1 ? this.x + this.w - 2 : this.x + 2 - w;
    return { x, y: this.y + 4, w, h };
  }

  // ── Simulação ──────────────────────────────────────────────────────────────
  update(dt: number, world: World, input: Input): void {
    this.animT += dt;
    this.stateT += dt;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    if (this.dead) {
      if (this.swimDead) {
        // afogado/derrotado debaixo d'água: afunda devagar e para no fundo
        this.vx = 0;
        this.vy = approach(this.vy, SWIM_FEEL.deadSink, 60 * dt);
        moveBody(this, world.level, dt);
        return;
      }
      if (this.sinkY !== null) {
        // afundando na água
        this.y += this.vy * dt;
        return;
      }
      // salto de morte: sem colisão
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      this.y += this.vy * dt;
      return;
    }

    if (this.state === 'drink') {
      this.updateDrink(dt, world);
      return;
    }

    if (world.level.underwater) {
      this.updateSwim(dt, world, input);
      return;
    }

    if (world.level.autoscroll) {
      if (this.arrive !== 'none') this.updateArrive(dt, world);
      else this.updateRide(dt, world, input);
      return;
    }

    if (world.level.space) {
      // Stub da Etapa 1: mantém o Pardo parado sem gravidade (CORE implementa a física completa na Etapa 2)
      this.facing = 1;
      this.vx = 0;
      this.vy = 0;
      this.setState('idle');
      return;
    }

    const left = input.down('left');
    const right = input.down('right');
    const dirIn = (right ? 1 : 0) - (left ? 1 : 0);

    // timers
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    this.coyoteT = this.onGround ? FEEL.coyote : Math.max(0, this.coyoteT - dt);
    this.bufferT = input.pressed('jump') ? FEEL.jumpBuffer : Math.max(0, this.bufferT - dt);

    const inHurt = this.hurtT > 0;
    const punching = this.punchT > 0;
    const punchRecovery = punching && FEEL.punchTime - this.punchT >= FEEL.punchWindup + FEEL.punchActive;

    // soco
    if (!inHurt && !punching && input.pressed('punch')) {
      this.punchT = FEEL.punchTime;
      this.punchId++;
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      this.setState('punch');
      world.audio.play('punch');
    }
    const lockedPunch = this.punchT > 0 && !punchRecovery;

    // movimento horizontal
    if (inHurt) {
      // sem controle; leve arrasto
      this.vx = approach(this.vx, 0, FEEL.airDrag * dt);
    } else if (this.punchT > 0) {
      if (this.onGround) this.vx = approach(this.vx, 0, FEEL.groundFriction * 2 * dt); // trava no chão
      // no ar mantém a inércia
    } else {
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      const target = dirIn * PHYS.runMax;
      let rate: number;
      if (this.onGround) {
        if (dirIn === 0) rate = FEEL.groundFriction;
        else if (Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dirIn) rate = FEEL.turnAccel;
        else rate = FEEL.groundAccel;
      } else {
        rate = dirIn === 0 ? FEEL.airDrag : FEEL.airAccel;
      }
      this.vx = approach(this.vx, target, rate * dt);
    }

    // pulo (permitido também na recuperação do soco)
    if (!inHurt && !lockedPunch && this.bufferT > 0 && (this.onGround || this.coyoteT > 0)) {
      this.vy = -PHYS.jumpVel;
      this.jumping = true;
      this.onGround = false;
      this.coyoteT = 0;
      this.bufferT = 0;
      this.standingOn = null;
      if (this.punchT > 0) this.punchT = 0;
      this.setState('jump');
      world.audio.play('jump');
      world.fx('dust', this.centerX, this.y + this.h - 2, (this.facing === 1 ? -1 : 1));
    }
    // pulo variável: soltou subindo → corta
    if (this.jumping && this.vy < 0 && !input.down('jump')) {
      this.vy *= FEEL.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    this.physics(dt, world);

    // perigos
    const hz = this.touchedHazard(world);
    if (hz !== null || this.y > world.level.heightPx + 32) {
      this.kill(world, hz !== null && hz >= 0 ? hz : undefined);
      return;
    }

    // estado
    if (this.state === 'hurt' && !inHurt && this.hurtT === 0) this.setState(this.onGround ? 'idle' : 'fall');
    if (this.state === 'punch' && this.punchT === 0) this.setState(this.locomotionState());
    if (this.state !== 'hurt' && this.state !== 'punch') {
      const next = this.locomotionState();
      if (next !== this.state) this.setState(next);
    }
  }

  /**
   * Autoscroller (Fase 5): SEM DIRECIONAL — o carro não se move na horizontal e o centro do Pardo fica
   * EXATAMENTE em camera.x + UBER.screenNeutral em todo passo (vx = rolagem atual). Pulo e soco idênticos às
   * outras fases, sempre para a frente. Chão = teto do carro (rideFloorY), sem colisão com tiles.
   */
  private updateRide(dt: number, world: World, input: Input): void {
    this.facing = 1;

    // timers
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    this.coyoteT = this.onGround ? FEEL.coyote : Math.max(0, this.coyoteT - dt);
    this.bufferT = input.pressed('jump') ? FEEL.jumpBuffer : Math.max(0, this.bufferT - dt);

    const inHurt = this.hurtT > 0;
    const punching = this.punchT > 0;
    const punchRecovery = punching && FEEL.punchTime - this.punchT >= FEEL.punchWindup + FEEL.punchActive;

    // soco (mesmo das outras fases; sempre para a frente)
    if (!inHurt && !punching && input.pressed('punch')) {
      this.punchT = FEEL.punchTime;
      this.punchId++;
      this.setState('punch');
      world.audio.play('punch');
    }
    const lockedPunch = this.punchT > 0 && !punchRecovery;

    // pulo (permitido também na recuperação do soco)
    if (!inHurt && !lockedPunch && this.bufferT > 0 && (this.onGround || this.coyoteT > 0)) {
      this.vy = -PHYS.jumpVel;
      this.jumping = true;
      this.onGround = false;
      this.coyoteT = 0;
      this.bufferT = 0;
      if (this.punchT > 0) this.punchT = 0;
      this.setState('jump');
      world.audio.play('jump');
      world.fx('dust', this.centerX, this.y + this.h - 2, -1);
    }
    if (this.jumping && this.vy < 0 && !input.down('jump')) {
      this.vy *= FEEL.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    // centro preso na posição neutra da tela (a câmera já avançou neste passo)
    this.vx = rideScroll(world);
    this.x = world.camera.x + UBER.screenNeutral - this.w / 2;

    this.rideVertical(dt, world);

    // estado (vx relativo ao carro = 0: em pé no teto)
    if (this.state === 'hurt' && !inHurt && this.hurtT === 0) this.setState(this.onGround ? 'idle' : 'fall');
    if (this.state === 'punch' && this.punchT === 0) this.setState(this.locomotionState(this.vx));
    if (this.state !== 'hurt' && this.state !== 'punch') {
      const next = this.locomotionState(this.vx);
      if (next !== this.state) this.setState(next);
    }
  }

  /**
   * Cutscene de chegada (Fase 5, câmera parada): sem controle e invulnerável. 'drive': o carro (que se
   * centraliza sob o Pardo) acelera até UBER.arriveSpeed e freia até o centro arriveX (se o Pardo estava no ar,
   * termina de cair no teto); 'park': buzina e pausa curta; 'hop': pulinho do teto até (dismountX, dismountY);
   * 'landed': em pé ao lado do totem — o toque no `uber_goal` dispara world.win() (ou game.ts, após
   * ARRIVE_WIN_FALLBACK s), e a sequência de beber 'mineral' assume.
   */
  private updateArrive(dt: number, world: World): void {
    this.arriveT += dt;
    this.facing = 1;
    this.punchT = 0;
    this.hurtT = 0;
    switch (this.arrive) {
      case 'drive': {
        const rest = this.arriveX - this.centerX;
        this.arriveV = Math.max(
          0,
          Math.min(UBER.arriveSpeed, this.arriveV + ARRIVE_ACCEL * dt, Math.sqrt(2 * ARRIVE_BRAKE * Math.max(0, rest))),
        );
        this.x += this.arriveV * dt;
        if (this.centerX >= this.arriveX - 0.5) {
          this.x = this.arriveX - this.w / 2;
          this.arriveV = 0;
        }
        this.vx = this.arriveV;
        this.rideVertical(dt, world);
        if (this.arriveV === 0 && this.onGround) {
          this.arrive = 'park';
          this.arriveT = 0;
          world.audio.play('horn');
        }
        break;
      }
      case 'park':
        this.vx = 0;
        this.rideVertical(dt, world);
        if (this.arriveT >= ARRIVE_PARK && this.onGround) {
          // pulinho até o chão do totem: tempo de voo do teto (y0) até dismountY com impulso ARRIVE_HOP_VY
          const drop = this.dismountY - (this.y + this.h);
          const g = PHYS.gravity;
          const t = (ARRIVE_HOP_VY + Math.sqrt(ARRIVE_HOP_VY * ARRIVE_HOP_VY + 2 * g * Math.max(0, drop))) / g;
          this.dismountFloor = this.dismountY;
          this.vx = (this.dismountX - this.centerX) / t;
          this.vy = -ARRIVE_HOP_VY;
          this.onGround = false;
          this.arrive = 'hop';
          this.arriveT = 0;
          world.audio.play('jump');
          world.fx('dust', this.centerX, this.y + this.h - 2, -1);
        }
        break;
      case 'hop':
        this.x += this.vx * dt;
        this.rideVertical(dt, world);
        if (this.onGround) {
          this.x = this.dismountX - this.w / 2;
          this.vx = 0;
          this.arrive = 'landed';
          this.arriveT = 0;
        }
        break;
      case 'landed':
        this.vx = 0;
        this.rideVertical(dt, world);
        break;
      case 'none':
        break;
    }
    const next = this.onGround ? 'idle' : this.vy < 0 ? 'jump' : 'fall';
    if (next !== this.state) this.setState(next);
  }

  /** Vertical no autoscroller: grudado no teto do carro (rampas incluídas) ou em queda até pousar nele. */
  private rideVertical(dt: number, world: World): void {
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    // depois de descer do teto (chegada), o chão é o do totem
    const floor = this.dismountFloor ?? rideFloorY(this.centerX);
    this.standingOn = null;
    if (this.onGround) {
      // sem quicar na descida da rampa
      this.y = floor - this.h;
      this.vy = 0;
    } else {
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      this.y += this.vy * dt;
      if (this.y + this.h >= floor) {
        this.y = floor - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }
    if (this.onGround && !wasGround) {
      this.jumping = false;
      if (fallSpeed > FEEL.landFxVy) {
        world.audio.play('land');
        world.fx('dust', this.centerX, this.y + this.h - 2);
      }
    }
  }

  /** Nado estilo fases aquáticas do Super Mario World (só em fase subaquática). */
  private updateSwim(dt: number, world: World, input: Input): void {
    const S = SWIM_FEEL;
    const left = input.down('left');
    const right = input.down('right');
    const dirIn = (right ? 1 : 0) - (left ? 1 : 0);

    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    if (this.strokeCd > 0) this.strokeCd = Math.max(0, this.strokeCd - dt);
    this.strokeT += dt;
    this.bufferT = input.pressed('jump') ? FEEL.jumpBuffer : Math.max(0, this.bufferT - dt);
    const inHurt = this.hurtT > 0;

    // soco (mesma punchBox; mantém a inércia)
    if (!inHurt && this.punchT === 0 && input.pressed('punch')) {
      this.punchT = FEEL.punchTime;
      this.punchId++;
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      this.setState('punch');
      world.audio.play('punch');
    }
    const lockedPunch = this.punchT > 0 && FEEL.punchTime - this.punchT < FEEL.punchWindup + FEEL.punchActive;

    // horizontal: deslize suave
    if (inHurt) {
      this.vx = approach(this.vx, 0, S.drag * dt);
    } else if (lockedPunch) {
      this.vx = approach(this.vx, 0, S.drag * 0.5 * dt);
    } else {
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      const max = this.onGround ? S.walkMax : S.swimMax;
      const target = dirIn * max;
      let rate: number;
      if (dirIn === 0) rate = this.onGround ? S.groundFriction : S.drag;
      else if (Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dirIn) rate = S.turnAccel;
      else if (Math.abs(this.vx) > max) rate = S.drag; // vindo mais rápido (ex.: nadando → pousou)
      else rate = S.accel;
      this.vx = approach(this.vx, target, rate * dt);
    }

    // braçada: sem precisar de chão
    if (!inHurt && this.bufferT > 0 && this.strokeCd === 0) {
      this.vy = Math.max(-S.maxRise, Math.min(this.vy, 0) * S.strokeCarry - S.strokeVel);
      this.bufferT = 0;
      this.strokeCd = S.strokeCooldown;
      this.strokeT = 0;
      this.onGround = false;
      this.standingOn = null;
      world.audio.play('swim');
      world.fx('bubble', this.snorkelX(), this.y + 1);
    }

    this.physics(dt, world, true);

    // teto do mundo
    if (this.y < SWIM_CEILING) {
      this.y = SWIM_CEILING;
      if (this.vy < 0) this.vy = 0;
    }

    // bolhinhas do snorkel
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = S.bubbleMin + Math.random() * (S.bubbleMax - S.bubbleMin);
      world.fx('bubble', this.snorkelX(), this.y + 1);
    }

    // perigos (ouriços); fora do mapa por baixo
    const hz = this.touchedHazard(world);
    if (hz !== null || this.y > world.level.heightPx + 32) {
      this.kill(world);
      return;
    }

    if (this.state === 'hurt' && this.hurtT === 0) this.setState(this.swimState());
    if (this.state === 'punch' && this.punchT === 0) this.setState(this.swimState());
    if (this.state !== 'hurt' && this.state !== 'punch') {
      const next = this.swimState();
      if (next !== this.state) this.setState(next);
    }
  }

  /** 'swim' = braçada/subindo/andando; 'float' = afundando/parado. */
  private swimState(): PlayerState {
    if (this.strokeT < SWIM_FEEL.strokeAnim || this.vy < -10) return 'swim';
    return Math.abs(this.vx) > FEEL.runThreshold && this.onGround ? 'swim' : 'float';
  }

  /** x do topo do snorkel (tubo ao lado da cabeça, do lado de trás). */
  private snorkelX(): number {
    return this.centerX - this.facing * 4;
  }

  private locomotionState(baseVx = 0): PlayerState {
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    return Math.abs(this.vx - baseVx) > FEEL.runThreshold ? 'run' : 'idle';
  }

  private setState(s: PlayerState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  /** Gravidade, carregamento por plataforma, colisão com tiles e com topos de plataformas. */
  private physics(dt: number, world: World, swim = false): void {
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    const prevBottom = this.y + this.h;

    // carregado pela plataforma em que estava em pé
    const plat = this.standingOn;
    if (plat && !plat.dead && plat.platform) {
      const dx = plat.dx ?? 0;
      const dy = plat.dy ?? 0;
      if (dx !== 0 || dy !== 0) {
        const carry = { x: this.x, y: this.y, w: this.w, h: this.h, vx: dx, vy: dy };
        moveBody(carry, world.level, 1, { oneWay: false });
        this.x = carry.x;
        this.y = carry.y;
      }
    }

    if (swim) {
      const g = this.vy < 0 ? SWIM_FEEL.riseGravity : SWIM_FEEL.sinkGravity;
      // velocidades acima do terminal (ex.: knockback) são amortecidas, não cortadas
      this.vy = this.vy > SWIM_FEEL.maxSink ? approach(this.vy, SWIM_FEEL.maxSink, 400 * dt) : Math.min(this.vy + g * dt, SWIM_FEEL.maxSink);
    } else {
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
    }
    const col = moveBody(this, world.level, dt);
    this.onGround = col.bottom;
    this.standingOn = null;

    // topo de plataformas (one-way), inclusive subindo contra o Pardo
    if (!this.onGround && this.vy >= 0) {
      const bottom = this.y + this.h;
      let best: Entity | null = null;
      for (const e of world.entities) {
        if (!e.platform || e.dead) continue;
        if (this.x + this.w <= e.x || this.x >= e.x + e.w) continue;
        const prevTop = e.y - (e.dy ?? 0);
        if (prevBottom <= prevTop + 1 && bottom >= e.y && (!best || e.y < best.y)) best = e;
      }
      if (best) {
        this.y = best.y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.standingOn = best;
      }
    }
    if (this.standingOn) this.standingOn.onStand?.(world);

    if (this.onGround && !wasGround) {
      this.jumping = false;
      if (!swim && fallSpeed > FEEL.landFxVy) {
        world.audio.play('land');
        world.fx('dust', this.centerX, this.y + this.h - 2);
      }
    }
  }

  /**
   * Perigo tocado: null = nenhum; -1 = espinho/outro; ≥0 = água (y da superfície da coluna).
   * Água tem prioridade (splash).
   */
  private touchedHazard(world: World): number | null {
    const lv = world.level;
    const x0 = Math.floor((this.x + 2) / TILE);
    const x1 = Math.floor((this.x + this.w - 2) / TILE);
    const y0 = Math.floor((this.y + 4) / TILE);
    const y1 = Math.floor((this.y + this.h - 0.01) / TILE);
    let hit: number | null = null;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!lv.isHazard(tx, ty)) continue;
        if (lv.tileAt(tx, ty) === Tile.Water) {
          let top = ty;
          while (top > 0 && lv.tileAt(tx, top - 1) === Tile.Water) top--;
          return top * TILE;
        }
        hit = -1;
      }
    }
    return hit;
  }

  private updateDrink(dt: number, world: World): void {
    this.drinkT += dt;
    if (world.level.underwater) {
      this.updateDrinkSwim(dt, world);
      return;
    }
    const ride = Boolean(world.level.autoscroll);
    if (this.drinkPhase === 'walk') {
      const d = this.drinkX - this.centerX;
      if (this.onGround && (Math.abs(d) < 1.5 || this.drinkT > 2.5)) {
        this.vx = 0;
        this.drinkPhase = 'sip';
        this.drinkT = 0;
        this.facing = this.drinkFace;
        if (this.drinkItem === 'coffee') world.audio.play('sip');
      } else if (this.onGround) {
        this.facing = d > 0 ? 1 : -1;
        this.vx = Math.sign(d) * Math.min(FEEL.drinkWalk, Math.abs(d) / dt);
      } else {
        this.vx = approach(this.vx, 0, FEEL.airDrag * dt);
      }
    } else {
      this.vx = 0;
      const sip = this.drinkItem === 'staff' ? SWIM_FEEL.lickSip : FEEL.drinkSip;
      if (this.drinkPhase === 'sip' && this.drinkT >= sip) {
        this.drinkPhase = 'done';
        this.drinkDone = true;
      }
    }
    if (ride) {
      // autoscroller: no teto do carro ou, depois da chegada, no chão do totem (sem colisão com tiles)
      this.x += this.vx * dt;
      this.rideVertical(dt, world);
    } else {
      this.physics(dt, world);
    }
    if (this.y > world.level.heightPx + 32) {
      // segurança: nunca deveria cair durante a vitória
      this.drinkPhase = 'done';
      this.drinkDone = true;
    }
  }

  /** Vitória subaquática: desliza/afunda até pousar no chão em drinkX, depois lambe/bebe. */
  private updateDrinkSwim(dt: number, world: World): void {
    const S = SWIM_FEEL;
    if (this.drinkPhase === 'walk') {
      const d = this.drinkX - this.centerX;
      if ((this.onGround && Math.abs(d) < 1.5) || this.drinkT > S.drinkTimeout) {
        this.vx = 0;
        this.drinkPhase = 'sip';
        this.drinkT = 0;
        this.facing = this.drinkFace;
      } else {
        if (Math.abs(d) >= 1.5) this.facing = d > 0 ? 1 : -1;
        const max = this.onGround ? Math.min(S.walkMax, FEEL.drinkWalk) : S.swimMax * 0.6;
        this.vx = Math.sign(d) * Math.min(max, Math.abs(d) / dt);
      }
    } else {
      this.vx = 0;
      const sip = this.drinkItem === 'staff' ? S.lickSip : FEEL.drinkSip;
      if (this.drinkPhase === 'sip' && this.drinkT >= sip) {
        this.drinkPhase = 'done';
        this.drinkDone = true;
      }
    }
    this.physics(dt, world, true);
    if (this.y < SWIM_CEILING) this.y = SWIM_CEILING;
    if (this.y > world.level.heightPx + 32) {
      this.drinkPhase = 'done';
      this.drinkDone = true;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, world: World): void {
    // pisca enquanto invulnerável
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln * 20) % 2 === 0) return;
    const sx = Math.round(this.x + this.w / 2 - SPR_W / 2);
    const sy = Math.round(this.y + this.h - SPR_H);
    const flip = this.facing === -1;
    const spr = world.sprites;
    if (world.level.underwater) {
      this.drawSwim(ctx, world, sx, sy, flip);
      return;
    }
    let name = 'pardo_idle';
    let frame = 0;
    switch (this.state) {
      case 'idle':
        name = 'pardo_idle';
        frame = Math.floor(this.animT * 2);
        break;
      case 'run': {
        name = 'pardo_run';
        const runVx = Math.abs(this.vx);
        frame = Math.floor(this.animT * (6 + runVx / 16));
        break;
      }
      case 'jump':
        name = 'pardo_jump';
        break;
      case 'fall':
        name = 'pardo_fall';
        break;
      case 'punch':
        name = 'pardo_punch';
        break;
      case 'hurt':
        name = 'pardo_hurt';
        break;
      case 'dead':
        name = 'pardo_dead';
        break;
      case 'drink':
        if (this.drinkPhase === 'walk' && this.onGround && Math.abs(this.vx) > 1) {
          name = 'pardo_run';
          frame = Math.floor(this.animT * 8);
        } else if (this.drinkPhase === 'walk') {
          name = this.onGround ? 'pardo_idle' : 'pardo_fall';
        } else {
          if (this.drinkItem === 'coffee' && spr.has('pardo_drink_coffee')) name = 'pardo_drink_coffee';
          else if (this.drinkItem === 'mineral' && spr.has('pardo_drink_mineral')) name = 'pardo_drink_mineral';
          else if (this.drinkItem === 'bottle' && spr.has('pardo_drink_bottle')) name = 'pardo_drink_bottle';
          else name = 'pardo_drink';
          frame = Math.floor(this.drinkT * 3);
        }
        break;
    }
    if (this.sinkY !== null) {
      // afundando: só a parte acima da superfície aparece
      const clipH = Math.round(this.sinkY) - sy;
      if (clipH <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - 4, sy, SPR_W + 8, clipH);
      ctx.clip();
      if (spr.has(name)) spr.draw(ctx, name, frame, sx, sy, flip);
      ctx.restore();
      return;
    }
    if (spr.has(name)) spr.draw(ctx, name, frame, sx, sy, flip);
    this.drawFist(ctx, world, sx, sy, flip);
  }

  /** Render em fase subaquática (sprites pardo_swim_* e a lambida pardo_lick). */
  private drawSwim(ctx: CanvasRenderingContext2D, world: World, sx: number, sy: number, flip: boolean): void {
    const spr = world.sprites;
    let name = 'pardo_swim_idle';
    let frame = 0;
    switch (this.state) {
      case 'swim':
        name = 'pardo_swim';
        frame = this.strokeT < SWIM_FEEL.strokeAnim
          ? Math.floor((this.strokeT / SWIM_FEEL.strokeAnim) * 3)
          : Math.floor(this.animT * (this.onGround ? 6 : 4));
        break;
      case 'punch':
        name = 'pardo_swim_punch';
        break;
      case 'hurt':
        name = 'pardo_swim_hurt';
        break;
      case 'dead': {
        // vira de barriga para cima enquanto afunda
        const k = Math.min(1, this.stateT / 0.4);
        const cx = sx + SPR_W / 2;
        const cy = sy + SPR_H / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((flip ? -1 : 1) * k * Math.PI);
        if (spr.has('pardo_swim_dead')) spr.draw(ctx, 'pardo_swim_dead', 0, -SPR_W / 2, -SPR_H / 2, flip);
        ctx.restore();
        return;
      }
      case 'drink':
        if (this.drinkPhase === 'walk') {
          name = Math.abs(this.vx) > 1 ? 'pardo_swim' : 'pardo_swim_idle';
          frame = Math.floor(this.animT * 5);
        } else if (this.drinkItem === 'staff') {
          // pardo_lick 24x32: corpo nas colunas 0-19 alinhado à base como o quadro 20x24.
          // Virado para a esquerda (flip), o corpo fica nas colunas 4-23 → desloca 4px.
          const lx = flip ? sx - (LICK_W - SPR_W) : sx;
          const ly = Math.round(this.y + this.h - LICK_H);
          if (spr.has('pardo_lick')) spr.draw(ctx, 'pardo_lick', Math.floor(this.drinkT * 2.5), lx, ly, flip);
          return;
        } else {
          name = this.drinkItem === 'bottle' && spr.has('pardo_drink_bottle') ? 'pardo_drink_bottle' : 'pardo_drink';
          frame = Math.floor(this.drinkT * 3);
        }
        break;
      default:
        frame = Math.floor(this.animT * 2);
        break;
    }
    if (spr.has(name)) spr.draw(ctx, name, frame, sx, sy, flip);
    this.drawFist(ctx, world, sx, sy, flip);
  }

  private drawFist(ctx: CanvasRenderingContext2D, world: World, sx: number, sy: number, flip: boolean): void {
    const spr = world.sprites;
    // punho gigante na fase ativa (e um quadro antes/depois para leitura)
    if (this.state === 'punch' && spr.has('fist')) {
      const t = FEEL.punchTime - this.punchT;
      if (t >= FEEL.punchWindup * 0.5 && t < FEEL.punchWindup + FEEL.punchActive + 0.03) {
        const fw = 12;
        const fy = sy + 8;
        const fx = flip ? sx - fw + 2 : sx + SPR_W - 2;
        spr.draw(ctx, 'fist', 0, fx, fy, flip);
      }
    }
  }
}

function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

export function createPlayer(x: number, y: number): PardoPlayer {
  return new PardoPlayer(x, y);
}
