import type { Background } from '../core/types';
import { VIEW_W, VIEW_H } from '../core/constants';
import { PALETTE } from './palette';

/*
 * Cenário parallax do sertão de Quixadá.
 * Cada camada é pré-renderizada UMA vez em canvas offscreen usando apenas fillRect com
 * coordenadas inteiras (sem anti-aliasing). O draw só faz drawImage em posições inteiras.
 */

/** Linha do horizonte quando camY = 0. */
const HORIZON = 120;
/** Base sólida das silhuetas de serra e colinas (fica abaixo do horizonte, coberta pela planície). */
const LAYER_BASE = 122;
const HAZE_FRAMES = 4;
const SERRA_W = 640;
const COLINA_W = 480;
const PLANICIE_W = 320;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;

interface Layer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: Ctx;
}

/** Cores de uma silhueta: topo (brilho), corpo, lado sombreado, faixas de estrato. */
interface Tones {
  readonly top: string;
  readonly body: string;
  readonly shade: string;
  readonly strata: string;
}

/**
 * Massa elíptica: topo(x) = base - h * sqrt(1 - |u|^p), u = (x - cx) / hw.
 * p = 2 → domo arredondado; p = 6 → topo quase plano (monólito).
 */
interface Mass {
  readonly cx: number;
  readonly hw: number;
  readonly base: number;
  readonly h: number;
  readonly p: number;
}

/** Arco natural: buraco transparente com semicírculo de raio r centrado em cy, descendo até yBottom. */
interface Arch {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly yBottom: number;
}

// ─── utilidades puras ────────────────────────────────────────────────────────

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** PRNG determinístico (mulberry32). Sem Math.random. */
function mulberry32(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ri(rnd: Rnd, n: number): number {
  return Math.floor(rnd() * n);
}

/** Ruído 1D periódico (período `period`), suavizado, para dar irregularidade às cristas. */
function periodicNoise(rnd: Rnd, n: number, period: number, amp: number): (x: number) => number {
  const vals = Array.from({ length: n }, () => (rnd() * 2 - 1) * amp);
  return (x: number): number => {
    const f = mod((x / period) * n, n);
    const i = Math.floor(f);
    const t = f - i;
    const a = vals[i] ?? 0;
    const b = vals[(i + 1) % n] ?? 0;
    const s = t * t * (3 - 2 * t);
    return a + (b - a) * s;
  };
}

/** Distância horizontal com wrap, no intervalo [-period/2, period/2). */
function wrapDelta(d: number, period: number): number {
  const m = mod(d, period);
  return m > period / 2 ? m - period : m;
}

/** Topo da massa na coluna x, ou null se a coluna está fora dela. */
function massTop(m: Mass, x: number, period: number): number | null {
  const u = wrapDelta(x - m.cx, period) / m.hw;
  if (Math.abs(u) > 1) return null;
  return Math.round(m.base - m.h * Math.sqrt(1 - Math.pow(Math.abs(u), m.p)));
}

// ─── desenho em pixels (sempre fillRect inteiro) ─────────────────────────────

function createLayer(w: number, h: number): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o cenário');
  return { canvas, ctx };
}

function col(key: string): string {
  const c: string | undefined = PALETTE[key];
  if (c === undefined) throw new Error(`cor fora da paleta: "${key}"`);
  return c;
}

function rect(ctx: Ctx, key: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = col(key);
  ctx.fillRect(x, y, w, h);
}

function px(ctx: Ctx, key: string, x: number, y: number): void {
  rect(ctx, key, x, y, 1, 1);
}

/** Linha de pixels entre dois pontos (arredondados). */
function segment(ctx: Ctx, key: string, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    px(ctx, key, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
  }
}

/** Pinta uma coluna de pixels agrupando trechos da mesma cor em um só fillRect. */
function paintColumn(ctx: Ctx, x: number, y0: number, y1: number, keyAt: (y: number) => string): void {
  let runKey = '';
  let runStart = y0;
  for (let y = y0; y <= y1; y++) {
    const k = keyAt(y);
    if (k !== runKey) {
      if (runKey !== '') rect(ctx, runKey, x, runStart, 1, y - runStart);
      runKey = k;
      runStart = y;
    }
  }
  if (runKey !== '') rect(ctx, runKey, x, runStart, 1, y1 - runStart + 1);
}

/** Crista/serra sólida: para cada coluna, o topo é o mínimo entre a crista e as massas. */
function paintRidge(
  layer: Layer,
  period: number,
  ridge: (x: number) => number,
  masses: readonly Mass[],
  ridgeTones: Tones,
  massTones: Tones,
  arches: readonly Arch[],
): void {
  const { ctx } = layer;
  for (let x = 0; x < period; x++) {
    let top = ridge(x);
    let owner: Mass | undefined;
    for (const m of masses) {
      const t = massTop(m, x, period);
      if (t !== null && t < top) {
        top = t;
        owner = m;
      }
    }
    const tones = owner ? massTones : ridgeTones;
    const shaded = owner !== undefined && wrapDelta(x - owner.cx, period) > owner.hw * 0.3;
    const topY = top;
    paintColumn(ctx, x, topY, LAYER_BASE - 1, (y) => {
      if (y === topY) return tones.top;
      if (y % 9 === 4) return tones.strata;
      return shaded ? tones.shade : tones.body;
    });
  }
  for (const a of arches) carve(ctx, a);
}

/** Abre o arco: apaga pixels (clearRect com inteiros, sem anti-aliasing). */
function carve(ctx: Ctx, a: Arch): void {
  for (let y = a.cy - a.r; y <= a.yBottom; y++) {
    const dy = y - a.cy;
    const half = dy >= 0 ? a.r : Math.floor(Math.sqrt(a.r * a.r - dy * dy));
    ctx.clearRect(a.cx - half, y, half * 2 + 1, 1);
  }
}

function dither(ctx: Ctx, a: string, b: string, y0: number, rows: number): void {
  for (let y = y0; y < y0 + rows; y++) {
    for (let x = 0; x < VIEW_W; x++) px(ctx, (x + y) % 2 === 0 ? a : b, x, y);
  }
}

/** Segmento de galho de árvore seca; bifurca até `depth` níveis. */
function galho(ctx: Ctx, key: string, x: number, y: number, ang: number, len: number, depth: number, rnd: Rnd): void {
  const ex = x + Math.cos(ang) * len;
  const ey = y - Math.sin(ang) * len;
  segment(ctx, key, x, y, ex, ey);
  if (depth === 0) return;
  for (const side of [-1, 1]) {
    const a = ang + side * (0.45 + rnd() * 0.5);
    galho(ctx, key, ex, ey, a, len * 0.62, depth - 1, rnd);
  }
}

// ─── objetos decorativos ─────────────────────────────────────────────────────

/** Mandacaru: cacto colunar com dois braços, em silhueta verde. */
function mandacaru(ctx: Ctx, x: number, base: number, h: number): void {
  const ya = base - Math.floor(h * 0.55);
  const yb = base - Math.floor(h * 0.3);
  // braços (antes do tronco)
  rect(ctx, 'E', x - 3, ya, 4, 2);
  rect(ctx, 'E', x - 4, ya - 4, 2, 6);
  rect(ctx, 'E', x + 2, yb, 4, 2);
  rect(ctx, 'E', x + 4, yb - 4, 2, 6);
  rect(ctx, 'd', x + 5, yb - 4, 1, 6);
  // tronco
  rect(ctx, 'E', x, base - h, 3, h);
  rect(ctx, 'd', x + 2, base - h, 1, h);
  rect(ctx, 'e', x, base - h + 1, 1, Math.max(0, h - 2));
  px(ctx, 'E', x + 1, base - h - 1);
}

/** Árvore seca retorcida. */
function arvore(ctx: Ctx, x: number, base: number, rnd: Rnd): void {
  const trunk = 14;
  rect(ctx, 'n', x, base - trunk, 2, trunk);
  rect(ctx, 'N', x + 1, base - trunk, 1, trunk);
  galho(ctx, 'n', x + 1, base - trunk, Math.PI / 2 + 0.2, 7, 3, rnd);
}

/** Capelinha branca com telhado 't' e cruz. */
function capela(ctx: Ctx, cx: number, base: number): void {
  rect(ctx, 'w', cx - 4, base - 7, 9, 7);
  rect(ctx, 'W', cx + 4, base - 7, 1, 7);
  rect(ctx, 'N', cx - 1, base - 3, 2, 3);
  rect(ctx, 'K', cx - 3, base - 6, 1, 2);
  const roof: readonly number[] = [5, 4, 2, 0];
  roof.forEach((hw, k) => rect(ctx, 't', cx - hw, base - 8 - k, hw * 2 + 1, 1));
  rect(ctx, 'k', cx, base - 14, 1, 3);
  rect(ctx, 'k', cx - 1, base - 13, 3, 1);
}

/** Trecho de cerca de madeira acompanhando o relevo. */
function cerca(ctx: Ctx, x0: number, n: number, hillTop: (x: number) => number): void {
  const step = 8;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * step;
    const b = hillTop(x) + 5;
    rect(ctx, 'n', x, b - 6, 1, 6);
  }
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * step;
    const xb = xa + step;
    const ba = hillTop(xa) + 5;
    const bb = hillTop(xb) + 5;
    segment(ctx, 'N', xa, ba - 5, xb, bb - 5);
    segment(ctx, 'N', xa, ba - 2, xb, bb - 2);
  }
}

/** Tufo de vegetação seca. */
function tufo(ctx: Ctx, x: number, base: number): void {
  px(ctx, 'O', x, base - 1);
  px(ctx, 'O', x - 1, base - 2);
  px(ctx, 'O', x + 1, base - 2);
  px(ctx, 'O', x, base - 3);
}

/** Pedra arredondada: topo claro, lado direito escuro, base sombreada. */
function pedra(ctx: Ctx, cx: number, base: number, hw: number, h: number): void {
  for (let x = cx - hw; x <= cx + hw; x++) {
    const u = (x - cx) / hw;
    const top = Math.round(base - h * Math.sqrt(1 - u * u));
    paintColumn(ctx, x, top, base - 1, (y) => {
      if (y === top) return 'v';
      if (y === base - 1 || x > cx) return 'L';
      return 'l';
    });
  }
}

/** Arbusto seco: galhos finos saindo do chão. */
function arbusto(ctx: Ctx, x: number, base: number, rnd: Rnd): void {
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI / 2 + (rnd() - 0.5) * 1.8;
    const len = 3 + ri(rnd, 3);
    segment(ctx, 'n', x, base, x + Math.cos(ang) * len, base - Math.sin(ang) * len);
  }
  rect(ctx, 'N', x - 2, base, 5, 1);
}

/** Crânio de boi minúsculo (13x7), bitmap em pixels. */
const CRANIO_BOI: readonly string[] = [
  'WW.........WW',
  '.WW.WWWWW.WW.',
  '..WWWWWWWWW..',
  '..WKKWWWKKW..',
  '...WWWKWWW...',
  '....WW.WW....',
  '.....W.W.....',
];

function craniobois(ctx: Ctx, x0: number, y0: number): void {
  CRANIO_BOI.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row.charAt(c);
      if (ch !== '.') px(ctx, ch, x0 + c, y0 + r);
    }
  });
}

// ─── camadas ─────────────────────────────────────────────────────────────────

/** 1. Céu: faixas azuis com dithering quadriculado entre elas. Fixo. */
function buildSky(): Layer {
  const layer = createLayer(VIEW_W, VIEW_H);
  const c = layer.ctx;
  rect(c, 'C', 0, 0, VIEW_W, 28);
  dither(c, 'C', 'c', 28, 12);
  rect(c, 'c', 0, 40, VIEW_W, 40);
  dither(c, 'c', 'p', 80, 12);
  rect(c, 'p', 0, 92, VIEW_W, HORIZON - 92);
  rect(c, 'P', 0, HORIZON, VIEW_W, VIEW_H - HORIZON);
  return layer;
}

/**
 * 2. Sol: disco amarelo com miolo 'a' no canto superior direito, raios 'm'.
 * state alterna quais raios são longos (cardinais x diagonais) para pulsar.
 */
function buildSun(state: 0 | 1): Layer {
  const layer = createLayer(VIEW_W, VIEW_H);
  const c = layer.ctx;
  const cx = 265;
  const cy = 32;
  const R = 12;
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.floor(Math.sqrt(R * R - dy * dy));
    rect(c, 'y', cx - half, cy + dy, half * 2 + 1, 1);
    if (dy > 0) px(c, 'Y', cx + half, cy + dy);
  }
  for (let dy = -5; dy <= 5; dy++) {
    const half = Math.floor(Math.sqrt(25 - dy * dy));
    rect(c, 'a', cx - half, cy + dy, half * 2 + 1, 1);
  }
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const cardinal = k % 2 === 0;
    const end = cardinal === (state === 0) ? 19 : 17;
    segment(c, 'm', cx + Math.cos(ang) * (R + 3), cy + Math.sin(ang) * (R + 3), cx + Math.cos(ang) * end, cy + Math.sin(ang) * end);
  }
  return layer;
}

/**
 * 3. Mormaço: linhas verticais onduladas 'm'/'o' acima do horizonte. 4 quadros de fase.
 * Parallax horizontal 0.05.
 */
function buildHaze(frame: number): Layer {
  const layer = createLayer(VIEW_W, VIEW_H);
  const c = layer.ctx;
  const groups: readonly { x: number; n: number }[] = [
    { x: 40, n: 3 },
    { x: 110, n: 4 },
    { x: 196, n: 3 },
    { x: 236, n: 3 },
  ];
  for (const g of groups) {
    for (let j = 0; j < g.n; j++) {
      const lx = g.x + j * 3;
      const top = 76 + ((g.x + j * 5) % 4) * 3;
      const key = j % 2 === 0 ? 'm' : 'o';
      for (let y = top; y <= 90; y++) {
        const dx = Math.round(Math.sin(y * 0.9 + j * 1.3 + frame * (Math.PI / 2)));
        px(c, key, lx + dx, y);
      }
    }
  }
  return layer;
}

/** 4. Serra distante com monólitos (Galinha Choca, arco natural). Ciclo 640px. */
function buildSerra(): Layer {
  const layer = createLayer(SERRA_W, VIEW_H);
  const rnd = mulberry32(0x5e44a);
  const jit = periodicNoise(rnd, 48, SERRA_W, 2);
  const ridge = (x: number): number => {
    const t = (2 * Math.PI * x) / SERRA_W;
    return Math.round(101 + 3 * Math.sin(4 * t) + 2 * Math.sin(7 * t + 1.3) + 1.5 * Math.sin(13 * t + 0.4) + jit(x));
  };
  const masses: readonly Mass[] = [
    // Pedra da Galinha Choca: corpo arredondado grande...
    { cx: 150, hw: 24, base: LAYER_BASE, h: 58, p: 2 },
    // ...e a "cabeça" menor saliente à direita
    { cx: 182, hw: 10, base: 116, h: 24, p: 2 },
    // monólito com arco de pedra natural
    { cx: 372, hw: 30, base: LAYER_BASE, h: 60, p: 6 },
    // agulha estreita
    { cx: 262, hw: 12, base: LAYER_BASE, h: 40, p: 3 },
    // mesas laterais
    { cx: 40, hw: 20, base: LAYER_BASE, h: 34, p: 6 },
    { cx: 520, hw: 36, base: LAYER_BASE, h: 46, p: 6 },
    // serras baixas
    { cx: 92, hw: 40, base: LAYER_BASE, h: 16, p: 3 },
    { cx: 430, hw: 30, base: LAYER_BASE, h: 14, p: 3 },
    { cx: 600, hw: 30, base: LAYER_BASE, h: 14, p: 3 },
  ];
  const arches: readonly Arch[] = [{ cx: 372, cy: 110, r: 7, yBottom: 119 }];
  paintRidge(
    layer,
    SERRA_W,
    ridge,
    masses,
    { top: 'o', body: 'l', shade: 'L', strata: 'L' },
    { top: 'v', body: 'o', shade: 'O', strata: 'l' },
    arches,
  );
  return layer;
}

/** 5. Colinas médias com mandacarus, árvores secas, capela branca e cerca. Ciclo 480px. */
function buildColinas(): Layer {
  const layer = createLayer(COLINA_W, VIEW_H);
  const ctx = layer.ctx;
  const rnd = mulberry32(0xc011a);
  const jit = periodicNoise(rnd, 32, COLINA_W, 1.5);
  const hillTop = (x: number): number => {
    const t = (2 * Math.PI * x) / COLINA_W;
    return Math.round(104 + 3 * Math.sin(2 * t) + 2 * Math.sin(5 * t + 0.7) + jit(x));
  };
  const hillTones: Tones = { top: 'P', body: 'o', shade: 'O', strata: 'O' };
  paintRidge(layer, COLINA_W, hillTop, [], hillTones, hillTones, []);

  mandacaru(ctx, 50, hillTop(50) + 5, 14);
  arvore(ctx, 116, hillTop(116) + 5, rnd);
  mandacaru(ctx, 196, hillTop(196) + 5, 10);
  capela(ctx, 240, hillTop(240) + 3);
  arvore(ctx, 300, hillTop(300) + 5, rnd);
  cerca(ctx, 330, 9, hillTop);
  mandacaru(ctx, 436, hillTop(436) + 4, 9);
  tufo(ctx, 150, hillTop(150) + 3);
  tufo(ctx, 380, hillTop(380) + 3);
  tufo(ctx, 22, hillTop(22) + 3);
  return layer;
}

/** 6. Planície próxima: areia do horizonte à base, com pedras, arbustos, rachaduras e crânios. Ciclo 320px. */
function buildPlanicie(): Layer {
  const layer = createLayer(PLANICIE_W, VIEW_H);
  const c = layer.ctx;
  const rnd = mulberry32(0x9a1e7);
  rect(c, 'P', 0, HORIZON - 2, PLANICIE_W, VIEW_H - HORIZON + 2);
  rect(c, 'o', 0, HORIZON - 2, PLANICIE_W, 1);
  for (let i = 0; i < 70; i++) rect(c, 'p', ri(rnd, PLANICIE_W - 8), HORIZON + ri(rnd, 58), 3 + ri(rnd, 5), 1);
  for (let i = 0; i < 80; i++) px(c, 'o', ri(rnd, PLANICIE_W), HORIZON + ri(rnd, 58));
  for (let k = 0; k < 4; k++) {
    let x = ri(rnd, PLANICIE_W);
    let y = HORIZON + 12 + ri(rnd, 40);
    for (let s = 0; s < 12; s++) {
      px(c, 'O', x, y);
      x += ri(rnd, 3) - 1;
      y += ri(rnd, 2);
    }
  }
  pedra(c, 26, 170, 9, 5);
  pedra(c, 112, 158, 12, 7);
  pedra(c, 190, 178, 8, 4);
  pedra(c, 268, 166, 11, 6);
  arbusto(c, 78, 142, rnd);
  arbusto(c, 160, 134, rnd);
  arbusto(c, 240, 176, rnd);
  craniobois(c, 44, 146);
  craniobois(c, 214, 150);
  return layer;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Deslocamento vertical de uma camada: -camY × (fator × 0.5), arredondado. */
function shiftY(camY: number, factor: number): number {
  return Math.round(-camY * factor * 0.5);
}

/**
 * Desenha a camada com wrap horizontal. `offset` é o deslocamento de parallax (≥ 0 ou negativo).
 * Usa duas cópias para cobrir a tela inteira mesmo com o deslocamento no meio do ciclo.
 */
function drawTiled(ctx: Ctx, img: HTMLCanvasElement, period: number, offset: number, dy: number): void {
  const ox = -mod(offset, period);
  ctx.drawImage(img, ox, dy);
  ctx.drawImage(img, ox + period, dy);
}

export function createBackground(): Background {
  const sky = buildSky();
  const sun: readonly Layer[] = [buildSun(0), buildSun(1)];
  const haze: readonly Layer[] = Array.from({ length: HAZE_FRAMES }, (_, f) => buildHaze(f));
  const serra = buildSerra();
  const colinas = buildColinas();
  const planicie = buildPlanicie();

  return {
    draw(ctx, camX, camY, time) {
      // 1. céu (fixo)
      ctx.drawImage(sky.canvas, 0, 0);
      // 2. sol (fixo) com raios pulsando a cada 0.4s
      ctx.drawImage(sun[mod(Math.floor(time / 0.4), 2)].canvas, 0, 0);
      // 3. mormaço (parallax 0.05, ondula a cada 1/8 s)
      drawTiled(ctx, haze[mod(Math.floor(time * 8), HAZE_FRAMES)].canvas, VIEW_W, Math.floor(camX * 0.05), 0);
      // 4. serra distante (parallax 0.1)
      drawTiled(ctx, serra.canvas, SERRA_W, Math.floor(camX * 0.1), shiftY(camY, 0.1));
      // 5. colinas médias (parallax 0.25)
      drawTiled(ctx, colinas.canvas, COLINA_W, Math.floor(camX * 0.25), shiftY(camY, 0.25));
      // 6. planície próxima (parallax 0.5). Preenche a faixa inferior que o deslocamento deixa descoberta.
      const dyPlain = shiftY(camY, 0.5);
      if (dyPlain < 0) rect(ctx, 'P', 0, VIEW_H + dyPlain, VIEW_W, -dyPlain);
      drawTiled(ctx, planicie.canvas, PLANICIE_W, Math.floor(camX * 0.5), dyPlain);
    },
  };
}
