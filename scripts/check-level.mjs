// Valida o mapa da Fase 1. Uso: node scripts/check-level.mjs
import { LEVEL1_ROWS as rows, LEVEL1_LEGEND as legend, LEVEL1_MOVERS as movers } from '../src/game/level1.ts';

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
if (n('P') !== 1) err(`spawn: ${n('P')} != 1`);
if (n('G') !== 1) err(`caneca: ${n('G')} != 1`);
min('l', 6, 'calangos'); min('v', 4, 'carcarás'); min('p', 4, 'palmas'); min('t', 1, 'tatus');
min('C', 3, 'cactos d\'água'); min('m', 2, 'plataformas móveis H'); min('K', 2, 'checkpoints');
min('d', 3, 'desmoronáveis');
if (n('m') + n('M') < 3) err('menos de 3 plataformas móveis');
if (n('t') > 2) err('mais de 2 tatus');
if (n('c') < 40) err(`moedas ${n('c')} < 40`);
for (const [x, y] of [...(count.m ?? []), ...(count.M ?? [])]) if (!movers[`${x},${y}`]) err(`mover ${x},${y} sem parâmetros`);

const solid = (c) => '=#RB?W'.includes(c);
const surface = (x, y) => solid(at(x, y)) || at(x, y) === '-';
// ancoragem em chão
const onGround = 'PKlptCDfskbToHj'; // base na célula, precisa de apoio sólido abaixo
for (const c of 'PKlptC' + 'G') for (const [x, y] of count[c] ?? []) {
  const below = c === 'G' ? at(x, y + 1) === 'D' : (surface(x, y + 1) || (c === 'C' && false));
  if (!below) err(`'${c}' em ${x},${y} sem apoio abaixo`);
  if (c !== 'G' && c !== 'P' && c !== 'K' && solid(at(x, y))) err(`'${c}' dentro de tile`);
}
for (const [x, y] of count.D ?? []) if (!solid(at(x, y + 1))) err(`pedestal ${x},${y} sem chão`);
for (const [x, y] of count.H ?? []) if (!solid(at(x, y + 1))) err(`capela ${x},${y} sem chão`);
// inimigos longe de spawn/checkpoints (>=5 tiles)
const safe = [...count.P, ...(count.K ?? [])];
for (const c of 'lptv') for (const [x, y] of count[c] ?? []) for (const [sx] of safe)
  if (Math.abs(x - sx) < 5) err(`inimigo '${c}' em ${x},${y} perto do spawn/checkpoint ${sx}`);

// superfícies (topo de cada coluna) e gaps
const topOf = Array(W).fill(-1);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ('=#R'.includes(at(x, y))) { topOf[x] = y; break; }
const mug = count.G[0], spawn = count.P[0];
// nós de pouso: [col,row] onde o Pardo pode ficar (row = linha da superfície)
const nodes = new Set();
const add = (x, y) => nodes.add(`${x},${y}`);
for (let x = 0; x < W; x++) if (topOf[x] >= 0) {
  // bloco/OW sólido: topo exposto
  for (let y = 0; y < H; y++) if ((solid(at(x, y)) || at(x, y) === '-') && !solid(at(x, y - 1)) && at(x, y - 1) !== '-' && !'BW?'.includes(at(x, y))) add(x, y);
}
for (const [x, y] of count.d ?? []) { add(x, y); add(x + 1, y); }
for (const [x, y] of count.m ?? []) { const R = movers[`${x},${y}`].range; for (let i = 0; i <= R + 1; i++) add(x + i, y); }
for (const [x, y] of count.M ?? []) { const R = movers[`${x},${y}`].range; for (let j = 0; j <= R; j++) { add(x, y + j); add(x + 1, y + j); } }
const list = [...nodes].map((s) => s.split(',').map(Number));
// alcançáveis: andar (|Δx|=1, subida ≤2) ou pular (Δx ≤4 => vão ≤3, subida ≤2)
const key = (x, y) => `${x},${y}`;
const start = [spawn[0], spawn[1] + 1];
const seen = new Set([key(...start)]), q = [start];
while (q.length) {
  const [x, y] = q.shift();
  for (const [nx, ny] of list) {
    if (seen.has(key(nx, ny))) continue;
    const dx = Math.abs(nx - x), rise = y - ny;
    if (dx >= 1 && dx <= 4 && rise <= 2) { seen.add(key(nx, ny)); q.push([nx, ny]); }
    else if (dx === 0 && rise <= 0 && -rise <= 6 && false) {}
  }
}
const goal = [mug[0], mug[1] + 2]; // topo do chão sob o pedestal
if (!seen.has(key(...goal))) err(`meta inalcançável (${goal}) pelo modelo de saltos`);
// coletar nós de ravina larga
let run = 0, runStart = 0;
for (let x = 0; x <= W; x++) {
  const gap = x < W && topOf[x] < 0;
  if (gap) { if (!run) runStart = x; run++; }
  else if (run) {
    if (run > 3) {
      const has = list.some(([nx]) => nx >= runStart && nx < runStart + run && !(topOf[nx] >= 0));
      const note = `ravina ${runStart}-${runStart + run - 1} (${run} tiles)`;
      if (!has) err(`${note} sem plataforma`); else warns.push(`${note}: ok, com plataformas`);
    } else warns.push(`ravina ${runStart}-${runStart + run - 1} (${run} tiles): pulo direto`);
    run = 0;
  }
}
// degraus de terreno: altura entre colunas adjacentes ≤2 (subida)
for (let x = 1; x < W; x++) if (topOf[x] >= 0 && topOf[x - 1] >= 0 && topOf[x - 1] - topOf[x] > 2) err(`degrau > 2 tiles em ${x}`);
// parede de blocos: coluna só de blocos altura ≥4
const wallCols = [...new Set((count.B ?? []).map(([x]) => x))].filter((x) => { let h = 0; for (let y = 0; y < H; y++) if (at(x, y) === 'B' || at(x, y) === '?' || at(x, y) === 'W') h++; return h >= 4; });
if (!wallCols.length) err('sem parede de blocos alta (>=4)');
// chão sob a caneca/placa plano
for (let x = mug[0] - 3; x <= mug[0] + 2; x++) if (topOf[x] !== 11) err(`chão final não plano em ${x}`);

console.log(`mapa ${W}x${H}`);
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => 'PKGcCmMdlvptBW?^-'.includes(c)).map((c) => [c, n(c)])));
console.log('parede alta em colunas:', wallCols.join(','));
console.log(warns.join('\n'));
console.log(`nós alcançados: ${seen.size}/${list.length + 1}`);
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel OK');
