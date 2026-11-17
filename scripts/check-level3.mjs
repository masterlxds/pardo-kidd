// Valida o mapa da Fase 3 (subaquática). Uso: node scripts/check-level3.mjs [--print]
import { LEVEL3_ROWS as rows, LEVEL3_LEGEND as legend } from '../src/game/level3.ts';

const errors = [], warns = [];
const err = (m) => errors.push(m);
const H = rows.length, W = rows[0].length;
const SKY = 2;                           // linhas 0..SKY ficam acima da linha d'água (inalcançáveis)
const WATER_TOP = SKY + 1;               // teto do nado (SWIM_CEILING = topo da linha 3)
const at = (x, y) => (rows[y]?.[x]) ?? (y < 0 ? '.' : '#');
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
if (H !== 18) err(`altura ${H} != 18`);
if (W < 230 || W > 250) err(`largura ${W} fora de ~240`);
if (n('P') !== 1) err(`spawn: ${n('P')} != 1`);
if (n('S') !== 1) err(`altar: ${n('S')} != 1`);
if (n('J') !== 1) err(`Jandira: ${n('J')} != 1`);
if (n('f') !== 3) err(`fitinhas: ${n('f')} != 3`);
min('a', 6, 'águas-vivas'); min('g', 6, 'peixes-agulha'); min('b', 3, 'baiacus'); min('D', 4, 'dentões');
min('s', 4, 'siris'); min('T', 3, 'tartarugas'); min('e', 3, 'moreias'); min('v', 6, 'fissuras');
min('p', 3, 'cardumes'); min('K', 2, 'checkpoints'); min('c', 50, 'moedas');

const SOL = '=#R';                       // sólidos de terreno
const HARD = '=#RBW?';                   // sólidos para ancoragem (inclui blocos)
const solid = (c) => SOL.includes(c);
const hard = (c) => HARD.includes(c);
const blocked = (x, y) => y < WATER_TOP || hard(at(x, y)) || at(x, y) === '^';   // acima d'água conta como bloqueado
const surface = (x, y) => hard(at(x, y)) || at(x, y) === '-';
const ENEMY = 'agbDsTe';
const SECTIONS = [[0, 55, 'Barra'], [56, 120, 'Recife'], [121, 195, 'Ruínas'], [196, W - 1, 'Santuário']];
const sectionOf = (x) => SECTIONS.findIndex(([a, b]) => x >= a && x <= b);

// linhas acima d'água: só céu ou rocha que continua uma formação que sobe da linha d'água
for (let y = 0; y <= SKY; y++) for (let x = 0; x < W; x++) {
  const c = at(x, y);
  if (c !== '.' && c !== 'R') err(`'${c}' em ${x},${y}: linhas 0-${SKY} só aceitam '.'/'R'`);
  else if (c === 'R' && at(x, y + 1) !== 'R') err(`rocha solta acima d'água em ${x},${y} (precisa continuar da linha de baixo)`);
}
// marcadores sempre dentro d'água e em célula livre
for (const c of 'PKcagbDsTevfpSJ1234567890') for (const [x, y] of count[c] ?? []) if (y < WATER_TOP + 1) err(`'${c}' em ${x},${y}: alto demais (o Pardo só ocupa linhas >= ${WATER_TOP})`);

// ancoragens
for (const c of 'PKsv') for (const [x, y] of count[c] ?? []) if (!surface(x, y + 1)) err(`'${c}' em ${x},${y} sem apoio abaixo`);
for (const [x, y] of count.v ?? []) for (let i = 1; i <= 4; i++) if (blocked(x, y - i)) err(`fissura ${x},${y}: coluna acima não livre em ${y - i}`);
for (const [x, y] of count.s ?? []) {
  let a = x, b = x;
  while (a > 0 && surface(a - 1, y + 1) && !blocked(a - 1, y)) a--;
  while (b < W - 1 && surface(b + 1, y + 1) && !blocked(b + 1, y)) b++;
  if (b - a + 1 < 4) err(`siri ${x},${y}: superfície livre de ${b - a + 1} < 4`);
}
for (const [x, y] of count.a ?? []) for (const d of [-2, -1, 1, 2]) if (blocked(x, y + d)) err(`água-viva ${x},${y}: célula ${y + d} bloqueada`);
for (const [x, y] of count.g ?? []) for (let i = 1; i <= 12; i++) if (blocked(x - i, y)) { err(`agulha ${x},${y}: corredor à esquerda bloqueado em ${x - i}`); break; }
for (const [x, y] of count.b ?? []) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && blocked(x + dx, y + dy)) err(`baiacu ${x},${y}: vizinhança bloqueada`);
for (const [x, y] of count.T ?? []) for (let dx = -4; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) if (blocked(x + dx, y + dy)) err(`tartaruga ${x},${y}: área 8x5 bloqueada em ${x + dx},${y + dy}`);
for (const [x, y] of count.e ?? []) {
  const L = hard(at(x - 1, y)), R = hard(at(x + 1, y));
  if (L === R) err(`moreia ${x},${y}: precisa de exatamente um lado sólido`);
  else { const d = L ? 1 : -1; for (const k of [1, 2]) if (blocked(x + d * k, y)) err(`moreia ${x},${y}: lado livre bloqueado`); }
}
// dentão: patrulha de ±3 precisa de pelo menos 2 tiles livres de cada lado na linha
for (const [x, y] of count.D ?? []) for (let dx = -2; dx <= 2; dx++) if (dx && blocked(x + dx, y)) err(`dentão ${x},${y}: patrulha bloqueada em ${x + dx}`);
// trecho 1 seguro (sem blindados/moreias) e Santuário sem inimigos
for (const c of 'DsTe') for (const [x, y] of count[c] ?? []) if (sectionOf(x) === 0) err(`'${c}' em ${x},${y}: Barra deve ser segura`);
for (const c of ENEMY) for (const [x, y] of count[c] ?? []) if (sectionOf(x) === 3) err(`inimigo '${c}' em ${x},${y} dentro do Santuário`);
// S e J
{
  const [sx, sy] = count.S[0], [jx, jy] = count.J[0];
  for (let d = -1; d <= 1; d++) if (!hard(at(sx + d, sy + 1))) err(`altar sem chão em ${sx + d}`);
  for (let d = -1; d <= 1; d++) if (!hard(at(jx + d, jy + 1))) err(`Jandira sem chão em ${jx + d}`);
  if (jx - sx < 3 || jx - sx > 4) err(`Jandira a ${jx - sx} tiles do altar (3-4)`);
  if (sy !== jy) err('altar e Jandira em linhas diferentes');
  for (let x = sx - 5; x <= sx; x++) for (let y = sy - 3; y <= sy; y++) if (blocked(x, y)) err(`espaço do altar ocupado em ${x},${y}`);
  // pouso da lambida: >= 3 tiles de chão plano no mesmo nível imediatamente à esquerda do S
  for (let x = sx - 3; x < sx; x++) if (!hard(at(x, sy + 1)) || blocked(x, sy) || blocked(x, sy - 1)) err(`pouso à esquerda do altar irregular em ${x}`);
  for (let x = sx + 1; x < jx; x++) if (blocked(x, sy)) err(`entre altar e Jandira bloqueado em ${x}`);
  if (sectionOf(sx) !== 3) err('altar fora do Santuário');
  // parede de rocha fechando o fim
  for (let y = 0; y <= 14; y++) if (at(W - 1, y) !== 'R') { err(`fim da fase sem parede em ${W - 1},${y}`); break; }
}
// decorações
const DW = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1, 6: 3, 7: 1, 8: 1, 9: 2, 0: 1 };
const DH = { 1: 1, 2: 2, 3: 2, 4: 1, 5: 3, 6: 3, 7: 1, 8: 2, 9: 1, 0: 1 };
const decos = [];
for (const c of '1234567890') for (const [x, y] of count[c] ?? []) {
  decos.push([x, y]);
  for (let i = 0; i < DW[c]; i++) if (!surface(x + i, y + 1)) err(`decoração '${c}' em ${x},${y} sem apoio em ${x + i}`);
  for (let i = 0; i < DW[c]; i++) for (let j = 0; j < DH[c]; j++) if (blocked(x + i, y - j)) err(`decoração '${c}' em ${x},${y} atravessa tile em ${x + i},${y - j}`);
}
SECTIONS.forEach(([a, b, name]) => {
  const d = decos.filter(([x]) => x >= a && x <= b).length;
  if (d < 8) err(`${name}: só ${d} decorações (< 8)`);
  const cs = (count.c ?? []).filter(([x]) => x >= a && x <= b).length;
  if (cs < 8) err(`${name}: só ${cs} moedas (< 8)`);
});
const decoHigh = decos.filter(([, y]) => y < 14).length;
if (decoHigh < decos.length / 3) err(`decoração concentrada no chão base: só ${decoHigh}/${decos.length} acima da linha 14`);
// relevo do fundo: altura do primeiro tile sólido abaixo da linha 11 por coluna
{
  const floor = [];
  for (let x = 0; x < W; x++) { let y = 11; while (y < H && !hard(at(x, y))) y++; floor.push(y); }
  let changes = 0, deep = 0, high = 0;
  for (let x = 1; x < W; x++) if (floor[x] !== floor[x - 1]) changes++;
  for (const f of floor) { if (f >= 16) deep++; if (f <= 13) high++; }
  if (changes < 30) err(`fundo plano demais: ${changes} mudanças de altura (< 30)`);
  if (deep < 10) err(`poucas depressões no fundo: ${deep} colunas (< 10)`);
  if (high < 20) err(`poucos bancos/afloramentos: ${high} colunas (< 20)`);
  warns.push(`relevo: ${changes} mudanças, ${deep} colunas fundas, ${high} colunas altas`);
}
// inimigos >= 5 tiles de spawn/checkpoints
const safe = [...count.P, ...(count.K ?? [])];
for (const c of ENEMY) for (const [x, y] of count[c] ?? []) for (const [sx] of safe)
  if (Math.abs(x - sx) < 5) err(`inimigo '${c}' em ${x},${y} perto do spawn/checkpoint ${sx}`);
// fissura logo após cada checkpoint
const vs = (count.v ?? []).map(([x]) => x).sort((a, b) => a - b);
for (const [kx] of count.K ?? []) { const nx = vs.find((x) => x > kx); if (nx === undefined || nx - kx > 12) err(`checkpoint ${kx}: sem fissura nos 12 tiles seguintes`); }
// espaçamento de fissuras
{
  const px = count.P[0][0], sx = count.S[0][0];
  const seq = [px, ...vs, sx];
  for (let i = 1; i < seq.length; i++) if (seq[i] - seq[i - 1] > 40) err(`fissuras: ${seq[i - 1]} -> ${seq[i]} = ${seq[i] - seq[i - 1]} > 40`);
}
// flood fill de nado: o Pardo ocupa a célula e a de cima, ambas dentro d'água
const pass = (x, y) => x >= 0 && x < W && y - 1 >= WATER_TOP && y < H && !solid(at(x, y)) && at(x, y) !== '^' && !solid(at(x, y - 1));
const key = (x, y) => y * W + x;
const [px, py] = count.P[0];
const bfs = (ok) => {
  const prev = new Map([[key(px, py), -1]]), q = [[px, py]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!prev.has(key(nx, ny)) && ok(nx, ny)) { prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]); }
    }
  }
  return prev;
};
const seen = bfs(pass);
const reach = (c, label) => { for (const [x, y] of count[c] ?? []) if (!seen.has(key(x, y))) err(`${label} em ${x},${y} inalcançável`); };
reach('S', 'altar'); reach('c', 'moeda'); reach('f', 'fitinha'); reach('v', 'fissura'); reach('K', 'checkpoint'); reach('J', 'Jandira');
// alcançável SEM quebrar blocos (caminho principal): B/?/W bloqueiam
{
  const pass2 = (x, y) => pass(x, y) && !'B?W'.includes(at(x, y)) && !'B?W'.includes(at(x, y - 1));
  const s2 = bfs(pass2);
  const [sx, sy] = count.S[0];
  if (!s2.has(key(sx, sy))) err('altar exige quebrar blocos (caminho principal bloqueado)');
  const fs = (count.f ?? []).filter(([x, y]) => !s2.has(key(x, y)));
  if (fs.length < 1) err('nenhuma fitinha atrás de blocos');
  warns.push(`fitinhas atrás de blocos: ${fs.map((p) => p.join(',')).join(' ')}`);
  // ar no caminho principal: passos entre fontes de ar (bolhas das fissuras ou aura da Jandira) <= 90 (~18s de 30s)
  const [jx, jy] = count.J[0];
  const vents = count.v ?? [];
  const air = (x, y) => vents.some(([vx, vy]) => Math.abs(x - vx) <= 1 && y <= vy && y >= vy - 6) || Math.hypot(x - jx, y - jy) <= 12;
  const path = []; for (let k = key(sx, sy); k !== -1; k = s2.get(k)) path.push([k % W, Math.floor(k / W)]);
  path.reverse();
  let since = 0, worst = 0;
  for (const [x, y] of path) { since = air(x, y) ? 0 : since + 1; worst = Math.max(worst, since); if (since > 90) { err(`caminho principal sem ar por > 90 passos perto de ${x},${y}`); break; } }
  warns.push(`caminho principal: ${path.length} passos, maior trecho sem ar: ${worst}`);
}
let free = 0; for (let y = 0; y < 15; y++) for (let x = 0; x < W; x++) if (pass(x, y)) free++;
if (process.argv.includes('--print')) {
  const ruler = (k) => '   ' + Array.from({ length: W }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10 ** k).padStart(k, ' ')[0] : ' ')).join('');
  for (let x0 = 0; x0 < W; x0 += 60) {
    console.log('    ' + Array.from({ length: Math.min(60, W - x0) }, (_, i) => ((x0 + i) % 10 === 0 ? '|' : ' ')).join('') + `  (${x0}-${Math.min(W, x0 + 60) - 1})`);
    rows.forEach((r, y) => console.log(String(y).padStart(2) + '  ' + r.slice(x0, x0 + 60)));
  }
  void ruler;
}
console.log(`mapa ${W}x${H}`);
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => !'.=#R'.includes(c)).sort().map((c) => [c, n(c)])));
console.log('fissuras x:', vs.join(','), '| K x:', (count.K ?? []).map(([x]) => x).join(','), '| f:', (count.f ?? []).map((p) => p.join(',')).join(' '), '| S:', count.S[0].join(','), '| J:', count.J[0].join(','));
console.log(warns.join('\n'));
console.log(`células alcançadas: ${seen.size} (livres ${free})`);
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel3 OK');
