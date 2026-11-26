/**
 * CONTRATOS COMPARTILHADOS — fonte da verdade entre módulos.
 * Somente o orquestrador altera este arquivo. Se precisar de algo novo, relate no seu relatório final.
 *
 * Convenções:
 *  - Unidades: pixels e segundos. Y cresce para baixo. Rect.x/y = canto superior esquerdo.
 *  - Todo `draw(ctx, world)` de entidade/level desenha em COORDENADAS DE MUNDO
 *    (game.ts já aplicou translate(-camera)). HUD/telas desenham em coordenadas de tela (320x180).
 *  - Sprites olham para a DIREITA por padrão; use flipX para a esquerda.
 */

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Body extends Rect { vx: number; vy: number }

export const Tile = {
  Empty: 0,
  /** chão com topo (grama seca/terra batida) — sólido */
  GroundTop: 1,
  /** terra de preenchimento — sólido */
  Ground: 2,
  /** rocha de monólito — sólido, indestrutível */
  Rock: 3,
  /** espinhos de cacto — mata ao tocar (perde vida) */
  Spike: 4,
  /** bloco de rocha ressecada — sólido, quebrável com soco */
  Block: 5,
  /** bloco quebrável que guarda item (moeda/gota) */
  BlockItem: 6,
  /** plataforma atravessável por baixo (sólida só no topo) */
  OneWay: 7,
  /** água de rio (Fase 2) — não sólida; tocar = afunda e perde vida (como espinho, com splash) */
  Water: 8,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export interface Camera { x: number; y: number }

/** 'intro' = cartão "FASE N · NOME" (~2.2s) antes de cada fase; o mundo já está montado por trás. */
export type Scene =
  | 'title'
  | 'level_select'
  | 'intro'
  | 'playing'
  | 'paused'
  | 'dying'
  | 'gameover'
  | 'winning'
  | 'win'
  | 'bonus_intro'
  | 'bonus'
  | 'bonus_end';

export interface BonusState {
  /** true quando o fluxo atual veio da campanha/atalho para a Fase Bônus */
  active: boolean;
  /** moedas coletadas dentro da Fase Bônus */
  coins: number;
  /** meta atual de moedas do trecho (20 → 45 → 70) */
  target: number;
  /** trecho atual (1..3) */
  stage: 1 | 2 | 3;
  /** true se concluiu todos os 3 trechos e ganhou a Esmeralda do Bonfim */
  cleared: boolean;
  /** motivo do término parcial ou completo */
  endedByCheckpoint: boolean;
}

export interface GameState {
  scene: Scene;
  /** segundos desde que entrou na cena atual */
  sceneTime: number;
  score: number;
  lives: number;
  coins: number;
  /** 0..maxHydration — energia do Pardo (gotas). 0 = morre. */
  hydration: number;
  maxHydration: number;
  /** segundos jogados na fase (para bônus de tempo na vitória) */
  elapsed: number;
  /** bônus de tempo calculado ao vencer (já somado em score) */
  timeBonus: number;
  muted: boolean;
  /** índice (0-based) da fase atual em LEVELS (src/game/levels.ts) */
  levelIndex: number;
  // ── Fase 3 (subaquática) ──
  /**
   * Oxigênio, 0..maxAir (float; 1 unidade = 1 bolha na HUD = AIR_BUBBLE_TIME segundos).
   * Só drena quando level.underwater. HUD mostra ceil(air) bolhas cheias. Com air ≤ 1 começa a
   * contagem regressiva: número = ceil(air * AIR_COUNTDOWN) (5..1). air ≤ 0 → Pardo se afoga (perde vida).
   */
  air: number;
  maxAir: number;
  /** fitinhas do Bonfim coletadas na fase atual / total existente na fase (0 se a fase não tem) */
  ribbons: number;
  ribbonsTotal: number;
  /** dificuldade escolhida no título: 'normal' = START_LIVES vidas; 'amaro' (fácil) = EASY_LIVES vidas */
  difficulty: Difficulty;
  /** estado da Fase Bônus ("Tubo do Bonfim") */
  bonus: BonusState;
  /** Fase 5/7: gotas perdidas na fase atual (avaliação em estrelas; zera ao (re)iniciar a fase, não ao renascer) */
  rideHits: number;
  /** Fase 7: mortes gravitacionais (colisão com Yuri/Yumi; zera ao (re)iniciar a fase) */
  gravDeaths: number;
  /** true após digitar a combinação secreta na tela de título (libera acesso ao seletor de fases) */
  levelSelectUnlocked: boolean;
  /** índice (0..LEVEL_SELECT_ENTRIES.length-1) atualmente destacado no seletor de fases */
  levelSelectCursor: number;
}

export type Difficulty = 'normal' | 'amaro';

/** Tema visual/sonoro de uma fase. */
export type LevelTheme = 'sertao' | 'amazonia' | 'bahia' | 'rio' | 'uber' | 'sampa' | 'space';
export type MusicTrack = LevelTheme | 'bonus';

export type SfxName =
  | 'jump' | 'punch' | 'hit' | 'break' | 'coin' | 'water' | 'hurt' | 'die'
  | 'crumble' | 'land' | 'start' | 'win' | 'gameover' | 'checkpoint' | 'squawk' | 'boing'
  // Fase 2
  | 'splash' | 'roar' | 'hiss' | 'chomp' | 'deliver'
  // Fase 3
  /** braçada */ | 'swim'
  /** bolha grande estourando / respirar fundo (oxigênio restaurado) */ | 'air'
  /** bip da contagem regressiva de oxigênio */ | 'countdown'
  /** afogamento */ | 'drown'
  /** 1º soco num inimigo blindado (atordoa) */ | 'stun'
  /** choque da água-viva */ | 'zap'
  /** fitinha do Bonfim coletada */ | 'ribbon'
  /** fanfarra 16-bit com berimbau e percussão baiana (pegou o Cajado; ~3-4s) */ | 'fanfare'
  /** lambida no cajado */ | 'lick'
  /** vida extra (100 moedas) */ | 'oneup'
  // Fase 4
  /** latido curto do vira-lata caramelo */ | 'bark'
  /** disparo da arma do traficante */ | 'shoot'
  // Fase 5 — Marginal de São Paulo (Autoscroller no Uber)
  /** corte de giro da moto do motoboy / motor */ | 'rev'
  /** buzina dupla na chegada do Uber */ | 'horn'
  // Fase 6 — Transportadora de São Paulo
  /** guincho do rato derrotado */ | 'squeak'
  /** caixa de papelão do carregador quebrando */ | 'crate'
  /** gole de café (final da Fase 6) */ | 'sip'
  /** bip de alerta da empilhadeira antes da arrancada */ | 'beep'
  /** arremesso do pacote (arremessador) */ | 'throw'
  // Fase Bônus — Tubo do Bonfim
  /** explosão da mina/bomba no meio-tubo */ | 'bomb'
  /** captura da Esmeralda do Bonfim */ | 'emerald'
  // Fase 7 — Espaço Sideral (Órbita de Quixadá)
  /** jato agudo do Impulso de Escape */ | 'jet_burst'
  /** alerta de radar orbital na entrada de Yuri/Yumi */ | 'grav_warn'
  /** zumbido grave do campo gravitacional */ | 'grav_hum'
  /** implosão grave na colisão fatal com planeta */ | 'grav_kill'
  /** estalo rochoso ao socar meteoro/cometa */ | 'meteor_break'
  /** carregamento do laser do satélite de varredura */ | 'laser_charge'
  /** disparo do laser do satélite de varredura */ | 'laser_fire'
  /** disparo de plasma do OVNI */ | 'ufo_zap'
  /** ricochete metálico em obstáculo rígido */ | 'clang';

export interface AudioApi {
  /** Chamar no primeiro gesto do usuário (cria/resume o AudioContext). Idempotente. */
  unlock(): void;
  play(name: SfxName): void;
  /**
   * Música da faixa em loop (padrão 'sertao'). Sem `atSeconds`: idempotente para a mesma faixa; trocar de
   * faixa reinicia do começo. Com `atSeconds`: (re)começa SEMPRE nessa posição da faixa, em segundos
   * (módulo a duração do laço) — usado pela Fase 5 para manter a música em fase com os compassos do mapa.
   */
  startMusic(track?: MusicTrack, atSeconds?: number): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Fase 7: controla intensidade contínua (0..1) do zumbido gravitacional (`grav_hum`). */
  setHum?(intensity: number): void;
}

export interface SpriteAtlas {
  /** Desenha o frame `frame` (módulo nº de frames) do sprite em (x,y) arredondados. */
  draw(ctx: CanvasRenderingContext2D, name: string, frame: number, x: number, y: number, flipX?: boolean): void;
  has(name: string): boolean;
  size(name: string): { w: number; h: number; frames: number };
}

/** 'swim' = braçada/subindo, 'float' = afundando devagar (só em fases subaquáticas). 'drink' cobre também a lambida no cajado. */
export type PlayerState = 'idle' | 'run' | 'jump' | 'fall' | 'punch' | 'hurt' | 'dead' | 'drink' | 'swim' | 'float';

export interface Player extends Body {
  facing: 1 | -1;
  state: PlayerState;
  onGround: boolean;
  /** > 0 enquanto invulnerável (piscando) */
  invuln: number;
  dead: boolean;
  /** Dano de inimigo: -amount hidratação (padrão 1), knockback para longe de sourceX. Ignorado se invulnerável. */
  hurt(world: World, sourceX: number, amount?: number): void;
  /** Morte imediata (abismo, espinhos). */
  kill(world: World): void;
  /** +n hidratação (limitado ao máximo). Retorna quanto realmente curou. */
  heal(world: World, n: number): number;
  /** Oxigênio de volta a 100% (silencioso: quem chama toca som/fx). */
  refillAir(world: World): void;
  /**
   * Deslocamento forçado por contato (ex.: tartaruga): integra (vx, vy)·dt com as mesmas colisões
   * da física do Pardo (sólidos + one-way), respeita o teto do nado e trata perigos tocados.
   * Não altera a velocidade do Pardo (exceto zerar a subida contra o teto).
   */
  shove(world: World, vx: number, vy: number, dt: number): void;
}

/** 'bubble' = bolhinhas que sobem (sprite `bubble`); 'sparkle' = brilho dourado/turquesa (sprite `sparkle`). */
export type FxKind = 'impact' | 'dust' | 'debris' | 'splash' | 'bubble' | 'sparkle';

export interface Entity extends Body {
  kind: string;
  /** true → game.ts remove da lista no fim do passo */
  dead: boolean;
  /**
   * Plataforma (móvel/que desmorona): o Pardo colide com o TOPO dela (one-way) e é carregado.
   * Entidades com platform=true DEVEM manter dx/dy = deslocamento aplicado neste passo.
   */
  platform?: boolean;
  dx?: number;
  dy?: number;
  /** Chamado a cada passo em que o Pardo está em pé sobre esta plataforma. */
  onStand?(world: World): void;
  update(dt: number, world: World): void;
  draw(ctx: CanvasRenderingContext2D, world: World): void;
  /**
   * O soco do Pardo acertou a caixa desta entidade. dir = direção do soco.
   * Retorne true se o golpe "conectou" (game.ts toca fx de impacto). Chamado 1x por soco.
   */
  onPunch?(world: World, dir: 1 | -1): boolean;
  /** A hitbox do Pardo sobrepõe esta entidade (chamado a cada passo de sobreposição). */
  onTouchPlayer?(world: World): void;
}

export type EnemyKind = 'calango' | 'carcara' | 'palma' | 'tatu'
  // Fase 2 — Amazônia
  | 'onca' | 'jacare' | 'cobra' | 'tucano'
  // Fase 3 — Bahia World (src/game/enemies3.ts)
  | 'agua_viva' | 'peixe_agulha' | 'baiacu' | 'dentao' | 'siri' | 'tartaruga' | 'moreia'
  // Fase 4 — Favela do Rio (src/game/enemies4.ts)
  | 'caramelo' | 'pombo' | 'gato' | 'capivara' | 'traficante'
  // Fase 5 — Marginal de São Paulo / Autoscroller no Uber (src/game/enemies5.ts)
  | 'motoboy' | 'motoboy_fast' | 'drone' | 'patinete' | 'pichador'
  // Fase 6 — Transportadora de São Paulo (src/game/enemies6.ts)
  | 'rato' | 'carregador' | 'empilhadeira' | 'arremessador'
  // Fase 7 — Espaço Sideral (src/game/enemies7.ts)
  | 'meteor' | 'meteor_fire' | 'comet_ice' | 'ufo' | 'alien_jet' | 'space_mine' | 'plasma_orb';

export interface Level {
  /** índice (0-based) em LEVELS */
  readonly index: number;
  /** nome exibido no cartão de introdução, ex.: 'TRILHA DOS MONÓLITOS' */
  readonly name: string;
  readonly theme: LevelTheme;
  /** fase 100% subaquática: física de nado + oxigênio */
  readonly underwater: boolean;
  /** fase autoscroller sobre o carro preto da Uber (Fase 5 — Marginal de São Paulo) */
  readonly autoscroll?: boolean;
  /** fase espacial zero-G com autoscroll (Fase 7 — Espaço Sideral) */
  readonly space?: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Posição inicial do Pardo (canto sup. esq. da hitbox). */
  readonly playerSpawn: Vec2;
  /** Checkpoints (posições de respawn, em ordem crescente de x). Não inclui o spawn inicial. */
  readonly checkpoints: Vec2[];
  /** Fora dos limites: x<0 ou x>=cols → Rock (parede); y<0 ou y>=rows → Empty. */
  tileAt(tx: number, ty: number): TileId;
  setTile(tx: number, ty: number, t: TileId): void;
  /** Sólido por todos os lados (GroundTop, Ground, Rock, Block, BlockItem). */
  isSolid(tx: number, ty: number): boolean;
  isOneWay(tx: number, ty: number): boolean;
  isHazard(tx: number, ty: number): boolean;
  /**
   * Soco atingiu o tile. Se quebrável: remove, solta item/entulho/som/pontos e retorna true.
   * Caso contrário retorna false.
   */
  punchTile(tx: number, ty: number, world: World): boolean;
  /** Restaura tiles quebrados ao estado original. */
  reset(): void;
  /** Cria entidades novas (inimigos, itens, plataformas, cactos d'água, caneca) para um (re)início. */
  createEntities(): Entity[];
  /** Desenha tiles visíveis + decoração de mundo (placa, crânios, cerca, capela, pedestal). */
  draw(ctx: CanvasRenderingContext2D, world: World): void;
}

export interface World {
  readonly level: Level;
  readonly player: Player;
  readonly entities: Entity[];
  readonly camera: Camera;
  readonly state: GameState;
  readonly audio: AudioApi;
  readonly sprites: SpriteAtlas;
  /** segundos de simulação desde o início da fase (para animações) */
  readonly time: number;
  /** Adiciona entidade (entra na lista no fim do passo atual). */
  spawn(e: Entity): void;
  /** Soma pontos; se x,y informados mostra popup flutuante em coordenadas de mundo. */
  addScore(points: number, x?: number, y?: number): void;
  addCoin(): void;
  /** Partículas. dir opcional orienta o espalhamento. */
  fx(kind: FxKind, x: number, y: number, dir?: 1 | -1): void;
  shake(intensity: number, duration?: number): void;
  /** Pardo tocou o objetivo (Caneca Esmaltada / alien com a mamadeira / Cajado Jailnesco) → inicia sequência de vitória. */
  win(): void;
  /** +1 fitinha do Bonfim (state.ribbons). */
  addRibbon(): void;
}

export interface Background {
  /** Desenha o parallax completo cobrindo a tela 320x180 (coordenadas de tela). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void;
  /** Camada de primeiro plano (opcional), desenhada por game.ts DEPOIS do mundo/entidades e antes da HUD (coordenadas de tela). */
  drawForeground?(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void;
}

export interface TextOpts {
  color?: string;
  /** inteiro ≥ 1 */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** cor da sombra 1px (deslocada +scale,+scale); omitido = sem sombra */
  shadow?: string;
}
