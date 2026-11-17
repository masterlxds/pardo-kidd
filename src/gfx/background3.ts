import type { Background } from '../core/types';
import { VIEW_W, VIEW_H } from '../core/constants';

/*
 * Parallax da Fase 3 — Bahia World (subaquática). Tudo pré-renderizado em canvas offscreen;
 * por frame só drawImage / alguns fillRect (bolhinhas). Camadas tileiam com período P = 640.
 */

const P = 640;
const LH = VIEW_H + 24;
const SURF = 48; // y da linha da superfície dentro da faixa do horizonte
const RAY_FRAMES = 6;
const WAVE_FRAMES = 8;
const FISH_FRAMES = 2;
const FG_FRAMES = 8;
const FG_H = 44;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

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

function ri(r: Rnd, n: number): number {
  return Math.floor(r() * n);
}

function noise1(r: Rnd, n: number, amp: number): (x: number) => number {
  const v = Array.from({ length: n }, () => (r() * 2 - 1) * amp);
  return (x) => {
    const f = mod((x / P) * n, n);
    const i = Math.floor(f);
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    const a = v[i] ?? 0;
    const b = v[(i + 1) % n] ?? 0;
    return a + (b - a) * s;
  };
}

function mk(w: number, h: number): Ctx {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) throw new Error('Canvas 2D indisponível para o cenário');
  return x;
}

function R(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function wrapDraw(x: number, fn: (x: number) => void): void {
  fn(x);
  fn(x - P);
  fn(x + P);
}

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ─── 1. degradê dithered ─────────────────────────────────────────────────────
const WATER = ['#6bbdd8', '#5FA8D3', '#3fa3c4', '#1B9AAA', '#198aa0', '#16708f', '#124f80', '#0D3B66'] as const;

function buildGradient(): Cv {
  const ctx = mk(VIEW_W, LH);
  const img = ctx.createImageData(VIEW_W, LH);
  const n = WATER.length - 1;
  for (let y = 0; y < LH; y++) {
    const s = Math.min(n - 0.001, (y / (LH - 20)) * n);
    const i = Math.floor(s);
    const f = s - i;
    for (let x = 0; x < VIEW_W; x++) {
      const th = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
      const c = hex(WATER[f > th ? i + 1 : i] as string);
      const o = (y * VIEW_W + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx.canvas;
}

// ─── horizonte: céu, Farol da Barra, Bonfim, coqueiros ───────────────────────
function palm(ctx: Ctx, r: Rnd, x: number, base: number, h: number, lean: number): void {
  const TR = '#5b7a76';
  const LF = '#4f8a78';
  const LF2 = '#6aa58c';
  let tx = x;
  let ty = base;
  for (let i = 0; i < h; i++) {
    ty = base - i;
    tx = x + Math.round((lean * i * i) / (h * h));
    R(ctx, TR, tx, ty, 1, 1);
  }
  const fronds = 6;
  for (let k = 0; k < fronds; k++) {
    const dir = k < fronds / 2 ? -1 : 1;
    const len = 5 + ri(r, 3);
    const droop = 0.1 + r() * 0.12;
    const up = 1.4 - ((k % 3) * 0.7) - 0.2;
    for (let i = 1; i <= len; i++) {
      const fx = tx + dir * i;
      const fy = Math.round(ty - up * i * 0.6 + droop * i * i * 0.55);
      R(ctx, i % 2 ? LF : LF2, fx, fy, 1, 1);
      if (i > 2) R(ctx, LF, fx, fy + 1, 1, 1);
    }
  }
  R(ctx, LF, tx - 1, ty, 3, 2);
}

function lighthouse(ctx: Ctx, x: number, base: number): void {
  const STONE = '#8fa9b4';
  const STONE_D = '#6f8a98';
  const W = '#e8f1f2';
  const S = '#6d8795';
  // forte (base) com muralha e torreão
  R(ctx, STONE, x - 30, base - 7, 60, 7);
  R(ctx, STONE_D, x - 30, base - 2, 60, 2);
  R(ctx, STONE, x - 24, base - 11, 12, 4);
  R(ctx, STONE, x + 12, base - 11, 12, 4);
  for (let i = -30; i < 30; i += 4) R(ctx, STONE_D, x + i, base - 8, 2, 1);
  // corpo do farol (cilindro listrado)
  const th = 18;
  for (let i = 0; i < th; i++) {
    const y = base - 11 - i;
    const hw = 4 - Math.floor(i / 10);
    R(ctx, Math.floor(i / 5) % 2 === 0 ? W : S, x - hw, y, hw * 2 + 1, 1);
    R(ctx, STONE_D, x + hw, y, 1, 1);
  }
  const ty = base - 11 - th;
  R(ctx, STONE, x - 5, ty, 11, 2);
  R(ctx, '#ffe9a0', x - 2, ty - 4, 5, 4);
  R(ctx, S, x - 3, ty - 5, 7, 1);
  R(ctx, STONE_D, x - 1, ty - 8, 3, 3);
  R(ctx, STONE_D, x, ty - 10, 1, 2);
}

function church(ctx: Ctx, x: number, base: number): void {
  const WL = '#e3ecec';
  const WD = '#aebfc6';
  const RF = '#b97a6a';
  // corpo
  R(ctx, WL, x - 12, base - 12, 24, 12);
  R(ctx, WD, x - 12, base - 2, 24, 2);
  // frontão triangular
  for (let i = 0; i < 6; i++) R(ctx, WL, x - 6 + i, base - 18 + i, 12 - i * 2, 1);
  R(ctx, WD, x - 1, base - 20, 2, 2);
  // torres
  for (const sx of [-1, 1]) {
    const tx = x + sx * 11;
    R(ctx, WL, tx - 3, base - 26, 7, 26);
    R(ctx, WD, tx + (sx > 0 ? 2 : -3), base - 26, 2, 26);
    R(ctx, '#7f98a6', tx - 1, base - 22, 3, 4);
    R(ctx, WD, tx - 4, base - 27, 9, 1);
    for (let i = 0; i < 4; i++) R(ctx, RF, tx - 3 + i, base - 31 + i, 7 - i * 2, 1);
    R(ctx, WD, tx, base - 34, 1, 3);
  }
  R(ctx, '#7f98a6', x - 2, base - 7, 5, 7);
  R(ctx, RF, x - 12, base - 13, 24, 1);
}

function boat(ctx: Ctx, x: number, y: number, sail: boolean): void {
  R(ctx, '#9a5e55', x - 4, y, 9, 2);
  R(ctx, '#7a463f', x - 3, y + 2, 7, 1);
  if (sail) {
    R(ctx, '#e8f1f2', x, y - 8, 1, 8);
    for (let i = 0; i < 7; i++) R(ctx, '#e8f1f2', x + 1, y - 7 + i, Math.max(1, 6 - i), 1);
  } else {
    R(ctx, '#e8f1f2', x - 2, y - 3, 4, 3);
  }
}

function buildHorizon(): Cv {
  const H = SURF + 8;
  const ctx = mk(P, H);
  const r = mulberry32(77);
  const sky = ['#d4eef5', '#c4e6f0', '#b3deec', '#a4d6e8'];
  const bh = Math.ceil(H / sky.length);
  sky.forEach((c, i) => R(ctx, c, 0, i * bh, P, bh));
  // faixas de nuvens suaves
  for (let i = 0; i < 9; i++) {
    const cx = Math.round((i + 0.4) * (P / 9));
    wrapDraw(cx, (xx) => R(ctx, '#e6f5f8', xx - 10, 6 + ((i * 5) % 9), 20 + ((i * 7) % 12), 2));
  }
  // costa distante
  const hills = noise1(r, 14, 3);
  const landBase = SURF - 1;
  for (let x = 0; x < P; x++) {
    const inA = (x > 70 && x < 190) || (x > 350 && x < 500);
    const wave = Math.sin((x / P) * Math.PI * 2 * 7);
    const top = Math.round(inA ? landBase - 8 - hills(x) : landBase - 1 + (wave > 0.7 ? -1 : 0));
    R(ctx, '#7fa89c', x, top, 1, landBase - top + 2);
    if (inA) R(ctx, '#6f9a8c', x, top + 2, 1, landBase - top);
  }
  lighthouse(ctx, 125, landBase - 5);
  church(ctx, 430, landBase - 6);
  for (const [px, ph, pl] of [[190, 16, 4], [200, 13, -3], [66, 14, 3], [78, 11, -4], [345, 15, 4], [506, 14, -4], [520, 17, 3], [588, 12, 3]] as const) {
    palm(ctx, r, px, landBase - 4, ph, pl);
  }
  boat(ctx, 28, SURF - 3, true);
  boat(ctx, 275, SURF - 2, false);
  boat(ctx, 590, SURF - 3, true);
  return ctx.canvas;
}

/** Cristas da onda sobre a borda inferior da faixa de horizonte. */
function buildWave(frame: number): Cv {
  const ctx = mk(P, 14);
  const ph = (frame / WAVE_FRAMES) * Math.PI * 2;
  for (let x = 0; x < P; x++) {
    const w = Math.sin((x / P) * Math.PI * 2 * 20 + ph) * 1.4 + Math.sin((x / P) * Math.PI * 2 * 9 - ph) * 1.1;
    const top = Math.round(4 + w);
    R(ctx, '#6bbdd8', x, top, 1, 14 - top);
    R(ctx, '#d8f4f8', x, top, 1, 1);
    if (((x >> 1) + frame) % 5 === 0) R(ctx, '#9fdcea', x, top + 1, 1, 1);
    R(ctx, '#5FA8D3', x, top + 5, 1, 14);
  }
  return ctx.canvas;
}

// ─── god rays ────────────────────────────────────────────────────────────────
function buildRays(frame: number): Cv {
  const H = 150;
  const ctx = mk(P, H);
  const r = mulberry32(12);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const x0 = (i + 0.3) * (P / n) + r() * 20;
    const w0 = 6 + r() * 12;
    const ph = r() * 6.28;
    const a0 = 0.05 + r() * 0.05;
    const pulse = 0.6 + 0.4 * Math.sin((frame / RAY_FRAMES) * Math.PI * 2 + ph);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const a = a0 * pulse * (1 - t) * (1 - t * 0.3);
      if (a < 0.006) continue;
      const cx = x0 + y * 0.55;
      const w = w0 + y * 0.12;
      wrapDraw(cx, (xx) => {
        ctx.fillStyle = `rgba(210,245,255,${a.toFixed(3)})`;
        ctx.fillRect(Math.round(xx - w / 2), y, Math.round(w), 1);
        ctx.fillStyle = `rgba(235,252,255,${(a * 0.8).toFixed(3)})`;
        ctx.fillRect(Math.round(xx - w / 5), y, Math.max(1, Math.round(w / 2.5)), 1);
      });
    }
  }
  return ctx.canvas;
}

// ─── 2. recifes e ruínas ─────────────────────────────────────────────────────
function column(ctx: Ctx, x: number, base: number, h: number, w: number, c: string, d: string, l: string, broken: boolean): void {
  const top = base - h;
  R(ctx, c, x, top, w, h);
  R(ctx, d, x + w - 2, top, 2, h);
  R(ctx, l, x, top, 1, h);
  for (let y = top + 4; y < base; y += 6) R(ctx, d, x, y, w, 1);
  R(ctx, c, x - 2, top - 2, w + 4, 3); // capitel
  R(ctx, l, x - 2, top - 2, w + 4, 1);
  if (broken) {
    for (let i = 0; i < w + 4; i += 3) R(ctx, '#00000000', x - 2 + i, top - 2, 1, 1);
  }
  R(ctx, c, x - 2, base - 3, w + 4, 3);
}

function arch(ctx: Ctx, x: number, base: number, w: number, h: number, c: string, d: string, l: string): void {
  const th = 4;
  column(ctx, x, base, h, th, c, d, l, false);
  column(ctx, x + w, base, h, th, c, d, l, false);
  const cx = x + th + (w - th) / 2;
  const rad = (w - th) / 2 + th / 2;
  for (let a = 0; a <= 20; a++) {
    const ang = Math.PI * (a / 20);
    const px = Math.round(cx - Math.cos(ang) * rad);
    const py = Math.round(base - h - Math.sin(ang) * (rad * 0.7));
    R(ctx, c, px - 1, py - 1, 3, 3);
    if (a < 10) R(ctx, l, px - 1, py - 1, 1, 1);
  }
}

function reefLayer(seed: number, base: string, dark: string, light: string, topY: number, amp: number, ruinY: number, ruins: boolean): Cv {
  const ctx = mk(P, LH);
  const r = mulberry32(seed);
  const big = noise1(r, 9, amp);
  const small = noise1(r, 70, 3);
  for (let x = 0; x < P; x++) {
    const top = Math.round(topY + big(x) + small(x));
    R(ctx, base, x, top, 1, LH - top);
    R(ctx, light, x, top, 1, 1);
    if ((x * 5 + top) % 7 === 0) R(ctx, dark, x, top + 3 + (x % 5), 1, 2);
  }
  // pináculos de coral / rocha
  for (let i = 0; i < 16; i++) {
    const x = Math.round((i + 0.5) * (P / 16) + (r() - 0.5) * 20);
    const h = 8 + ri(r, 16);
    const w = 3 + ri(r, 3);
    const top = Math.round(topY + big(x) + small(x));
    wrapDraw(x, (xx) => {
      R(ctx, base, xx, top - h, w, h + 2);
      R(ctx, light, xx, top - h, 1, h);
      R(ctx, dark, xx + w - 1, top - h, 1, h);
      if (r() < 0.5) {
        R(ctx, base, xx - 2, top - h + 3, 2, 3);
        R(ctx, base, xx + w, top - h + 6, 2, 3);
      }
    });
  }
  if (ruins) {
    const spots = [60, 180, 310, 420, 530];
    spots.forEach((sx, i) => {
      wrapDraw(sx, (xx) => {
        if (i % 2 === 0) {
          arch(ctx, xx, ruinY + 10, 26 + (i % 3) * 4, 30, base, dark, light);
        } else {
          column(ctx, xx, ruinY + 10, 30 + (i % 3) * 8, 6, base, dark, light, true);
          column(ctx, xx + 16, ruinY + 10, 16, 6, base, dark, light, true);
          R(ctx, base, xx - 4, ruinY + 8, 30, 3);
        }
        // blocos caídos
        R(ctx, base, xx + 24, ruinY + 8, 8, 3);
        R(ctx, dark, xx + 24, ruinY + 10, 8, 1);
      });
    });
    // âncora afundada
    wrapDraw(250, (xx) => {
      R(ctx, base, xx, ruinY - 4, 2, 13);
      R(ctx, base, xx - 3, ruinY - 3, 8, 2);
      R(ctx, base, xx - 5, ruinY + 6, 4, 2);
      R(ctx, base, xx + 3, ruinY + 6, 4, 2);
    });
  }
  return ctx.canvas;
}

function buildFish(): Cv[] {
  const frames: Cv[] = [];
  for (let f = 0; f < FISH_FRAMES; f++) {
    const ctx = mk(P, 150);
    const r = mulberry32(404);
    const groups = [
      { x: 80, y: 40, n: 7, c: '#4f93b3' },
      { x: 300, y: 78, n: 6, c: '#3d7fa0' },
      { x: 520, y: 58, n: 8, c: '#4f93b3' },
      { x: 410, y: 108, n: 5, c: '#2f6f90' },
    ];
    for (const g of groups) {
      for (let k = 0; k < g.n; k++) {
        const fx = g.x + (k % 4) * 8 + ri(r, 5);
        const fy = g.y + Math.round(Math.sin(k * 1.7) * 7) + ri(r, 4);
        wrapDraw(fx, (xx) => {
          R(ctx, g.c, xx, fy, 4, 2);
          R(ctx, g.c, xx + 1, fy - 1, 2, 1);
          R(ctx, g.c, xx - 2, fy + (f === 0 ? -1 : 1), 2, 1);
          R(ctx, g.c, xx - 2, fy + (f === 0 ? 1 : 0), 1, 1);
        });
      }
    }
    frames.push(ctx.canvas);
  }
  return frames;
}

// ─── 4. primeiro plano ───────────────────────────────────────────────────────
const FG = { alga: '#0a2c4f', alga2: '#0e3860', coral: '#0c3257', pedra: '#09284a' } as const;
const FG_RIBBON = ['#7a2a3e', '#7a6320', '#204f7a', '#25613f', '#9fb1ba'] as const;

interface FgItem {
  readonly kind: 'alga' | 'coral' | 'fitas' | 'leque';
  readonly x: number;
  readonly h: number;
  readonly seed: number;
}

function fgItems(): FgItem[] {
  const r = mulberry32(555);
  const kinds: FgItem['kind'][] = ['alga', 'coral', 'fitas', 'alga', 'leque', 'fitas', 'alga', 'coral'];
  return kinds.map((kind, i) => ({
    kind,
    x: Math.round((i + 0.5) * (P / kinds.length) + (r() - 0.5) * 30),
    h: 22 + ri(r, 18),
    seed: ri(r, 100000),
  }));
}

function sway(ph: number, seed: number, y: number, len: number, amp: number): number {
  return Math.round(Math.sin(ph + seed + y * 0.11) * amp * (y / len));
}

function drawFgItem(ctx: Ctx, it: FgItem, frame: number): void {
  const ph = (frame / FG_FRAMES) * Math.PI * 2;
  const base = FG_H;
  const r = mulberry32(it.seed);
  wrapDraw(it.x, (xx) => {
    if (it.kind === 'alga') {
      const blades = 3 + ri(r, 2);
      for (let b = 0; b < blades; b++) {
        const bx = xx + (b - blades / 2) * 3;
        const len = it.h - ri(r, 10);
        const sd = r() * 6;
        for (let y = 0; y < len; y++) {
          const x = bx + sway(ph, sd, y, len, 3);
          R(ctx, y % 6 < 3 ? FG.alga : FG.alga2, x, base - y, y < len - 4 ? 2 : 1, 1);
          if (y % 8 === 5) R(ctx, FG.alga2, x + (b % 2 ? 2 : -2), base - y, 2, 1);
        }
      }
      R(ctx, FG.pedra, xx - 6, base - 3, 12, 3);
    } else if (it.kind === 'coral') {
      // coral-galho
      const arms = [-7, -3, 0, 4, 8];
      arms.forEach((dx, k) => {
        const len = 10 + ((k * 7 + it.seed) % 10);
        for (let y = 0; y < len; y++) {
          const x = xx + Math.round(dx * (y / len) * 1.2);
          R(ctx, FG.coral, x, base - y, 3, 1);
        }
        R(ctx, FG.coral, xx + Math.round(dx * 1.2) - 1, base - len - 2, 5, 3);
      });
      R(ctx, FG.pedra, xx - 9, base - 5, 22, 5);
      R(ctx, FG.pedra, xx - 5, base - 8, 12, 3);
    } else if (it.kind === 'leque') {
      // leque-do-mar
      for (let a = -6; a <= 6; a++) {
        const len = 14 - Math.abs(a) + ((a * 3 + it.seed) % 3);
        const x1 = xx + a * 2;
        for (let y = 0; y < len; y++) R(ctx, y % 4 === 0 ? FG.alga2 : FG.coral, x1 + Math.round(a * 0.2 * (y / 4)), base - 4 - y, 1, 1);
      }
      R(ctx, FG.pedra, xx - 7, base - 5, 15, 5);
    } else {
      // pedra com fitinhas do Bonfim
      R(ctx, FG.pedra, xx - 9, base - 7, 20, 7);
      R(ctx, FG.pedra, xx - 6, base - 11, 13, 5);
      for (let k = 0; k < 4; k++) {
        const col = FG_RIBBON[(k + it.seed) % FG_RIBBON.length] as string;
        const len = 14 + ((k * 5 + it.seed) % 8);
        const sd = k * 1.3;
        for (let y = 0; y < len; y++) {
          const x = xx - 3 + k * 3 + sway(ph, sd, y, len, 3);
          R(ctx, col, x, base - 10 - y, 2, 1);
        }
      }
    }
  });
}

function buildForeground(frame: number): Cv {
  const ctx = mk(P, FG_H);
  for (const it of fgItems()) drawFgItem(ctx, it, frame);
  return ctx.canvas;
}

// ─── bolhas ──────────────────────────────────────────────────────────────────
interface Bub {
  readonly x: number;
  readonly y0: number;
  readonly speed: number;
  readonly s: number;
  readonly ph: number;
}

function makeBubbles(): Bub[] {
  const r = mulberry32(909);
  return Array.from({ length: 22 }, () => ({
    x: r() * P,
    y0: r() * (VIEW_H + 20),
    speed: 6 + r() * 10,
    s: r() < 0.25 ? 2 : 1,
    ph: r() * 6.28,
  }));
}

// ─── API ─────────────────────────────────────────────────────────────────────
function shiftY(camY: number, factor: number): number {
  return Math.round(-camY * factor * 0.5);
}

function drawTiled(ctx: Ctx, img: Cv, offset: number, dy: number): void {
  const ox = -mod(offset, P);
  ctx.drawImage(img, ox, dy);
  ctx.drawImage(img, ox + P, dy);
}

export function createBahiaBackground(): Background {
  const gradient = buildGradient();
  const horizon = buildHorizon();
  const waves = Array.from({ length: WAVE_FRAMES }, (_, f) => buildWave(f));
  const rays = Array.from({ length: RAY_FRAMES }, (_, f) => buildRays(f));
  const reefFar = reefLayer(31, '#2a6785', '#245a78', '#3a7c98', 118, 8, 112, false);
  const reefNear = reefLayer(47, '#1B4965', '#163d56', '#2a6082', 138, 7, 128, true);
  const fish = buildFish();
  const fg = Array.from({ length: FG_FRAMES }, (_, f) => buildForeground(f));
  const bubbles = makeBubbles();

  return {
    draw(ctx, camX, camY, time) {
      ctx.drawImage(gradient, 0, shiftY(camY, 0.1));
      // A linha d'água é ancorada ao MUNDO (y = SURF = SWIM_CEILING): acompanha a câmera 1:1, para que
      // nada do que está debaixo d'água apareça "no céu". Fundo o bastante, ela sai da tela por cima.
      const dh = -Math.round(camY);
      const ox1 = Math.floor(camX * 0.06);
      if (dh + SURF + 8 > 0) {
        drawTiled(ctx, horizon, ox1, dh);
        drawTiled(ctx, waves[mod(Math.floor(time * 4), WAVE_FRAMES)] as Cv, ox1 + Math.floor(time * 2), dh + SURF - 4);
      }
      drawTiled(ctx, rays[mod(Math.floor(time * 2.5), RAY_FRAMES)] as Cv, Math.floor(camX * 0.12 - time * 3), Math.max(dh + SURF, -6));
      drawTiled(ctx, reefFar, Math.floor(camX * 0.2), shiftY(camY, 0.2));
      drawTiled(ctx, fish[mod(Math.floor(time * 4), FISH_FRAMES)] as Cv, Math.floor(camX * 0.28 - time * 9), shiftY(camY, 0.28) + 14);
      drawTiled(ctx, reefNear, Math.floor(camX * 0.35), shiftY(camY, 0.35));
      // bolhinhas subindo
      ctx.fillStyle = 'rgba(200,240,250,0.45)';
      const by = shiftY(camY, 0.4);
      for (const b of bubbles) {
        const y = VIEW_H + 10 - mod(b.y0 + time * b.speed, VIEW_H + 20) + by;
        const x = mod(b.x - camX * 0.4 + Math.sin(time * 1.5 + b.ph) * 2, P);
        if (x < VIEW_W) ctx.fillRect(Math.round(x), Math.round(y), b.s, b.s);
      }
    },
    drawForeground(ctx, camX, _camY, time) {
      ctx.globalAlpha = 0.78;
      drawTiled(ctx, fg[mod(Math.floor(time * 3), FG_FRAMES)] as Cv, Math.floor(camX * 1.3), VIEW_H - FG_H);
      ctx.globalAlpha = 1;
    },
  };
}
