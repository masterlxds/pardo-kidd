import type { Background } from '../core/types';
import { VIEW_W, VIEW_H } from '../core/constants';

/*
 * Parallax da Fase 2 — Amazônia. Camadas pré-renderizadas em canvas offscreen (fillRect inteiro);
 * por frame só drawImage. Todas as camadas tileiam com período P = 640.
 */

const P = 640;
const LH = VIEW_H + 24; // altura das camadas (base sólida cobre o deslocamento vertical)
const FALL_FRAMES = 4;
const SPARK_FRAMES = 4;
const VINE_FRAMES = 8;

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

function pick<T>(r: Rnd, a: readonly T[]): T {
  return a[ri(r, a.length)] as T;
}

/** Ruído 1D periódico (período P) suavizado. */
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

function disc(ctx: Ctx, color: string, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r + r - dy * dy + 0.25));
    R(ctx, color, cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

/** Executa fn em x, x-P e x+P (para elementos que cruzam a emenda). */
function wrapDraw(x: number, fn: (x: number) => void): void {
  fn(x);
  fn(x - P);
  fn(x + P);
}

// ─── cores ───────────────────────────────────────────────────────────────────
const GREENS = ['#173a17', '#2a5e22', '#3d8a2a', '#5a9a2a', '#6fbf3a', '#8fd45a'] as const;
const BARK = '#5a371e';
const BARK_L = '#8a5a34';

// ─── 1. céu, sol, nuvens ─────────────────────────────────────────────────────
function buildSky(): Cv {
  const ctx = mk(VIEW_W, VIEW_H);
  const bands = ['#4fa8e8', '#62b6ee', '#76c3f2', '#8bd0f5', '#a2dcf8', '#b8e6fa', '#cdeefb', '#e0f6fd'];
  const bh = Math.ceil(VIEW_H / bands.length);
  bands.forEach((c, i) => R(ctx, c, 0, i * bh, VIEW_W, bh));
  return ctx.canvas;
}

function buildSun(frame: number): Cv {
  const ctx = mk(VIEW_W, VIEW_H);
  const cx = 270;
  const cy = 36;
  const r0 = 15;
  const inner = r0 + 3 + frame;
  const len = 5 + frame * 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    const l = long ? len + 3 : len - 1;
    for (let d = inner; d <= inner + l; d++) {
      R(ctx, long ? '#ffe35a' : '#fff0a0', Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
  }
  disc(ctx, '#ffd23f', cx, cy, r0 + 1);
  disc(ctx, '#ffe35a', cx - 1, cy - 1, r0 - 2);
  disc(ctx, '#fff3a0', cx - 3, cy - 3, r0 - 7);
  return ctx.canvas;
}

function buildClouds(): Cv {
  const ctx = mk(P, 110);
  const r = mulberry32(21);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((i + 0.5) * (P / n) + (r() - 0.5) * 30);
    const cy = 20 + ri(r, 50);
    const puffs = 3 + ri(r, 3);
    const parts: { x: number; y: number; rr: number }[] = [];
    for (let k = 0; k < puffs; k++) {
      parts.push({ x: cx + (k - puffs / 2) * 9 + ri(r, 4), y: cy - ri(r, 5), rr: 5 + ri(r, 5) });
    }
    wrapDraw(0, (o) => {
      for (const p of parts) disc(ctx, '#d4ecf8', p.x + o, p.y + 3, p.rr);
      R(ctx, '#d4ecf8', cx - puffs * 5 + o, cy + 2, puffs * 10, 5);
      for (const p of parts) disc(ctx, '#ffffff', p.x + o, p.y, p.rr);
      R(ctx, '#ffffff', cx - puffs * 5 + o, cy - 1, puffs * 10, 5);
    });
  }
  return ctx.canvas;
}

// ─── 2. mata distante ────────────────────────────────────────────────────────
function buildFarForest(): Cv {
  const ctx = mk(P, LH);
  const r = mulberry32(5);
  const big = noise1(r, 10, 10);
  const small = noise1(r, 64, 3);
  for (let x = 0; x < P; x++) {
    const top = Math.round(96 + big(x) + small(x));
    R(ctx, '#5f9fae', x, top, 1, LH - top);
    R(ctx, '#7ab8c0', x, top, 1, 2);
    if ((x * 7 + Math.floor(top)) % 5 === 0) R(ctx, '#4e8a9c', x, top + 4 + (x % 4), 1, 3);
  }
  // faixa mais escura na base
  R(ctx, '#4e8a9c', 0, 118, P, LH - 118);
  return ctx.canvas;
}

// ─── 3. penhascos + cachoeiras ───────────────────────────────────────────────
interface Cliff {
  readonly cx: number;
  readonly hw: number;
  readonly top: number;
  readonly fallDx: number;
}
const CLIFFS: readonly Cliff[] = [
  { cx: 100, hw: 52, top: 54, fallDx: -4 },
  { cx: 330, hw: 60, top: 44, fallDx: 6 },
  { cx: 548, hw: 48, top: 60, fallDx: -2 },
];
const CLIFF_BASE = 128;
const FALL_W = 9;

function cliffTop(c: Cliff, x: number): number | null {
  let d = mod(x - c.cx, P);
  if (d > P / 2) d -= P;
  const u = Math.abs(d) / c.hw;
  if (u > 1) return null;
  return Math.round(CLIFF_BASE - (CLIFF_BASE - c.top) * Math.pow(1 - Math.pow(u, 3.5), 0.5));
}

function buildCliffs(): Cv {
  const ctx = mk(P, LH);
  const r = mulberry32(33);
  const hills = noise1(r, 12, 9);
  const jag = noise1(r, 80, 2);
  // colinas verdes de fundo entre os penhascos
  for (let x = 0; x < P; x++) {
    const top = Math.round(104 + hills(x) + jag(x));
    R(ctx, '#2f7a4a', x, top, 1, LH - top);
    R(ctx, '#46a05a', x, top, 1, 2);
  }
  R(ctx, '#2a5e22', 0, CLIFF_BASE - 6, P, LH - CLIFF_BASE + 6);
  for (const c of CLIFFS) {
    for (let dx = -c.hw; dx <= c.hw; dx++) {
      const x = mod(c.cx + dx, P);
      const top = cliffTop(c, x);
      if (top === null) continue;
      const shade = dx > c.hw * 0.35;
      for (let y = top; y < CLIFF_BASE; y++) {
        let col = shade ? '#6e5a4c' : '#9a8470';
        if ((y + Math.floor(x / 9)) % 11 === 5) col = shade ? '#56463b' : '#7c6856';
        if (y === top) col = '#b8a088';
        if (y > CLIFF_BASE - 8) col = shade ? '#4e5a40' : '#5f7048'; // musgo
        R(ctx, col, x, y, 1, 1);
      }
      // fendas verticais
      if ((x * 13) % 17 === 0) R(ctx, '#4a3a30', x, top + 6, 1, 14 + (x % 9));
      // mata sobre o topo
      const lush = 6 + Math.round(jag(x * 3) * 2 + 3);
      for (let k = 0; k < lush; k++) {
        const yy = top - 3 + k;
        R(ctx, k < 2 ? '#5a9a2a' : k < 4 ? '#3d8a2a' : '#2a5e22', x, yy, 1, 1);
      }
      if (mod(x, 5) < 2) R(ctx, '#2a5e22', x, top + lush - 3, 1, 4 + (x % 3)); // folhagem pendente
    }
    // copas arredondadas no cume
    const rr = mulberry32(c.cx);
    for (let i = 0; i < 6; i++) {
      const ox = Math.round((rr() * 2 - 1) * c.hw * 0.7);
      const x = mod(c.cx + ox, P);
      const t = cliffTop(c, x);
      if (t === null) continue;
      const rad = 4 + ri(rr, 3);
      wrapDraw(x, (xx) => {
        disc(ctx, '#2a5e22', xx, t - 2, rad);
        disc(ctx, '#3d8a2a', xx - 1, t - 3, rad - 1);
        disc(ctx, '#6fbf3a', xx - 2, t - 4, Math.max(1, rad - 3));
      });
    }
  }
  return ctx.canvas;
}

function buildFalls(frame: number): Cv {
  const ctx = mk(P, LH);
  for (const c of CLIFFS) {
    const fx = c.cx + c.fallDx - Math.floor(FALL_W / 2);
    let y0 = CLIFF_BASE;
    for (let i = 0; i < FALL_W; i++) {
      const t = cliffTop(c, fx + i);
      if (t !== null) y0 = Math.min(y0, t);
    }
    y0 += 4;
    const y1 = CLIFF_BASE - 2;
    for (let i = 0; i < FALL_W; i++) {
      const x = fx + i;
      const edge = i === 0 || i === FALL_W - 1;
      const off = (i % 3) * 2 + (i % 2);
      for (let y = y0; y < y1; y++) {
        const ph = mod(y - frame * 3 + off, 12);
        let col = ph < 4 ? '#ffffff' : ph < 7 ? '#d8f1ff' : ph < 9 ? '#9fe0ff' : '#e8f8ff';
        if (edge) col = ph < 6 ? '#9fe0ff' : '#6fc0ee';
        R(ctx, col, x, y, 1, 1);
      }
    }
    // lábio da queda
    R(ctx, '#ffffff', fx - 1, y0 - 1, FALL_W + 2, 2);
    // névoa na base (alpha leve; posições inteiras)
    const my = CLIFF_BASE - 3;
    ctx.globalAlpha = 0.55;
    for (let k = 0; k < 7; k++) {
      const ph = mod(k * 3 + frame * 2, 8);
      const mx = fx + FALL_W / 2 + (k - 3) * 6;
      disc(ctx, '#ffffff', Math.round(mx), my - ph + 2, 5 + (k % 3));
    }
    ctx.globalAlpha = 0.8;
    R(ctx, '#ffffff', fx - 8, my, FALL_W + 16, 4);
    R(ctx, '#ffffff', fx - 12, my + 2, FALL_W + 24, 2);
    ctx.globalAlpha = 1;
  }
  return ctx.canvas;
}

// ─── 4. rio ──────────────────────────────────────────────────────────────────
const RIVER_Y0 = 124;
const RIVER_Y1 = 139;

function buildRiver(): Cv {
  const ctx = mk(P, LH);
  R(ctx, '#2a5e22', 0, RIVER_Y0 - 3, P, LH - RIVER_Y0 + 3);
  R(ctx, '#3d8a2a', 0, RIVER_Y0 - 3, P, 1);
  const rows = ['#9fe0ff', '#6fc0ee', '#4fb0ea', '#2f9be0', '#2f9be0', '#2a8ad0', '#2a8ad0', '#3b6fd6', '#2f80d0', '#2a72c0', '#1e6b8a', '#1e6b8a', '#1e6b8a', '#1e6b8a', '#1a5a78'];
  rows.forEach((c, i) => R(ctx, c, 0, RIVER_Y0 + i, P, 1));
  // reflexo do verde da margem
  const r = mulberry32(9);
  for (let i = 0; i < 90; i++) R(ctx, '#2a8ad0', ri(r, P), RIVER_Y0 + 3 + ri(r, 11), 3 + ri(r, 6), 1);
  // margem inferior (vegetação)
  R(ctx, '#173a17', 0, RIVER_Y1, P, 2);
  return ctx.canvas;
}

function buildSparkles(frame: number): Cv {
  const ctx = mk(P, LH);
  const r = mulberry32(14);
  for (let i = 0; i < 70; i++) {
    const x = ri(r, P - 4);
    const y = RIVER_Y0 + 1 + ri(r, RIVER_Y1 - RIVER_Y0 - 2);
    const ph = ri(r, SPARK_FRAMES);
    const w = 2 + ri(r, 3);
    const d = mod(frame - ph, SPARK_FRAMES);
    if (d === 0) R(ctx, '#ffffff', x, y, w, 1);
    else if (d === 1) R(ctx, '#d8f1ff', x, y, Math.max(1, w - 1), 1);
  }
  return ctx.canvas;
}

function buildBoats(): Cv {
  const ctx = mk(P, LH);
  const items: { x: number; y: number; kind: 'log' | 'canoe' }[] = [
    { x: 60, y: 130, kind: 'log' },
    { x: 190, y: 133, kind: 'canoe' },
    { x: 330, y: 128, kind: 'log' },
    { x: 450, y: 132, kind: 'canoe' },
    { x: 570, y: 135, kind: 'log' },
  ];
  for (const it of items) {
    wrapDraw(it.x, (x) => {
      if (it.kind === 'log') {
        R(ctx, '#3a2418', x, it.y + 1, 15, 3);
        R(ctx, BARK, x + 1, it.y, 13, 3);
        R(ctx, BARK_L, x + 2, it.y, 9, 1);
        R(ctx, '#d8b890', x + 14, it.y + 1, 1, 2);
        R(ctx, '#9fe0ff', x - 1, it.y + 3, 17, 1);
      } else {
        R(ctx, '#5a371e', x + 2, it.y + 3, 16, 1);
        R(ctx, '#8a5a34', x + 1, it.y + 2, 18, 2);
        R(ctx, '#8a5a34', x, it.y + 1, 2, 1);
        R(ctx, '#8a5a34', x + 18, it.y + 1, 2, 1);
        R(ctx, '#c9782e', x + 3, it.y + 2, 14, 1);
        R(ctx, '#e23b3b', x + 8, it.y, 3, 2); // remador
        R(ctx, '#f2b98a', x + 9, it.y - 1, 1, 1);
        R(ctx, '#9fe0ff', x - 1, it.y + 4, 22, 1);
      }
    });
  }
  return ctx.canvas;
}

// ─── 5. floresta média ───────────────────────────────────────────────────────
function crown(ctx: Ctx, r: Rnd, cx: number, cy: number, rad: number, dark: boolean): void {
  const base = dark ? 0 : 1;
  disc(ctx, GREENS[base] as string, cx, cy + 1, rad);
  disc(ctx, GREENS[base + 1] as string, cx - 1, cy - 1, rad - 1);
  const blobs = 3 + ri(r, 3);
  for (let i = 0; i < blobs; i++) {
    const bx = cx + Math.round((r() * 2 - 1) * rad * 0.6);
    const by = cy - Math.round(r() * rad * 0.6);
    disc(ctx, GREENS[base + 2 + ri(r, 2)] as string, bx, by, 2 + ri(r, 3));
  }
  disc(ctx, GREENS[Math.min(5, base + 3)] as string, cx - Math.round(rad * 0.4), cy - Math.round(rad * 0.45), Math.max(1, Math.round(rad * 0.22)));
}

function palm(ctx: Ctx, r: Rnd, x: number, baseY: number, topY: number, lean: number): void {
  // tronco curvo
  const h = baseY - topY;
  let tx = x;
  for (let i = 0; i <= h; i++) {
    const t = i / h;
    tx = x + Math.round(lean * t * t);
    const y = baseY - i;
    R(ctx, BARK, tx, y, 3, 1);
    R(ctx, BARK_L, tx, y, 1, 1);
    if (i % 4 === 0) R(ctx, '#3a2418', tx, y, 3, 1);
  }
  // frutos (açaí roxo)
  R(ctx, '#6a3fa0', tx - 1, topY + 3, 2, 2);
  R(ctx, '#6a3fa0', tx + 2, topY + 4, 2, 2);
  R(ctx, '#4a2a70', tx, topY + 5, 2, 2);
  // folhas em leque
  const frond = (dir: number, up: number, len: number): void => {
    let px = tx + 1;
    let py = topY;
    for (let i = 0; i < len; i++) {
      px += dir;
      py += i < up ? -1 * (i % 2 === 0 ? 1 : 0) : (i - up) % 2 === 0 ? 1 : 0;
      R(ctx, i % 3 === 0 ? '#5a9a2a' : '#3d8a2a', px, py, 1, 1);
      R(ctx, '#2a5e22', px, py + 1, 1, 1);
      if (i % 2 === 1 && i > 2) R(ctx, '#3d8a2a', px, py + 2, 1, 2);
    }
  };
  const L = 9 + ri(r, 4);
  frond(-1, 4, L);
  frond(1, 4, L);
  frond(-1, 1, L - 2);
  frond(1, 1, L - 2);
  frond(-1, 6, L - 4);
  frond(1, 6, L - 4);
  R(ctx, '#5a9a2a', tx, topY - 4, 3, 5);
  R(ctx, '#8fd45a', tx + 1, topY - 5, 1, 2);
}

function buildForest(): Cv {
  const ctx = mk(P, LH);
  const r = mulberry32(77);
  // troncos de fundo + copas traseiras (escuras)
  const nBack = 30;
  for (let i = 0; i < nBack; i++) {
    const x = Math.round((i + 0.5) * (P / nBack) + (r() - 0.5) * 8);
    const cy = 112 + ri(r, 16);
    const rad = 11 + ri(r, 8);
    wrapDraw(x, (xx) => {
      R(ctx, '#3a2418', xx - 1, cy, 4, 40);
      R(ctx, BARK, xx - 1, cy, 3, 40);
      crown(ctx, r, xx, cy, rad, true);
    });
  }
  // palmeiras (açaizeiros)
  const nPalm = 10;
  for (let i = 0; i < nPalm; i++) {
    const x = Math.round((i + 0.3) * (P / nPalm) + ri(r, 20));
    const top = 82 + ri(r, 26);
    const lean = (i % 2 === 0 ? 1 : -1) * (3 + ri(r, 6));
    const seed = ri(r, 1e6);
    wrapDraw(x, (xx) => palm(ctx, mulberry32(seed), xx, 156, top, lean));
  }
  // copas da frente (verdes mais vivos)
  const nFront = 22;
  for (let i = 0; i < nFront; i++) {
    const x = Math.round((i + 0.5) * (P / nFront) + (r() - 0.5) * 10);
    const cy = 138 + ri(r, 8);
    const rad = 9 + ri(r, 8);
    wrapDraw(x, (xx) => crown(ctx, r, xx, cy, rad, false));
  }
  // chão de vegetação escura (y>142), borda irregular
  const edge = noise1(r, 48, 3);
  for (let x = 0; x < P; x++) {
    const top = Math.round(146 + edge(x));
    R(ctx, '#173a17', x, top, 1, LH - top);
    R(ctx, '#2a5e22', x, top, 1, 2);
  }
  for (let i = 0; i < 120; i++) {
    const x = ri(r, P);
    const y = 150 + ri(r, 50);
    wrapDraw(x, (xx) => R(ctx, pick(r, ['#2a5e22', '#3d8a2a', '#0f2a10']), xx, y, 2 + ri(r, 3), 1 + ri(r, 2)));
  }
  return ctx.canvas;
}

// ─── 6. cipós no topo ────────────────────────────────────────────────────────
function buildVines(frame: number): Cv {
  const ctx = mk(P, 80);
  const r = mulberry32(101);
  const ph = (frame / VINE_FRAMES) * Math.PI * 2;
  // folhagem do teto
  const roof = noise1(mulberry32(7), 40, 3);
  for (let x = 0; x < P; x++) {
    const h = Math.round(7 + roof(x) + (x % 3 === 0 ? 2 : 0));
    R(ctx, '#173a17', x, 0, 1, h);
    R(ctx, '#2a5e22', x, Math.max(0, h - 4), 1, 3);
    R(ctx, '#3d8a2a', x, h - 1 + (x % 2), 1, 1);
  }
  const n = 17;
  for (let i = 0; i < n; i++) {
    const x0 = Math.round((i + 0.5) * (P / n) + (r() - 0.5) * 14);
    const len = 22 + ri(r, 40);
    const seed = r() * 6;
    const amp = 1.5 + r() * 1.5;
    const thick = r() < 0.4 ? 2 : 1;
    const flower = r() < 0.25;
    for (let y = 6; y < len; y++) {
      const sway = Math.round(Math.sin(ph + seed + y * 0.06) * amp * (y / len));
      const x = x0 + sway;
      wrapDraw(x, (xx) => {
        R(ctx, y % 7 < 3 ? '#2a5e22' : '#3d8a2a', xx, y, thick, 1);
        if (y % 6 === 3) {
          const side = (y / 6) % 2 < 1 ? -1 : 1;
          R(ctx, '#3d8a2a', xx + (side < 0 ? -3 : thick), y, 3, 2);
          R(ctx, '#6fbf3a', xx + (side < 0 ? -3 : thick + 1), y, 2, 1);
        }
      });
    }
    const ey = len;
    const ex = x0 + Math.round(Math.sin(ph + seed + len * 0.06) * amp);
    wrapDraw(ex, (xx) => {
      disc(ctx, '#3d8a2a', xx, ey + 1, 3);
      disc(ctx, '#6fbf3a', xx - 1, ey, 2);
      if (flower) {
        R(ctx, '#ff5ab4', xx - 1, ey + 3, 3, 3);
        R(ctx, '#ffd23f', xx, ey + 4, 1, 1);
      }
    });
  }
  return ctx.canvas;
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

export function createAmazonBackground(): Background {
  const sky = buildSky();
  const sun = [buildSun(0), buildSun(1)];
  const clouds = buildClouds();
  const farForest = buildFarForest();
  const cliffs = buildCliffs();
  const falls = Array.from({ length: FALL_FRAMES }, (_, f) => buildFalls(f));
  const river = buildRiver();
  const sparkles = Array.from({ length: SPARK_FRAMES }, (_, f) => buildSparkles(f));
  const boats = buildBoats();
  const forest = buildForest();
  const vines = Array.from({ length: VINE_FRAMES }, (_, f) => buildVines(f));

  return {
    draw(ctx, camX, camY, time) {
      ctx.drawImage(sky, 0, 0);
      ctx.drawImage(sun[mod(Math.floor(time / 0.6), 2)] as Cv, 0, 0);
      drawTiled(ctx, clouds, Math.floor(camX * 0.03 + time * 1.5), 0);
      drawTiled(ctx, farForest, Math.floor(camX * 0.1), shiftY(camY, 0.1));
      const d2 = shiftY(camY, 0.2);
      const ox2 = Math.floor(camX * 0.2);
      drawTiled(ctx, cliffs, ox2, d2);
      drawTiled(ctx, falls[mod(Math.floor(time * 10), FALL_FRAMES)] as Cv, ox2, d2);
      const d3 = shiftY(camY, 0.3);
      const ox3 = Math.floor(camX * 0.3);
      drawTiled(ctx, river, ox3, d3);
      drawTiled(ctx, sparkles[mod(Math.floor(time * 5), SPARK_FRAMES)] as Cv, ox3, d3);
      drawTiled(ctx, boats, ox3 + Math.floor(time * 3), d3);
      drawTiled(ctx, forest, Math.floor(camX * 0.45), shiftY(camY, 0.45));
      drawTiled(ctx, vines[mod(Math.floor(time * 4), VINE_FRAMES)] as Cv, Math.floor(camX * 0.7), shiftY(camY, 0.7));
    },
  };
}
