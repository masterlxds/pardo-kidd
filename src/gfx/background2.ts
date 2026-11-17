import type { Background } from '../core/types';
import { VIEW_W, VIEW_H } from '../core/constants';

/*
 * Parallax da Fase 2 — "Coração da Amazônia".
 *
 * Tudo é pintado por código, pixel a pixel, em buffers Uint32 (um por camada) na criação e
 * convertido em canvas offscreen; por frame só há drawImage. As camadas são autoradas em 2×
 * (S = 2 pixels reais por pixel lógico, igual aos sprites do jogo) e desenhadas com metade do
 * tamanho em coordenadas lógicas — mapeamento 1:1 no canvas real, então continua nítido.
 * Todo desenho em camada tileável dá a volta em x (wrap), então não há emenda.
 *
 * Perspectiva atmosférica: quanto mais longe, mais claro, azulado e dessaturado. Nenhum contorno
 * escuro, e os verdes puxam para o azul (teal) — a grama/inimigos da camada de jogo ficam com o
 * verde-amarelado saturado e o contorno quase preto só para eles.
 */

const S = 2;
/** Margens (px lógicos) acima/abaixo da tela para o deslocamento vertical das camadas. */
const TOPM = 16;
const BOTM = 24;
const LH = (TOPM + VIEW_H + BOTM) * S;
/** camY com a câmera embaixo (fase de 14 tiles): composição de referência. */
const BASE_CAM_Y = 44;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;
/** [luz, corpo, sombra] */
type Pal = readonly [number, number, number];

// ─── utilidades ──────────────────────────────────────────────────────────────

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

/** Hash 2D determinístico → [0,1). */
function h2(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x: number, y: number): number {
  return ((BAYER[(y & 3) * 4 + (x & 3)] as number) + 0.5) / 16;
}

/** '#rrggbb' → pixel Uint32 (little-endian ABGR). */
function hex(h: string): number {
  const n = Number.parseInt(h.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}
function pal(l: string, b: string, s: string): Pal {
  return [hex(l), hex(b), hex(s)];
}

/** Ruído 1D periódico suavizado. */
function pnoise(rnd: Rnd, n: number, period: number, amp: number): (x: number) => number {
  const v = Array.from({ length: n }, () => (rnd() * 2 - 1) * amp);
  return (x) => {
    const f = mod((x / period) * n, n);
    const i = Math.floor(f);
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    const a = v[i] ?? 0;
    const b = v[(i + 1) % n] ?? 0;
    return a + (b - a) * s;
  };
}

const X = (lx: number): number => Math.round(lx * S);
const Y = (ly: number): number => Math.round((ly + TOPM) * S);

/** Superfície de pixels; com wrap=true tudo que sai por um lado em x entra pelo outro. */
class Surf {
  readonly d: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly wrap = true,
  ) {
    this.d = new Uint32Array(w * h);
  }
  set(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (y < 0 || y >= this.h) return;
    if (x < 0 || x >= this.w) {
      if (!this.wrap) return;
      x = mod(x, this.w);
    }
    this.d[y * this.w + x] = c;
  }
  get(x: number, y: number): number {
    x |= 0;
    y |= 0;
    if (y < 0 || y >= this.h) return 0;
    if (x < 0 || x >= this.w) {
      if (!this.wrap) return 0;
      x = mod(x, this.w);
    }
    return this.d[y * this.w + x] as number;
  }
  /** Linha horizontal [x0, x1] inclusiva. */
  row(x0: number, x1: number, y: number, c: number): void {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: number): void {
    cx = Math.round(cx);
    cy = Math.round(cy);
    for (let dy = -ry; dy <= ry; dy++) {
      const k = ry === 0 ? 0 : dy / (ry + 0.35);
      const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - k * k)) + 0.35);
      for (let dx = -hw; dx <= hw; dx++) this.set(cx + dx, cy + dy, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: number): void {
    this.ell(cx, cy, r, r, c);
  }
  /** Linha grossa (pincel quadrado w). */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: number): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const o = Math.floor(w / 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.rect(Math.round(x0 + (x1 - x0) * t) - o, Math.round(y0 + (y1 - y0) * t) - o, w, w, c);
    }
  }
  canvas(): Cv {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para o cenário');
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// ─── paleta (do fundo para a frente) ─────────────────────────────────────────

const SKY = ['#3f86d2', '#4c95dc', '#62a8e6', '#80bdee', '#a2d3f4', '#c2e4f7', '#d9eff8'] as const;
const SKY_STOPS = [0, 22, 37, 49, 59, 67, 75, 400] as const;

const P_FAR_A = pal('#bfe0e2', '#acd3da', '#9bc7d3');
const P_FAR_B = pal('#a3d0c6', '#88bdb8', '#74a9ad');
const P_HILL = pal('#84bfa4', '#66a691', '#528f85');
const P_CLIFF_VEG = pal('#7ab798', '#589a85', '#44817a');
const ROCK_L = hex('#9093aa');
const ROCK = hex('#6d718b');
const ROCK_S = hex('#585c78');
const ROCK_D = hex('#494d68');
const P_BANK = pal('#6aa88f', '#4c8c7c', '#3c7672');

const W0 = hex('#eef8fd');
const W1 = hex('#d6eef8');
const W2 = hex('#aed8ee');
const W3 = hex('#8cc3e4');

const RIVER = ['#a6d6ec', '#8cc6e6', '#74b5de', '#5fa5d5', '#5196ca'] as const;
const RIVER_STOPS = [96, 107, 113, 120, 128, 999] as const;
const RIV_GLINT = hex('#d2edf8');
const RIV_DARK = hex('#4f8fc2');
const RIV_REFL = hex('#6f9fb6');

const P_MID_BACK = pal('#6aa587', '#4a8a74', '#3a7469');
const P_MID_PALM = pal('#72ab84', '#4c8c6c', '#3a7562');
const P_MID_FRONT = pal('#5f9c7c', '#42806a', '#33695f');
const P_MID_DEEP = pal('#4c8a70', '#3e7a66', '#35695f');
const P_MID_BASE = hex('#2f6259');
const TRUNK_L = hex('#8a8474');
const TRUNK = hex('#6d695f');
const TRUNK_S = hex('#565650');
const P_BIG_BARK = pal('#8f8b82', '#767a7a', '#626a70');
const P_BIG_LEAF = pal('#4f8a6c', '#376e5c', '#2a5850');

const P_ROOF = pal('#4a8364', '#32694f', '#255243');
const VINE = hex('#2f6a4c');
const VINE_L = hex('#4f8f62');

// ─── primitivas de vegetação ─────────────────────────────────────────────────

/**
 * Lóbulo de copa: domo achatado (guarda-chuva) com base quase reta, luz em cima/esquerda,
 * sombra embaixo, borda recortada por pequenos tufos.
 */
function lobe(s: Surf, cx: number, cy: number, rx: number, ry: number, p: Pal, seed: number, shadow = true): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  rx = Math.max(3, Math.round(rx));
  ry = Math.max(2, Math.round(ry));
  const by = Math.max(2, Math.round(ry * 0.5));
  const span = ry + by;
  if (shadow) {
    for (let dy = 0; dy <= by + 3; dy++) {
      const k = dy / (by + 3);
      const hw = Math.round((rx - 2) * Math.sqrt(1 - k * k));
      s.row(cx - hw, cx + hw, cy + dy, p[2]);
    }
  }
  for (let dy = -ry; dy <= by; dy++) {
    const k = dy <= 0 ? dy / ry : dy / by;
    const hw = Math.round(rx * Math.sqrt(1 - k * k) + (h2(dy >> 1, 11, seed) - 0.5) * 3);
    for (let dx = -hw; dx <= hw; dx++) {
      const n = h2((cx + dx) >> 1, (cy + dy) >> 1, seed);
      const v = (dy + ry) / span + (0.2 * dx) / rx + (n - 0.5) * 0.26;
      s.set(cx + dx, cy + dy, v < 0.3 ? p[0] : v < 0.72 ? p[1] : p[2]);
    }
  }
  const n = 3 + Math.floor(rx / 5);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.08 + 0.84 * h2(i, 3, seed));
    const r = 1 + Math.floor(h2(i, 5, seed) * Math.min(4, 1 + rx / 8));
    s.disc(cx + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95, r, p[0]);
  }
  for (let i = 0; i < n; i++) {
    const u = (h2(i, 7, seed) - 0.5) * 1.7;
    const bx = cx + u * rx;
    const byy = cy + by * Math.sqrt(Math.max(0, 1 - u * u));
    s.disc(bx, byy, 1 + Math.floor(h2(i, 9, seed) * 2.5), p[2]);
  }
}

/** Árvore emergente de copa achatada: tronco fino, forquilha e 3 lóbulos em guarda-chuva. */
function umbrella(s: Surf, x: number, baseY: number, topY: number, rx: number, p: Pal, trunk: number, seed: number, tw = 2): void {
  const ry = Math.max(3, Math.round(rx * 0.36));
  const cy = topY + ry;
  const forkY = Math.min(baseY, cy + Math.round(rx * 0.95));
  s.line(x, baseY, x, forkY, tw, trunk);
  const bw = Math.max(1, tw - 1);
  s.line(x, forkY, x - rx * 0.58, cy + ry * 0.9, bw, trunk);
  s.line(x, forkY, x + rx * 0.6, cy + ry * 0.8, bw, trunk);
  s.line(x, forkY, x, cy, bw, trunk);
  lobe(s, x - rx * 0.62, cy + ry * 0.95, rx * 0.56, ry * 0.8, p, seed + 1);
  lobe(s, x + rx * 0.66, cy + ry * 0.8, rx * 0.5, ry * 0.75, p, seed + 2);
  lobe(s, x, cy, rx, ry, p, seed);
}

interface CanopyOpts {
  readonly seed: number;
  /** Linha de crista em px lógicos (x lógico → y lógico). */
  readonly ridge: (lx: number) => number;
  readonly pal: Pal;
  readonly rows: number;
  /** Raio horizontal dos lóbulos em px reais [min, max]. */
  readonly rx: readonly [number, number];
  readonly rowGap: number;
  readonly emergents: number;
  /** Altura das emergentes acima da crista, px lógicos [min, max]. */
  readonly emergentH: readonly [number, number];
  readonly emergentRx: readonly [number, number];
}

/** Massa de mata: emergentes + fileiras de copas sobrepostas sobre um corpo sólido. */
function paintCanopy(s: Surf, o: CanopyOpts): void {
  const rnd = mulberry32(o.seed);
  const [l, b, sh] = o.pal;
  for (let x = 0; x < s.w; x++) {
    const top = Y(o.ridge(x / S)) + 3;
    for (let y = top; y < s.h; y++) s.d[y * s.w + x] = b;
  }
  for (let i = 0; i < o.emergents; i++) {
    const x = Math.round(((i + 0.15 + rnd() * 0.7) * s.w) / o.emergents);
    const base = Y(o.ridge(x / S)) + 8;
    const hgt = (o.emergentH[0] + rnd() * (o.emergentH[1] - o.emergentH[0])) * S;
    const rx = o.emergentRx[0] + rnd() * (o.emergentRx[1] - o.emergentRx[0]);
    umbrella(s, x, base, base - hgt, rx, o.pal, sh, o.seed * 31 + i, 2);
  }
  const avg = (o.rx[0] + o.rx[1]) / 2;
  for (let r = 0; r < o.rows; r++) {
    const n = Math.round(s.w / (avg * 1.05));
    for (let i = 0; i < n; i++) {
      const x = Math.round(((i + rnd()) * s.w) / n);
      const rx = o.rx[0] + rnd() * (o.rx[1] - o.rx[0]);
      const ry = rx * (0.36 + rnd() * 0.12);
      const cy = Y(o.ridge(x / S)) + 2 + r * o.rowGap + Math.round(rnd() * 5);
      lobe(s, x, cy, rx, ry, [l, b, sh], o.seed * 97 + r * 1000 + i);
    }
  }
}

/** Esmaece as linhas [y0,y1] (px reais) em direção a `c` com dither — névoa na base da camada. */
function hazeDown(s: Surf, y0: number, y1: number, c: number, maxT = 1): void {
  for (let y = Math.max(0, y0); y < Math.min(s.h, y1); y++) {
    const t = ((y - y0) / (y1 - y0)) * maxT;
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (s.d[i] !== 0 && bayer(x, y) < t) s.d[i] = c;
    }
  }
}

// ─── 1. céu e sol ────────────────────────────────────────────────────────────

function buildSky(): Cv {
  const s = new Surf(VIEW_W * S, VIEW_H * S, false);
  const cols = SKY.map(hex);
  for (let ly = 0; ly < VIEW_H; ly++) {
    let i = 0;
    while (i < cols.length - 1 && ly >= (SKY_STOPS[i + 1] as number)) i++;
    const a = SKY_STOPS[i] as number;
    const b = SKY_STOPS[i + 1] as number;
    const t = (ly - a) / (b - a);
    const p = i < cols.length - 1 ? (t - 0.45) / 0.55 : 0;
    for (let lx = 0; lx < VIEW_W; lx++) {
      const c = p > bayer(lx, ly) ? (cols[i + 1] as number) : (cols[i] as number);
      s.rect(lx * S, ly * S, S, S, c);
    }
  }
  return s.canvas();
}

const SUN_SIZE = 72;
const SUN_CX = 268;
const SUN_CY = 42;

function buildSun(frame: number): Cv {
  const n = SUN_SIZE * S;
  const s = new Surf(n, n, false);
  const c = n / 2;
  const glow = hex('#bfe2f6');
  const ray = hex('#ffe9a0');
  // halo pontilhado
  for (let y = 0; y < n; y += 2) {
    for (let x = 0; x < n; x += 2) {
      const d = Math.hypot(x - c, y - c) / S;
      if (d > 13 && d < 21 && bayer(x >> 1, y >> 1) < (21 - d) / 14) s.rect(x, y, 2, 2, glow);
    }
  }
  // raios: traços curtos, alternando o comprimento entre cardeais e diagonais
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const long = (k % 2 === 0) === (frame === 0);
    const r0 = 18 * S;
    const r1 = (long ? 25 : 22) * S;
    for (let r = r0; r <= r1; r++) s.rect(Math.round(c + Math.cos(a) * r) - 1, Math.round(c + Math.sin(a) * r) - 1, 3, 3, ray);
  }
  s.disc(c, c, 13 * S, hex('#ffd45c'));
  s.disc(c, c, 12 * S - 1, hex('#ffe27a'));
  s.disc(c - 2, c - 2, 8 * S, hex('#ffeea0'));
  s.disc(c - 4, c - 4, 4 * S, hex('#fff7cc'));
  return s.canvas();
}

// ─── 2/3. matas distantes ────────────────────────────────────────────────────

const P_A = 512;
const P_B = 640;

function buildFarA(): Cv {
  const s = new Surf(P_A * S, LH);
  const n = pnoise(mulberry32(11), 9, P_A, 5);
  const n2 = pnoise(mulberry32(12), 31, P_A, 1.5);
  paintCanopy(s, {
    seed: 3,
    ridge: (x) => 63 + n(x) + n2(x),
    pal: P_FAR_A,
    rows: 2,
    rx: [10, 22],
    rowGap: 10,
    emergents: 12,
    emergentH: [7, 14],
    emergentRx: [10, 18],
  });
  hazeDown(s, Y(68), Y(88), hex('#c4e2e8'), 0.9);
  return s.canvas();
}

function buildFarB(): Cv {
  const s = new Surf(P_B * S, LH);
  const n = pnoise(mulberry32(21), 8, P_B, 6);
  const n2 = pnoise(mulberry32(22), 37, P_B, 1.5);
  paintCanopy(s, {
    seed: 5,
    ridge: (x) => 74 + n(x) + n2(x),
    pal: P_FAR_B,
    rows: 3,
    rx: [13, 28],
    rowGap: 11,
    emergents: 14,
    emergentH: [10, 22],
    emergentRx: [14, 26],
  });
  hazeDown(s, Y(82), Y(104), hex('#a9d2cf'), 0.8);
  return s.canvas();
}

// ─── 4. paredões, cachoeiras e margem ────────────────────────────────────────

const P_C = 800;
/** Linha d'água (y lógico) onde os paredões encontram o rio. */
const SHORE = 104;

interface Fall {
  /** centro, largura do salto de cima, y do lábio, y do degrau, largura do salto de baixo (lógicos) */
  readonly x: number;
  readonly w: number;
  readonly top: number;
  readonly ledge: number;
  readonly w2: number;
}
interface Cliff {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly falls: readonly Fall[];
}

const CLIFFS: readonly Cliff[] = [
  { x0: 30, x1: 206, top: 66, falls: [{ x: 112, w: 38, top: 68, ledge: 87, w2: 52 }] },
  {
    x0: 312,
    x1: 540,
    top: 58,
    falls: [
      { x: 392, w: 50, top: 60, ledge: 82, w2: 66 },
      { x: 496, w: 12, top: 64, ledge: 90, w2: 16 },
    ],
  },
  { x0: 622, x1: 752, top: 72, falls: [{ x: 688, w: 30, top: 74, ledge: 90, w2: 42 }] },
];

const ROCKS = [ROCK_L, ROCK, ROCK_S, ROCK_D] as const;

function buildCliffs(): Cv {
  const s = new Surf(P_C * S, LH);
  const rnd = mulberry32(41);
  const n = pnoise(mulberry32(42), 7, P_C, 6);
  const n2 = pnoise(mulberry32(43), 41, P_C, 1.5);
  // morros de mata entre os paredões
  paintCanopy(s, {
    seed: 7,
    ridge: (x) => 86 + n(x) + n2(x),
    pal: P_HILL,
    rows: 3,
    rx: [14, 30],
    rowGap: 10,
    emergents: 10,
    emergentH: [9, 20],
    emergentRx: [15, 26],
  });

  const yShore = Y(SHORE + 2);
  for (const [ci, c] of CLIFFS.entries()) {
    const x0 = X(c.x0);
    const x1 = X(c.x1);
    const topD = Y(c.top);
    const cw = x1 - x0;
    const ch = yShore - topD;
    // contrafortes verticais: cada um arredondado, com luz à esquerda e fenda à direita
    let x = x0;
    let k = 0;
    while (x < x1) {
      let w = 14 + Math.floor(rnd() * 34);
      if (x1 - x - w < 12) w = x1 - x;
      const off = Math.floor(rnd() * 14);
      const recess = rnd() < 0.35;
      for (let i = 0; i < w; i++) {
        const xd = x + i;
        const u = (i + 0.5) / w;
        const edge = Math.min(xd - x0, x1 - xd);
        const sh = edge < 30 ? Math.round((1 - edge / 30) ** 2 * 44) : 0;
        const top = topD + off + sh + Math.round((2 * u - 1) ** 2 * 5);
        for (let y = top; y < yShore + 4; y++) {
          const v = u + (h2(y >> 2, k, 300 + ci) - 0.5) * 0.16;
          let t = v < 0.14 ? 0 : v < 0.56 ? 1 : v < 0.84 ? 2 : 3;
          if (recess) t = Math.min(3, t + 1);
          if (y < top + 3 && t > 0) t -= 1;
          const depth = (y - topD) / ch;
          if (depth > 0.6 && t < 3 && bayer(xd, y) < (depth - 0.6) * 2.2) t += 1;
          s.set(xd, y, ROCKS[t] as number);
        }
      }
      x += w;
      k++;
    }
    // prateleiras horizontais irregulares
    for (let j = 0; j < 3; j++) {
      const ly = Math.round(topD + (0.24 + 0.22 * j + rnd() * 0.08) * ch);
      const lx0 = Math.round(x0 + 16 + rnd() * cw * 0.45);
      const lw = Math.round(40 + rnd() * cw * 0.4);
      for (let xd = lx0; xd < Math.min(x1 - 10, lx0 + lw); xd++) {
        const jj = Math.floor(h2(xd >> 2, j, 310 + ci) * 3);
        if (!isRock(s.get(xd, ly + jj))) continue;
        s.rect(xd, ly + jj, 1, 2, ROCK_L);
        s.rect(xd, ly + jj + 2, 1, 3 + Math.floor(h2(xd >> 3, j, 5) * 3), ROCK_D);
      }
    }
    // fendas verticais tortas
    for (let j = 0; j < cw / 16; j++) {
      let cx = Math.round(x0 + 12 + rnd() * (cw - 24));
      const cy = Math.round(topD + 18 + rnd() * ch * 0.6);
      const len = 8 + Math.floor(rnd() * 26);
      for (let i = 0; i < len; i++) {
        if (h2(i >> 1, j, 320 + ci) < 0.3) cx += h2(i, j, 321 + ci) < 0.5 ? -1 : 1;
        if (isRock(s.get(cx, cy + i))) s.set(cx, cy + i, ROCK_D);
      }
    }
    // nicho escuro atrás das quedas + degrau
    for (const f of c.falls) {
      const tiers: readonly [number, number, number][] = [
        [f.w / 2 + 2, Y(f.top), Y(f.ledge)],
        [f.w2 / 2 + 2, Y(f.ledge), yShore + 4],
      ];
      for (const [hw, ya, yb] of tiers) {
        for (let xd = X(f.x - hw); xd < X(f.x + hw); xd++) {
          const col = h2(xd >> 2, 3, 330 + ci) < 0.45 ? ROCK_D : ROCK_S;
          for (let y = ya; y < yb; y++) s.set(xd, y, col);
        }
      }
      const ly = Y(f.ledge);
      for (let xd = X(f.x - f.w2 / 2 - 6); xd <= X(f.x + f.w2 / 2 + 6); xd++) {
        const j = Math.floor(h2(xd >> 2, 1, 77 + ci) * 3);
        s.rect(xd, ly - 2 + j, 1, 3, ROCK_L);
        s.rect(xd, ly + 1 + j, 1, 4, ROCK_D);
      }
    }
    // mata sobre o paredão, debruçada na borda
    const nl = Math.round(cw / 20);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i <= nl; i++) {
        const lx = x0 - 8 + ((i + rnd() * 0.8) * (cw + 16)) / (nl + 1);
        if (r === 1 && c.falls.some((f) => Math.abs(lx - X(f.x)) < X(f.w / 2) + 4)) continue;
        const edge = Math.min(lx - x0, x1 - lx);
        const sh = edge < 30 ? Math.round((1 - Math.max(0, edge) / 30) ** 2 * 40) : 0;
        const rx = 12 + rnd() * 14;
        lobe(s, lx, topD + sh - 7 + r * 8 + rnd() * 4, rx, rx * 0.42, P_CLIFF_VEG, 500 + ci * 100 + r * 40 + i);
      }
    }
    for (let i = 0; i < 3; i++) {
      const lx = x0 + cw * (0.12 + 0.76 * rnd());
      umbrella(s, Math.round(lx), topD, topD - (12 + rnd() * 12) * S, 16 + rnd() * 10, P_CLIFF_VEG, P_CLIFF_VEG[2], 900 + ci * 10 + i, 2);
    }
    // tufos pendentes na face da pedra e moitinhas agarradas
    for (let xd = x0 + 6; xd < x1 - 6; xd += 2) {
      if (h2(xd, 5, 90 + ci) < 0.3) {
        const len = 3 + Math.floor(h2(xd, 6, 90 + ci) * 14);
        let y = topD - 10;
        while (y < s.h && !isRock(s.get(xd, y))) y++;
        s.rect(xd, y, 2, len, P_CLIFF_VEG[2]);
        s.rect(xd, y, 1, Math.max(1, len - 3), P_CLIFF_VEG[1]);
      }
    }
    for (let i = 0; i < cw / 40; i++) {
      const lx = x0 + 20 + rnd() * (cw - 40);
      const ly = topD + ch * (0.3 + rnd() * 0.5);
      if (isRock(s.get(lx, ly))) lobe(s, lx, ly, 5 + rnd() * 6, 3 + rnd() * 2, P_BANK, 950 + ci * 20 + i, false);
    }
  }

  // linha d'água: tudo abaixo fica transparente (o rio é desenhado antes, atrás)
  const sn = pnoise(mulberry32(44), 60, P_C, 1.2);
  const shoreAt = (xd: number): number => Y(SHORE + sn(xd / S));
  for (let xd = 0; xd < s.w; xd++) {
    for (let y = shoreAt(xd); y < s.h; y++) s.d[y * s.w + xd] = 0;
  }
  // reflexo escuro dos paredões na água (tracejado que rareia)
  const refl = hex('#6f93b4');
  for (const c of CLIFFS) {
    for (let ly = 0; ly < 9; ly++) {
      for (let xd = X(c.x0 + 8); xd < X(c.x1 - 8); xd += 2) {
        const y = Y(SHORE + 1 + ly);
        if (h2(xd >> 3, ly, 55) < 0.62 - ly * 0.07) s.rect(xd, y + (ly > 4 ? 1 : 0), 2, 1, refl);
      }
    }
  }
  // moitas da margem (pulando a base das quedas)
  const inFall = (lx: number): boolean => CLIFFS.some((c) => c.falls.some((f) => Math.abs(mod(lx, P_C) - f.x) < f.w2 / 2 + 9));
  for (let i = 0; i < 70; i++) {
    const lx = (i + rnd()) * (P_C / 70);
    if (inFall(lx)) continue;
    const rx = 7 + rnd() * 9;
    lobe(s, X(lx), shoreAt(X(lx)) - 3 - Math.round(rnd() * 3), rx, rx * 0.45, P_BANK, 3000 + i, false);
  }
  return s.canvas();
}

function isRock(c: number): boolean {
  return c === ROCK || c === ROCK_L || c === ROCK_S || c === ROCK_D;
}

const FALL_FRAMES = 4;
const FALL_CYCLE = 24;

interface Sprite {
  /** posição lógica na camada (x no período, y de tela na composição base) */
  readonly x: number;
  readonly y: number;
  readonly frames: readonly Cv[];
}

/** Cortina d'água em dois saltos + espuma e névoa; um sprite pequeno por quadro. */
function buildFall(f: Fall, seed: number): Sprite {
  const mx = 14;
  const lx0 = f.x - f.w2 / 2 - mx;
  const ly0 = f.top - 3;
  const w = X(f.w2 + mx * 2);
  const h = (SHORE + 10 - ly0) * S;
  const cx = w / 2;
  const frames: Cv[] = [];
  for (let fr = 0; fr < FALL_FRAMES; fr++) {
    const s = new Surf(w, h, false);
    const tier = (hw: number, y0: number, y1: number, tseed: number): void => {
      for (let dx = -hw; dx < hw; dx++) {
        const strand = (dx + 400) >> 1;
        // fios soltos nas bordas, com vãos por onde a pedra aparece
        const edge = hw - Math.abs(dx + 0.5);
        if (edge < 5 && h2(strand, 2, tseed) < 0.45) continue;
        const gap = h2(strand, 3, tseed) < 0.1;
        const off = Math.floor(h2(strand, 0, tseed) * FALL_CYCLE);
        const jag = Math.floor(h2(strand, 4, tseed) * 4);
        for (let y = y0 + jag; y < y1; y++) {
          const ph = mod(y - fr * (FALL_CYCLE / FALL_FRAMES) + off, FALL_CYCLE);
          let c = ph < 9 ? W0 : ph < 13 ? W1 : ph < 19 ? W2 : W1;
          if (gap) c = ph < 12 ? W3 : W2;
          else if (edge < 3) c = ph < 9 ? W1 : W2;
          s.set(cx + dx, y, c);
        }
      }
    };
    const yLip = (f.top - ly0) * S;
    const yLedge = (f.ledge - ly0) * S;
    const yShore = (SHORE - ly0) * S;
    tier(X(f.w / 2), yLip, yLedge, seed);
    tier(X(f.w2 / 2), yLedge + 2, yShore + 2, seed + 9);
    // lábio e espuma do degrau
    for (let dx = -X(f.w / 2) - 1; dx <= X(f.w / 2); dx++) {
      if (h2(dx >> 1, fr, seed + 1) < 0.8) s.rect(cx + dx, yLip - 1, 1, 3, W0);
    }
    const puffs = (y: number, half: number, rmax: number, count: number, ps: number): void => {
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count - 0.5;
        const bob = Math.round(Math.sin(((fr + i * 1.7) / FALL_FRAMES) * Math.PI * 2) * 1.5);
        const r = Math.max(2, Math.round(rmax * (0.55 + 0.45 * h2(i, 1, ps)) * (1 - Math.abs(u) * 0.7)));
        const px = cx + u * 2 * half + (h2(i, 2, ps) - 0.5) * 6;
        s.ell(px, y + bob + 2, r + 2, r, W1);
        s.ell(px - 1, y + bob, r, r - 1, W0);
      }
    };
    puffs(yLedge, X(f.w2 / 2), 4, Math.max(3, Math.round(f.w2 / 6)), seed + 3);
    puffs(yShore - 3, X(f.w2 / 2) + 10, 8, Math.max(4, Math.round(f.w2 / 5)), seed + 4);
    // respingos pontilhados acima da névoa e ondas brancas na água
    for (let i = 0; i < f.w2 * 2; i++) {
      const px = cx + (h2(i, 5, seed) - 0.5) * (X(f.w2) + 30);
      const py = yShore - 6 - h2(i, 6, seed) * 22;
      if (h2(i, fr, seed + 6) < 0.5) s.rect(px, py, 2, 2, h2(i, 7, seed) < 0.5 ? W0 : W1);
    }
    for (let i = 0; i < f.w2; i++) {
      const ly = 1 + Math.floor(h2(i, 8, seed) * 8);
      const half = X(f.w2 / 2) + 22 - ly * 2;
      const px = cx + (h2(i, 9, seed) - 0.5) * 2 * half;
      if (mod(i + fr, 2) === 0) s.rect(px, yShore + ly * S, 4 + Math.floor(h2(i, 10, seed) * 8), 1, ly < 4 ? W0 : W1);
    }
    frames.push(s.canvas());
  }
  return { x: lx0, y: ly0, frames };
}

// ─── 5. rio ──────────────────────────────────────────────────────────────────

const P_R = 512;
const RIVER_TOP = 96;
const SPARK_FRAMES = 4;
const SPARK_H = 30;

function buildRiver(): Cv {
  const s = new Surf(P_R * S, LH);
  const cols = RIVER.map(hex);
  for (let y = Y(RIVER_TOP); y < s.h; y++) {
    const ly = y / S - TOPM;
    let i = 0;
    while (i < cols.length - 1 && ly >= (RIVER_STOPS[i + 1] as number)) i++;
    const a = RIVER_STOPS[i] as number;
    const b = RIVER_STOPS[i + 1] as number;
    const p = i < cols.length - 1 ? ((ly - a) / (b - a) - 0.4) / 0.6 : 0;
    for (let x = 0; x < s.w; x++) s.d[y * s.w + x] = p > bayer(x >> 1, y >> 1) ? (cols[i + 1] as number) : (cols[i] as number);
  }
  const rnd = mulberry32(61);
  // reflexos esverdeados da margem distante, perto do topo
  for (let i = 0; i < 260; i++) {
    const ly = SHORE + 1 + rnd() * rnd() * 12;
    s.rect(Math.floor(rnd() * s.w), Y(ly), 6 + Math.floor(rnd() * 22), 1, RIV_REFL);
  }
  // ondulações claras e escuras
  for (let i = 0; i < 300; i++) {
    const ly = SHORE + 2 + rnd() * 28;
    const w = 6 + Math.floor(rnd() * (10 + (ly - SHORE)));
    s.rect(Math.floor(rnd() * s.w), Y(ly), w, 1, rnd() < 0.55 ? RIV_GLINT : RIV_DARK);
  }
  return s.canvas();
}

function buildSparkles(frame: number): Cv {
  const s = new Surf(P_R * S, SPARK_H * S);
  const rnd = mulberry32(62);
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * s.w);
    const y = Math.floor((0.08 + rnd() * 0.9) * s.h);
    const ph = Math.floor(rnd() * SPARK_FRAMES);
    const w = 4 + Math.floor(rnd() * 8);
    const d = mod(frame - ph, SPARK_FRAMES);
    if (d === 0) {
      s.rect(x, y, w, 2, W0);
    } else if (d === 1) {
      s.rect(x + 1, y, Math.max(2, w - 3), 1, RIV_GLINT);
    }
  }
  return s.canvas();
}

/** Canoa escavada vazia (tons apagados para não parecer objeto de jogo). */
function buildCanoe(): Cv {
  const w = 34 * S;
  const h = 9 * S;
  const s = new Surf(w, h, false);
  const body = hex('#77665a');
  const rim = hex('#958475');
  const dark = hex('#5c504c');
  for (let x = 0; x < w; x++) {
    const u = (x / (w - 1)) * 2 - 1;
    const sheer = Math.round(u * u * 5); // pontas levantadas
    const top = 7 - sheer;
    const bot = 13 - Math.round(u * u * u * u * 6);
    if (Math.abs(u) > 0.97) continue;
    for (let y = top; y <= bot; y++) s.set(x, y, y < top + 2 ? rim : y > bot - 2 ? dark : body);
    if (Math.abs(u) < 0.8) s.set(x, top + 2, dark);
    // sombra/reflexo na água
    if (h2(x >> 2, 0, 5) < 0.75) s.set(x, 15, RIV_DARK);
    if (Math.abs(u) < 0.7 && h2(x >> 2, 1, 5) < 0.5) s.set(x, 17, RIV_DARK);
  }
  return s.canvas();
}

// ─── 6. mata média: moitas, palmeiras, bananeiras, árvore grande ─────────────

const P_M = 960;

function palm(s: Surf, x: number, baseY: number, topY: number, lean: number, seed: number): void {
  const h = baseY - topY;
  let tx = x;
  for (let i = 0; i <= h; i++) {
    const t = i / h;
    tx = Math.round(x + lean * t * t);
    const hw = t < 0.15 ? 3 : 2;
    const y = baseY - i;
    s.row(tx - hw, tx + hw, y, TRUNK);
    s.set(tx - hw, y, TRUNK_L);
    s.set(tx - hw + 1, y, TRUNK_L);
    s.set(tx + hw, y, TRUNK_S);
    if (i % 7 === 3) s.row(tx - hw + 1, tx + hw, y, TRUNK_S);
  }
  const [l, b, sh] = P_MID_PALM;
  const L = 34 + h2(seed, 1, 3) * 12;
  const N = 11;
  const order = [0, 10, 2, 8, 4, 6, 1, 9, 3, 7, 5];
  for (const [oi, k] of order.entries()) {
    const back = oi < 6;
    const ang = -Math.PI * (0.03 + (0.94 * k) / (N - 1)) + (h2(seed, k, 7) - 0.5) * 0.18;
    const len = L * (0.78 + 0.3 * h2(seed, k, 8));
    const droop = len * (0.5 + 0.55 * Math.abs(Math.cos(ang)));
    const rib = back ? b : l;
    const leaf = back ? sh : b;
    const steps = Math.ceil(len * 1.4);
    for (let i = 2; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(tx + Math.cos(ang) * len * t);
      const py = Math.round(topY + Math.sin(ang) * len * t + droop * t * t);
      const ll = Math.round((5 + L * 0.2) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.6);
      if (i % 2 === 0) for (let j = 1; j <= ll; j++) s.set(px, py + j, i % 4 === 0 ? leaf : back ? leaf : l === rib && j > ll * 0.6 ? sh : leaf);
      s.set(px, py, rib);
      s.set(px, py - 1, rib);
    }
  }
  s.disc(tx, topY, 3, b);
  s.disc(tx - 1, topY - 1, 2, l);
}

/** Folha larga (bananeira): lâmina ao longo de uma nervura curva, metade clara, metade corpo. */
function bigLeaf(s: Surf, x0: number, y0: number, ang: number, len: number, wid: number, droop: number, p: Pal, seed: number): void {
  const steps = Math.ceil(len * 2);
  let ppx = x0;
  let ppy = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + Math.cos(ang) * len * t;
    const py = y0 + Math.sin(ang) * len * t + droop * t * t;
    const dx = px - ppx;
    const dy = py - ppy;
    const dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl;
    const ny = dx / dl;
    const hw = wid * Math.sin(Math.PI * t ** 0.75) ** 0.7;
    const notch = h2(Math.floor(t * 9), 1, seed) < 0.28 && t > 0.25;
    for (let k = -hw; k <= hw; k += 0.5) {
      const upper = ny * k < 0 || (ny === 0 && k < 0);
      let c = upper ? p[0] : p[1];
      if (Math.abs(k) > hw - 1.2) c = upper ? p[1] : p[2];
      if (notch && !upper && Math.abs(k) > hw * 0.35) c = p[2];
      s.set(Math.round(px + nx * k), Math.round(py + ny * k), c);
    }
    s.set(Math.round(px), Math.round(py), p[2]);
    ppx = px;
    ppy = py;
  }
}

function banana(s: Surf, x: number, baseY: number, size: number, p: Pal, seed: number): void {
  const n = 6;
  const order = [0, 5, 1, 4, 2, 3];
  for (const k of order) {
    const ang = -Math.PI * (0.14 + (0.72 * k) / (n - 1)) + (h2(seed, k, 1) - 0.5) * 0.2;
    const len = size * (0.75 + 0.35 * h2(seed, k, 2)) * (0.8 + 0.2 * Math.abs(Math.sin(ang)));
    const droop = len * (0.25 + 0.5 * Math.abs(Math.cos(ang)));
    bigLeaf(s, x + (k - 2.5) * 1.5, baseY, ang, len, size * 0.17, droop, p, seed * 13 + k);
  }
}

/** Galho/tronco grosso ao longo de uma polilinha, com luz à esquerda/acima. */
function limb(s: Surf, pts: readonly (readonly [number, number])[], r0: number, r1: number, p: Pal): void {
  const passes: readonly [number, number, number, number][] = [
    [1, 0, 0, p[2]],
    [0.78, -0.22, -0.1, p[1]],
    [0.3, -0.58, -0.3, p[0]],
  ];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as readonly [number, number];
    const b = pts[i] as readonly [number, number];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  for (const [kr, ox, oy, c] of passes) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as readonly [number, number];
      const b = pts[i] as readonly [number, number];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(len);
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const r = r0 + (r1 - r0) * ((acc + len * t) / total);
        s.disc(a[0] + (b[0] - a[0]) * t + ox * r, a[1] + (b[1] - a[1]) * t + oy * r, Math.max(1, Math.round(r * kr)), c);
      }
      acc += len;
    }
  }
}

/** Folhinha pontuda de cipó, para a esquerda (dir=-1) ou direita (dir=1). */
function vineLeaf(s: Surf, x: number, y: number, dir: number, c: number, cl: number): void {
  for (let i = 1; i <= 4; i++) s.set(x + dir * i, y, c);
  for (let i = 2; i <= 5; i++) s.set(x + dir * i, y + 1, c);
  s.set(x + dir * 2, y - 1, cl);
  s.set(x + dir * 3, y - 1, cl);
  s.set(x + dir * 4, y + 2, c);
}

/** Cipó pendurado estático (para a árvore grande). */
function hangVine(s: Surf, x: number, y0: number, len: number, seed: number, c: number, cl: number): void {
  for (let i = 0; i < len; i++) {
    const xx = Math.round(x + Math.sin(i * 0.07 + seed) * 2);
    s.rect(xx, y0 + i, 2, 1, c);
    if (i > 6 && i % 5 === 2 && h2(i, 1, seed * 7) < 0.4) vineLeaf(s, xx + (i % 2), y0 + i, h2(i, 2, seed * 7) < 0.5 ? -1 : 1, cl, cl);
  }
  s.rect(x, y0 + len, 2, 3, cl);
}

/** Árvore grande que emoldura a cena: tronco e galhos escuros (apagados), copa no topo, cipós. */
function bigTree(s: Surf, lx: number): void {
  const x = X(lx);
  const bark = P_BIG_BARK;
  const yb = Y(VIEW_H + BOTM);
  const fork: readonly [number, number] = [x - 8, Y(50)];
  const lj: readonly [number, number] = [x - 58, Y(28)];
  const rj: readonly [number, number] = [x + 36, Y(30)];
  // sapopemas
  limb(s, [[x - 6, Y(112)], [x - 26, Y(132)], [x - 44, Y(150)]], 9, 6, bark);
  limb(s, [[x + 8, Y(114)], [x + 28, Y(134)], [x + 40, Y(150)]], 9, 6, bark);
  // galhos
  limb(s, [fork, lj, [x - 122, Y(14)], [x - 184, Y(10)]], 10, 3, bark);
  limb(s, [fork, rj, [x + 102, Y(16)], [x + 166, Y(18)]], 10, 3, bark);
  limb(s, [lj, [x - 78, Y(4)], [x - 92, Y(-14)]], 6, 3, bark);
  limb(s, [rj, [x + 48, Y(4)], [x + 46, Y(-14)]], 7, 4, bark);
  // tronco levemente sinuoso
  limb(s, [[x + 4, yb], [x + 2, Y(140)], [x - 3, Y(100)], [x - 7, Y(70)], fork], 18, 12, bark);
  // textura de casca
  for (let i = 0; i < 110; i++) {
    const py = Y(52 + h2(i, 1, 8) * 150);
    const px = x - 14 + Math.floor(h2(i, 2, 8) * 26);
    if (s.get(px, py) === bark[1] && s.get(px, py + 8) === bark[1]) s.rect(px, py, 2, 4 + Math.floor(h2(i, 3, 8) * 8), bark[2]);
  }
  // cipós pendurados dos galhos
  const vines: readonly [number, number, number][] = [
    [-166, 12, 30], [-136, 14, 52], [-108, 16, 26], [-76, 26, 62], [-40, 40, 34],
    [52, 28, 46], [84, 20, 68], [118, 18, 30], [146, 20, 42],
  ];
  for (const [i, [dx, ly, len]] of vines.entries()) hangVine(s, x + dx, Y(ly), len * S, i * 3.1, P_BIG_LEAF[2], P_BIG_LEAF[1]);
  // copa (em camadas, do fundo para a frente)
  const crowns: readonly [number, number, number][] = [
    [-204, 4, 34], [-152, -4, 46], [-98, -12, 52], [-40, -6, 48], [22, -14, 54], [86, -4, 48], [152, 6, 40],
    [-178, 14, 30], [-120, 8, 38], [-58, 13, 32], [60, 9, 40], [126, 13, 34], [178, 19, 26],
  ];
  for (const [i, [dx, ly, rx]] of crowns.entries()) lobe(s, x + dx, Y(ly), rx, rx * 0.4, P_BIG_LEAF, 7000 + i);
}

/** Árvore de copa cheia em camadas (plano médio): tronco com volume e 5 lóbulos. */
function tree(s: Surf, x: number, baseY: number, topY: number, rx: number, p: Pal, seed: number): void {
  const ry = Math.max(4, Math.round(rx * 0.34));
  const cy = topY + ry;
  const forkY = Math.min(baseY, cy + Math.round(rx * 0.85));
  for (let y = forkY; y <= baseY; y++) {
    s.row(x - 2, x + 2, y, TRUNK);
    s.set(x - 2, y, TRUNK_L);
    s.set(x + 2, y, TRUNK_S);
  }
  s.line(x, forkY, x - rx * 0.62, cy + ry, 3, TRUNK_S);
  s.line(x, forkY, x + rx * 0.64, cy + ry * 0.9, 3, TRUNK_S);
  s.line(x, forkY, x + rx * 0.1, cy, 3, TRUNK);
  lobe(s, x - rx * 0.78, cy + ry * 1.3, rx * 0.5, ry * 0.75, p, seed + 1);
  lobe(s, x + rx * 0.82, cy + ry * 1.15, rx * 0.48, ry * 0.7, p, seed + 2);
  lobe(s, x - rx * 0.36, cy + ry * 0.6, rx * 0.6, ry * 0.85, p, seed + 3);
  lobe(s, x + rx * 0.42, cy + ry * 0.5, rx * 0.56, ry * 0.8, p, seed + 4);
  lobe(s, x + rx * 0.04, cy, rx * 0.8, ry, p, seed);
}

function buildMid(): Cv {
  const s = new Surf(P_M * S, LH);
  const rnd = mulberry32(81);
  const bn = pnoise(mulberry32(82), 13, P_M, 3);
  const bn2 = pnoise(mulberry32(83), 47, P_M, 2);
  const bush = (lx: number): number => 135 + bn(lx) + bn2(lx);
  const TREE_X = 700;
  const nearTree = (lx: number, d: number): boolean => Math.abs(mod(lx - TREE_X + P_M / 2, P_M) - P_M / 2) < d;

  // árvores de copa em camadas, em grupos, deixando vãos largos para ver o rio e as quedas
  const groups = 5;
  for (let g = 0; g < groups; g++) {
    const gx = (g + 0.15 + rnd() * 0.5) * (P_M / groups);
    const count = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const lx = gx + (i - (count - 1) / 2) * (24 + rnd() * 12);
      const top = 88 + rnd() * 24;
      tree(s, X(lx), Y(bush(lx) + 4), Y(top), 26 + rnd() * 18, P_MID_BACK, 4000 + g * 10 + i);
    }
    // sub-bosque escondendo os pés dos troncos
    for (let i = 0; i < count * 2; i++) {
      const lx = gx + (rnd() - 0.5) * count * 34;
      const rx = 14 + rnd() * 14;
      lobe(s, X(lx), Y(bush(lx) - 5 - rnd() * 7), rx, rx * 0.42, P_MID_BACK, 4500 + g * 10 + i);
    }
  }
  // palmeiras altas
  const palms = 8;
  for (let i = 0; i < palms; i++) {
    const lx = (i + 0.2 + rnd() * 0.6) * (P_M / palms);
    if (nearTree(lx, 40)) continue;
    const top = 40 + rnd() * 36;
    const lean = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 14);
    palm(s, X(lx), Y(bush(lx) + 6), Y(top), lean, 300 + i);
  }
  // árvore grande
  bigTree(s, TREE_X);
  // bananeiras de trás
  for (let i = 0; i < 7; i++) {
    const lx = (i + 0.1 + rnd() * 0.8) * (P_M / 7);
    banana(s, X(lx), Y(bush(lx) + 5), 30 + rnd() * 14, P_MID_BACK, 600 + i);
  }
  // moitas + base sólida
  for (let x = 0; x < s.w; x++) {
    for (let y = Y(bush(x / S)) + 4; y < s.h; y++) s.d[y * s.w + x] = P_MID_FRONT[1];
  }
  for (let r = 0; r < 6; r++) {
    const n = 56;
    for (let i = 0; i < n; i++) {
      const lx = (i + rnd()) * (P_M / n);
      const rx = 16 + rnd() * 22;
      lobe(s, X(lx), Y(bush(lx) + 1 + r * 8) + Math.round(rnd() * 6), rx, rx * 0.42, r < 2 ? P_MID_FRONT : P_MID_DEEP, 5000 + r * 100 + i);
    }
    if (r === 1) {
      // bananeiras/folhas largas da frente, entre as fileiras de moitas
      for (let i = 0; i < 8; i++) {
        const lx = (i + 0.2 + rnd() * 0.6) * (P_M / 8);
        banana(s, X(lx), Y(bush(lx) + 12), 36 + rnd() * 18, P_MID_PALM, 650 + i);
      }
    }
  }
  // escurece suavemente para baixo (fundo de buracos/abismos)
  hazeDown(s, Y(176), Y(200), P_MID_BASE, 1);
  for (let y = Y(200); y < s.h; y++) for (let x = 0; x < s.w; x++) s.d[y * s.w + x] = P_MID_BASE;
  return s.canvas();
}

// ─── 7. moldura: folhagem e cipós pendendo do topo ───────────────────────────

const P_F = 704;
const VINE_FRAMES = 6;
const FRAME_H = (TOPM + 84) * S;

function buildFrame(): Cv[] {
  const base = new Surf(P_F * S, FRAME_H);
  const rnd = mulberry32(101);
  const rn = pnoise(mulberry32(102), 9, P_F, 4);
  const roof = (lx: number): number => 3 + rn(lx);
  for (let x = 0; x < base.w; x++) {
    const bot = Y(roof(x / S));
    for (let y = 0; y < bot; y++) base.d[y * base.w + x] = P_ROOF[2];
  }
  for (let r = 0; r < 2; r++) {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const lx = (i + rnd()) * (P_F / n);
      const rx = 16 + rnd() * 22;
      // lóbulos virados para baixo não existem: usamos domos sobrepostos em duas fileiras
      lobe(base, X(lx), Y(roof(lx) - 5 + r * 5) + Math.round(rnd() * 4), rx, rx * 0.4, P_ROOF, 8000 + r * 100 + i);
    }
  }
  // pencas de folhas pendentes
  for (let i = 0; i < 46; i++) {
    const lx = (i + rnd()) * (P_F / 46);
    const y0 = Y(roof(lx) + 3);
    const len = 4 + Math.floor(rnd() * 12);
    base.rect(X(lx), y0, 2, len, P_ROOF[2]);
    base.ell(X(lx) + 1, y0 + len, 3, 2, P_ROOF[1]);
    base.ell(X(lx), y0 + len - 1, 2, 1, P_ROOF[0]);
  }
  // lianas em arco (estáticas)
  const swags = 6;
  const swagDefs: { x0: number; x1: number; depth: number }[] = [];
  for (let i = 0; i < swags; i++) {
    const a = (i + 0.1 + rnd() * 0.5) * (P_F / swags);
    swagDefs.push({ x0: a, x1: a + 30 + rnd() * 40, depth: 12 + rnd() * 16 });
  }
  for (const sw of swagDefs) {
    const xa = X(sw.x0);
    const xb = X(sw.x1);
    const mid = (xa + xb) / 2;
    const half = (xb - xa) / 2;
    for (let x = xa; x <= xb; x++) {
      const u = (x - mid) / half;
      const y = Y(2) + Math.round(sw.depth * S * (1 - u * u));
      base.rect(x, y, 1, 2, VINE);
      if (h2(x, 3, 12) < 0.09) base.rect(x, y + 2, 1, 3 + Math.floor(h2(x, 4, 12) * 4), h2(x, 5, 12) < 0.5 ? VINE_L : P_ROOF[1]);
    }
  }

  // cipós verticais com balanço
  interface VineDef {
    x: number;
    len: number;
    ph: number;
    amp: number;
    leafy: boolean;
  }
  const defs: VineDef[] = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    defs.push({
      x: X((i + 0.15 + rnd() * 0.7) * (P_F / n)),
      len: Math.round((16 + rnd() * rnd() * 44) * S),
      ph: rnd() * Math.PI * 2,
      amp: 1.5 + rnd() * 2.5,
      leafy: rnd() < 0.7,
    });
  }
  const frames: Cv[] = [];
  for (let f = 0; f < VINE_FRAMES; f++) {
    const s = new Surf(base.w, base.h);
    s.d.set(base.d);
    const a = (f / VINE_FRAMES) * Math.PI * 2;
    for (const [vi, v] of defs.entries()) {
      const y0 = Y(2);
      let lastX = v.x;
      for (let i = 0; i < v.len; i++) {
        const t = i / v.len;
        const xx = Math.round(v.x + Math.sin(a + v.ph) * v.amp * t * t + Math.sin(i * 0.05 + v.ph) * 2 * t);
        lastX = xx;
        if (s.get(xx, y0 + i) === 0 || i > 12) s.rect(xx, y0 + i, 2, 1, i % 9 < 5 ? VINE : P_ROOF[1]);
        if (v.leafy && i > 14 && i % 5 === 2 && h2(i, vi, 4) < 0.45) {
          const left = h2(i, vi, 5) < 0.5;
          vineLeaf(s, xx + (left ? 0 : 1), y0 + i, left ? -1 : 1, P_ROOF[1], VINE_L);
        }
      }
      vineLeaf(s, lastX, y0 + v.len, -1, P_ROOF[1], VINE_L);
      vineLeaf(s, lastX + 1, y0 + v.len + 2, 1, P_ROOF[1], VINE_L);
      s.rect(lastX, y0 + v.len, 2, 5, VINE_L);
    }
    frames.push(s.canvas());
  }
  return frames;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/** Desenha uma camada 2× tileada. `off` e `y` em px lógicos (múltiplos de 1/S). */
function tile(ctx: Ctx, img: Cv, period: number, off: number, y: number): void {
  const x = -mod(off, period);
  const w = img.width / S;
  const h = img.height / S;
  ctx.drawImage(img, x, y, w, h);
  if (x + period < VIEW_W) ctx.drawImage(img, x + period, y, w, h);
}

function sprite(ctx: Ctx, img: Cv, period: number, off: number, lx: number, y: number): void {
  const w = img.width / S;
  const h = img.height / S;
  let x = mod(lx - off, period);
  if (x + w > period) x -= period;
  if (x < VIEW_W && x + w > 0) ctx.drawImage(img, x, y, w, h);
  x += period;
  if (x < VIEW_W) ctx.drawImage(img, x, y, w, h);
}

const snap = (v: number): number => Math.floor(v * S) / S;

export function createAmazonBackground(): Background {
  const sky = buildSky();
  const sun = [buildSun(0), buildSun(1)];
  const farA = buildFarA();
  const farB = buildFarB();
  const river = buildRiver();
  const sparkles = Array.from({ length: SPARK_FRAMES }, (_, f) => buildSparkles(f));
  const canoe = buildCanoe();
  const cliffs = buildCliffs();
  const falls: Sprite[] = [];
  CLIFFS.forEach((c, ci) => c.falls.forEach((f, fi) => falls.push(buildFall(f, 200 + ci * 10 + fi))));
  const mid = buildMid();
  const frame = buildFrame();

  return {
    draw(ctx, camX, camY, time) {
      const up = BASE_CAM_Y - camY; // quanto a câmera subiu em relação à composição base
      const dy = (f: number): number => snap(up * f * 0.5);

      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
      ctx.drawImage(sun[mod(Math.floor(time / 0.5), 2)] as Cv, SUN_CX - SUN_SIZE / 2, SUN_CY - SUN_SIZE / 2 + dy(0.02), SUN_SIZE, SUN_SIZE);

      tile(ctx, farA, P_A, snap(camX * 0.05), dy(0.05) - TOPM);
      tile(ctx, farB, P_B, snap(camX * 0.1), dy(0.1) - TOPM);

      const oR = snap(camX * 0.28);
      const yR = dy(0.2);
      tile(ctx, river, P_R, oR, yR - TOPM);
      tile(ctx, sparkles[mod(Math.floor(time * 4), SPARK_FRAMES)] as Cv, P_R, oR, yR + SHORE + 1);
      sprite(ctx, canoe, P_R, oR - snap(time * 3), 300, yR + 113 + (mod(Math.floor(time * 1.5), 2) === 0 ? 0 : 0.5));

      const oC = snap(camX * 0.2);
      const yC = dy(0.2);
      tile(ctx, cliffs, P_C, oC, yC - TOPM);
      const ff = mod(Math.floor(time * 10), FALL_FRAMES);
      for (const f of falls) sprite(ctx, f.frames[ff] as Cv, P_C, oC, f.x, yC + f.y);

      tile(ctx, mid, P_M, snap(camX * 0.42), dy(0.42) - TOPM);
      tile(ctx, frame[mod(Math.floor(time * 5), VINE_FRAMES)] as Cv, P_F, snap(camX * 0.62), dy(0.25) - TOPM);
    },
  };
}
