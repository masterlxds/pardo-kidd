// Valida o mapa da Fase 5 (Transportadora de São Paulo). Uso: node scripts/check-level5.mjs [--print] [--verbose]
//
// Checagens estáticas (legenda, contagens mínimas, apoio de marcadores, convenção do caminhão-baú,
// movers, distâncias e regras de cada inimigo, ritmo de checkpoints/hidratação, zona pacífica da copa)
// e SIMULAÇÃO do Pardo (porta fiel de core/physics.ts + física de pulo de player.ts, molde do
// check-level4.mjs) com busca em largura sobre posições de apoio. Duas passadas:
//   1) envelope REDUZIDO (pulo 95%, corrida 90%): Maia, todos os checkpoints e bebedouros têm de ser
//      alcançáveis e não pode haver beco sem saída — prova que o caminho obrigatório tem folga;
//   2) envelope REAL: toda moeda tem de ser tocável e toda caixa ?/W socável.
// Não há água: os abismos são fossos de doca (colunas vazias nas linhas 11..13, ou com '^' no fundo).
// LEVEL5_FILE=<caminho> permite validar uma cópia modificada.
const { LEVEL5_ROWS: rows, LEVEL5_LEGEND: legend, LEVEL5_MOVERS: movers, LEVEL5_INDOOR_FROM_COL: indoor } =
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

// Atos (colunas iniciais). Mantenha em sincronia com o ROTEIRO de level5.ts.
const ACT2 = 59, ACT3 = 126, ACT4 = 206;
const actOf = (x) => (x < ACT2 ? 1 : x < ACT3 ? 2 : x < ACT4 ? 3 : 4);

// ── 1. Formato e contagens ───────────────────────────────────────────────────
if (H !== 14) err(`altura ${H} != 14`);
if (W < 230 || W > 250) err(`largura ${W} fora de 230..250`);
if (n('P') !== 1) err(`spawn: ${n('P')} != 1`);
if (n('A') !== 1) err(`Maia: ${n('A')} != 1`);
min('K', 5, 'checkpoints');
min('c', 60, 'moedas');
min('V', 4, 'bebedouros');
min('r', 10, 'ratos');
min('g', 6, 'carregadores');
if (n('e') !== 2) err(`empilhadeiras: ${n('e')} != 2`);
min('a', 4, 'arremessadores');
if (n('m') + n('M') < 4) err(`movers: ${n('m') + n('M')} < 4`);
min('d', 3, 'pilhas bambas');
min('B', 10, 'caixas B');
min('?', 4, 'caixas ?');
min('W', 3, 'caixas W');
for (const c of 'twnsfhoGqC') min(c, 1, `decoração '${c}'`);
if (n('G') !== 1) err(`guarita: ${n('G')} != 1`);
if (indoor !== ACT3) err(`LEVEL5_INDOOR_FROM_COL = ${indoor}, esperado ${ACT3} (início do Ato 3)`);

for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`];
  if (!mv || !(mv.range > 0) || !(mv.speed > 0)) err(`mover ${x},${y} sem parâmetros válidos`);
}
for (const k of Object.keys(movers)) {
  const [x, y] = k.split(',').map(Number);
  if (!'mM'.includes(at(x, y))) err(`mover ${k} sem marcador m/M`);
}

const solid = (c) => '=#RB?W'.includes(c);
const earth = (c) => '=#R'.includes(c);
const surface = (x, y) => solid(at(x, y)) || at(x, y) === '-';
// chão-base na linha 11: só concreto/lataria/vão
for (let x = 0; x < W; x++) if (!'=#R.'.includes(at(x, 11))) err(`linha 11 em ${x}: '${at(x, 11)}' não é chão/vão`);
// '=' é topo exposto, '#' é fundação coberta
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const c = at(x, y), up = y > 0 ? at(x, y - 1) : '.';
  if (c === '=' && (up === '=' || up === '#')) err(`'=' coberto por concreto em ${x},${y}`);
  if (c === '#' && !(up === '=' || up === '#')) err(`'#' exposto (deveria ser '=') em ${x},${y}`);
}
// fossos de doca: linhas 12/13 vazias só em fosso aberto até a base (ou com pregos no fundo)
for (let x = 0; x < W; x++) {
  const col = [11, 12, 13].map((y) => at(x, y)).join('');
  if (col.includes('.') && col !== '...' && col !== '..^') err(`fosso malformado na coluna ${x} (linhas 11..13 = '${col}')`);
}
for (let x = 0; x < W; x++) for (let y = 0; y < 11; y++) if (at(x, y) === '^' ) err(`pregos fora de fosso em ${x},${y}`);

// ── 2. Caminhões-baú e parede final ──────────────────────────────────────────
for (let y = 0; y <= 10; y++) if (at(W - 1, y) !== 'R') err(`parede final: coluna ${W - 1} linha ${y} não é 'R'`);
const seenR = new Set(), trucks = [];
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
  if (t !== 7 || b !== 9 || comp.length !== w * 3) { err(`baú em ${l},${t}: não é retângulo nas linhas 7..9`); continue; }
  if (w < 5 || w > 7) err(`baú em ${l}: largura ${w} fora de 5..7`);
  for (let x = l; x <= r; x++) {
    const want = (x - l) % 3 === 0 ? 'w' : '.';
    if (at(x, 10) !== want) err(`baú em ${l}: linha 10 na coluna ${x} = '${at(x, 10)}', esperado '${want}'`);
  }
  if (at(r + 1, 10) !== 't') err(`baú em ${l}: sem cabine 't' em ${r + 1},10`);
  for (let x = l; x <= r + 3; x++) if (!solid(at(x, 11))) err(`caminhão em ${l}: sem chão sob rodas/cabine na coluna ${x}`);
  trucks.push(l);
}
for (const [x, y] of all('t')) if (y !== 10 || !trucks.some((l) => at(x - 1, 9) === 'R' && x - 1 >= l)) err(`cabine 't' em ${x},${y} fora de um caminhão`);
for (const [x, y] of all('w')) if (y !== 10 || at(x, 9) !== 'R') err(`rodas 'w' em ${x},${y} fora de um caminhão`);
if (trucks.length < 4) err(`caminhões-baú: ${trucks.length} < 4`);

// ── 3. Apoio e espaço dos marcadores ─────────────────────────────────────────
for (const c of 'PKcrgeaVAnsfhoGqCd') for (const [x, y] of all(c)) if (solid(at(x, y))) err(`'${c}' em ${x},${y} dentro de tile sólido`);
for (const c of 'PKrgeaVAnsfhoGqC') for (const [x, y] of all(c)) if (!surface(x, y + 1)) err(`'${c}' em ${x},${y} sem apoio abaixo`);
// inimigos de chão e bebedouro só sobre piso sólido
for (const c of 'rgeV') for (const [x, y] of all(c)) if (!solid(at(x, y + 1))) err(`'${c}' em ${x},${y} sem piso sólido abaixo`);
// 2 tiles livres de altura (bebedouro 16x32, Pardo, Maia, carregador/empilhadeira/arremessador)
for (const c of 'VPKAgea') for (const [x, y] of all(c)) if (solid(at(x, y - 1))) err(`'${c}' em ${x},${y} sem 2 tiles livres de altura`);
if (all('A')[0] && solid(at(all('A')[0][0], all('A')[0][1] - 2))) err('Maia (36px) sem 3 tiles livres de altura');
// decorações largas: sem tiles sólidos no caminho e piso sólido em toda a largura
const wide = { G: 3, C: 2, t: 3 };
for (const [c, w] of Object.entries(wide)) for (const [x, y] of all(c)) for (let i = 0; i < w; i++) {
  if (solid(at(x + i, y))) err(`'${c}' em ${x},${y} atravessa tile em ${x + i}`);
  if (!solid(at(x + i, y + 1))) err(`'${c}' em ${x},${y} sem chão sólido em ${x + i}`);
}

// ── 4. Movers e pilhas bambas ────────────────────────────────────────────────
const free = (c) => c === '.' || c === 'c';
for (const [x, y] of all('m')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let i = 0; i <= mv.range + 1; i++) {
    if (i > 0 && !free(at(x + i, y))) err(`paleteira ${x},${y}: caminho bloqueado por '${at(x + i, y)}' em ${x + i}`);
    if (solid(at(x + i, y + 1))) err(`paleteira ${x},${y}: sobre chão sólido em ${x + i}`);
    if (solid(at(x + i, y - 1)) || solid(at(x + i, y - 2))) err(`paleteira ${x},${y}: teto baixo em ${x + i}`);
  }
}
for (const [x, y] of all('M')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let j = -2; j <= mv.range; j++) for (const dx of [0, 1]) {
    if (!(j === 0 && dx === 0) && !free(at(x + dx, y + j))) err(`elevatória ${x},${y}: bloqueada em ${x + dx},${y + j}`);
  }
  if (y + mv.range > 10) err(`elevatória ${x},${y}: desce abaixo da linha 10`);
}
for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  const period = (2 * mv.range * 16) / mv.speed, peak = (Math.PI / 2) * mv.speed;
  notes.push(`mover ${x},${y} (${at(x, y)}): percurso ${mv.range} tiles, período ${period.toFixed(1)}s, pico ${peak.toFixed(0)}px/s`);
  if (period > 6.5) err(`mover ${x},${y}: período ${period.toFixed(1)}s > 6.5s (espera longa demais)`);
  if (peak > 90) err(`mover ${x},${y}: pico de ${peak.toFixed(0)}px/s > 90 (o Pardo corre a 110)`);
}
for (const [x, y] of all('d')) for (const dx of [0, 1]) {
  if (dx && !free(at(x + dx, y))) err(`pilha bamba ${x},${y}: célula ${x + dx} ocupada por '${at(x + dx, y)}'`);
  if (solid(at(x + dx, y + 1))) err(`pilha bamba ${x},${y}: sobre chão sólido em ${x + dx}`);
  if (solid(at(x + dx, y - 1)) || solid(at(x + dx, y - 2))) err(`pilha bamba ${x},${y}: teto baixo em ${x + dx}`);
}

// ── 5. Inimigos: distâncias, corredores, atos ────────────────────────────────
const P = all('P')[0], A = all('A')[0];
const safe = [...all('P'), ...all('K')];
const enemies = [...all('r'), ...all('g'), ...all('e'), ...all('a')];
for (const [x, y] of enemies) {
  for (const [sx] of safe) if (Math.abs(x - sx) < 5) err(`inimigo '${at(x, y)}' em ${x},${y} a menos de 5 tiles do spawn/checkpoint ${sx}`);
  if (x >= ACT4) err(`inimigo '${at(x, y)}' em ${x},${y} na copa (zona pacífica, coluna >= ${ACT4})`);
}
/** Corredor plano (2 tiles de vão livre, piso contínuo) que contém x na linha y. */
const corridor = (x, y) => {
  const ok = (i) => surface(i, y + 1) && !solid(at(i, y)) && !solid(at(i, y - 1));
  let a = x, b = x;
  while (a > 0 && ok(a - 1)) a--;
  while (b < W - 1 && ok(b + 1)) b++;
  return [a, b];
};
for (const [x, y] of all('g')) { const [a, b] = corridor(x, y); if (b - a + 1 < 9) err(`carregador ${x},${y}: corredor ${a}..${b} (${b - a + 1}) < 9 tiles`); }
for (const [x, y] of all('e')) {
  const [a, b] = corridor(x, y);
  if (b - a + 1 < 8) err(`empilhadeira ${x},${y}: corredor ${a}..${b} (${b - a + 1}) < 8 tiles`);
  if (actOf(x) !== 3) err(`empilhadeira ${x},${y} fora do Ato 3`);
  let shelf = 0;
  for (let i = a; i <= b; i++) for (let yy = y - 3; yy <= y - 1; yy++) if (at(i, yy) === '-') shelf++;
  if (shelf < 3) err(`empilhadeira ${x},${y}: sem prateleira de fuga acima do corredor`);
  notes.push(`empilhadeira ${x},${y}: corredor ${a}..${b}, ${shelf} célula(s) de prateleira de fuga`);
}
for (const [x, y] of all('r')) { const [a, b] = corridor(x, y); if (b - a + 1 < 3) err(`rato ${x},${y}: corredor curto (${b - a + 1})`); }
for (const [x, y] of all('a')) {
  if (y + 1 > 9) err(`arremessador ${x},${y}: superfície na linha ${y + 1}, menos de 2 tiles acima do chão-base`);
  if (!surface(x, y + 1)) err(`arremessador ${x},${y}: sem superfície sólida/one-way abaixo`);
  for (const [ex] of all('e')) if (Math.abs(x - ex) < 12) err(`arremessador ${x},${y} a ${Math.abs(x - ex)} tiles da empilhadeira em ${ex} (< 12)`);
}
{
  const as = all('a').slice().sort((p, q) => p[0] - q[0]);
  if (as[0] && (actOf(as[0][0]) !== 2 || at(as[0][0], as[0][1] + 1) !== 'R')) err(`1º arremessador (${as[0]}) deve estrear no Ato 2 em cima de um baú`);
}
// ratos: isolados no Ato 1, bandos de 2–3 (espaçados ≤ 3 tiles, mesma linha) no Ato 3
{
  const rs = all('r').slice().sort((p, q) => p[0] - q[0]);
  const near = (p, q) => p[1] === q[1] && Math.abs(p[0] - q[0]) <= 3;
  for (const p of rs) if (actOf(p[0]) === 1 && rs.some((q) => q !== p && Math.abs(q[0] - p[0]) <= 6)) err(`rato ${p} no Ato 1 não está isolado`);
  const r3 = rs.filter(([x]) => actOf(x) === 3);
  const bands = [];
  for (const p of r3) { const last = bands.at(-1); if (last && near(last.at(-1), p)) last.push(p); else bands.push([p]); }
  for (const b of bands) if (b.length < 2 || b.length > 3) err(`bando de ratos no Ato 3 com ${b.length} rato(s) em ${b.map((p) => p[0]).join(',')}`);
  notes.push(`ratos: Ato 1 ${rs.filter(([x]) => actOf(x) === 1).map(([x]) => x).join(',')} | bandos do Ato 3: ${bands.map((b) => b.map(([x]) => x).join('+')).join(' ')}`);
}

// ── 6. Ritmo, atos e copa ────────────────────────────────────────────────────
const stops = [P[0], ...all('K').map(([x]) => x).sort((a, b) => a - b), A ? A[0] : W - 1];
for (let i = 1; i < stops.length; i++) {
  const d = stops[i] - stops[i - 1];
  if (d > 45) err(`trecho sem checkpoint de ${d} colunas (${stops[i - 1]}→${stops[i]}) > 45`);
  if (d < 15) err(`checkpoints muito próximos (${stops[i - 1]}→${stops[i]})`);
}
const water = [...all('V'), ...all('W')].map(([x]) => x).sort((a, b) => a - b);
{ let prev = P[0]; for (const x of [...water, A ? A[0] : W - 1]) { if (x - prev > 45) err(`${x - prev} colunas sem fonte de hidratação (V/W) entre ${prev} e ${x}`); prev = x; } }
if (!all('V').some(([x]) => actOf(x) === 1)) err('sem bebedouro no Ato 1');
if (!all('K').some(([x]) => actOf(x) === 1)) err('sem checkpoint no Ato 1');
if (all('K').filter(([x]) => actOf(x) === 2).length < 1) err('sem checkpoint no Ato 2');
if (all('K').filter(([x]) => actOf(x) === 3).length < 1) err('sem checkpoint no Ato 3');
if (all('g').some(([x]) => actOf(x) === 1)) err('carregador no Ato 1 (estreia no Ato 2)');
// Ato 3: estantes em 3 níveis, parede alta de caixas, pregos no fosso
const shelfRows = new Set(all('-').filter(([x]) => actOf(x) === 3).map(([, y]) => y));
if (shelfRows.size < 3) err(`Ato 3: prateleiras em ${shelfRows.size} nível(is) < 3`);
const wallCols = [...new Set(all('B').map(([x]) => x))].filter((x) => {
  let best = 0, h = 0; for (let y = 0; y < H; y++) { if ('B?W'.includes(at(x, y))) best = Math.max(best, ++h); else h = 0; } return best >= 3;
});
if (!wallCols.some((x) => actOf(x) === 3)) err('Ato 3 sem parede de caixas de 3–4 de altura');
if (!all('^').some(([x]) => actOf(x) === 3)) err('Ato 3 sem fosso com pregos');
// Ato 1: chão plano até o 1º caminhão
// Copa: pacífica, com relógio de ponto, máquina de café e Maia perto do fim
if (A) {
  if (actOf(A[0]) !== 4 || A[0] < W - 10) err(`Maia em ${A[0]}: deve ficar na copa, perto do fim`);
  if (!all('q').some(([x]) => actOf(x) === 4)) err('copa sem relógio de ponto');
  if (!all('C').some(([x]) => actOf(x) === 4)) err('copa sem máquina de café');
  for (let i = 1; i <= 3; i++) if (at(A[0] - i, A[1]) !== '.') err(`sem 3 tiles livres à esquerda do Maia (${A[0] - i})`);
  for (let x = ACT4; x < W; x++) if (at(x, 11) !== '=') err(`chão da copa não plano em ${x}`);
}
// trechos mortos e relevo (fora da copa)
const topOf = Array(W).fill(-1);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (earth(at(x, y))) { topOf[x] = y; break; }
const moverCols = new Set();
for (const [x, y] of all('m')) for (let i = 0; i <= (movers[`${x},${y}`]?.range ?? 0) + 1; i++) moverCols.add(x + i);
for (const [x] of all('M')) { moverCols.add(x); moverCols.add(x + 1); }
for (const [x] of all('d')) { moverCols.add(x); moverCols.add(x + 1); }
const interesting = (x) => {
  if (moverCols.has(x)) return true;
  if (x > 0 && topOf[x] !== topOf[x - 1]) return true;
  for (let y = 0; y < H; y++) if ('crgeaVKBW?-APR'.includes(at(x, y))) return true;
  return false;
};
{ let run = 0, start = 0; for (let x = 0; x <= ACT4; x++) {
  if (x < ACT4 && !interesting(x)) { if (!run) start = x; run++; }
  else { if (run > 8) err(`trecho morto ${start}-${start + run - 1} (${run} colunas sem inimigo, moeda, relevo ou objeto)`); run = 0; }
} }
const standRows = (x) => {
  const s = new Set();
  for (let y = 1; y < H; y++) if (surface(x, y) && !solid(at(x, y - 1))) s.add(y);
  return s;
};
for (let x0 = 0; x0 + 20 <= ACT4; x0++) {
  const s = new Set(); let moving = false;
  for (let x = x0; x < x0 + 20; x++) { for (const r of standRows(x)) s.add(r); if (moverCols.has(x)) moving = true; }
  if (s.size + (moving ? 1 : 0) < 3) { err(`tela ${x0}-${x0 + 19} quase plana: só ${s.size} nível(is) pisável(is)`); x0 += 19; }
}

// ── 7. Simulação do Pardo ────────────────────────────────────────────────────
const T = 16, PW = 10, PH = 20, DT = 1 / 60, EPS = 0.001;
const GRAV = 900, MAX_FALL = 360, JUMP_CUT = 0.55, AIR_ACCEL = 620, AIR_DRAG = 160;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);

// plataformas de entidade (topo one-way): pilhas bambas paradas; movers = todo o percurso
const plats = [];
for (const [x, y] of all('d')) plats.push({ x: x * T, y: y * T, w: 32, g: -1 });
for (const [x, y] of all('m')) plats.push({ x: x * T, y: y * T, w: (movers[`${x},${y}`]?.range ?? 0) * T + 32, g: -1 });
let group = 0;
for (const [x, y] of all('M')) { const R = movers[`${x},${y}`]?.range ?? 0; for (let k = 0; k <= R * 2; k++) plats.push({ x: x * T, y: y * T + k * 8, w: 32, g: group }); group++; }

function simulate(env, removed) {
  const sol = new Uint8Array(W * H), one = new Uint8Array(W * H), haz = new Uint8Array(W * H), coin = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y), i = y * W + x;
    if (solid(c) && !removed.has(i)) sol[i] = 1;
    if (c === '-') one[i] = 1;
    if (c === '^') haz[i] = 1;
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

/** Blocos socáveis a partir das posições alcançadas. reach: 2 = soco em pé/pulinho; 3 = também soco no pulo. */
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
  // 7a. caminho obrigatório com folga
  const safeEnv = explore({ jump: 285, run: 99 }, 'envelope reduzido (pulo 95%, corrida 90%)');
  if (A && !safeEnv.standsAt(A[0], A[1]) && !safeEnv.standsAt(A[0] - 1, A[1])) err(`Maia inalcançável (${A}) com o envelope reduzido`);
  for (const [x, y] of all('K')) if (!safeEnv.standsAt(x, y)) err(`checkpoint ${x},${y} inalcançável com o envelope reduzido`);
  for (const [x, y] of all('V')) if (!safeEnv.standsAt(x - 1, y) && !safeEnv.standsAt(x + 1, y) && !safeEnv.standsAt(x, y)) err(`bebedouro ${x},${y} inalcançável com o envelope reduzido`);
  if (safeEnv.stuck.length) err(`becos sem saída (posições de onde o Maia não é mais alcançável): ${[...new Set(safeEnv.stuck.map(([x, y]) => `${x},${y}`))].slice(0, 30).join(' ')}`);
  for (const x of wallCols) {
    let y = H - 1;
    while (y > 0 && !'B?W'.includes(at(x, y))) y--;
    if (!safeEnv.removed.has(y * W + x)) err(`parede de caixas na coluna ${x}: base não socável a partir de um ponto alcançável`);
  }
  // 7b. tudo coletável com o envelope real
  const full = explore({ jump: 300, run: 110 }, 'envelope real');
  const lost = all('c').filter(([x, y]) => !full.coins.has(y * W + x));
  if (lost.length) err(`${lost.length} moeda(s) não coletável(is): ${lost.slice(0, 12).map((p) => p.join(',')).join(' ')}${lost.length > 12 ? ' …' : ''}`);
  for (const c of '?W') for (const [x, y] of all(c)) if (!full.hittable.has(y * W + x)) err(`caixa '${c}' em ${x},${y} não socável`);
  for (const [x, y] of all('a')) if (!full.standsAt(x, y) && !full.standsAt(x - 1, y) && !full.standsAt(x + 1, y)) err(`arremessador ${x},${y}: o Pardo não alcança o poleiro (não dá para socá-lo)`);
  const optional = [...full.cells].filter((k) => !safeEnv.cells.has(k)).map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0]);
  const cols = [...new Set(optional.map(([x]) => x))];
  notes.push(`colunas com apoio só no envelope real (opcional/difícil): ${cols.length ? cols.join(',') : 'nenhuma'}`);
  if (VERBOSE) {
    const never = [];
    for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) if (surface(x, y) && !solid(at(x, y - 1)) && at(x, y - 1) !== '-' && !full.standsAt(x, y - 1)) never.push(`${x},${y}`);
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
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => 'PKAcmMdrgeaVBW?^-'.includes(c)).map((c) => [c, n(c)])));
console.log('checkpoints em:', all('K').map(([x]) => x).sort((a, b) => a - b).join(', '), '| caminhões-baú em:', trucks.join(', '));
console.log('parede de caixas em colunas:', wallCols.join(','));
console.log(notes.join('\n'));
if (warns.length) console.log(warns.join('\n'));
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel5 OK');
