import type { Background } from '../core/types';
import { VIEW_H, VIEW_W } from '../core/constants';
import { LEVEL6_INDOOR_FROM_COL } from '../game/level6';

/*
 * Parallax da Fase 6 — "Transportadora de São Paulo" (madrugada virando amanhecer).
 *
 * 100% Canvas 2D procedural. Todas as camadas são pré-renderizadas uma única vez em canvases
 * offscreen na escala RENDER_SCALE (S = 2) e, a cada quadro, só há drawImage + poucas primitivas
 * (garoa, luzes de aviso, tiras de PVC).
 *
 * EXTERIOR (x de mundo < LEVEL6_INDOOR_FROM_COL * 16): céu índigo → lilás → laranja pálido, nuvens
 * baixas, skyline paulistano (Paulista, torre de topo arredondado, ponte estaiada em "X"), fila de
 * caminhões e galpões com docas numeradas e postes de sódio. Garoa diagonal no primeiro plano.
 *
 * INTERIOR (a partir da coluna de transição): parede de galpão com pilares e telhas translúcidas,
 * estantes porta-paletes ao fundo e luminárias com cone de luz. A fronteira é um pilar/portão de
 * doca ancorado ao mundo (parallax 1:1), que esconde o corte entre os dois cenários.
 *
 * Regra de leitura: tudo aqui é mais escuro e dessaturado que o plano jogável.
 */

const S = 2;
/** Margem superior (lógica) dos canvases de camada, para absorver o deslocamento vertical da câmera. */
const MT = 20;
const LH = 240;
const TILE = 16;
/** camY de referência com o Pardo no chão-base (mapa de 13 linhas: 208 - 180 = 28). */
const BASE_CAM_Y = 28;
/** Linha do chão (coordenadas de tela com camY = BASE_CAM_Y) para o cenário distante. */
const GY = 150;

const P_CLOUD = 512;
const P_SKY = 640;
const P_TRUCK = 480;
const P_SHED = 640;
const P_WALL = 256;
const P_RACK = 384;
const P_LAMP = 192;
const P_CHAIN = 420;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

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

const snap = (v: number): number => Math.round(v * S) / S;

/** Canvas offscreen em escala S; `margin` é o deslocamento vertical lógico aplicado ao desenho. */
function mk(w: number, h: number, margin: number): { cv: Cv; c: Ctx } {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * S);
  cv.height = Math.round(h * S);
  const c = cv.getContext('2d');
  if (!c) throw new Error('Canvas 2D indisponível para o cenário de São Paulo');
  c.scale(S, S);
  c.translate(0, margin);
  return { cv, c };
}

function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Linha "pixelada" feita de quadradinhos. */
function pline(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  c.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2), Math.round(y0 + (y1 - y0) * t - w / 2), w, w);
  }
}

/** Executa `fn` na posição normal e deslocada de -period (formas que cruzam a emenda do tile). */
function rep(c: Ctx, period: number, fn: () => void): void {
  for (const dx of [0, -period]) {
    c.save();
    c.translate(dx, 0);
    fn();
    c.restore();
  }
}

function radial(c: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawTiled(ctx: Ctx, img: Cv, period: number, offset: number, y: number): void {
  const w = img.width / S;
  const h = img.height / S;
  for (let x = -mod(offset, period); x < VIEW_W; x += period) {
    ctx.drawImage(img, x, y, w, h);
  }
}

// ─── 1. Céu ──────────────────────────────────────────────────────────────────

const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, '#0e1030'],
  [34, '#1c1d4e'],
  [66, '#33306a'],
  [96, '#5a4a86'],
  [120, '#8a5a88'],
  [138, '#bf7a84'],
  [156, '#dc9a74'],
  [180, '#e0a67c'],
];

function rgbOf(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildSky(): Cv {
  const cv = document.createElement('canvas');
  cv.width = VIEW_W * S;
  cv.height = VIEW_H * S;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o cenário de São Paulo');
  const img = ctx.createImageData(cv.width, cv.height);
  const d = new Uint32Array(img.data.buffer);
  const pack = (rgb: readonly [number, number, number]): number =>
    (0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  const put = (lx: number, ly: number, col: number): void => {
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) d[(ly * S + j) * cv.width + lx * S + i] = col;
    }
  };

  for (let ly = 0; ly < VIEW_H; ly++) {
    let i = 0;
    while (i < SKY_STOPS.length - 2 && ly >= (SKY_STOPS[i + 1]?.[0] ?? VIEW_H)) i++;
    const a = SKY_STOPS[i] ?? SKY_STOPS[0];
    const b = SKY_STOPS[i + 1] ?? a;
    if (!a || !b) continue;
    const t = (ly - a[0]) / Math.max(1, b[0] - a[0]);
    const ca = pack(rgbOf(a[1]));
    const cb = pack(rgbOf(b[1]));
    for (let lx = 0; lx < VIEW_W; lx++) put(lx, ly, t > bayer(lx, ly) ? cb : ca);
  }

  // Estrelas fracas, ainda visíveis no topo índigo da madrugada.
  const rnd = mulberry32(5150);
  for (let k = 0; k < 30; k++) {
    const lx = ri(rnd, VIEW_W);
    const ly = ri(rnd, 62);
    put(lx, ly, pack(rnd() < 0.2 ? [240, 226, 200] : [150, 148, 196]));
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function buildClouds(): Cv {
  const { cv, c } = mk(P_CLOUD, 70, 0);
  const rnd = mulberry32(5252);
  const banks: readonly (readonly [number, number, number, number])[] = [
    [20, 38, 150, 12],
    [200, 54, 110, 9],
    [330, 30, 170, 11],
    [90, 62, 120, 7],
    [440, 60, 90, 8],
  ];
  for (const [bx, by, bw, bh] of banks) {
    const prof: number[] = [];
    for (let dx = 0; dx < bw; dx += 2) {
      const u = dx / bw;
      prof.push(Math.pow(Math.sin(Math.PI * u), 0.8) * bh * (0.7 + 0.3 * rnd()));
    }
    rep(c, P_CLOUD, () => {
      prof.forEach((p, i) => {
        const x = bx + i * 2;
        R(c, x, by - p, 2, p, 'rgba(62,50,106,0.72)');
        R(c, x, by - 2, 2, 2, 'rgba(206,132,122,0.5)');
        if (p > 5) R(c, x, by - p, 2, 1, 'rgba(120,100,170,0.35)');
      });
    });
  }
  return cv;
}

// ─── 2. Skyline paulistano (parallax 0.10) ───────────────────────────────────

interface Skyline {
  readonly cv: Cv;
  readonly lights: readonly { x: number; y: number }[];
}

function buildSkyline(): Skyline {
  const { cv, c } = mk(P_SKY, LH, MT);
  const rnd = mulberry32(5005);
  const lights: { x: number; y: number }[] = [];

  const paintRow = (
    cols: readonly string[],
    hMin: number,
    hMax: number,
    wMin: number,
    wMax: number,
    winP: number,
    seed: number,
    antennas: boolean,
  ): void => {
    let x = -4;
    while (x < P_SKY) {
      const w = wMin + ri(rnd, wMax - wMin + 1);
      const low = x > 430;
      const h = low ? 16 + ri(rnd, 22) : hMin + ri(rnd, hMax - hMin + 1);
      const col = cols[ri(rnd, cols.length)] ?? '#2a2848';
      const top = GY - h;
      const roof = ri(rnd, 4);
      const ant = antennas && !low && rnd() < 0.3;
      rep(c, P_SKY, () => {
        R(c, x, top, w, h + 70, col);
        R(c, x, top, w, 1, 'rgba(150,130,200,0.26)');
        if (roof === 0) R(c, x + 2, top - 3, Math.max(3, w - 8), 3, col);
        if (roof === 1) R(c, x + w - 6, top - 5, 3, 5, col);
        if (ant) {
          R(c, x + (w >> 1), top - 12, 1, 12, '#4a4670');
        }
        for (let wy = top + 4; wy < GY - 4; wy += 5) {
          for (let wx = x + 3; wx < x + w - 3; wx += 4) {
            const v = h2(wx, wy, seed);
            if (v >= winP) continue;
            const k = v / winP;
            R(c, wx, wy, 2, 3, k < 0.55 ? '#f0c078' : k < 0.85 ? '#d89e58' : '#a9bbd8');
          }
        }
      });
      if (ant) lights.push({ x: x + (w >> 1), y: top - 12 });
      x += w + ri(rnd, 3);
    }
  };

  // Fileira de trás (enevoada) e marcos paulistanos.
  paintRow(['#3a3562', '#403a6a', '#363160'], 42, 104, 14, 30, 0.06, 11, false);

  // Edifício alto de topo arredondado.
  const tx = 300;
  const tTop = 34;
  rep(c, P_SKY, () => {
    c.fillStyle = '#2f2c54';
    c.beginPath();
    c.ellipse(tx, tTop + 13, 13, 13, 0, 0, Math.PI * 2);
    c.fill();
    R(c, tx - 13, tTop + 13, 26, GY - tTop - 13 + 70, '#2f2c54');
    R(c, tx - 13, tTop + 13, 2, GY - tTop - 13, 'rgba(150,130,200,0.2)');
    R(c, tx, tTop - 8, 1, 9, '#4a4670');
    for (let wy = tTop + 8; wy < GY - 4; wy += 4) {
      for (let wx = tx - 10; wx < tx + 10; wx += 4) {
        const v = h2(wx, wy, 23);
        if (v < 0.34) R(c, wx, wy, 2, 2, v < 0.2 ? '#f0c078' : '#d89e58');
      }
    }
  });
  lights.push({ x: tx, y: tTop - 8 });

  // Antenas da Paulista: torres de treliça sobre prédios largos.
  for (const [ax, aw, ah] of [
    [118, 28, 96],
    [206, 24, 84],
    [388, 26, 90],
  ] as const) {
    const top = GY - ah;
    rep(c, P_SKY, () => {
      R(c, ax, top, aw, ah + 70, '#2d2a52');
      R(c, ax, top, aw, 1, 'rgba(150,130,200,0.26)');
      R(c, ax + (aw >> 1) - 3, top - 4, 6, 4, '#2d2a52');
      const mx = ax + (aw >> 1);
      R(c, mx - 1, top - 52, 1, 48, '#55507f');
      R(c, mx + 1, top - 52, 1, 48, '#55507f');
      for (let y = top - 50; y < top - 4; y += 6) {
        pline(c, mx - 1, y, mx + 2, y + 6, 1, '#47436e');
      }
      R(c, mx - 3, top - 36, 7, 1, '#55507f');
      R(c, mx - 2, top - 22, 5, 1, '#55507f');
      for (let wy = top + 4; wy < GY - 4; wy += 5) {
        for (let wx = ax + 3; wx < ax + aw - 3; wx += 4) {
          const v = h2(wx, wy, 31);
          if (v < 0.2) R(c, wx, wy, 2, 3, v < 0.12 ? '#f0c078' : '#a9bbd8');
        }
      }
    });
    lights.push({ x: ax + (aw >> 1), y: top - 52 });
  }

  // Ponte estaiada em "X".
  const deckY = 121;
  R(c, 416, deckY - 1, 216, 3, '#4b4775');
  R(c, 416, deckY + 2, 216, 1, '#2a2748');
  for (const px of [452, 600]) R(c, px, deckY + 3, 3, GY - deckY - 3, '#34305a');
  pline(c, 494, 141, 538, 56, 3, '#5b5792');
  pline(c, 540, 141, 496, 56, 3, '#5b5792');
  for (let i = 0; i < 8; i++) {
    const ay = 62 + i * 6;
    const k = (ay - 56) / 85;
    const rx = 538 - 44 * k;
    const lx = 496 + 44 * k;
    pline(c, rx, ay, rx + 14 + i * 10, deckY, 1, 'rgba(150,140,200,0.55)');
    pline(c, lx, ay, lx - 14 - i * 10, deckY, 1, 'rgba(150,140,200,0.55)');
  }
  for (let x = 420; x < 632; x += 10) R(c, x, deckY - 3, 1, 2, 'rgba(240,176,96,0.7)');
  lights.push({ x: 517, y: 54 });

  // Fileira da frente (mais escura, mais janelas acesas).
  paintRow(['#262446', '#2c2a50', '#211f3e'], 22, 66, 12, 26, 0.16, 7, true);

  // Brilho do amanhecer na base dos prédios.
  const g = c.createLinearGradient(0, GY - 56, 0, GY);
  g.addColorStop(0, 'rgba(220,150,120,0)');
  g.addColorStop(1, 'rgba(220,150,120,0.2)');
  c.fillStyle = g;
  c.fillRect(0, GY - 56, P_SKY, 56);
  R(c, 0, GY, P_SKY, 90, '#1d1f38');
  return { cv, lights };
}

// ─── 3. Fila de caminhões ao longe (parallax 0.22) ───────────────────────────

function buildTrucks(): Cv {
  const { cv, c } = mk(P_TRUCK, LH, MT);
  const rnd = mulberry32(5353);
  R(c, 0, GY, P_TRUCK, 90, '#1f2139');
  R(c, 0, GY, P_TRUCK, 1, '#2f3354');
  const cols = ['#4d5472', '#6a5a5a', '#3c4868', '#6c7290'] as const;
  let x = 4;
  while (true) {
    const tw = 30 + ri(rnd, 10);
    const cw = 11;
    if (x + tw + cw + 2 > P_TRUCK) break;
    const col = cols[ri(rnd, cols.length)] ?? '#4d5472';
    R(c, x, GY - 24, tw, 19, col);
    R(c, x, GY - 24, tw, 1, 'rgba(255,255,255,0.18)');
    R(c, x, GY - 7, tw, 2, 'rgba(0,0,0,0.25)');
    R(c, x, GY - 6, tw + cw + 1, 3, '#15172a');
    R(c, x + tw + 1, GY - 18, cw, 13, '#2c3250');
    R(c, x + tw + 1, GY - 18, cw, 1, 'rgba(255,255,255,0.15)');
    R(c, x + tw + cw - 5, GY - 16, 4, 5, 'rgba(227,180,106,0.8)');
    R(c, x + tw + cw, GY - 8, 1, 2, '#ffd890');
    R(c, x, GY - 11, 1, 2, '#c04040');
    for (const wx of [x + 4, x + 10, x + tw + 3]) {
      R(c, wx, GY - 5, 5, 5, '#0e1020');
      R(c, wx + 1, GY - 6, 3, 1, '#0e1020');
    }
    x += tw + cw + 6 + ri(rnd, 5);
  }
  return cv;
}

// ─── 4. Galpões, docas numeradas, postes de sódio (parallax 0.40) ────────────

interface ShedOpts {
  readonly x: number;
  readonly w: number;
  readonly h: number;
  readonly tank: boolean;
}

function paintShed(c: Ctx, o: ShedOpts, firstDock: number, seed: number): number {
  const { x, w, h } = o;
  const top = GY - h;
  // Telhado em duas águas (telha metálica).
  c.fillStyle = '#3d4466';
  c.beginPath();
  c.moveTo(x - 2, top + 1);
  c.lineTo(x + w / 2, top - 9);
  c.lineTo(x + w + 2, top + 1);
  c.closePath();
  c.fill();
  pline(c, x - 2, top + 1, x + w / 2, top - 9, 1, '#5a6288');
  pline(c, x + w / 2, top - 9, x + w + 2, top + 1, 1, '#4a5276');
  // Parede.
  R(c, x, top, w, h, '#353b5a');
  for (let xx = x; xx < x + w; xx += 3) R(c, xx, top, 1, h, 'rgba(255,255,255,0.05)');
  R(c, x, top, w, 5, '#2a2f4a');
  R(c, x, top + 5, w, 1, '#4a5272');
  for (let wx = x + 6; wx < x + w - 8; wx += 12) {
    const v = h2(wx, top, seed);
    R(c, wx, top + 9, 6, 3, v < 0.45 ? '#d4a468' : '#232842');
  }
  // Plataforma de carga com para-choques zebrados.
  R(c, x, GY - 5, w, 5, '#454c6c');
  R(c, x, GY - 5, w, 1, '#5d658a');
  for (let k = 0; k < w; k += 4) R(c, x + k, GY - 2, 2, 2, 'rgba(201,166,64,0.7)');
  // Docas numeradas.
  let n = firstDock;
  c.font = 'bold 6px monospace';
  c.textAlign = 'center';
  for (let dx = x + 7; dx + 14 < x + w - 4; dx += 22) {
    const dTop = GY - 24;
    R(c, dx - 1, dTop - 1, 16, 21, '#232842');
    R(c, dx, dTop, 14, 20, '#161830');
    for (let sy = dTop + 2; sy < GY - 5; sy += 3) R(c, dx, sy, 14, 1, '#262a46');
    if (h2(dx, dTop, seed + 3) < 0.4) {
      R(c, dx, GY - 10, 14, 5, 'rgba(155,106,54,0.6)');
      R(c, dx + 2, GY - 11, 10, 1, 'rgba(155,106,54,0.35)');
    }
    R(c, dx + 2, dTop - 10, 10, 7, 'rgba(200,204,218,0.7)');
    c.fillStyle = '#262a46';
    c.fillText(String(n), dx + 7.5, dTop - 4);
    n++;
  }
  // Caixa d'água sobre o telhado.
  if (o.tank) {
    const tx = x + 12;
    R(c, tx + 1, top - 7, 1, 7, '#2b3050');
    R(c, tx + 12, top - 7, 1, 7, '#2b3050');
    R(c, tx, top - 20, 14, 13, '#4c5a80');
    R(c, tx, top - 20, 2, 13, '#6070a0');
    R(c, tx + 12, top - 20, 2, 13, '#38446a');
    R(c, tx, top - 15, 14, 1, '#38446a');
    R(c, tx - 1, top - 22, 16, 3, '#5a6896');
  }
  return n;
}

function buildSheds(): Cv {
  const { cv, c } = mk(P_SHED, LH, MT);
  const rnd = mulberry32(5454);
  R(c, 0, GY, P_SHED, 90, '#1a1c30');
  R(c, 0, GY, P_SHED, 2, '#2a2e4c');

  const ws: number[] = [];
  let W = 0;
  while (W + 96 + 20 * (ws.length + 1) <= P_SHED) {
    let w = 96 + ri(rnd, 4) * 16;
    if (W + w + 20 * (ws.length + 1) > P_SHED) w = P_SHED - W - 20 * (ws.length + 1);
    ws.push(w);
    W += w;
  }
  const gap = Math.floor((P_SHED - W) / ws.length);
  let x = 0;
  let dock = 1;
  const posts: number[] = [];
  ws.forEach((w, i) => {
    dock = paintShed(c, { x, w, h: 40 + ri(rnd, 3) * 6, tank: i % 3 === 1 }, dock, 60 + i);
    posts.push(x + w + (gap >> 1));
    x += w + gap;
  });

  // Postes de luz de sódio com halo.
  for (const px of posts) {
    R(c, px, GY - 46, 2, 46, '#2b2f4a');
    R(c, px - 7, GY - 46, 9, 2, '#2b2f4a');
    R(c, px - 9, GY - 45, 5, 2, '#ffd08a');
    rep(c, P_SHED, () => {
      radial(c, px - 6, GY - 43, 30, '255,170,70', 0.42);
      c.save();
      c.translate(px - 6, GY + 3);
      c.scale(1, 0.22);
      radial(c, 0, 0, 34, '255,170,70', 0.32);
      c.restore();
    });
  }
  return cv;
}

// ─── 5. Interior de galpão ───────────────────────────────────────────────────

function buildWall(): Cv {
  const { cv, c } = mk(P_WALL, LH, MT);
  const g = c.createLinearGradient(0, -MT, 0, GY);
  g.addColorStop(0, '#171b30');
  g.addColorStop(1, '#242a44');
  c.fillStyle = g;
  c.fillRect(0, -MT, P_WALL, GY + MT);
  R(c, 0, GY, P_WALL, 90, '#12142a');
  for (let x = 0; x < P_WALL; x += 4) {
    R(c, x, -MT, 1, GY + MT, 'rgba(255,255,255,0.035)');
    R(c, x + 2, -MT, 1, GY + MT, 'rgba(0,0,0,0.12)');
  }
  for (const gy of [38, 98]) {
    R(c, 0, gy, P_WALL, 3, '#2c3354');
    R(c, 0, gy, P_WALL, 1, '#3d4570');
  }
  // Telhas translúcidas com a luz do amanhecer + raios suaves.
  for (const px of [20, 148]) {
    const lg = c.createLinearGradient(px, 0, px + 80, 0);
    lg.addColorStop(0, '#7f8fb8');
    lg.addColorStop(1, '#d9a384');
    c.fillStyle = lg;
    c.fillRect(px, 0, 80, 16);
    for (let k = 0; k <= 80; k += 20) R(c, px + k, 0, 2, 16, 'rgba(30,34,60,0.75)');
    const sg = c.createLinearGradient(0, 16, 0, GY);
    sg.addColorStop(0, 'rgba(232,190,150,0.16)');
    sg.addColorStop(1, 'rgba(232,190,150,0)');
    c.fillStyle = sg;
    c.beginPath();
    c.moveTo(px + 4, 16);
    c.lineTo(px + 76, 16);
    c.lineTo(px + 106, GY);
    c.lineTo(px + 34, GY);
    c.closePath();
    c.fill();
  }
  R(c, 0, -MT, P_WALL, MT, '#10132a');
  R(c, 0, 16, P_WALL, 2, '#2c3354');
  // Pilares com rebites e base zebrada.
  for (const px of [0, 128]) {
    R(c, px, -MT, 12, GY + MT, '#2b3253');
    R(c, px, -MT, 2, GY + MT, '#3d4570');
    R(c, px + 10, -MT, 2, GY + MT, '#1c2038');
    for (let y = 8; y < GY - 14; y += 20) R(c, px + 5, y, 2, 2, '#4a5278');
    for (let k = 0; k < 4; k++) {
      R(c, px, GY - 16 + k * 4, 12, 4, k % 2 === 0 ? 'rgba(190,160,50,0.55)' : 'rgba(18,18,28,0.9)');
    }
  }
  return cv;
}

function buildRacks(): Cv {
  const { cv, c } = mk(P_RACK, LH, MT);
  const bayW = 48;
  const boxCols = ['#7d5d3f', '#6e5236', '#8a6a46', '#5e4a35'] as const;
  R(c, 0, GY, P_RACK, 90, '#14172b');
  for (let k = 0; k < P_RACK; k += 8) R(c, k, GY, 4, 3, 'rgba(180,150,40,0.5)');
  for (let b = 0; b < P_RACK / bayW; b++) {
    if (b === 3 || b === 7) continue;
    const x = b * bayW;
    for (let lv = 0; lv < 4; lv++) {
      const by = GY - 6 - lv * 28;
      R(c, x, by, bayW, 3, '#8c5a30');
      for (let s = 0; s < 3; s++) {
        const sx = x + 4 + s * 14;
        const v = h2(b * 7 + s, lv, 91);
        if (v > 0.78) continue;
        const bw = 11 + Math.floor(v * 4);
        const bh = 10 + Math.floor(h2(s, b + lv, 17) * 5);
        R(c, sx, by - bh, bw, bh, boxCols[Math.floor(v * 5) % 4] ?? '#7d5d3f');
        R(c, sx, by - bh, bw, 1, 'rgba(255,255,255,0.12)');
        R(c, sx + (bw >> 1), by - bh, 1, bh, 'rgba(0,0,0,0.22)');
      }
      if (lv === 0) R(c, x, by + 3, bayW, 3, '#6a4a2a');
    }
    for (const ux of [x, x + bayW - 3]) {
      R(c, ux, GY - 118, 3, 118, '#2d4a6c');
      for (let k = 0; k < 2; k++) {
        R(c, ux, GY - 8 + k * 4, 3, 4, k % 2 === 0 ? 'rgba(190,160,50,0.7)' : '#1a1a22');
      }
    }
    for (let lv = 0; lv < 4; lv++) {
      pline(c, x + 3, GY - 6 - lv * 28 - 24, x + bayW - 3, GY - 6 - lv * 28 - 3, 1, 'rgba(60,90,130,0.45)');
    }
  }
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(12,14,30,0.35)';
  c.fillRect(0, -MT, P_RACK, LH);
  return cv;
}

function buildLamps(): Cv {
  const { cv, c } = mk(P_LAMP, LH, MT);
  for (const [lx, sy] of [
    [48, 22],
    [144, 32],
  ] as const) {
    const cone = c.createLinearGradient(0, sy + 2, 0, GY);
    cone.addColorStop(0, 'rgba(255,225,170,0.15)');
    cone.addColorStop(1, 'rgba(255,225,170,0)');
    c.fillStyle = cone;
    c.beginPath();
    c.moveTo(lx - 6, sy + 2);
    c.lineTo(lx + 6, sy + 2);
    c.lineTo(lx + 46, GY);
    c.lineTo(lx - 46, GY);
    c.closePath();
    c.fill();
    R(c, lx, -MT, 1, sy + MT - 6, '#1a1d30');
    c.fillStyle = '#2f3555';
    c.beginPath();
    c.moveTo(lx - 9, sy);
    c.lineTo(lx + 9, sy);
    c.lineTo(lx + 5, sy - 6);
    c.lineTo(lx - 5, sy - 6);
    c.closePath();
    c.fill();
    R(c, lx - 6, sy, 12, 2, '#ffe6b0');
    radial(c, lx, sy + 3, 16, '255,225,170', 0.4);
  }
  return cv;
}

/** Faixa de penumbra do lado interior da fronteira (disfarça o contraste entre os cenários). */
function buildGloom(): Cv {
  const { cv, c } = mk(32, 1, 0);
  const g = c.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, 'rgba(8,10,22,0.5)');
  g.addColorStop(1, 'rgba(8,10,22,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 1);
  return cv;
}

// ─── 6. Primeiro plano: correntes e ganchos ──────────────────────────────────

const CHAIN_TOP = -40;

function buildChains(): Cv {
  const { cv, c } = mk(P_CHAIN, 130, 0);
  const defs: readonly (readonly [number, number, boolean])[] = [
    [60, 84, true],
    [190, 96, false],
    [330, 78, true],
  ];
  for (const [x, len, pulley] of defs) {
    rep(c, P_CHAIN, () => {
      for (let y = 0, i = 0; y < len; y += 4, i++) {
        R(c, x + (i % 2), y, 2, 4, '#20243a');
        R(c, x + (i % 2), y, 1, 4, '#4a5272');
      }
      if (pulley) {
        R(c, x - 3, len - 1, 8, 5, '#2a2f4a');
        R(c, x - 3, len - 1, 8, 1, '#4a5272');
      }
      const hy = len + (pulley ? 4 : 0);
      R(c, x - 1, hy, 4, 3, '#20243a');
      R(c, x + 2, hy + 3, 2, 5, '#20243a');
      R(c, x - 1, hy + 7, 4, 2, '#20243a');
      R(c, x - 1, hy + 7, 1, 2, '#9a8a60');
    });
  }
  return cv;
}

// ─── Garoa ───────────────────────────────────────────────────────────────────

interface Drop {
  readonly x: number;
  readonly y: number;
  readonly v: number;
  readonly len: number;
}

function makeDrops(n: number, seed: number, vMin: number, vMax: number, lMin: number, lMax: number): Drop[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    x: rnd() * (VIEW_W + 40),
    y: rnd() * (VIEW_H + 30),
    v: vMin + rnd() * (vMax - vMin),
    len: lMin + rnd() * (lMax - lMin),
  }));
}

function strokeRain(ctx: Ctx, drops: readonly Drop[], camX: number, par: number, time: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (const d of drops) {
    const y = mod(d.y + time * d.v, VIEW_H + 30) - 15;
    const x = mod(d.x - camX * par - y * 0.28, VIEW_W + 40) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - d.len * 0.28, y + d.len);
  }
  ctx.stroke();
}

// ─── Portão de doca (fronteira exterior/interior, parallax 1:1) ──────────────

function drawGate(ctx: Ctx, gx: number, camY: number, gloom: Cv): void {
  const x0 = Math.round(gx) - 8;
  // Penumbra interior.
  ctx.drawImage(gloom, x0 + 16, 0, 32, VIEW_H);
  // Pilar.
  ctx.fillStyle = '#343a5a';
  ctx.fillRect(x0, 0, 16, VIEW_H);
  ctx.fillStyle = '#4b5380';
  ctx.fillRect(x0, 0, 2, VIEW_H);
  ctx.fillStyle = '#202540';
  ctx.fillRect(x0 + 14, 0, 2, VIEW_H);
  ctx.fillStyle = '#566096';
  for (let y = 6; y < VIEW_H; y += 14) ctx.fillRect(x0 + 7, y, 2, 2);
  // Base zebrada (fixa ao mundo).
  const zy = 160 - camY;
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 === 0 ? 'rgba(190,160,50,0.7)' : 'rgba(18,18,28,0.9)';
    ctx.fillRect(x0, zy + k * 4, 16, 4);
  }
  // Verga com porta de enrolar recolhida e placa.
  const ly = 48 - camY;
  ctx.fillStyle = '#2d3252';
  ctx.fillRect(x0 - 20, ly, 56, 38);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = ly + 3; y < ly + 34; y += 3) ctx.fillRect(x0 - 20, y, 56, 1);
  ctx.fillStyle = '#3d4570';
  ctx.fillRect(x0 - 20, ly, 56, 1);
  ctx.fillStyle = 'rgba(201,166,64,0.8)';
  ctx.fillRect(x0 - 20, ly + 36, 56, 2);
  ctx.fillStyle = '#1c2038';
  ctx.fillRect(x0 - 12, ly + 10, 40, 11);
  ctx.fillStyle = '#d8c070';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GALPÃO B', x0 + 8, ly + 18);
}

/** Fábrica do parallax da Fase 6 (contrato fixo). */
export function createSampaBackground(): Background {
  const sky = buildSky();
  const clouds = buildClouds();
  const skyline = buildSkyline();
  const trucks = buildTrucks();
  const sheds = buildSheds();
  const wall = buildWall();
  const racks = buildRacks();
  const lamps = buildLamps();
  const gloom = buildGloom();
  const chains = buildChains();
  const dropsFar = makeDrops(70, 5601, 140, 190, 4, 6);
  const dropsNear = makeDrops(38, 5602, 210, 270, 8, 11);
  const edgeX = LEVEL6_INDOOR_FROM_COL * TILE;

  return {
    draw(ctx, camX, camY, time) {
      const up = BASE_CAM_Y - camY;
      const dy = (f: number): number => snap(up * f);
      const gx = edgeX - camX;

      // EXTERIOR (só se ainda aparece alguma parte dele).
      if (gx > 0) {
        ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
        drawTiled(ctx, clouds, P_CLOUD, snap(camX * 0.03 + time * 1.2), 70 + dy(0.04));

        const offSky = snap(camX * 0.1);
        drawTiled(ctx, skyline.cv, P_SKY, offSky, dy(0.1) - MT);
        // Luzes de aviso piscando nas antenas.
        const yo = dy(0.1);
        for (const l of skyline.lights) {
          const sx = mod(l.x - offSky, P_SKY);
          if (sx > VIEW_W + 2) continue;
          if (Math.sin(time * 2.2 + l.x * 0.13) < 0.15) continue;
          ctx.fillStyle = 'rgba(255,70,50,0.28)';
          ctx.fillRect(snap(sx) - 1.5, snap(l.y + yo) - 1.5, 4, 4);
          ctx.fillStyle = '#ff4a3a';
          ctx.fillRect(snap(sx), snap(l.y + yo), 1, 1);
        }

        drawTiled(ctx, trucks, P_TRUCK, snap(camX * 0.22), dy(0.22) - MT);
        drawTiled(ctx, sheds, P_SHED, snap(camX * 0.4), dy(0.4) - MT);
      }

      // INTERIOR (a partir da coluna de transição).
      if (gx < VIEW_W) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.max(0, gx), 0, VIEW_W, VIEW_H);
        ctx.clip();
        drawTiled(ctx, wall, P_WALL, snap(camX * 0.2), dy(0.2) - MT);
        drawTiled(ctx, racks, P_RACK, snap(camX * 0.45), dy(0.45) - MT);
        drawTiled(ctx, lamps, P_LAMP, snap(camX * 0.75), dy(0.75) - MT);
        ctx.restore();
        drawGate(ctx, gx, camY, gloom);
      }
    },

    drawForeground(ctx, camX, camY, time) {
      const gx = edgeX - camX;
      const up = BASE_CAM_Y - camY;

      // Garoa fina diagonal (somente no exterior).
      if (gx > 8) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, Math.min(VIEW_W, gx - 8), VIEW_H);
        ctx.clip();
        strokeRain(ctx, dropsFar, camX, 0.9, time, 'rgba(170,185,225,0.2)');
        strokeRain(ctx, dropsNear, camX, 1.1, time, 'rgba(200,215,240,0.3)');
        ctx.restore();
      }

      // Correntes e ganchos pendurados (somente no interior, discretos no alto da tela).
      if (gx < VIEW_W - 8) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.max(0, gx + 8), 0, VIEW_W, 90);
        ctx.clip();
        drawTiled(ctx, chains, P_CHAIN, snap(camX * 1.2), CHAIN_TOP + up);
        ctx.restore();
      }

      // Cortina de tiras de PVC na verga do portão, balançando de leve.
      if (gx > -40 && gx < VIEW_W + 40) {
        const y0 = 86 - camY;
        ctx.fillStyle = 'rgba(205,225,235,0.26)';
        for (let i = 0; i < 9; i++) {
          const len = 22 + ((i * 7) % 11);
          const sway = Math.sin(time * 1.3 + i * 0.9) * 0.6;
          ctx.fillRect(snap(gx - 18 + i * 4 + sway), y0, 3, len);
        }
      }
    },
  };
}
