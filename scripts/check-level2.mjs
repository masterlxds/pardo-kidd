// Valida o mapa da Fase 2. Uso: node scripts/check-level2.mjs
import { LEVEL2_ROWS as rows, LEVEL2_LEGEND as legend, LEVEL2_MOVERS as movers } from '../src/game/level2.ts';

const errors = [], warns = [];
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
const n = (c) => (count[c] ?? []).length;
const min = (c, k, label) => { if (n(c) < k) err(`${label}: ${n(c)} < ${k}`); };
if (H !== 14) err(`altura ${H} != 14`);
if (n('P') !== 1) err(`spawn: ${n('P')} != 1`);
if (n('A') !== 1) err(`alien: ${n('A')} != 1`);
min('K', 2, 'checkpoints'); min('o', 3, 'onças'); min('j', 3, 'jacarés'); min('n', 5, 'cobras');
min('u', 4, 'tucanos'); min('V', 3, 'cipós-d\'água'); min('m', 3, 'troncos H'); min('M', 1, 'plataformas V');
min('d', 4, 'vitórias-régias'); min('c', 45, 'moedas'); min('q', 1, 'canoa'); min('O', 1, 'oca');
min('B', 1, 'blocos rachados'); min('?', 1, 'blocos ?'); min('W', 1, 'blocos W');
for (const c of 'sOhfFt') min(c, 1, `decoração '${c}'`);
for (const [x, y] of [...(count.m ?? []), ...(count.M ?? [])]) {
  const mv = movers[`${x},${y}`];
  if (!mv || !(mv.range > 0) || !(mv.speed > 0)) err(`mover ${x},${y} sem parâmetros válidos`);
}
for (const k of Object.keys(movers)) { const [x, y] = k.split(',').map(Number); if (!'mM'.includes(at(x, y))) err(`mover ${k} sem marcador m/M`); }

const solid = (c) => '=#RB?W'.includes(c);
const surface = (x, y) => solid(at(x, y)) || at(x, y) === '-';
// ancoragem: apoio sólido abaixo
for (const c of 'PKonjVAsOhfFt') for (const [x, y] of count[c] ?? []) {
  if (!surface(x, y + 1)) err(`'${c}' em ${x},${y} sem apoio abaixo`);
  if (solid(at(x, y))) err(`'${c}' dentro de tile em ${x},${y}`);
}
// decorações largas: sem tiles sólidos no caminho e apoio em toda a largura
const wide = { O: 5, F: 2 };
for (const [c, w] of Object.entries(wide)) for (const [x, y] of count[c] ?? []) for (let i = 0; i < w; i++) {
  if (solid(at(x + i, y))) err(`'${c}' em ${x},${y} atravessa tile em ${x + i}`);
  if (!solid(at(x + i, y + 1))) err(`'${c}' em ${x},${y} sem chão em ${x + i}`);
}
for (const [x, y] of count.q ?? []) for (let i = 0; i < 3; i++) {
  if (solid(at(x + i, y))) err(`canoa ${x},${y} atravessa tile em ${x + i}`);
  if (at(x + i, y + 1) !== '~') err(`canoa ${x},${y} sem água em ${x + i}`);
}
// jacarés: chão sólido (não água), onças: superfície >= 5 de largura
for (const [x, y] of count.j ?? []) for (const dx of [-1, 0, 1]) if (!solid(at(x + dx, y + 1))) err(`jacaré ${x},${y}: sem chão sólido em ${x + dx}`);
for (const [x, y] of count.o ?? []) {
  let a = x, b = x;
  while (surface(a - 1, y + 1)) a--;
  while (surface(b + 1, y + 1)) b++;
  if (b - a + 1 < 5) err(`onça ${x},${y}: superfície de ${b - a + 1} tiles < 5`);
}
// moedas e marcadores soltos não podem estar dentro de tiles (garantido pela grade) e pads/troncos: caminho livre
for (const [x, y] of count.m ?? []) { const R = movers[`${x},${y}`]?.range ?? 0; for (let i = 0; i <= R + 1; i++) if (at(x + i, y) !== '.' && !(i === 0) && at(x + i, y) !== 'c') err(`tronco ${x},${y}: caminho bloqueado por '${at(x + i, y)}' em ${x + i}`); }
for (const [x, y] of count.M ?? []) { const R = movers[`${x},${y}`]?.range ?? 0; for (let j = 0; j <= R; j++) for (const dx of [0, 1]) if (!(j === 0 && dx === 0) && at(x + dx, y + j) !== '.' && at(x + dx, y + j) !== 'c') err(`plataforma V ${x},${y}: bloqueada em ${x + dx},${y + j}`); }
for (const [x, y] of count.d ?? []) if (solid(at(x + 1, y))) err(`vitória-régia ${x},${y} sobre tile`);
// inimigos >= 5 tiles do spawn/checkpoints
const safe = [...count.P, ...(count.K ?? [])];
for (const c of 'onju' + 'n') for (const [x, y] of count[c] ?? []) for (const [sx] of safe)
  if (Math.abs(x - sx) < 5) err(`inimigo '${c}' em ${x},${y} perto do spawn/checkpoint ${sx}`);
// água não é superfície; marcador 'd','m','M' idem ao L1
const topOf = Array(W).fill(-1);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ('=#R'.includes(at(x, y))) { topOf[x] = y; break; }
const nodes = new Set();
const add = (x, y) => nodes.add(`${x},${y}`);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const c = at(x, y);
  if ((c === '=' || c === 'R' || c === '#' || c === '-') && !solid(at(x, y - 1)) && at(x, y - 1) !== '-') add(x, y);
}
for (const [x, y] of count.d ?? []) { add(x, y); add(x + 1, y); }
for (const [x, y] of count.m ?? []) { const R = movers[`${x},${y}`].range; for (let i = 0; i <= R + 1; i++) add(x + i, y); }
for (const [x, y] of count.M ?? []) { const R = movers[`${x},${y}`].range; for (let j = 0; j <= R; j++) { add(x, y + j); add(x + 1, y + j); } }
const list = [...nodes].map((s) => s.split(',').map(Number));
// obstrução: tiles sólidos (B conta como removido pelo soco) entre colunas, mais altos que subida ≤2
const blocked = (x1, y1, x2, y2) => {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2), top = Math.min(y1, y2) - 2;
  for (let x = lo + 1; x < hi; x++) for (let y = 0; y < top; y++) if ('=#R'.includes(at(x, y))) return true;
  return false;
};
const key = (x, y) => `${x},${y}`;
const spawn = count.P[0], goal0 = count.A?.[0];
const start = [spawn[0], spawn[1] + 1];
const seen = new Set([key(...start)]), q = [start];
while (q.length) {
  const [x, y] = q.shift();
  for (const [nx, ny] of list) {
    if (seen.has(key(nx, ny))) continue;
    const dx = Math.abs(nx - x), rise = y - ny;
    if (dx >= 1 && dx <= 4 && rise <= 2 && !blocked(x, y, nx, ny)) { seen.add(key(nx, ny)); q.push([nx, ny]); }
  }
}
if (goal0 && !seen.has(key(goal0[0], goal0[1] + 1))) err(`alien inalcançável (${goal0}) pelo modelo de saltos`);
// vãos > 3 precisam de plataforma
let run = 0, runStart = 0;
for (let x = 0; x <= W; x++) {
  const gap = x < W && topOf[x] < 0;
  if (gap) { if (!run) runStart = x; run++; }
  else if (run) {
    const note = `vão ${runStart}-${runStart + run - 1} (${run} tiles)`;
    if (run > 3) {
      const has = list.some(([nx, ny]) => nx >= runStart && nx < runStart + run && !solid(at(nx, ny)) && at(nx, ny) !== '-');
      if (!has) err(`${note} sem plataforma`); else warns.push(`${note}: ok, com plataformas`);
    } else warns.push(`${note}: pulo direto`);
    run = 0;
  }
}
// degraus de terreno ≤2
for (let x = 1; x < W; x++) if (topOf[x] >= 0 && topOf[x - 1] >= 0 && topOf[x - 1] - topOf[x] > 2) err(`degrau > 2 tiles em ${x}`);
// parede de blocos alta (>=4) que bloqueia
const wallCols = [...new Set((count.B ?? []).map(([x]) => x))].filter((x) => { let h = 0; for (let y = 0; y < H; y++) if ('B?W'.includes(at(x, y))) h++; return h >= 4; });
if (!wallCols.length) err('sem parede de blocos alta (>=4)');
// o alien: chão plano e espaço livre à esquerda
const A = goal0;
if (A) {
  if (at(A[0] - 1, A[1]) !== '.' || at(A[0] - 2, A[1]) !== '.' || at(A[0] - 3, A[1]) !== '.') err('sem 3 tiles livres à esquerda do alien');
  for (let x = A[0] - 4; x <= A[0] + 1 && x < W; x++) if (topOf[x] !== 11) err(`chão da aldeia não plano em ${x}`);
  const O = count.O?.[0];
  if (!O || O[0] + 5 > A[0]) err('oca deve estar à esquerda do alien');
  else for (let x = O[0] + 5; x < A[0]; x++) for (let y = 7; y <= 10; y++) if (at(x, y) !== '.') err(`espaço do alien ocupado em ${x},${y}`);
}
// chão e água base
for (let x = 0; x < W; x++) for (const y of [12, 13]) if (at(x, y) === '.' && at(x, 13) !== '^') err(`buraco vazio em ${x},${y}`);

console.log(`mapa ${W}x${H}`);
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => 'PKAcmMdonjuVnBW?^-~q'.includes(c)).map((c) => [c, n(c)])));
console.log('parede alta em colunas:', wallCols.join(','));
console.log(warns.join('\n'));
console.log(`nós alcançados: ${seen.size}/${list.length + 1}`);
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel2 OK');
