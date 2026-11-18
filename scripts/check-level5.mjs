// Valida o mapa da Fase 5 — Marginal de São Paulo (Autoscroller no Uber).
// Uso: node scripts/check-level5.mjs [--print] [--verbose]
//
// Checagens estáticas (legenda, dimensões 240x14, contagens mínimas, linha 10 livre de sólidos,
// vãos sobre o Rio Tietê '~' / cavaletes '^', convenção dos ônibus 'R' com 'w' e 'b', apoio de
// marcadores considerando o teto do Uber em y=160 onde a linha 11 é '=', movers, vigas bambas,
// distâncias e regras de cada inimigo, ritmo de checkpoints e coolers, e zona pacífica de desembarque)
// + SIMULAÇÃO física do Pardo (com o teto do Uber na linha 10 como superfície one-way em toda coluna
// onde a linha 11 tem asfalto '=') em duas passadas:
//   1) envelope REDUZIDO (pulo 95%, corrida 90%): objetivo A, todos os checkpoints K e coolers V
//      alcançáveis, paredes de barreiras B quebráveis e zero becos sem saída;
//   2) envelope REAL: todas as moedas 'c' coletáveis, todas as caixas '?/W' socáveis e todos os
//      pichadores 'z' alcançáveis.
const { LEVEL5_ROWS: rows, LEVEL5_LEGEND: legend, LEVEL5_MOVERS: movers } =
  await import(process.env.LEVEL5_FILE ?? '../src/game/level5.ts');

const VERBOSE = process.argv.includes('--verbose');
const errors = [], warns = [], notes = [];
const err = (m) => errors.push(m);
const H = rows.length, W = rows[0].length;
const at = (x, y) => (rows[y]?.[x]) ?? '.';
const count = {};
rows.forEach((r, y) => {
  if (r.length !== W) err(`linha ${y}: largura ${r.length} != ${W}`);
  [...r].forEach((c, x) => {
    if (!(c in legend)) err(`caractere '${c}' fora da legenda em ${x},${y}`);
    (count[c] ??= []).push([x, y]);
  });
});
const all = (c) => count[c] ?? [];
const n = (c) => all(c).length;
const min = (c, k, label) => { if (n(c) < k) err(`${label}: ${n(c)} < ${k}`); };

// Limites dos 4 Atos (0..59, 60..124, 125..207, 208..239)
const ACT2 = 60, ACT3 = 125, ACT4 = 208;
const actOf = (x) => (x < ACT2 ? 1 : x < ACT3 ? 2 : x < ACT4 ? 3 : 4);

// ── 1. Formato e contagens mínimas ───────────────────────────────────────────
if (H !== 14) err(`altura ${H} != 14`);
if (W !== 240) err(`largura ${W} != 240`);
if (n('P') !== 1) err(`spawn P: ${n('P')} != 1`);
if (n('A') !== 1) err(`objetivo A: ${n('A')} != 1`);
min('K', 5, 'checkpoints K');
min('c', 70, 'moedas c');
min('V', 4, 'coolers V');
min('y', 6, 'motoboys y');
min('u', 6, 'drones u');
min('p', 6, 'patinetes p');
min('z', 4, 'pichadores z');
if (n('m') + n('M') < 3) err(`movers (m+M): ${n('m') + n('M')} < 3`);
min('d', 3, 'vigas bambas d');
min('B', 12, 'barreiras B');
min('?', 4, 'caixas ?');
min('W', 3, 'caixas W');
for (const c of 'bwsrln') min(c, 1, `decoração '${c}'`);

for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`];
  if (!mv || !(mv.range > 0) || !(mv.speed > 0)) err(`mover ${x},${y} sem parâmetros válidos`);
}
for (const k of Object.keys(movers)) {
  const [x, y] = k.split(',').map(Number);
  if (!'mM'.includes(at(x, y))) err(`mover ${k} sem marcador m/M`);
}

const solid = (c) => '=#RB?W'.includes(c);
const uberRoof = (x) => x >= 0 && x < W && at(x, 11) === '=';
const surface = (x, y) => solid(at(x, y)) || at(x, y) === '-' || (y === 10 && uberRoof(x));

// Linha 10 é a faixa do carro da Uber: nunca deve conter tiles sólidos, one-way ou perigos
for (let x = 0; x < W; x++) {
  const c10 = at(x, 10);
  if (solid(c10) || c10 === '-' || c10 === '^' || c10 === '~') {
    err(`linha 10 na coluna ${x} tem tile '${c10}' no caminho do Uber`);
  }
}

// Linha 11..13: ou asfalto sobre viaduto ('=##'), ou vão sobre o Rio Tietê ('.~~'), ou vão com cavaletes ('..^')
for (let x = 0; x < W; x++) {
  const col = [11, 12, 13].map((y) => at(x, y)).join('');
  if (col !== '=##' && col !== '.~~' && col !== '..^') {
    err(`fundação/vão malformado na coluna ${x} (linhas 11..13 = '${col}', esperado '=##', '.~~' ou '..^')`);
  }
}
for (let x = 0; x < W; x++) for (let y = 0; y < 11; y++) {
  if (at(x, y) === '=' || at(x, y) === '#' || at(x, y) === '~' || at(x, y) === '^') {
    err(`tile '${at(x, y)}' fora das linhas 11..13 em ${x},${y}`);
  }
}

// ── 2. Ônibus/furgões ('R' nas linhas 7..9 com 'w' e 'b' na linha 10) e parede final ──
for (let y = 0; y <= 9; y++) if (at(W - 1, y) !== 'R') err(`parede final: coluna ${W - 1} linha ${y} não é 'R'`);
const seenR = new Set(), buses = [];
for (const [x0, y0] of all('R')) {
  if (x0 === W - 1 || seenR.has(`${x0},${y0}`)) continue;
  const comp = [], st = [[x0, y0]]; seenR.add(`${x0},${y0}`);
  while (st.length) {
    const [x, y] = st.pop(); comp.push([x, y]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (at(x + dx, y + dy) === 'R' && x + dx !== W - 1 && !seenR.has(k)) { seenR.add(k); st.push([x + dx, y + dy]); }
    }
  }
  const xs = comp.map(([x]) => x), ys = comp.map(([, y]) => y);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys), w = r - l + 1;
  if (t !== 7 || b !== 9 || comp.length !== w * 3) { err(`ônibus em ${l},${t}: não é retângulo nas linhas 7..9`); continue; }
  if (w < 5 || w > 7) err(`ônibus em ${l}: largura ${w} fora de 5..7`);
  for (let x = l; x <= r; x++) {
    const want = (x - l) % 3 === 0 ? 'w' : '.';
    if (at(x, 10) !== want) err(`ônibus em ${l}: linha 10 na coluna ${x} = '${at(x, 10)}', esperado '${want}'`);
  }
  if (at(r + 1, 10) !== 'b') err(`ônibus em ${l}: sem frente 'b' em ${r + 1},10`);
  for (let x = l; x <= r + 3; x++) if (at(x, 11) !== '=') err(`ônibus em ${l}: sem asfalto '=' na linha 11 na coluna ${x}`);
  for (let x = r + 1; x <= r + 3; x++) if (solid(at(x, 9)) || solid(at(x, 8))) err(`ônibus em ${l}: bloco sólido sobre a frente 'b' na coluna ${x}`);
  buses.push(l);
}
for (const [x, y] of all('b')) if (y !== 10 || !buses.some((l) => at(x - 1, 9) === 'R' && x - 1 >= l)) err(`frente de ônibus 'b' em ${x},${y} fora de um ônibus`);
for (const [x, y] of all('w')) if (y !== 10 || at(x, 9) !== 'R') err(`rodas 'w' em ${x},${y} fora de um ônibus`);
if (buses.length < 4) err(`ônibus/furgões: ${buses.length} < 4`);

// ── 3. Apoio e espaço dos marcadores ─────────────────────────────────────────
for (const c of 'PKcyupzVAbwsrlnd') for (const [x, y] of all(c)) if (solid(at(x, y))) err(`'${c}' em ${x},${y} dentro de tile sólido`);
for (const c of 'PKypzVA') for (const [x, y] of all(c)) if (!surface(x, y + 1)) err(`'${c}' em ${x},${y} sem apoio abaixo (tile ou teto do Uber)`);
for (const c of 'PKVA') for (const [x, y] of all(c)) if (y !== 9 || !uberRoof(x)) err(`'${c}' em ${x},${y} deve ficar na linha 9 sobre asfalto '='`);
for (const c of 'VPKAyupz') for (const [x, y] of all(c)) if (solid(at(x, y - 1))) err(`'${c}' em ${x},${y} sem 2 tiles livres de altura`);
if (all('A')[0] && solid(at(all('A')[0][0], all('A')[0][1] - 2))) err('objetivo A sem 3 tiles livres de altura');

// Decorações de pista na linha 10 sobre asfalto '='
for (const c of 'bwsrln') for (const [x, y] of all(c)) {
  if (y !== 10) err(`decoração '${c}' em ${x},${y} fora da linha 10`);
  if (at(x, 11) !== '=') err(`decoração '${c}' em ${x},${y} sem asfalto '=' na linha 11`);
}
const wideDecor = { b: 3, w: 3, s: 2 };
for (const [c, w] of Object.entries(wideDecor)) for (const [x, y] of all(c)) for (let i = 0; i < w; i++) {
  if (at(x + i, 11) !== '=') err(`decoração larga '${c}' em ${x},${y} sem asfalto '=' em ${x + i},11`);
}

// ── 4. Movers e vigas bambas ─────────────────────────────────────────────────
const free = (c) => c === '.' || c === 'c';
for (const [x, y] of all('m')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let i = 0; i <= mv.range + 1; i++) {
    if (i > 0 && !free(at(x + i, y))) err(`drone-plataforma H ${x},${y}: caminho bloqueado por '${at(x + i, y)}' em ${x + i}`);
    if (solid(at(x + i, y + 1))) err(`drone-plataforma H ${x},${y}: sobre tile sólido em ${x + i}`);
    if (solid(at(x + i, y - 1)) || solid(at(x + i, y - 2))) err(`drone-plataforma H ${x},${y}: teto baixo em ${x + i}`);
  }
}
for (const [x, y] of all('M')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let j = -2; j <= mv.range; j++) for (const dx of [0, 1]) {
    if (!(j === 0 && dx === 0) && !free(at(x + dx, y + j))) err(`drone-plataforma V ${x},${y}: bloqueado em ${x + dx},${y + j}`);
  }
  if (y + mv.range > 9) err(`drone-plataforma V ${x},${y}: desce abaixo da linha 9`);
}
for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  const period = (2 * mv.range * 16) / mv.speed, peak = (Math.PI / 2) * mv.speed;
  notes.push(`mover ${x},${y} (${at(x, y)}): percurso ${mv.range} tiles, período ${period.toFixed(1)}s, pico ${peak.toFixed(0)}px/s`);
  if (period > 6.5) err(`mover ${x},${y}: período ${period.toFixed(1)}s > 6.5s`);
  if (peak > 90) err(`mover ${x},${y}: pico de ${peak.toFixed(0)}px/s > 90`);
}
for (const [x, y] of all('d')) for (const dx of [0, 1]) {
  if (dx && !free(at(x + dx, y))) err(`viga bamba ${x},${y}: célula ${x + dx} ocupada por '${at(x + dx, y)}'`);
  if (solid(at(x + dx, y + 1))) err(`viga bamba ${x},${y}: sobre tile sólido em ${x + dx}`);
  if (solid(at(x + dx, y - 1)) || solid(at(x + dx, y - 2))) err(`viga bamba ${x},${y}: teto baixo em ${x + dx}`);
}

// ── 5. Inimigos: distâncias, corredores e regras por tipo ────────────────────
const P = all('P')[0], A = all('A')[0];
if (P && (P[0] !== 5 || P[1] !== 9)) err(`spawn P em ${P}, esperado 5,9`);
if (A && (A[0] !== 233 || A[1] !== 9)) err(`objetivo A em ${A}, esperado 233,9`);

const safe = [...all('P'), ...all('K')];
const enemies = [...all('y'), ...all('u'), ...all('p'), ...all('z')];
for (const [x, y] of enemies) {
  for (const [sx] of safe) if (Math.abs(x - sx) < 5) err(`inimigo '${at(x, y)}' em ${x},${y} a menos de 5 colunas de P/K (${sx})`);
  if (x >= ACT4) err(`inimigo '${at(x, y)}' em ${x},${y} no Ato 4 (zona pacífica, col >= ${ACT4})`);
}

/** Corredor plano contínuo na linha y (apoio em y+1 via tile ou teto do Uber, 2 tiles livres de altura). */
const corridor = (x, y) => {
  const ok = (i) => surface(i, y + 1) && !solid(at(i, y)) && !solid(at(i, y - 1));
  let a = x, b = x;
  while (a > 0 && ok(a - 1)) a--;
  while (b < W - 1 && ok(b + 1)) b++;
  return [a, b];
};
for (const [x, y] of all('y')) {
  if (actOf(x) === 1) err(`motoboy ${x},${y} no Ato 1 (deve estrear no Ato 2)`);
  const [a, b] = corridor(x, y);
  if (b - a + 1 < 9) err(`motoboy ${x},${y}: corredor plano ${a}..${b} (${b - a + 1}) < 9 colunas`);
}
for (const [x, y] of all('p')) {
  const [a, b] = corridor(x, y);
  if (b - a + 1 < 4) err(`patinete ${x},${y}: corredor curto ${a}..${b} (${b - a + 1}) < 4 colunas`);
}
for (const [x, y] of all('z')) {
  if (actOf(x) === 1) err(`pichador ${x},${y} no Ato 1 (deve estrear no Ato 2)`);
  if (y > 6) err(`pichador ${x},${y}: deve ficar no alto de ônibus/passarela (linha <= 6, superfície <= 7)`);
}
for (const [x, y] of all('u')) {
  if (y > 8 || y < 3) err(`drone ${x},${y}: linha ${y} fora da faixa aérea 3..8`);
  for (let dx = -2; dx <= 2; dx++) if (solid(at(x + dx, y))) err(`drone ${x},${y}: bloqueado por tile sólido em ${x + dx},${y}`);
}

// ── 6. Ritmo, estrutura dos 4 Atos e Desembarque ─────────────────────────────
const stops = [P[0], ...all('K').map(([x]) => x).sort((a, b) => a - b), A ? A[0] : W - 1];
for (let i = 1; i < stops.length; i++) {
  const d = stops[i] - stops[i - 1];
  if (d > 45) err(`trecho sem checkpoint de ${d} colunas (${stops[i - 1]}→${stops[i]}) > 45`);
  if (d < 15) err(`checkpoints muito próximos (${stops[i - 1]}→${stops[i]})`);
}
const water = [...all('V'), ...all('W')].map(([x]) => x).sort((a, b) => a - b);
{
  let prev = P[0];
  for (const x of [...water, A ? A[0] : W - 1]) {
    if (x - prev > 45) err(`${x - prev} colunas sem fonte de hidratação (V/W) entre ${prev} e ${x}`);
    prev = x;
  }
}
if (!all('V').some(([x]) => actOf(x) === 1)) err('sem cooler V no Ato 1');
if (!all('V').some(([x]) => actOf(x) === 2)) err('sem cooler V no Ato 2');
if (!all('V').some(([x]) => actOf(x) === 3)) err('sem cooler V no Ato 3');
if (!all('V').some(([x]) => actOf(x) === 4)) err('sem cooler V no Ato 4');
if (!all('K').some(([x]) => actOf(x) === 1)) err('sem checkpoint K no Ato 1');
if (all('K').filter(([x]) => actOf(x) === 2).length < 2) err('Ato 2 deve ter pelo menos 2 checkpoints (K2 e K3)');
if (!all('K').some(([x]) => actOf(x) === 3)) err('sem checkpoint K no Ato 3');
if (!all('K').some(([x]) => actOf(x) === 4)) err('sem checkpoint K no Ato 4');

const shelfRows3 = new Set(all('-').filter(([x]) => actOf(x) === 3).map(([, y]) => y));
if (shelfRows3.size < 3) err(`Ato 3: passarelas '-' em ${shelfRows3.size} nível(is) < 3`);
const wallCols = [...new Set(all('B').map(([x]) => x))].filter((x) => {
  let best = 0, h = 0;
  for (let y = 0; y < H; y++) { if ('B?W'.includes(at(x, y))) best = Math.max(best, ++h); else h = 0; }
  return best >= 2;
});
if (!wallCols.some((x) => actOf(x) === 3)) err('Ato 3 sem parede de barreiras B (2-3 de altura)');
if (!all('^').some(([x]) => actOf(x) === 3)) err('Ato 3 sem cavaletes eletrificados ^');
if (!all('~').some(([x]) => actOf(x) === 1)) err('Ato 1 sem vão sobre o Rio Tietê ~');
if (!all('~').some(([x]) => actOf(x) === 2)) err('Ato 2 sem vão sobre o Rio Tietê ~');

if (A) {
  for (let i = 1; i <= 3; i++) if (at(A[0] - i, A[1]) !== '.') err(`sem 3 tiles livres à esquerda do objetivo A (${A[0] - i})`);
  for (let x = ACT4; x < W; x++) if (at(x, 11) !== '=') err(`asfalto do Ato 4 interrompido na coluna ${x}`);
  for (const c of 'srln') if (!all(c).some(([x]) => actOf(x) === 4)) err(`Ato 4 sem decoração '${c}'`);
}

// Trechos mortos e variedade de relevo antes do Ato 4
const moverCols = new Set();
for (const [x, y] of all('m')) for (let i = 0; i <= (movers[`${x},${y}`]?.range ?? 0) + 1; i++) moverCols.add(x + i);
for (const [x] of all('M')) { moverCols.add(x); moverCols.add(x + 1); }
for (const [x] of all('d')) { moverCols.add(x); moverCols.add(x + 1); }
const interesting = (x) => {
  if (moverCols.has(x)) return true;
  if (x > 0 && at(x, 11) !== at(x - 1, 11)) return true;
  for (let y = 0; y < H; y++) if ('cyupzVKBW?-APR'.includes(at(x, y))) return true;
  return false;
};
{
  let run = 0, start = 0;
  for (let x = 0; x <= ACT4; x++) {
    if (x < ACT4 && !interesting(x)) { if (!run) start = x; run++; }
    else { if (run > 8) err(`trecho morto ${start}-${start + run - 1} (${run} colunas sem ação)`); run = 0; }
  }
}
const standRows = (x) => {
  const s = new Set();
  for (let y = 1; y <= 10; y++) if (surface(x, y) && !solid(at(x, y - 1))) s.add(y);
  return s;
};
for (let x0 = 0; x0 + 20 <= ACT4; x0++) {
  const s = new Set(); let moving = false;
  for (let x = x0; x < x0 + 20; x++) { for (const r of standRows(x)) s.add(r); if (moverCols.has(x)) moving = true; }
  if (s.size + (moving ? 1 : 0) < 3) { err(`janela ${x0}-${x0 + 19} quase plana: só ${s.size} nível(is) pisável(is)`); x0 += 19; }
}

// ── 7. Simulação física do Pardo (com teto do Uber em y=160 onde linha 11 é '=') ──
const T = 16, PW = 10, PH = 20, DT = 1 / 60, EPS = 0.001;
const GRAV = 900, MAX_FALL = 360, JUMP_CUT = 0.55, AIR_ACCEL = 620, AIR_DRAG = 160;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);

const plats = [];
for (const [x, y] of all('d')) plats.push({ x: x * T, y: y * T, w: 32, g: -1 });
for (const [x, y] of all('m')) plats.push({ x: x * T, y: y * T, w: (movers[`${x},${y}`]?.range ?? 0) * T + 32, g: -1 });
let group = 0;
for (const [x, y] of all('M')) {
  const R = movers[`${x},${y}`]?.range ?? 0;
  for (let k = 0; k <= R * 2; k++) plats.push({ x: x * T, y: y * T + k * 8, w: 32, g: group });
  group++;
}

function simulate(env, removed) {
  const sol = new Uint8Array(W * H), one = new Uint8Array(W * H), haz = new Uint8Array(W * H), coin = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y), i = y * W + x;
    if (solid(c) && !removed.has(i)) sol[i] = 1;
    // O teto do carro da Uber em y = 10*16 = 160 funciona como superfície one-way sempre que a linha 11 tem '='
    if (c === '-' || (y === 10 && uberRoof(x))) one[i] = 1;
    if (c === '^' || c === '~') haz[i] = 1;
    if (c === 'c') coin[i] = i;
  }
  const isSolid = (tx, ty) => (tx < 0 || tx >= W ? true : ty < 0 || ty >= H ? false : sol[ty * W + tx] === 1);
  const isOne = (tx, ty) => tx >= 0 && tx < W && ty >= 0 && ty < H && one[ty * W + tx] === 1;
  const isHaz = (tx, ty) => tx >= 0 && tx < W && ty >= 0 && ty < H && haz[ty * W + tx] === 1;
  const bodyFree = (x, y) => {
    for (let ty = Math.floor(y / T); ty <= Math.floor((y + PH - EPS) / T); ty++)
      for (let tx = Math.floor(x / T); tx <= Math.floor((x + PW - EPS) / T); tx++) if (isSolid(tx, ty)) return false;
    return true;
  };
  const hazard = (x, y) => {
    for (let ty = Math.floor((y + 4) / T); ty <= Math.floor((y + PH - 0.01) / T); ty++)
      for (let tx = Math.floor((x + 2) / T); tx <= Math.floor((x + PW - 2) / T); tx++) if (isHaz(tx, ty)) return true;
    return false;
  };
  const platUnder = (x, feet) => plats.find((p) => p.y === feet && x + PW > p.x && x < p.x + p.w);
  const supported = (x, y) => {
    const feet = y + PH;
    if (feet % T === 0) {
      const ty = feet / T;
      for (let tx = Math.floor(x / T); tx <= Math.floor((x + PW - EPS) / T); tx++) if (isSolid(tx, ty) || isOne(tx, ty)) return true;
    }
    return !!platUnder(x, feet);
  };
  const touched = new Set();
  const touchCoins = (x, y, into) => {
    for (let ty = Math.floor(y / T); ty <= Math.floor((y + PH - EPS) / T); ty++)
      for (let tx = Math.floor(x / T); tx <= Math.floor((x + PW - EPS) / T); tx++) {
        if (tx < 0 || tx >= W || ty < 0 || ty >= H || coin[ty * W + tx] < 0) continue;
        const cx = tx * T + 4, cy = ty * T + 4;
        if (x < cx + 8 && x + PW > cx && y < cy + 8 && y + PH > cy) into.push(ty * W + tx);
      }
  };
  const b = { x: 0, y: 0, vx: 0, vy: 0 };
  function fly(x0, y0, vx0, vy0, dir, cutFrame) {
    b.x = x0; b.y = y0; b.vx = vx0; b.vy = vy0;
    let jumping = vy0 < 0;
    const got = [];
    for (let f = 0; f < 220; f++) {
      b.vx = approach(b.vx, dir * env.run, (dir === 0 ? AIR_DRAG : AIR_ACCEL) * DT);
      if (jumping && b.vy < 0 && f >= cutFrame) { b.vy *= JUMP_CUT; jumping = false; }
      if (b.vy >= 0) jumping = false;
      const prevBottom = b.y + PH;
      b.vy = Math.min(b.vy + GRAV * DT, MAX_FALL);
      const totalX = b.vx * DT, totalY = b.vy * DT;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalX), Math.abs(totalY)) / 4));
      let sx = totalX / steps, sy = totalY / steps, ground = false;
      for (let i = 0; i < steps; i++) {
        if (sx !== 0) {
          b.x += sx;
          const tx = sx > 0 ? Math.floor((b.x + PW - EPS) / T) : Math.floor(b.x / T);
          for (let ty = Math.floor(b.y / T); ty <= Math.floor((b.y + PH - EPS) / T); ty++) if (isSolid(tx, ty)) { b.x = sx > 0 ? tx * T - PW : (tx + 1) * T; b.vx = 0; sx = 0; break; }
        }
        if (sy !== 0) {
          const pb = b.y + PH;
          b.y += sy;
          const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + PW - EPS) / T);
          if (sy > 0) {
            const ty = Math.floor((b.y + PH - EPS) / T), top = ty * T;
            for (let tx = c0; tx <= c1; tx++) if (isSolid(tx, ty) || (pb <= top + 0.5 && isOne(tx, ty))) { b.y = top - PH; b.vy = 0; sy = 0; ground = true; break; }
          } else {
            const ty = Math.floor(b.y / T);
            for (let tx = c0; tx <= c1; tx++) if (isSolid(tx, ty)) { b.y = (ty + 1) * T; b.vy = 0; sy = 0; break; }
          }
        }
        if (sx === 0 && sy === 0) break;
      }
      if (!ground && b.vy >= 0) {
        const bottom = b.y + PH; let best = null;
        for (const p of plats) {
          if (b.x + PW <= p.x || b.x >= p.x + p.w) continue;
          if (prevBottom <= p.y + 1 && bottom >= p.y && (!best || p.y < best.y)) best = p;
        }
        if (best) { b.y = best.y - PH; b.vy = 0; ground = true; }
      }
      if (hazard(b.x, b.y) || b.y > H * T + 32) return null;
      touchCoins(b.x, b.y, got);
      if (ground) { for (const g of got) touched.add(g); return { x: b.x, y: b.y }; }
    }
    return null;
  }

  const Q = 4;
  const seen = new Map();
  const queue = [];
  const back = new Map();
  let from = -1;
  const push = (x, y) => {
    let q = Math.round(x / Q) * Q;
    if (!(bodyFree(q, y) && supported(q, y) && !hazard(q, y))) q = x;
    if (!(bodyFree(q, y) && supported(q, y)) || hazard(q, y)) return;
    const key = Math.round(q * 4) * 512 + (y + 64);
    if (from >= 0 && from !== key) { let l = back.get(key); if (!l) back.set(key, (l = [])); l.push(from); }
    if (seen.has(key)) return;
    seen.set(key, [q, y]);
    queue.push([q, y, key]);
  };
  const cuts = [999, 2, 5, 8, 11, 14, 18];
  function expand(x, y) {
    const tmp = []; touchCoins(x, y, tmp); for (const g of tmp) touched.add(g);
    for (const d of [-1, 1]) {
      const nx = x + d * Q;
      if (!bodyFree(nx, y)) continue;
      if (hazard(nx, y)) continue;
      if (supported(nx, y)) push(nx, y);
      else for (const v of [env.run, env.run * 0.4]) for (const dir of [d, 0, -d]) { const r = fly(nx, y, d * v, 0, dir, 999); if (r) push(r.x, r.y); }
    }
    for (const v0 of [-env.run, 0, env.run]) for (const dir of [-1, 0, 1]) for (const cut of cuts) {
      const r = fly(x, y, v0, -env.jump, dir, cut);
      if (r) push(r.x, r.y);
    }
    const p = platUnder(x, y + PH);
    if (p && p.g >= 0) for (const o of plats) if (o.g === p.g && o !== p) push(x, o.y - PH);
  }
  return {
    seen, touched, isSolid, bodyFree, supported, back,
    run(seeds) {
      for (const [x, y] of seeds) push(x, y);
      for (let i = 0; i < queue.length; i++) { const [x, y, key] = queue[i]; from = key; expand(x, y); }
      from = -1;
    },
  };
}

function punchable(sim, states, removed, reach) {
  const out = new Set();
  const byRow = new Map();
  for (const [x, y] of states) {
    if (!(sim.bodyFree(x, y) && sim.supported(x, y))) continue;
    const feet = y + PH;
    if (feet % T) continue;
    const fr = feet / T;
    if (!byRow.has(fr)) byRow.set(fr, []);
    byRow.get(fr).push([x, y]);
  }
  for (const c of 'B?W') for (const [bx, by] of all(c)) {
    const i = by * W + bx;
    if (removed.has(i)) continue;
    search: for (let diff = 1; diff <= reach; diff++) for (const [x, y] of byRow.get(by + diff) ?? []) {
      const gapL = bx * T - (x + PW), gapR = x - (bx + 1) * T;
      const gap = gapL >= 0 ? gapL : gapR;
      if (gap < -2 || gap > 14) continue;
      if (gapL < 0 && gapR < 0) continue;
      if (diff === 3 && !sim.bodyFree(x, y - 30)) continue;
      out.add(i); break search;
    }
  }
  return out;
}

function explore(env, label) {
  const removed = new Set();
  const reached = new Map();
  const coins = new Set();
  let seeds = [[P[0] * T + (T - PW) / 2, (P[1] + 1) * T - PH]];
  let sim;
  for (let pass = 0; pass < 12; pass++) {
    sim = simulate(env, removed);
    sim.run(seeds.filter(([x, y]) => sim.bodyFree(x, y) && sim.supported(x, y)));
    for (const [k, v] of sim.seen) reached.set(k, v);
    for (const c of sim.touched) coins.add(c);
    const more = punchable(sim, sim.seen.values(), removed, 2);
    if (!more.size) break;
    for (const i of more) removed.add(i);
    seeds = [...reached.values()];
  }
  const hittable = new Set(removed);
  for (let pass = 0; pass < 12; pass++) {
    const more = punchable(simulate(env, hittable), reached.values(), hittable, 3);
    if (!more.size) break;
    for (const i of more) hittable.add(i);
  }
  const cells = new Set();
  for (const [x, y] of reached.values()) for (let tx = Math.floor(x / T); tx <= Math.floor((x + PW - EPS) / T); tx++) cells.add(`${tx},${Math.floor((y + PH - 1) / T)}`);
  const standsAt = (col, row) => cells.has(`${col},${row}`);
  notes.push(`${label}: ${reached.size} posições de apoio, ${coins.size}/${n('c')} moedas, ${hittable.size} blocos socáveis`);
  const stuck = [];
  if (A) {
    const ok = new Set(), stack = [];
    for (const [k, [x, y]] of sim.seen) if (y + PH === (A[1] + 1) * T && x + PW > (A[0] - 1) * T && x < (A[0] + 1) * T) { ok.add(k); stack.push(k); }
    while (stack.length) for (const f of sim.back.get(stack.pop()) ?? []) if (!ok.has(f)) { ok.add(f); stack.push(f); }
    for (const [k, [x, y]] of sim.seen) if (!ok.has(k)) stuck.push([Math.floor((x + PW / 2) / T), Math.floor((y + PH - 1) / T)]);
  }
  return { reached, coins, removed, hittable, standsAt, cells, stuck };
}

if (!errors.length) {
  // 7a. Caminho obrigatório com folga (envelope reduzido)
  const safeEnv = explore({ jump: 285, run: 99 }, 'envelope reduzido (pulo 95%, corrida 90%)');
  if (A && !safeEnv.standsAt(A[0], A[1]) && !safeEnv.standsAt(A[0] - 1, A[1])) err(`objetivo A inalcançável (${A}) com o envelope reduzido`);
  for (const [x, y] of all('K')) if (!safeEnv.standsAt(x, y)) err(`checkpoint ${x},${y} inalcançável com o envelope reduzido`);
  for (const [x, y] of all('V')) if (!safeEnv.standsAt(x - 1, y) && !safeEnv.standsAt(x + 1, y) && !safeEnv.standsAt(x, y)) err(`cooler ${x},${y} inalcançável com o envelope reduzido`);
  if (safeEnv.stuck.length) err(`becos sem saída (posições de onde o objetivo A não é mais alcançável): ${[...new Set(safeEnv.stuck.map(([x, y]) => `${x},${y}`))].slice(0, 30).join(' ')}`);
  for (const x of wallCols) {
    let y = H - 1;
    while (y > 0 && !'B?W'.includes(at(x, y))) y--;
    if (!safeEnv.removed.has(y * W + x)) err(`parede de barreiras na coluna ${x}: base não socável a partir de um ponto alcançável`);
  }
  // 7b. Tudo coletável e socável com o envelope real
  const full = explore({ jump: 300, run: 110 }, 'envelope real');
  const lost = all('c').filter(([x, y]) => !full.coins.has(y * W + x));
  if (lost.length) err(`${lost.length} moeda(s) não coletável(is): ${lost.slice(0, 12).map((p) => p.join(',')).join(' ')}${lost.length > 12 ? ' …' : ''}`);
  for (const c of '?W') for (const [x, y] of all(c)) if (!full.hittable.has(y * W + x)) err(`caixa '${c}' em ${x},${y} não socável`);
  for (const [x, y] of all('z')) if (!full.standsAt(x, y) && !full.standsAt(x - 1, y) && !full.standsAt(x + 1, y)) err(`pichador ${x},${y}: o Pardo não alcança o poleiro`);
  const optional = [...full.cells].filter((k) => !safeEnv.cells.has(k)).map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0]);
  const cols = [...new Set(optional.map(([x]) => x))];
  notes.push(`colunas com apoio só no envelope real (opcional/difícil): ${cols.length ? cols.join(',') : 'nenhuma'}`);
  if (VERBOSE) {
    const never = [];
    for (let x = 0; x < W; x++) for (let y = 1; y <= 10; y++) if (surface(x, y) && !solid(at(x, y - 1)) && at(x, y - 1) !== '-' && !full.standsAt(x, y - 1)) never.push(`${x},${y}`);
    notes.push(`superfícies nunca pisadas: ${never.join(' ') || 'nenhuma'}`);
  }
}

if (process.argv.includes('--print')) {
  for (let x0 = 0; x0 < W; x0 += 60) {
    console.log('    ' + Array.from({ length: Math.min(60, W - x0) }, (_, i) => ((x0 + i) % 10 === 0 ? '|' : ' ')).join('') + `  (${x0}-${Math.min(W, x0 + 60) - 1})`);
    rows.forEach((r, y) => console.log(String(y).padStart(2) + '  ' + r.slice(x0, x0 + 60)));
  }
}
console.log(`mapa ${W}x${H}`);
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => 'PKAcmMdyupzVBW?^~-'.includes(c)).map((c) => [c, n(c)])));
console.log('checkpoints em:', all('K').map(([x]) => x).sort((a, b) => a - b).join(', '), '| ônibus em:', buses.join(', '));
console.log('paredes de barreiras em colunas:', wallCols.join(','));
console.log(notes.join('\n'));
if (warns.length) console.log(warns.join('\n'));
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel5 OK');
