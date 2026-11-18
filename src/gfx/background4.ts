import type { Background } from '../core/types';
import { VIEW_H, VIEW_W } from '../core/constants';

/*
 * Parallax da Fase 4 — "Favela do Rio (Do Morro ao Tribunal)".
 *
 * 100% Canvas 2D puro (sem assets externos): as camadas estáticas são pré-renderizadas uma única
 * vez em buffers Uint32 de alta resolução 2× (S = 2, mapeamento 1:1 com RENDER_SCALE = 2) e
 * desenhadas via drawImage; elementos vivos (pipas com rabiolas bailando, bondinho do Pão de
 * Açúcar, reflexos solares na Baía de Guanabara e par de tênis balançando nos fios de alta tensão)
 * são animados em tempo real a cada quadro.
 */

const S = 2;
/** Margens verticais lógicas para absorver o deslocamento de câmera sem descobrir bordas. */
const TOPM = 20;
const BOTM = 36;
const LH = (TOPM + VIEW_H + BOTM) * S;
/** camY de referência quando o Pardo está no chão-base (mapa de 14 linhas: 224 - 180 = 44). */
const BASE_CAM_Y = 44;

const SUN_CX = 258;
const SUN_CY = 37;
const SUN_SIZE = 84;
const SUN_FRAMES = 4;

const P_CLOUDS = 512;
const P_HOR = 420;
const P_FAV_FAR = 512;
const P_FAV_NEAR = 640;
const P_FG = 308;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

// ─── utilidades determinísticas ──────────────────────────────────────────────

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function wrapDelta(d: number, period: number): number {
  const m = mod(d, period);
  return m > period / 2 ? m - period : m;
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

function ri(rnd: Rnd, n: number): number {
  return Math.floor(rnd() * n);
}

/** Hash 2D determinístico em [0, 1). */
function h2(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x: number, y: number): number {
  return ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}

/** Converte '#rrggbb' em pixel Uint32 ABGR (little-endian). */
function hex(h: string): number {
  const n = Number.parseInt(h.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** Ruído 1D periódico suavizado. */
function pnoise(rnd: Rnd, n: number, period: number, amp: number): (x: number) => number {
  const v = Array.from({ length: n }, () => (rnd() * 2 - 1) * amp);
  return (x: number): number => {
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
const snap = (v: number): number => Math.round(v * S) / S;

/** Superfície de pixels 2× com wrap horizontal automático para tileamento sem emendas. */
class Surf {
  readonly w: number;
  readonly h: number;
  readonly wrap: boolean;
  readonly d: Uint32Array;
  constructor(w: number, h: number, wrap = true) {
    this.w = w;
    this.h = h;
    this.wrap = wrap;
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
    return this.d[y * this.w + x] ?? 0;
  }
  row(x0: number, x1: number, y: number, c: number): void {
    const a = Math.round(x0);
    const b = Math.round(x1);
    for (let x = a; x <= b; x++) this.set(x, y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const wi = Math.round(w);
    const hi = Math.round(h);
    for (let j = 0; j < hi; j++) {
      for (let i = 0; i < wi; i++) this.set(x0 + i, y0 + j, c);
    }
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: number): void {
    const ox = Math.round(cx);
    const oy = Math.round(cy);
    const rxi = Math.max(1, Math.round(rx));
    const ryi = Math.max(1, Math.round(ry));
    for (let dy = -ryi; dy <= ryi; dy++) {
      const k = dy / (ryi + 0.35);
      const hw = Math.floor(rxi * Math.sqrt(Math.max(0, 1 - k * k)) + 0.35);
      for (let dx = -hw; dx <= hw; dx++) this.set(ox + dx, oy + dy, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: number): void {
    this.ell(cx, cy, r, r, c);
  }
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
    if (!ctx) throw new Error('Canvas 2D indisponível para o cenário do Rio');
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// ─── 1. Céu de 40°C, Sol Radiante e Nuvens Douradas ─────────────────────────

const SKY_HEX = [
  '#4ea5d9', // topo: azul-celeste carioca
  '#64b7e0', // azul tropical claro
  '#90d1d4', // transição turquesa-solar
  '#dce09e', // clarão quente
  '#ffd23f', // amarelo-ouro 40°C
  '#ffae33', // âmbar dourado
  '#ff8a2a', // laranja-sol de fim de tarde
  '#ee7b6e', // salmão quente
  '#c8769e', // salmão/lilás suave no horizonte
  '#8c5884', // crepúsculo baixo (atrás da baía/morros)
  '#3b222c', // base sólida
] as const;

const SKY_STOPS = [0, 19, 32, 44, 55, 70, 82, 94, 106, 122, 145, 220] as const;

function buildSky(): Cv {
  const s = new Surf(VIEW_W * S, VIEW_H * S, false);
  const cols = SKY_HEX.map(hex);
  for (let ly = 0; ly < VIEW_H; ly++) {
    let i = 0;
    while (i < cols.length - 1 && ly >= (SKY_STOPS[i + 1] ?? VIEW_H)) i++;
    const a = SKY_STOPS[i] ?? 0;
    const b = SKY_STOPS[i + 1] ?? VIEW_H;
    const t = (ly - a) / Math.max(1, b - a);
    const p = i < cols.length - 1 ? (t - 0.35) / 0.65 : 0;
    for (let lx = 0; lx < VIEW_W; lx++) {
      const c = p > bayer(lx, ly) ? (cols[i + 1] ?? cols[i] ?? 0) : (cols[i] ?? 0);
      s.rect(lx * S, ly * S, S, S, c);
    }
  }
  return s.canvas();
}

function buildSun(frame: number): Cv {
  const n = SUN_SIZE * S;
  const s = new Surf(n, n, false);
  const c = n / 2;
  const outerGlow = hex('#ffae33');
  const midGlow = hex('#ffd23f');
  const innerGlow = hex('#fff3a0');
  const rayCol = hex('#fff3a0');

  const pulse = Math.sin((frame / SUN_FRAMES) * Math.PI * 2);
  const rOuter = 31 + pulse * 3;
  const rMid = 21 + pulse * 2;

  // Halo pulsante dithered estilo 16-bit
  for (let y = 0; y < n; y += 2) {
    for (let x = 0; x < n; x += 2) {
      const d = Math.hypot(x + 1 - c, y + 1 - c) / S;
      const th = bayer(x >> 1, y >> 1);
      if (d > 13 && d < rMid) {
        const k = (rMid - d) / (rMid - 13);
        if (k * 0.85 > th) s.rect(x, y, 2, 2, d < 16.5 ? innerGlow : midGlow);
      } else if (d >= rMid && d < rOuter) {
        const k = (rOuter - d) / (rOuter - rMid);
        if (k * 0.45 > th) s.rect(x, y, 2, 2, outerGlow);
      }
    }
  }

  // Raios solares alternando alcance
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const cardinal = k % 2 === 0;
    const longRay = cardinal === (frame % 2 === 0);
    const r0 = 16 * S;
    const r1 = (longRay ? 26 + (frame === 1 ? 1 : 0) : 21) * S;
    for (let r = r0; r <= r1; r++) {
      const px = Math.round(c + Math.cos(ang) * r);
      const py = Math.round(c + Math.sin(ang) * r);
      s.rect(px - 1, py - 1, 2, 2, r > (r0 + r1) / 2 ? midGlow : rayCol);
    }
  }

  // Disco solar incandescente
  s.disc(c, c, 13 * S, hex('#ff9c2a'));
  s.disc(c, c - 1, 12 * S, hex('#ffd23f'));
  s.disc(c - 1, c - 2, 9 * S, hex('#ffe875'));
  s.disc(c - 2, c - 3, 5 * S, hex('#fff9d2'));
  return s.canvas();
}

function paintCloudBank(s: Surf, cx: number, cy: number, w: number, h: number, seed: number): void {
  const cTop = hex('#fff6b8');
  const cGold = hex('#ffd23f');
  const cPeach = hex('#ffa858');
  const cShade = hex('#d6809c');

  // Perfis assimétricos de cumulus de fim de tarde (sem repetição uniforme)
  const lobes: readonly [number, number, number, number][] = [
    [-0.36, 0.14, 0.22, 0.52],
    [-0.14, -0.06, 0.28, 0.88],
    [0.12, 0.02, 0.25, 0.74],
    [0.34, 0.16, 0.2, 0.48],
  ];

  // 1º passe: sombra suave inferior/traseira
  for (const [ox, oy, rw, rh] of lobes) {
    const jx = (h2(Math.round(ox * 100), 1, seed) - 0.5) * w * 0.06;
    const px = cx + ox * w + jx;
    const rx = Math.max(5, w * rw);
    const ry = Math.max(3, h * rh);
    const py = cy + oy * h;
    s.ell(px - 1, py + 2, rx, ry * 0.85, cShade);
  }
  const baseY = Math.round(cy + h * 0.34);
  s.rect(cx - w * 0.5, baseY - 1, w, 3, cShade);

  // 2º passe: corpo pêssego unificado
  for (const [ox, oy, rw, rh] of lobes) {
    const jx = (h2(Math.round(ox * 100), 1, seed) - 0.5) * w * 0.06;
    const px = cx + ox * w + jx;
    const rx = Math.max(5, w * rw);
    const ry = Math.max(3, h * rh);
    const py = cy + oy * h;
    s.ell(px, py, rx * 0.96, ry * 0.9, cPeach);
  }
  s.rect(cx - w * 0.46, baseY - 3, w * 0.92, 3, cPeach);

  // 3º passe: volume iluminado em amarelo-ouro e borda superior clara voltada para o sol
  for (const [ox, oy, rw, rh] of lobes) {
    const jx = (h2(Math.round(ox * 100), 1, seed) - 0.5) * w * 0.06;
    const px = cx + ox * w + jx;
    const rx = Math.max(4, w * rw * 0.84);
    const ry = Math.max(3, h * rh * 0.72);
    const py = cy + oy * h - 1.5;
    s.ell(px + 1, py, rx, ry, cGold);
    s.ell(px + 2, py - 1.5, rx * 0.68, ry * 0.48, cTop);
  }

  // Fiapos horizontais dithered nas pontas para dar leveza tropical
  for (let dx = -Math.round(w * 0.62); dx <= Math.round(w * 0.62); dx++) {
    const edge = Math.abs(dx) / (w * 0.62);
    if (edge > 0.68 && bayer(dx & 3, baseY & 3) < (1 - edge) * 2.8) {
      s.rect(cx + dx, baseY - 1, 1, 2, dx > 0 ? cGold : cPeach);
    }
  }
}

function buildClouds(): Cv {
  const ch = 76;
  const s = new Surf(P_CLOUDS * S, ch * S, true);
  const banks: readonly [number, number, number, number][] = [
    [48, 28, 52, 12],
    [138, 46, 40, 9],
    [212, 25, 46, 11],
    [318, 43, 48, 10],
    [406, 28, 54, 12],
    [478, 48, 38, 9],
  ];
  banks.forEach(([lx, ly, lw, lh], i) => {
    paintCloudBank(s, lx * S, ly * S, lw * S, lh * S, 700 + i * 17);
  });
  return s.canvas();
}

// ─── 2. Pipas no Céu com Rabiolas e Fitinhas ─────────────────────────────────

interface KiteDef {
  readonly x: number;
  readonly y: number;
  readonly main: string;
  readonly secondary: string;
  readonly fx: number;
  readonly fy: number;
  readonly ax: number;
  readonly ay: number;
  readonly ph: number;
}

const KITES: readonly KiteDef[] = [
  { x: 38, y: 36, main: '#e23b3b', secondary: '#ffd23f', fx: 1.7, fy: 2.3, ax: 4.5, ay: 2.4, ph: 0.3 },
  { x: 102, y: 47, main: '#ffd23f', secondary: '#ff8a2a', fx: 2.1, fy: 1.6, ax: 3.8, ay: 2.8, ph: 1.8 },
  { x: 166, y: 31, main: '#2ec4b6', secondary: '#ffffff', fx: 1.5, fy: 2.4, ax: 4.8, ay: 2.1, ph: 3.2 },
  { x: 224, y: 50, main: '#ff5ab4', secondary: '#fff3a0', fx: 1.9, fy: 2.0, ax: 4.1, ay: 2.6, ph: 4.6 },
  { x: 288, y: 42, main: '#2ec4b6', secondary: '#e23b3b', fx: 2.3, fy: 1.7, ax: 3.6, ay: 2.3, ph: 5.7 },
];

const RIBBON_COLS = ['#e23b3b', '#ffd23f', '#2ec4b6', '#ff5ab4', '#ffffff'] as const;

function drawKites(ctx: Ctx, camX: number, dySky: number, time: number): void {
  const period = VIEW_W;
  for (const [idx, k] of KITES.entries()) {
    const baseX = mod(k.x - camX * 0.06, period);
    const kx = snap(baseX + Math.sin(time * k.fx + k.ph) * k.ax);
    const ky = snap(k.y + dySky + Math.cos(time * k.fy + k.ph * 1.3) * k.ay);

    // Linha de pipa sutil descendo rumo às lajes do morro
    ctx.fillStyle = 'rgba(255,245,190,0.24)';
    for (let i = 1; i <= 14; i++) {
      const lx = snap(kx - i * 1.4);
      const ly = snap(ky + 1 + i * 2.1 + (i * i) * 0.03);
      ctx.fillRect(lx, ly, 0.5, 0.5);
    }

    // Rabiola curva bailando ao vento com fitinhas coloridas
    const tailSteps = 11;
    let prevX = kx;
    let prevY = ky + 3;
    for (let s = 1; s <= tailSteps; s++) {
      const wave = Math.sin(time * 4.4 + k.ph - s * 0.58) * (0.9 + s * 0.22);
      const tx = snap(kx + s * 0.55 + wave);
      const ty = snap(ky + 3 + s * 1.15);
      ctx.fillStyle = '#4a2c48';
      ctx.fillRect( snap((prevX + tx) * 0.5), snap((prevY + ty) * 0.5), 0.5, 0.5);
      ctx.fillRect(tx, ty, 0.5, 0.5);
      if (s % 2 === 0) {
        ctx.fillStyle = RIBBON_COLS[(idx + (s >> 1)) % RIBBON_COLS.length] ?? '#ffd23f';
        ctx.fillRect(tx - 1, ty, 1, 0.5);
        ctx.fillRect(tx + 0.5, ty, 1, 0.5);
      }
      prevX = tx;
      prevY = ty;
    }

    // Corpo da pipa em losango 16-bit (bicolor com vareta central)
    const tilt = Math.sin(time * k.fx + k.ph) > 0.35 ? 0.5 : Math.sin(time * k.fx + k.ph) < -0.35 ? -0.5 : 0;
    // Contorno escuro suave para destacar no céu claro
    ctx.fillStyle = '#3b2238';
    ctx.fillRect(kx - 0.5 + tilt, ky - 3.5, 1, 7);
    ctx.fillRect(kx - 3, ky - 0.5, 6, 1.5);
    ctx.fillRect(kx - 2, ky - 2, 4, 4);

    // Metade superior (cor principal) e metade inferior (cor secundária)
    ctx.fillStyle = k.main;
    ctx.fillRect(kx - 0.5 + tilt, ky - 3, 1, 1);
    ctx.fillRect(kx - 1.5, ky - 2, 3, 1);
    ctx.fillRect(kx - 2.5, ky - 1, 5, 1.5);

    ctx.fillStyle = k.secondary;
    ctx.fillRect(kx - 2, ky + 0.5, 4, 1);
    ctx.fillRect(kx - 1, ky + 1.5, 2, 1);
    ctx.fillRect(kx - 0.5 - tilt * 0.5, ky + 2.5, 1, 0.5);

    // Cruzeta / vareta iluminada
    ctx.fillStyle = '#fff7d6';
    ctx.fillRect(kx - 0.25, ky - 2.5, 0.5, 5);
    ctx.fillRect(kx - 2, ky - 0.5, 4, 0.5);
  }
}

// ─── 3. Horizonte Cartão-Postal (0.10x): Cristo, Pão de Açúcar e Baía ────────

/**
 * Cristo Redentor 2× (29×36 px reais), nas proporções da estátua real: braços retos na horizontal com
 * envergadura quase igual à altura (28 m × 30 m), cabeça levemente inclinada, mangas caindo junto ao
 * corpo, túnica esguia e pedestal quadrado de 8 m. Pedra-sabão clara iluminada pelo sol à direita.
 */
const CRISTO_BITMAP: readonly string[] = [
  '.............DML.............',
  '.............DML.............',
  '.............DMLL............',
  '.............DML.............',
  '..............M..............',
  '.LLLLLLLLLLLLMMLLLLLLLLLLLLL.',
  'DMMMMMMMMMMMMMMLMMMMMMMMMMMML',
  '.DDDMMMMMMMMMMMLMMMMMMMMMMMM.',
  '.....DDDDMMMMMMLMMMMMMML.....',
  '.........DDDMMMLMMML.........',
  '...........DDMMLML...........',
  '............DMMLL............',
  '............DMMLL............',
  '............DMMML............',
  '............DMMML............',
  '............DMLML............',
  '............DMLML............',
  '............DMLML............',
  '............DDMLL............',
  '............DDMLL............',
  '............DDMML............',
  '............DDMML............',
  '...........DDMMML............',
  '...........DDMLMLL...........',
  '...........DDMLMML...........',
  '...........DDMLMML...........',
  '...........DDMMLML...........',
  '...........DDMMLML...........',
  '...........DDMMMML...........',
  '..........qqqqqqppp..........',
  '...........QQQQqqp...........',
  '...........QQQQqqp...........',
  '...........QQQQqqp...........',
  '...........QQQQqqp...........',
  '..........QQQQQqqpp..........',
  '..........QQQQQqqpp..........',
];

const BAY_Y = 93;
const BAY_BOT = 134;

/** Pontos das estações do Bondinho (em px lógicos dentro de P_HOR = 420). */
const URCA_STA = { x: 207, y: 67.5 } as const;
const PAO_STA = { x: 251, y: 50.5 } as const;
const PRAIA_STA = { x: 180, y: 89.0 } as const;
const URCA_LOW_STA = { x: 199, y: 69.0 } as const;

function cableY(x0: number, y0: number, x1: number, y1: number, sag: number, u: number): { x: number; y: number } {
  return {
    x: x0 + (x1 - x0) * u,
    y: y0 + (y1 - y0) * u + sag * 4 * u * (1 - u),
  };
}

function buildHorizon(): Cv {
  const s = new Surf(P_HOR * S, LH, true);
  const rnd = mulberry32(4040);

  const mtnFarBody = hex('#5c4c7d');
  const mtnFarTop = hex('#886d94');
  const mtnDark = hex('#372c54');
  const mtnMid = hex('#4d3e6b');
  const mtnRock = hex('#7c5978');
  const mtnSun = hex('#c9887b');
  const mtnGold = hex('#f2b679');

  // 3.1 Cadeia montanhosa distante (Maciço da Tijuca / Serra dos Órgãos)
  const farNoise = pnoise(rnd, 24, P_HOR, 3.2);
  for (let xd = 0; xd < s.w; xd++) {
    const lx = xd / S;
    const baseWave = 86 + Math.sin((lx / P_HOR) * Math.PI * 4 + 0.6) * 4 + farNoise(lx);
    const top = Y(baseWave);
    const bot = Y(BAY_Y + 2);
    for (let y = top; y < bot; y++) {
      s.set(xd, y, y < top + 2 ? mtnFarTop : mtnFarBody);
    }
  }

  // 3.2 Pedra da Gávea (topo reto icônico em lx=342) e Morro Dois Irmãos (lx=388, 404)
  for (let xd = 0; xd < s.w; xd++) {
    const lx = xd / S;
    // Pedra da Gávea: mesa granítica
    const uGavea = wrapDelta(lx - 342, P_HOR) / 26;
    if (Math.abs(uGavea) <= 1) {
      const mesa = 1 - Math.pow(Math.abs(uGavea), 4.5);
      const top = Y(94 - 35 * Math.sqrt(Math.max(0, mesa)));
      for (let y = top; y < Y(BAY_Y + 2); y++) {
        const sunSide = uGavea < -0.15;
        s.set(xd, y, y < top + 2 ? mtnSun : sunSide ? mtnRock : mtnMid);
      }
    }
    // Dois Irmãos: dois picos triangulares inclinados
    for (const [cx, hw, hgt] of [
      [387, 16, 31],
      [403, 14, 26],
    ] as const) {
      const u = wrapDelta(lx - cx, P_HOR) / hw;
      if (Math.abs(u) <= 1) {
        const asym = u < 0 ? 1 + u * 0.88 : 1 - Math.pow(u, 0.85);
        const top = Y(94 - hgt * Math.max(0, asym));
        for (let y = top; y < Y(BAY_Y + 2); y++) {
          s.set(xd, y, y < top + 2 ? mtnSun : u < 0 ? mtnMid : mtnDark);
        }
      }
    }
  }

  // 3.3 Corcovado (lx = 74) + Cristo Redentor no alto do pico
  const corcCx = 74;
  for (let xd = 0; xd < s.w; xd++) {
    const lx = xd / S;
    const d = wrapDelta(lx - corcCx, P_HOR);
    if (d >= -56 && d <= 28) {
      // Encosta florestada suave à esquerda e paredão granítico abrupto à direita (voltado para o sol!)
      let rise = 0;
      if (d <= 0) {
        const u = Math.abs(d) / 56;
        rise = 49 * Math.pow(1 - u, 1.65);
      } else {
        const u = d / 28;
        rise = 49 * Math.pow(1 - u, 2.5);
      }
      const jitter = Math.sin(lx * 0.55) * 0.6;
      const top = Y(94 - rise + jitter);
      for (let y = top; y < Y(BAY_Y + 2); y++) {
        let c = mtnDark;
        if (y < top + 2) {
          c = d >= -2 ? mtnGold : mtnRock;
        } else if (d > 1) {
          // Face granítica iluminada pelo sol da tarde
          c = d > 6 && (y - top) < 42 ? mtnSun : mtnRock;
        } else if (d > -10 && (y + xd) % 3 === 0) {
          c = mtnMid;
        }
        s.set(xd, y, c);
      }
    }
  }

  // Estátua do Cristo Redentor no topo do Corcovado
  const cristoMap: Record<string, number> = {
    L: hex('#fff7e6'), // pedra-sabão ao sol
    M: hex('#c9bfc9'), // pedra-sabão à meia-luz
    D: hex('#8e7f9e'), // lado na sombra (lilás do entardecer)
    p: mtnSun, // pedestal: face iluminada
    q: mtnMid,
    Q: mtnDark,
  };
  const cristoX0 = X(corcCx) - 14;
  const cristoY0 = Y(45) - CRISTO_BITMAP.length + 2;
  CRISTO_BITMAP.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch && ch !== '.') {
        const colVal = cristoMap[ch];
        if (colVal !== undefined) s.set(cristoX0 + rx, cristoY0 + ry, colVal);
      }
    }
  });

  // 3.4 Faixa da Baía de Guanabara / Mar do Rio (#1b4965 / #0d3b66)
  const seaEdge = hex('#2a6a8c');
  const seaTop = hex('#1b4965');
  const seaMid = hex('#144266');
  const seaDeep = hex('#0d3b66');
  const horizonGlow = hex('#e89a68');

  for (let y = Y(BAY_Y); y < Y(BAY_BOT); y++) {
    const ly = y / S - TOPM;
    const t = (ly - BAY_Y) / (BAY_BOT - BAY_Y);
    for (let xd = 0; xd < s.w; xd++) {
      let c = seaTop;
      if (ly < BAY_Y + 1) {
        c = bayer(xd >> 1, y >> 1) < 0.45 ? horizonGlow : seaEdge;
      } else if (ly < BAY_Y + 2.5) {
        c = seaEdge;
      } else if (t < 0.45) {
        c = (t / 0.45) * 0.6 > bayer(xd >> 1, y >> 1) ? seaMid : seaTop;
      } else {
        const p = (t - 0.45) / 0.55;
        c = p > bayer(xd >> 1, y >> 1) ? seaDeep : seaMid;
      }
      s.set(xd, y, c);
    }
  }

  // Pequenos veleiros brancos na Baía de Guanabara
  const sailCol = hex('#fff3d6');
  const sailShade = hex('#d4a89a');
  const hullCol = hex('#26203b');
  for (const [bx, by, big] of [
    [152, 98, true],
    [170, 103, false],
    [296, 100, true],
    [322, 105, false],
  ] as const) {
    const sx = X(bx);
    const sy = Y(by);
    const sh = big ? 9 : 6;
    s.rect(sx - (big ? 4 : 3), sy, big ? 9 : 7, 2, hullCol);
    for (let j = 0; j < sh; j++) {
      const wSail = Math.max(1, Math.round(((sh - j) / sh) * (big ? 5 : 3.5)));
      s.rect(sx, sy - 1 - j, wSail, 1, j < 2 ? sailShade : sailCol);
    }
  }

  // 3.5 Morro da Urca (lx = 204) e Pão de Açúcar (lx = 256) emergindo da Baía
  const sandBeach = hex('#e0b07e');
  const mtnForest = hex('#32425c');
  for (let xd = 0; xd < s.w; xd++) {
    const lx = xd / S;

    // Morro da Urca (domo largo e mais baixo à esquerda, com vegetação e face rochosa curva)
    const dUrca = wrapDelta(lx - 204, P_HOR);
    if (Math.abs(dUrca) <= 25) {
      const u = dUrca / 25;
      const dome = Math.sqrt(Math.max(0, 1 - u * u));
      const top = Y(96.5 - 28 * Math.pow(dome, 1.15));
      const bot = Y(97);
      for (let y = top; y < bot; y++) {
        const dyTop = (y - top) / Math.max(1, bot - top);
        const ridgeX = 2 + Math.sin(y * 0.14) * 2.5 - dyTop * 5;
        const lit = dUrca - ridgeX;
        let c = mtnDark;
        if (y < top + 2) {
          c = dUrca > -4 ? mtnGold : mtnSun;
        } else if (dyTop > 0.72 && dUrca < 8 && bayer(xd & 3, y & 3) < 0.7) {
          c = mtnForest;
        } else if (lit > 3.5) {
          c = bayer(xd & 3, y & 3) < 0.3 ? mtnRock : mtnSun;
        } else if (lit > -2) {
          c = (lit + 2) / 5.5 > bayer(xd & 3, y & 3) ? mtnRock : mtnMid;
        } else if (lit > -8 && bayer(xd & 3, y & 3) < 0.35) {
          c = mtnMid;
        }
        s.set(xd, y, c);
      }
      if (Math.abs(dUrca) < 21) s.set(xd, bot, sandBeach);
    }

    // Sela costeira baixa unindo Urca ao Pão de Açúcar
    const dSaddle = wrapDelta(lx - 230, P_HOR);
    if (Math.abs(dSaddle) <= 10) {
      const topS = Y(96.5 - 7 * (1 - (dSaddle / 10) * (dSaddle / 10)));
      for (let y = topS; y < Y(97.2); y++) {
        s.set(xd, y, y < topS + 3 ? mtnForest : mtnDark);
      }
    }

    // Pão de Açúcar (monólito granítico íngreme e icônico à direita, escultura 3D dithered)
    const dPao = wrapDelta(lx - 256, P_HOR);
    if (dPao >= -22 && dPao <= 24) {
      const u = dPao < 0 ? Math.abs(dPao) / 22 : dPao / 24;
      const shape = Math.sqrt(Math.max(0, 1 - Math.pow(u, dPao < 0 ? 1.85 : 2.25)));
      const top = Y(97.5 - 46.5 * shape);
      const bot = Y(98);
      for (let y = top; y < bot; y++) {
        const dyTop = (y - top) / Math.max(1, bot - top);
        // Crista de luz curvando naturalmente pelo paredão de granito + fissuras diagonais
        const ridgeCurve = 1.5 - dyTop * 6.5 + Math.sin(y * 0.11 + dPao * 0.18) * 2.2;
        const lit = dPao - ridgeCurve;
        const fissure = ((xd + (y >> 1)) % 13 === 0) && dyTop > 0.18 && dyTop < 0.85;
        let c = mtnDark;
        if (y < top + 2) {
          c = dPao > -5 ? mtnGold : mtnSun;
        } else if (dyTop > 0.78 && dPao < 4 && bayer(xd & 3, y & 3) < 0.65) {
          c = mtnForest;
        } else if (fissure && lit > -3) {
          c = mtnMid;
        } else if (lit > 6) {
          c = dPao > 14 && dyTop < 0.55 && bayer(xd & 3, y & 3) < 0.45 ? mtnGold : mtnSun;
        } else if (lit > 0) {
          c = lit / 6 > bayer(xd & 3, y & 3) ? mtnSun : mtnRock;
        } else if (lit > -6) {
          c = (lit + 6) / 6 > bayer(xd & 3, y & 3) ? mtnRock : mtnMid;
        } else if (lit > -12 && bayer(xd & 3, y & 3) < 0.35) {
          c = mtnMid;
        }
        s.set(xd, y, c);
      }
      // Reflexo escuro sutil na água ao pé do Pão de Açúcar
      if (Math.abs(dPao) < 19) {
        for (let ry = 0; ry < 6; ry++) {
          if ((xd + ry) % 2 === 0) s.set(xd, bot + ry, hex('#0b2c4d'));
        }
      }
    }
  }

  // Estações do teleférico no Morro da Urca e no Pão de Açúcar
  s.rect(X(URCA_STA.x) - 3, Y(URCA_STA.y) - 2, 6, 4, mtnMid);
  s.rect(X(URCA_STA.x) - 2, Y(URCA_STA.y) - 3, 5, 1, mtnGold);
  s.rect(X(PAO_STA.x) - 3, Y(PAO_STA.y) - 2, 6, 4, mtnMid);
  s.rect(X(PAO_STA.x) - 2, Y(PAO_STA.y) - 3, 5, 1, mtnGold);

  // Cabos do Bondinho (Praia Vermelha -> Urca e Urca -> Pão de Açúcar)
  const cableCol = hex('#9a84a8');
  for (let i = 0; i <= 90; i++) {
    const p = cableY(URCA_STA.x, URCA_STA.y, PAO_STA.x, PAO_STA.y, 2.2, i / 90);
    s.set(X(p.x), Y(p.y), cableCol);
  }
  for (let i = 0; i <= 50; i++) {
    const p = cableY(PRAIA_STA.x, PRAIA_STA.y, URCA_LOW_STA.x, URCA_LOW_STA.y, 1.4, i / 50);
    s.set(X(p.x), Y(p.y), cableCol);
  }

  return s.canvas();
}

/** Desenha os reflexos dourados do sol tremulando na Baía de Guanabara. */
function drawBayReflections(ctx: Ctx, camX: number, offHor: number, dyHor: number, time: number): void {
  const isBlockedByPeak = (sx: number, ly: number): boolean => {
    const relY = ly - dyHor;
    if (relY >= 98) return false;
    const hx = mod(sx + offHor, P_HOR);
    if (relY < 97 && Math.abs(wrapDelta(hx - 204, P_HOR)) <= 24) return true;
    if (Math.abs(wrapDelta(hx - 256, P_HOR)) <= 22) return true;
    return false;
  };

  const yStart = BAY_Y + 1 + dyHor;
  const rows = 20;
  for (let r = 0; r < rows; r++) {
    const ly = snap(yStart + r * 1.1);
    const spread = 8 + r * 1.45;
    const wave = Math.sin(time * 4.2 + r * 1.35 + camX * 0.05) * (2.2 + r * 0.15);
    const wMain = snap(Math.max(2, (1 - r / (rows + 4)) * 16 + Math.cos(time * 3.1 + r * 2.1) * 3));
    const cx = snap(SUN_CX + wave);

    if (!isBlockedByPeak(cx, ly)) {
      ctx.fillStyle = r < 5 ? '#fff3a0' : r < 12 ? '#ffd23f' : '#ff8a2a';
      ctx.fillRect(snap(cx - wMain * 0.5), ly, wMain, 0.5);
    }

    // Cintilações laterais tremulando nas ondas
    for (const side of [-1, 1] as const) {
      const ph = Math.sin(time * 5.0 + r * 2.7 + side * 1.4);
      if (ph > -0.1) {
        const sx = snap(cx + side * (wMain * 0.65 + 2 + ((r * 5) % Math.max(3, Math.floor(spread * 0.5)))));
        if (!isBlockedByPeak(sx, ly)) {
          ctx.fillStyle = ph > 0.55 ? '#ffd23f' : '#ff8a2a';
          ctx.fillRect(sx, ly, ph > 0.5 ? 2.5 : 1.5, 0.5);
        }
      }
    }
  }

  // Brilhos esparsos na baía inteira
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < 14; i++) {
    const blink = Math.sin(time * 3.6 + i * 2.1);
    if (blink < 0.45) continue;
    const gx = snap(mod(i * 31 + 17 - camX * 0.1, P_HOR));
    if (gx >= VIEW_W) continue;
    const gy = snap(yStart + 2 + ((i * 7) % 16));
    if (!isBlockedByPeak(gx, gy)) {
      ctx.fillRect(gx, gy, blink > 0.8 ? 2 : 1, 0.5);
    }
  }
}

/** Desenha o bondinho se movendo suavemente pelo cabo entre o Morro da Urca e o Pão de Açúcar. */
function drawBondinho(ctx: Ctx, offHor: number, dyHor: number, time: number): void {
  // Trecho principal: Morro da Urca <-> Pão de Açúcar
  const uMain = 0.5 - 0.5 * Math.cos(time * 0.42);
  const pos = cableY(URCA_STA.x, URCA_STA.y, PAO_STA.x, PAO_STA.y, 2.2, uMain);

  // Trecho secundário: Praia Vermelha <-> Morro da Urca
  const uLow = 0.5 + 0.5 * Math.cos(time * 0.34 + 1.1);
  const posLow = cableY(PRAIA_STA.x, PRAIA_STA.y, URCA_LOW_STA.x, URCA_LOW_STA.y, 1.4, uLow);

  const drawCar = (lx: number, ly: number, small: boolean): void => {
    let x0 = mod(lx - offHor, P_HOR);
    if (x0 > P_HOR - 8) x0 -= P_HOR;
    for (let base = x0; base < VIEW_W + 6; base += P_HOR) {
      if (base < -6) continue;
      const sx = snap(base);
      const sy = snap(ly + dyHor);
      // Haste de suspensão presa ao cabo
      ctx.fillStyle = '#2d2342';
      ctx.fillRect(sx, sy, 0.5, small ? 1 : 1.5);
      // Cabine do bondinho + janelinha iluminada
      if (small) {
        ctx.fillRect(sx - 0.5, sy + 1, 1.5, 1);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(sx, sy + 1, 0.5, 0.5);
      } else {
        ctx.fillRect(sx - 1, sy + 1.5, 2.5, 1.5);
        ctx.fillStyle = '#fff3a0';
        ctx.fillRect(sx - 0.5, sy + 1.5, 1.5, 0.5);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(sx - 0.5, sy + 2, 1.5, 0.5);
      }
    }
  };

  drawCar(posLow.x, posLow.y, true);
  drawCar(pos.x, pos.y, false);
}

// ─── 4. Encosta do Morro / Casario da Favela (0.28x e 0.50x) ─────────────────

interface FacadeTone {
  readonly light: number;
  readonly body: number;
  readonly side: number;
  readonly mortar?: number;
}

interface FavelaOpts {
  readonly period: number;
  readonly seed: number;
  readonly far: boolean;
  readonly ridge: (lx: number) => number;
  readonly alleys: readonly number[];
}

function paintPalmSilhouette(s: Surf, cx: number, baseY: number, h: number, cTrunk: number, cLeaf: number, cLight: number, rnd: Rnd): void {
  const lean = (rnd() - 0.5) * 8;
  let tx = cx;
  for (let i = 0; i <= h; i++) {
    const t = i / Math.max(1, h);
    tx = Math.round(cx + lean * t * t);
    s.rect(tx, baseY - i, 2, 1, cTrunk);
  }
  const ty = baseY - h;
  for (let k = 0; k < 7; k++) {
    const ang = -Math.PI * (0.08 + (0.84 * k) / 6);
    const len = (farLeafLen(h) + rnd() * 4);
    for (let i = 1; i <= len; i++) {
      const u = i / len;
      const fx = Math.round(tx + Math.cos(ang) * len * u);
      const fy = Math.round(ty + Math.sin(ang) * len * u + u * u * len * 0.48);
      s.rect(fx, fy, 2, 2, u < 0.55 ? cLight : cLeaf);
    }
  }
}

function farLeafLen(h: number): number {
  return Math.max(6, Math.round(h * 0.52));
}

/** Desenha uma caixa d'água azul clássica de polietileno sobre a laje. */
function paintWaterTank(s: Surf, x: number, roofY: number, big: boolean): void {
  const w = big ? 11 : 7;
  const h = big ? 7 : 5;
  const cLight = hex('#63c5ff');
  const cBody = hex('#2f9be0');
  const cRib = hex('#2278b8');
  const cShade = hex('#1a578f');

  // Corpo levemente tronco-cônico + anel estrutural
  s.rect(x, roofY - h, w, h, cBody);
  s.rect(x, roofY - h, 2, h, cLight);
  s.rect(x + w - 2, roofY - h, 2, h, cShade);
  s.rect(x + 1, roofY - Math.ceil(h * 0.55), w - 2, 1, cRib);
  // Tampa superior um pouco mais larga
  s.rect(x - 1, roofY - h - 2, w + 2, 2, cBody);
  s.rect(x - 1, roofY - h - 2, Math.ceil((w + 2) * 0.55), 1, cLight);
  s.rect(x + w - 1, roofY - h - 1, 2, 1, cShade);
}

/** Desenha antena de TV (espinha de peixe) ou pequena parabólica no topo da laje. */
function paintAntenna(s: Surf, x: number, roofY: number, dish: boolean, big: boolean): void {
  const mastCol = hex('#4f3f54');
  const tipCol = hex('#8e7f94');
  const h = big ? 13 : 9;
  s.rect(x, roofY - h, 1, h, mastCol);
  if (dish) {
    const dy = roofY - Math.round(h * 0.65);
    s.ell(x + 2, dy, big ? 4 : 3, big ? 3 : 2, hex('#a8b0bd'));
    s.ell(x + 1, dy, big ? 3 : 2, big ? 2 : 1, hex('#dce2eb'));
    s.set(x + 4, dy - 1, mastCol);
  } else {
    s.row(x - (big ? 4 : 3), x + (big ? 4 : 3), roofY - h + 2, tipCol);
    s.row(x - (big ? 3 : 2), x + (big ? 3 : 2), roofY - h + 5, mastCol);
    if (big) s.row(x - 2, x + 2, roofY - h + 8, mastCol);
  }
}

function buildFavelaLayer(opts: FavelaOpts): Cv {
  const { period, seed, far } = opts;
  const s = new Surf(period * S, LH, true);
  const rnd = mulberry32(seed);

  // Paletas arquitetônicas:
  // - camada 0.28x (far): atmosfera quente/rosada de fim de tarde para separar claramente os planos
  // - camada 0.50x (near): cores vivas e tijolo baiano rico, sem contornos pretos #1a1423
  const brickTone: FacadeTone = far
    ? { light: hex('#d17a5e'), body: hex('#ad5748'), side: hex('#753944'), mortar: hex('#8a433d') }
    : { light: hex('#d46c3e'), body: hex('#b5532a'), side: hex('#7a3418'), mortar: hex('#7a3418') };

  const brickDarkTone: FacadeTone = far
    ? { light: hex('#c26850'), body: hex('#99493e'), side: hex('#69313d'), mortar: hex('#7a3837') }
    : { light: hex('#c25c30'), body: hex('#9c4321'), side: hex('#692914'), mortar: hex('#6e2c16') };

  const plasterTones: readonly FacadeTone[] = far
    ? [
        { light: hex('#f2cf7c'), body: hex('#d9ab5b'), side: hex('#966e49') }, // amarelo atmosférico
        { light: hex('#7ea8de'), body: hex('#5982bf'), side: hex('#3f588c') }, // azul atmosférico
        { light: hex('#7ec296'), body: hex('#5b9c76'), side: hex('#3e695c') }, // verde atmosférico
        { light: hex('#eb94b2'), body: hex('#c96b8f'), side: hex('#8a4569') }, // rosa atmosférico
        { light: hex('#f0b686'), body: hex('#cf8d63'), side: hex('#8f594c') }, // ocre atmosférico
      ]
    : [
        { light: hex('#f7d360'), body: hex('#e8b535'), side: hex('#a6781c') }, // amarelo
        { light: hex('#5ea0eb'), body: hex('#3b73cf'), side: hex('#25498c') }, // azul
        { light: hex('#66c47c'), body: hex('#459e5b'), side: hex('#2a663b') }, // verde
        { light: hex('#f27da4'), body: hex('#de5b88'), side: hex('#99365b') }, // rosa
        { light: hex('#d4c7c1'), body: hex('#b0a09b'), side: hex('#756668') }, // reboco/concreto
      ];

  const hillBody = far ? hex('#59384d') : hex('#3b232e');
  const vegLight = far ? hex('#5c897d') : hex('#3e705c');
  const vegBody = far ? hex('#486b6b') : hex('#2d5448');
  const vegDark = far ? hex('#3a505c') : hex('#223c3b');

  const slabLight = far ? hex('#bda8a4') : hex('#cfc0ba');
  const slabShade = far ? hex('#6b535c') : hex('#634d56');
  const zincLight = far ? hex('#96a6b8') : hex('#a8b8c9');
  const zincShade = far ? hex('#5c697d') : hex('#566478');

  const winDark = far ? hex('#382438') : hex('#291a2b');
  const winFrame = far ? hex('#8f787e') : hex('#9e898c');
  const winLit = hex('#ffd23f');
  const winCore = hex('#fff7c2');
  const winGlow = hex('#ff8a2a');

  // 4.1 Massa base do morro + vegetação de Mata Atlântica nas cristas altas
  for (let xd = 0; xd < s.w; xd++) {
    const top = Y(opts.ridge(xd / S));
    for (let y = top; y < s.h; y++) {
      s.d[y * s.w + xd] = y < top + 14 ? vegDark : hillBody;
    }
  }

  // Copas tropicais e palmeiras no topo da encosta (atrás das casas mais altas)
  const treeCount = Math.round(period / (far ? 10 : 13));
  for (let i = 0; i < treeCount; i++) {
    const lx = (i + rnd() * 0.85) * (period / treeCount);
    const ry = opts.ridge(lx);
    const rx = (far ? 7 : 10) + rnd() * (far ? 7 : 9);
    const cy = Y(ry) + 2;
    s.ell(X(lx), cy + 2, rx, rx * 0.55, vegDark);
    s.ell(X(lx), cy, rx * 0.92, rx * 0.5, vegBody);
    s.ell(X(lx) + 2, cy - 2, rx * 0.65, rx * 0.34, vegLight);
    if (rnd() < 0.24) {
      paintPalmSilhouette(s, X(lx), Y(ry) + 6, (far ? 13 : 18) + ri(rnd, 7), vegDark, vegBody, vegLight, rnd);
    }
  }

  // 4.2 Escadarias/vielas de fundo (desenhadas ANTES de sobrepor cada fileira de casas,
  // para que os telhados da frente encubram naturalmente a base dos degraus, sem faixa artificial!)
  const stepDark = far ? hex('#42293b') : hex('#2c1b29');
  const stepMid = far ? hex('#705969') : hex('#634f5c');
  const stepTop = far ? hex('#967f8c') : hex('#8f7a86');
  const lampCore = hex('#fffbe0');
  const lampMid = hex('#ffd23f');
  const lampWarm = hex('#ff8a2a');

  const alleyPath = (ai: number, baseStart: number, ly: number, topY: number): number => {
    const d = Math.max(0, ly - topY);
    const dir = ai % 2 === 0 ? 1 : -1;
    return baseStart + dir * d * 0.09 + Math.sin(d * 0.11 + ai * 1.7) * 2.2;
  };

  for (const [ai, alleyStart] of opts.alleys.entries()) {
    const topLogY = opts.ridge(alleyStart) + 4;
    const botLogY = VIEW_H + BOTM;
    for (let ly = topLogY; ly < botLogY; ly += 1.5) {
      const cx = alleyPath(ai, alleyStart, ly, topLogY);
      const ax = X(cx);
      const ay = Y(ly);
      const aw = far ? 6 : 9;
      s.rect(ax - (aw >> 1), ay, aw, 3, stepDark);
      s.rect(ax - (aw >> 1) + 1, ay + 1, aw - 2, 1, ((ly | 0) % 3 === 0) ? stepTop : stepMid);
    }
  }

  // 4.3 Fileiras escalonadas de casinhas empilhadas descendo o morro
  const rowStep = far ? 8.5 : 12.5;
  const maxRows = far ? 15 : 11;

  for (let r = 0; r < maxRows; r++) {
    let lx = rnd() * 8;
    while (lx < period) {
      const wLog = far ? 8 + rnd() * 9 : 12 + rnd() * 13;
      const gapLog = rnd() < 0.22 ? 1.5 : -1.5; // casinhas coladas/sobrepostas
      const centerLx = mod(lx + wLog * 0.5, period);

      const hillY = opts.ridge(centerLx);
      const baseLogY = hillY + 5 + r * rowStep + (rnd() - 0.5) * 3.5;

      // Deixa o corredor da escadaria/viela respirar entre os blocos de casas
      const hitsAlley = opts.alleys.some((ax, ai) => {
        const topA = opts.ridge(ax) + 4;
        const curAx = alleyPath(ai, ax, baseLogY - 4, topA);
        return Math.abs(wrapDelta(centerLx - curAx, period)) < wLog * 0.45 + (far ? 1.8 : 2.6);
      });
      if (hitsAlley) {
        lx += far ? 3.5 : 5;
        continue;
      }

      if (baseLogY - 24 > VIEW_H + BOTM) {
        lx += wLog + gapLog;
        continue;
      }

      const twoFloors = rnd() < (far ? 0.38 : 0.52);
      const hFloor = far ? 6 + Math.round(rnd() * 2.5) : 9 + Math.round(rnd() * 3);
      const hLog = twoFloors ? hFloor * 2 : hFloor + 1;

      const x0 = X(lx);
      const wPx = Math.max(12, X(wLog));
      const sideW = far ? 4 : 6;
      const frontW = wPx - sideW;
      const yBot = Y(baseLogY);
      const yTop = yBot - hLog * S;

      // Escolha do material: tijolo baiano aparente (~44%) ou fachada rebocada colorida (~56%)
      const isBrick = rnd() < 0.44;
      const mainTone: FacadeTone = isBrick
        ? rnd() < 0.55
          ? brickTone
          : brickDarkTone
        : (plasterTones[ri(rnd, plasterTones.length)] ?? brickTone);
      // Clássico puxadinho carioca: térreo rebocado colorido + andar de cima em tijolo baiano!
      const upperBrick = !isBrick && twoFloors && rnd() < 0.42;

      const paintStory = (sy0: number, sy1: number, tone: FacadeTone): void => {
        const sh = sy1 - sy0;
        if (sh <= 0) return;
        // Fachada frontal + lateral sombreada em perspectiva 3D
        s.rect(x0, sy0, frontW, sh, tone.body);
        s.rect(x0, sy0, 2, sh, tone.light);
        s.rect(x0 + frontW, sy0, sideW, sh, tone.side);

        // Textura de fileiras de tijolo baiano aparente
        if (tone.mortar !== undefined) {
          const brickStep = far ? 3 : 4;
          for (let by = sy0 + 2; by < sy1 - 1; by += brickStep) {
            s.row(x0 + 1, x0 + frontW - 1, by, tone.mortar);
            const shift = ((by / brickStep) | 0) % 2 === 0 ? 0 : 3;
            for (let bx = x0 + 3 + shift; bx < x0 + frontW - 1; bx += far ? 5 : 6) {
              s.rect(bx, by - brickStep + 1, 1, brickStep - 1, tone.mortar);
            }
          }
        }
      };

      if (twoFloors) {
        const yMid = yTop + Math.round((yBot - yTop) * 0.5);
        paintStory(yTop, yMid, upperBrick ? brickTone : mainTone);
        paintStory(yMid, yBot, mainTone);
        // Viga/laje intermediária entre os dois andares
        s.rect(x0 - 1, yMid - 1, frontW + 2, 2, slabLight);
        s.rect(x0, yMid + 1, wPx, 1, slabShade);
      } else {
        paintStory(yTop, yBot, mainTone);
      }

      // Cobertura: laje de concreto (~65%) ou telhado de zinco inclinado (~35%)
      const flatSlab = rnd() < 0.66;
      if (flatSlab) {
        s.rect(x0 - 2, yTop - 2, frontW + 3, 2, slabLight);
        s.rect(x0 + frontW + 1, yTop - 2, sideW + 1, 2, slabShade);
        s.rect(x0 - 1, yTop, wPx + 1, 1, slabShade);

        // Mureta vazada de terraço ocasional
        if (!far && rnd() < 0.28) {
          for (let mx = x0; mx < x0 + frontW - 2; mx += 3) {
            s.rect(mx, yTop - 5, 2, 3, brickTone.body);
          }
          s.row(x0, x0 + frontW - 1, yTop - 6, slabLight);
        }

        // Caixa d'água azul no telhado!
        if (rnd() < (far ? 0.36 : 0.46) && frontW >= (far ? 10 : 14)) {
          const tx = x0 + 2 + ri(rnd, Math.max(1, frontW - (far ? 9 : 13)));
          paintWaterTank(s, tx, yTop - 2, !far);
        }

        // Antena de TV / parabólica
        if (rnd() < (far ? 0.24 : 0.34)) {
          const ax = x0 + frontW - 3 - ri(rnd, Math.max(1, Math.floor(frontW * 0.4)));
          paintAntenna(s, ax, yTop - 2, rnd() < 0.28, !far);
        }
      } else {
        // Telha de zinco ondulada
        s.rect(x0 - 2, yTop - 3, frontW + 4, 2, zincLight);
        s.rect(x0 - 2, yTop - 1, wPx + 3, 2, zincShade);
        for (let zx = x0 - 1; zx < x0 + frontW + 1; zx += 3) {
          s.set(zx, yTop - 2, zincShade);
        }
      }

      // Janelinhas escuras e algumas acesas em amarelo acolhedor
      const floors = twoFloors ? 2 : 1;
      for (let fl = 0; fl < floors; fl++) {
        const fy0 = yTop + fl * Math.round((yBot - yTop) / floors);
        const winW = far ? 3 : 4;
        const winH = far ? 4 : 5;
        const wy = fy0 + (far ? 3 : 4);
        const maxWins = Math.max(1, Math.min(3, Math.floor((frontW - 4) / (winW + (far ? 3 : 4)))));
        const span = frontW - 4;
        for (let wi = 0; wi < maxWins; wi++) {
          const wx = x0 + 2 + Math.round(((wi + 0.5) * span) / maxWins - winW * 0.5);
          const lit = rnd() < 0.27;
          if (lit) {
            // Halo alaranjado sutil na parede ao redor da janela acesa
            s.rect(wx - 1, wy - 1, winW + 2, winH + 2, winGlow);
            s.rect(wx, wy, winW, winH, winLit);
            s.rect(wx, wy, Math.max(1, winW - 1), Math.max(1, winH - 2), winCore);
          } else {
            s.rect(wx, wy, winW, winH, winDark);
            s.row(wx, wx + winW - 1, wy + winH, winFrame);
          }
        }
      }

      // Varalzinho distante colorido ocasional na camada próxima
      if (!far && flatSlab && rnd() < 0.18 && frontW >= 18) {
        const lyClothes = yTop - 5;
        s.rect(x0 + 2, yTop - 7, 1, 5, slabShade);
        s.rect(x0 + frontW - 4, yTop - 7, 1, 5, slabShade);
        s.row(x0 + 2, x0 + frontW - 4, lyClothes, slabShade);
        const clothCols = [hex('#e23b3b'), hex('#ffd23f'), hex('#ffffff'), hex('#2ec4b6')];
        for (let cx = x0 + 4; cx < x0 + frontW - 6; cx += 4) {
          s.rect(cx, lyClothes + 1, 3, 3, clothCols[ri(rnd, clothCols.length)] ?? winLit);
        }
      }

      // Sombra na base do bloco para assentar o empilhamento
      s.rect(x0, yBot - 2, wPx, 2, hillBody);

      lx += wLog + gapLog;
    }
  }

  // 4.4 Luminárias quentes ao longo das vielas e escadarias (iluminando paredes vizinhas)
  for (const [ai, alleyStart] of opts.alleys.entries()) {
    const topLogY = opts.ridge(alleyStart) + 10;
    const botLogY = VIEW_H + BOTM - 6;
    const spacing = far ? 14 : 18;
    for (let ly = topLogY, idx = 0; ly < botLogY; ly += spacing, idx++) {
      const cx = alleyPath(ai, alleyStart, ly, topLogY - 6);
      const ax = X(cx) + (idx % 2 === 0 ? -(far ? 3 : 5) : (far ? 3 : 5));
      const ay = Y(ly);
      const rHalo = far ? 5 : 8;
      for (let dy = -rHalo; dy <= rHalo; dy++) {
        for (let dx = -rHalo; dx <= rHalo; dx++) {
          const dist = Math.hypot(dx, dy);
          if (dist < rHalo && s.get(ax + dx, ay + dy) !== 0) {
            const k = (1 - dist / rHalo) * 0.55;
            if (k > bayer((ax + dx) & 3, (ay + dy) & 3)) {
              s.set(ax + dx, ay + dy, dist < rHalo * 0.4 ? lampMid : lampWarm);
            }
          }
        }
      }
      s.rect(ax, ay, 1, far ? 4 : 6, hex('#47354a'));
      s.rect(ax - 1, ay - 1, far ? 2 : 3, 2, lampMid);
      s.set(ax, ay - 1, lampCore);
    }
  }

  // Postes distantes na crista dos morros com fios finos acompanhando a silhueta
  const poleCol = far ? hex('#5c3e4f') : hex('#452c3b');
  const poleCount = far ? 5 : 7;
  const poles: { x: number; y: number }[] = [];
  for (let i = 0; i < poleCount; i++) {
    const lx = (i + 0.35) * (period / poleCount);
    const py = Y(opts.ridge(lx) + 3);
    const ph = far ? 12 : 17;
    const px = X(lx);
    s.rect(px, py - ph, far ? 1 : 2, ph, poleCol);
    s.row(px - 2, px + 3, py - ph + 2, poleCol);
    poles.push({ x: px, y: py - ph + 2 });
  }
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i];
    const b = poles[(i + 1) % poles.length];
    if (!a || !b) continue;
    let bx = b.x;
    if (bx <= a.x) bx += s.w;
    if (bx - a.x > 190 * S) continue;
    const steps = bx - a.x;
    for (let k = 0; k <= steps; k += 2) {
      const u = k / Math.max(1, steps);
      const wy = Math.round(a.y + (b.y - a.y) * u + 8 * 4 * u * (1 - u));
      s.set(a.x + k, wy, poleCol);
    }
  }

  return s.canvas();
}

/** Curva suave de um morro centrada em `cx`, meia-largura `hw` e elevação `rise`. */
function morroBump(lx: number, cx: number, hw: number, rise: number, period: number): number {
  const u = Math.abs(wrapDelta(lx - cx, period)) / hw;
  if (u >= 1) return 0;
  const c = Math.cos((u * Math.PI) / 2);
  return rise * c * c;
}

// ─── 5. Foreground: Fios Elétricos (y = 12..26) + Par de Tênis no Cadarço ────

interface WireSpan {
  readonly sag: number;
  readonly y0: number;
  readonly y1: number;
}

const FG_WIRES: readonly WireSpan[] = [
  { y0: 12.8, y1: 13.0, sag: 4.0 },
  { y0: 13.6, y1: 13.6, sag: 4.9 },
  { y0: 14.4, y1: 14.2, sag: 5.7 },
];

const POLE_LX = 6;
const SHOE_LX = 186;

function buildForegroundWires(): Cv {
  const fgH = 27; // estritamente confinado ao topo (y <= 26)
  const s = new Surf(P_FG * S, fgH * S, true);
  const wireDark = hex('#1a1423');
  const wireMid = hex('#2b2733');
  const ceramic = hex('#8a8f98');

  const xA = POLE_LX * S;
  const xB = xA + P_FG * S;

  // 3 fios em catenária suave cruzando de um poste ao outro (y entre 13 e 20.1)
  const spanPx = P_FG * S - 12;
  for (const [wi, w] of FG_WIRES.entries()) {
    const startX = xA + 6;
    for (let i = 0; i <= spanPx; i++) {
      const u = i / spanPx;
      const ly = w.y0 + (w.y1 - w.y0) * u + w.sag * 4 * u * (1 - u);
      const py = Math.round(ly * S);
      s.set(startX + i, py, wireDark);
      if (wi === 2) s.set(startX + i, py + 1, wireDark);
    }
    // Alça curta de passagem (jumper loop) sob a cruzeta do poste (y = 13.5..16.8)
    for (let j = -6; j <= 6; j++) {
      const u = (j + 6) / 12;
      const lyLoop = w.y0 + 2.0 * 4 * u * (1 - u);
      s.set(xB + j, Math.round(lyLoop * S), wireDark);
    }
  }

  // Topo do poste / cruzeta com isoladores nas extremidades do vão (estritamente y entre 12 e 16!)
  s.rect(xA - 2, 12 * S, 5, Math.round(4.2 * S), wireDark);
  s.rect(xA - 1, 12 * S, 2, Math.round(3.5 * S), wireMid);
  // Cruzeta horizontal logo abaixo da barra de 12px da HUD
  s.rect(xA - 9, Math.round(13.5 * S), 19, 3, wireDark);
  s.rect(xA - 9, Math.round(13.5 * S), 19, 1, wireMid);
  // Isoladores de porcelana
  for (const ix of [-7, 0, 7] as const) {
    s.rect(xA + ix - 1, Math.round(12.2 * S), 3, 3, ceramic);
    s.rect(xA + ix - 1, Math.round(13.1 * S), 3, 1, wireDark);
  }

  return s.canvas();
}

/** Desenha o par de tênis pendurado pelo cadarço balançando abaixo do fio inferior (y ≈ 19.8..25.5). */
function drawHangingSneakers(ctx: Ctx, offFg: number, time: number): void {
  const wireSpan = P_FG - 6;
  const uShoe = (SHOE_LX - (POLE_LX + 3)) / wireSpan;
  const wLow = FG_WIRES[2];
  if (!wLow) return;
  const anchorY = snap(wLow.y0 + (wLow.y1 - wLow.y0) * uShoe + wLow.sag * 4 * uShoe * (1 - uShoe));

  // Balanço suave de pêndulo
  const sway = Math.sin(time * 2.15) * 1.4;

  let x0 = mod(SHOE_LX - offFg, P_FG);
  if (x0 > P_FG - 12) x0 -= P_FG;
  for (let baseX = x0; baseX < VIEW_W + 10; baseX += P_FG) {
    if (baseX < -10) continue;
    const ax = snap(baseX);

    // Nó do cadarço sobre o fio inferior (y ≈ 19.8)
    ctx.fillStyle = '#1a1423';
    ctx.fillRect(ax - 0.5, anchorY - 0.5, 1.5, 1);

    // Tênis 1 (esquerdo, pendurado livre abaixo dos 3 fios: y ≈ 22.0..24.5)
    const s1x = snap(ax - 2.0 + sway * 0.75);
    const s1y = snap(anchorY + 2.5);
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      ctx.fillStyle = '#1a1423';
      ctx.fillRect(snap(ax + (s1x - ax) * t), snap(anchorY + (s1y - anchorY) * t), 0.5, 0.5);
    }
    ctx.fillStyle = '#1a1423';
    ctx.fillRect(s1x - 2.5, s1y + 0.5, 4, 1.5);
    ctx.fillRect(s1x - 0.5, s1y, 2, 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s1x - 1, s1y + 1, 1, 0.5);
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(s1x - 2.5, s1y + 2, 4, 0.5);
    ctx.fillRect(s1x - 2.5, s1y + 1.5, 1, 0.5);

    // Tênis 2 (direito, um pouco mais baixo: y ≈ 23.0..25.5, sempre <= 26!)
    const s2x = snap(ax + 2.0 + sway);
    const s2y = snap(anchorY + 3.5);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      ctx.fillStyle = '#1a1423';
      ctx.fillRect(snap(ax + 0.5 + (s2x - (ax + 0.5)) * t), snap(anchorY + (s2y - anchorY) * t), 0.5, 0.5);
    }
    ctx.fillStyle = '#1a1423';
    ctx.fillRect(s2x - 1, s2y + 0.5, 4, 1.5);
    ctx.fillRect(s2x - 1, s2y, 2, 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s2x + 0.5, s2y + 1, 1, 0.5);
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(s2x - 1, s2y + 2, 4, 0.5);
    ctx.fillRect(s2x + 2, s2y + 1.5, 1, 0.5);
  }
}

// ─── Desenho Tileado e Fábrica Principal ─────────────────────────────────────

function drawTiled2x(ctx: Ctx, img: Cv, period: number, offset: number, y: number): void {
  const w = img.width / S;
  const h = img.height / S;
  for (let x = -mod(offset, period); x < VIEW_W; x += period) {
    ctx.drawImage(img, x, y, w, h);
  }
}

/** Cenário em parallax da Fase 4 — Rio de Janeiro (Favela do Rio & Tribunal). */
export function createRioBackground(): Background {
  const sky = buildSky();
  const sun = Array.from({ length: SUN_FRAMES }, (_, f) => buildSun(f));
  const clouds = buildClouds();
  const horizon = buildHorizon();

  const farNoise = pnoise(mulberry32(8101), 28, P_FAV_FAR, 2.0);
  const favelaFar = buildFavelaLayer({
    period: P_FAV_FAR,
    seed: 8102,
    far: true,
    // Dois morros altos com vale panorâmico amplo abrindo vista para a Baía e Pão de Açúcar
    ridge: (lx) =>
      118 -
      morroBump(lx, 88, 84, 38, P_FAV_FAR) -
      morroBump(lx, 392, 92, 41, P_FAV_FAR) +
      farNoise(lx),
    alleys: [62, 122, 352, 428],
  });

  const nearNoise = pnoise(mulberry32(9201), 32, P_FAV_NEAR, 2.2);
  const favelaNear = buildFavelaLayer({
    period: P_FAV_NEAR,
    seed: 9202,
    far: false,
    // Camada escalonada mais próxima e detalhada, mais baixa para exibir bem a encosta distante e a Baía
    ridge: (lx) =>
      129 -
      morroBump(lx, 74, 90, 25, P_FAV_NEAR) -
      morroBump(lx, 378, 88, 27, P_FAV_NEAR) -
      morroBump(lx, 550, 78, 22, P_FAV_NEAR) +
      nearNoise(lx),
    alleys: [46, 114, 342, 410, 538],
  });

  const fgWires = buildForegroundWires();

  return {
    draw(ctx, camX, camY, time) {
      const up = BASE_CAM_Y - camY;
      const dy = (factor: number): number => snap(up * factor * 0.5);

      // 1. Céu de 40°C dithered + Sol radiante com halo pulsante + Nuvens douradas suaves
      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);

      const sunFrame = sun[mod(Math.floor(time * 3), SUN_FRAMES)];
      if (sunFrame) {
        ctx.drawImage(
          sunFrame,
          SUN_CX - SUN_SIZE / 2,
          SUN_CY - SUN_SIZE / 2 + dy(0.03),
          SUN_SIZE,
          SUN_SIZE,
        );
      }

      drawTiled2x(ctx, clouds, P_CLOUDS, snap(camX * 0.03 + time * 1.3), dy(0.04));

      // 2. Pipas coloridas bailando no céu com rabiolas curvas e fitinhas
      drawKites(ctx, camX, dy(0.05), time);

      // 3. Horizonte Cartão-Postal (~0.10x): Corcovado + Cristo, Pão de Açúcar + Bondinho e Baía
      const offHor = snap(camX * 0.1);
      const dyHor = dy(0.1);
      drawTiled2x(ctx, horizon, P_HOR, offHor, dyHor - TOPM);
      drawBayReflections(ctx, camX, offHor, dyHor, time);
      drawBondinho(ctx, offHor, dyHor, time);

      // 4. Encosta do Morro / Casario da Favela em duas camadas escalonadas (~0.28x e ~0.50x)
      drawTiled2x(ctx, favelaFar, P_FAV_FAR, snap(camX * 0.28), dy(0.28) - TOPM);
      drawTiled2x(ctx, favelaNear, P_FAV_NEAR, snap(camX * 0.5), dy(0.5) - TOPM);
    },

    drawForeground(ctx, camX, _camY, time) {
      // Fios elétricos escuros (#1a1423) em catenária suave na borda superior (y entre 12 e 26)
      // com postes nas extremidades e par de tênis pendurado pelo cadarço balançando levemente.
      const offFg = snap(camX * 1.25);
      drawTiled2x(ctx, fgWires, P_FG, offFg, 0);
      drawHangingSneakers(ctx, offFg, time);
    },
  };
}
