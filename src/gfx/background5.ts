import type { Background } from '../core/types';
import { RENDER_SCALE, VIEW_H, VIEW_W } from '../core/constants';
import { UBER } from '../game/uberRules';
import { LEVEL5_RAMP_COLS, LEVEL5_ROWS } from '../game/level5';

/*
 * Parallax da Fase 5 — "Marginal de São Paulo (De Uber até o Galpão)", versão 2.
 *
 * Quatro trechos que contam a passagem da noite ao amanhecer (GDD §7), trocando nas rampas do mapa:
 *  1. Marginal Tietê à noite — céu azul-escuro, skyline com janelas acesas, pista expressa ao fundo
 *     com faróis e o Tietê refletindo neon.
 *  2. Minhocão — elevado num corredor de prédios colados e altos, janelas acesas, varais e grafites.
 *  3. Túnel — parede de azulejos com faixa de luz correndo e TETO sólido preso ao mundo, cuja borda
 *     inferior fica em y de mundo 80 (as luminárias `i` do mapa ficam penduradas logo abaixo).
 *  4. Ponte Estaiada ao amanhecer — céu virando rosa/pêssego, mastro em X com estais, cidade ao longe.
 *
 * Pontos de troca derivados do MAPA (LEVEL5_RAMP_COLS e o 3º `K` da linha 11), com fallback nos
 * compassos 22 / 40 / 57 enquanto o mapa for stub. A troca é um crossfade de 1 compasso (192 px)
 * centrado no ponto, medido na posição neutra do Pardo (camX + UBER.screenNeutral).
 *
 * LEITURA: a região de jogo (y de tela ≈ 60..136) tem baixo contraste e baixa saturação; cada trecho
 * termina com um "véu" translúcido nessa faixa. Amarelo/preto zebrado, verde de placa, branco puro e
 * laranja vivo ficam reservados ao gameplay.
 *
 * Desempenho: tudo o que é estático é pré-renderizado em canvases offscreen (escala S) no create;
 * por quadro só há drawImage em faixas e alguns fillRect animados.
 */

const S = RENDER_SCALE;
const TILE = UBER.tile;
/** 1 compasso de câmera (px): duração do crossfade entre trechos. */
const BAR_PX = UBER.barCols * TILE;
/** Borda inferior do teto do túnel (y de MUNDO). */
const TUNNEL_CEIL_WORLD_Y = 80;
/** Região de jogo (y de tela) onde o fundo precisa ficar calmo. */
const PLAY_TOP = 60;
const PLAY_BOTTOM = 136;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

// ─── utilidades determinísticas ──────────────────────────────────────────────

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

function pick<T>(rnd: Rnd, arr: readonly T[], fallback: T): T {
  return arr[ri(rnd, arr.length)] ?? fallback;
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

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/** Canvas offscreen em escala S, desenhado em unidades lógicas. */
function mk(w: number, h: number): { cv: Cv; c: Ctx } {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * S);
  cv.height = Math.round(h * S);
  const c = cv.getContext('2d');
  if (!c) throw new Error('Canvas 2D indisponível para o cenário da Marginal de São Paulo');
  c.imageSmoothingEnabled = false;
  c.scale(S, S);
  return { cv, c };
}

function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

/** Linha pixelada (pontos de w×w) — estais, mastro, varais. */
function pline(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
  c.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.fillRect(snap(x0 + (x1 - x0) * t - w / 2), snap(y0 + (y1 - y0) * t - w / 2), w, w);
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

function rgbOf(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── camadas ─────────────────────────────────────────────────────────────────

/** Faixa horizontal repetida: canvas de largura `period` × VIEW_H rolando a camX·f. */
interface Layer {
  readonly cv: Cv;
  readonly period: number;
  readonly f: number;
}

function drawLayer(ctx: Ctx, L: Layer, camX: number, dy: number): void {
  const off = snap(camX * L.f);
  const y = snap(dy * L.f);
  for (let x = -mod(off, L.period); x < VIEW_W; x += L.period) {
    ctx.drawImage(L.cv, x, y, L.period, VIEW_H);
  }
}

/** Posição de tela (x) de um ponto `px` de um padrão de período `period` que rola a camX·f. */
function each(camX: number, f: number, period: number, px: number, margin: number, fn: (sx: number) => void): void {
  const base = px - mod(camX * f, period);
  for (let sx = base - period; sx < VIEW_W + margin; sx += period) {
    if (sx > -margin) fn(snap(sx));
  }
}

type Stop = readonly [number, string];

/** Céu em degradê com dithering Bayer (pixel lógico) + decoração opcional por pixel. */
function buildSky(stops: readonly Stop[], deco?: (put: (x: number, y: number, rgb: string) => void, rnd: Rnd) => void, seed = 1): Cv {
  const cv = document.createElement('canvas');
  cv.width = VIEW_W * S;
  cv.height = VIEW_H * S;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o céu da Marginal');
  const img = ctx.createImageData(cv.width, cv.height);
  const d = new Uint32Array(img.data.buffer);
  const pack = (rgb: readonly [number, number, number]): number =>
    (0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  const putN = (lx: number, ly: number, col: number): void => {
    if (lx < 0 || lx >= VIEW_W || ly < 0 || ly >= VIEW_H) return;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) d[(ly * S + j) * cv.width + lx * S + i] = col;
    }
  };
  for (let ly = 0; ly < VIEW_H; ly++) {
    let i = 0;
    while (i < stops.length - 2 && ly >= (stops[i + 1]?.[0] ?? VIEW_H)) i++;
    const a = stops[i] ?? stops[0];
    const b = stops[i + 1] ?? a;
    if (!a || !b) continue;
    const t = Math.min(1, Math.max(0, (ly - a[0]) / Math.max(1, b[0] - a[0])));
    const ca = pack(rgbOf(a[1]));
    const cb = pack(rgbOf(b[1]));
    for (let lx = 0; lx < VIEW_W; lx++) putN(lx, ly, t > bayer(lx, ly) ? cb : ca);
  }
  if (deco) deco((x, y, rgb) => putN(Math.round(x), Math.round(y), pack(rgbOf(rgb))), mulberry32(seed));
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Estrelas esparsas acima de `maxY`. */
function stars(put: (x: number, y: number, rgb: string) => void, rnd: Rnd, n: number, maxY: number, dim: string, bright: string): void {
  for (let k = 0; k < n; k++) put(ri(rnd, VIEW_W), ri(rnd, maxY), rnd() < 0.25 ? bright : dim);
}

/** Véu que achata contraste/saturação na região de jogo (bordas suaves de 10 px). */
function makeVeil(rgb: string, a: number): (ctx: Ctx) => void {
  return (ctx) => {
    const g = ctx.createLinearGradient(0, PLAY_TOP - 10, 0, PLAY_BOTTOM + 10);
    const e = 10 / (PLAY_BOTTOM - PLAY_TOP + 20);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(e, `rgba(${rgb},${a})`);
    g.addColorStop(1 - e, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, PLAY_TOP - 10, VIEW_W, PLAY_BOTTOM - PLAY_TOP + 20);
  };
}

/** Linha de prédios com janelas: janelas acima da região de jogo são mais vivas. */
function buildingRow(
  c: Ctx,
  rnd: Rnd,
  period: number,
  base: number,
  hMin: number,
  hMax: number,
  wMin: number,
  wMax: number,
  cols: readonly string[],
  winP: number,
  seed: number,
  onTop?: (x: number, top: number, w: number) => void,
): void {
  let x = 0;
  while (x < period) {
    const w = wMin + ri(rnd, wMax - wMin + 1);
    const h = hMin + ri(rnd, hMax - hMin + 1);
    const top = base - h;
    const col = pick(rnd, cols, '#161a36');
    const roof = ri(rnd, 3);
    const x0 = x;
    rep(c, period, () => {
      R(c, x0, top, w, VIEW_H - top, col);
      if (roof === 0) R(c, x0 + 2, top - 3, Math.max(3, w - 6), 3, col);
      R(c, x0, top, w, 1, 'rgba(120,128,180,0.18)');
      for (let wy = top + 3; wy < base - 3; wy += 4) {
        for (let wx = x0 + 2; wx < x0 + w - 2; wx += 3) {
          const v = h2(wx, wy, seed);
          if (v >= winP) continue;
          const hi = wy < PLAY_TOP;
          const k = v / winP;
          R(c, wx, wy, 1, 2, k < 0.6 ? (hi ? '#d8a462' : '#6e6150') : k < 0.85 ? (hi ? '#b67c4c' : '#5e5048') : hi ? '#79b8d0' : '#4c5a6a');
        }
      }
    });
    onTop?.(x0, top, w);
    x += w + 1 + ri(rnd, 3);
  }
}

// ─── Trecho 1: Marginal Tietê à noite ─────────────────────────────────────────

interface Scene {
  draw(ctx: Ctx, camX: number, dy: number, time: number): void;
  fg(ctx: Ctx, camX: number, time: number): void;
}

interface Blink {
  x: number;
  y: number;
  phase: number;
}

function sceneMarginal(): Scene {
  const sky = buildSky(
    [
      [0, '#05071a'],
      [36, '#0b1030'],
      [76, '#151c46'],
      [104, '#262652'],
      [118, '#1a1a3c'],
      [180, '#0a0b18'],
    ],
    (put, rnd) => {
      stars(put, rnd, 46, 56, '#7f88c0', '#e2e6ff');
      // Lua pálida com halo
      for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          const d = Math.hypot(dx, dy);
          const x = 266 + dx;
          const y = 22 + dy;
          if (d <= 5.5) put(x, y, dx > 2 ? '#b2bcdc' : '#e6eaf8');
          else if (d <= 11 && ((11 - d) / 5.5) * 0.6 > bayer(x, y)) put(x, y, '#2a3672');
        }
      }
    },
    8085,
  );

  // Skyline distante (f 0.08)
  const P_SKY = 640;
  const skyline = mk(P_SKY, VIEW_H);
  const blinks: Blink[] = [];
  {
    const rnd = mulberry32(5101);
    const { c } = skyline;
    buildingRow(c, rnd, P_SKY, 114, 22, 52, 12, 26, ['#141834', '#181c3c', '#12162e'], 0.07, 11);
    buildingRow(c, rnd, P_SKY, 114, 34, 76, 14, 30, ['#10132a', '#131730', '#0f1228'], 0.11, 23, (x, top, w) => {
      if (rnd() < 0.3 && top - 12 < PLAY_TOP - 4) {
        rep(c, P_SKY, () => R(c, x + (w >> 1), top - 12, 1, 12, '#2c2e52'));
        blinks.push({ x: x + (w >> 1), y: top - 12, phase: x * 0.13 });
      }
    });
  }
  const L_SKY: Layer = { cv: skyline.cv, period: P_SKY, f: 0.08 };

  // Pista expressa do outro lado do rio (f 0.3): tabuleiro, pilares e postes
  const P_EXP = 512;
  const exp = mk(P_EXP, VIEW_H);
  {
    const { c } = exp;
    R(c, 0, 97, P_EXP, 1, '#262a48');
    for (let x = 0; x < P_EXP; x += 4) R(c, x, 97, 1, 3, '#20243e');
    R(c, 0, 100, P_EXP, 6, '#1c1f36');
    R(c, 0, 100, P_EXP, 1, '#2a2e4c');
    R(c, 0, 106, P_EXP, 2, '#131528');
    for (let x = 12; x < P_EXP; x += 64) R(c, x, 108, 6, 10, '#161930');
    for (let x = 40; x < P_EXP; x += 128) {
      R(c, x, 84, 1, 13, '#262a46');
      R(c, x - 3, 84, 4, 1, '#262a46');
      R(c, x - 4, 85, 3, 1, '#8a7a5c');
      radial(c, x - 2, 88, 8, '170,140,100', 0.12);
    }
  }
  const L_EXP: Layer = { cv: exp.cv, period: P_EXP, f: 0.3 };

  // Rio Tietê (f 0.55): margem oposta, outdoors neon foscos e reflexos
  const P_RIV = 512;
  const riv = mk(P_RIV, VIEW_H);
  const neon: readonly (readonly [number, string, string])[] = [
    [60, '#7a4c80', '122,76,128'],
    [196, '#3e7484', '62,116,132'],
    [300, '#8a7050', '138,112,80'],
    [420, '#6c4a7e', '108,74,126'],
  ];
  {
    const { c } = riv;
    const rnd = mulberry32(6203);
    // Margem oposta
    R(c, 0, 110, P_RIV, 4, '#11132a');
    for (let x = 0; x < P_RIV; x += 6) if (h2(x, 1, 7) < 0.4) R(c, x, 111, 1, 1, '#5a5048');
    // Outdoors neon (pequenos, foscos)
    for (const [nx, col] of neon) {
      R(c, nx + 8, 102, 1, 8, '#1a1c34');
      R(c, nx, 94, 18, 8, '#181a32');
      R(c, nx + 1, 95, 16, 6, col);
      R(c, nx + 3, 97, 12, 2, 'rgba(10,12,30,0.45)');
    }
    // Água
    const g = c.createLinearGradient(0, 114, 0, 146);
    g.addColorStop(0, '#111737');
    g.addColorStop(1, '#070a1a');
    c.fillStyle = g;
    c.fillRect(0, 114, P_RIV, 32);
    // Reflexos verticais quebrados dos outdoors
    for (const [nx, , rgb] of neon) {
      for (let y = 116; y < 144; y += 2) {
        const a = 0.42 * (1 - (y - 116) / 30);
        const w = 4 + ri(rnd, 12);
        R(c, nx + 9 - w / 2 + ri(rnd, 3) - 1, y, w, 1, `rgba(${rgb},${a.toFixed(2)})`);
      }
    }
    // Reflexos esparsos das janelas do skyline
    for (let k = 0; k < 70; k++) {
      R(c, ri(rnd, P_RIV), 116 + ri(rnd, 24), 1 + ri(rnd, 3), 1, 'rgba(150,126,92,0.22)');
    }
  }
  const L_RIV: Layer = { cv: riv.cv, period: P_RIV, f: 0.55 };

  // Margem da pista (f 0.9): mureta e acostamento
  const P_BANK = 256;
  const bank = mk(P_BANK, VIEW_H);
  {
    const { c } = bank;
    R(c, 0, 144, P_BANK, 36, '#0f1018');
    R(c, 0, 144, P_BANK, 6, '#23252f');
    R(c, 0, 144, P_BANK, 1, '#33364a');
    for (let x = 0; x < P_BANK; x += 32) R(c, x, 145, 1, 5, '#181a24');
  }
  const L_BANK: Layer = { cv: bank.cv, period: P_BANK, f: 0.9 };

  const veil = makeVeil('20,24,52', 0.3);

  return {
    draw(ctx, camX, dy, time) {
      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
      drawLayer(ctx, L_SKY, camX, dy);
      // Luzes vermelhas de aviação piscando no alto das antenas (acima da região de jogo)
      for (const b of blinks) {
        if (Math.sin(time * 2.6 + b.phase) < 0.1) continue;
        each(camX, L_SKY.f, P_SKY, b.x, 2, (sx) => {
          ctx.fillStyle = '#c8443c';
          ctx.fillRect(sx, snap(b.y + dy * L_SKY.f), 1, 1);
        });
      }
      drawLayer(ctx, L_EXP, camX, dy);
      // Faróis na pista expressa: brancos (sentido contrário) e lanternas (mesmo sentido), foscos
      const offE = camX * L_EXP.f;
      for (let k = 0; k < 9; k++) {
        const x1 = mod(k * 61 - offE - time * 150, VIEW_W + 40) - 20;
        ctx.fillStyle = 'rgba(214,206,186,0.5)';
        ctx.fillRect(snap(x1), snap(101 + dy * L_EXP.f), 2, 1);
        ctx.fillRect(snap(x1 + 3), snap(101 + dy * L_EXP.f), 2, 1);
        const x2 = mod(k * 47 + 13 - offE + time * 40, VIEW_W + 40) - 20;
        ctx.fillStyle = 'rgba(170,70,80,0.45)';
        ctx.fillRect(snap(x2), snap(103 + dy * L_EXP.f), 1, 1);
        ctx.fillRect(snap(x2 + 3), snap(103 + dy * L_EXP.f), 1, 1);
      }
      drawLayer(ctx, L_RIV, camX, dy);
      // Brilho trêmulo do neon na água
      for (const [nx, , rgb] of neon) {
        each(camX, L_RIV.f, P_RIV, nx + 9, 20, (sx) => {
          for (let r = 0; r < 4; r++) {
            const y = 118 + r * 6 + dy * L_RIV.f;
            const w = 6 + 4 * Math.sin(time * 3 + r * 1.7 + nx);
            ctx.fillStyle = `rgba(${rgb},0.3)`;
            ctx.fillRect(snap(sx - w / 2 + Math.sin(time * 2 + r) * 2), snap(y), snap(w), 1);
          }
        });
      }
      drawLayer(ctx, L_BANK, camX, dy);
      veil(ctx);
    },
    fg(ctx, camX, time) {
      speedLines(ctx, camX, time, '200,212,240', 0.16);
      poles(ctx, camX, 'lamp', '#0b0d18', '210,180,130');
    },
  };
}

// ─── Trecho 2: Minhocão ──────────────────────────────────────────────────────

const CLOTHES = ['#6a5a6e', '#5a6a72', '#7a6a5a', '#6e6e6e', '#5c5470'] as const;

/** Varal entre duas janelas com roupas penduradas (cores foscas). */
function varal(c: Ctx, rnd: Rnd, x: number, y: number, w: number): void {
  R(c, x, y, w, 1, '#3e3a46');
  for (let px = x + 2; px < x + w - 2; px += 3 + ri(rnd, 2)) {
    R(c, px, y + 1, 2, 2 + ri(rnd, 3), pick(rnd, CLOTHES, '#6a5a6e'));
  }
}

/** Pichação: letras altas e angulosas (estilo pixo) em tom escuro/fosco. */
function pixo(c: Ctx, rnd: Rnd, x: number, y: number, n: number, col: string): void {
  let px = x;
  for (let i = 0; i < n; i++) {
    const h = 8 + ri(rnd, 5);
    R(c, px, y - h, 1, h, col);
    const kind = ri(rnd, 4);
    if (kind === 0) R(c, px, y - h, 3, 1, col);
    if (kind === 1) R(c, px + 2, y - h, 1, h, col);
    if (kind === 2) R(c, px, y - (h >> 1), 3, 1, col);
    if (kind === 3) {
      R(c, px + 1, y - h + 2, 1, 2, col);
      R(c, px + 2, y - h, 1, h - 3, col);
    }
    px += 4 + ri(rnd, 2);
  }
}

function sceneMinhocao(): Scene {
  const sky = buildSky(
    [
      [0, '#110e26'],
      [18, '#251a3a'],
      [40, '#3a2742'],
      [70, '#2a2034'],
      [180, '#141018'],
    ],
    (put, rnd) => stars(put, rnd, 10, 16, '#6a6488', '#b8b2d4'),
    3301,
  );

  // Fachadas do fundo (f 0.3): altas, coladas, varais e ar-condicionado
  const P_FAR = 512;
  const far = mk(P_FAR, VIEW_H);
  {
    const { c } = far;
    const rnd = mulberry32(7307);
    let x = 0;
    while (x < P_FAR) {
      const w = 28 + ri(rnd, 30);
      const top = 6 + ri(rnd, 22);
      const col = pick(rnd, ['#2a2536', '#2f2a38', '#262232', '#2c2632'] as const, '#2a2536');
      const x0 = x;
      const seed = 31 + x0;
      const hasVaral = rnd() < 0.5;
      const varalRows = [ri(rnd, 6), 6 + ri(rnd, 6)];
      rep(c, P_FAR, () => {
        R(c, x0, top, w, VIEW_H - top, col);
        R(c, x0, top, w, 2, '#3a3444');
        R(c, x0 + w - 1, top, 1, VIEW_H - top, '#1c1926');
        let row = 0;
        for (let wy = top + 5; wy < 150; wy += 7, row++) {
          for (let wx = x0 + 3; wx < x0 + w - 4; wx += 6) {
            const v = h2(wx, wy, seed);
            const hi = wy < PLAY_TOP;
            const lit = v < 0.32;
            R(c, wx, wy, 3, 4, lit ? (v < 0.24 ? (hi ? '#c49a62' : '#7a6650') : hi ? '#7d92b4' : '#56607a') : '#1e1b27');
            if (v > 0.9) R(c, wx, wy + 4, 3, 1, '#3a3640');
          }
          if (hasVaral && varalRows.includes(row)) varal(c, mulberry32(seed + row), x0 + 3, wy + 5, w - 6);
        }
      });
      x += w;
    }
  }
  const L_FAR: Layer = { cv: far.cv, period: P_FAR, f: 0.3 };

  // Fachadas próximas (f 0.8): mais escuras, janelas grandes, grafites; becos raros mostram o fundo
  const P_NEAR = 640;
  const near = mk(P_NEAR, VIEW_H);
  {
    const { c } = near;
    const rnd = mulberry32(7411);
    let x = 0;
    while (x < P_NEAR) {
      const w = 64 + ri(rnd, 52);
      const top = -4 + ri(rnd, 14);
      const col = pick(rnd, ['#1b1820', '#201c26', '#1d1b22'] as const, '#1b1820');
      const x0 = x;
      const seed = 91 + x0;
      const pal = mulberry32(seed);
      const tagCol = pick(pal, ['#0e0c12', '#3a3048', '#2e3a40'] as const, '#0e0c12');
      const bomb = pick(pal, ['#4a4058', '#3e4a52', '#4c4448'] as const, '#4a4058');
      rep(c, P_NEAR, () => {
        R(c, x0, top, w, VIEW_H - top, col);
        R(c, x0, top, 2, VIEW_H - top, '#26222e');
        R(c, x0 + w - 2, top, 2, VIEW_H - top, '#141218');
        // Faixas de laje entre andares
        for (let fy = top + 16; fy < 140; fy += 16) R(c, x0, fy, w, 1, '#24202c');
        for (let wy = top + 4; wy < 132; wy += 16) {
          for (let wx = x0 + 6; wx < x0 + w - 10; wx += 14) {
            const v = h2(wx, wy, seed);
            const hi = wy < PLAY_TOP - 8;
            R(c, wx - 1, wy - 1, 8, 10, '#15131a');
            R(c, wx, wy, 6, 8, v < 0.22 ? (hi ? '#a0805a' : '#5a4c3e') : v < 0.3 ? (hi ? '#6a7a96' : '#3e4656') : '#18161e');
            R(c, wx, wy + 4, 6, 1, '#15131a');
            if (v > 0.82) R(c, wx - 2, wy + 9, 10, 1, '#2a2632'); // sacada
          }
        }
        // Grafite grande fosco + pichação na parte baixa do prédio (rnd novo: as 2 cópias ficam iguais)
        const graf = mulberry32(seed + 1);
        const gx = x0 + 8 + ri(graf, Math.max(1, w - 50));
        R(c, gx, 112, 34, 12, bomb);
        R(c, gx + 2, 114, 30, 8, col);
        for (let k = 0; k < 4; k++) R(c, gx + 4 + k * 7, 115, 5, 6, bomb);
        pixo(c, graf, x0 + 6, 106, Math.max(2, Math.floor((w - 12) / 6)), tagCol);
      });
      // Varal entre prédios vizinhos, no alto
      if (rnd() < 0.5) rep(c, P_NEAR, () => varal(c, mulberry32(seed + 5), x0 + w - 20, top + 30, 40));
      x += w + (rnd() < 0.25 ? 10 + ri(rnd, 14) : 0);
    }
  }
  const L_NEAR: Layer = { cv: near.cv, period: P_NEAR, f: 0.8 };

  // Guarda-corpo do elevado (f 0.95) com pichações
  const P_PAR = 256;
  const par = mk(P_PAR, VIEW_H);
  {
    const { c } = par;
    const rnd = mulberry32(7523);
    R(c, 0, 142, P_PAR, 38, '#121016');
    R(c, 0, 142, P_PAR, 8, '#2e2a34');
    R(c, 0, 142, P_PAR, 1, '#3e3a46');
    for (let x = 0; x < P_PAR; x += 40) R(c, x, 143, 1, 7, '#1c1a22');
    for (let x = 8; x < P_PAR - 30; x += 70 + ri(rnd, 30)) pixo(c, rnd, x, 150, 4 + ri(rnd, 3), '#1a1820');
  }
  const L_PAR: Layer = { cv: par.cv, period: P_PAR, f: 0.95 };

  const veil = makeVeil('30,26,40', 0.3);

  return {
    draw(ctx, camX, dy) {
      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
      drawLayer(ctx, L_FAR, camX, dy);
      drawLayer(ctx, L_NEAR, camX, dy);
      drawLayer(ctx, L_PAR, camX, dy);
      veil(ctx);
    },
    fg(ctx, camX, time) {
      speedLines(ctx, camX, time, '200,190,210', 0.15);
      poles(ctx, camX, 'lamp', '#0c0a10', '200,170,130');
    },
  };
}

// ─── Trecho 3: Túnel ─────────────────────────────────────────────────────────

function sceneTunel(): Scene {
  const P_WALL = 256;
  const wall = mk(P_WALL, VIEW_H);
  {
    const { c } = wall;
    const rnd = mulberry32(8807);
    R(c, 0, 0, P_WALL, VIEW_H, '#121418');
    // Sombra sob o teto
    R(c, 0, 66, P_WALL, 6, '#1a1d22');
    // Azulejos 8×6 com rejunte
    const tile = ['#36404a', '#333d46', '#38424c', '#343e48'] as const;
    for (let y = 72; y < 140; y += 6) {
      for (let x = 0; x < P_WALL; x += 8) {
        R(c, x, y, 8, 6, '#283038');
        R(c, x, y, 7, 5, tile[Math.floor(h2(x, y, 3) * tile.length)] ?? '#36404a');
      }
    }
    // Manchas de fuligem escorrendo
    for (let k = 0; k < 14; k++) {
      const x = ri(rnd, P_WALL);
      const w = 2 + ri(rnd, 4);
      const h = 20 + ri(rnd, 40);
      rep(c, P_WALL, () => R(c, x, 72, w, h, 'rgba(10,12,16,0.18)'));
    }
    // Calha da faixa de luz
    R(c, 0, 78, P_WALL, 3, '#1e2329');
    R(c, 0, 79, P_WALL, 1, '#59666c');
    // Nichos de emergência
    for (let x = 60; x < P_WALL; x += 128) {
      R(c, x, 104, 20, 32, '#22282e');
      R(c, x + 1, 105, 18, 30, '#1c2126');
      R(c, x + 8, 108, 4, 2, '#5a3a3c');
    }
    // Rodapé e meio-fio
    R(c, 0, 136, P_WALL, 8, '#22272d');
    R(c, 0, 136, P_WALL, 1, '#2e343b');
    R(c, 0, 144, P_WALL, 36, '#0e1013');
  }
  const L_WALL: Layer = { cv: wall.cv, period: P_WALL, f: 0.9 };

  const veil = makeVeil('26,30,36', 0.25);

  return {
    draw(ctx, camX, dy, time) {
      drawLayer(ctx, L_WALL, camX, dy);
      // Faixa de luz correndo pela calha (mais rápida que a rolagem)
      const y = snap(79 + dy * L_WALL.f);
      const span = VIEW_W + 120;
      for (let k = 0; k < 3; k++) {
        const x = mod(k * 147 - time * 260 - camX * 0.9, span) - 60;
        const g = ctx.createLinearGradient(x, 0, x + 48, 0);
        g.addColorStop(0, 'rgba(190,214,214,0)');
        g.addColorStop(0.7, 'rgba(190,214,214,0.55)');
        g.addColorStop(1, 'rgba(190,214,214,0)');
        ctx.fillStyle = g;
        ctx.fillRect(snap(x), y, 48, 1);
        ctx.fillStyle = 'rgba(160,190,196,0.06)';
        ctx.fillRect(snap(x + 8), y + 1, 36, 10);
      }
      veil(ctx);
    },
    fg(ctx, camX, time) {
      speedLines(ctx, camX, time, '170,190,200', 0.2);
      poles(ctx, camX, 'bollard', '#0a0b0e', '');
    },
  };
}

/** Padrão do teto do túnel (128 × 96): a borda inferior fica na base do canvas. */
const CEIL_P = 128;
const CEIL_H = 96;
function buildCeiling(): Cv {
  const { cv, c } = mk(CEIL_P, CEIL_H);
  const b = CEIL_H;
  R(c, 0, 0, CEIL_P, b, '#14161a');
  for (let x = 0; x < CEIL_P; x += 32) R(c, x, 0, 1, b - 8, '#0e1013');
  for (let y = b - 40; y > 0; y -= 24) R(c, 0, y, CEIL_P, 1, '#1a1d22');
  // Eletrocalha
  R(c, 0, b - 14, CEIL_P, 3, '#1e2126');
  R(c, 0, b - 14, CEIL_P, 1, '#2a2e34');
  for (let x = 6; x < CEIL_P; x += 16) R(c, x, b - 11, 1, 3, '#1a1c20');
  // Viga/beiral da borda inferior
  R(c, 0, b - 7, CEIL_P, 7, '#262a30');
  R(c, 0, b - 7, CEIL_P, 1, '#343940');
  R(c, 0, b - 1, CEIL_P, 1, '#0c0d10');
  for (let x = 0; x < CEIL_P; x += 64) R(c, x, b - 6, 1, 5, '#1c1f24');
  return cv;
}

// ─── Trecho 4: Ponte Estaiada ao amanhecer ───────────────────────────────────

function scenePonte(): Scene {
  const sky = buildSky(
    [
      [0, '#1c1d44'],
      [28, '#33305e'],
      [56, '#55426a'],
      [82, '#7a5672'],
      [102, '#9a6c78'],
      [116, '#b08680'],
      [130, '#7a5e6c'],
      [180, '#2a2236'],
    ],
    (put, rnd) => {
      stars(put, rnd, 12, 24, '#7a78a8', '#c8c4e8');
      // Sol nascendo, pálido e meio escondido atrás da cidade
      for (let dy = -14; dy <= 14; dy++) {
        for (let dx = -14; dx <= 14; dx++) {
          const d = Math.hypot(dx, dy);
          const x = 236 + dx;
          const y = 104 + dy;
          if (d <= 7) put(x, y, '#d8b49c');
          else if (d <= 13 && ((13 - d) / 6) * 0.55 > bayer(x, y)) put(x, y, '#c0948a');
        }
      }
    },
    9403,
  );

  // Nuvens finas iluminadas por baixo (f 0.04)
  const P_CL = 512;
  const cl = mk(P_CL, VIEW_H);
  {
    const { c } = cl;
    const rnd = mulberry32(9411);
    for (const [bx, by, bw] of [
      [20, 30, 130],
      [190, 44, 90],
      [320, 22, 150],
    ] as const) {
      for (let dx = 0; dx < bw; dx += 2) {
        const h = Math.max(1, Math.round(Math.sin((Math.PI * dx) / bw) * (3 + ri(rnd, 3))));
        rep(c, P_CL, () => {
          R(c, bx + dx, by - h, 2, h, 'rgba(70,56,100,0.7)');
          R(c, bx + dx, by, 2, 1, 'rgba(214,150,140,0.55)');
        });
      }
    }
  }
  const L_CL: Layer = { cv: cl.cv, period: P_CL, f: 0.04 };

  // Cidade ao longe (f 0.1)
  const P_CITY = 640;
  const city = mk(P_CITY, VIEW_H);
  buildingRow(city.c, mulberry32(9421), P_CITY, 118, 10, 34, 10, 24, ['#4a3c5c', '#54445f', '#463a58'], 0.04, 41);
  const L_CITY: Layer = { cv: city.cv, period: P_CITY, f: 0.1 };

  // Ponte Estaiada (f 0.35): mastro em X, estais em leque, tabuleiro curvo
  const P_BR = 768;
  const MX = 420;
  const br = mk(P_BR, VIEW_H);
  {
    const { c } = br;
    const deckY = 118;
    // Estais: das cabeças do mastro até o tabuleiro, em leque dos dois lados
    for (let k = 0; k < 9; k++) {
      const hy = 16 + k * 5;
      for (const side of [-1, 1]) {
        const tx = MX + side * (40 + k * 18);
        pline(c, MX + side * ((hy - 16) * 0.12), hy, tx, deckY, 0.5, 'rgba(206,182,196,0.32)');
      }
    }
    // Pernas do mastro cruzando em X
    for (const side of [-1, 1]) {
      pline(c, MX + side * 26, deckY + 6, MX - side * 14, 4, 3, '#3e3250');
      pline(c, MX + side * 26 + 1, deckY + 6, MX - side * 14 + 1, 4, 1, '#8a7488');
    }
    // Tabuleiro
    R(c, 0, deckY, P_BR, 4, '#3a3048');
    R(c, 0, deckY, P_BR, 1, '#6a5670');
    R(c, 0, deckY + 4, P_BR, 2, '#2a2236');
    for (let x = 30; x < P_BR; x += 96) R(c, x, deckY + 6, 6, 14, '#2e2640');
  }
  const L_BR: Layer = { cv: br.cv, period: P_BR, f: 0.35 };

  // Rio ao amanhecer (f 0.55)
  const P_RIV = 512;
  const riv = mk(P_RIV, VIEW_H);
  {
    const { c } = riv;
    const rnd = mulberry32(9431);
    const g = c.createLinearGradient(0, 124, 0, 150);
    g.addColorStop(0, '#5a4660');
    g.addColorStop(1, '#2a2236');
    c.fillStyle = g;
    c.fillRect(0, 124, P_RIV, 26);
    for (let k = 0; k < 60; k++) {
      R(c, ri(rnd, P_RIV), 126 + ri(rnd, 20), 3 + ri(rnd, 10), 1, 'rgba(196,150,146,0.25)');
    }
  }
  const L_RIV: Layer = { cv: riv.cv, period: P_RIV, f: 0.55 };

  // Guarda-corpo da pista (f 0.9)
  const P_BANK = 256;
  const bank = mk(P_BANK, VIEW_H);
  {
    const { c } = bank;
    R(c, 0, 144, P_BANK, 36, '#18141e');
    R(c, 0, 144, P_BANK, 6, '#3a3442');
    R(c, 0, 144, P_BANK, 1, '#544a5c');
    for (let x = 0; x < P_BANK; x += 32) R(c, x, 145, 1, 5, '#2a2432');
  }
  const L_BANK: Layer = { cv: bank.cv, period: P_BANK, f: 0.9 };

  const veil = makeVeil('84,66,92', 0.28);

  return {
    draw(ctx, camX, dy, time) {
      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
      drawLayer(ctx, L_CL, camX + time * 30, dy);
      drawLayer(ctx, L_CITY, camX, dy);
      drawLayer(ctx, L_BR, camX, dy);
      // Luz de aviação no topo do mastro (acima da região de jogo)
      if (Math.sin(time * 2.4) > 0) {
        each(camX, L_BR.f, P_BR, MX, 4, (sx) => {
          ctx.fillStyle = '#c8443c';
          ctx.fillRect(sx - 14, snap(3 + dy * L_BR.f), 1, 1);
          ctx.fillRect(sx + 14, snap(3 + dy * L_BR.f), 1, 1);
        });
      }
      drawLayer(ctx, L_RIV, camX, dy);
      drawLayer(ctx, L_BANK, camX, dy);
      veil(ctx);
    },
    fg(ctx, camX, time) {
      speedLines(ctx, camX, time, '236,214,214', 0.16);
      poles(ctx, camX, 'lamp', '#231c2c', '230,190,170');
    },
  };
}

// ─── primeiro plano compartilhado ────────────────────────────────────────────

/** Linhas de vento: só nas faixas y 38..54 e 166..178 (fora da região do Pardo e das ameaças). */
const LINES = (() => {
  const rnd = mulberry32(9901);
  return Array.from({ length: 16 }, (_, i) => ({
    x: ri(rnd, VIEW_W + 100),
    y: i % 2 === 0 ? 38 + ri(rnd, 16) : 166 + ri(rnd, 12),
    len: 10 + ri(rnd, 26),
    speed: 60 + ri(rnd, 120),
  }));
})();

function speedLines(ctx: Ctx, camX: number, time: number, rgb: string, a: number): void {
  ctx.fillStyle = `rgba(${rgb},${a})`;
  for (const s of LINES) {
    const sx = VIEW_W + 40 - mod(s.x + camX * 1.6 + time * s.speed, VIEW_W + 100);
    ctx.fillRect(snap(sx), s.y, snap(s.len), 0.5);
  }
}

/**
 * Poste/pilar passando rápido (f 1.5), de vez em quando. Só a cabeça do poste aparece no alto
 * (y < 52) e o pé do pilar embaixo (y > 164): nunca cobre a região de jogo.
 */
function poles(ctx: Ctx, camX: number, kind: 'lamp' | 'bollard', col: string, glow: string): void {
  const P = 560;
  each(camX, 1.5, P, 200, 24, (x) => {
    if (kind === 'lamp') {
      ctx.fillStyle = col;
      ctx.fillRect(x, 0, 4, 28);
      ctx.fillRect(x - 16, 26, 20, 2);
      ctx.fillRect(x - 18, 28, 10, 2);
      const g = ctx.createRadialGradient(x - 13, 30, 0, x - 13, 30, 20);
      g.addColorStop(0, `rgba(${glow},0.14)`);
      g.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - 33, 28, 40, 22);
    }
    ctx.fillStyle = col;
    ctx.fillRect(x - 2, 166, kind === 'lamp' ? 10 : 6, VIEW_H - 166);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x - 2, 166, 1, VIEW_H - 166);
  });
}

// ─── pontos de troca (derivados do mapa) ─────────────────────────────────────

/** Coluna inicial do compasso n (1-based). */
const barCol = (n: number): number => UBER.barCols * (n - 1);

/** x de mundo das três trocas de cenário: 1→2, 2→3, 3→4. */
function computeSwitches(): [number, number, number] {
  const r0 = LEVEL5_RAMP_COLS[0];
  const r1 = LEVEL5_RAMP_COLS[1];
  const row11 = LEVEL5_ROWS[11] ?? '';
  const ks: number[] = [];
  for (let x = 0; x < row11.length; x++) if (row11[x] === 'K') ks.push(x);
  const k3 = ks[2];
  const s1 = (r0 ?? barCol(22)) * TILE;
  const s2 = Math.max((r1 !== undefined ? r1 + UBER.rampCols : barCol(40)) * TILE, s1 + BAR_PX);
  const s3 = Math.max((k3 ?? barCol(57)) * TILE, s2 + BAR_PX);
  return [s1, s2, s3];
}

/** Fábrica do parallax da Fase 5 — Marginal de São Paulo (noite → Minhocão → túnel → amanhecer). */
export function createUberBackground(): Background {
  const scenes: readonly Scene[] = [sceneMarginal(), sceneMinhocao(), sceneTunel(), scenePonte()];
  const [s1, s2, s3] = computeSwitches();
  const sw = [s1, s2, s3] as const;
  const ceiling = buildCeiling();
  const half = BAR_PX / 2;

  // Buffer do trecho que está entrando durante o crossfade
  const buf = document.createElement('canvas');
  buf.width = VIEW_W * S;
  buf.height = VIEW_H * S;
  const bctx = buf.getContext('2d');
  if (!bctx) throw new Error('Canvas 2D indisponível para o cenário da Marginal de São Paulo');
  bctx.imageSmoothingEnabled = false;
  bctx.setTransform(S, 0, 0, S, 0, 0);

  /** [trecho atual, trecho seguinte, peso do seguinte] na posição neutra do Pardo. */
  const mix = (camX: number): [number, number, number] => {
    const x = camX + UBER.screenNeutral;
    for (let i = 0; i < sw.length; i++) {
      const s = sw[i] ?? 0;
      if (x < s - half) return [i, i, 0];
      if (x < s + half) return [i, i + 1, smooth((x - (s - half)) / BAR_PX)];
    }
    return [3, 3, 0];
  };

  const drawCeiling = (ctx: Ctx, camX: number, camY: number): void => {
    const x0 = s2 - camX;
    const x1 = s3 - camX;
    if (x1 < -32 || x0 > VIEW_W + 32) return;
    const bottom = TUNNEL_CEIL_WORLD_Y - camY;
    const cx0 = Math.max(0, x0);
    const cx1 = Math.min(VIEW_W, x1);
    if (cx1 > cx0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx0, 0, cx1 - cx0, bottom);
      ctx.clip();
      // Padrão preso ao mundo (múltiplos de CEIL_P em x de mundo), como as luminárias
      for (let x = -mod(camX, CEIL_P); x < cx1; x += CEIL_P) {
        if (x + CEIL_P < cx0) continue;
        ctx.drawImage(ceiling, snap(x), bottom - CEIL_H, CEIL_P, CEIL_H);
      }
      ctx.restore();
    }
    // Emboques (entrada e saída) de concreto, presos ao mundo
    for (const [px, dir] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      if (px < -28 || px > VIEW_W + 28) continue;
      const fx = snap(dir < 0 ? px - 22 : px);
      ctx.fillStyle = '#2c2e34';
      ctx.fillRect(fx, 0, 22, bottom + 6);
      ctx.fillStyle = '#3c4048';
      ctx.fillRect(fx, bottom + 4, 22, 2);
      ctx.fillRect(dir < 0 ? fx : fx + 21, 0, 1, bottom + 6);
      ctx.fillStyle = '#1a1c20';
      ctx.fillRect(dir < 0 ? fx + 21 : fx, 0, 1, bottom + 6);
      for (let y = 8; y < bottom; y += 12) {
        ctx.fillStyle = '#25272c';
        ctx.fillRect(fx + 1, y, 20, 1);
      }
    }
  };

  return {
    draw(ctx, camX, camY, time) {
      const dy = UBER.camY - camY;
      const [a, b, t] = mix(camX);
      ctx.fillStyle = '#0a0b14';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      scenes[a]?.draw(ctx, camX, dy, time);
      if (b !== a && t > 0) {
        bctx.clearRect(0, 0, VIEW_W, VIEW_H);
        scenes[b]?.draw(bctx, camX, dy, time);
        ctx.save();
        ctx.globalAlpha = t;
        ctx.drawImage(buf, 0, 0, VIEW_W, VIEW_H);
        ctx.restore();
      }
      drawCeiling(ctx, camX, camY);
    },

    drawForeground(ctx, camX, _camY, time) {
      const [a, b, t] = mix(camX);
      ctx.save();
      ctx.globalAlpha = b !== a ? 1 - t : 1;
      scenes[a]?.fg(ctx, camX, time);
      if (b !== a && t > 0) {
        ctx.globalAlpha = t;
        scenes[b]?.fg(ctx, camX, time);
      }
      ctx.restore();
    },
  };
}
