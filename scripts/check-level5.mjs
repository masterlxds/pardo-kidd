#!/usr/bin/env node
/**
 * Validador da FASE 5 — "Marginal de São Paulo" (autoscroller no Uber, versão 2).
 * Especificação: level-5-refs/level_design_fase5.md §4 (R1–R10), §5 e §7.
 *
 *   node scripts/check-level5.mjs            valida e termina com `level5 OK` (exit ≠ 0 em erro)
 *   node scripts/check-level5.mjs --print    + partitura (tempo, resposta, janelas) e a execução sem dano
 *   LEVEL5_FILE=<caminho> node scripts/...   valida uma cópia do mapa
 *
 * Importa `level5.ts` e `uberRules.ts` DIRETO (ambos sem imports; o Node faz type stripping), então
 * nenhum número da fase é duplicado aqui. Só o Pardo é portado à mão (PHYS/FEEL/punchBox, abaixo).
 *
 * MODELO DO BOT (60 Hz, Pardo na posição neutra, sem direcional):
 *  - quadro f: centro do Pardo em x = 72 + 2f, câmera em x = 2f; chão = UBER.roofY − uberRampOffset;
 *  - pulo: vy = −jumpVel no quadro do aperto, corte ×jumpCut ao soltar subindo, gravidade e maxFall de PHYS;
 *    não decola nos 9 primeiros quadros do soco (preparo + ativo), decola na recuperação cancelando o soco;
 *    coyote e buffer de pulo NÃO são usados (o bot é mais conservador que o jogo);
 *  - soco: 14 quadros no total, caixa ativa nos quadros 3..8 depois do aperto (20×12 em x+w−2, y+4);
 *  - por quadro, como em game.ts: primeiro os socos (alvo acertado some; pichador socado leva o spray junto),
 *    depois os toques (zona de obstáculo, inimigo, barreira ou spray = dano);
 *  - a busca é uma DP sobre (quadro, quadros no ar, quadro em que soltou o pulo, relógio do soco, alvos
 *    próximos já socados), para a frente (alcançável sem dano) e para trás (ainda fecha a fase sem dano),
 *    em janelas de 96 quadros.
 * Não simulado: a frenagem dos 3 últimos compassos (por isso moedas ali só na linha 8) e o direcional.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as RULES from '../src/game/uberRules.ts';

const {
  UBER, UBER_BANDS, UBER_OBSTACLES, UBER_BARREIRA, UBER_ISOPOR, UBER_ENEMIES, UBER_DRONE, UBER_PICHADOR,
  uberEnemyX, uberDronePos, uberRampOffset,
} = RULES;

const levelUrl = process.env.LEVEL5_FILE
  ? pathToFileURL(resolve(process.cwd(), process.env.LEVEL5_FILE)).href
  : new URL('../src/game/level5.ts', import.meta.url).href;
const LVL = await import(levelUrl);
const { LEVEL5_ROWS: ROWS, LEVEL5_BARS: BARS, LEVEL5_LEGEND: LEGEND, LEVEL5_BAR_COLS, LEVEL5_BAR_COUNT, LEVEL5_RAMP_COLS } = LVL;

const PRINT = process.argv.includes('--print');

// ── Porta do Pardo (src/core/constants.ts PHYS, src/game/player.ts FEEL e punchBox) ─────────────────────────
const PHYS = { gravity: 900, maxFall: 360, jumpVel: 300 };
const FEEL = { jumpCut: 0.55, punchTime: 0.22, punchWindup: 0.04, punchActive: 0.1 };
const PLAYER_W = 10;
const PLAYER_H = 20;
const PUNCH = { w: 20, h: 12, dx: PLAYER_W - 2, dy: 4 }; // relativo ao canto sup. esq. da hitbox
const COIN = { d: 4, s: 8 }; // createCoin(left + 4, top + 4), 8×8
const HZ = 60;
const DT = 1 / HZ;
/** quadros (depois do aperto) em que a caixa do soco existe, e duração total — derivados de FEEL */
const P_FIRST = Math.ceil(FEEL.punchWindup * HZ - 1e-9); // 3
const P_LAST = Math.ceil((FEEL.punchWindup + FEEL.punchActive) * HZ - 1e-9) - 1; // 8
const P_TOTAL = Math.ceil(FEEL.punchTime * HZ - 1e-9); // 14

const T = UBER.tile;
const COLS = UBER.cols;
const NROWS = UBER.rows;
const BAR = UBER.barCols;
const BEAT = UBER.beatCols;
const PX_F = UBER.speed / HZ; // px por quadro
const HALF = PLAYER_W / 2;

// ── Tabelas de design (level_design_fase5.md) ───────────────────────────────────────────────────────────────
const ACTS = [
  { n: 1, from: 5, to: 20 },
  { n: 2, from: 23, to: 38 },
  { n: 3, from: 41, to: 56 },
  { n: 4, from: 59, to: 70 },
];
const EXPECTED = { L: 19, F: 3, G: 6, i: 14, B: 8, W: 4, K: 3, y: 20, Y: 4, p: 15, u: 5, z: 6, x: 8, X: 2, J: 3 };
const COUNT_TOL = 2;
const COINS_MIN = 90;
const COINS_MAX = 110;
const JUMP_OBST = 'LF';
const HIGH_OBST = 'Gi';
const TARGETS = 'BWyYpuzxX';
const THREATS = 'LFGiByYpuzxX'; // tudo o que fere (W não fere)
const ALIGNED = THREATS + 'WT';
const ROW_ALLOWED = {
  5: '.cGizX', 6: '.c', 7: '.c', 8: '.cLFBWyYpux', 9: '.PTA', 10: '.=J', 11: '#~K1234srln',
};
const RESPOSTA = {
  L: 'PULE', F: 'PULE (mais cedo)', G: 'NÃO PULE', i: 'NÃO PULE', B: 'SOQUE (ou pule)', W: 'SOQUE (+1 gota, opcional)',
  y: 'SOQUE (ou pule)', Y: 'SOQUE (ou pule)', p: 'SOQUE no tempo', u: 'SOQUE no rasante (ou pule)',
  z: 'PULE + SOQUE', x: 'SOQUE (ou pule)', X: 'NÃO PULE (ou soco no ar)',
};
/** R10: pisos em quadros [soco, decolagem] */
const R10 = { base: [9, 6], ato1: [12, 9] };

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const barOf = (col) => Math.floor(col / BAR) + 1;
const beatOf = (col) => Math.floor((col % BAR) / BEAT) + 1;
const actOf = (bar) => ACTS.find((a) => bar >= a.from && bar <= a.to)?.n ?? 0;
const pos = (col) => `c.${String(barOf(col)).padStart(2, '0')} t${beatOf(col)}`;
const frameBar = (f) => barOf(Math.min(COLS - 1, Math.floor((UBER.screenNeutral + PX_F * f) / T)));

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. CHECAGENS ESTÁTICAS
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
function staticChecks() {
  // dimensões e montagem por compassos
  if (LEVEL5_BAR_COLS !== BAR) err(`LEVEL5_BAR_COLS = ${LEVEL5_BAR_COLS}, esperado ${BAR}`);
  if (BARS.length !== LEVEL5_BAR_COUNT || BARS.length * BAR !== COLS) err(`LEVEL5_BARS tem ${BARS.length} compassos, esperado ${COLS / BAR}`);
  BARS.forEach((b, i) => {
    if (b.length !== NROWS) err(`c.${i + 1}: ${b.length} linhas, esperado ${NROWS}`);
    b.forEach((r, y) => { if (r.length !== BAR) err(`c.${i + 1} linha ${y}: ${r.length} colunas, esperado ${BAR}`); });
  });
  if (ROWS.length !== NROWS) err(`LEVEL5_ROWS tem ${ROWS.length} linhas, esperado ${NROWS}`);
  ROWS.forEach((r, y) => {
    if (r.length !== COLS) err(`linha ${y}: ${r.length} colunas, esperado ${COLS}`);
    if (r !== BARS.map((b) => b[y]).join('')) err(`linha ${y}: LEVEL5_ROWS não é a concatenação dos compassos`);
  });
  if (errors.length) return null;

  // legenda, linha de cada marcador, nenhum sólido acima da linha 10
  const all = [];
  for (let y = 0; y < NROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = ROWS[y][x];
      if (!(ch in LEGEND)) { err(`${pos(x)} linha ${y}: caractere '${ch}' fora da legenda`); continue; }
      if ((ch === '=' || ch === '#') && y < 10) err(`${pos(x)} linha ${y}: tile sólido '${ch}' acima da linha 10`);
      const allowed = ROW_ALLOWED[y] ?? '.';
      if (!allowed.includes(ch)) err(`${pos(x)} linha ${y}: '${ch}' (${LEGEND[ch]}) não pode ficar nesta linha`);
      if (ch !== '.' && ch !== '=' && ch !== '#' && ch !== '~') all.push({ ch, col: x, row: y, bar: barOf(x), beat: beatOf(x) });
    }
  }
  all.sort((a, b) => a.col - b.col || a.row - b.row);
  const of = (set) => all.filter((m) => set.includes(m.ch));
  const count = (ch) => all.filter((m) => m.ch === ch).length;
  const barHas = (bar, set) => all.some((m) => m.bar === bar && set.includes(m.ch));
  const at = (col, row) => ROWS[row][col];

  // pista, vãos de rampa e mureta
  const rampBars = new Set(of('J').map((m) => m.bar));
  for (let b = 1; b <= COLS / BAR; b++) {
    const r10 = BARS[b - 1][10];
    const r11 = BARS[b - 1][11];
    if (rampBars.has(b)) {
      if (r10 !== 'J' + '.'.repeat(BAR - 1)) err(`c.${b}: compasso de rampa precisa de 'J' na 1ª coluna da linha 10 e pista vazia no vão`);
      if (r11 !== '~'.repeat(BAR)) err(`c.${b}: compasso de rampa precisa de '~' nas 12 colunas da linha 11`);
    } else {
      if (r10 !== '='.repeat(BAR)) err(`c.${b}: a linha 10 precisa ser asfalto contínuo fora das rampas`);
      if (r11.includes('~')) err(`c.${b}: '~' só nos vãos de rampa`);
    }
  }
  const ramps = of('J').map((m) => m.col);
  if (JSON.stringify(ramps) !== JSON.stringify([...LEVEL5_RAMP_COLS])) err(`LEVEL5_RAMP_COLS = [${LEVEL5_RAMP_COLS}] não bate com os 'J' do mapa [${ramps}]`);

  // alinhamento ao tempo
  for (const m of all) {
    if (ALIGNED.includes(m.ch) && m.col % BEAT !== 0) err(`${pos(m.col)}: '${m.ch}' fora da 1ª coluna do tempo (coluna ${m.col % BAR} do compasso)`);
    if ('KJ1234'.includes(m.ch) && m.col % BAR !== 0) err(`${pos(m.col)}: '${m.ch}' precisa ficar na 1ª coluna do compasso`);
  }

  // estrutura única
  const one = (ch, n = 1) => { if (count(ch) !== n) err(`esperado ${n} '${ch}' (${LEGEND[ch]}), há ${count(ch)}`); };
  one('P'); one('A'); one('T'); one('1'); one('2'); one('3'); one('4');
  const P = of('P')[0];
  const A = of('A')[0];
  const TR = of('T')[0];
  if (P && (P.bar !== 1 || P.col * T + T / 2 !== UBER.screenNeutral)) err(`'P' precisa ficar no c.1 com o centro em x = ${UBER.screenNeutral} (coluna ${(UBER.screenNeutral - T / 2) / T})`);
  if (A && A.bar !== COLS / BAR) err(`'A' precisa ficar no último compasso`);

  // contagens (§7)
  for (const [ch, n] of Object.entries(EXPECTED)) {
    const c = count(ch);
    if (Math.abs(c - n) > COUNT_TOL) err(`contagem de '${ch}' (${LEGEND[ch]}): ${c}, esperado ${n} ±${COUNT_TOL}`);
  }
  for (const ch of 'KJ') if (count(ch) !== EXPECTED[ch]) err(`'${ch}': ${count(ch)}, esperado exatamente ${EXPECTED[ch]}`);
  const coins = of('c');
  if (coins.length < COINS_MIN || coins.length > COINS_MAX) err(`moedas: ${coins.length}, esperado de ${COINS_MIN} a ${COINS_MAX}`);

  const jumps = of(JUMP_OBST);
  const highs = of(HIGH_OBST);
  const jumpEnd = (m) => m.col + (m.ch === 'F' ? 1 : 0);
  const highEnd = (m) => m.col + (m.ch === 'G' ? 2 : 0);
  const highBand = all.filter((m) => 'GiXz'.includes(m.ch));

  // R1 — L/F longe de G/i/X
  for (const j of jumps) {
    for (const h of all.filter((m) => 'GiX'.includes(m.ch))) {
      const gap = Math.max(h.col - jumpEnd(j), j.col - highEnd(h)) - 1; // colunas livres entre os dois
      if (gap < 2) err(`R1 ${pos(j.col)}: '${j.ch}' a menos de 2 colunas de '${h.ch}' (${pos(h.col)})`);
    }
  }
  // R2 — depois de um obstáculo de pular, faixa alta só 2 tempos depois
  for (const j of jumps) {
    for (const h of highBand) {
      const d = h.col - j.col;
      if (d > 0 && d < 2 * BEAT) err(`R2 ${pos(h.col)}: '${h.ch}' na faixa alta a menos de 2 tempos do '${j.ch}' de ${pos(j.col)}`);
    }
  }
  // R3 — depois que G/i termina, obstáculo de pular só 1 tempo depois
  for (const h of highs) {
    for (const j of jumps) {
      const d = j.col - highEnd(h);
      if (d > 0 && d < BEAT) err(`R3 ${pos(j.col)}: '${j.ch}' a menos de 1 tempo do fim de '${h.ch}' (${pos(h.col)})`);
    }
  }
  // R4 — dois obstáculos de pular seguidos
  for (let k = 1; k < jumps.length; k++) {
    const a = jumps[k - 1];
    const b = jumps[k];
    const min = (actOf(b.bar) >= 3 ? 2 : 3) * BEAT;
    if (b.col - a.col < min) err(`R4 ${pos(b.col)}: '${b.ch}' a ${((b.col - a.col) / BEAT).toFixed(1)} tempos do '${a.ch}' anterior (mínimo ${min / BEAT})`);
  }
  // R5 — dois alvos de soco seguidos
  const targets = of(TARGETS);
  for (let k = 1; k < targets.length; k++) {
    if (targets[k].col - targets[k - 1].col < BEAT) err(`R5 ${pos(targets[k].col)}: alvos de soco '${targets[k - 1].ch}' e '${targets[k].ch}' a menos de 1 tempo`);
  }
  // R6 — embaixo de G/i só B, y, Y, p, x e moedas (e moeda só na linha 8)
  for (const h of highs) {
    for (let x = h.col; x <= highEnd(h); x++) {
      const low = at(x, 8);
      if (!'.cByYpx'.includes(low)) err(`R6 ${pos(x)}: '${low}' embaixo de '${h.ch}'`);
      for (const y of [6, 7]) if (at(x, y) === 'c') err(`R6 ${pos(x)}: moeda na linha ${y} embaixo de '${h.ch}' (só na linha 8)`);
    }
  }
  // R7 — compassos sem ameaça
  const total = COLS / BAR;
  const calm = new Set([...of('K').map((m) => m.bar), ...rampBars, 1, 2, 4, total - 2, total - 1, total]);
  for (const b of calm) if (barHas(b, THREATS)) err(`R7 c.${b}: compasso de fôlego (K, J, embarque ou desembarque) com ameaça`);
  // Exceção documentada: a partitura põe o limitador-tutorial no c.3 (GDD §5: estreia na "Intro").
  const c3 = all.filter((m) => m.bar === 3 && THREATS.includes(m.ch));
  if (c3.length > 1 || (c3.length === 1 && c3[0].ch !== 'L')) err(`R7 c.3: o embarque só admite 1 limitador-tutorial`);
  for (const b of [total - 2, total - 1, total]) {
    if (all.some((m) => m.bar === b && m.ch === 'c' && m.row !== 8)) err(`c.${b}: moedas dos 3 últimos compassos só na linha 8 (a rolagem está freando)`);
  }
  // R8 — respiros: no máximo 4 compassos seguidos com ameaça; cada ato tem 1 respiro a cada 4 compassos, menos o último bloco (a rampa/checkpoint faz o papel)
  let run = 0;
  for (let b = 1; b <= total; b++) {
    run = barHas(b, THREATS) ? run + 1 : 0;
    if (run > 4) err(`R8 c.${b}: ${run} compassos seguidos com ameaça (máximo 4)`);
  }
  for (const a of ACTS) {
    let rest = 0;
    for (let b = a.from; b <= a.to; b++) if (!barHas(b, THREATS)) rest++;
    const need = Math.floor((a.to - a.from + 1) / 4) - 1;
    if (rest < need) err(`R8 Ato ${a.n}: ${rest} respiros, esperado ao menos ${need}`);
    for (let b = a.from; b + 3 <= a.to - 4; b += 4) {
      if (![0, 1, 2, 3].some((k) => !barHas(b + k, THREATS))) err(`R8 c.${b}–${b + 3}: frase de 4 compassos sem respiro`);
    }
  }
  // R9 — decisões por compasso
  const decisions = (b) => {
    const ms = all.filter((m) => m.bar === b && THREATS.includes(m.ch));
    let n = 0;
    let loneLights = false;
    let lastP = -99;
    for (const m of ms) {
      if (m.ch === 'p') { if (m.col - lastP !== BEAT) n++; lastP = m.col; continue; } // fila conta 1
      if (m.ch === 'G' || m.ch === 'i') {
        let under = false;
        for (let x = m.col; x <= highEnd(m); x++) if ('ByYpx'.includes(at(x, 8))) under = true;
        if (under) continue; // "soco obrigatório": quem conta é o alvo embaixo
        if (m.ch === 'i') loneLights = true; else n++;
        continue;
      }
      n++;
    }
    return n + (loneLights ? 1 : 0); // série de luminárias conta 1, como a fila de patinetes
  };
  for (const a of ACTS) {
    for (let b = a.from; b <= a.to; b++) {
      const max = a.n === 1 ? (b > a.to - 4 ? 2 : 1) : a.n === 2 ? 2 : 3;
      const d = decisions(b);
      if (d > max) err(`R9 c.${b}: ${d} decisões (máximo ${max} no Ato ${a.n})`);
    }
  }
  for (let b = 1; b <= total; b++) if (!actOf(b) && b !== 3 && barHas(b, THREATS)) err(`c.${b}: ameaça fora dos atos`);

  // caixas só com o caminhão-baú na tela
  if (TR) for (const m of of('xX')) {
    if (m.col < TR.col || m.col >= TR.col + UBER.truckBars * BAR) err(`${pos(m.col)}: caixa '${m.ch}' fora dos ${UBER.truckBars} compassos do caminhão-baú (entra em ${pos(TR.col)})`);
  }
  // tutoriais antes da estreia de cada verbo
  const first = (set) => of(set)[0];
  for (const [t, set] of [['1', 'LF'], ['2', 'ByYpux'], ['3', 'Gi'], ['4', 'z']]) {
    const sign = first(t);
    const f = first(set);
    if (sign && f && (sign.col > f.col || f.bar - sign.bar > 1)) err(`placa de tutorial '${t}' (${pos(sign.col)}) precisa vir logo antes da estreia de '${f.ch}' (${pos(f.col)})`);
  }
  // estreias (GDD §5)
  const debut = { L: 0, G: 1, B: 1, y: 1, u: 1, F: 2, p: 2, z: 2, i: 3, Y: 3, x: 4, X: 4 };
  for (const [ch, act] of Object.entries(debut)) {
    const f = first(ch);
    if (!f) continue;
    const a = f.bar <= 4 ? 0 : actOf(f.bar);
    if (a !== act) err(`estreia de '${ch}' (${LEGEND[ch]}) em ${pos(f.col)}: esperada ${act === 0 ? 'no embarque' : `no Ato ${act}`}`);
  }
  const order = ['L', 'B', 'y', 'G', 'u', 'p', 'z', 'F', 'i', 'Y', 'x', 'X'].map((ch) => first(ch)?.col ?? -1);
  for (let k = 1; k < order.length; k++) if (order[k] < order[k - 1]) err(`estreias fora da ordem da partitura (L, B, y, G, u, p, z, F, i, Y, x, X)`);
  // pontos altos
  const gb = of('G').some((g) => g.bar === 14 && at(g.col, 8) === 'B');
  if (!gb) err(`ponto alto: o c.14 precisa do primeiro soco obrigatório (G com B embaixo)`);
  const burst = of('i').filter((m) => m.bar === 53 && at(m.col, 8) === 'y');
  if (burst.length !== 3 || burst[2].col - burst[0].col !== 2 * BEAT) err(`ponto alto: o c.53 precisa da rajada (i+y em três tempos seguidos)`);
  const convoy = [59, 60, 61, 62, 63, 64, 65].filter((b) => barHas(b, 'xX')).length;
  if (convoy < 6) err(`ponto alto: o comboio dos c.59–65 precisa de caixas em ao menos 6 compassos (há ${convoy})`);

  return { all, coins, decisionsOf: decisions };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. ENTIDADES (posição pela fórmula da câmera de uberRules.ts)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const RAMPS_PX = [...LEVEL5_RAMP_COLS].map((c) => c * T);
const centerAt = (f) => UBER.screenNeutral + PX_F * f;
const cameraAt = (f) => PX_F * f;
/** total de quadros: o Pardo atravessa o mapa inteiro em velocidade constante */
const NFRAMES = Math.floor((COLS * T - UBER.screenNeutral) / PX_F);
const CHUNK = BAR * T / PX_F; // 96 quadros = 1 compasso

const OBST_KIND = { L: 'limitador', F: 'faixa', G: 'placa', i: 'luminaria' };
const LINEAR_KIND = { y: 'motoboy', Y: 'motoboy_fast', p: 'patinete', x: 'caixa_baixa', X: 'caixa_alta' };

/** Cria as entidades de simulação. `boxes(f)` devolve retângulos [x, y, w, h]; o 1º é o alvo do soco. */
function buildEntities(all) {
  const ents = [];
  for (const m of all) {
    const left = m.col * T;
    const mid = left + T / 2;
    const base = { ch: m.ch, col: m.col, row: m.row, bar: m.bar, beat: m.beat, harmful: true, punchable: false };
    if (OBST_KIND[m.ch]) {
      const z = UBER_OBSTACLES[OBST_KIND[m.ch]];
      ents.push({ ...base, encX: left + z.dx + z.w / 2, boxes: () => [[left + z.dx, z.y, z.w, z.h]] });
    } else if (m.ch === 'B' || m.ch === 'W') {
      const z = m.ch === 'B' ? UBER_BARREIRA : UBER_ISOPOR;
      ents.push({ ...base, harmful: m.ch === 'B', punchable: true, encX: left + z.dx + z.w / 2, boxes: () => [[left + z.dx, z.y, z.w, z.h]] });
    } else if (LINEAR_KIND[m.ch]) {
      const k = UBER_ENEMIES[LINEAR_KIND[m.ch]];
      ents.push({ ...base, punchable: true, encX: mid, boxes: (f) => [[uberEnemyX(mid, k.v, cameraAt(f)) - k.w / 2, k.bottom - k.h, k.w, k.h]] });
    } else if (m.ch === 'u') {
      const D = UBER_DRONE;
      ents.push({ ...base, punchable: true, encX: mid, boxes: (f) => { const p = uberDronePos(mid, cameraAt(f)); return [[p.cx - D.w / 2, p.cy - D.h / 2, D.w, D.h]]; } });
    } else if (m.ch === 'z') {
      const { body, spray } = UBER_PICHADOR;
      ents.push({ ...base, punchable: true, encX: mid, boxes: () => [[mid - body.w / 2, body.y, body.w, body.h], [mid - spray.w / 2, spray.y, spray.w, spray.h]] });
    }
  }
  ents.forEach((e, i) => { e.id = i; e.fEnc = (e.encX - UBER.screenNeutral) / PX_F; });
  return ents;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. SIMULADOR (DP por quadro)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Chave do estado: k (quadros no ar; 0 = no teto) | h (quadro em que soltou o pulo; 0 = não soltou) |
// p (relógio do soco: 0 parado, 1..14 = quadros desde o aperto + 1) | máscara dos alvos próximos já socados |
// 1 bit "soco apertado no ar" (para medir a janela de soco só com apertos feitos em pé).
const K_BITS = 7, H_BITS = 5, P_BITS = 4;
const K_MAX = (1 << K_BITS) - 1, H_MAX = (1 << H_BITS) - 1;
const SLOTS = 6;
const MASK_SHIFT = K_BITS + H_BITS + P_BITS;
const AIR_BIT = 1 << (MASK_SHIFT + SLOTS); // o soco em andamento foi apertado no ar
const pack = (k, h, p, mask, air) => k | (h << K_BITS) | (p << (K_BITS + H_BITS)) | (mask << MASK_SHIFT) | (air ? AIR_BIT : 0);

/**
 * @param ents entidades de buildEntities
 * @param opt { jumpScale, steer } — steer ≠ 0 desloca cada entidade por steer × (tempo até o encontro):
 *        a aproximação passa a ser (120 + steer) px/s mantendo o encontro no mesmo instante.
 */
function makeSim(ents, coins, opt) {
  const jumpVel = PHYS.jumpVel * (opt.jumpScale ?? 1);
  const steer = opt.steer ?? 0;
  const shift = (e, f) => (steer * (e.fEnc - f)) / HZ;
  const boxesAt = (e, f) => {
    const bs = e.boxes(f);
    if (steer === 0) return bs;
    const s = shift(e, f);
    return bs.map((b) => [b[0] + s, b[1], b[2], b[3]]);
  };

  // faixa de quadros em que a entidade pode tocar o Pardo ou ser alcançada pelo soco
  const act = Array.from({ length: NFRAMES + 2 }, () => []);
  const punchOk = new Uint8Array(NFRAMES + 2); // máscara de slots de alvos que um aperto neste quadro ainda pode acertar
  const expire = new Uint8Array(NFRAMES + 2);
  let slotSeq = 0;
  const slotBusyUntil = new Array(SLOTS).fill(-1);
  for (const e of ents) {
    let f0 = -1, f1 = -1;
    const from = Math.max(0, Math.floor(e.fEnc) - 400), to = Math.min(NFRAMES, Math.ceil(e.fEnc) + 400);
    for (let f = from; f <= to; f++) {
      const cx = centerAt(f);
      const hit = boxesAt(e, f).some((b) => b[0] < cx + HALF + PUNCH.w && b[0] + b[2] > cx - HALF - 2);
      if (hit) { if (f0 < 0) f0 = f; f1 = f; }
    }
    e.f0 = f0; e.f1 = f1;
    if (f0 < 0) continue;
    for (let f = f0; f <= f1; f++) act[f].push(e);
    if (e.punchable) {
      const start = Math.max(0, f0 - P_LAST - 1);
      let slot = -1;
      for (let k = 0; k < SLOTS; k++) { const s = (slotSeq + k) % SLOTS; if (slotBusyUntil[s] < start) { slot = s; break; } }
      if (slot < 0) throw new Error(`validador: mais de ${SLOTS} alvos de soco simultâneos perto de ${pos(e.col)}`);
      slotSeq = slot + 1;
      slotBusyUntil[slot] = f1 + 1;
      e.bit = 1 << slot;
      for (let f = start; f <= f1; f++) punchOk[f] |= e.bit;
      expire[f1 + 1] |= e.bit;
    } else e.bit = 0;
  }
  const coinsAt = Array.from({ length: NFRAMES + 2 }, () => []);
  coins.forEach((c, i) => {
    const x0 = c.col * T + COIN.d, y0 = c.row * T + COIN.d;
    c.box = [x0, y0, COIN.s, COIN.s];
    for (let f = 0; f <= NFRAMES; f++) { const cx = centerAt(f); if (cx + HALF > x0 && cx - HALF < x0 + COIN.s) coinsAt[f].push(i); }
  });

  const roofAt = (f) => UBER.roofY - uberRampOffset(centerAt(f), RAMPS_PX);
  const newLayer = () => ({ keys: [], ys: [], vys: [], map: new Map(), succ: null });
  const start = () => { const L = newLayer(); L.keys.push(0); L.ys.push(UBER.roofY - PLAYER_H); L.vys.push(0); L.map.set(0, 0); return L; };

  /**
   * Avança a camada `prev` (quadro f−1) para o quadro f.
   * @param ignoreDamage true durante a invulnerabilidade (depois de um ponto sem solução)
   * @param rec          true grava sucessores e acertos (para a passada para trás)
   * @param culprits     Set que recebe as entidades que causaram dano neste quadro
   */
  function step(f, prev, ignoreDamage, rec, culprits) {
    const next = newLayer();
    if (rec) prev.succ = prev.keys.map(() => []);
    const cx = centerAt(f);
    const roof = roofAt(f);
    const es = act[f];
    const boxes = es.map((e) => boxesAt(e, f));
    const exp = expire[f];
    const ok = punchOk[f];
    const px0 = cx - HALF, px1 = cx + HALF;
    const hx0 = px0 + PUNCH.dx, hx1 = hx0 + PUNCH.w;
    let hits = null;

    const emit = (pi, k, h, p, mask, y, vy, press, air) => {
      if (p === 0) air = 0;
      // socos primeiro (game.ts), depois toques
      hits = null;
      if (p > P_FIRST && p <= P_LAST + 1) {
        const hy0 = y + PUNCH.dy, hy1 = hy0 + PUNCH.h;
        for (let i = 0; i < es.length; i++) {
          const e = es[i];
          if (!e.punchable || (mask & e.bit)) continue;
          const b = boxes[i][0];
          if (hx0 < b[0] + b[2] && hx1 > b[0] && hy0 < b[1] + b[3] && hy1 > b[1]) { mask |= e.bit; (hits ??= []).push(e.id); }
        }
      }
      let hurt = false;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.harmful || (mask & e.bit)) continue;
        for (const b of boxes[i]) {
          if (px0 < b[0] + b[2] && px1 > b[0] && y < b[1] + b[3] && y + PLAYER_H > b[1]) { hurt = true; culprits?.add(e); break; }
        }
      }
      if (hurt && !ignoreDamage) return;
      if (k > K_MAX) throw new Error(`validador: pulo com mais de ${K_MAX} quadros no quadro ${f}`);
      const key = pack(k, h, p, mask, air);
      let ci = next.map.get(key);
      if (ci === undefined) { ci = next.keys.length; next.map.set(key, ci); next.keys.push(key); next.ys.push(y); next.vys.push(vy); }
      if (rec) prev.succ[pi].push({ c: ci, hits, press, air });
    };

    for (let pi = 0; pi < prev.keys.length; pi++) {
      const key = prev.keys[pi];
      const k = key & K_MAX;
      const h = (key >> K_BITS) & H_MAX;
      let p = (key >> (K_BITS + H_BITS)) & ((1 << P_BITS) - 1);
      const mask = (key >> MASK_SHIFT) & ((1 << SLOTS) - 1) & ~exp;
      const air0 = key & AIR_BIT ? 1 : 0;
      if (p > 0) { p++; if (p > P_TOTAL) p = 0; }
      const canPunch = p === 0 && (ok & ~mask) !== 0;
      for (let punch = 0; punch <= (canPunch ? 1 : 0); punch++) {
        const p2 = punch ? 1 : p;
        const air = punch ? (k > 0 ? 1 : 0) : air0;
        if (k === 0) {
          // no teto: fica, ou decola (bloqueado no preparo e na fase ativa do soco)
          emit(pi, 0, 0, p2, mask, roof - PLAYER_H, 0, punch ? 'P' : '', air);
          if (!(p2 > 0 && p2 <= P_LAST + 1)) {
            const vy = Math.min(-jumpVel + PHYS.gravity * DT, PHYS.maxFall);
            const y = prev.ys[pi] + vy * DT;
            if (y + PLAYER_H >= roof) emit(pi, 0, 0, 0, mask, roof - PLAYER_H, 0, 'J', 0);
            else emit(pi, 1, 0, 0, mask, y, vy, 'J', 0);
          }
        } else {
          const rising = h === 0 && prev.vys[pi] < 0;
          for (let rel = 0; rel <= (rising ? 1 : 0); rel++) {
            let vy = prev.vys[pi];
            if (rel) vy *= FEEL.jumpCut;
            vy = Math.min(vy + PHYS.gravity * DT, PHYS.maxFall);
            const y = prev.ys[pi] + vy * DT;
            const press = (punch ? 'P' : '') + (rel ? 'R' : '');
            if (y + PLAYER_H >= roof) emit(pi, 0, 0, p2, mask, roof - PLAYER_H, 0, press, air);
            else emit(pi, k + 1, rel ? Math.min(k + 1, H_MAX) : h, p2, mask, y, vy, press, air);
          }
        }
      }
    }
    return next;
  }

  /**
   * Passada para a frente. Guarda a camada do início de cada janela de 96 quadros.
   * Onde não sobra estado sem dano, registra a falha e segue com 1,0 s de invulnerabilidade (como no jogo).
   */
  function forward() {
    const snaps = [];
    const fails = [];
    const invulnAt = new Uint8Array(NFRAMES + 2);
    let layer = start();
    let invulnUntil = -1;
    let maxStates = 1;
    for (let f = 1; f <= NFRAMES; f++) {
      if ((f - 1) % CHUNK === 0) snaps.push(layer);
      const culprits = new Set();
      let next = step(f, layer, f <= invulnUntil, false, culprits);
      if (next.keys.length === 0) {
        fails.push({ f, culprits: [...culprits] });
        invulnUntil = f + Math.round(UBER.invuln * HZ);
        next = step(f, layer, true, false, null);
      }
      if (f <= invulnUntil) invulnAt[f] = 1;
      layer = next;
      if (layer.keys.length > maxStates) maxStates = layer.keys.length;
    }
    return { snaps, fails, invulnAt, last: layer, maxStates };
  }

  /** Recalcula as camadas de uma janela gravando sucessores e marca quem ainda fecha a fase (`alive`). */
  function chunkLayers(ci, fw, aliveNext) {
    const f0 = ci * CHUNK;
    const f1 = Math.min(NFRAMES, f0 + CHUNK);
    const src = fw.snaps[ci];
    const layers = [{ keys: src.keys, ys: src.ys, vys: src.vys, map: src.map, succ: null }];
    for (let f = f0 + 1; f <= f1; f++) layers.push(step(f, layers[layers.length - 1], fw.invulnAt[f] === 1, true, null));
    const last = layers[layers.length - 1];
    last.alive = last.keys.map((key) => (aliveNext ? aliveNext.has(key) : true));
    for (let i = layers.length - 2; i >= 0; i--) {
      const L = layers[i];
      const N = layers[i + 1];
      L.alive = L.succ.map((ss) => ss.some((s) => N.alive[s.c]));
    }
    return { f0, f1, layers };
  }

  /**
   * Passada para trás + medições. Para cada entidade: quadros de aperto de soco que a acertam e quadros
   * de decolagem que a atravessam no ar, sempre em execuções que vão do começo ao fim sem dano.
   */
  function analyze(fw) {
    const nChunks = fw.snaps.length;
    const punchFrames = ents.map(() => new Set());
    const takeoffFrames = ents.map(() => new Set());
    const airPunchFrames = ents.map(() => new Set()); // apertos no ar que acertam (informativo, fora da R10)
    const hopFrames = ents.map(() => new Set()); // decolagens que passam por cima de um alvo SEM socar
    const AIR_ONLY = 'zX'; // alvos da faixa alta: só o soco no ar alcança
    const coinOk = coins.map(() => false);
    const crossAt = new Map(); // quadro → obstáculos de pular cujo centro o Pardo cruza
    for (const e of ents) {
      if (!JUMP_OBST.includes(e.ch) && !(e.punchable && e.harmful && e.row === 8)) continue;
      const f = Math.round(e.fEnc);
      (crossAt.get(f) ?? crossAt.set(f, []).get(f)).push(e);
    }
    const aliveStart = new Array(nChunks + 1).fill(null);
    for (let ci = nChunks - 1; ci >= 0; ci--) {
      const { f0, layers } = chunkLayers(ci, fw, aliveStart[ci + 1]);
      for (let i = 0; i < layers.length; i++) {
        const f = f0 + i;
        const L = layers[i];
        const N = layers[i + 1];
        if (N) {
          for (let s = 0; s < L.keys.length; s++) {
            if (!L.alive[s]) continue;
            for (const t of L.succ[s]) {
              if (!t.hits || !N.alive[t.c]) continue;
              const ck = N.keys[t.c];
              const p = (ck >> (K_BITS + H_BITS)) & ((1 << P_BITS) - 1);
              const k = ck & K_MAX;
              for (const id of t.hits) {
                const pressF = f + 1 - (p - 1);
                if (t.air && !AIR_ONLY.includes(ents[id].ch)) airPunchFrames[id].add(pressF); else punchFrames[id].add(pressF);
                if (ents[id].ch === 'z' && k > 0) takeoffFrames[id].add(f + 1 - k + 1);
              }
            }
          }
        }
        if (i === 0 && ci > 0) continue; // a camada inicial já foi medida como final da janela anterior
        const cross = crossAt.get(f);
        const cs = coinsAt[f];
        if (!cross && cs.length === 0) continue;
        const maskOf = (key) => (key >> MASK_SHIFT) & ((1 << SLOTS) - 1);
        for (let s = 0; s < L.keys.length; s++) {
          if (!L.alive[s]) continue;
          const k = L.keys[s] & K_MAX;
          if (cross && k > 0) {
            for (const e of cross) {
              if (!e.punchable) takeoffFrames[e.id].add(f - k + 1);
              else if (!(maskOf(L.keys[s]) & e.bit)) hopFrames[e.id].add(f - k + 1);
            }
          }
          const y = L.ys[s];
          for (const c of cs) if (!coinOk[c]) { const b = coins[c].box; if (y < b[1] + b[3] && y + PLAYER_H > b[1]) coinOk[c] = true; }
        }
      }
      aliveStart[ci] = new Set(layers[0].keys.filter((_, s) => layers[0].alive[s]));
    }
    return { punchFrames, takeoffFrames, airPunchFrames, hopFrames, coinOk, aliveStart };
  }

  /** Uma execução do começo ao fim sem dano: em cada quadro, a ação mais "preguiçosa" que ainda fecha a fase. */
  function extractPath(fw, an) {
    const actions = [];
    let key = 0;
    for (let ci = 0; ci < fw.snaps.length; ci++) {
      const { f0, layers } = chunkLayers(ci, fw, an.aliveStart[ci + 1]);
      let s = layers[0].map.get(key);
      for (let i = 0; i + 1 < layers.length; i++) {
        const t = layers[i].succ[s].find((x) => layers[i + 1].alive[x.c]);
        if (!t) return null;
        if (t.press) actions.push({ f: f0 + i + 1, press: t.press });
        if (t.hits) actions.push({ f: f0 + i + 1, hits: t.hits });
        s = t.c;
      }
      key = layers[layers.length - 1].keys[s];
    }
    return actions;
  }

  return { forward, analyze, extractPath };
}

/** maior sequência de quadros consecutivos de um conjunto: [tamanho, primeiro quadro] */
function longestRun(set) {
  const fs = [...set].sort((a, b) => a - b);
  let best = 0, bestStart = -1, run = 0, start = -1;
  for (let i = 0; i < fs.length; i++) {
    if (i > 0 && fs[i] === fs[i - 1] + 1) run++; else { run = 1; start = fs[i]; }
    if (run > best) { best = run; bestStart = start; }
  }
  return [best, bestStart];
}

const secs = (f) => (f / HZ).toFixed(2).padStart(6) + 's';
const describeFail = (x) => `c.${frameBar(x.f)} (${secs(x.f).trim()}): ${[...new Set(x.culprits.map((e) => `'${e.ch}' ${pos(e.col)}`))].join(', ') || '?'}`;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. EXECUÇÃO
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const st = staticChecks();
let report = null;
if (st) {
  const ents = buildEntities(st.all);
  const coins = st.coins.map((c) => ({ ...c }));

  // Passada 1 — envelope reduzido: existe execução do começo ao fim sem dano
  const sim1 = makeSim(ents, coins, { jumpScale: 0.95 });
  const fw1 = sim1.forward();
  for (const x of fw1.fails) err(`passada 1 (pulo a 95 %): dano inevitável em ${describeFail(x)}`);
  let path = null;
  if (fw1.fails.length === 0 && PRINT) {
    const an1 = sim1.analyze(fw1);
    path = sim1.extractPath(fw1, an1);
    if (!path) err('passada 1: não foi possível reconstruir a execução sem dano');
  }

  // Passada 2 — envelope real: moedas, alvos e janelas (R10)
  const sim2 = makeSim(ents, coins, {});
  const fw2 = sim2.forward();
  for (const x of fw2.fails) err(`passada 2 (envelope real): dano inevitável em ${describeFail(x)}`);
  const an2 = sim2.analyze(fw2);
  coins.forEach((c, i) => { if (!an2.coinOk[i]) err(`passada 2: moeda de ${pos(c.col)} (linha ${c.row}) não é coletável sem direcional e sem dano`); });
  const rows = [];
  let minPunch = null, minTake = null;
  for (const e of ents) {
    const ato1 = e.bar <= ACTS[0].to; // embarque + Ato 1 usam o piso mais folgado
    const [needP, needT] = ato1 ? R10.ato1 : R10.base;
    const row = { e, punch: null, take: null, hop: null };
    const under = e.row === 8 && ents.some((h) => HIGH_OBST.includes(h.ch) && e.col >= h.col && e.col <= h.col + (h.ch === 'G' ? 2 : 0));
    if (under && e.harmful) row.hop = longestRun(an2.hopFrames[e.id]);
    if (e.punchable) {
      const [n, f] = longestRun(an2.punchFrames[e.id]);
      row.punch = [n, f];
      if (n === 0) err(`passada 2: '${e.ch}' (${LEGEND[e.ch]}) de ${pos(e.col)} não é socável ${'zX'.includes(e.ch) ? '' : 'em pé '}numa execução sem dano`);
      else if (n < needP) err(`R10 ${pos(e.col)}: janela de soco de '${e.ch}' com ${n} quadros (mínimo ${needP})`);
      if (n > 0 && (!minPunch || n < minPunch.n)) minPunch = { n, e };
    }
    if (JUMP_OBST.includes(e.ch) || e.ch === 'z') {
      const [n, f] = longestRun(an2.takeoffFrames[e.id]);
      row.take = [n, f];
      if (n === 0) { if (e.ch !== 'z') err(`passada 2: '${e.ch}' de ${pos(e.col)} não é pulável numa execução sem dano`); }
      else if (n < needT) err(`R10 ${pos(e.col)}: janela de decolagem de '${e.ch}' com ${n} quadros (mínimo ${needT})`);
      if (n > 0 && (!minTake || n < minTake.n)) minTake = { n, e };
    }
    rows.push(row);
  }

  // Passada 3 — robustez (só avisa): aproximação de 80 e de 160 px/s
  const robust = [];
  for (const s of [-UBER.steer, UBER.steer]) {
    const fw3 = makeSim(ents, coins, { steer: s }).forward();
    for (const x of fw3.fails) {
      const msg = `robustez (aproximação de ${UBER.speed + s} px/s): sem solução em ${describeFail(x)}`;
      warn(msg);
      robust.push({ speed: UBER.speed + s, bar: frameBar(x.f) });
    }
  }
  report = { ents, coins, rows, path, minPunch, minTake, robust, maxStates: Math.max(fw1.maxStates, fw2.maxStates) };
}

// ── --print ─────────────────────────────────────────────────────────────────────────────────────────────────
if (PRINT && report) {
  const { ents, rows, path } = report;
  const win = (w) => (w ? (w[0] ? `${String(w[0]).padStart(2)}q` : ' —') : '   ');
  console.log('PARTITURA — encontro na posição neutra · resposta · janelas (quadros de 1/60 s)');
  console.log('compasso   encontro  marc.  soco  decol.  resposta');
  let lastBar = 0;
  for (const r of rows) {
    const e = r.e;
    if (e.bar !== lastBar) { if (lastBar && e.bar - lastBar > 1) console.log('  ·'); lastBar = e.bar; }
    const under = !r.hop ? '' : r.hop[0] === 0 ? ' — OBRIGATÓRIO (nenhum pulo passa)' : ` — sob '${HIGH_OBST.includes(ROWS[5][e.col]) ? ROWS[5][e.col] : 'G'}': soco esperado (um pulinho baixo ainda passa: ${r.hop[0]}q de decolagem)`;
    console.log(`${pos(e.col)}  ${secs(e.fEnc)}    ${e.ch}     ${win(r.punch)}   ${win(r.take)}    ${RESPOSTA[e.ch]}${under}`);
  }
  if (path) {
    console.log('\nEXECUÇÃO SEM DANO (passada 1, pulo a 95 %; em cada quadro a ação mais tardia que ainda fecha a fase)');
    const byId = new Map(ents.map((e) => [e.id, e]));
    let jumpAt = -1;
    const lines = [];
    for (const a of path) {
      const where = `c.${String(frameBar(a.f)).padStart(2, '0')} ${secs(a.f)} q${String(a.f).padStart(4)}`;
      if (a.hits) { for (const id of a.hits) lines.push(`${where}    → acerta '${byId.get(id).ch}' (${LEGEND[byId.get(id).ch]}) de ${pos(byId.get(id).col)}`); continue; }
      if (a.press.includes('J')) { jumpAt = a.f; lines.push(`${where}  PULO`); }
      if (a.press.includes('P')) lines.push(`${where}  SOCO`);
      if (a.press.includes('R')) lines.push(`${where}    solta o pulo (${a.f - jumpAt} quadros segurando)`);
    }
    console.log(lines.join('\n'));
    console.log(`(${path.filter((a) => a.press?.includes('J')).length} pulos, ${path.filter((a) => a.press?.includes('P')).length} socos)`);
  }
  console.log('');
}

// ── Resumo ──────────────────────────────────────────────────────────────────────────────────────────────────
if (st) {
  const n = (ch) => st.all.filter((m) => m.ch === ch).length;
  console.log(`mapa ${ROWS[0].length}×${ROWS.length} · ${BARS.length} compassos · ${NFRAMES} quadros (${(NFRAMES / HZ).toFixed(1)} s)`);
  console.log(`contagens: ${Object.keys(EXPECTED).map((ch) => `${ch}=${n(ch)}`).join(' ')} · moedas=${st.coins.length}`);
}
if (report) {
  const { minPunch, minTake } = report;
  if (minPunch) console.log(`menor janela de soco: ${minPunch.n} quadros ('${minPunch.e.ch}' em ${pos(minPunch.e.col)})`);
  if (minTake) console.log(`menor janela de decolagem: ${minTake.n} quadros ('${minTake.e.ch}' em ${pos(minTake.e.col)})`);
  const a1 = report.rows.filter((r) => r.e.bar <= ACTS[0].to);
  const mp = Math.min(...a1.filter((r) => r.punch?.[0]).map((r) => r.punch[0]));
  const mt = Math.min(...a1.filter((r) => r.take?.[0]).map((r) => r.take[0]));
  console.log(`no embarque + Ato 1: soco ≥ ${mp} quadros, decolagem ≥ ${mt} quadros`);
}
for (const w of warnings) console.log(`AVISO: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERRO: ${e}`);
  console.error(`level5 FALHOU (${errors.length} erro${errors.length > 1 ? 's' : ''})`);
  process.exit(1);
}
console.log(`passada 1 (pulo a 95 %): fecha sem dano · passada 2 (envelope real): moedas, alvos e R10 conferidos · passada 3: ${warnings.length} aviso(s)`);
console.log('level5 OK');
