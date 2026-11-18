import type { Background } from '../core/types';
import { VIEW_H, VIEW_W } from '../core/constants';

/*
 * Parallax da Fase 5 — "Marginal de São Paulo (De Uber até o Galpão)".
 *
 * 100% Canvas 2D procedural. As camadas estáticas são pré-renderizadas uma única vez em canvases
 * offscreen na escala RENDER_SCALE (S = 2) no boot para rodar a 60 FPS cravados.
 *
 * Direção visual inspirada em Mega Man X4 (Jet Stingray) ambientada na Marginal Tietê /
 * Ponte Estaiada / Minhocão à noite:
 *  - Céu noturno paulistano em dithering Bayer (#07091a → #101534 → #1d204a → #352758 → #4c315e),
 *    estrelas no alto, lua com halo e helicóptero distante patrulhando com holofote.
 *  - Camada 1 (parallax 0.10): Skyline monumental de São Paulo (antenas de treliça da Av. Paulista
 *    com luzes vermelhas de aviação piscando, Banespão/Farol Santander, Edifício Copan em curvas
 *    horizontais iluminadas e a Ponte Estaiada Octávio Frias de Oliveira com mastro em "X" em LEDs
 *    ciano/turquesa e cabos estaiados dourados).
 *  - Camada 2 (parallax 0.26): Via Expressa Elevada / Minhocão com pilares de concreto, pórticos
 *    verdes de sinalização ("MARGINAL TIETÊ") e feixes horizontais de luz (light trails) vermelhos
 *    e brancos/amarelos deslizando em alta velocidade.
 *  - Camada 3 (parallax 0.52): Rio Tietê (y = 122..180) com águas escuras e reflexos horizontais
 *    trêmulos de néon e vapor de sódio, mureta/guard-rail da Marginal, outdoors neon e postes
 *    passando em velocidade.
 *  - Primeiro plano (parallax 1.35): linhas cinéticas sutis de vento nas bordas superior e inferior
 *    e feixes verticais translúcidos de postes passando em alta velocidade sem tapar a visão.
 */

const S = 2;
/** Margem superior lógica dos canvases de camada para absorver deslocamento vertical da câmera. */
const MT = 24;
const LH = 240;
/** camY de referência com o Pardo no teto do Uber / pista principal (mapa de 14 linhas: 224 - 180 = 44). */
const BASE_CAM_Y = 44;

/** Linha de base do skyline distante. */
const SKY_GY = 112;
/** Linha do tabuleiro da Via Expressa / Minhocão. */
const VIA_Y = 104;
/** Linha da mureta / margem do Rio Tietê. */
const BANK_Y = 122;

const P_CLOUD = 512;
const P_SKY = 640;
const P_VIA = 512;
const P_BANK = 512;

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
  if (!c) throw new Error('Canvas 2D indisponível para o cenário da Marginal de São Paulo');
  c.scale(S, S);
  c.translate(0, margin);
  return { cv, c };
}

function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Linha pixelada construída em passos de meio pixel / 1 pixel. */
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

// ─── 1. Céu Noturno Paulistano (Bayer dithering + estrelas + lua + helicóptero) ──

const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, '#07091a'],
  [26, '#101534'],
  [56, '#1d204a'],
  [86, '#352758'],
  [112, '#4c315e'],
  [132, '#24193c'],
  [180, '#070b18'],
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
  if (!ctx) throw new Error('Canvas 2D indisponível para o céu da Marginal');
  const img = ctx.createImageData(cv.width, cv.height);
  const d = new Uint32Array(img.data.buffer);
  const pack = (rgb: readonly [number, number, number]): number =>
    (0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  const put = (lx: number, ly: number, col: number): void => {
    if (lx < 0 || lx >= VIEW_W || ly < 0 || ly >= VIEW_H) return;
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
    for (let lx = 0; lx < VIEW_W; lx++) {
      put(lx, ly, t > bayer(lx, ly) ? cb : ca);
    }
  }

  // Estrelas sutis no alto da noite paulistana
  const rnd = mulberry32(8085);
  for (let k = 0; k < 44; k++) {
    const lx = ri(rnd, VIEW_W);
    const ly = ri(rnd, 66);
    const bright = rnd() < 0.25;
    put(lx, ly, pack(bright ? [232, 236, 255] : [132, 142, 198]));
  }

  // Lua crescente/cheia pálida com halo dithered no canto superior direito
  const mCx = 264;
  const mCy = 24;
  const cHaloOuter = pack([32, 42, 88]);
  const cHaloInner = pack([68, 82, 138]);
  const cMoonBody = pack([230, 234, 248]);
  const cMoonShade = pack([178, 188, 220]);
  for (let dy = -16; dy <= 16; dy++) {
    for (let dx = -16; dx <= 16; dx++) {
      const dist = Math.hypot(dx, dy);
      const lx = mCx + dx;
      const ly = mCy + dy;
      if (dist <= 6.2) {
        const crater = (dx === 1 && dy === -1) || (dx === -2 && dy === 2) || (dx === 2 && dy === 2);
        put(lx, ly, crater || dx > 3 ? cMoonShade : cMoonBody);
      } else if (dist <= 10.5) {
        const k = (10.5 - dist) / 4.3;
        if (k * 0.7 > bayer(lx, ly)) put(lx, ly, cHaloInner);
      } else if (dist <= 15.5) {
        const k = (15.5 - dist) / 5.0;
        if (k * 0.45 > bayer(lx, ly)) put(lx, ly, cHaloOuter);
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return cv;
}

function buildClouds(): Cv {
  const { cv, c } = mk(P_CLOUD, 72, 0);
  const rnd = mulberry32(8123);
  const banks: readonly (readonly [number, number, number, number])[] = [
    [18, 34, 136, 10],
    [176, 48, 108, 8],
    [304, 28, 152, 11],
    [418, 52, 92, 7],
  ];
  for (const [bx, by, bw, bh] of banks) {
    const prof: number[] = [];
    for (let dx = 0; dx < bw; dx += 2) {
      const u = dx / bw;
      prof.push(Math.pow(Math.sin(Math.PI * u), 0.8) * bh * (0.72 + 0.28 * rnd()));
    }
    rep(c, P_CLOUD, () => {
      prof.forEach((p, i) => {
        const x = bx + i * 2;
        R(c, x, by - p, 2, p, 'rgba(26,24,58,0.68)');
        R(c, x, by - 2, 2, 2, 'rgba(138,76,126,0.34)');
        if (p > 5) R(c, x, by - p, 2, 1, 'rgba(84,96,158,0.25)');
      });
    });
  }
  return cv;
}

/** Desenha um helicóptero distante do trânsito de São Paulo com cone de busca e luz estroboscópica. */
function drawHelicopter(ctx: Ctx, camX: number, dySky: number, time: number): void {
  const period = VIEW_W + 140;
  const hx = snap(mod(220 - time * 11 - camX * 0.04, period) - 50);
  const hy = snap(29 + dySky + Math.sin(time * 1.9) * 1.8);
  if (hx < -30 || hx > VIEW_W + 30) return;

  // Feixe cônico de holofote varrendo a metrópole ao longe
  const sweep = Math.sin(time * 1.1) * 8;
  ctx.save();
  ctx.fillStyle = 'rgba(210, 240, 255, 0.065)';
  ctx.beginPath();
  ctx.moveTo(hx - 2, hy + 2);
  ctx.lineTo(hx - 18 + sweep, hy + 46);
  ctx.lineTo(hx - 5 + sweep, hy + 46);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Silhueta escura da aeronave (cauda à direita, nariz à esquerda)
  ctx.fillStyle = '#090b1c';
  ctx.fillRect(hx - 3, hy, 6, 3); // cabine
  ctx.fillRect(hx - 4, hy + 1, 1, 2); // nariz
  ctx.fillRect(hx + 3, hy + 1, 6, 1); // cone de cauda
  ctx.fillRect(hx + 8, hy - 1, 1, 2); // leme vertical
  ctx.fillRect(hx - 2, hy + 3, 5, 0.5); // esquis

  // Parabrisa iluminado
  ctx.fillStyle = '#5ee8ff';
  ctx.fillRect(hx - 3.5, hy + 1, 2, 1);

  // Rotor principal girando em alta frequência
  const bladeW = Math.sin(time * 38) > 0 ? 11 : 7;
  ctx.fillStyle = 'rgba(180, 200, 240, 0.55)';
  ctx.fillRect(snap(hx - bladeW * 0.5), hy - 1, bladeW, 0.5);

  // Luz de navegação piscando na cauda (vermelha) e barriga (branca)
  if (Math.sin(time * 9) > 0.2) {
    ctx.fillStyle = '#ff384c';
    ctx.fillRect(hx + 8, hy - 1, 1, 1);
  }
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(hx - 2, hy + 2, 1, 1);
}

// ─── 2. Camada 1 — Skyline Monumental de São Paulo à Noite (parallax 0.10) ───

interface Skyline {
  readonly cv: Cv;
  readonly lights: readonly { x: number; y: number; phase: number }[];
}

function buildSkyline(): Skyline {
  const { cv, c } = mk(P_SKY, LH, MT);
  const rnd = mulberry32(9011);
  const lights: { x: number; y: number; phase: number }[] = [];

  const paintBuildingRow = (
    cols: readonly string[],
    hMin: number,
    hMax: number,
    wMin: number,
    wMax: number,
    winP: number,
    seed: number,
    antennas: boolean,
    skipRanges: readonly (readonly [number, number])[],
  ): void => {
    let x = 0;
    while (x < P_SKY) {
      const w = wMin + ri(rnd, wMax - wMin + 1);
      const inSkip = skipRanges.some(([a, b]) => x + w > a && x < b);
      const h = inSkip ? 14 + ri(rnd, 16) : hMin + ri(rnd, hMax - hMin + 1);
      const col = cols[ri(rnd, cols.length)] ?? '#12152e';
      const top = SKY_GY - h;
      const roof = ri(rnd, 4);
      const ant = antennas && !inSkip && rnd() < 0.35;
      rep(c, P_SKY, () => {
        R(c, x, top, w, h + 40, col);
        R(c, x, top, w, 1, 'rgba(130,115,185,0.22)');
        if (roof === 0) R(c, x + 2, top - 3, Math.max(3, w - 6), 3, col);
        if (roof === 1) R(c, x + w - 6, top - 4, 4, 4, col);
        if (ant) {
          R(c, x + (w >> 1), top - 10, 1, 10, '#3a3860');
        }
        for (let wy = top + 4; wy < SKY_GY - 4; wy += 4) {
          for (let wx = x + 2; wx < x + w - 3; wx += 3) {
            const v = h2(wx, wy, seed);
            if (v >= winP) continue;
            const k = v / winP;
            const wCol = k < 0.52 ? '#f4bd6a' : k < 0.78 ? '#d68c4a' : '#7ad6f0';
            R(c, wx, wy, 1, 2, wCol);
          }
        }
      });
      if (ant) lights.push({ x: x + (w >> 1), y: top - 10, phase: x * 0.17 });
      x += w + 1 + ri(rnd, 3);
    }
  };

  // Fileira de fundo: silhueta azul-noturna esfumaçada
  paintBuildingRow(
    ['#1b1c3e', '#212248', '#181a38'],
    38,
    84,
    14,
    26,
    0.08,
    19,
    false,
    [[416, 566]],
  );

  // Marco 1: Banespão / Farol Santander (torre escalonada Art Déco em x = 52..84)
  const bx = 68;
  rep(c, P_SKY, () => {
    // Base larga
    R(c, bx - 15, SKY_GY - 54, 30, 64, '#131632');
    R(c, bx - 15, SKY_GY - 54, 30, 1, '#323564');
    // Corpo médio escalonado
    R(c, bx - 11, SKY_GY - 76, 22, 24, '#161938');
    R(c, bx - 11, SKY_GY - 76, 22, 1, '#383b6e');
    // Torre central alta
    R(c, bx - 7, SKY_GY - 92, 14, 18, '#181c3d');
    R(c, bx - 4, SKY_GY - 98, 8, 6, '#1e2248');
    R(c, bx - 2, SKY_GY - 102, 4, 4, '#282c5a');
    // Mastro no topo
    R(c, bx, SKY_GY - 111, 1, 9, '#55588a');

    // Frisos verticais iluminados característicos do Farol Santander
    for (const vx of [bx - 8, bx - 4, bx, bx + 3, bx + 7]) {
      for (let vy = SKY_GY - 72; vy < SKY_GY - 10; vy += 4) {
        if (h2(vx, vy, 41) < 0.65) {
          R(c, vx, vy, 1, 2, '#f5c26b');
        }
      }
    }
    // Lanterna do mirante no topo iluminada em âmbar dourado
    R(c, bx - 3, SKY_GY - 95, 6, 2, '#ffe08a');
    radial(c, bx, SKY_GY - 94, 10, '255,200,95', 0.25);
  });
  lights.push({ x: bx, y: SKY_GY - 111, phase: 0.4 });

  // Marco 2: Arranha-céus da Av. Paulista com grandes antenas de treliça e luzes de aviação
  for (const [ax, aw, ah] of [
    [138, 26, 78],
    [224, 24, 72],
    [584, 26, 76],
  ] as const) {
    const top = SKY_GY - ah;
    rep(c, P_SKY, () => {
      R(c, ax, top, aw, ah + 40, '#121530');
      R(c, ax, top, aw, 1, 'rgba(130,150,220,0.28)');
      R(c, ax + 1, top, 1, ah, 'rgba(120,140,210,0.14)');
      // Base da torre de transmissão no terraço
      const mx = ax + (aw >> 1);
      R(c, mx - 4, top - 4, 8, 4, '#1b1f42');
      // Mastro de treliça da Paulista
      R(c, mx - 2, top - 38, 1, 34, '#464a7a');
      R(c, mx + 1, top - 38, 1, 34, '#464a7a');
      R(c, mx, top - 46, 1, 10, '#5e6298');
      for (let ty = top - 36; ty < top - 4; ty += 5) {
        pline(c, mx - 2, ty, mx + 1, ty + 4, 1, '#393d69');
      }
      R(c, mx - 4, top - 28, 8, 1, '#585c90');
      R(c, mx - 3, top - 16, 6, 1, '#585c90');

      // Janelas corporativas em faixas horizontais
      for (let wy = top + 5; wy < SKY_GY - 6; wy += 4) {
        const litRow = h2(ax, wy, 73) < 0.45;
        for (let wx = ax + 3; wx < ax + aw - 3; wx += 3) {
          const v = h2(wx, wy, 77);
          if (v < (litRow ? 0.55 : 0.18)) {
            R(c, wx, wy, 2, 1, v < 0.25 ? '#7ce2ff' : '#f2be68');
          }
        }
      }
    });
    lights.push({ x: ax + (aw >> 1), y: top - 46, phase: ax * 0.11 });
    lights.push({ x: ax + (aw >> 1), y: top - 28, phase: ax * 0.11 + 1.4 });
  }

  // Marco 3: Edifício Copan (x = 304..376) com suas icônicas curvas horizontais iluminadas
  const copanX = 304;
  const copanW = 68;
  const copanTop = SKY_GY - 74;
  rep(c, P_SKY, () => {
    // Silhueta curva em "S" do bloco de concreto
    for (let y = copanTop; y < SKY_GY + 10; y++) {
      for (let dx = 0; dx < copanW; dx++) {
        const u = dx / copanW;
        const curve = Math.sin(u * Math.PI * 2) * 3.5;
        const py = Math.round(y + curve);
        if (py >= copanTop - 4 && py < SKY_GY + 12) {
          R(c, copanX + dx, py, 1, 1, dx < 22 || (dx > 44 && dx < 54) ? '#1c2044' : '#121530');
        }
      }
    }
    // Brises horizontais curvos do Copan com janelas acesas acompanhando a ondulação
    for (let fy = copanTop + 3; fy < SKY_GY - 4; fy += 3) {
      for (let dx = 2; dx < copanW - 2; dx++) {
        const u = dx / copanW;
        const curve = Math.sin(u * Math.PI * 2) * 3.5;
        const py = Math.round(fy + curve);
        // Linha do brise de concreto
        R(c, copanX + dx, py, 1, 1, '#2b305e');
        // Fita luminosa de apartamentos sob o brise
        const v = h2(dx >> 1, fy, 99);
        if (v < 0.42) {
          R(c, copanX + dx, py + 1, 1, 1, v < 0.28 ? '#f6c36b' : '#7ae4ff');
        }
      }
    }
  });

  // Marco 4: Ponte Estaiada Octávio Frias de Oliveira (x = 416..568)
  // Mastro em "X" iluminado em LEDs ciano/turquesa e cabos estaiados dourados!
  const pCx = 492;
  const pDeckY = 104;
  const pTopY = 24;
  rep(c, P_SKY, () => {
    // Halo noturno suave atrás do mastro estaiado
    radial(c, pCx, 66, 46, '24,210,235', 0.14);
    radial(c, pCx, 82, 52, '245,180,70', 0.1);

    // Cabos estaiados dourados partindo dos braços superiores do "X" até o tabuleiro
    for (let i = 0; i < 9; i++) {
      const ay = pTopY + 5 + i * 3.6;
      const t = (ay - pTopY) / (pDeckY - pTopY);
      // Posição X nos braços superiores do X (que cruzam a cintura em y = 68)
      const spreadTop = 18 * (1 - t * 1.45);
      const lxAnchor = pCx - Math.abs(spreadTop);
      const rxAnchor = pCx + Math.abs(spreadTop);
      const colCable = i % 2 === 0 ? 'rgba(248,188,80,0.72)' : 'rgba(224,154,58,0.52)';
      pline(c, lxAnchor, ay, pCx - 16 - i * 6.5, pDeckY - 1, 1, colCable);
      pline(c, rxAnchor, ay, pCx + 16 + i * 6.5, pDeckY - 1, 1, colCable);
    }

    // Pernas do mastro em "X" (cruzamento inferior na cintura y = 68 e abertura no topo)
    // Perna esquerda-base -> direita-topo e direita-base -> esquerda-topo
    pline(c, pCx - 20, SKY_GY + 6, pCx - 3, 68, 3, '#183a56');
    pline(c, pCx + 20, SKY_GY + 6, pCx + 3, 68, 3, '#183a56');
    pline(c, pCx - 3, 68, pCx - 15, pTopY, 3, '#183a56');
    pline(c, pCx + 3, 68, pCx + 15, pTopY, 3, '#183a56');

    // Núcleo iluminado em LEDs ciano/turquesa no mastro em "X"
    pline(c, pCx - 19, SKY_GY + 4, pCx - 2, 68, 1.5, '#19d4e8');
    pline(c, pCx + 19, SKY_GY + 4, pCx + 2, 68, 1.5, '#19d4e8');
    pline(c, pCx - 2, 68, pCx - 14, pTopY, 1.5, '#2cf0ff');
    pline(c, pCx + 2, 68, pCx + 14, pTopY, 1.5, '#2cf0ff');

    // Travessas horizontais do mastro em "X"
    R(c, pCx - 6, 66, 12, 4, '#24e2f5');
    R(c, pCx - 15, pTopY + 2, 30, 2, '#24e2f5');
    R(c, pCx - 11, 90, 22, 2, '#16a8be');

    // Tabuleiro curvo suspenso da Ponte Estaiada
    R(c, pCx - 78, pDeckY - 1, 156, 3, '#283358');
    R(c, pCx - 78, pDeckY - 1, 156, 1, '#5ceeff');
    for (let lx = pCx - 74; lx <= pCx + 74; lx += 8) {
      R(c, lx, pDeckY - 3, 2, 1, '#ffd278');
    }
  });
  lights.push({ x: pCx - 14, y: pTopY - 2, phase: 0.9 });
  lights.push({ x: pCx + 14, y: pTopY - 2, phase: 2.1 });

  // Fileira dianteira de prédios mais baixos (sem cobrir a Ponte Estaiada nem o Copan)
  paintBuildingRow(
    ['#0d1026', '#11142d', '#0b0d20'],
    18,
    46,
    12,
    22,
    0.15,
    33,
    true,
    [
      [50, 88],
      [134, 168],
      [298, 378],
      [412, 572],
    ],
  );

  // Névoa luminosa âmbar/magenta na base do horizonte urbano
  const g = c.createLinearGradient(0, SKY_GY - 34, 0, SKY_GY + 4);
  g.addColorStop(0, 'rgba(190,100,150,0)');
  g.addColorStop(0.7, 'rgba(210,120,130,0.16)');
  g.addColorStop(1, 'rgba(245,160,90,0.22)');
  c.fillStyle = g;
  c.fillRect(0, SKY_GY - 34, P_SKY, 38);

  // Base escura abaixo do horizonte
  R(c, 0, SKY_GY, P_SKY, 90, '#0a0e20');
  return { cv, lights };
}

// ─── 3. Camada 2 — Via Expressa Elevada / Minhocão & Light Trails (parallax 0.26) ──

interface LightTrail {
  readonly yOff: number;
  readonly len: number;
  readonly speed: number;
  readonly phase: number;
  readonly color: string;
  readonly core: string;
}

const LIGHT_TRAILS: readonly LightTrail[] = [
  // Feixes vermelhos (lanternas traseiras) e brancos/amarelos (faróis) em alta velocidade
  { yOff: -1.5, len: 38, speed: 240, phase: 12, color: 'rgba(255,46,76,0.55)', core: '#ff7088' },
  { yOff: -2.5, len: 26, speed: 310, phase: 110, color: 'rgba(255,215,90,0.6)', core: '#fff6c0' },
  { yOff: -1.0, len: 44, speed: 195, phase: 210, color: 'rgba(255,38,68,0.5)', core: '#ff5a70' },
  { yOff: -3.0, len: 32, speed: 280, phase: 330, color: 'rgba(255,235,150,0.65)', core: '#ffffff' },
  { yOff: -2.0, len: 28, speed: 350, phase: 420, color: 'rgba(255,50,80,0.55)', core: '#ff8096' },
  { yOff: -1.5, len: 36, speed: 260, phase: 485, color: 'rgba(255,200,70,0.55)', core: '#ffe898' },
];

function buildViaduct(): Cv {
  const { cv, c } = mk(P_VIA, LH, MT);

  // Pilares de concreto armado do Minhocão / Via Expressa
  for (let px = 28; px < P_VIA; px += 64) {
    rep(c, P_VIA, () => {
      // Capitel trapezoidal sob a viga
      c.fillStyle = '#181c36';
      c.beginPath();
      c.moveTo(px - 12, VIA_Y + 7);
      c.lineTo(px + 12, VIA_Y + 7);
      c.lineTo(px + 7, VIA_Y + 13);
      c.lineTo(px - 7, VIA_Y + 13);
      c.closePath();
      c.fill();
      // Coluna central de concreto com sombra lateral
      R(c, px - 6, VIA_Y + 12, 12, 32, '#151930');
      R(c, px - 6, VIA_Y + 12, 2, 32, '#252b4e');
      R(c, px + 4, VIA_Y + 12, 2, 32, '#0c0f20');
    });
  }

  // Postes duplos de vapor de sódio ao longo do viaduto elevado
  for (let lx = 16; lx < P_VIA; lx += 64) {
    rep(c, P_VIA, () => {
      R(c, lx, VIA_Y - 22, 1, 22, '#282e52');
      R(c, lx - 5, VIA_Y - 22, 11, 1, '#363e6b');
      R(c, lx - 6, VIA_Y - 22, 3, 1, '#ffd480');
      R(c, lx + 4, VIA_Y - 22, 3, 1, '#ffd480');
      radial(c, lx, VIA_Y - 21, 18, '255,180,75', 0.25);
    });
  }

  // Tabuleiro elevado de concreto (Minhocão)
  R(c, 0, VIA_Y - 1, P_VIA, 2, '#343b66'); // guarda-corpo superior iluminado
  R(c, 0, VIA_Y + 1, P_VIA, 5, '#1d2240'); // viga principal
  R(c, 0, VIA_Y + 6, P_VIA, 2, '#0f1226'); // sombra inferior da laje
  // Frisos e juntas de dilatação da viga
  for (let x = 0; x < P_VIA; x += 16) {
    R(c, x, VIA_Y + 1, 1, 5, '#13172e');
    R(c, x + 4, VIA_Y - 1, 4, 1, 'rgba(255,190,100,0.25)');
  }

  // Pórticos verdes de sinalização rodoviária da Marginal ("MARGINAL TIETÊ" e "PONTE ESTAIADA")
  const gantries: readonly { x: number; w: number; top: string; bot: string }[] = [
    { x: 86, w: 88, top: 'MARGINAL TIETÊ', bot: 'EXPRESSA  ↗' },
    { x: 334, w: 92, top: 'AV. PAULISTA', bot: 'AEROPORTO ↗' },
  ];
  for (const g of gantries) {
    rep(c, P_VIA, () => {
      const gy = VIA_Y - 26;
      // Colunas metálicas treliçadas do pórtico
      R(c, g.x - 4, gy + 2, 2, 25, '#2b3256');
      R(c, g.x + g.w + 2, gy + 2, 2, 25, '#2b3256');
      R(c, g.x - 4, gy + 4, g.w + 8, 2, '#38406b');
      // Placa verde refletiva padrão DER/CET
      R(c, g.x, gy - 2, g.w, 15, '#0b3d2e');
      R(c, g.x, gy - 2, g.w, 1, '#269b6e');
      R(c, g.x, gy + 12, g.w, 1, '#07261c');
      R(c, g.x + 1, gy - 1, g.w - 2, 13, '#0e4f3b');
      // Moldura branca interna sutil
      R(c, g.x + 2, gy, g.w - 4, 1, 'rgba(220,245,235,0.45)');
      R(c, g.x + 2, gy + 10, g.w - 4, 1, 'rgba(220,245,235,0.45)');
      // Texto legível na placa
      c.fillStyle = '#e8fff4';
      c.font = 'bold 5px monospace';
      c.textAlign = 'center';
      c.fillText(g.top, g.x + g.w / 2, gy + 4.5);
      c.fillStyle = '#ffd878';
      c.font = 'bold 4.5px monospace';
      c.fillText(g.bot, g.x + g.w / 2, gy + 9.2);
      // Pequenos refletores superiores iluminando a placa
      for (const rx of [g.x + 14, g.x + g.w / 2, g.x + g.w - 14]) {
        R(c, rx - 1, gy - 4, 3, 2, '#ffe6a0');
        radial(c, rx, gy + 2, 10, '180,255,220', 0.14);
      }
    });
  }

  return cv;
}

function drawViaductLightTrails(ctx: Ctx, offVia: number, dyVia: number, time: number): void {
  const baseY = VIA_Y + dyVia;
  for (const [idx, tr] of LIGHT_TRAILS.entries()) {
    const dir = idx % 2 === 0 ? 1 : -1;
    const rawX = tr.phase + dir * time * tr.speed - offVia;
    const y = snap(baseY + tr.yOff);
    for (const shift of [0, P_VIA]) {
      const x = snap(mod(rawX, P_VIA) - shift);
      if (x + tr.len < 0 || x > VIEW_W) continue;
      ctx.fillStyle = tr.color;
      ctx.fillRect(x, y - 0.5, tr.len, 1.5);
      ctx.fillStyle = tr.core;
      ctx.fillRect(x + 4, y, Math.max(4, tr.len - 8), 0.5);
    }
  }
}

// ─── 4. Camada 3 — Rio Tietê, Guard-Rail e Outdoors Neon (parallax 0.52) ─────

interface NeonSpot {
  readonly x: number;
  readonly rgb: string;
  readonly hex: string;
  readonly w: number;
}

const NEON_SPOTS: readonly NeonSpot[] = [
  { x: 46, rgb: '255,180,70', hex: '#ffb84a', w: 18 },
  { x: 116, rgb: '30,225,245', hex: '#28e8ff', w: 28 },
  { x: 174, rgb: '255,180,70', hex: '#ffb84a', w: 18 },
  { x: 244, rgb: '255,65,165', hex: '#ff4ab2', w: 30 },
  { x: 302, rgb: '255,180,70', hex: '#ffb84a', w: 18 },
  { x: 376, rgb: '255,205,75', hex: '#ffd24c', w: 28 },
  { x: 430, rgb: '255,180,70', hex: '#ffb84a', w: 18 },
  { x: 486, rgb: '30,225,245', hex: '#28e8ff', w: 24 },
];

function buildRiverBank(): Cv {
  const { cv, c } = mk(P_BANK, LH, MT);

  // Águas escuras do Rio Tietê na metade inferior (y = 122..180+)
  const riverGrad = c.createLinearGradient(0, BANK_Y, 0, VIEW_H + 36);
  riverGrad.addColorStop(0, '#070b18');
  riverGrad.addColorStop(0.25, '#0b1226');
  riverGrad.addColorStop(0.65, '#0d162e');
  riverGrad.addColorStop(1, '#060a16');
  c.fillStyle = riverGrad;
  c.fillRect(0, BANK_Y, P_BANK, VIEW_H - BANK_Y + 48);

  // Outdoors Neon na margem do Rio Tietê (escuros o bastante para preservar contraste com o plano jogável)
  const billboards: readonly {
    x: number;
    w: number;
    h: number;
    border: string;
    glow: string;
    title: string;
    sub: string;
    tCol: string;
  }[] = [
    {
      x: 98,
      w: 38,
      h: 18,
      border: '#1ad8f0',
      glow: '26,216,240',
      title: 'SP 24H',
      sub: 'MARGINAL',
      tCol: '#8ef6ff',
    },
    {
      x: 226,
      w: 40,
      h: 18,
      border: '#e83e9e',
      glow: '232,62,158',
      title: 'CAFÉ ★',
      sub: 'EXPRESSO',
      tCol: '#ff9ed8',
    },
    {
      x: 358,
      w: 38,
      h: 18,
      border: '#f0b23a',
      glow: '240,178,58',
      title: 'VIP 5★',
      sub: 'CORRIDA',
      tCol: '#ffe294',
    },
  ];

  for (const b of billboards) {
    rep(c, P_BANK, () => {
      const by = BANK_Y - 26;
      // Pilares metálicos de sustentação do outdoor
      R(c, b.x + 6, by + b.h, 2, 10, '#181c34');
      R(c, b.x + b.w - 8, by + b.h, 2, 10, '#181c34');
      // Halo neon suave ao redor
      radial(c, b.x + b.w / 2, by + b.h / 2, 26, b.glow, 0.22);
      // Painel escuro com borda neon dupla
      R(c, b.x - 1, by - 1, b.w + 2, b.h + 2, '#080a18');
      R(c, b.x, by, b.w, b.h, b.border);
      R(c, b.x + 1, by + 1, b.w - 2, b.h - 2, '#0d1024');
      // Texto neon
      c.fillStyle = b.tCol;
      c.font = 'bold 5.5px monospace';
      c.textAlign = 'center';
      c.fillText(b.title, b.x + b.w / 2, by + 7.5);
      c.fillStyle = '#c8d0f0';
      c.font = 'bold 4.5px monospace';
      c.fillText(b.sub, b.x + b.w / 2, by + 13.5);
    });
  }

  // Postes curvos de vapor de sódio da Marginal passando em velocidade
  for (let px = 46; px < P_BANK; px += 128) {
    rep(c, P_BANK, () => {
      const topY = BANK_Y - 36;
      R(c, px, topY, 2, 34, '#222846');
      R(c, px, topY, 1, 34, '#363f6b');
      // Braço curvo voltado para a pista/margem
      pline(c, px, topY, px - 10, topY - 3, 2, '#2a3154');
      R(c, px - 12, topY - 3, 5, 2, '#ffd884');
      radial(c, px - 10, topY - 2, 26, '255,175,65', 0.34);
    });
  }

  // Mureta de concreto e guard-rail metálico da Marginal Tietê
  R(c, 0, BANK_Y - 6, P_BANK, 3, '#293054'); // lâmina metálica do guard-rail
  R(c, 0, BANK_Y - 6, P_BANK, 1, '#465084'); // brilho superior do guard-rail
  R(c, 0, BANK_Y - 3, P_BANK, 4, '#181c34'); // mureta de concreto
  R(c, 0, BANK_Y + 1, P_BANK, 2, '#0a0d1c'); // talude escuro junto à água

  // Pontaletes do guard-rail e olhos-de-gato refletivos âmbar/vermelhos
  for (let x = 0; x < P_BANK; x += 16) {
    R(c, x, BANK_Y - 6, 2, 5, '#151930');
    R(c, x + 7, BANK_Y - 5, 2, 1, x % 32 === 0 ? '#ff4658' : '#ffb84a');
  }

  // Reflexo base estático suave na lâmina d'água
  for (const sp of NEON_SPOTS) {
    rep(c, P_BANK, () => {
      radial(c, sp.x, BANK_Y + 14, sp.w, sp.rgb, 0.16);
    });
  }

  return cv;
}

/** Desenha os reflexos horizontais trêmulos das luzes de néon e postes de sódio nas águas do Rio Tietê. */
function drawTietêReflections(ctx: Ctx, offBank: number, dyBank: number, time: number): void {
  const yTop = BANK_Y + 2 + dyBank;
  const rows = 15;

  for (const [sIdx, sp] of NEON_SPOTS.entries()) {
    for (const shift of [0, P_BANK]) {
      const baseCx = mod(sp.x - offBank, P_BANK) - shift;
      if (baseCx + sp.w < -10 || baseCx - sp.w > VIEW_W + 10) continue;

      ctx.fillStyle = sp.hex;
      for (let r = 0; r < rows; r++) {
        const ly = snap(yTop + r * 3.4);
        if (ly >= VIEW_H) break;
        const wave = Math.sin(time * 5.2 + r * 1.4 + sIdx * 0.9) * (1.5 + r * 0.18);
        const wBar = snap(Math.max(2, (sp.w * 0.75) * (1 - r / (rows + 5)) + Math.cos(time * 3.8 + r * 1.9) * 2.5));
        ctx.globalAlpha = Math.max(0.08, 0.42 - r * 0.022);
        ctx.fillRect(snap(baseCx - wBar * 0.5 + wave), ly, wBar, 1);
      }
    }
  }

  // Ondulações noturnas esparsas cintilando na correnteza do Tietê
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#38d8f0';
  for (let i = 0; i < 18; i++) {
    const pulse = Math.sin(time * 4.1 + i * 1.7);
    if (pulse < 0.2) continue;
    const rx = snap(mod(i * 37 - offBank * 1.05 - time * 14, VIEW_W));
    const ry = snap(yTop + 3 + ((i * 11) % 46));
    if (ry < VIEW_H) {
      ctx.fillRect(rx, ry, pulse > 0.7 ? 5 : 3, 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

// ─── 5. Primeiro Plano: Linhas Cinéticas e Feixes de Postes (parallax 1.35) ──

interface SpeedLine {
  readonly x: number;
  readonly y: number;
  readonly len: number;
  readonly speed: number;
}

function makeSpeedLines(seed: number): SpeedLine[] {
  const rnd = mulberry32(seed);
  const lines: SpeedLine[] = [];
  // Bordas superior (y = 5..26) e inferior (y = 158..176) para não poluir o centro jogável
  for (let i = 0; i < 14; i++) {
    const topBand = i % 2 === 0;
    const y = topBand ? 5 + rnd() * 21 : 158 + rnd() * 17;
    lines.push({
      x: rnd() * (VIEW_W + 120),
      y,
      len: 18 + rnd() * 28,
      speed: 220 + rnd() * 140,
    });
  }
  return lines;
}

/** Fábrica do parallax noturno de alta velocidade da Fase 5 — Marginal de São Paulo. */
export function createUberBackground(): Background {
  const sky = buildSky();
  const clouds = buildClouds();
  const skyline = buildSkyline();
  const viaduct = buildViaduct();
  const riverBank = buildRiverBank();
  const speedLines = makeSpeedLines(9901);

  return {
    draw(ctx, camX, camY, time) {
      const up = BASE_CAM_Y - camY;
      const dy = (f: number): number => snap(up * f);

      // 1. Céu noturno com dithering Bayer, lua, nuvens baixas e helicóptero distante
      ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H);
      drawTiled(ctx, clouds, P_CLOUD, snap(camX * 0.03 + time * 1.6), 44 + dy(0.04));
      drawHelicopter(ctx, camX, dy(0.05), time);

      // 2. Camada 1 — Skyline Monumental de São Paulo à Noite (parallax 0.10)
      const offSky = snap(camX * 0.1);
      const dySky = dy(0.1);
      drawTiled(ctx, skyline.cv, P_SKY, offSky, dySky - MT);

      // Luzes vermelhas de aviação piscando em tempo real nas antenas da Paulista, Banespão e Ponte Estaiada
      for (const l of skyline.lights) {
        for (const shift of [0, P_SKY]) {
          const sx = mod(l.x - offSky, P_SKY) - shift;
          if (sx < -2 || sx > VIEW_W + 2) continue;
          if (Math.sin(time * 2.6 + l.phase) < 0.05) continue;
          ctx.fillStyle = 'rgba(255,56,48,0.32)';
          ctx.fillRect(snap(sx) - 1.5, snap(l.y + dySky) - 1.5, 4, 4);
          ctx.fillStyle = '#ff3b30';
          ctx.fillRect(snap(sx), snap(l.y + dySky), 1, 1);
        }
      }

      // 3. Camada 2 — Via Expressa Elevada / Minhocão & Rastro de Faróis (parallax 0.26)
      const offVia = snap(camX * 0.26);
      const dyVia = dy(0.26);
      drawTiled(ctx, viaduct, P_VIA, offVia, dyVia - MT);
      drawViaductLightTrails(ctx, offVia, dyVia, time);

      // 4. Camada 3 — Rio Tietê, Guard-Rail e Outdoors Neon (parallax 0.52)
      const offBank = snap(camX * 0.52);
      const dyBank = dy(0.52);
      drawTiled(ctx, riverBank, P_BANK, offBank, dyBank - MT);
      drawTietêReflections(ctx, offBank, dyBank, time);
    },

    drawForeground(ctx, camX, _camY, time) {
      // Feixes verticais translúcidos de postes de luz passando em parallax 1.35 (sem tapar a visão)
      const beamPeriod = 220;
      const beamX = snap(VIEW_W - mod(camX * 1.35 + time * 18, beamPeriod));
      if (beamX > -28 && beamX < VIEW_W + 28) {
        const g = ctx.createLinearGradient(beamX - 14, 0, beamX + 14, 0);
        g.addColorStop(0, 'rgba(255,195,95,0)');
        g.addColorStop(0.5, 'rgba(255,195,95,0.065)');
        g.addColorStop(1, 'rgba(255,195,95,0)');
        ctx.fillStyle = g;
        ctx.fillRect(beamX - 14, 0, 28, VIEW_H);

        // Silhueta sutil de luminária apenas no topo extremo da tela
        ctx.fillStyle = 'rgba(10,12,26,0.28)';
        ctx.fillRect(beamX - 1, 0, 2, 10);
      }

      // Linhas cinéticas sutis de velocidade/vento nas bordas superior e inferior da tela
      ctx.fillStyle = 'rgba(190,225,255,0.18)';
      for (const s of speedLines) {
        const sx = snap(VIEW_W + 40 - mod(s.x + camX * 1.35 + time * s.speed, VIEW_W + 100));
        ctx.fillRect(sx, snap(s.y), snap(s.len), 0.5);
      }
    },
  };
}
