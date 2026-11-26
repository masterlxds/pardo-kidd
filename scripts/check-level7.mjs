#!/usr/bin/env node
/**
 * Validador completo da FASE 7 — "Espaço Sideral (Órbita de Quixadá)".
 * Especificação: PLAN-FASE7.md §2 (D1–D17), §3, §4 (R1–R8) e §5.
 *
 * Uso:
 *   node scripts/check-level7.mjs            valida tudo e imprime `level7 OK` (exit 1 em erro)
 *   node scripts/check-level7.mjs --static   só checagens estáticas + corredor D5/R3 (rápido)
 *   node scripts/check-level7.mjs --print    + relatório detalhado (elementos, corredor, rota do bot)
 *   LEVEL7_FILE=<caminho> node scripts/...   valida um mapa alternativo
 *
 * Importa `spaceRules.ts` e `level7.ts` direto (Node ≥ 22.15 type stripping, sem build).
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as RULES from '../src/game/spaceRules.ts';

const {
  SPACE,
  PLANET_GRAV,
  SPACE_ENEMIES,
  SPACE_OBSTACLES,
  SPACE_CAM_MAX,
  SPACE_BRAKE_START_CAM_X,
  SPACE_STOP_CAM_X,
  scrollSpeedAt,
  planetPos,
  createSpacePlayerState,
  stepPlayerSpace,
  spacePunchBox,
  meteorPos,
  cometPos,
  ufoPos,
  ufoShouldFire,
  alienJetStep,
  mineStep,
  satellitePos,
  debrisPos,
  beamSatellitePos,
  solarWindAt,
} = RULES;

const levelUrl = process.env.LEVEL7_FILE
  ? pathToFileURL(resolve(process.cwd(), process.env.LEVEL7_FILE)).href
  : new URL('../src/game/level7.ts', import.meta.url).href;
const LVL = await import(levelUrl);

const {
  LEVEL7_LEGEND: LEGEND,
  LEVEL7_BAR_COLS,
  LEVEL7_BAR_COUNT,
  LEVEL7_BARS: BARS,
  LEVEL7_ROWS: ROWS,
  LEVEL7_PLANETS: PLANETS,
  LEVEL7_WAVES: WAVES,
} = LVL;

const STATIC_ONLY = process.argv.includes('--static');
const PRINT = process.argv.includes('--print');

const HZ = 60;
const DT = 1 / HZ;
const T = SPACE.tile;
const COLS = SPACE.cols;
const NROWS = SPACE.rows;
const BAR = SPACE.barCols;
const BEAT = SPACE.beatCols;

const SOLID_TILES = new Set(['=', '#', 'R', 'B', '?', '-', '^', '~']);
const ENEMY_CHARS = 'mMguab';
const OBSTACLE_CHARS = 'sSdv';
const PLANET_CHARS = 'YU';
const DANGER_CHARS = ENEMY_CHARS + OBSTACLE_CHARS + PLANET_CHARS;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const barOf = (col) => Math.floor(col / BAR) + 1;
const beatOf = (col) => Math.floor((col % BAR) / BEAT) + 1;
const pos = (col) => `c.${String(barOf(col)).padStart(2, '0')} t${beatOf(col)}`;
const camToBar = (camX) => Math.min(65, Math.max(1, Math.floor((camX + SPACE.respawnScreenX) / (BAR * T)) + 1));
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. CHECAGENS ESTÁTICAS (§4 e §5.1)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

function checkRange(v, ranges) {
  return ranges.some(([lo, hi]) => v >= lo && v <= hi);
}

function buildTimeline(startCamX = 0) {
  const cams = [startCamX];
  let cx = startCamX;
  while (cx < SPACE_STOP_CAM_X - 0.25 && cams.length < 15000) {
    const v = scrollSpeedAt(cx);
    if (v <= 0) break;
    cx = Math.min(SPACE_STOP_CAM_X, cx + v * DT);
    cams.push(cx);
  }
  return cams;
}

/** Calcula o intervalo de `camX` [warnStart, activeStart, activeEnd] para uma ameaça estática/reativa. */
function computeCamIntervals(ent) {
  const spawnX = ent.spawnX;
  const enterCamX = spawnX - SPACE.viewW;

  if (ent.kind === 'yuri' || ent.kind === 'yumi') {
    const warnCamX = enterCamX - PLANET_GRAV.warnT * SPACE.scrollSpeed;
    const exitCamX = enterCamX + ((SPACE.viewW + 2 * PLANET_GRAV.radius) / PLANET_GRAV.speed) * SPACE.scrollSpeed;
    return { warnStart: warnCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'meteor') {
    const spec = SPACE_ENEMIES.meteor;
    const exitCamX = enterCamX + ((SPACE.viewW + spec.w) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'meteor_fire') {
    const spec = SPACE_ENEMIES.meteor_fire;
    const warnCamX = enterCamX - spec.warnT * SPACE.scrollSpeed;
    const exitCamX = enterCamX + ((SPACE.viewW + spec.w) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: warnCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'comet_ice') {
    const spec = SPACE_ENEMIES.comet_ice;
    const warnCamX = enterCamX - spec.warnT * SPACE.scrollSpeed;
    const dirY = ent.row >= 6 ? -1 : 1;
    const vxS = SPACE.scrollSpeed + spec.speed * Math.SQRT1_2;
    const vyS = dirY * spec.speed * Math.SQRT1_2;
    const tX = (SPACE.viewW + spec.w) / vxS;
    const tY = vyS > 0 ? (SPACE.viewH + spec.h / 2 - ent.spawnY) / vyS : (ent.spawnY + spec.h / 2) / -vyS;
    const activeDur = Math.max(0, Math.min(tX, tY));
    return { warnStart: warnCamX, activeStart: enterCamX, activeEnd: enterCamX + activeDur * SPACE.scrollSpeed };
  }
  if (ent.kind === 'ufo') {
    const spec = SPACE_ENEMIES.ufo;
    const exitCamX = enterCamX + ((SPACE.viewW + spec.w) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'plasma_orb') {
    const spec = SPACE_ENEMIES.plasma_orb;
    const waveCamX = ent.waveCamX;
    const startSX = SPACE.motherScreenX - 24;
    const exitCamX = waveCamX + ((startSX + spec.w / 2) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: waveCamX, activeStart: waveCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'alien_jet') {
    const spec = SPACE_ENEMIES.alien_jet;
    const nominalPX = 90;
    const tApp = Math.max(0, (SPACE.viewW + spec.w / 2 - (nominalPX + spec.lockDist)) / spec.speed);
    const tDash = (nominalPX + spec.lockDist + spec.w / 2) / spec.dashSpeed;
    const exitCamX = enterCamX + (tApp + spec.lockT + tDash) * SPACE.scrollSpeed;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'space_mine') {
    const spec = SPACE_ENEMIES.space_mine;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: spawnX + spec.w / 2 };
  }
  if (ent.kind === 'satellite') {
    const spec = SPACE_OBSTACLES.satellite;
    const exitCamX = enterCamX + ((SPACE.viewW + spec.w) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'satellite_beam') {
    const spec = SPACE_OBSTACLES.satellite_beam;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: spawnX + spec.w / 2 };
  }
  if (ent.kind === 'space_debris') {
    const spec = SPACE_OBSTACLES.space_debris;
    const exitCamX = enterCamX + ((SPACE.viewW + spec.w) / (SPACE.scrollSpeed + spec.speed)) * SPACE.scrollSpeed;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: exitCamX };
  }
  if (ent.kind === 'solar_wind') {
    const spec = SPACE_OBSTACLES.solar_wind;
    return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: enterCamX + spec.totalT * SPACE.scrollSpeed };
  }
  return { warnStart: enterCamX, activeStart: enterCamX, activeEnd: enterCamX };
}

function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 - 1e-3 && b0 < a1 - 1e-3;
}

function staticChecks() {
  if (!LEGEND || typeof LEGEND !== 'object') {
    err('LEVEL7_LEGEND ausente ou inválido');
    return null;
  }
  if (LEVEL7_BAR_COLS !== BAR) err(`LEVEL7_BAR_COLS=${LEVEL7_BAR_COLS} != SPACE.barCols=${BAR}`);
  if (LEVEL7_BAR_COUNT !== 65) err(`LEVEL7_BAR_COUNT=${LEVEL7_BAR_COUNT} != 65`);
  if (!Array.isArray(BARS) || BARS.length !== 65) {
    err(`LEVEL7_BARS tem ${BARS?.length ?? 0} compassos, esperado 65`);
    return null;
  }
  for (let b = 0; b < BARS.length; b++) {
    const bar = BARS[b];
    if (!Array.isArray(bar) || bar.length !== NROWS) {
      err(`c.${b + 1}: ${bar?.length ?? 0} linhas, esperado ${NROWS}`);
      continue;
    }
    for (let r = 0; r < NROWS; r++) {
      if (typeof bar[r] !== 'string' || bar[r].length !== BAR) {
        err(`c.${b + 1} linha ${r}: ${bar[r]?.length ?? 0} colunas, esperado ${BAR}`);
      }
    }
  }
  if (!Array.isArray(ROWS) || ROWS.length !== NROWS) {
    err(`LEVEL7_ROWS tem ${ROWS?.length ?? 0} linhas, esperado ${NROWS}`);
    return null;
  }
  for (let r = 0; r < NROWS; r++) {
    if (typeof ROWS[r] !== 'string' || ROWS[r].length !== COLS) {
      err(`linha ${r}: ${ROWS[r]?.length ?? 0} colunas, esperado ${COLS}`);
      continue;
    }
    const concat = BARS.map((b) => b[r] ?? '').join('');
    if (ROWS[r] !== concat) err(`linha ${r}: LEVEL7_ROWS difere da concatenação de LEVEL7_BARS`);
  }
  if (errors.length > 0) return null;

  const markers = [];
  for (let r = 0; r < NROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = ROWS[r][c];
      if (SOLID_TILES.has(ch)) err(`${pos(c)} linha ${r}: tile sólido/proibido '${ch}' (Fase 7 exige 0 sólidos)`);
      if (!(ch in LEGEND)) {
        err(`${pos(c)} linha ${r}: caractere '${ch}' fora de LEVEL7_LEGEND`);
        continue;
      }
      if (ch !== '.') {
        markers.push({
          ch,
          col: c,
          row: r,
          bar: barOf(c),
          beat: beatOf(c),
          spawnX: c * T + T / 2,
          spawnY: r * T + T / 2,
        });
      }
    }
  }
  markers.sort((a, b) => a.col - b.col || a.row - b.row);

  const of = (set) => markers.filter((m) => set.includes(m.ch));
  const count = (ch) => markers.filter((m) => m.ch === ch).length;

  // Estruturais: P (c.1), A (c.65), N (c.50)
  const ps = of('P');
  if (ps.length !== 1) err(`esperado exatamente 1 'P', encontrado ${ps.length}`);
  else if (ps[0].bar !== 1) err(`'P' deve ficar no compasso 1, encontrado em ${pos(ps[0].col)}`);

  const as = of('A');
  if (as.length !== 1) err(`esperado exatamente 1 'A', encontrado ${as.length}`);
  else if (as[0].bar !== 65) err(`'A' deve ficar no compasso 65, encontrado em ${pos(as[0].col)}`);

  const ns = of('N');
  if (ns.length !== 1) err(`esperado exatamente 1 'N' (Nave-Mãe), encontrado ${ns.length}`);
  else if (ns[0].bar !== 50) err(`'N' deve ficar no compasso 50, encontrado em ${pos(ns[0].col)}`);

  // Final (compassos 62–65): nada que fira
  for (const m of markers) {
    if (m.bar >= 62 && DANGER_CHARS.includes(m.ch)) {
      err(`Final ${pos(m.col)}: '${m.ch}' (${LEGEND[m.ch]}) proibido nos compassos 62–65`);
    }
  }

  // Coerência LEVEL7_PLANETS <-> marcadores Y/U + R1/D5
  const planetMarkers = of(PLANET_CHARS);
  if (!Array.isArray(PLANETS)) {
    err('LEVEL7_PLANETS ausente ou não é array');
    return null;
  }
  const planets = [];
  if (PLANETS.length !== planetMarkers.length) {
    err(`coerência planetas: LEVEL7_PLANETS tem ${PLANETS.length} entradas, mas mapa tem ${planetMarkers.length} marcadores Y/U`);
  }
  const seenPlanetCols = new Set();
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i];
    if (!p || typeof p !== 'object' || !Number.isInteger(p.col) || p.col < 0 || p.col >= COLS) {
      err(`LEVEL7_PLANETS[${i}]: coluna inválida (${p?.col})`);
      continue;
    }
    if (p.kind !== 'yuri' && p.kind !== 'yumi') {
      err(`LEVEL7_PLANETS[${i}] (${pos(p.col)}): kind '${p.kind}' inválido (esperado 'yuri' ou 'yumi')`);
      continue;
    }
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) {
      err(`LEVEL7_PLANETS[${i}] (${pos(p.col)}): y inválido (${p.y})`);
      continue;
    }
    if (seenPlanetCols.has(p.col)) {
      err(`LEVEL7_PLANETS[${i}] (${pos(p.col)}): coluna duplicada`);
    }
    seenPlanetCols.add(p.col);
    const bar = barOf(p.col);
    if (bar >= 62) err(`Final ${pos(p.col)}: planeta em LEVEL7_PLANETS proibido nos compassos 62–65`);
    // R1 / D5: faixas Y
    if (!checkRange(p.y, PLANET_GRAV.yRanges)) {
      err(`R1/D5 ${pos(p.col)}: planeta '${p.kind}' com y=${p.y} fora de yRanges ([38,68] ou [112,142])`);
    }
    if (p.wave && !checkRange(p.y, PLANET_GRAV.waveYRanges)) {
      err(`R1/D5 ${pos(p.col)}: planeta '${p.kind}' com wave=true e y=${p.y} fora de waveYRanges ([38,52] ou [128,142])`);
    }
    planets.push({
      id: i,
      col: p.col,
      bar,
      kind: p.kind,
      y: p.y,
      wave: Boolean(p.wave),
      spawnX: p.col * T + T / 2,
    });
  }
  const matchedPlanetIdx = new Set();
  for (const m of planetMarkers) {
    const expectedKind = m.ch === 'Y' ? 'yuri' : 'yumi';
    const idx = planets.findIndex((p, i) => !matchedPlanetIdx.has(i) && p.col === m.col && p.kind === expectedKind);
    if (idx < 0) {
      err(`coerência planetas ${pos(m.col)}: marcador '${m.ch}' (${expectedKind}) sem entrada correspondente em LEVEL7_PLANETS`);
    } else {
      matchedPlanetIdx.add(idx);
    }
  }
  for (let i = 0; i < planets.length; i++) {
    if (!matchedPlanetIdx.has(i)) {
      const p = planets[i];
      err(`coerência planetas ${pos(p.col)}: entrada LEVEL7_PLANETS (${p.kind}) sem marcador '${p.kind === 'yuri' ? 'Y' : 'U'}' na coluna ${p.col}`);
    }
  }
  planets.sort((a, b) => a.col - b.col);

  // Coerência LEVEL7_WAVES
  if (!Array.isArray(WAVES)) {
    err('LEVEL7_WAVES ausente ou não é array');
    return null;
  }
  const waves = [];
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    if (!w || typeof w !== 'object') {
      err(`LEVEL7_WAVES[${i}]: entrada inválida`);
      continue;
    }
    if (!Number.isInteger(w.bar) || w.bar < 50 || w.bar > 61) {
      err(`LEVEL7_WAVES[${i}]: bar=${w.bar} deve ficar no Ato 4 (compassos 50–61; nada no Final 62–65)`);
    }
    if (typeof w.beat !== 'number' || !Number.isFinite(w.beat) || w.beat < 1 || w.beat >= 5) {
      err(`LEVEL7_WAVES[${i}] (c.${w.bar}): beat=${w.beat} inválido (esperado [1, 5))`);
    }
    if (w.kind !== 'ufo' && w.kind !== 'meteor_fire' && w.kind !== 'plasma_orb') {
      err(`LEVEL7_WAVES[${i}] (c.${w.bar}): kind='${w.kind}' inválido`);
      continue;
    }
    if (typeof w.y !== 'number' || !Number.isFinite(w.y) || w.y < SPACE.bounds.minY || w.y > SPACE.bounds.maxY) {
      err(`LEVEL7_WAVES[${i}] (c.${w.bar} t${w.beat}): y=${w.y} fora da área jogável [${SPACE.bounds.minY}, ${SPACE.bounds.maxY}]`);
    }
    const waveCamX = ((w.bar - 1) * BAR + (w.beat - 1) * BEAT) * T;
    const col = Math.floor((waveCamX + SPACE.viewW) / T);
    waves.push({
      id: i,
      bar: w.bar,
      beat: w.beat,
      kind: w.kind,
      y: w.y,
      waveCamX,
      col,
      spawnX: w.kind === 'plasma_orb' ? waveCamX + SPACE.motherScreenX - 24 : waveCamX + SPACE.viewW,
      spawnY: w.y,
      fromWave: true,
    });
  }
  waves.sort((a, b) => a.waveCamX - b.waveCamX);
  if (waves.length === 0) warn('LEVEL7_WAVES está vazio (Ato 4 sem ondas da Nave-Mãe)');

  // R7 — Contagens mínimas
  const minCount = (ch, min, label) => {
    const c = count(ch);
    if (c < min) err(`R7 contagem mínima de '${ch}' (${label}): ${c} < ${min}`);
  };
  minCount('Y', 3, 'Planeta Yuri');
  minCount('U', 3, 'Planeta Yumi');
  if (count('Y') + count('U') < 6) err(`R7 passagens de planeta (Y+U): ${count('Y') + count('U')} < 6`);
  minCount('K', 3, 'checkpoint K');
  minCount('W', 4, 'cápsula de água W');
  minCount('c', 120, 'moedas c');
  for (const ch of ENEMY_CHARS) minCount(ch, 1, LEGEND[ch]);
  for (const ch of OBSTACLE_CHARS) minCount(ch, 1, LEGEND[ch]);

  // Tabela unificada de todas as ameaças (para R2, R4 e simulação)
  const KIND_BY_CHAR = {
    m: 'meteor',
    M: 'meteor_fire',
    g: 'comet_ice',
    u: 'ufo',
    a: 'alien_jet',
    b: 'space_mine',
    s: 'satellite',
    S: 'satellite_beam',
    d: 'space_debris',
    v: 'solar_wind',
    Y: 'yuri',
    U: 'yumi',
  };

  const threats = [];
  for (const m of markers) {
    if (!DANGER_CHARS.includes(m.ch)) continue;
    let kind = KIND_BY_CHAR[m.ch];
    let spawnY = m.spawnY;
    let planetDef = null;
    if (m.ch === 'Y' || m.ch === 'U') {
      planetDef = planets.find((p) => p.col === m.col && p.kind === kind) ?? null;
      if (planetDef) spawnY = planetDef.y;
    }
    const item = {
      ch: m.ch,
      kind,
      col: m.col,
      row: m.row,
      bar: m.bar,
      beat: m.beat,
      spawnX: m.spawnX,
      spawnY,
      planetDef,
      fromWave: false,
    };
    item.iv = computeCamIntervals(item);
    threats.push(item);
  }
  for (const w of waves) {
    const item = {
      ch: w.kind === 'ufo' ? 'u' : w.kind === 'meteor_fire' ? 'M' : 'plasma_orb',
      kind: w.kind,
      col: w.col,
      row: Math.round((w.y - T / 2) / T),
      bar: w.bar,
      beat: w.beat,
      spawnX: w.spawnX,
      spawnY: w.spawnY,
      waveCamX: w.waveCamX,
      fromWave: true,
    };
    item.iv = computeCamIntervals(item);
    threats.push(item);
  }
  threats.sort((a, b) => a.iv.activeStart - b.iv.activeStart || a.col - b.col);

  // R2 — Cada mecânica (m, M, g, u, a, b, s, S, d, v, Y, U) estreia isolada na tela
  for (const ch of DANGER_CHARS) {
    const cands = threats.filter((t) => t.ch === ch).sort((a, b) => a.col - b.col);
    const debut = cands[0];
    if (!debut) continue;
    for (const other of threats) {
      if (other === debut) continue;
      if (intervalsOverlap(debut.iv.activeStart, debut.iv.activeEnd, other.iv.activeStart, other.iv.activeEnd)) {
        err(
          `R2 estreia de '${ch}' (${LEGEND[ch]}) em ${pos(debut.col)} não está isolada: ` +
            `sobrepõe '${other.ch}' (${other.fromWave ? `onda c.${other.bar} t${other.beat}` : pos(other.col)})`,
        );
      }
    }
  }
  // 1º Yuri também precisa de ±2 compassos limpos (§4)
  const yuriThreats = threats.filter((t) => t.ch === 'Y').sort((a, b) => a.col - b.col);
  if (yuriThreats.length > 0) {
    const y1 = yuriThreats[0];
    for (const other of threats) {
      if (other === y1) continue;
      if (Math.abs(other.col - y1.col) < 2 * BAR) {
        err(
          `R2 1º Yuri (${pos(y1.col)}) precisa de ±2 compassos limpos: ` +
            `encontrado '${other.ch}' em ${pos(other.col)} (distância ${Math.abs(other.col - y1.col)} cols < 24)`,
        );
      }
    }
  }

  // R4 / D9 — 1,8 s livres no início [0, 172.8) e após cada K [Kx - 64, Kx - 64 + 172.8)
  const gracePx = SPACE.checkpointGrace * SPACE.scrollSpeed; // 172.8 px
  const checkGrace = (label, gStart, gEnd) => {
    for (const t of threats) {
      // Para planetas checamos também warnStart (telegraph de planeta proibido no grace);
      // para v/S warnStart == activeStart == enterCamX.
      const tStart = t.ch === 'Y' || t.ch === 'U' ? t.iv.warnStart : t.iv.activeStart;
      const tEnd = t.iv.activeEnd;
      if (intervalsOverlap(gStart, gEnd, tStart, tEnd)) {
        const isWarn = (t.ch === 'Y' || t.ch === 'U') && !intervalsOverlap(gStart, gEnd, t.iv.activeStart, tEnd);
        err(
          `R4/D9 grace 1,8 s (${label}): ` +
            `${isWarn ? 'telegraph de ' : ''}'${t.ch}' (${t.fromWave ? `onda c.${t.bar} t${t.beat}` : pos(t.col)}) ` +
            `ativo em camX [${tStart.toFixed(1)}, ${tEnd.toFixed(1)}] ∩ [${gStart.toFixed(1)}, ${gEnd.toFixed(1)}]`,
        );
      }
    }
  };
  checkGrace('início c.01', 0, gracePx);
  const checkpoints = of('K');
  for (let i = 0; i < checkpoints.length; i++) {
    const k = checkpoints[i];
    const startCam = Math.max(0, k.spawnX - SPACE.checkpointCamOffset);
    checkGrace(`checkpoint K#${i + 1} em ${pos(k.col)}`, startCam, startCam + gracePx);
  }

  // R8 — Hologramas 't' só no Embarque (c.1–4) e antes do 1º Yuri
  const firstYuriCol = yuriThreats.length > 0 ? yuriThreats[0].col : Infinity;
  const holos = of('t');
  for (const h of holos) {
    if (h.col >= firstYuriCol) {
      err(`R8 holograma 't' em ${pos(h.col)} aparece após/sobre o 1º Yuri (${pos(firstYuriCol)})`);
    } else if (h.bar > 17) {
      err(`R8 holograma 't' em ${pos(h.col)} fora do Embarque / pré-1º Yuri no Ato 1`);
    }
  }

  return {
    markers,
    of,
    count,
    planets,
    waves,
    threats,
    playerSpawn: ps[0] ?? { col: 4, row: 5, spawnX: 72, spawnY: 88 },
    mothership: ns[0] ?? null,
    checkpoints,
    capsules: of('W'),
    coins: of('c'),
    holos,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. CORREDOR SEGURO (D5 / R3) + VERIFICAÇÃO 60 Hz DE R5 & R6
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

function freeCorridorAt(blockedIntervals) {
  const LO = SPACE.bounds.minY; // 18
  const HI = SPACE.bounds.maxY; // 162
  const clipped = [];
  for (const [a, b] of blockedIntervals) {
    const ca = Math.max(LO, a);
    const cb = Math.min(HI, b);
    if (cb > ca) clipped.push([ca, cb]);
  }
  clipped.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const merged = [];
  for (const iv of clipped) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  let maxGap = 0;
  let bestIv = [LO, HI];
  let cursor = LO;
  for (const [a, b] of merged) {
    if (a - cursor > maxGap) {
      maxGap = a - cursor;
      bestIv = [cursor, a];
    }
    cursor = Math.max(cursor, b);
  }
  if (HI - cursor > maxGap) {
    maxGap = HI - cursor;
    bestIv = [cursor, HI];
  }
  return { maxGap, bestIv };
}

function checkCorridorR5R6(st, cams) {
  const halfPlayerH = SPACE.playerHitbox.h / 2; // 9 px
  const shadowHalf = PLANET_GRAV.rKill + halfPlayerH; // 30 px
  const satellites = st.of('s');
  const debris = st.of('d');
  const beams = st.of('S');
  const winds = st.of('v');

  let minPlanetClearance = Infinity;
  let minClearanceCtx = null;

  let r5Failed = false;
  let r6MaxFailed = false;
  let r6ActFailed = false;
  const r3BadEvents = new Set();

  for (let f = 0; f < cams.length; f++) {
    const camX = cams[f];
    const tSec = f * DT;
    const activePlanets = [];
    const warnPlanets = [];

    for (const p of st.planets) {
      const pr = planetPos(camX, p);
      if (pr.phase === 'active') activePlanets.push({ def: p, pr });
      else if (pr.phase === 'warn') warnPlanets.push({ def: p, pr });
    }

    // R5 — Telegraph de planeta nunca coincide com telegraph de vento solar ou carga de laser
    if (warnPlanets.length > 0 && !r5Failed) {
      for (const w of winds) {
        const wr = solarWindAt(camX, w.spawnX, w.spawnY);
        if (wr.phase === 'warn') {
          r5Failed = true;
          err(
            `R5 ${tSec.toFixed(2)}s (c.${camToBar(camX)}): telegraph de planeta '${warnPlanets[0].def.kind}' (${pos(warnPlanets[0].def.col)}) ` +
              `coincide com telegraph de vento solar '${pos(w.col)}'`,
          );
          break;
        }
      }
      if (!r5Failed) {
        for (const b of beams) {
          const br = beamSatellitePos(camX, b.spawnX, b.spawnY);
          if (br.active && br.beamPhase === 'charge') {
            r5Failed = true;
            err(
              `R5 ${tSec.toFixed(2)}s (c.${camToBar(camX)}): telegraph de planeta '${warnPlanets[0].def.kind}' (${pos(warnPlanets[0].def.col)}) ` +
                `coincide com carga de laser '${pos(b.col)}'`,
            );
            break;
          }
        }
      }
    }

    // R6 — Máx. 2 planetas ativos simultâneos, e 2 simultâneos só nos Atos 3–4 (compasso >= 34)
    if (activePlanets.length > 2 && !r6MaxFailed) {
      r6MaxFailed = true;
      err(
        `R6 ${tSec.toFixed(2)}s (c.${camToBar(camX)}): ${activePlanets.length} planetas ativos simultaneamente (máximo 2)`,
      );
    }
    if (activePlanets.length === 2 && !r6ActFailed) {
      const early = activePlanets.find((ap) => ap.def.bar < 34);
      if (early) {
        r6ActFailed = true;
        err(
          `R6 ${tSec.toFixed(2)}s: 2 planetas simultâneos antes do Ato 3 (${early.def.kind} em ${pos(early.def.col)}, esperado c. >= 34)`,
        );
      }
    }

    if (activePlanets.length === 0) continue;

    // Bloqueios não-planetários ativos na tela neste quadro
    const obstBlocks = [];
    const obstLabels = [];
    for (const s of satellites) {
      const sr = satellitePos(camX, s.spawnX, s.spawnY);
      if (sr.phase === 'active' && sr.screenX >= -SPACE_OBSTACLES.satellite.w / 2) {
        const hh = SPACE_OBSTACLES.satellite.h / 2 + halfPlayerH;
        obstBlocks.push([sr.y - hh, sr.y + hh]);
        obstLabels.push(`'s' ${pos(s.col)}`);
      }
    }
    for (const d of debris) {
      const dr = debrisPos(camX, d.spawnX, d.spawnY);
      if (dr.phase === 'active' && dr.screenX >= -SPACE_OBSTACLES.space_debris.w / 2) {
        const hh = SPACE_OBSTACLES.space_debris.h / 2 + halfPlayerH;
        obstBlocks.push([dr.y - hh, dr.y + hh]);
        obstLabels.push(`'d' ${pos(d.col)}`);
      }
    }
    for (const b of beams) {
      const br = beamSatellitePos(camX, b.spawnX, b.spawnY);
      if (br.active && br.beamPhase === 'fire') {
        obstBlocks.push([br.beamBox.y - halfPlayerH, br.beamBox.y + br.beamBox.h + halfPlayerH]);
        obstLabels.push(`'S'(laser) ${pos(b.col)}`);
      }
    }
    for (const w of winds) {
      const wr = solarWindAt(camX, w.spawnX, w.spawnY);
      if (wr.phase === 'active') {
        obstBlocks.push([wr.yTop - halfPlayerH, wr.yBottom + halfPlayerH]);
        obstLabels.push(`'v' ${pos(w.col)}`);
      }
    }

    // Corredor individual de cada planeta ativo + obstáculos/feixes/ventos
    for (const ap of activePlanets) {
      const blocks = [...obstBlocks, [ap.pr.y - shadowHalf, ap.pr.y + shadowHalf]];
      const { maxGap } = freeCorridorAt(blocks);
      if (maxGap < minPlanetClearance) {
        minPlanetClearance = maxGap;
        minClearanceCtx = { kind: ap.def.kind, col: ap.def.col, tSec, gap: maxGap, obst: obstLabels.join(', ') };
      }
      if (maxGap < PLANET_GRAV.corridorMin) {
        const key = `${ap.def.col}:${obstLabels.join('+')}`;
        if (!r3BadEvents.has(key)) {
          r3BadEvents.add(key);
          err(
            `D5/R3 ${tSec.toFixed(2)}s (c.${camToBar(camX)}): corredor livre de ${maxGap.toFixed(1)} px < ${PLANET_GRAV.corridorMin} px ` +
              `durante '${ap.def.kind}' (${pos(ap.def.col)}, y=${ap.pr.y.toFixed(1)})` +
              (obstLabels.length ? ` bloqueado por ${obstLabels.join(', ')}` : ''),
          );
        }
      }
    }

    // Se 2 planetas ativos estiverem horizontalmente próximos (<= 84 px de distância entre centros),
    // suas faixas verticais de passagem se sobrepõem e a soma combinada precisa manter >= 64 px livres.
    if (activePlanets.length >= 2) {
      const pA = activePlanets[0];
      const pB = activePlanets[1];
      if (Math.abs(pA.pr.screenX - pB.pr.screenX) <= 84) {
        const blocks = [
          ...obstBlocks,
          [pA.pr.y - shadowHalf, pA.pr.y + shadowHalf],
          [pB.pr.y - shadowHalf, pB.pr.y + shadowHalf],
        ];
        const { maxGap } = freeCorridorAt(blocks);
        if (maxGap < minPlanetClearance) {
          minPlanetClearance = maxGap;
          minClearanceCtx = { kind: `${pA.def.kind}+${pB.def.kind}`, col: pA.def.col, tSec, gap: maxGap, obst: obstLabels.join(', ') };
        }
        if (maxGap < PLANET_GRAV.corridorMin) {
          const key = `pair:${pA.def.col}+${pB.def.col}`;
          if (!r3BadEvents.has(key)) {
            r3BadEvents.add(key);
            err(
              `D5/R3 ${tSec.toFixed(2)}s (c.${camToBar(camX)}): dois planetas sobrepostos ('${pA.def.kind}' ${pos(pA.def.col)} e '${pB.def.kind}' ${pos(pB.def.col)}) ` +
                `deixam apenas ${maxGap.toFixed(1)} px de corredor (< ${PLANET_GRAV.corridorMin} px)`,
            );
          }
        }
      }
    }
  }

  return { minPlanetClearance, minClearanceCtx };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. SIMULADOR 60 Hz & BOT 2D COM BUSCA EM FEIXE (§5.3, §5.4, §5.5)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const DIRS = [
  { dx: 0, dy: 0, left: false, right: false, up: false, down: false },
  { dx: 1, dy: 0, left: false, right: true, up: false, down: false },
  { dx: 1, dy: 1, left: false, right: true, up: false, down: true },
  { dx: 0, dy: 1, left: false, right: false, up: false, down: true },
  { dx: -1, dy: 1, left: true, right: false, up: false, down: true },
  { dx: -1, dy: 0, left: true, right: false, up: false, down: false },
  { dx: -1, dy: -1, left: true, right: false, up: true, down: false },
  { dx: 0, dy: -1, left: false, right: false, up: true, down: false },
  { dx: 1, dy: -1, left: false, right: true, up: true, down: false },
];

/** Pré-computa tabelas quadro a quadro para uma linha de tempo `cams` começando em `startCamX`. */
function buildFrameIndex(st, cams) {
  const N = cams.length;
  const planetsAt = Array.from({ length: N }, () => []);
  const planetWarnAt = Array.from({ length: N }, () => []);
  const staticHazardsAt = Array.from({ length: N }, () => []);
  const staticPunchablesAt = Array.from({ length: N }, () => []);
  const capsulesAt = Array.from({ length: N }, () => []);
  const ufoSpawnAt = Array.from({ length: N }, () => []);
  const alienSpawnAt = Array.from({ length: N }, () => []);
  const mineSpawnAt = Array.from({ length: N }, () => []);
  const waveOrbSpawnAt = Array.from({ length: N }, () => []);
  const motherActiveAt = new Uint8Array(N);

  const nEnterCamX = st.mothership ? st.mothership.spawnX - SPACE.viewW : Infinity;
  for (let f = 0; f < N; f++) {
    const camX = cams[f];
    if (camX >= nEnterCamX && camX < SPACE_BRAKE_START_CAM_X) motherActiveAt[f] = 1;
    for (const p of st.planets) {
      const pr = planetPos(camX, p);
      if (pr.phase === 'active') planetsAt[f].push({ id: p.id, cx: pr.screenX, cy: pr.y, kind: p.kind, col: p.col });
      else if (pr.phase === 'warn') planetWarnAt[f].push({ id: p.id, cx: pr.screenX, cy: pr.y, kind: p.kind, col: p.col, warnLeft: pr.warnLeft });
    }
  }

  let nextId = 1;
  const entityMeta = new Map();
  const staticExitF = new Map();

  const frameOfCam = (targetCam) => {
    let lo = 0;
    let hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cams[mid] < targetCam) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // Inimigos estáticos de mapa + ondas (m, M, g)
  const linearItems = [
    ...st.of('m').map((m) => ({ kind: 'meteor', ch: 'm', spawnX: m.spawnX, spawnY: m.spawnY, col: m.col, row: m.row, bar: m.bar, beat: m.beat })),
    ...st.of('M').map((m) => ({ kind: 'meteor_fire', ch: 'M', spawnX: m.spawnX, spawnY: m.spawnY, col: m.col, row: m.row, bar: m.bar, beat: m.beat })),
    ...st.waves.filter((w) => w.kind === 'meteor_fire').map((w) => ({ kind: 'meteor_fire', ch: 'M', spawnX: w.spawnX, spawnY: w.spawnY, col: w.col, row: 5, bar: w.bar, beat: w.beat, fromWave: true })),
    ...st.of('g').map((m) => ({ kind: 'comet_ice', ch: 'g', spawnX: m.spawnX, spawnY: m.spawnY, col: m.col, row: m.row, bar: m.bar, beat: m.beat })),
  ];

  for (const it of linearItems) {
    const id = nextId++;
    entityMeta.set(id, it);
    const spec = SPACE_ENEMIES[it.kind];
    let lastF = -1;
    for (let f = 0; f < N; f++) {
      const camX = cams[f];
      const r = it.kind === 'comet_ice'
        ? cometPos(camX, it.spawnX, it.spawnY, it.row)
        : meteorPos(camX, it.spawnX, it.spawnY, it.kind === 'meteor_fire');
      if (r.phase === 'active' && r.screenX >= -spec.w / 2) {
        if (it.kind === 'comet_ice' && (r.y < -spec.h / 2 || r.y > SPACE.viewH + spec.h / 2)) continue;
        staticPunchablesAt[f].push({
          id,
          kind: it.kind,
          ch: it.ch,
          col: it.col,
          x: r.screenX - spec.w / 2,
          y: r.y - spec.h / 2,
          w: spec.w,
          h: spec.h,
        });
        lastF = f;
      }
    }
    staticExitF.set(id, lastF);
  }

  // Obstáculos estáticos (s, d, S, v)
  for (const s of st.of('s')) {
    const id = nextId++;
    const spec = SPACE_OBSTACLES.satellite;
    for (let f = 0; f < N; f++) {
      const r = satellitePos(cams[f], s.spawnX, s.spawnY);
      if (r.phase === 'active' && r.screenX >= -spec.w / 2) {
        staticHazardsAt[f].push({ id, kind: 'satellite', ch: 's', col: s.col, x: r.screenX - spec.w / 2, y: r.y - spec.h / 2, w: spec.w, h: spec.h });
      }
    }
  }
  for (const d of st.of('d')) {
    const id = nextId++;
    const spec = SPACE_OBSTACLES.space_debris;
    for (let f = 0; f < N; f++) {
      const r = debrisPos(cams[f], d.spawnX, d.spawnY);
      if (r.phase === 'active' && r.screenX >= -spec.w / 2) {
        staticHazardsAt[f].push({ id, kind: 'space_debris', ch: 'd', col: d.col, x: r.screenX - spec.w / 2, y: r.y - spec.h / 2, w: spec.w, h: spec.h });
      }
    }
  }
  for (const b of st.of('S')) {
    const id = nextId++;
    for (let f = 0; f < N; f++) {
      const camX = cams[f];
      const r = beamSatellitePos(camX, b.spawnX, b.spawnY);
      if (!r.active) continue;
      staticHazardsAt[f].push({ id, kind: 'satellite_beam', ch: 'S', col: b.col, x: r.bodyBox.x - camX, y: r.bodyBox.y, w: r.bodyBox.w, h: r.bodyBox.h });
      if (r.beamPhase === 'fire') {
        staticHazardsAt[f].push({ id, kind: 'laser_beam', ch: 'S', col: b.col, x: r.beamBox.x - camX, y: r.beamBox.y, w: r.beamBox.w, h: r.beamBox.h });
      }
    }
  }
  const windWarnAt = Array.from({ length: N }, () => []);
  for (const w of st.of('v')) {
    const id = nextId++;
    for (let f = 0; f < N; f++) {
      const r = solarWindAt(cams[f], w.spawnX, w.spawnY);
      if (r.phase === 'active') {
        staticHazardsAt[f].push({ id, kind: 'solar_wind', ch: 'v', col: w.col, x: 0, y: r.yTop, w: SPACE.viewW, h: SPACE_OBSTACLES.solar_wind.h });
      } else if (r.phase === 'warn') {
        windWarnAt[f].push({ yTop: r.yTop, yBottom: r.yBottom });
      }
    }
  }

  // Cápsulas W (não ferem; coleta por toque ou soco)
  const capsuleInfos = [];
  for (let ci = 0; ci < st.capsules.length; ci++) {
    const cap = st.capsules[ci];
    const spec = SPACE_OBSTACLES.water_capsule;
    let enterF = -1;
    let exitF = -1;
    for (let f = 0; f < N; f++) {
      const sx = cap.spawnX - cams[f];
      if (sx <= SPACE.viewW + spec.w / 2 && sx >= -spec.w / 2) {
        if (enterF < 0) enterF = f;
        exitF = f;
        capsulesAt[f].push({ ci, x: sx - spec.w / 2, y: cap.spawnY - spec.h / 2, w: spec.w, h: spec.h, spawnY: cap.spawnY });
      }
    }
    capsuleInfos.push({ ci, col: cap.col, row: cap.row, spawnX: cap.spawnX, spawnY: cap.spawnY, enterF, exitF });
  }

  // Reativos: UFOs (mapa + ondas), Aliens (a), Minas (b), Wave plasma_orb
  const ufoSources = [
    ...st.of('u').map((m) => ({ spawnX: m.spawnX, spawnY: m.spawnY, col: m.col, bar: m.bar })),
    ...st.waves.filter((w) => w.kind === 'ufo').map((w) => ({ spawnX: w.spawnX, spawnY: w.spawnY, col: w.col, bar: w.bar, fromWave: true })),
  ];
  for (const u of ufoSources) {
    const id = nextId++;
    const spec = SPACE_ENEMIES.ufo;
    const enterCamX = u.spawnX - SPACE.viewW;
    if (cams[N - 1] < enterCamX) continue;
    let enterF = -1;
    let exitF = -1;
    const positions = new Map();
    for (let f = frameOfCam(enterCamX); f < N; f++) {
      const r = ufoPos(cams[f], u.spawnX, u.spawnY);
      if (r.phase === 'active' && r.screenX >= -spec.w / 2) {
        if (enterF < 0) enterF = f;
        exitF = f;
        positions.set(f, { sx: r.screenX, y: r.y });
      } else if (enterF >= 0) break;
    }
    if (enterF >= 0) {
      ufoSpawnAt[enterF].push({ id, col: u.col, bar: u.bar, exitF, positions });
    }
  }

  for (const a of st.of('a')) {
    const id = nextId++;
    const enterCamX = a.spawnX - SPACE.viewW;
    if (cams[N - 1] < enterCamX) continue;
    const f0 = frameOfCam(enterCamX);
    // Só spawna se ainda não tiver cruzado a tela ao iniciar (em checkpoints, R4 garante isso)
    if (cams[0] <= a.spawnX) {
      alienSpawnAt[f0].push({ id, col: a.col, bar: a.bar, spawnY: a.spawnY });
    }
  }

  for (const b of st.of('b')) {
    const id = nextId++;
    const spec = SPACE_ENEMIES.space_mine;
    const enterCamX = b.spawnX - SPACE.viewW - spec.w / 2;
    const exitCamX = b.spawnX + spec.w / 2;
    if (cams[N - 1] < enterCamX || cams[0] > exitCamX) continue;
    const f0 = cams[0] >= enterCamX ? 0 : frameOfCam(enterCamX);
    const f1 = frameOfCam(exitCamX);
    mineSpawnAt[f0].push({ id, col: b.col, bar: b.bar, spawnX: b.spawnX, spawnY: b.spawnY, exitF: f1 });
  }

  for (const w of st.waves) {
    if (w.kind !== 'plasma_orb') continue;
    if (cams[N - 1] < w.waveCamX || cams[0] > w.waveCamX + 120) continue;
    const f0 = cams[0] >= w.waveCamX ? 0 : frameOfCam(w.waveCamX);
    waveOrbSpawnAt[f0].push({
      id: nextId++,
      col: w.col,
      bar: w.bar,
      worldX: w.waveCamX + SPACE.motherScreenX - 24,
      y: w.y,
    });
  }

  // Flag rápida por quadro: existe algo socável próximo? (poda ações de soco quando desnecessário)
  const hasPunchTargetNear = new Uint8Array(N);
  for (let f = 0; f < N; f++) {
    if (staticPunchablesAt[f].length > 0 || capsulesAt[f].length > 0 || ufoSpawnAt[f].length > 0 || alienSpawnAt[f].length > 0 || mineSpawnAt[f].length > 0 || waveOrbSpawnAt[f].length > 0) {
      for (let k = Math.max(0, f - 12); k <= Math.min(N - 1, f + 6); k++) hasPunchTargetNear[k] = 1;
    }
  }

  return {
    N,
    cams,
    planetsAt,
    planetWarnAt,
    staticHazardsAt,
    staticPunchablesAt,
    capsulesAt,
    capsuleInfos,
    windWarnAt,
    ufoSpawnAt,
    alienSpawnAt,
    mineSpawnAt,
    waveOrbSpawnAt,
    motherActiveAt,
    staticExitF,
    hasPunchTargetNear,
  };
}

/** Clona um estado de busca. */
function cloneSimState(s) {
  const ufos = s.ufos.length === 0 ? [] : s.ufos.map((u) => ({
    id: u.id, col: u.col, exitF: u.exitF, positions: u.positions,
    state: { phase: u.state.phase, chargeTimer: u.state.chargeTimer }, dead: u.dead,
  }));
  const aliens = s.aliens.length === 0 ? [] : s.aliens.map((a) => ({
    id: a.id, col: a.col,
    state: { phase: a.state.phase, sx: a.state.sx, sy: a.state.sy, vy: a.state.vy, lockTimer: a.state.lockTimer }, dead: a.dead,
  }));
  const mines = s.mines.length === 0 ? [] : s.mines.map((m) => ({
    id: m.id, col: m.col, spawnX: m.spawnX, spawnY: m.spawnY, exitF: m.exitF,
    state: { phase: m.state.phase, timer: m.state.timer }, dead: m.dead,
  }));
  const orbs = s.orbs.length === 0 ? [] : s.orbs.map((o) => ({ id: o.id, col: o.col, worldX: o.worldX, y: o.y, dead: o.dead }));
  return {
    player: {
      sx: s.player.sx, sy: s.player.sy, vx: s.player.vx, vy: s.player.vy,
      boostTimer: s.player.boostTimer, boostCd: s.player.boostCd, punchTimer: s.player.punchTimer,
      lastDirX: s.player.lastDirX, lastDirY: s.player.lastDirY,
    },
    deadIds: s.deadIds.length === 0 ? [] : s.deadIds.slice(),
    ufos,
    aliens,
    mines,
    orbs,
    capsules: s.capsules.length === 0 ? [] : s.capsules.slice(),
    minDistToRKill: s.minDistToRKill,
    minDistCtx: s.minDistCtx,
    punches: s.punches,
    boosts: s.boosts,
    score: s.score,
  };
}

/**
 * Avança 1 quadro (60 Hz) mutando `st` in-place.
 * Retorna `null` se sobreviveu, ou `{ kind: 'grav' | 'hurt', culprit }` se morreu/sofreu dano.
 */
function advanceOneFrame(idx, f, st, input, simOpts, ignoreDamage = false) {
  const camX = idx.cams[f];

  // Spawn de entidades reativas que entram neste quadro
  const uSpawns = idx.ufoSpawnAt[f];
  for (let i = 0; i < uSpawns.length; i++) {
    const u = uSpawns[i];
    if (!st.ufos.some((x) => x.id === u.id)) {
      st.ufos.push({ id: u.id, col: u.col, exitF: u.exitF, positions: u.positions, state: { phase: 'patrol', chargeTimer: 0 }, dead: false });
    }
  }
  const aSpawns = idx.alienSpawnAt[f];
  for (let i = 0; i < aSpawns.length; i++) {
    const a = aSpawns[i];
    if (!st.aliens.some((x) => x.id === a.id)) {
      st.aliens.push({
        id: a.id,
        col: a.col,
        state: { phase: 'approach', sx: SPACE.viewW + SPACE_ENEMIES.alien_jet.w / 2, sy: a.spawnY, vy: 0, lockTimer: 0 },
        dead: false,
      });
    }
  }
  const mSpawns = idx.mineSpawnAt[f];
  for (let i = 0; i < mSpawns.length; i++) {
    const m = mSpawns[i];
    if (!st.mines.some((x) => x.id === m.id)) {
      st.mines.push({
        id: m.id,
        col: m.col,
        spawnX: m.spawnX,
        spawnY: m.spawnY,
        exitF: m.exitF,
        state: { phase: 'idle', timer: 0 },
        dead: false,
      });
    }
  }
  const oSpawns = idx.waveOrbSpawnAt[f];
  for (let i = 0; i < oSpawns.length; i++) {
    const o = oSpawns[i];
    if (!st.orbs.some((x) => x.id === o.id)) {
      st.orbs.push({ id: o.id, col: o.col, worldX: o.worldX, y: o.y, dead: false });
    }
  }

  // Passo do Pardo
  const planetsNow = idx.planetsAt[f];
  const res = stepPlayerSpace(st.player, input, DT, planetsNow, {
    motherActive: idx.motherActiveAt[f] === 1,
    thrustScale: simOpts.thrustScale(camX),
    allowBoost: simOpts.allowBoost(camX),
  });

  if (res.boostTriggered) st.boosts++;
  if (res.punchTriggered) st.punches++;

  for (let i = 0; i < planetsNow.length; i++) {
    const pl = planetsNow[i];
    const d = Math.hypot(st.player.sx - pl.cx, st.player.sy - pl.cy);
    if (d < st.minDistToRKill) {
      st.minDistToRKill = d;
      st.minDistCtx = { kind: pl.kind, col: pl.col, f };
    }
  }

  if (res.gravKilled && !ignoreDamage) {
    const killedPl = planetsNow[res.killedByPlanet];
    return { kind: 'grav', culprit: killedPl ? `${killedPl.kind} ${pos(killedPl.col)}` : 'planeta' };
  }

  // Passo dos reativos
  const orbSpec = SPACE_ENEMIES.plasma_orb;
  for (let i = 0; i < st.orbs.length; i++) {
    const o = st.orbs[i];
    if (o.dead) continue;
    o.worldX -= orbSpec.speed * DT;
    if (o.worldX - camX < -orbSpec.w / 2) o.dead = true;
  }

  const ufoSpec = SPACE_ENEMIES.ufo;
  for (let i = 0; i < st.ufos.length; i++) {
    const u = st.ufos[i];
    if (u.dead) continue;
    const p = u.positions.get(f);
    if (!p) { u.dead = true; continue; }
    if (ufoShouldFire(u.state, p.sx, st.player.sx, DT)) {
      st.orbs.push({ id: -1, col: u.col, worldX: camX + p.sx - 10, y: p.y, dead: false });
    }
  }

  const alienSpec = SPACE_ENEMIES.alien_jet;
  for (let i = 0; i < st.aliens.length; i++) {
    const a = st.aliens[i];
    if (a.dead) continue;
    alienJetStep(a.state, st.player.sx, st.player.sy, DT);
    if (a.state.sx < -alienSpec.w / 2) a.dead = true;
  }

  const mineSpec = SPACE_ENEMIES.space_mine;
  for (let i = 0; i < st.mines.length; i++) {
    const m = st.mines[i];
    if (m.dead) continue;
    if (f > m.exitF) { m.dead = true; continue; }
    mineStep(m.state, m.spawnX, m.spawnY, camX + st.player.sx, st.player.sy, DT);
  }

  // 1) Soco antes do toque (mesma ordem de game.ts)
  const pBox = spacePunchBox(st.player, 0);
  if (pBox) {
    const sPunch = idx.staticPunchablesAt[f];
    for (let i = 0; i < sPunch.length; i++) {
      const sp = sPunch[i];
      if (!st.deadIds.includes(sp.id) && overlaps(pBox, sp)) st.deadIds.push(sp.id);
    }
    for (let i = 0; i < st.ufos.length; i++) {
      const u = st.ufos[i];
      if (u.dead) continue;
      const p = u.positions.get(f);
      if (!p) continue;
      if (
        pBox.x < p.sx + ufoSpec.w / 2 && pBox.x + pBox.w > p.sx - ufoSpec.w / 2 &&
        pBox.y < p.y + ufoSpec.h / 2 && pBox.y + pBox.h > p.y - ufoSpec.h / 2
      ) u.dead = true;
    }
    for (let i = 0; i < st.aliens.length; i++) {
      const a = st.aliens[i];
      if (a.dead) continue;
      if (
        pBox.x < a.state.sx + alienSpec.w / 2 && pBox.x + pBox.w > a.state.sx - alienSpec.w / 2 &&
        pBox.y < a.state.sy + alienSpec.h / 2 && pBox.y + pBox.h > a.state.sy - alienSpec.h / 2
      ) a.dead = true;
    }
    for (let i = 0; i < st.orbs.length; i++) {
      const o = st.orbs[i];
      if (o.dead) continue;
      const ox = o.worldX - camX;
      if (
        pBox.x < ox + orbSpec.w / 2 && pBox.x + pBox.w > ox - orbSpec.w / 2 &&
        pBox.y < o.y + orbSpec.h / 2 && pBox.y + pBox.h > o.y - orbSpec.h / 2
      ) o.dead = true;
    }
    for (let i = 0; i < st.mines.length; i++) {
      const m = st.mines[i];
      if (m.dead) continue;
      const mx = m.spawnX - camX;
      if (
        pBox.x < mx + mineSpec.w / 2 && pBox.x + pBox.w > mx - mineSpec.w / 2 &&
        pBox.y < m.spawnY + mineSpec.h / 2 && pBox.y + pBox.h > m.spawnY - mineSpec.h / 2
      ) {
        if (m.state.phase !== 'armed') m.dead = true;
        else if (!ignoreDamage) return { kind: 'hurt', culprit: `mina armada 'b' ${pos(m.col)}` };
      }
    }
    const caps = idx.capsulesAt[f];
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i];
      if (!st.capsules.includes(cap.ci) && overlaps(pBox, cap)) st.capsules.push(cap.ci);
    }
  }

  // 2) Contatos
  const px0 = st.player.sx - SPACE.playerHitbox.w / 2;
  const py0 = st.player.sy - SPACE.playerHitbox.h / 2;
  const px1 = px0 + SPACE.playerHitbox.w;
  const py1 = py0 + SPACE.playerHitbox.h;

  const caps = idx.capsulesAt[f];
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    if (!st.capsules.includes(cap.ci) && px0 < cap.x + cap.w && px1 > cap.x && py0 < cap.y + cap.h && py1 > cap.y) {
      st.capsules.push(cap.ci);
    }
  }
  if (!ignoreDamage) {
    const sHaz = idx.staticHazardsAt[f];
    for (let i = 0; i < sHaz.length; i++) {
      const h = sHaz[i];
      if (px0 < h.x + h.w && px1 > h.x && py0 < h.y + h.h && py1 > h.y) {
        return { kind: 'hurt', culprit: `${h.kind} ('${h.ch}') ${pos(h.col)}` };
      }
    }
    const sPunch = idx.staticPunchablesAt[f];
    for (let i = 0; i < sPunch.length; i++) {
      const sp = sPunch[i];
      if (!st.deadIds.includes(sp.id) && px0 < sp.x + sp.w && px1 > sp.x && py0 < sp.y + sp.h && py1 > sp.y) {
        return { kind: 'hurt', culprit: `${sp.kind} ('${sp.ch}') ${pos(sp.col)}` };
      }
    }
    for (let i = 0; i < st.ufos.length; i++) {
      const u = st.ufos[i];
      if (u.dead) continue;
      const p = u.positions.get(f);
      if (p && px0 < p.sx + ufoSpec.w / 2 && px1 > p.sx - ufoSpec.w / 2 && py0 < p.y + ufoSpec.h / 2 && py1 > p.y - ufoSpec.h / 2) {
        return { kind: 'hurt', culprit: `ufo ('u') ${pos(u.col)}` };
      }
    }
    for (let i = 0; i < st.aliens.length; i++) {
      const a = st.aliens[i];
      if (!a.dead && px0 < a.state.sx + alienSpec.w / 2 && px1 > a.state.sx - alienSpec.w / 2 && py0 < a.state.sy + alienSpec.h / 2 && py1 > a.state.sy - alienSpec.h / 2) {
        return { kind: 'hurt', culprit: `alien_jet ('a') ${pos(a.col)}` };
      }
    }
    for (let i = 0; i < st.orbs.length; i++) {
      const o = st.orbs[i];
      if (o.dead) continue;
      const ox = o.worldX - camX;
      if (px0 < ox + orbSpec.w / 2 && px1 > ox - orbSpec.w / 2 && py0 < o.y + orbSpec.h / 2 && py1 > o.y - orbSpec.h / 2) {
        return { kind: 'hurt', culprit: `plasma_orb ${pos(o.col)}` };
      }
    }
    for (let i = 0; i < st.mines.length; i++) {
      const m = st.mines[i];
      if (m.dead) continue;
      const mx = m.spawnX - camX;
      if (px0 < mx + mineSpec.w / 2 && px1 > mx - mineSpec.w / 2 && py0 < m.spawnY + mineSpec.h / 2 && py1 > m.spawnY - mineSpec.h / 2) {
        return { kind: 'hurt', culprit: `space_mine ('b') ${pos(m.col)}` };
      }
    }
  }

  // Poda referências expiradas do estado
  if (st.deadIds.length > 0) st.deadIds = st.deadIds.filter((id) => (idx.staticExitF.get(id) ?? -1) > f);
  if (st.ufos.length > 0) st.ufos = st.ufos.filter((u) => !u.dead && u.exitF > f);
  if (st.aliens.length > 0) st.aliens = st.aliens.filter((a) => !a.dead);
  if (st.mines.length > 0) st.mines = st.mines.filter((m) => !m.dead && m.exitF > f);
  if (st.orbs.length > 0) st.orbs = st.orbs.filter((o) => !o.dead);

  return null;
}

/** Heurística de avaliação do estado no quadro `f` (quanto maior, melhor). */
function scoreState(idx, f, st, guideTarget) {
  const { sx, sy, vx, vy, boostCd } = st.player;
  const camX = idx.cams[f];
  let sc = 0;

  // Preferência suave por posição neutra (sx ~ 90, sy ~ 90) e estabilidade
  sc -= 0.08 * Math.abs(sx - 90) + 0.04 * Math.abs(sy - 90);
  sc -= 0.004 * (Math.abs(vx) + Math.abs(vy));
  if (boostCd <= 0) sc += 1.2;

  // Planetas ativos e em aviso (lookahead de 1.2s)
  const pls = idx.planetsAt[f];
  for (let i = 0; i < pls.length; i++) {
    const pl = pls[i];
    const d = Math.hypot(sx - pl.cx, sy - pl.cy);
    if (d < PLANET_GRAV.rGrav) {
      const margin = d - PLANET_GRAV.rKill;
      if (margin < 24) sc -= (24 - margin) * 6;
      else sc -= (PLANET_GRAV.rGrav - d) * 0.25;
    }
    if (pl.cx > sx - 32) {
      const urg = Math.max(0.2, 1 - Math.max(0, pl.cx - sx) / 260);
      if (pl.cy < 90 && sy < pl.cy + 38) sc -= (pl.cy + 38 - sy) * 1.4 * urg;
      else if (pl.cy >= 90 && sy > pl.cy - 38) sc -= (sy - (pl.cy - 38)) * 1.4 * urg;
    }
  }
  const pws = idx.planetWarnAt[f];
  for (let i = 0; i < pws.length; i++) {
    const pw = pws[i];
    if (pw.cy < 90 && sy < pw.cy + 36) sc -= (pw.cy + 36 - sy) * 0.4;
    else if (pw.cy >= 90 && sy > pw.cy - 36) sc -= (sy - (pw.cy - 36)) * 0.4;
  }

  // Vento solar em aviso
  const wws = idx.windWarnAt[f];
  for (let i = 0; i < wws.length; i++) {
    const w = wws[i];
    const yc = (w.yTop + w.yBottom) / 2;
    const half = (w.yBottom - w.yTop) / 2 + 13;
    if (Math.abs(sy - yc) < half) sc -= (half - Math.abs(sy - yc)) * 2.5;
  }

  // Lookahead curto para obstáculos rígidos/feixes próximos na tela
  const sHaz = idx.staticHazardsAt[f];
  for (let i = 0; i < sHaz.length; i++) {
    const h = sHaz[i];
    if (h.kind === 'laser_beam') continue;
    const hx = h.x + h.w / 2;
    const hy = h.y + h.h / 2;
    if (hx > sx - 12 && hx < sx + 110) {
      const dy = Math.abs(sy - hy);
      const safeY = h.h / 2 + 15;
      if (dy < safeY) sc -= (safeY - dy) * 0.6;
    }
  }
  const sPunch = idx.staticPunchablesAt[f];
  for (let i = 0; i < sPunch.length; i++) {
    const sp = sPunch[i];
    if (st.deadIds.includes(sp.id)) continue;
    const spx = sp.x + sp.w / 2;
    const spy = sp.y + sp.h / 2;
    if (spx > sx - 8 && spx < sx + 90) {
      const dy = Math.abs(sy - spy);
      const safeY = sp.h / 2 + 12;
      if (dy < safeY) sc -= (safeY - dy) * 0.35;
    }
  }
  for (let i = 0; i < st.orbs.length; i++) {
    const o = st.orbs[i];
    if (o.dead) continue;
    const ox = o.worldX - camX;
    if (ox > sx - 8 && ox < sx + 120 && Math.abs(sy - o.y) < 16) {
      sc -= (16 - Math.abs(sy - o.y)) * 1.5;
    }
  }

  // Objetivo guiado de cápsula W (quando verificando alcançabilidade de uma gota específica)
  if (guideTarget) {
    if (st.capsules.includes(guideTarget.ci)) {
      sc += 2500;
    } else {
      const wsx = guideTarget.spawnX - camX;
      if (wsx >= -8 && wsx <= SPACE.viewW + 48) {
        const targetX = Math.max(SPACE.bounds.minX, Math.min(SPACE.motherMaxX, wsx - 6));
        const d = Math.hypot(sx - targetX, sy - guideTarget.spawnY);
        sc -= d * 1.8;
      }
    }
  }

  return sc;
}

/** Chave espacial para desduplicação do feixe. */
function stateBucketKey(st, guideTarget) {
  const { sx, sy, vx, vy, boostCd, punchTimer } = st.player;
  const qx = Math.round(sx / 10);
  const qy = Math.round(sy / 8);
  const qvx = Math.round(vx / 40);
  const qvy = Math.round(vy / 40);
  const br = boostCd <= 0 ? 1 : 0;
  const pr = punchTimer <= 0 ? 1 : 0;
  const capBit = guideTarget && st.capsules.includes(guideTarget.ci) ? 1 : 0;
  const dKey = st.deadIds.length ? st.deadIds.slice(-2).join(',') : '';
  const hasOrb = st.orbs.length;
  const alienQ = st.aliens.length > 0 ? Math.round(st.aliens[0].state.sy / 20) : 0;
  return `${qx}|${qy}|${qvx}|${qvy}|${br}|${pr}|${capBit}|${hasOrb}|${alienQ}|${dKey}`;
}

/** Poda ações de acordo com cooldowns e presença de alvos/ameaças no horizonte curto. */
function candidateActions(idx, f, st, simOpts, allowGuide) {
  const camX = idx.cams[f];
  const allowBoost = simOpts.allowBoost(camX) && st.player.boostCd <= 0;
  const canPunch = st.player.punchTimer <= 0;

  let hasPunchTarget = false;
  if (canPunch && (idx.hasPunchTargetNear[f] || st.orbs.length > 0 || st.aliens.length > 0 || st.ufos.length > 0 || st.mines.length > 0)) {
    const sx = st.player.sx;
    const sy = st.player.sy;
    const sPunch = idx.staticPunchablesAt[f];
    for (let i = 0; i < sPunch.length; i++) {
      const sp = sPunch[i];
      if (!st.deadIds.includes(sp.id) && sp.x + sp.w > sx - 6 && sp.x < sx + 55 && Math.abs(sp.y + sp.h / 2 - sy) < 34) {
        hasPunchTarget = true;
        break;
      }
    }
    if (!hasPunchTarget && allowGuide) {
      const caps = idx.capsulesAt[f];
      for (let i = 0; i < caps.length; i++) {
        const cap = caps[i];
        if (!st.capsules.includes(cap.ci) && cap.x + cap.w > sx - 6 && cap.x < sx + 48 && Math.abs(cap.spawnY - sy) < 32) {
          hasPunchTarget = true;
          break;
        }
      }
    }
    if (!hasPunchTarget) {
      for (let i = 0; i < st.ufos.length; i++) {
        const u = st.ufos[i];
        const p = u.positions.get(f);
        if (!u.dead && p && p.sx > sx - 6 && p.sx < sx + 55 && Math.abs(p.y - sy) < 38) { hasPunchTarget = true; break; }
      }
    }
    if (!hasPunchTarget) {
      for (let i = 0; i < st.aliens.length; i++) {
        const a = st.aliens[i];
        if (!a.dead && a.state.sx > sx - 6 && a.state.sx < sx + 55 && Math.abs(a.state.sy - sy) < 34) { hasPunchTarget = true; break; }
      }
    }
    if (!hasPunchTarget) {
      for (let i = 0; i < st.orbs.length; i++) {
        const o = st.orbs[i];
        const ox = o.worldX - camX;
        if (!o.dead && ox > sx - 6 && ox < sx + 68 && Math.abs(o.y - sy) < 28) { hasPunchTarget = true; break; }
      }
    }
    if (!hasPunchTarget) {
      for (let i = 0; i < st.mines.length; i++) {
        const m = st.mines[i];
        const mx = m.spawnX - camX;
        if (!m.dead && m.state.phase === 'idle' && mx > sx - 6 && mx < sx + 50 && Math.abs(m.spawnY - sy) < 30) {
          hasPunchTarget = true;
          break;
        }
      }
    }
  }

  let boostWorth = false;
  if (allowBoost) {
    // Só testa boost quando há planeta próximo, vento em aviso, orb perto ou janela guiada apertada
    const pls = idx.planetsAt[f];
    for (let i = 0; i < pls.length; i++) {
      if (Math.hypot(st.player.sx - pls[i].cx, st.player.sy - pls[i].cy) < PLANET_GRAV.rGrav) {
        boostWorth = true;
        break;
      }
    }
    if (!boostWorth && (idx.windWarnAt[f].length > 0 || st.orbs.length > 0 || allowGuide)) {
      boostWorth = true;
    }
  }

  const actions = [];
  for (let d = 0; d < DIRS.length; d++) actions.push({ d, aux: 0 });
  if (hasPunchTarget) {
    actions.push({ d: 0, aux: 2 }, { d: 7, aux: 2 }, { d: 3, aux: 2 }, { d: 1, aux: 2 }, { d: 5, aux: 2 });
  }
  if (boostWorth) {
    // 4 direções cardeais para escape rápido (cima, baixo, frente, trás)
    actions.push({ d: 1, aux: 1 }, { d: 3, aux: 1 }, { d: 5, aux: 1 }, { d: 7, aux: 1 });
  }
  return actions;
}

/** Poda do feixe mantendo diversidade em faixas Y + melhores globais. */
function pruneBeam(candidates, width) {
  if (candidates.length <= width) return candidates;
  const bands = [[], [], [], [], [], []];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const b = Math.min(5, Math.max(0, Math.floor((c.player.sy - SPACE.bounds.minY) / 24)));
    bands[b].push(c);
  }
  const chosen = new Set();
  for (let i = 0; i < 6; i++) {
    const band = bands[i];
    if (band.length === 0) continue;
    band.sort((a, b) => b.score - a.score);
    for (let j = 0; j < Math.min(2, band.length); j++) chosen.add(band[j]);
  }
  if (chosen.size < width) {
    candidates.sort((a, b) => b.score - a.score);
    for (let i = 0; i < candidates.length && chosen.size < width; i++) {
      chosen.add(candidates[i]);
    }
  }
  return [...chosen];
}

/**
 * Executa a busca em feixe sobre `[startF, endF]`.
 * Salva snapshots para backtrack/retry automático se o feixe esvaziar.
 */
function runBeamSearch(idx, initialBeam, startF, endF, simOpts, opts = {}) {
  const beamWidth = opts.beamWidth ?? 24;
  const chunkBase = opts.chunkSize ?? 6;
  const guideTarget = opts.guideTarget ?? null;
  const recordSnaps = opts.recordSnaps ?? false;
  const continueOnFail = opts.continueOnFail ?? true;

  const snaps = new Map();
  const fails = [];
  let beam = initialBeam.map((s) => cloneSimState(s));
  for (const s of beam) s.score = scoreState(idx, startF, s, guideTarget);

  let f = startF;
  let invulnUntil = -1;
  const history = [];

  while (f < endF) {
    if (recordSnaps && f % 60 === 0) {
      snaps.set(f, beam.map((s) => cloneSimState(s)));
    }
    if (!opts.isRetry) {
      history.push({ f, beam: beam.map((s) => cloneSimState(s)) });
      if (history.length > 10) history.shift();
    }

    const stepSize = Math.min(chunkBase, endF - f);
    const ignoreDamage = f <= invulnUntil;
    const buckets = new Map();
    const stepCulprits = new Set();

    for (let bi = 0; bi < beam.length; bi++) {
      const st = beam[bi];
      const acts = candidateActions(idx, f, st, simOpts, Boolean(guideTarget));
      for (let ai = 0; ai < acts.length; ai++) {
        const act = acts[ai];
        const dir = DIRS[act.d];
        const child = cloneSimState(st);
        let dead = false;

        for (let k = 0; k < stepSize; k++) {
          const inp = {
            left: dir.left,
            right: dir.right,
            up: dir.up,
            down: dir.down,
            boost: k === 0 && act.aux === 1,
            punch: k === 0 && act.aux === 2,
          };
          const hit = advanceOneFrame(idx, f + k, child, inp, simOpts, ignoreDamage);
          if (hit) {
            stepCulprits.add(`${hit.kind === 'grav' ? 'GRAVIDADE ' : ''}${hit.culprit}`);
            dead = true;
            break;
          }
        }
        if (dead) continue;

        const nf = f + stepSize;
        child.score = scoreState(idx, nf, child, guideTarget);
        const key = stateBucketKey(child, guideTarget);
        const prev = buckets.get(key);
        if (!prev || child.score > prev.score) buckets.set(key, child);
      }
    }

    let nextBeam = pruneBeam([...buckets.values()], beamWidth);

    // Retry local com feixe mais largo e passo fino (3 quadros) se zerou em trecho difícil
    if (nextBeam.length === 0 && !ignoreDamage && !opts.isRetry && history.length >= 2) {
      const back = history[0];
      const retryEnd = Math.min(endF, f + 36);
      const retryRes = runBeamSearch(idx, back.beam, back.f, retryEnd, simOpts, {
        beamWidth: 72,
        chunkSize: 3,
        guideTarget,
        recordSnaps: false,
        continueOnFail: false,
        isRetry: true,
      });
      if (retryRes.fails.length === 0 && retryRes.beam.length > 0) {
        beam = retryRes.beam;
        f = retryEnd;
        continue;
      }
    }

    if (nextBeam.length === 0) {
      if (!continueOnFail) {
        return { beam: [], fails: [{ f, camX: idx.cams[f], culprits: [...stepCulprits] }], snaps };
      }
      fails.push({ f, camX: idx.cams[f], culprits: [...stepCulprits] });
      invulnUntil = f + Math.round(SPACE.invuln * HZ);
      const fallbackBuckets = new Map();
      for (let bi = 0; bi < beam.length; bi++) {
        const child = cloneSimState(beam[bi]);
        let gravHit = false;
        for (let k = 0; k < stepSize; k++) {
          const inp = { left: false, right: false, up: false, down: false, boost: false, punch: false };
          const hit = advanceOneFrame(idx, f + k, child, inp, simOpts, true);
          if (hit) { gravHit = true; break; }
        }
        if (!gravHit) {
          child.score = scoreState(idx, f + stepSize, child, guideTarget);
          fallbackBuckets.set(stateBucketKey(child, guideTarget), child);
        }
      }
      nextBeam = pruneBeam([...fallbackBuckets.values()], beamWidth);
      if (nextBeam.length === 0) {
        const resetSt = cloneSimState(beam[0]);
        resetSt.player = createSpacePlayerState(SPACE.respawnScreenX, SPACE.respawnScreenY);
        nextBeam = [resetSt];
      }
    }

    beam = nextBeam;
    f += stepSize;
  }

  return { beam, fails, snaps };
}

function initialSimState(sx, sy) {
  return {
    player: createSpacePlayerState(sx, sy),
    deadIds: [],
    ufos: [],
    aliens: [],
    mines: [],
    orbs: [],
    capsules: [],
    minDistToRKill: Infinity,
    minDistCtx: null,
    punches: 0,
    boosts: 0,
    score: 0,
  };
}

/** Menor janela de reação (s) de todas as ameaças do mapa e ondas até alcançar o jogador / ativar. */
function computeMinReactionWindow(st) {
  let minT = Infinity;
  let minCtx = null;
  const record = (t, label) => {
    if (t < minT) { minT = t; minCtx = { t, label }; }
  };

  for (const t of st.threats) {
    if (t.kind === 'yuri' || t.kind === 'yumi') {
      // Tempo do início do aviso até borda externa do campo gravitacional (ou centro em sx=90)
      const dt = PLANET_GRAV.warnT + (SPACE.viewW + PLANET_GRAV.radius - 90 - PLANET_GRAV.rGrav) / PLANET_GRAV.speed;
      record(dt, `'${t.ch}' ${pos(t.col)}`);
    } else if (t.kind === 'solar_wind') {
      record(SPACE_OBSTACLES.solar_wind.warnT, `'v' ${pos(t.col)}`);
    } else if (t.kind === 'satellite_beam') {
      record(SPACE_OBSTACLES.satellite_beam.chargeT, `'S' ${pos(t.col)}`);
    } else if (t.kind === 'meteor_fire') {
      const sp = SPACE_ENEMIES.meteor_fire;
      const dt = sp.warnT + (SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed);
      record(dt, `'M' ${t.fromWave ? `onda c.${t.bar} t${t.beat}` : pos(t.col)}`);
    } else if (t.kind === 'comet_ice') {
      const sp = SPACE_ENEMIES.comet_ice;
      const dt = sp.warnT + (SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed * Math.SQRT1_2);
      record(dt, `'g' ${pos(t.col)}`);
    } else if (t.kind === 'meteor') {
      const sp = SPACE_ENEMIES.meteor;
      record((SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed), `'m' ${pos(t.col)}`);
    } else if (t.kind === 'ufo') {
      const sp = SPACE_ENEMIES.ufo;
      record((SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed), `'u' ${t.fromWave ? `onda c.${t.bar} t${t.beat}` : pos(t.col)}`);
    } else if (t.kind === 'plasma_orb') {
      const sp = SPACE_ENEMIES.plasma_orb;
      record((SPACE.motherScreenX - 24 - 95) / (SPACE.scrollSpeed + sp.speed), `plasma_orb onda c.${t.bar} t${t.beat}`);
    } else if (t.kind === 'satellite') {
      const sp = SPACE_OBSTACLES.satellite;
      record((SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed), `'s' ${pos(t.col)}`);
    } else if (t.kind === 'space_debris') {
      const sp = SPACE_OBSTACLES.space_debris;
      record((SPACE.viewW + sp.w / 2 - 95) / (SPACE.scrollSpeed + sp.speed), `'d' ${pos(t.col)}`);
    } else if (t.kind === 'space_mine') {
      record((SPACE.viewW - 95) / SPACE.scrollSpeed, `'b' ${pos(t.col)}`);
    } else if (t.kind === 'alien_jet') {
      const sp = SPACE_ENEMIES.alien_jet;
      const dt = (SPACE.viewW + sp.w / 2 - (90 + sp.lockDist)) / sp.speed + sp.lockT;
      record(dt, `'a' ${pos(t.col)}`);
    }
  }
  return { minT, minCtx };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. EXECUÇÃO
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const t0 = performance.now();
const st = staticChecks();
const cams = buildTimeline(0);
const corridor = st ? checkCorridorR5R6(st, cams) : null;

let simReport = null;

if (st && !STATIC_ONLY) {
  const idx = buildFrameIndex(st, cams);
  const startSX = clamp(st.playerSpawn.spawnX, SPACE.bounds.minX, SPACE.bounds.maxX);
  const startSY = clamp(st.playerSpawn.spawnY, SPACE.bounds.minY, SPACE.bounds.maxY);

  // Passada 1 — Normal (100% sem dano)
  const normalOpts = { thrustScale: () => 1, allowBoost: () => true };
  const pass1 = runBeamSearch(idx, [initialSimState(startSX, startSY)], 0, idx.N - 1, normalOpts, {
    beamWidth: 28,
    chunkSize: 6,
    recordSnaps: true,
    continueOnFail: true,
  });
  for (const x of pass1.fails) {
    err(`passada 1 (normal): dano inevitável em ${(x.f * DT).toFixed(2)}s (c.${camToBar(x.camX)}): ${x.culprits.join(', ') || '?'}`);
  }

  // Passada 2 — Robustez (§5.4: empuxo 85% e sem boost nos Atos 1–2, c. <= 33)
  const acts12EndCamX = 33 * BAR * T; // 6336 px
  const robustOpts = {
    thrustScale: (camX) => (camX < acts12EndCamX ? 0.85 : 1.0),
    allowBoost: (camX) => camX >= acts12EndCamX,
  };
  const pass2 = runBeamSearch(idx, [initialSimState(startSX, startSY)], 0, idx.N - 1, robustOpts, {
    beamWidth: 24,
    chunkSize: 6,
    recordSnaps: false,
    continueOnFail: true,
  });
  for (const x of pass2.fails) {
    err(`passada 2 (robustez Atos 1–2 85% sem boost): dano inevitável em ${(x.f * DT).toFixed(2)}s (c.${camToBar(x.camX)}): ${x.culprits.join(', ') || '?'}`);
  }

  // Passada 3 — Respawn em cada checkpoint K (D9)
  const cpResults = [];
  for (let ki = 0; ki < st.checkpoints.length; ki++) {
    const k = st.checkpoints[ki];
    const startCam = Math.max(0, k.spawnX - SPACE.checkpointCamOffset);
    const kCams = buildTimeline(startCam);
    const kIdx = buildFrameIndex(st, kCams);
    const passK = runBeamSearch(
      kIdx,
      [initialSimState(SPACE.respawnScreenX, SPACE.respawnScreenY)],
      0,
      kIdx.N - 1,
      normalOpts,
      { beamWidth: 20, chunkSize: 6, recordSnaps: false, continueOnFail: true },
    );
    cpResults.push({ ki: ki + 1, col: k.col, fails: passK.fails });
    for (const x of passK.fails) {
      err(`passada 3 (checkpoint K#${ki + 1} ${pos(k.col)}): dano inevitável em ${(x.f * DT).toFixed(2)}s pós-respawn (c.${camToBar(x.camX)}): ${x.culprits.join(', ') || '?'}`);
    }
  }

  // Gotas W (§5.5: alcançáveis sem dano em alguma rota / janela guiada)
  const collectedInPass1 = new Set();
  for (const s of pass1.beam) {
    for (const ci of s.capsules) collectedInPass1.add(ci);
  }
  const dropResults = [];
  for (const cap of idx.capsuleInfos) {
    if (collectedInPass1.has(cap.ci)) {
      dropResults.push({ ci: cap.ci, col: cap.col, row: cap.row, ok: true, via: 'passada 1' });
      continue;
    }
    if (cap.enterF < 0) {
      err(`gota W em ${pos(cap.col)} linha ${cap.row} nunca entra na janela da câmera`);
      dropResults.push({ ci: cap.ci, col: cap.col, row: cap.row, ok: false, via: 'fora' });
      continue;
    }
    const lookback = 240; // 4 s antes de entrar
    let fStart = Math.max(0, cap.enterF - lookback);
    fStart = Math.floor(fStart / 60) * 60;
    const snapBeam = pass1.snaps.get(fStart) ?? [initialSimState(startSX, startSY)];
    const fEnd = Math.min(idx.N - 1, cap.exitF + 120);
    const guided = runBeamSearch(idx, snapBeam, fStart, fEnd, normalOpts, {
      beamWidth: 24,
      chunkSize: 6,
      guideTarget: cap,
      recordSnaps: false,
      continueOnFail: false,
    });
    const ok = guided.fails.length === 0 && guided.beam.some((s) => s.capsules.includes(cap.ci));
    dropResults.push({ ci: cap.ci, col: cap.col, row: cap.row, ok, via: 'guiada' });
    if (!ok) {
      err(`gota W em ${pos(cap.col)} (linha ${cap.row}) não é alcançável sem dano`);
    }
  }

  const best1 = pass1.beam.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  const bestDist = pass1.beam.reduce(
    (acc, s) => (s.minDistToRKill < acc.d ? { d: s.minDistToRKill, ctx: s.minDistCtx } : acc),
    { d: Infinity, ctx: null },
  );
  const reaction = computeMinReactionWindow(st);

  simReport = {
    pass1,
    pass2,
    cpResults,
    dropResults,
    best1,
    bestDist,
    reaction,
  };
}

const elapsedMs = performance.now() - t0;

// ── --print (relatório detalhado) ───────────────────────────────────────────────────────────────────────────
if (PRINT && st) {
  console.log('PLANETAS (LEVEL7_PLANETS):');
  for (const p of st.planets) {
    console.log(`  ${pos(p.col)}  ${p.kind.padEnd(4)}  y=${String(p.y).padStart(3)}  wave=${p.wave ? 'sim' : 'não'}`);
  }
  console.log(`\nONDAS DA NAVE-MÃE (LEVEL7_WAVES): ${st.waves.length}`);
  for (const w of st.waves) {
    console.log(`  c.${String(w.bar).padStart(2, '0')} t${w.beat}  ${w.kind.padEnd(11)}  y=${w.y}`);
  }
  if (corridor) {
    const c = corridor;
    console.log(
      `\nCORREDOR D5/R3: menor folga vertical = ${Number.isFinite(c.minPlanetClearance) ? c.minPlanetClearance.toFixed(1) + ' px' : '—'}` +
        (c.minClearanceCtx ? ` (${c.minClearanceCtx.kind} em ${pos(c.minClearanceCtx.col)}, t=${c.minClearanceCtx.tSec.toFixed(2)}s)` : ''),
    );
  }
  if (simReport) {
    const { best1, bestDist, reaction, cpResults, dropResults } = simReport;
    console.log('\nMÉTRICAS DO BOT 2D:');
    if (best1) {
      console.log(`  Passada 1 (rota escolhida): socos=${best1.punches}, boosts=${best1.boosts}, fim=(${best1.player.sx.toFixed(1)}, ${best1.player.sy.toFixed(1)})`);
    }
    if (Number.isFinite(bestDist.d)) {
      console.log(`  Menor distância ao centro de planeta: ${bestDist.d.toFixed(1)} px (folga R_kill=${(bestDist.d - PLANET_GRAV.rKill).toFixed(1)} px, ${bestDist.ctx?.kind} ${pos(bestDist.ctx?.col ?? 0)})`);
    }
    if (reaction.minCtx) {
      console.log(`  Menor janela de reação: ${reaction.minT.toFixed(2)} s (${reaction.minCtx.label})`);
    }
    console.log(`  Checkpoints (Passada 3): ${cpResults.map((c) => `K#${c.ki}(${pos(c.col)})=${c.fails.length ? 'FALHA' : 'OK'}`).join(' ')}`);
    console.log(`  Gotas W: ${dropResults.map((d) => `W(${pos(d.col)} l${d.row})=${d.ok ? 'OK:' + d.via : 'FALHA'}`).join(' ')}`);
  }
  console.log('');
}

// ── Resumo final ────────────────────────────────────────────────────────────────────────────────────────────
if (st) {
  const n = (ch) => st.count(ch);
  const durS = ((cams.length - 1) * DT).toFixed(1);
  console.log(`mapa ${COLS}×${NROWS} · ${LEVEL7_BAR_COUNT} compassos · ${cams.length} quadros (${durS} s)`);
  console.log(
    `contagens: Y=${n('Y')} U=${n('U')} K=${n('K')} W=${n('W')} c=${n('c')} t=${n('t')} · ` +
      `inimigos[m=${n('m')} M=${n('M')} g=${n('g')} u=${n('u')} a=${n('a')} b=${n('b')}] · ` +
      `obst[s=${n('s')} S=${n('S')} d=${n('d')} v=${n('v')}] · ondas=${st.waves.length}`,
  );
  if (corridor && Number.isFinite(corridor.minPlanetClearance)) {
    console.log(
      `corredor D5: menor folga vertical = ${corridor.minPlanetClearance.toFixed(1)} px` +
        (corridor.minClearanceCtx ? ` (${corridor.minClearanceCtx.kind} ${pos(corridor.minClearanceCtx.col)})` : ''),
    );
  }
}

if (simReport) {
  const { best1, bestDist, reaction, dropResults } = simReport;
  const distStr = Number.isFinite(bestDist.d)
    ? `${bestDist.d.toFixed(1)} px (R_kill+${(bestDist.d - PLANET_GRAV.rKill).toFixed(1)} px)`
    : '—';
  const reactStr = reaction.minCtx ? `${reaction.minT.toFixed(2)} s (${reaction.minCtx.label})` : '—';
  const punchStr = best1 ? `${best1.punches}` : '—';
  const boostStr = best1 ? `${best1.boosts}` : '—';
  console.log(
    `bot 2D (${(elapsedMs / 1000).toFixed(2)}s): menor dist. R_kill=${distStr} · socos=${punchStr} · boosts=${boostStr} · ` +
      `menor reação=${reactStr} · gotas=${dropResults.filter((d) => d.ok).length}/${dropResults.length}`,
  );
} else if (STATIC_ONLY) {
  console.log(`modo --static (${(elapsedMs / 1000).toFixed(2)}s)`);
}

for (const w of warnings) console.log(`AVISO: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERRO: ${e}`);
  console.error(`level7 FALHOU (${errors.length} erro${errors.length > 1 ? 's' : ''})`);
  process.exit(1);
}

console.log('level7 OK');
