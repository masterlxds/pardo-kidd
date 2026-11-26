#!/usr/bin/env node
/**
 * Validador estrutural inicial da FASE 7 — "Espaço Sideral (Órbita de Quixadá)".
 * Etapa 1: valida dimensões, compassos, legenda, ausência de tiles sólidos, spawn P no c.1 e EEIQ A no c.65.
 * Na Etapa 2 o agente VALIDATOR adicionará corredor D5, regras R1–R8 e o bot 2D determinístico.
 */
import * as RULES from '../src/game/spaceRules.ts';
import * as LVL from '../src/game/level7.ts';

const { SPACE } = RULES;
const { LEVEL7_LEGEND, LEVEL7_BAR_COLS, LEVEL7_BAR_COUNT, LEVEL7_BARS, LEVEL7_ROWS } = LVL;

const errors = [];
const err = (m) => errors.push(m);

if (LEVEL7_BAR_COLS !== SPACE.barCols) err(`LEVEL7_BAR_COLS=${LEVEL7_BAR_COLS} != SPACE.barCols=${SPACE.barCols}`);
if (LEVEL7_BAR_COUNT !== 65) err(`LEVEL7_BAR_COUNT=${LEVEL7_BAR_COUNT} != 65`);
if (LEVEL7_BARS.length !== LEVEL7_BAR_COUNT) err(`LEVEL7_BARS.length=${LEVEL7_BARS.length} != ${LEVEL7_BAR_COUNT}`);

for (let b = 0; b < LEVEL7_BARS.length; b++) {
  const bar = LEVEL7_BARS[b];
  if (!Array.isArray(bar) || bar.length !== SPACE.rows) {
    err(`compasso ${b + 1}: ${bar?.length ?? 0} linhas, esperado ${SPACE.rows}`);
    continue;
  }
  for (let r = 0; r < bar.length; r++) {
    if (bar[r].length !== LEVEL7_BAR_COLS) {
      err(`compasso ${b + 1} linha ${r}: ${bar[r].length} cols, esperado ${LEVEL7_BAR_COLS}`);
    }
  }
}

if (LEVEL7_ROWS.length !== SPACE.rows) err(`LEVEL7_ROWS.length=${LEVEL7_ROWS.length} != ${SPACE.rows}`);
for (let r = 0; r < LEVEL7_ROWS.length; r++) {
  if (LEVEL7_ROWS[r].length !== SPACE.cols) {
    err(`LEVEL7_ROWS[${r}].length=${LEVEL7_ROWS[r].length} != ${SPACE.cols}`);
  }
}

const SOLID_TILES = new Set(['=', '#', 'R', 'B', '?', '-', '^', '~']);
let countP = 0;
let countA = 0;
let pBar = -1;
let aBar = -1;

for (let r = 0; r < LEVEL7_ROWS.length; r++) {
  const row = LEVEL7_ROWS[r];
  for (let c = 0; c < row.length; c++) {
    const ch = row[c];
    if (SOLID_TILES.has(ch)) err(`tile sólido/terreno proibido '${ch}' em col=${c}, row=${r}`);
    if (!(ch in LEVEL7_LEGEND)) err(`caractere desconhecido '${ch}' fora de LEVEL7_LEGEND em col=${c}, row=${r}`);
    const bar = Math.floor(c / LEVEL7_BAR_COLS) + 1;
    if (ch === 'P') {
      countP++;
      pBar = bar;
    }
    if (ch === 'A') {
      countA++;
      aBar = bar;
    }
  }
}

if (countP !== 1) err(`esperado exatamente 1 'P', encontrado ${countP}`);
else if (pBar !== 1) err(`'P' deve estar no compasso 1, encontrado no compasso ${pBar}`);

if (countA !== 1) err(`esperado exatamente 1 'A', encontrado ${countA}`);
else if (aBar !== 65) err(`'A' deve estar no compasso 65, encontrado no compasso ${aBar}`);

if (errors.length > 0) {
  console.error('FALHAS em level7:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log(`mapa ${SPACE.cols}x${SPACE.rows} · ${LEVEL7_BAR_COUNT} compassos · P=c.${pBar} · A=c.${aBar}`);
console.log('level7 OK');
