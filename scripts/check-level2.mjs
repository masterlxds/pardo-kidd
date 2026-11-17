// Valida o mapa da Fase 2. Uso: node scripts/check-level2.mjs [--verbose]
//
// Além das checagens estáticas (legenda, apoio de marcadores, caminhos dos movers, distâncias),
// este validador SIMULA o Pardo: porta fiel de core/physics.ts (moveBody) + a física de pulo de
// player.ts (gravidade, pulo variável, controle aéreo, pouso em plataformas/one-way, morte por
// água/espinho) e faz uma busca em largura sobre posições de apoio. Duas passadas:
//   1) envelope REDUZIDO (pulo 95%, corrida 90%): o alien e todos os checkpoints têm de ser
//      alcançáveis — prova que o caminho obrigatório tem folga;
//   2) envelope REAL: toda moeda tem de ser tocável e todo bloco-estrela socável.
// Abstrações (o que a simulação NÃO prova): troncos/plataformas móveis são tratados como se
// estivessem em qualquer ponto do percurso (tempo de espera não é simulado), vitórias-régias não
// afundam, e inimigos não existem. Blocos B/?/W só "somem" quando há um ponto de apoio já
// alcançado de onde um soco em pé ou com pulinho os acerta.
// LEVEL2_FILE=<caminho> permite validar uma cópia modificada (testes de mutação do próprio validador)
const { LEVEL2_ROWS: rows, LEVEL2_LEGEND: legend, LEVEL2_MOVERS: movers } = await import(process.env.LEVEL2_FILE ?? '../src/game/level2.ts');

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

// ── 1. Formato e contagens ───────────────────────────────────────────────────
if (H !== 14) err(`altura ${H} != 14`);
if (W < 220 || W > 270) err(`largura ${W} fora de 220..270`);
if (n('P') !== 1) err(`spawn: ${n('P')} != 1`);
if (n('A') !== 1) err(`alien: ${n('A')} != 1`);
min('K', 4, 'checkpoints'); min('o', 3, 'onças'); min('j', 3, 'jacarés'); min('n', 3, 'cobras');
min('u', 4, 'tucanos'); min('V', 4, 'cipós-d\'água'); min('m', 2, 'troncos H'); min('M', 2, 'plataformas V');
min('d', 4, 'vitórias-régias'); min('c', 60, 'moedas'); min('O', 1, 'oca');
min('B', 1, 'blocos rachados'); min('?', 3, 'blocos ?'); min('W', 3, 'blocos W');
for (const c of 'sOhfFt') min(c, 1, `decoração '${c}'`);
// limites superiores: a fase é de autoria, não de quantidade (3 de hidratação)
if (n('u') > 6) err(`tucanos demais: ${n('u')}`);
if (n('o') > 5) err(`onças demais: ${n('o')}`);
for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`];
  if (!mv || !(mv.range > 0) || !(mv.speed > 0)) err(`mover ${x},${y} sem parâmetros válidos`);
}
for (const k of Object.keys(movers)) { const [x, y] = k.split(',').map(Number); if (!'mM'.includes(at(x, y))) err(`mover ${k} sem marcador m/M`); }

const solid = (c) => '=#RB?W'.includes(c);
const earth = (c) => '=#R'.includes(c);
const surface = (x, y) => solid(at(x, y)) || at(x, y) === '-';
// chão-base na linha 11: só terra/pedra/água/vão; nada de blocos, galhos ou marcadores
for (let x = 0; x < W; x++) if (!'=#R~.'.includes(at(x, 11))) err(`linha 11 em ${x}: '${at(x, 11)}' não é chão/água/vão`);
// '=' é topo exposto, '#' é terra coberta (o desenho depende disso)
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const c = at(x, y), up = y > 0 ? at(x, y - 1) : '.';
  if (c === '=' && (up === '=' || up === '#')) err(`'=' coberto por terra em ${x},${y}`);
  if (c === '#' && !(up === '=' || up === '#')) err(`'#' exposto (deveria ser '=') em ${x},${y}`);
}

// ── 2. Apoio e espaço dos marcadores ─────────────────────────────────────────
for (const c of 'PKonjVAsOhfFt') for (const [x, y] of all(c)) {
  if (!surface(x, y + 1)) err(`'${c}' em ${x},${y} sem apoio abaixo`);
}
// cipó-d'água tem 2 tiles de altura; checkpoint/spawn/alien precisam de 2 tiles livres
for (const c of 'VPKA') for (const [x, y] of all(c)) if (solid(at(x, y - 1))) err(`'${c}' em ${x},${y} sem 2 tiles livres de altura`);
// decorações largas: sem tiles sólidos no caminho e apoio em toda a largura
const wide = { O: 5, F: 2 };
for (const [c, w] of Object.entries(wide)) for (const [x, y] of all(c)) for (let i = 0; i < w; i++) {
  if (solid(at(x + i, y))) err(`'${c}' em ${x},${y} atravessa tile em ${x + i}`);
  if (!solid(at(x + i, y + 1))) err(`'${c}' em ${x},${y} sem chão em ${x + i}`);
}
for (const [x, y] of all('q')) for (let i = 0; i < 3; i++) {
  if (solid(at(x + i, y))) err(`canoa ${x},${y} atravessa tile em ${x + i}`);
  if (at(x + i, y + 1) !== '~') err(`canoa ${x},${y} sem água em ${x + i}`);
}
// jacarés: chão sólido (não galho/água) em 3 tiles; onças: superfície >= 5 de largura
for (const [x, y] of all('j')) for (const dx of [-1, 0, 1]) {
  if (!solid(at(x + dx, y + 1))) err(`jacaré ${x},${y}: sem chão sólido em ${x + dx}`);
  if (solid(at(x + dx, y))) err(`jacaré ${x},${y}: corpo atravessa tile em ${x + dx}`);
}
for (const [x, y] of all('o')) {
  let a = x, b = x;
  while (surface(a - 1, y + 1) && !solid(at(a - 1, y))) a--;
  while (surface(b + 1, y + 1) && !solid(at(b + 1, y))) b++;
  if (b - a + 1 < 5) err(`onça ${x},${y}: superfície de ${b - a + 1} tiles < 5`);
}
// cobras: 1 tile livre de cada lado (o bote estica 12px) e chão sólido
for (const [x, y] of all('n')) for (const dx of [-1, 1]) if (solid(at(x + dx, y))) err(`cobra ${x},${y}: encostada em tile (${x + dx})`);

// ── 3. Movers e vitórias-régias ──────────────────────────────────────────────
const free = (c) => c === '.' || c === 'c';
for (const [x, y] of all('m')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let i = 0; i <= mv.range + 1; i++) {
    if (i > 0 && !free(at(x + i, y))) err(`tronco ${x},${y}: caminho bloqueado por '${at(x + i, y)}' em ${x + i}`);
    if (at(x + i, y + 1) !== '~') err(`tronco ${x},${y}: sem água sob o percurso em ${x + i}`);
    if (solid(at(x + i, y - 1)) || solid(at(x + i, y - 2))) err(`tronco ${x},${y}: teto baixo em ${x + i}`);
  }
}
for (const [x, y] of all('M')) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  for (let j = -2; j <= mv.range; j++) for (const dx of [0, 1]) {
    if (!(j === 0 && dx === 0) && !free(at(x + dx, y + j))) err(`plataforma V ${x},${y}: bloqueada em ${x + dx},${y + j}`);
  }
  if (y + mv.range > 10) err(`plataforma V ${x},${y}: desce abaixo da linha 10`);
}
for (const [x, y] of [...all('m'), ...all('M')]) {
  const mv = movers[`${x},${y}`]; if (!mv) continue;
  const period = (2 * mv.range * 16) / mv.speed, peak = (Math.PI / 2) * mv.speed;
  notes.push(`mover ${x},${y} (${at(x, y)}): percurso ${mv.range} tiles, período ${period.toFixed(1)}s, pico ${peak.toFixed(0)}px/s`);
  if (period > 6.5) err(`mover ${x},${y}: período ${period.toFixed(1)}s > 6.5s (espera longa demais)`);
  if (peak > 90) err(`mover ${x},${y}: pico de ${peak.toFixed(0)}px/s > 90 (o Pardo corre a 110)`);
}
for (const [x, y] of all('d')) {
  for (const dx of [0, 1]) {
    if (dx && !free(at(x + dx, y))) err(`vitória-régia ${x},${y}: célula ${x + dx} ocupada por '${at(x + dx, y)}'`);
    if (at(x + dx, y + 1) !== '~') err(`vitória-régia ${x},${y}: sem água embaixo em ${x + dx}`);
    if (solid(at(x + dx, y - 1)) || solid(at(x + dx, y - 2))) err(`vitória-régia ${x},${y}: teto baixo em ${x + dx}`);
  }
}

// ── 4. Distâncias: inimigos x pontos seguros, tucanos entre si ───────────────
const safe = [...all('P'), ...all('K')];
for (const c of 'onj') for (const [x, y] of all(c)) for (const [sx] of safe)
  if (Math.abs(x - sx) < 5) err(`inimigo '${c}' em ${x},${y} a menos de 5 tiles do spawn/checkpoint ${sx}`);
// contrato do tucano: acorda a ~7 tiles, nunca passa de ~10 do marcador → encontro local de ~20 tiles
const TUC_WAKE = 7, TUC_LEASH = 10;
const tuc = all('u').slice().sort((a, b) => a[0] - b[0]);
for (const [x, y] of tuc) {
  if (y < 3 || y > 6) err(`tucano ${x},${y}: linha fora de 3..6`);
  for (const [sx] of safe) if (Math.abs(x - sx) <= TUC_WAKE) err(`tucano ${x},${y}: acordaria no respawn do ponto seguro ${sx} (<= ${TUC_WAKE} tiles)`);
}
for (let i = 1; i < tuc.length; i++) if (tuc[i][0] - tuc[i - 1][0] < 2 * TUC_LEASH) err(`tucanos ${tuc[i - 1][0]} e ${tuc[i][0]} a menos de ${2 * TUC_LEASH} tiles`);
// chão firme sob o território do tucano: colunas de água/fosso dentro do raio
const hazardCol = (x) => { for (let y = 0; y < H; y++) { const c = at(x, y); if (earth(c)) return false; if (c === '~' || c === '^') return true; } return true; };
let wetTucs = 0;
for (const [x, y] of tuc) {
  let wet = 0;
  for (let i = Math.max(0, x - TUC_LEASH); i <= Math.min(W - 1, x + TUC_LEASH); i++) if (hazardCol(i)) wet++;
  notes.push(`tucano ${x},${y}: território ${x - TUC_LEASH}..${x + TUC_LEASH}, ${wet} coluna(s) de água/fosso`);
  if (wet > 8) err(`tucano ${x},${y}: ${wet} colunas de água/fosso no território (> 8)`);
  else if (wet > 3) wetTucs++;
  // casa do tucano acima das superfícies do território (ele mergulha; o Pardo não deve nascer "dentro" dele)
  for (let i = x - TUC_WAKE; i <= x + TUC_WAKE; i++) for (let yy = 0; yy <= y + 1; yy++)
    if (surface(i, yy) && !solid(at(i, yy - 1)) && at(i, yy) !== '-') err(`tucano ${x},${y}: piso sólido em ${i},${yy} na altura da casa dele`);
}
if (wetTucs > 1) err(`${wetTucs} tucanos sobre trechos de água/fosso (máx. 1)`);
// tucano só perto do fim se o encontro "molhado" existir
for (const [x, y] of tuc) { let wet = 0; for (let i = x - TUC_LEASH; i <= x + TUC_LEASH; i++) if (i >= 0 && i < W && hazardCol(i)) wet++; if (wet > 3 && x < W / 2) err(`tucano ${x},${y}: encontro sobre água cedo demais (antes da metade da fase)`); }

// ── 5. Ritmo: checkpoints, hidratação, trechos mortos, telas planas ──────────
const A = all('A')[0], P = all('P')[0];
const stops = [P[0], ...all('K').map(([x]) => x).sort((a, b) => a - b), A ? A[0] : W - 1];
for (let i = 1; i < stops.length; i++) {
  const d = stops[i] - stops[i - 1];
  if (d > 62) err(`trecho sem checkpoint de ${d} colunas (${stops[i - 1]}→${stops[i]}) > 62`);
  if (d < 20) err(`checkpoints muito próximos (${stops[i - 1]}→${stops[i]})`);
}
const water = [...all('V'), ...all('W')].map(([x]) => x).sort((a, b) => a - b);
{ let prev = P[0]; for (const x of [...water, A ? A[0] : W - 1]) { if (x - prev > 42) err(`${x - prev} colunas sem fonte de hidratação (V/W) entre ${prev} e ${x}`); prev = x; } }
const topOf = Array(W).fill(-1);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (earth(at(x, y))) { topOf[x] = y; break; }
const moverCols = new Set();
for (const [x, y] of all('m')) for (let i = 0; i <= (movers[`${x},${y}`]?.range ?? 0) + 1; i++) moverCols.add(x + i);
for (const [x] of all('M')) { moverCols.add(x); moverCols.add(x + 1); }
for (const [x] of all('d')) { moverCols.add(x); moverCols.add(x + 1); }
const interesting = (x) => {
  if (moverCols.has(x)) return true;
  if (x > 0 && topOf[x] !== topOf[x - 1]) return true;
  for (let y = 0; y < H; y++) if ('conjuVKBW?-AP'.includes(at(x, y))) return true;
  return false;
};
{ let run = 0, start = 0; for (let x = 0; x <= W; x++) {
  if (x < W && !interesting(x)) { if (!run) start = x; run++; }
  else { if (run > 9) err(`trecho morto ${start}-${start + run - 1} (${run} colunas sem inimigo, moeda, relevo ou objeto)`); run = 0; }
} }
// relevo: nenhuma tela (20 colunas) com um único nível pisável, exceto a chegada na aldeia (da oca em diante)
const standRows = (x) => {
  const s = new Set();
  for (let y = 1; y < H; y++) if (surface(x, y) && !solid(at(x, y - 1))) s.add(y);
  return s;
};
const lastRelief = (all('O')[0]?.[0] ?? W) - 1;
for (let x0 = 0; x0 + 20 <= lastRelief; x0++) {
  const s = new Set(); let moving = false;
  for (let x = x0; x < x0 + 20; x++) { for (const r of standRows(x)) s.add(r); if (moverCols.has(x)) moving = true; }
  if (s.size + (moving ? 1 : 0) < 3) { err(`tela ${x0}-${x0 + 19} quase plana: só ${s.size} nível(is) pisável(is)`); x0 += 19; }
}
const flat = topOf.filter((t, x) => t === 11 && standRows(x).size === 1).length;
notes.push(`colunas de chão plano na linha 11 sem nada pisável acima: ${flat}/${W} (${Math.round((100 * flat) / W)}%)`);
if (flat / W > 0.4) err(`fase plana demais: ${Math.round((100 * flat) / W)}% das colunas são só chão na linha 11`);

// ── 6. Terreno: vãos, base, aldeia ───────────────────────────────────────────
for (let x = 0; x < W; x++) for (const y of [12, 13]) if (at(x, y) === '.' && at(x, 13) !== '^') err(`buraco vazio em ${x},${y}`);
for (let x = 0; x < W; x++) if (at(x, 11) === '~' && (at(x, 12) !== '~' || at(x, 13) !== '~')) err(`água rasa em ${x} (precisa de 3 linhas)`);
for (let x = 0; x < W; x++) for (let y = 0; y < 11; y++) if (at(x, y) === '~') err(`água acima da linha 11 em ${x},${y}`);
const wallCols = [...new Set(all('B').map(([x]) => x))].filter((x) => { let h = 0; for (let y = 0; y < H; y++) if ('B?W'.includes(at(x, y))) h++; return h >= 4; });
if (!wallCols.length) err('sem parede de blocos alta (>=4)');
if (A) {
  if (at(A[0] - 1, A[1]) !== '.' || at(A[0] - 2, A[1]) !== '.' || at(A[0] - 3, A[1]) !== '.') err('sem 3 tiles livres à esquerda do alien');
  for (let x = A[0] - 4; x <= A[0] + 1 && x < W; x++) if (topOf[x] !== 11) err(`chão da aldeia não plano em ${x}`);
  const O = all('O')[0];
  if (!O || O[0] + 5 > A[0]) err('oca deve estar à esquerda do alien');
  else for (let x = O[0] + 5; x < A[0]; x++) for (let y = 7; y <= 10; y++) if (at(x, y) !== '.') err(`espaço do alien ocupado em ${x},${y}`);
  // chegada calma: nenhum inimigo da oca em diante
  if (O) for (const c of 'onju') for (const [x] of all(c)) if (x >= O[0] - 2) err(`inimigo '${c}' em ${x} dentro da aldeia (oca em ${O[0]})`);
}

// ── 7. Simulação do Pardo ────────────────────────────────────────────────────
const T = 16, PW = 10, PH = 20, DT = 1 / 60, EPS = 0.001;
const GRAV = 900, MAX_FALL = 360, JUMP_CUT = 0.55, AIR_ACCEL = 620, AIR_DRAG = 160;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);

// plataformas de entidade (topo one-way): régias paradas; movers = todo o percurso
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
    if (c === '~' || c === '^') haz[i] = 1;
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
  // voo: devolve {x,y} do pouso ou null (morte/timeout)
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
      // moveBody
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

  const Q = 4; // grade de posições em pé (px)
  const seen = new Map();
  const queue = [];
  const back = new Map(); // grafo invertido: destino → origens (para a checagem de becos sem saída)
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
    // plataforma vertical: carrega o Pardo para qualquer altura do percurso
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
    if (!(sim.bodyFree(x, y) && sim.supported(x, y))) continue; const feet = y + PH; if (feet % T) continue; const fr = feet / T; if (!byRow.has(fr)) byRow.set(fr, []); byRow.get(fr).push([x, y]); }
  for (const c of 'B?W') for (const [bx, by] of all(c)) {
    const i = by * W + bx;
    if (removed.has(i)) continue;
    search: for (let diff = 1; diff <= reach; diff++) for (const [x, y] of byRow.get(by + diff) ?? []) {
      const gapL = bx * T - (x + PW), gapR = x - (bx + 1) * T;
      const gap = gapL >= 0 ? gapL : gapR;
      if (gap < -2 || gap > 14) continue; // a caixa do soco alcança 18px à frente
      if (gapL < 0 && gapR < 0) continue;
      // nada sólido entre o Pardo e o bloco nas linhas da caixa
      if (diff === 3 && !sim.bodyFree(x, y - 30)) continue; // precisa de ~1,5 tile de teto livre
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
  // blocos-estrela suspensos: soco no pulo, um a um a partir das pontas (não altera a geometria da busca)
  const hittable = new Set(removed);
  for (let pass = 0; pass < 12; pass++) {
    const more = punchable(simulate(env, hittable), reached.values(), hittable, 3);
    if (!more.size) break;
    for (const i of more) hittable.add(i);
  }
  // posições em pé por célula (coluna, linha dos pés)
  const cells = new Set();
  for (const [x, y] of reached.values()) for (let tx = Math.floor(x / T); tx <= Math.floor((x + PW - EPS) / T); tx++) cells.add(`${tx},${Math.floor((y + PH - 1) / T)}`);
  const standsAt = (col, row) => cells.has(`${col},${row}`);
  notes.push(`${label}: ${reached.size} posições de apoio, ${coins.size}/${n('c')} moedas, ${hittable.size} blocos socáveis`);
  // becos sem saída: na geometria final (todo bloco socável já quebrado), de cada posição em pé
  // ainda alcançável tem de existir caminho até o alien
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
  if (A && !safeEnv.standsAt(A[0], A[1]) && !safeEnv.standsAt(A[0] - 1, A[1])) err(`alien inalcançável (${A}) com o envelope reduzido`);
  for (const [x, y] of all('K')) if (!safeEnv.standsAt(x, y)) err(`checkpoint ${x},${y} inalcançável com o envelope reduzido`);
  for (const [x, y] of all('V')) if (!safeEnv.standsAt(x - 1, y) && !safeEnv.standsAt(x + 1, y) && !safeEnv.standsAt(x, y)) err(`cipó-d'água ${x},${y} inalcançável com o envelope reduzido`);
  if (safeEnv.stuck.length) err(`becos sem saída (posições de onde o alien não é mais alcançável): ${[...new Set(safeEnv.stuck.map(([x, y]) => `${x},${y}`))].slice(0, 30).join(' ')}`);
  // a parede alta tem de ser necessária em alguma rota: os dois lados alcançáveis
  for (const x of wallCols) { let y = H - 1; while (y > 0 && !'B?W'.includes(at(x, y))) y--; if (!safeEnv.removed.has(y * W + x)) err(`parede de blocos na coluna ${x}: base não socável a partir de um ponto alcançável`); }
  // 7b. tudo coletável com o envelope real
  const full = explore({ jump: 300, run: 110 }, 'envelope real');
  const lost = all('c').filter(([x, y]) => !full.coins.has(y * W + x));
  if (lost.length) err(`${lost.length} moeda(s) não coletável(is): ${lost.slice(0, 12).map((p) => p.join(',')).join(' ')}${lost.length > 12 ? ' …' : ''}`);
  for (const c of '?W') for (const [x, y] of all(c)) if (!full.hittable.has(y * W + x)) err(`bloco '${c}' em ${x},${y} não socável`);
  // superfícies que só o envelope real alcança = desafios opcionais (informativo)
  const optional = [...full.cells].filter((k) => !safeEnv.cells.has(k)).map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0]);
  const cols = [...new Set(optional.map(([x]) => x))];
  notes.push(`colunas com apoio só no envelope real (opcional/difícil): ${cols.length ? cols.join(',') : 'nenhuma'}`);
  if (VERBOSE) {
    // superfícies de tile nunca pisadas (decorativas ou inalcançáveis)
    const never = [];
    for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) if (surface(x, y) && !solid(at(x, y - 1)) && at(x, y - 1) !== '-' && !full.standsAt(x, y - 1)) never.push(`${x},${y}`);
    notes.push(`superfícies nunca pisadas: ${never.join(' ') || 'nenhuma'}`);
  }
}

console.log(`mapa ${W}x${H}`);
console.log('contagens:', Object.fromEntries(Object.keys(count).filter((c) => 'PKAcmMdonjuVBW?^-~q'.includes(c)).map((c) => [c, n(c)])));
console.log('checkpoints em:', all('K').map(([x]) => x).sort((a, b) => a - b).join(', '), '| tucanos em:', tuc.map(([x]) => x).join(', '));
console.log('parede alta em colunas:', wallCols.join(','));
console.log(notes.join('\n'));
if (warns.length) console.log(warns.join('\n'));
if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nlevel2 OK');
