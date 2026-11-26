import type { Background } from '../core/types';
import { RENDER_SCALE, VIEW_H, VIEW_W } from '../core/constants';
import {
  SPACE,
  SPACE_BRAKE_START_CAM_X,
  SPACE_STOP_CAM_X,
  scrollSpeedAt,
} from '../game/spaceRules';

/*
 * Parallax da Fase 7 — "Espaço Sideral (Órbita de Quixadá)".
 *
 * Quatro camadas determinísticas (sem Math.random, 100% hash inteiro / PRNG) em 320×180:
 *  1. Fundo profundo (0,05×): vazio cósmico #07091a com nebulosas em Bayer dithering
 *     trocando suavemente por ato (Embarque/Ato 1 índigo → Ato 2 azul-violeta →
 *     Ato 3 âmbar/magenta → Ato 4/Final ciano/violeta), mantendo contraste baixo.
 *  2. Horizonte planetário (0,15×): curvatura da Terra no Embarque/Ato 1 com brilho
 *     atmosférico azul-ciano, Atlântico, nuvens e silhueta do Nordeste / Ceará com
 *     luzes noturnas; nos Atos 2–3 constelações sutis e galáxias espirais pixel-art;
 *     no fim do Ato 3 ao Ato 4 (camX 9000..11712) silhueta distante da EEIQ crescendo.
 *  3. Plano médio (0,40×): estrelas médias cintilando em 2 quadros (time), satélites
 *     inativos e cinturão de asteroides silhuetados bem escuros (sem confundir com meteoros).
 *  4. Primeiro plano / Velocidade (drawForeground, 1,15×): poeira cósmica sutil e
 *     speedlines finas (2–4 px, alfa baixo) reduzindo na desaceleração final (camX >= 11712).
 */

const S = RENDER_SCALE;

/** Limites de camX entre atos (GDD §6: 1 compasso = 192 px). */
const ACT2_CAM_X = 3456; // início do Ato 2 (c.19)
const ACT3_CAM_X = 6336; // início do Ato 3 (c.34)
const ACT4_CAM_X = 9408; // início do Ato 4 (c.50)
const ACT_FADE_W = 576; // 3 compassos de transição suave

const P_DEEP = 640;
const P_BELT = 640;
const P_STARS = 480;
const P_CONST = 640;
const P_EARTH = 720;
const EARTH_H = 68;
const EARTH_R = 440;

type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;
type Rnd = () => number;

// ─── utilidades determinísticas ──────────────────────────────────────────────

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smooth(t: number): number {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

const snap = (v: number): number => Math.round(v * S) / S;

/** PRNG determinístico (mulberry32). */
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

/** Hash inteiro 2D determinístico em [0, 1). */
function h2(x: number, y: number, seed: number): number {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Ruído suave periódico 2D para nuvens de nebulosa (sem Math.random). */
function fbmPeriodic(x: number, y: number, periodX: number, scale: number, seed: number): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let oct = 0; oct < 3; oct++) {
    const gx = (x * freq) / scale;
    const gy = (y * freq) / scale;
    const cellPeriod = Math.max(1, Math.round((periodX * freq) / scale));
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = mod(ix, cellPeriod);
    const x1 = mod(ix + 1, cellPeriod);
    const n00 = h2(x0, iy, seed + oct * 97);
    const n10 = h2(x1, iy, seed + oct * 97);
    const n01 = h2(x0, iy + 1, seed + oct * 97);
    const n11 = h2(x1, iy + 1, seed + oct * 97);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    sum += (nx0 + (nx1 - nx0) * sy) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x: number, y: number): number {
  return ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}

function rgbOf(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pack(rgb: readonly [number, number, number], a = 255): number {
  return ((a << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
}

function mk(w: number, h: number, scale = S): { cv: Cv; c: Ctx } {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const c = cv.getContext('2d');
  if (!c) throw new Error('Canvas 2D indisponível para o cenário espacial');
  c.imageSmoothingEnabled = false;
  if (scale !== 1) c.scale(scale, scale);
  return { cv, c };
}

function mkPixelCanvas(w: number, h: number): { cv: Cv; c: Ctx; img: ImageData; px: Uint32Array } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  if (!c) throw new Error('Canvas 2D indisponível para textura pixel-art espacial');
  const img = c.createImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  return { cv, c, img, px };
}

// ─── Camada 1: Fundo profundo (0,05×) ────────────────────────────────────────

interface DeepPalette {
  readonly stops: readonly string[];
  readonly seed: number;
  readonly bottomGlow?: readonly string[];
  readonly starDim: string;
  readonly starBright: string;
}

const DEEP_ACTS: readonly DeepPalette[] = [
  // Ato 1 (Embarque / Ato 1): vazio cósmico + atmosfera superior azul-índigo na base
  {
    stops: ['#07091a', '#090d24', '#0d1333', '#121b47'],
    bottomGlow: ['#07091a', '#0c1232', '#131d4a', '#1b2b66'],
    seed: 7101,
    starDim: '#242e5c',
    starBright: '#3c4d8a',
  },
  // Ato 2: nebulosa azul-violeta sutil
  {
    stops: ['#07091a', '#0c102e', '#151544', '#1d1c56'],
    seed: 7207,
    starDim: '#283366',
    starBright: '#47569a',
  },
  // Ato 3: nebulosa âmbar/magenta profunda (contraste baixo)
  {
    stops: ['#07091a', '#130b24', '#22102b', '#2b1822'],
    seed: 7319,
    starDim: '#34264f',
    starBright: '#5c4166',
  },
  // Ato 4 / Final: nebulosa vibrante ciano/violeta
  {
    stops: ['#07091a', '#0e1438', '#15254d', '#22215c'],
    seed: 7433,
    starDim: '#2c426e',
    starBright: '#4d6ea3',
  },
];

function buildDeepAct(pal: DeepPalette): Cv {
  const { cv, c, img, px } = mkPixelCanvas(P_DEEP, VIEW_H);
  const cols = pal.stops.map((s) => pack(rgbOf(s)));
  const glowCols = pal.bottomGlow?.map((s) => pack(rgbOf(s)));
  const nMax = cols.length - 1;

  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < P_DEEP; x++) {
      const f = fbmPeriodic(x, y, P_DEEP, 64, pal.seed);
      // Banda diagonal sutil de poeira interestelar
      const band = Math.sin((x / P_DEEP) * Math.PI * 2 + y * 0.028) * 0.14;
      let val = clamp((f - 0.34) * 2.1 + band, 0, 1);

      let chosen = cols[0] ?? 0;
      if (glowCols) {
        // Atmosfera superior índigo concentrada na base da tela
        const atm = clamp((y - 96) / (VIEW_H - 96), 0, 1);
        const gIdx = atm * (glowCols.length - 1);
        const gi = Math.min(glowCols.length - 2, Math.floor(gIdx));
        const gf = gIdx - gi;
        const gCol = gf > bayer(x, y) ? (glowCols[gi + 1] ?? chosen) : (glowCols[gi] ?? chosen);
        const nebIdx = val * 0.45 * nMax;
        const ni = Math.min(nMax - 1, Math.floor(nebIdx));
        const nf = nebIdx - ni;
        const nCol = nf > bayer(x, y) ? (cols[ni + 1] ?? chosen) : (cols[ni] ?? chosen);
        chosen = atm > 0.15 + f * 0.25 ? gCol : nCol;
      } else {
        const s = val * nMax;
        const i = Math.min(nMax - 1, Math.floor(s));
        const frac = s - i;
        chosen = frac > bayer(x, y) ? (cols[i + 1] ?? chosen) : (cols[i] ?? chosen);
      }

      px[y * P_DEEP + x] = chosen;
    }
  }

  // Estrelas distantes estáticas muito tênues (1×1 px lógico)
  const dim = pack(rgbOf(pal.starDim));
  const bright = pack(rgbOf(pal.starBright));
  const rnd = mulberry32(pal.seed + 55);
  for (let k = 0; k < 150; k++) {
    const sx = ri(rnd, P_DEEP);
    const sy = ri(rnd, VIEW_H - 12);
    px[sy * P_DEEP + sx] = rnd() < 0.22 ? bright : dim;
  }

  c.putImageData(img, 0, 0);
  return cv;
}

// ─── Camada 2: Horizonte planetário (0,15×) ──────────────────────────────────

/** Deslocamento vertical da curvatura da Terra no ponto x de tela. */
function earthCurveY(x: number): number {
  const dx = x - VIEW_W / 2;
  return EARTH_R - Math.sqrt(EARTH_R * EARTH_R - dx * dx);
}

interface CityLight {
  readonly u: number;
  readonly v: number;
  readonly w: number;
  readonly bright: boolean;
  readonly phase: number;
}

const NE_CITIES: readonly CityLight[] = [
  { u: 110, v: 17, w: 1, bright: false, phase: 0.4 }, // São Luís
  { u: 172, v: 29, w: 1, bright: false, phase: 1.1 }, // Teresina
  { u: 196, v: 21, w: 1, bright: false, phase: 2.3 }, // Sobral
  { u: 225, v: 19, w: 2, bright: true, phase: 0.7 }, // Fortaleza
  { u: 229, v: 21, w: 1, bright: false, phase: 1.9 }, // Região Metropolitana
  { u: 222, v: 27, w: 2, bright: true, phase: 3.1 }, // Quixadá
  { u: 216, v: 39, w: 1, bright: false, phase: 4.2 }, // Juazeiro do Norte / Crato
  { u: 256, v: 24, w: 1, bright: false, phase: 2.8 }, // Aracati / Mossoró
  { u: 292, v: 29, w: 2, bright: true, phase: 0.2 }, // Natal
  { u: 291, v: 36, w: 1, bright: false, phase: 1.6 }, // João Pessoa
  { u: 287, v: 42, w: 2, bright: true, phase: 3.7 }, // Recife
  { u: 280, v: 49, w: 1, bright: false, phase: 5.0 }, // Maceió
  { u: 272, v: 54, w: 1, bright: false, phase: 2.1 }, // Aracaju
  { u: 262, v: 58, w: 2, bright: true, phase: 4.6 }, // Salvador
  { u: 334, v: 24, w: 1, bright: false, phase: 1.4 }, // Fernando de Noronha
];

/**
 * Silhueta aproximada do litoral do Nordeste / Ceará em espaço UV (P_EARTH × EARTH_H).
 * Norte fica em v=0, Sul em v=EARTH_H; Leste cresce com u.
 */
function isNortheastLand(u: number, v: number): boolean {
  if (u < 18 || u > 304 || v < 12) return false;
  // Costa norte (Pará/MA → PI → CE → esquina do RN)
  let topCoast = 16;
  if (u < 75) {
    topCoast = 22 - (u - 18) * 0.1;
  } else if (u < 120) {
    // Reentrância da Baía de São Marcos (MA)
    topCoast = 15 + Math.sin(((u - 75) / 45) * Math.PI) * 4;
  } else if (u < 175) {
    // Piauí / Delta
    topCoast = 16;
  } else if (u < 225) {
    // Costa oeste do Ceará até o cabo de Fortaleza
    topCoast = 15 - Math.sin(((u - 175) / 50) * Math.PI) * 2.5 + (u - 175) * 0.04;
  } else if (u < 265) {
    // Costa leste do Ceará (Fortaleza → Aracati)
    topCoast = 17 + (u - 225) * 0.16;
  } else {
    // Ponta do Rio Grande do Norte (Touros)
    topCoast = 23.4 + (u - 265) * 0.06;
  }
  if (v < topCoast) return false;

  // Costa leste Atlântica descendo do RN até a Bahia
  let eastCoast = 296;
  if (v < 25) {
    eastCoast = 296;
  } else if (v < 34) {
    eastCoast = 296 - (v - 25) * 0.4;
  } else if (v < 45) {
    eastCoast = 292 - (v - 34) * 0.8;
  } else if (v < 58) {
    // Alagoas / Sergipe / Baía de Todos-os-Santos
    eastCoast = 283 - (v - 45) * 1.4;
    if (v >= 55 && v <= 59) eastCoast -= 3;
  } else {
    eastCoast = 264 - (v - 58) * 1.1;
  }

  // Borda oeste do bloco continental dissolve suavemente em direção ao interior
  const westEdge = 18 + (v - 12) * 0.15;
  return u >= westEdge && u <= eastCoast;
}

function buildEarthStrip(): Cv {
  const { cv, c, img, px } = mkPixelCanvas(P_EARTH, EARTH_H);

  const ocean0 = pack(rgbOf('#113569'));
  const ocean1 = pack(rgbOf('#0d2752'));
  const ocean2 = pack(rgbOf('#091b3b'));
  const oceanDeep = pack(rgbOf('#07122a'));
  const coastCol = pack(rgbOf('#225368'));
  const landLight = pack(rgbOf('#1a382c'));
  const landMid = pack(rgbOf('#132a22'));
  const landDark = pack(rgbOf('#0e201b'));
  const cloudLight = pack(rgbOf('#7caed4'));
  const cloudMid = pack(rgbOf('#4e7ca8'));

  for (let v = 0; v < EARTH_H; v++) {
    const shade = v / (EARTH_H - 1);
    for (let u = 0; u < P_EARTH; u++) {
      const land = isNortheastLand(u, v);
      let col: number;

      if (land) {
        const edge =
          !isNortheastLand(u + 1, v) ||
          !isNortheastLand(u, v - 1) ||
          !isNortheastLand(u + 1, v - 1);
        if (edge) {
          col = coastCol;
        } else {
          const topo = fbmPeriodic(u, v, P_EARTH, 20, 811);
          const tone = topo - shade * 0.32;
          col = tone > 0.42 ? landLight : tone > 0.2 ? landMid : landDark;
        }
      } else {
        // Oceano Atlântico com gradiente Bayer dithered de luz solar na borda norte
        const t = shade * 3;
        const i = Math.min(2, Math.floor(t));
        const f = t - i;
        const oCols = [ocean0, ocean1, ocean2, oceanDeep] as const;
        col = f > bayer(u, v) ? (oCols[i + 1] ?? oceanDeep) : (oCols[i] ?? ocean0);
      }

      // Faixas sutis de nuvens sobre o Atlântico e parte do continente
      const cl = fbmPeriodic(u * 0.7, v * 1.4, P_EARTH, 28, 887);
      if (cl > 0.63 + shade * 0.08) {
        const strong = cl > 0.72;
        if (strong || ((u + v) & 1) === 0) {
          col = strong && v < 36 ? cloudLight : cloudMid;
        }
      }

      px[v * P_EARTH + u] = col;
    }
  }

  // Borda superior brilhante (horizonte iluminado da Terra)
  const rimBright = pack(rgbOf('#7ed6ff'));
  const rimMid = pack(rgbOf('#3c9ae0'));
  for (let u = 0; u < P_EARTH; u++) {
    px[u] = rimBright;
    px[P_EARTH + u] = rimMid;
  }

  c.putImageData(img, 0, 0);
  return cv;
}

/** Halo atmosférico azul-ciano acima da curvatura da Terra (320 × 44 px). */
function buildEarthHalo(): Cv {
  const HALO_H = 44;
  const { cv, c, img, px } = mkPixelCanvas(VIEW_W, HALO_H);
  const h1 = pack(rgbOf('#5ec8f2'), 165);
  const h2c = pack(rgbOf('#2f8bd4'), 110);
  const h3 = pack(rgbOf('#184888'), 65);
  const h4 = pack(rgbOf('#0c1e48'), 35);

  for (let x = 0; x < VIEW_W; x++) {
    const limb = Math.round(earthCurveY(x)) + 12;
    for (let y = 0; y < HALO_H; y++) {
      const dist = limb - y;
      if (dist <= 0 || dist > 11) continue;
      if (dist <= 2) px[y * VIEW_W + x] = h1;
      else if (dist <= 4 && bayer(x, y) < 0.75) px[y * VIEW_W + x] = h2c;
      else if (dist <= 7 && bayer(x, y) < 0.5) px[y * VIEW_W + x] = h3;
      else if (dist <= 11 && bayer(x, y) < 0.25) px[y * VIEW_W + x] = h4;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Galáxia espiral pixel-art pré-renderizada em duas variantes (Atos 2 e 3). */
function buildSpiralGalaxy(warmCore: string, armOuter: string, armInner: string, seed: number): Cv {
  const W = 52;
  const H = 30;
  const { cv, c, img, px } = mkPixelCanvas(W, H);
  const coreC = pack(rgbOf(warmCore), 210);
  const innerC = pack(rgbOf(armInner), 170);
  const outerC = pack(rgbOf(armOuter), 130);
  const dustC = pack(rgbOf(armOuter), 75);

  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Disco inclinado em elipse
      const dx = (x - cx) * 0.65;
      const dy = (y - cy) * 1.45;
      const r = Math.hypot(dx, dy);
      if (r > 15.5) continue;
      if (r <= 2.2) {
        px[y * W + x] = coreC;
        continue;
      }
      const ang = Math.atan2(dy, dx);
      // Dois braços espirais simétricos
      const spiral = Math.cos(2 * (ang - r * 0.42));
      const density = (spiral * 0.5 + 0.5) * (1 - r / 16);
      if (density > 0.42 + bayer(x, y) * 0.35) {
        px[y * W + x] = r < 6 ? innerC : outerC;
      } else if (density > 0.26 && h2(x, y, seed) < 0.28) {
        px[y * W + x] = dustC;
      }
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Silhueta pixel-art distante da Estação Espacial de Quixadá (48 × 36). */
function buildDistantStation(): Cv {
  const { cv, c } = mk(48, 36, 1);
  // Painéis solares dourados nas asas
  c.fillStyle = '#4e3f28';
  c.fillRect(2, 9, 14, 5);
  c.fillRect(2, 22, 14, 5);
  c.fillRect(32, 9, 14, 5);
  c.fillRect(32, 22, 14, 5);
  c.fillStyle = '#8b6d34';
  c.fillRect(3, 10, 12, 3);
  c.fillRect(3, 23, 12, 3);
  c.fillRect(33, 10, 12, 3);
  c.fillRect(33, 23, 12, 3);
  // Treliça central
  c.fillStyle = '#33405c';
  c.fillRect(16, 16, 16, 4);
  c.fillRect(8, 14, 2, 8);
  c.fillRect(38, 14, 2, 8);
  // Módulo principal iluminado ao longe
  c.fillStyle = '#495a7a';
  c.fillRect(19, 11, 10, 14);
  c.fillStyle = '#7389b0';
  c.fillRect(20, 12, 8, 11);
  c.fillStyle = '#a4bce0';
  c.fillRect(21, 13, 6, 3);
  // Doca esquerda + luz ciano
  c.fillStyle = '#5ec8f2';
  c.fillRect(17, 17, 2, 2);
  // Pequeno detalhe da bandeira do Ceará (verde/amarelo)
  c.fillStyle = '#3d8a2a';
  c.fillRect(23, 7, 4, 3);
  c.fillStyle = '#d99a1c';
  c.fillRect(24, 8, 2, 1);
  // Antena superior
  c.fillStyle = '#5c7094';
  c.fillRect(22, 5, 1, 6);
  return cv;
}

interface Constellation {
  readonly x: number;
  readonly pts: readonly (readonly [number, number])[];
  readonly edges: readonly (readonly [number, number])[];
}

const CONSTELLATIONS: readonly Constellation[] = [
  // Cruzeiro do Sul
  {
    x: 90,
    pts: [[0, 32], [10, 44], [0, 60], [-10, 46], [5, 52]],
    edges: [[0, 2], [1, 3]],
  },
  // Monólito / Galinha Choca estilizada (homenagem a Quixadá)
  {
    x: 270,
    pts: [[0, 42], [10, 34], [22, 38], [28, 48], [14, 52], [4, 50]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
  // Arco estelar do Sertão
  {
    x: 470,
    pts: [[0, 28], [14, 34], [24, 48], [18, 64], [32, 72]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
];

// ─── Camada 3: Plano médio (0,40×) ───────────────────────────────────────────

function buildAsteroidBelt(): Cv {
  const { cv, c } = mk(P_BELT, VIEW_H);
  const rnd = mulberry32(7703);

  const drawRock = (cx: number, cy: number, r: number): void => {
    const drawAt = (ox: number): void => {
      const x0 = cx + ox;
      c.fillStyle = '#0c1026';
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ang = Math.atan2(dy, dx);
          const jag = 0.78 + 0.25 * Math.sin(ang * 3 + cx * 0.1) + 0.14 * Math.cos(ang * 5 + cy);
          if (dx * dx + dy * dy <= (r * jag) * (r * jag)) {
            c.fillRect(Math.round(x0 + dx), Math.round(cy + dy), 1, 1);
          }
        }
      }
      // Borda muito discreta e escura (jamais branca/laranja para não competir com meteoros)
      c.fillStyle = '#151c3d';
      c.fillRect(Math.round(x0 - r * 0.4), Math.round(cy - r * 0.5), Math.max(1, Math.round(r * 0.6)), 1);
    };
    drawAt(0);
    if (cx < r + 4) drawAt(P_BELT);
    if (cx > P_BELT - r - 4) drawAt(-P_BELT);
  };

  // Cinturão de asteroides silhuetados escuros em duas faixas onduladas
  for (let i = 0; i < 34; i++) {
    const x = ri(rnd, P_BELT);
    const bandY = i % 2 === 0 ? 44 + Math.sin((x / P_BELT) * Math.PI * 2) * 18 : 136 + Math.cos((x / P_BELT) * Math.PI * 2) * 16;
    const y = Math.round(bandY + (rnd() - 0.5) * 26);
    const r = 3 + ri(rnd, 6);
    drawRock(x, y, r);
  }

  // Poeira rochosa minúscula
  c.fillStyle = '#101633';
  for (let i = 0; i < 40; i++) {
    c.fillRect(ri(rnd, P_BELT), 20 + ri(rnd, VIEW_H - 40), 2, 1);
  }

  // Satélites inativos bem escuros ao fundo (GDD §7.1)
  for (const sx of [165, 490]) {
    const sy = sx < 300 ? 34 : 146;
    c.fillStyle = '#101633';
    c.fillRect(sx - 6, sy - 1, 12, 2);
    c.fillStyle = '#161e42';
    c.fillRect(sx - 2, sy - 2, 4, 4);
    c.fillRect(sx - 6, sy - 3, 3, 6);
    c.fillRect(sx + 3, sy - 3, 3, 6);
  }

  return cv;
}

interface TwinkleStar {
  readonly x: number;
  readonly y: number;
  readonly rate: number;
  readonly phase: number;
  readonly dim: string;
  readonly bright: string;
  readonly cross: boolean;
}

const MID_STARS: readonly TwinkleStar[] = (() => {
  const rnd = mulberry32(7559);
  const pals: readonly (readonly [string, string])[] = [
    ['#485a94', '#8ea6e6'],
    ['#544b85', '#9c8cd4'],
    ['#415d7a', '#7ab3d4'],
    ['#75675a', '#baa486'],
  ];
  return Array.from({ length: 56 }, (_, i) => {
    const pair = pals[i % pals.length] ?? ['#485a94', '#8ea6e6'];
    return {
      x: ri(rnd, P_STARS),
      y: 6 + ri(rnd, VIEW_H - 16),
      rate: 1.6 + rnd() * 2.2,
      phase: rnd() * 4,
      dim: pair[0],
      bright: pair[1],
      cross: i % 7 === 0,
    };
  });
})();

// ─── Camada 4: Primeiro plano / Velocidade (1,15×) ───────────────────────────

interface DustSpec {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
  readonly size: number;
}

interface SpeedLine {
  readonly x: number;
  readonly y: number;
  readonly len: number;
  readonly alpha: number;
}

const FG_DUST: readonly DustSpec[] = (() => {
  const rnd = mulberry32(7817);
  return Array.from({ length: 18 }, (_, i) => ({
    x: ri(rnd, VIEW_W + 40),
    y: 10 + ri(rnd, VIEW_H - 20),
    phase: rnd() * Math.PI * 2,
    size: i % 5 === 0 ? 1 : 0.5,
  }));
})();

const FG_LINES: readonly SpeedLine[] = (() => {
  const rnd = mulberry32(7901);
  return Array.from({ length: 14 }, (_, i) => ({
    x: ri(rnd, VIEW_W + 40),
    // Mantém espaçamento limpo para não poluir projéteis na faixa central
    y: i % 3 === 0 ? 12 + ri(rnd, 32) : i % 3 === 1 ? 136 + ri(rnd, 34) : 52 + ri(rnd, 76),
    len: 2 + ri(rnd, 3), // 2..4 px
    alpha: i % 2 === 0 ? 0.18 : 0.14,
  }));
})();

// ─── Fábrica principal ───────────────────────────────────────────────────────

/**
 * Cria o parallax completo de 4 camadas da Fase 7 (Espaço Sideral).
 * Seguro para importação e execução mesmo em ambiente sem DOM (`document` ausente).
 */
export function createSpaceBackground(): Background {
  if (typeof document === 'undefined') {
    return {
      draw(ctx) {
        ctx.fillStyle = '#07091a';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      },
      drawForeground() {},
    };
  }

  const deepCanvases = DEEP_ACTS.map(buildDeepAct);
  const earthStrip = buildEarthStrip();
  const earthHalo = buildEarthHalo();
  const galaxyAto2 = buildSpiralGalaxy('#d8c49a', '#635399', '#8f7ec9', 7611);
  const galaxyAto3 = buildSpiralGalaxy('#e0a680', '#7a3b69', '#a85a7c', 7649);
  const distantStation = buildDistantStation();
  const beltCanvas = buildAsteroidBelt();

  const deepWeights = (camX: number): [number, number, number] => {
    const half = ACT_FADE_W / 2;
    const cuts = [ACT2_CAM_X, ACT3_CAM_X, ACT4_CAM_X] as const;
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i] ?? 0;
      if (camX < c - half) return [i, i, 0];
      if (camX < c + half) return [i, i + 1, smooth((camX - (c - half)) / ACT_FADE_W)];
    }
    return [3, 3, 0];
  };

  const drawTiled = (ctx: Ctx, cv: Cv, period: number, offset: number): void => {
    const start = -mod(snap(offset), period);
    for (let x = start; x < VIEW_W; x += period) {
      ctx.drawImage(cv, x, 0, period, VIEW_H);
    }
  };

  const drawEarth = (ctx: Ctx, camX: number, time: number): void => {
    // No Embarque/Ato 1 fica na base; desce suavemente entre camX 1900 e 4000
    const dropT = smooth((camX - 1900) / (4000 - 1900));
    const baseTopY = 122 + dropT * 74;
    if (baseTopY >= VIEW_H + 10) return;

    const uOff = camX * 0.15;

    // Halo atmosférico azul-ciano acima da curvatura
    ctx.drawImage(earthHalo, 0, snap(baseTopY - 12), VIEW_W, 44);

    // Superfície curvada em fatias de 2 px (oceano, nuvens, Nordeste / Ceará)
    for (let x = 0; x < VIEW_W; x += 2) {
      const y = snap(baseTopY + earthCurveY(x));
      if (y >= VIEW_H) continue;
      const h = Math.min(EARTH_H, VIEW_H - y);
      if (h <= 0) continue;
      const u = mod(Math.floor(uOff + x), P_EARTH);
      if (u + 2 <= P_EARTH) {
        ctx.drawImage(earthStrip, u, 0, 2, h, x, y, 2, h);
      } else {
        ctx.drawImage(earthStrip, u, 0, 1, h, x, y, 1, h);
        ctx.drawImage(earthStrip, 0, 0, 1, h, x + 1, y, 1, h);
      }
    }

    // Luzes douradas das cidades do Nordeste à noite (com leve cintilação)
    for (const c of NE_CITIES) {
      const sx = c.u - mod(uOff, P_EARTH);
      for (const px of [sx, sx + P_EARTH, sx - P_EARTH]) {
        if (px < -4 || px >= VIEW_W + 4) continue;
        const sy = snap(baseTopY + earthCurveY(clamp(px, 0, VIEW_W)) + c.v);
        if (sy < 0 || sy >= VIEW_H) continue;
        const twinkle = Math.sin(time * 2.4 + c.phase) > -0.6;
        if (!twinkle && !c.bright) continue;
        ctx.fillStyle = c.bright ? '#ffd23f' : '#e8a04a';
        ctx.fillRect(snap(px), sy, c.w, 1);
      }
    }
  };

  const drawConstellationsAndGalaxies = (ctx: Ctx, camX: number): void => {
    // Visível nos Atos 2 e 3 (fade-in 3000..3600, fade-out 9100..9700)
    const alphaIn = smooth((camX - 3000) / 600);
    const alphaOut = 1 - smooth((camX - 9100) / 600);
    const alpha = alphaIn * alphaOut;
    if (alpha <= 0.01) return;

    const off = camX * 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Constelações sutis
    for (const cst of CONSTELLATIONS) {
      const base = cst.x - mod(off, P_CONST);
      for (let bx = base - P_CONST; bx < VIEW_W + 48; bx += P_CONST) {
        if (bx < -48) continue;
        // Linhas finas muito discretas
        ctx.strokeStyle = 'rgba(92, 118, 184, 0.16)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const [ia, ib] of cst.edges) {
          const a = cst.pts[ia];
          const b = cst.pts[ib];
          if (!a || !b) continue;
          ctx.moveTo(snap(bx + a[0]) + 0.5, snap(a[1]) + 0.5);
          ctx.lineTo(snap(bx + b[0]) + 0.5, snap(b[1]) + 0.5);
        }
        ctx.stroke();

        // Nós estelares da constelação
        ctx.fillStyle = '#6c85c4';
        for (const [px, py] of cst.pts) {
          ctx.fillRect(snap(bx + px), snap(py), 1, 1);
        }
      }
    }

    // Galáxias espirais pixel-art ao longe (uma no Ato 2, outra no Ato 3)
    const gx2 = snap(820 - off);
    if (gx2 > -60 && gx2 < VIEW_W + 10) {
      ctx.drawImage(galaxyAto2, gx2, 30, 52, 30);
    }
    const gx3 = snap(1260 - off);
    if (gx3 > -60 && gx3 < VIEW_W + 10) {
      ctx.drawImage(galaxyAto3, gx3, 36, 52, 30);
    }

    ctx.restore();
  };

  const drawDistantStation = (ctx: Ctx, camX: number, time: number): void => {
    // Cresce ao longe de camX 9000..11350 e desaparece suavemente até 11712 (antes da EEIQ real no c.64)
    if (camX < 9000 || camX >= SPACE_BRAKE_START_CAM_X) return;
    const grow = smooth((camX - 9000) / (11350 - 9000));
    const fadeIn = smooth((camX - 9000) / 420);
    const fadeOut = 1 - smooth((camX - 11350) / (SPACE_BRAKE_START_CAM_X - 11350));
    const alpha = fadeIn * fadeOut;
    if (alpha <= 0.01) return;

    const scale = 0.25 + grow * 0.65;
    const w = Math.max(4, Math.round(48 * scale));
    const h = Math.max(3, Math.round(36 * scale));
    // Posicionada à esquerda da Nave-Mãe (x=264) para permanecer legível no Ato 4
    const sx = snap(206 - (camX - 9000) * 0.014 - w / 2);
    const sy = snap(46 + grow * 6 - h / 2);

    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.drawImage(distantStation, sx, sy, w, h);

    // Farol de acoplagem piscando suavemente à distância
    if (Math.sin(time * 3.5) > 0) {
      ctx.fillStyle = '#9fe0ff';
      ctx.fillRect(snap(sx + w * 0.35), snap(sy + h * 0.48), 1, 1);
    }
    ctx.restore();
  };

  const drawMediumStars = (ctx: Ctx, camX: number, time: number): void => {
    const off = camX * 0.4;
    for (const s of MID_STARS) {
      const frame = Math.floor(time * s.rate + s.phase) & 1;
      const sx = snap(s.x - mod(off, P_STARS));
      for (const px of [sx, sx + P_STARS]) {
        if (px < -3 || px >= VIEW_W + 3) continue;
        ctx.fillStyle = frame === 0 ? s.dim : s.bright;
        ctx.fillRect(px, s.y, 1, 1);
        if (s.cross && frame === 1) {
          ctx.fillStyle = s.dim;
          ctx.fillRect(px - 1, s.y, 1, 1);
          ctx.fillRect(px + 1, s.y, 1, 1);
          ctx.fillRect(px, s.y - 1, 1, 1);
          ctx.fillRect(px, s.y + 1, 1, 1);
        }
      }
    }
  };

  return {
    draw(ctx, camX, _camY, time) {
      // Camada 1 — Fundo profundo (0,05×)
      ctx.fillStyle = '#07091a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      const [actA, actB, mix] = deepWeights(camX);
      const offDeep = camX * 0.05;
      const cvA = deepCanvases[actA];
      if (cvA) drawTiled(ctx, cvA, P_DEEP, offDeep);

      if (actB !== actA && mix > 0) {
        const cvB = deepCanvases[actB];
        if (cvB) {
          ctx.save();
          ctx.globalAlpha = mix;
          drawTiled(ctx, cvB, P_DEEP, offDeep);
          ctx.restore();
        }
      }

      // Véu atmosférico extra no Embarque (camX 0..960)
      if (camX < 960) {
        const emb = 1 - smooth(camX / 960);
        const g = ctx.createLinearGradient(0, 86, 0, VIEW_H);
        g.addColorStop(0, 'rgba(20, 32, 86, 0)');
        g.addColorStop(1, `rgba(26, 46, 118, ${(0.28 * emb).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 86, VIEW_W, VIEW_H - 86);
      }

      // Camada 2 — Horizonte planetário (0,15×)
      drawEarth(ctx, camX, time);
      drawConstellationsAndGalaxies(ctx, camX);
      drawDistantStation(ctx, camX, time);

      // Camada 3 — Plano médio (0,40×)
      drawMediumStars(ctx, camX, time);
      drawTiled(ctx, beltCanvas, P_BELT, camX * 0.4);
    },

    drawForeground(ctx, camX, _camY, time) {
      // Camada 4 — Primeiro plano / Velocidade (1,15×)
      const speedRatio =
        camX >= SPACE_STOP_CAM_X
          ? 0
          : camX >= SPACE_BRAKE_START_CAM_X
            ? scrollSpeedAt(camX) / SPACE.scrollSpeed
            : 1;

      const off = camX * 1.15;

      // Poeira cósmica sutil
      ctx.fillStyle = 'rgba(180,220,255,0.12)';
      for (const d of FG_DUST) {
        const sx = VIEW_W + 16 - mod(d.x + off, VIEW_W + 32);
        const sy = d.y + Math.sin(time * 0.9 + d.phase) * 1.5;
        ctx.fillRect(snap(sx), snap(sy), d.size, d.size);
      }

      // Speedlines finas (2–4 px), reduzindo o comprimento na desaceleração final
      if (speedRatio <= 0.02) return;
      for (const s of FG_LINES) {
        const len = Math.max(0.5, snap(s.len * speedRatio));
        const a = s.alpha * Math.min(1, speedRatio * 1.25);
        ctx.fillStyle = `rgba(180,220,255,${a.toFixed(3)})`;
        const sx = VIEW_W + 16 - mod(s.x + off, VIEW_W + 32);
        ctx.fillRect(snap(sx), s.y, len, 0.5);
      }
    },
  };
}
