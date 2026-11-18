import type { World } from '../core/types';
import type { Input } from '../core/input';

/**
 * Fase Bônus — "Tubo do Bonfim" (Special Stage Pseudo-3D em Meio-Tubo).
 *
 * IMPORTANTE: este módulo usa exclusivamente `import type` (zero imports em runtime)
 * para ser importado diretamente por `node scripts/check-bonus.mjs` via type-stripping nativo.
 */

// ── Dimensões e constantes locais (espelhando core/constants e palette) ──────
const VIEW_W = 320;
const VIEW_H = 180;
const EASY_LIVES = 99;

// Paleta do céu noturno da Baía de Todos-os-Santos e das Fitinhas do Bonfim
const COL_SKY_TOP = '#0d3b66';
const COL_SKY_MID = '#12305b';
const COL_SKY_BOT = '#16264f';
const COL_SKY_DEEP = '#0f1c3f';
const COL_LINE_DARK = '#1a1423';
const COL_WHITE = '#ffffff';
const COL_RIM_GLOW = '#7cf0e0';
const COL_TURQ_LIGHT = '#2ec4b6';
const COL_TURQ_DARK = '#1b9aaa';
const COL_GOLD_LIGHT = '#ffd23f';
const COL_GOLD_DARK = '#d99a1c';
const COL_NAVY_LIGHT = '#3b6fd6';
const COL_NAVY_DARK = '#24418f';
const COL_CORAL_LIGHT = '#ef476f';
const COL_CORAL_DARK = '#e23b3b';
const COL_SHADOW = 'rgba(13,18,38,0.45)';

/** Cores das 7 raias radiais (simétricas: coral | ouro | marinho | turquesa | marinho | ouro | coral). */
const LANE_COLORS: ReadonlyArray<readonly [string, string]> = [
  [COL_CORAL_LIGHT, COL_CORAL_DARK],
  [COL_GOLD_LIGHT, COL_GOLD_DARK],
  [COL_NAVY_LIGHT, COL_NAVY_DARK],
  [COL_TURQ_LIGHT, COL_TURQ_DARK],
  [COL_NAVY_LIGHT, COL_NAVY_DARK],
  [COL_GOLD_LIGHT, COL_GOLD_DARK],
  [COL_CORAL_LIGHT, COL_CORAL_DARK],
];

// ── Parâmetros geométricos e físicos (exportados para validação estática) ────
export const BONUS_CONSTANTS = {
  /** Ângulo máximo nas bordas do meio-tubo (rad). */
  THETA_MAX: 1.48,
  /** Profundidade fixa do Pardo, à frente do parceiro (mais fundo no tubo). */
  PLAYER_Z: 0.145,
  /** Profundidade fixa do parceiro Caramelo-Tails, seguindo o Pardo logo atrás (primeiro plano). */
  BUDDY_Z: 0.085,
  /** Profundidade de referência (primeiro plano) para a escala de sprites, sombras e altura de salto. */
  REF_Z: 0.085,
  /** Meia-janela de profundidade das colisões de moeda e de bomba. */
  COIN_HIT_Z: 0.03,
  BOMB_HIT_Z: 0.02,
  /** Atraso em frames (60 Hz) do histórico seguido pelo parceiro (~0.183s). */
  BUDDY_DELAY_STEPS: 11,
  /** Limites de profundidade renderizada do túnel (~22 anéis). */
  Z_MIN: 0.055,
  Z_MAX: 1.0,
  /** Distância longitudinal correspondente a Δz = 1.0. */
  VIEW_DIST: 100,
  /** Comprimento longitudinal de cada anel quadriculado (~22.5 anéis visíveis). */
  RING_S: 4.2,
  /** Velocidade longitudinal base no Trecho 1 (unidades de pista / s). */
  BASE_SPEED: 48,
  /** Aceleração angular e velocidade angular máxima do Pardo. */
  ANG_ACCEL: 7.8,
  ANG_MAX_SPEED: 3.4,
  /** Fator de controle angular no ar (reduzido em 35% quando h > 0). */
  AIR_CONTROL_FACTOR: 0.65,
  /** Gravidade tangencial que puxa suavemente ao fundo central θ = 0. */
  TANGENTIAL_GRAV: 4.2,
  /** Impulso e gravidade do salto radial para fora da parede. */
  JUMP_VEL: 145,
  JUMP_GRAV: 460,
  /** Janelas de colisão de moedas e bombas. */
  COIN_HIT_THETA: 0.22,
  COIN_HIT_H: 18,
  BOMB_HIT_THETA: 0.15,
  BOMB_HIT_H: 11,
  /** Posição longitudinal da Esmeralda do Bonfim após o 3º checkpoint. */
  EMERALD_S: 2735,
} as const;

export interface BonusStageSpec {
  readonly stage: 1 | 2 | 3;
  readonly name: string;
  readonly startS: number;
  readonly endS: number;
  readonly speedMul: number;
  readonly target: number;
}

/** Especificação determinística dos 3 trechos do Tubo do Bonfim. */
export const BONUS_STAGES: readonly BonusStageSpec[] = [
  { stage: 1, name: 'ABERTURA TURQUESA', startS: 0, endS: 720, speedMul: 1.0, target: 20 },
  { stage: 2, name: 'ESPIRAL DO BONFIM', startS: 720, endS: 1600, speedMul: 1.15, target: 45 },
  { stage: 3, name: 'VÓRTICE ESTRELADO', startS: 1600, endS: 2660, speedMul: 1.3, target: 70 },
] as const;

export type BonusTrackItemKind = 'coin' | 'bomb' | 'gate' | 'emerald';

export interface BonusTrackItemSpec {
  readonly kind: BonusTrackItemKind;
  readonly stage: 1 | 2 | 3;
  /** Posição longitudinal na pista (unidades). */
  readonly s: number;
  /** Posição angular na seção do meio-tubo em [-1.48, +1.48] rad. */
  readonly theta: number;
  /** Altura radial acima da parede do tubo (px lógicos). */
  readonly h: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Constrói o roteiro determinístico de itens, ondas de bombas, balizas e Esmeralda. */
function buildBonusTrack(): readonly BonusTrackItemSpec[] {
  const out: BonusTrackItemSpec[] = [];
  const push = (kind: BonusTrackItemKind, stage: 1 | 2 | 3, s: number, theta: number, h = 0): void => {
    out.push({
      kind,
      stage,
      s: Math.round(s * 100) / 100,
      theta: Math.round(clamp(theta, -BONUS_CONSTANTS.THETA_MAX, BONUS_CONSTANTS.THETA_MAX) * 1000) / 1000,
      h: Math.round(Math.max(0, h) * 100) / 100,
    });
  };

  // ══════════ TRECHO 1 — ABERTURA TURQUESA (s: 0..720, meta: 20, 42 moedas) ══════════
  // Onda 1.1: trilha central de boas-vindas (8 moedas)
  for (let i = 0; i < 8; i++) push('coin', 1, 70 + i * 10, 0, 0);

  // Onda 1.2: curva suave na parede direita (7 moedas)
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    push('coin', 1, 180 + i * 11, 0.48 * Math.sin(u * Math.PI), 0);
  }

  // Onda 1.3: 1ª dupla simples de bombas no centro-esquerda + trilha segura à direita (5 moedas)
  push('bomb', 1, 295, -0.38, 0);
  push('bomb', 1, 295, 0.0, 0);
  for (let i = 0; i < 5; i++) push('coin', 1, 275 + i * 10, 0.58, 0);

  // Onda 1.4: curva suave na parede esquerda (7 moedas)
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    push('coin', 1, 355 + i * 11, -0.52 * Math.sin(u * Math.PI), 0);
  }

  // Onda 1.5: 2ª dupla simples de bombas nas encostas + corredor central livre (6 moedas)
  push('bomb', 1, 475, -0.62, 0);
  push('bomb', 1, 475, 0.62, 0);
  for (let i = 0; i < 6; i++) {
    const u = i / 5 - 0.5;
    push('coin', 1, 450 + i * 10, u * 0.56, 0);
  }

  // Onda 1.6: espiral aberta final rumo ao Checkpoint 1 (9 moedas)
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    push('coin', 1, 545 + i * 13, 0.65 * Math.sin(u * Math.PI * 2), 0);
  }

  // Balizas do Checkpoint 1 (s = 720)
  push('gate', 1, 720, -1.42, 0);
  push('gate', 1, 720, 1.42, 0);

  // ══════════ TRECHO 2 — ESPIRAL DO BONFIM (s: 720..1600, meta: 45, +46 moedas = 88) ══════════
  // Onda 2.1: curva em S pronunciada (9 moedas)
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    push('coin', 2, 775 + i * 12, 0.72 * Math.sin(u * Math.PI * 2), 0);
  }

  // Onda 2.2: arco de moedas altas (h = 16) sobre par de bombas no chão (6 moedas)
  push('bomb', 2, 955, -0.15, 0);
  push('bomb', 2, 955, 0.15, 0);
  const arcH6 = [6, 14, 16, 16, 14, 6];
  for (let i = 0; i < 6; i++) push('coin', 2, 930 + i * 10, 0, arcH6[i] ?? 16);

  // Onda 2.3: meia-lua na parede direita + bombas na parede esquerda (8 moedas)
  push('bomb', 2, 1075, -0.78, 0);
  push('bomb', 2, 1075, -0.44, 0);
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    push('coin', 2, 1035 + i * 11, 0.32 + 0.58 * Math.sin(u * Math.PI), 0);
  }

  // Onda 2.4: meia-lua na parede esquerda + bombas na parede direita (8 moedas)
  push('bomb', 2, 1205, 0.44, 0);
  push('bomb', 2, 1205, 0.78, 0);
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    push('coin', 2, 1165 + i * 11, -0.32 - 0.58 * Math.sin(u * Math.PI), 0);
  }

  // Onda 2.5: segundo arco aéreo (h = 16) levemente à direita sobre bombas no chão (6 moedas)
  push('bomb', 2, 1330, 0.10, 0);
  push('bomb', 2, 1330, 0.40, 0);
  for (let i = 0; i < 6; i++) push('coin', 2, 1305 + i * 10, 0.25, arcH6[i] ?? 16);

  // Onda 2.6: trilha sinuosa central com bombas apenas nas bordas altas (9 moedas)
  push('bomb', 2, 1475, -1.12, 0);
  push('bomb', 2, 1475, 1.12, 0);
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    push('coin', 2, 1415 + i * 13, 0.34 * Math.sin(u * Math.PI * 2), 0);
  }

  // Balizas do Checkpoint 2 (s = 1600)
  push('gate', 2, 1600, -1.42, 0);
  push('gate', 2, 1600, 1.42, 0);

  // ══════════ TRECHO 3 — VÓRTICE ESTRELADO (s: 1600..2660, meta: 70, +54 moedas = 142) ══════════
  // Onda 3.1: zigue-zague cooperativo duplo para Pardo + Caramelo-Tails (12 moedas)
  for (let i = 0; i < 12; i++) {
    const base = 0.42 * Math.sin((i / 11) * Math.PI * 2);
    const side = i % 2 === 0 ? -0.14 : 0.14;
    push('coin', 3, 1660 + i * 10, base + side, 0);
  }

  // Onda 3.2: anel parcial esquerdo (corredor direito [0.0, +1.48] = 1.48 rad livre) + 7 moedas
  push('bomb', 3, 1835, -1.05, 0);
  push('bomb', 3, 1835, -0.60, 0);
  push('bomb', 3, 1835, -0.15, 0);
  for (let i = 0; i < 7; i++) push('coin', 3, 1805 + i * 10, 0.56, 0);

  // Onda 3.3: anel parcial direito (corredor esquerdo [-1.48, 0.0] = 1.48 rad livre) + 7 moedas
  push('bomb', 3, 1965, 0.15, 0);
  push('bomb', 3, 1965, 0.60, 0);
  push('bomb', 3, 1965, 1.05, 0);
  for (let i = 0; i < 7; i++) push('coin', 3, 1935 + i * 10, -0.56, 0);

  // Onda 3.4: trio espaçado com corredores laterais amplos (0.65 rad) + arco alto central (7 moedas)
  push('bomb', 3, 2105, -0.95, 0);
  push('bomb', 3, 2105, 0.0, 0);
  push('bomb', 3, 2105, 0.95, 0);
  const arcH7 = [6, 13, 16, 17, 16, 13, 6];
  for (let i = 0; i < 7; i++) push('coin', 3, 2075 + i * 10, 0, arcH7[i] ?? 16);

  // Onda 3.5: serpente rápida nas encostas + anel parcial nas bordas altas (9 moedas)
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    push('coin', 3, 2205 + i * 13, 0.78 * Math.cos(u * Math.PI * 2), 0);
  }
  push('bomb', 3, 2365, -1.15, 0);
  push('bomb', 3, 2365, -0.75, 0);
  push('bomb', 3, 2365, 1.15, 0);

  // Onda 3.6: espiral triunfal do Bonfim (12 moedas, livre de bombas até o fim)
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const h = i >= 8 && i <= 10 ? 12 : 0;
    push('coin', 3, 2410 + i * 15, 0.82 * Math.sin(u * Math.PI * 2) * (1 - u * 0.45), h);
  }

  // Balizas do Checkpoint 3 (s = 2660)
  push('gate', 3, 2660, -1.42, 0);
  push('gate', 3, 2660, 1.42, 0);

  // Recompensa máxima: Esmeralda do Bonfim logo adiante no centro (s = 2735)
  push('emerald', 3, BONUS_CONSTANTS.EMERALD_S, 0, 6);

  out.sort((a, b) => a.s - b.s);
  return out;
}

/** Lista completa e imutável de todos os itens da pista bônus. */
export const BONUS_TRACK_ITEMS: readonly BonusTrackItemSpec[] = buildBonusTrack();

// ── Curvatura orgânica determinística da pista ───────────────────────────────
export function sampleBonusCurve(s: number): { curveX: number; curveY: number } {
  if (s < 45) return { curveX: 0, curveY: 0 };
  if (s >= 2610) {
    // Endireita suavemente para o corredor triunfal da Esmeralda
    const fade = Math.max(0, 1 - (s - 2610) / 80);
    return {
      curveX: Math.sin(s * 0.014) * 0.55 * fade,
      curveY: Math.cos(s * 0.011) * 0.35 * fade,
    };
  }
  if (s < 720) {
    const ramp = Math.min(1, (s - 45) / 80);
    return {
      curveX: Math.sin((s - 45) * 0.011) * 0.62 * ramp,
      curveY: Math.sin((s - 45) * 0.008) * 0.32 * ramp,
    };
  }
  if (s < 1600) {
    return {
      curveX: Math.sin(s * 0.013) * 0.82 + Math.cos(s * 0.006) * 0.14,
      curveY: Math.cos(s * 0.010) * 0.58,
    };
  }
  return {
    curveX: Math.sin(s * 0.016) * 0.88 + Math.sin(s * 0.007) * 0.12,
    curveY: Math.sin(s * 0.012 + 0.8) * 0.72,
  };
}

// ── Projeção Perspectiva Pseudo-3D (320×180) ─────────────────────────────────
// Calibração: R(0.08) ≈ 145.6px (~146px), R(1.0) ≈ 14.0px, achatamento vertical 0.64.
const PROJ_D = 14.2;
const PROJ_C = 0.0175;
const FLAT_Y = 0.64;

function radiusAt(z: number): number {
  return PROJ_D / (Math.max(0.03, z) + PROJ_C);
}

function centerXAt(z: number, curveX: number): number {
  return 160 + curveX * z * z * 68;
}

function centerYAt(z: number, curveY: number): number {
  // Mantém toda a seção visível abaixo da HUD de 14px e pés do Pardo dentro de 180px
  return 74 + curveY * z * z * 28 + (1 - z) * 16;
}

function projectPoint(
  theta: number,
  z: number,
  h: number,
  curveX: number,
  curveY: number,
): { x: number; y: number; r: number } {
  const baseR = radiusAt(z);
  const hScale = (baseR / radiusAt(BONUS_CONSTANTS.REF_Z)) * 1.45;
  const r = Math.max(2, baseR - h * hScale);
  const cx = centerXAt(z, curveX);
  const cy = centerYAt(z, curveY);
  return {
    x: cx + Math.sin(theta) * r,
    y: cy + Math.cos(theta) * r * FLAT_Y,
    r,
  };
}

// ── Mini-fonte bitmap 5×7 embutida para banners internos (zero runtime imports) ──
const MINI_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '0': ['.###.', '#..##', '#.#.#', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function drawMiniText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  color: string,
  shadow = COL_LINE_DARK,
): void {
  const step = 6;
  const totalW = text.length * step - 1;
  const x0 = Math.round(cx - totalW / 2);
  const y0 = Math.round(y);
  const paint = (ox: number, oy: number, fill: string): void => {
    ctx.fillStyle = fill;
    for (let i = 0; i < text.length; i++) {
      const g = MINI_GLYPHS[text[i] ?? ' '] ?? MINI_GLYPHS[' ']!;
      const gx = x0 + i * step + ox;
      for (let r = 0; r < g.length; r++) {
        const row = g[r]!;
        for (let c = 0; c < 5; c++) {
          if (row[c] === '#') ctx.fillRect(gx + c, y0 + r + oy, 1, 1);
        }
      }
    }
  };
  paint(1, 1, shadow);
  paint(0, 0, color);
}

// ── Estrelas determinísticas do céu ──────────────────────────────────────────
interface Star {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly phase: number;
  readonly tint: string;
}

const STARS: readonly Star[] = (() => {
  const list: Star[] = [];
  let seed = 0x51f7b0af;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tints = [COL_WHITE, COL_RIM_GLOW, COL_GOLD_LIGHT, COL_WHITE];
  for (let i = 0; i < 46; i++) {
    list.push({
      x: rnd() * VIEW_W,
      y: 14 + rnd() * 116,
      depth: 0.35 + rnd() * 0.9,
      phase: rnd() * Math.PI * 2,
      tint: tints[i % tints.length]!,
    });
  }
  return list;
})();

// ── Estruturas mutáveis internas da instância de corrida ─────────────────────
interface RuntimeTrackItem extends BonusTrackItemSpec {
  taken: boolean;
  curTheta: number;
  curH: number;
}

interface HistorySample {
  theta: number;
  h: number;
}

interface SpillCoin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface SparkBurst {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface BannerState {
  line1: string;
  line2: string;
  accent: string;
  timer: number;
  duration: number;
}

/**
 * Contrato da Fase Bônus ("Tubo do Bonfim" — Special Stage Pseudo-3D).
 */
export interface BonusStage {
  /** reinicia a corrida bônus no trecho 1 (zera moedas do bônus, posiciona no centro) */
  reset(world: World): void;
  /**
   * Simula 1 passo fixo (dt = 1/60s).
   * Retorna:
   *  - 'running' enquanto o tubo está ativo;
   *  - 'cleared' quando venceu os 3 trechos e pegou a Esmeralda do Bonfim;
   *  - 'failed' quando cruzou um checkpoint abaixo da meta.
   */
  update(dt: number, world: World, input: Input): 'running' | 'cleared' | 'failed';
  /** Desenha céu estrelado, meio-tubo pseudo-3D, sombras, itens, parceiro e Pardo. */
  render(ctx: CanvasRenderingContext2D, world: World): void;
}

export function createBonusStage(): BonusStage {
  const HISTORY_CAP = BONUS_CONSTANTS.BUDDY_DELAY_STEPS + 1;
  const history: HistorySample[] = Array.from({ length: HISTORY_CAP }, () => ({ theta: 0, h: 0 }));
  let histHead = 0;

  let items: RuntimeTrackItem[] = [];
  const crossedCheckpoints = new Set<number>();
  let spillCoins: SpillCoin[] = [];
  let sparks: SparkBurst[] = [];
  let banner: BannerState | null = null;

  let localTime = 0;
  let runAnim = 0;
  let playerS = 0;
  let speedMul = 1.0;

  let theta = 0;
  let omega = 0;
  let h = 0;
  let vh = 0;
  let invuln = 0;

  let buddyTheta = 0.08;
  let buddyH = 0;
  let buddyBlink = 0;

  let curveX = 0;
  let curveY = 0;
  let skyPanX = 0;
  let skyPanY = 0;

  let passedFinalGate = false;
  let endPhase: 'none' | 'failing' | 'clearing' = 'none';
  let endTimer = 0;

  function initInternalState(): void {
    items = BONUS_TRACK_ITEMS.map((spec) => ({
      ...spec,
      taken: false,
      curTheta: spec.theta,
      curH: spec.h,
    }));
    crossedCheckpoints.clear();
    spillCoins = [];
    sparks = [];
    banner = null;

    localTime = 0;
    runAnim = 0;
    playerS = 0;
    speedMul = BONUS_STAGES[0]!.speedMul;

    theta = 0;
    omega = 0;
    h = 0;
    vh = 0;
    invuln = 0;

    for (let i = 0; i < HISTORY_CAP; i++) {
      history[i] = { theta: 0, h: 0 };
    }
    histHead = 0;
    buddyTheta = 0.08;
    buddyH = 0;
    buddyBlink = 0;

    curveX = 0;
    curveY = 0;
    skyPanX = 0;
    skyPanY = 0;

    passedFinalGate = false;
    endPhase = 'none';
    endTimer = 0;
  }

  function showBanner(line1: string, line2: string, accent: string, duration: number): void {
    banner = { line1, line2, accent, timer: duration, duration };
  }

  function emitSparks(x: number, y: number, count: number, colors: readonly string[]): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (localTime * 7.3) % 1;
      const spd = 28 + (i % 3) * 18;
      sparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 12,
        life: 0.28 + (i % 3) * 0.08,
        color: colors[i % colors.length]!,
        size: i % 2 === 0 ? 2 : 1,
      });
    }
  }

  initInternalState();

  return {
    reset(world) {
      initInternalState();
      world.state.bonus = {
        active: true,
        coins: 0,
        target: BONUS_STAGES[0]!.target,
        stage: 1,
        cleared: false,
        endedByCheckpoint: false,
      };
    },

    update(dt, world, input) {
      localTime += dt;

      // Atualiza partículas de tela e banner
      if (banner) {
        banner.timer -= dt;
        if (banner.timer <= 0) banner = null;
      }
      for (let i = spillCoins.length - 1; i >= 0; i--) {
        const sc = spillCoins[i]!;
        sc.life -= dt;
        sc.x += sc.vx * dt;
        sc.y += sc.vy * dt;
        sc.vy += 320 * dt;
        if (sc.y > VIEW_H - 8 && sc.vy > 0) {
          sc.y = VIEW_H - 8;
          sc.vy = -sc.vy * 0.48;
        }
        if (sc.life <= 0) spillCoins.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i]!;
        sp.life -= dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (sp.life <= 0) sparks.splice(i, 1);
      }

      // Se estamos concluindo o respiro triunfal ou a parada por falha de meta
      if (endPhase !== 'none') {
        const slow = endPhase === 'failing' ? Math.max(0.15, endTimer / 0.9) : 0.75;
        playerS += BONUS_CONSTANTS.BASE_SPEED * speedMul * slow * dt;
        runAnim += speedMul * slow * dt;
        endTimer -= dt;
        if (endTimer <= 0) {
          return endPhase === 'clearing' ? 'cleared' : 'failed';
        }
        return 'running';
      }

      // Velocidade suave rumo ao multiplicador do trecho atual
      const stageIdx = clamp(world.state.bonus.stage - 1, 0, BONUS_STAGES.length - 1);
      const targetMul = BONUS_STAGES[stageIdx]!.speedMul;
      speedMul += (targetMul - speedMul) * Math.min(1, dt * 4.5);

      const forwardSpeed = BONUS_CONSTANTS.BASE_SPEED * speedMul;
      playerS += forwardSpeed * dt;
      runAnim += speedMul * dt;

      // Curvatura orgânica suavizada e paralaxe inversa das estrelas
      const targetCurve = sampleBonusCurve(playerS + 34);
      const smooth = Math.min(1, dt * 3.6);
      curveX += (targetCurve.curveX - curveX) * smooth;
      curveY += (targetCurve.curveY - curveY) * smooth;
      skyPanX = (skyPanX - curveX * forwardSpeed * dt * 0.42 + VIEW_W * 4) % VIEW_W;
      skyPanY = (skyPanY - curveY * forwardSpeed * dt * 0.18 + VIEW_H * 4) % VIEW_H;

      if (invuln > 0) invuln = Math.max(0, invuln - dt);
      if (buddyBlink > 0) buddyBlink = Math.max(0, buddyBlink - dt);

      // ── Física angular e salto radial do Pardo ─────────────────────────────
      const dir = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
      const airFactor = h > 0 ? BONUS_CONSTANTS.AIR_CONTROL_FACTOR : 1.0;

      // Aceleração lateral + gravidade tangencial (-4.2 * sin(theta))
      const controlAccel = dir * BONUS_CONSTANTS.ANG_ACCEL * airFactor;
      const gravAccel = -BONUS_CONSTANTS.TANGENTIAL_GRAV * Math.sin(theta);
      omega += (controlAccel + gravAccel) * dt;

      if (dir === 0) {
        // Amortecimento suave ao soltar controles para estabilizar no centro θ = 0
        omega *= Math.exp(-3.0 * dt);
        if (Math.abs(theta) < 0.015 && Math.abs(omega) < 0.04) {
          theta = 0;
          omega = 0;
        }
      } else if (dir * omega < 0) {
        // Resposta ágil ao inverter direção na parede
        omega += dir * 3.2 * airFactor * dt;
      }

      const maxOmega = BONUS_CONSTANTS.ANG_MAX_SPEED * airFactor;
      omega = clamp(omega, -maxOmega, maxOmega);
      theta += omega * dt;

      if (theta >= BONUS_CONSTANTS.THETA_MAX) {
        theta = BONUS_CONSTANTS.THETA_MAX;
        if (omega > 0) omega = 0;
      } else if (theta <= -BONUS_CONSTANTS.THETA_MAX) {
        theta = -BONUS_CONSTANTS.THETA_MAX;
        if (omega < 0) omega = 0;
      }

      // Salto radial para fora da parede em direção ao eixo do tubo
      if (h <= 0 && (input.pressed('jump') || input.pressed('punch'))) {
        vh = BONUS_CONSTANTS.JUMP_VEL;
        h = 0.001;
        world.audio.play('jump');
      }
      if (h > 0 || vh > 0) {
        vh -= BONUS_CONSTANTS.JUMP_GRAV * dt;
        h += vh * dt;
        if (h <= 0) {
          h = 0;
          vh = 0;
        }
      }

      // ── Histórico circular de 11 passos para o Caramelo-Tails ──────────────
      history[histHead] = { theta, h };
      histHead = (histHead + 1) % HISTORY_CAP;
      const delayed = history[histHead]!; // exatamente 11 passos atrás
      const angDiff = Math.abs(delayed.theta - theta);
      const overlap = Math.max(0, 1 - angDiff / 0.24);
      const sideSign = theta > 1.28 ? -1 : 1;
      buddyTheta = clamp(
        delayed.theta + sideSign * 0.08 * overlap,
        -BONUS_CONSTANTS.THETA_MAX,
        BONUS_CONSTANTS.THETA_MAX,
      );
      buddyH = delayed.h;

      // ── Colisões com moedas, bombas e Esmeralda ────────────────────────────
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (it.taken || it.kind === 'gate') continue;

        const z = BONUS_CONSTANTS.PLAYER_Z + (it.s - playerS) / BONUS_CONSTANTS.VIEW_DIST;
        if (z > 0.45) break; // lista ordenada por s crescente
        if (z < 0.03) continue;

        if (it.kind === 'coin') {
          const hitPlayer =
            Math.abs(z - BONUS_CONSTANTS.PLAYER_Z) <= BONUS_CONSTANTS.COIN_HIT_Z &&
            Math.abs(it.curTheta - theta) <= BONUS_CONSTANTS.COIN_HIT_THETA &&
            Math.abs(it.curH - h) <= BONUS_CONSTANTS.COIN_HIT_H;

          const hitBuddy =
            !hitPlayer &&
            Math.abs(z - BONUS_CONSTANTS.BUDDY_Z) <= BONUS_CONSTANTS.COIN_HIT_Z &&
            Math.abs(it.curTheta - buddyTheta) <= BONUS_CONSTANTS.COIN_HIT_THETA &&
            Math.abs(it.curH - buddyH) <= BONUS_CONSTANTS.COIN_HIT_H;

          if (hitPlayer || hitBuddy) {
            it.taken = true;
            world.state.bonus.coins += 1;
            world.addCoin();
            world.addScore(100);
            world.audio.play('coin');
            const pt = projectPoint(it.curTheta, z, it.curH + 6, curveX, curveY);
            world.fx('sparkle', pt.x, pt.y);
            emitSparks(pt.x, pt.y, 6, [COL_GOLD_LIGHT, COL_TURQ_LIGHT, COL_WHITE]);
          }
        } else if (it.kind === 'bomb') {
          // Parceiro encostando: apenas pisca por 0.5s sem perder moedas e sem detonar a mina
          if (
            buddyBlink <= 0 &&
            Math.abs(z - BONUS_CONSTANTS.BUDDY_Z) <= BONUS_CONSTANTS.BOMB_HIT_Z &&
            Math.abs(it.curTheta - buddyTheta) <= BONUS_CONSTANTS.BOMB_HIT_THETA &&
            Math.abs(it.curH - buddyH) <= BONUS_CONSTANTS.BOMB_HIT_H
          ) {
            buddyBlink = 0.5;
          }

          // Pardo encostando: perde até 5 moedas do contador bônus
          if (
            invuln <= 0 &&
            Math.abs(z - BONUS_CONSTANTS.PLAYER_Z) <= BONUS_CONSTANTS.BOMB_HIT_Z &&
            Math.abs(it.curTheta - theta) <= BONUS_CONSTANTS.BOMB_HIT_THETA &&
            Math.abs(it.curH - h) <= BONUS_CONSTANTS.BOMB_HIT_H
          ) {
            it.taken = true;
            invuln = 1.0;
            const lost = Math.min(world.state.bonus.coins, 5);
            world.state.bonus.coins -= lost;
            world.audio.play('bomb');
            world.audio.play('hurt');
            world.shake(4, 0.25);

            const pPt = projectPoint(theta, BONUS_CONSTANTS.PLAYER_Z, h + 10, curveX, curveY);
            emitSparks(pPt.x, pPt.y, 10, [COL_CORAL_LIGHT, COL_GOLD_LIGHT, COL_WHITE]);
            for (let k = 0; k < lost; k++) {
              const spread = lost === 1 ? 0 : (k / (lost - 1) - 0.5) * 2;
              spillCoins.push({
                x: pPt.x,
                y: pPt.y,
                vx: spread * 78 + (k % 2 === 0 ? -12 : 12),
                vy: -115 - (k % 3) * 22,
                life: 0.78,
                maxLife: 0.78,
              });
            }
          }
        } else if (it.kind === 'emerald') {
          // Atração magnética suave após bater a Meta 3 para garantir captura triunfal
          if (passedFinalGate && z < 0.36) {
            const pull = Math.min(1, dt * 9.5);
            it.curTheta += (theta - it.curTheta) * pull;
            it.curH += (h + 4 - it.curH) * pull;
          }
          const generous = passedFinalGate ? 0.65 : 0.28;
          if (z <= BONUS_CONSTANTS.PLAYER_Z + 0.04 && Math.abs(it.curTheta - theta) <= generous) {
            it.taken = true;
            world.state.bonus.cleared = true;
            world.state.bonus.endedByCheckpoint = false;
            world.addScore(5000, 160, 64);
            world.state.lives = Math.min(EASY_LIVES, world.state.lives + 1);
            world.audio.play('emerald');
            world.audio.play('oneup');

            const ePt = projectPoint(it.curTheta, BONUS_CONSTANTS.PLAYER_Z, it.curH + 8, curveX, curveY);
            for (let k = 0; k < 6; k++) {
              const ang = (k / 6) * Math.PI * 2;
              world.fx('sparkle', ePt.x + Math.cos(ang) * 14, ePt.y + Math.sin(ang) * 10);
            }
            emitSparks(ePt.x, ePt.y, 18, [COL_TURQ_LIGHT, COL_GOLD_LIGHT, COL_RIM_GLOW, COL_WHITE]);
            showBanner('ESMERALDA DO BONFIM!', '+5000 PTS  +1UP', COL_TURQ_LIGHT, 0.9);
            endPhase = 'clearing';
            endTimer = 0.6;
            return 'running';
          }
        }
      }

      // ── Verificação determinística dos 3 Checkpoints ───────────────────────
      for (let i = 0; i < BONUS_STAGES.length; i++) {
        const stg = BONUS_STAGES[i]!;
        if (crossedCheckpoints.has(stg.stage)) continue;
        if (playerS >= stg.endS) {
          crossedCheckpoints.add(stg.stage);
          if (world.state.bonus.coins < stg.target) {
            world.state.bonus.endedByCheckpoint = true;
            world.state.bonus.cleared = false;
            world.audio.play('gameover');
            showBanner('META NAO ATINGIDA!', 'MOEDAS MANTIDAS', COL_CORAL_LIGHT, 0.9);
            endPhase = 'failing';
            endTimer = 0.9;
            return 'running';
          }

          // Meta atingida!
          world.addScore(1000, 160, 56);
          world.audio.play('checkpoint');
          emitSparks(160, 72, 12, [COL_TURQ_LIGHT, COL_GOLD_LIGHT, COL_WHITE]);

          if (stg.stage === 1) {
            world.state.bonus.stage = 2;
            world.state.bonus.target = BONUS_STAGES[1]!.target;
            showBanner('META ATINGIDA!', '+1000 PTS', COL_GOLD_LIGHT, 1.35);
          } else if (stg.stage === 2) {
            world.state.bonus.stage = 3;
            world.state.bonus.target = BONUS_STAGES[2]!.target;
            showBanner('META ATINGIDA!', '+1000 PTS', COL_GOLD_LIGHT, 1.35);
          } else {
            passedFinalGate = true;
            showBanner('META FINAL ATINGIDA!', 'PEGUE A ESMERALDA!', COL_TURQ_LIGHT, 1.2);
          }
        }
      }

      // Rede de segurança caso passe muito além da Esmeralda após bater a Meta 3
      if (passedFinalGate && playerS > BONUS_CONSTANTS.EMERALD_S + 20 && endPhase === 'none') {
        world.state.bonus.cleared = true;
        world.state.bonus.endedByCheckpoint = false;
        world.addScore(5000, 160, 64);
        world.state.lives = Math.min(EASY_LIVES, world.state.lives + 1);
        world.audio.play('emerald');
        world.audio.play('oneup');
        endPhase = 'clearing';
        endTimer = 0.6;
      }

      return 'running';
    },

    render(ctx, world) {
      const animClock = localTime > 0 ? localTime : world.time;

      // ── 1. Céu noturno profundo da Baía de Todos-os-Santos ─────────────────
      ctx.fillStyle = COL_SKY_TOP;
      ctx.fillRect(0, 0, VIEW_W, 56);
      ctx.fillStyle = COL_SKY_MID;
      ctx.fillRect(0, 56, VIEW_W, 48);
      ctx.fillStyle = COL_SKY_BOT;
      ctx.fillRect(0, 104, VIEW_W, 44);
      ctx.fillStyle = COL_SKY_DEEP;
      ctx.fillRect(0, 148, VIEW_W, VIEW_H - 148);

      // Estrelas pixeladas com paralaxe inversa às curvas do tubo
      for (let i = 0; i < STARS.length; i++) {
        const st = STARS[i]!;
        const sx = ((st.x + skyPanX * st.depth) % VIEW_W + VIEW_W) % VIEW_W;
        const sy = 14 + (((st.y - 14 + skyPanY * st.depth * 0.5) % 124 + 124) % 124);
        const twinkle = Math.sin(animClock * 4.5 + st.phase);
        if (twinkle < -0.55) continue;
        ctx.fillStyle = st.tint;
        const sz = twinkle > 0.65 && st.depth > 0.8 ? 2 : 1;
        ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
      }

      // Brilho cósmico no ponto de fuga (horizonte z = 1.0)
      const vpX = Math.round(centerXAt(1.0, curveX));
      const vpY = Math.round(centerYAt(1.0, curveY) + 4);
      const pulse = Math.sin(animClock * 5.2) * 2;
      const glowR = [30 + pulse, 21 + pulse * 0.6, 13, 7, 3];
      const glowCols = [COL_NAVY_DARK, COL_TURQ_DARK, COL_TURQ_LIGHT, COL_RIM_GLOW, COL_WHITE];
      for (let i = 0; i < glowR.length; i++) {
        const r = Math.max(2, glowR[i]!);
        ctx.fillStyle = glowCols[i]!;
        ctx.beginPath();
        ctx.ellipse(vpX, vpY, r * 1.15, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Raios estreitos em cruz da estrela do Bonfim
      ctx.fillStyle = COL_RIM_GLOW;
      ctx.fillRect(vpX - 24, vpY, 48, 1);
      ctx.fillRect(vpX, vpY - 14, 1, 28);

      // Linhas cinéticas de velocidade nas bordas nos trechos mais rápidos
      if (speedMul > 1.04) {
        const intensity = clamp((speedMul - 1.0) / 0.3, 0.25, 1);
        ctx.save();
        ctx.globalAlpha = 0.35 * intensity;
        ctx.strokeStyle = COL_RIM_GLOW;
        ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI * 0.92 + (i / 9) * Math.PI * 0.84;
          const phase = ((animClock * 3.8 + i * 0.37) % 1);
          const r0 = 36 + phase * 95;
          const r1 = r0 + 18 + intensity * 16;
          ctx.beginPath();
          ctx.moveTo(vpX + Math.cos(ang) * r0, vpY + Math.sin(ang) * r0 * 0.62);
          ctx.lineTo(vpX + Math.cos(ang) * r1, vpY + Math.sin(ang) * r1 * 0.62);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── 2. Meio-tubo semicircular (~22 anéis × 7 raias radiais) ────────────
      const sMin = playerS + (BONUS_CONSTANTS.Z_MIN - BONUS_CONSTANTS.PLAYER_Z) * BONUS_CONSTANTS.VIEW_DIST;
      const sMax = playerS + (BONUS_CONSTANTS.Z_MAX - BONUS_CONSTANTS.PLAYER_Z) * BONUS_CONSTANTS.VIEW_DIST;
      const firstRing = Math.floor(sMax / BONUS_CONSTANTS.RING_S);
      const lastRing = Math.floor(sMin / BONUS_CONSTANTS.RING_S);
      const halfPi = Math.PI / 2;

      for (let ringIdx = firstRing; ringIdx >= lastRing; ringIdx--) {
        const sa = Math.max(sMin, ringIdx * BONUS_CONSTANTS.RING_S);
        const sb = Math.min(sMax, (ringIdx + 1) * BONUS_CONSTANTS.RING_S);
        if (sb <= sa + 0.01) continue;

        const za = BONUS_CONSTANTS.PLAYER_Z + (sa - playerS) / BONUS_CONSTANTS.VIEW_DIST;
        const zb = BONUS_CONSTANTS.PLAYER_Z + (sb - playerS) / BONUS_CONSTANTS.VIEW_DIST;
        const midS = (sa + sb) * 0.5;
        const isCheckpointBand = BONUS_STAGES.some((st) => Math.abs(midS - st.endS) < BONUS_CONSTANTS.RING_S * 0.65);

        // 7 raias radiais dividindo [-π/2, +π/2]
        for (let lane = 0; lane < 7; lane++) {
          const t0 = -halfPi + (lane / 7) * Math.PI;
          const t1 = -halfPi + ((lane + 1) / 7) * Math.PI;
          const tm = (t0 + t1) * 0.5;

          const b0 = projectPoint(t0, zb, 0, curveX, curveY);
          const bm = projectPoint(tm, zb, 0, curveX, curveY);
          const b1 = projectPoint(t1, zb, 0, curveX, curveY);
          const a1 = projectPoint(t1, za, 0, curveX, curveY);
          const am = projectPoint(tm, za, 0, curveX, curveY);
          const a0 = projectPoint(t0, za, 0, curveX, curveY);

          const parity = (ringIdx + lane) & 1;
          if (isCheckpointBand) {
            ctx.fillStyle = parity === 0 ? COL_WHITE : COL_GOLD_LIGHT;
          } else {
            ctx.fillStyle = LANE_COLORS[lane]![parity]!;
          }

          ctx.beginPath();
          ctx.moveTo(b0.x, b0.y);
          ctx.lineTo(bm.x, bm.y);
          ctx.lineTo(b1.x, b1.y);
          ctx.lineTo(a1.x, a1.y);
          ctx.lineTo(am.x, am.y);
          ctx.lineTo(a0.x, a0.y);
          ctx.closePath();
          ctx.fill();
        }

        // Sombra atmosférica sutil nos anéis mais profundos perto do horizonte
        if (zb > 0.72) {
          const fog = clamp((zb - 0.72) / 0.28, 0, 1) * 0.38;
          const bl = projectPoint(-halfPi, zb, 0, curveX, curveY);
          const bc = projectPoint(0, zb, 0, curveX, curveY);
          const br = projectPoint(halfPi, zb, 0, curveX, curveY);
          const ar = projectPoint(halfPi, za, 0, curveX, curveY);
          const ac = projectPoint(0, za, 0, curveX, curveY);
          const al = projectPoint(-halfPi, za, 0, curveX, curveY);
          ctx.save();
          ctx.globalAlpha = fog;
          ctx.fillStyle = COL_SKY_TOP;
          ctx.beginPath();
          ctx.moveTo(bl.x, bl.y);
          ctx.quadraticCurveTo(bc.x, bc.y + (bc.y - bl.y) * 0.25, br.x, br.y);
          ctx.lineTo(ar.x, ar.y);
          ctx.quadraticCurveTo(ac.x, ac.y + (ac.y - al.y) * 0.25, al.x, al.y);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Bordas brancas/turquesa brilhantes nas muretas superiores (±π/2) + contorno escuro
        const rimW = Math.max(1.2, (radiusAt(za) / 146) * 4.2);
        const rimWb = Math.max(1.0, (radiusAt(zb) / 146) * 4.2);
        const rimColor = (ringIdx & 1) === 0 ? COL_WHITE : COL_RIM_GLOW;
        for (const side of [-1, 1] as const) {
          const edgeTheta = side * halfPi;
          const pa = projectPoint(edgeTheta, za, 0, curveX, curveY);
          const pb = projectPoint(edgeTheta, zb, 0, curveX, curveY);

          ctx.fillStyle = rimColor;
          ctx.beginPath();
          ctx.moveTo(pb.x, pb.y);
          ctx.lineTo(pb.x + side * rimWb, pb.y - rimWb * 0.45);
          ctx.lineTo(pa.x + side * rimW, pa.y - rimW * 0.45);
          ctx.lineTo(pa.x, pa.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = COL_LINE_DARK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pb.x + side * rimWb, pb.y - rimWb * 0.45);
          ctx.lineTo(pa.x + side * rimW, pa.y - rimW * 0.45);
          ctx.stroke();
        }

        // Divisórias escuras (#1a1423) longitudinais e transversais
        if (za < 0.88) {
          ctx.save();
          ctx.globalAlpha = za > 0.65 ? 1 - (za - 0.65) / 0.28 : 0.75;
          ctx.strokeStyle = COL_LINE_DARK;
          ctx.lineWidth = 1;
          for (let lane = 1; lane < 7; lane++) {
            const t = -halfPi + (lane / 7) * Math.PI;
            const pa = projectPoint(t, za, 0, curveX, curveY);
            const pb = projectPoint(t, zb, 0, curveX, curveY);
            ctx.beginPath();
            ctx.moveTo(pb.x, pb.y);
            ctx.lineTo(pa.x, pa.y);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Feixe luminoso aéreo nos portais de checkpoint visíveis
      for (let i = 0; i < BONUS_STAGES.length; i++) {
        const stg = BONUS_STAGES[i]!;
        const gz = BONUS_CONSTANTS.PLAYER_Z + (stg.endS - playerS) / BONUS_CONSTANTS.VIEW_DIST;
        if (gz < BONUS_CONSTANTS.Z_MIN || gz > BONUS_CONSTANTS.Z_MAX) continue;
        const gl = projectPoint(-1.42, gz, 10, curveX, curveY);
        const gr = projectPoint(1.42, gz, 10, curveX, curveY);
        ctx.save();
        ctx.globalAlpha = gz > 0.88 ? (1 - gz) / 0.12 : 0.72;
        ctx.strokeStyle = (Math.floor(animClock * 10) & 1) === 0 ? COL_GOLD_LIGHT : COL_RIM_GLOW;
        ctx.lineWidth = Math.max(1, (radiusAt(gz) / 146) * 2.5);
        ctx.beginPath();
        ctx.moveTo(gl.x, gl.y);
        ctx.quadraticCurveTo((gl.x + gr.x) * 0.5, Math.min(gl.y, gr.y) - (radiusAt(gz) * 0.22), gr.x, gr.y);
        ctx.stroke();
        ctx.restore();
      }

      // ── 3. Ordenação por z decrescente (Painter's Algorithm) ───────────────
      type DrawEntry =
        | { kind: 'item'; z: number; item: RuntimeTrackItem }
        | { kind: 'buddy'; z: number }
        | { kind: 'player'; z: number };

      const drawList: DrawEntry[] = [
        { kind: 'buddy', z: BONUS_CONSTANTS.BUDDY_Z },
        { kind: 'player', z: BONUS_CONSTANTS.PLAYER_Z },
      ];

      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (it.taken) continue;
        const z = BONUS_CONSTANTS.PLAYER_Z + (it.s - playerS) / BONUS_CONSTANTS.VIEW_DIST;
        if (z < 0.04 || z > BONUS_CONSTANTS.Z_MAX) continue;
        drawList.push({ kind: 'item', z, item: it });
      }

      drawList.sort((a, b) => b.z - a.z);

      const drawWallShadow = (th: number, z: number, heightAbove: number, baseHalfW: number, alphaMul = 1): void => {
        const wp = projectPoint(th, z, 0, curveX, curveY);
        const shrink = Math.max(0.45, 1 - heightAbove * 0.016);
        const persp = clamp(Math.pow(radiusAt(z) / radiusAt(BONUS_CONSTANTS.REF_Z), 0.82), 0.2, 1.3);
        const rx = Math.max(1.5, baseHalfW * persp * shrink);
        const ry = Math.max(1, rx * 0.38);
        ctx.save();
        ctx.globalAlpha = alphaMul;
        ctx.translate(wp.x, wp.y);
        ctx.rotate(-th * 0.45);
        ctx.fillStyle = COL_SHADOW;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      const drawAtlasScaled = (
        spriteName: string,
        frame: number,
        w: number,
        hPx: number,
        x: number,
        y: number,
        rot: number,
        scale: number,
        alpha = 1,
      ): void => {
        ctx.save();
        if (alpha < 0.999) ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(rot);
        if (Math.abs(scale - 1) > 0.001) ctx.scale(scale, scale);
        if (world.sprites.has(spriteName)) {
          world.sprites.draw(ctx, spriteName, frame, -w / 2, -hPx);
        } else {
          ctx.fillStyle = COL_GOLD_LIGHT;
          ctx.fillRect(-w / 2, -hPx, w, hPx);
        }
        ctx.restore();
      };

      for (let i = 0; i < drawList.length; i++) {
        const entry = drawList[i]!;
        if (entry.kind === 'item') {
          const it = entry.item;
          const z = entry.z;
          const alpha = z > 0.88 ? clamp((1 - z) / 0.12, 0, 1) : 1;
          const sc = clamp(Math.pow(radiusAt(z) / radiusAt(BONUS_CONSTANTS.REF_Z), 0.82), 0.22, 1.28);

          if (it.kind === 'coin') {
            const bob = Math.sin(animClock * 6 + it.s * 0.2) * 1.2;
            const hVis = it.curH + 1.5 + Math.max(0, bob);
            drawWallShadow(it.curTheta, z, hVis, 5.5, alpha);
            const pt = projectPoint(it.curTheta, z, hVis, curveX, curveY);
            const frame = Math.floor(animClock * 10 + it.s * 0.15) % 4;
            drawAtlasScaled('bonus_coin', frame, 12, 12, pt.x, pt.y, -it.curTheta * 0.45, sc, alpha);
          } else if (it.kind === 'bomb') {
            drawWallShadow(it.curTheta, z, it.curH, 6.5, alpha);
            const pt = projectPoint(it.curTheta, z, it.curH, curveX, curveY);
            const frame = Math.floor(animClock * 8 + it.s * 0.1) % 2;
            drawAtlasScaled('bonus_bomb', frame, 14, 14, pt.x, pt.y, -it.curTheta * 0.45, sc, alpha);
          } else if (it.kind === 'gate') {
            drawWallShadow(it.curTheta, z, 0, 7.5, alpha);
            const pt = projectPoint(it.curTheta, z, 0, curveX, curveY);
            const frame = Math.floor(animClock * 6) % 2;
            drawAtlasScaled('bonus_gate', frame, 16, 16, pt.x, pt.y, -it.curTheta * 0.35, sc, alpha);
          } else if (it.kind === 'emerald') {
            const floatH = it.curH + Math.sin(animClock * 5) * 2.5;
            drawWallShadow(it.curTheta, z, floatH, 8.5, alpha);
            const pt = projectPoint(it.curTheta, z, floatH, curveX, curveY);
            // Aura luminosa da Esmeralda do Bonfim
            ctx.save();
            ctx.globalAlpha = 0.45 * alpha;
            ctx.fillStyle = (Math.floor(animClock * 10) & 1) === 0 ? COL_TURQ_LIGHT : COL_GOLD_LIGHT;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y - 8 * sc, 11 * sc, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            const frame = Math.floor(animClock * 8) % 2;
            drawAtlasScaled('bonus_emerald', frame, 16, 16, pt.x, pt.y, -it.curTheta * 0.3, sc * 1.12, alpha);
          }
        } else if (entry.kind === 'buddy') {
          drawWallShadow(buddyTheta, BONUS_CONSTANTS.BUDDY_Z, buddyH, 7.5, 1);
          const blinkSkip = buddyBlink > 0 && Math.floor(animClock * 24) % 2 === 1;
          if (!blinkSkip) {
            const pt = projectPoint(buddyTheta, BONUS_CONSTANTS.BUDDY_Z, buddyH, curveX, curveY);
            const jumping = buddyH > 0.5;
            const sprite = jumping ? 'buddy_bonus_jump' : 'buddy_bonus_run';
            const frame = jumping ? Math.floor(animClock * 14) % 2 : Math.floor(runAnim * 13) % 4;
            drawAtlasScaled(sprite, frame, 18, 22, pt.x, pt.y, -buddyTheta * 0.45, 1.0, 1);
          }
        } else {
          drawWallShadow(theta, BONUS_CONSTANTS.PLAYER_Z, h, 8.5, 1);
          const hurtPose = invuln > 0.65;
          const blinkSkip = invuln > 0 && !hurtPose && Math.floor(animClock * 24) % 2 === 1;
          if (!blinkSkip) {
            const pt = projectPoint(theta, BONUS_CONSTANTS.PLAYER_Z, h, curveX, curveY);
            let sprite = 'pardo_bonus_run';
            let frame = Math.floor(runAnim * 12) % 4;
            if (hurtPose) {
              sprite = 'pardo_bonus_hurt';
              frame = 0;
            } else if (h > 0.5) {
              sprite = 'pardo_bonus_jump';
              frame = Math.floor(animClock * 12) % 2;
            }
            drawAtlasScaled(sprite, frame, 20, 24, pt.x, pt.y, -theta * 0.45, 0.88, 1);
          }
        }
      }

      // ── 4. Moedas espalhadas por colisão com bomba e partículas ────────────
      for (let i = 0; i < spillCoins.length; i++) {
        const sc = spillCoins[i]!;
        if (sc.life < 0.25 && Math.floor(animClock * 28) % 2 === 1) continue;
        const frame = Math.floor(animClock * 14 + i) % 4;
        drawAtlasScaled('bonus_coin', frame, 12, 12, sc.x, sc.y, 0, 0.85, clamp(sc.life / 0.25, 0.2, 1));
      }

      for (let i = 0; i < sparks.length; i++) {
        const sp = sparks[i]!;
        ctx.fillStyle = sp.color;
        ctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
      }

      // ── 5. Banner arcade flutuante (Checkpoints e Esmeralda) ───────────────
      if (banner) {
        const tNorm = 1 - banner.timer / banner.duration;
        const alpha = tNorm < 0.12 ? tNorm / 0.12 : banner.timer < 0.18 ? clamp(banner.timer / 0.18, 0, 1) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        const bx = 52;
        const by = 23;
        const bw = VIEW_W - bx * 2;
        const bh = 24;
        ctx.fillStyle = COL_LINE_DARK;
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = COL_SKY_TOP;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = banner.accent;
        ctx.fillRect(bx, by, bw, 2);
        ctx.fillRect(bx, by + bh - 2, bw, 2);
        drawMiniText(ctx, banner.line1, VIEW_W / 2, by + 5, COL_WHITE);
        drawMiniText(ctx, banner.line2, VIEW_W / 2, by + 14, banner.accent);
        ctx.restore();
      }
    },
  };
}
