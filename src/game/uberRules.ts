/**
 * FASE 5 — "Marginal de São Paulo": REGRAS E NÚMEROS DO AUTOSCROLLER (CONTRATO).
 * Somente o orquestrador altera este arquivo. Dados e funções puras, SEM IMPORTS, para que
 * `scripts/check-level5.mjs` importe este mesmo arquivo e simule exatamente o que o jogo faz.
 * Design: level-5-refs/gdd_fase5_marginal.md · gdd_bestiario_fase5.md · level_design_fase5.md.
 *
 * Unidades: px e segundos; y cresce para baixo. "encontroX" = x de mundo (centro) em que a entidade
 * cruza o Pardo na posição neutra (x de tela = UBER.screenNeutral).
 */
export const UBER = {
  /** velocidade da rolagem da câmera (px/s) = 7,5 colunas/s */
  speed: 120,
  /** x de TELA do centro do Pardo, fixo: nesta fase não há direcional (só pulo e soco) */
  screenNeutral: 72,
  /** y de mundo do asfalto onde rodam os veículos (as rodas afundam 8 px no tile da pista, como o carro) */
  groundY: 168,
  /** y de mundo do teto do carro (chão do Pardo) fora das rampas */
  roofY: 144,
  /** câmera Y travada (mapa de 12 linhas = 192 px; tela = 180) */
  camY: 12,
  /** invulnerabilidade após dano nesta fase (s) */
  invuln: 1.0,
  /** andamento da faixa 'uber': 1 tempo = 0,4 s = 3 colunas; 1 compasso = 12 colunas */
  bpm: 150,
  beatCols: 3,
  barCols: 12,
  /** salto de rampa: duração em colunas e altura do arco (px) */
  rampCols: 12,
  rampHeight: 40,
  /** o caminhão-baú fica preso neste x de tela (canto esq.) por truckBars compassos */
  truckScreenX: 232,
  truckBars: 8,
  /** a rolagem desacelera até parar ao longo dos últimos stopBars compassos (depois do último salto de rampa) */
  stopBars: 1.5,
  /** cutscene de chegada: com a câmera parada, o carro avança sozinho até o totem a esta velocidade máx. (px/s) */
  arriveSpeed: 90,
  /** estrelas da corrida: maxStars − gotas perdidas (mín. 1); bônus = starBonus × estrelas */
  maxStars: 5,
  starBonus: 500,
  tile: 16,
  cols: 888,
  rows: 12,
} as const;

/** Faixas de altura (y de mundo). Pardo em pé no teto: y 124..144. */
export const UBER_BANDS = {
  highTop: 80,
  highBottom: 96,
  lowTop: 128,
  lowBottom: 144,
} as const;

/** Retângulo relativo: dx a partir do canto esquerdo da CÉLULA do marcador; y absoluto de mundo. */
export interface UberZone { dx: number; y: number; w: number; h: number }

/**
 * Zonas que FEREM dos obstáculos indestrutíveis (menores que o desenho, de propósito).
 * As altas descem até y=110: o Pardo em pé (topo em 124) passa, mas nem o pulo mínimo (~16 px) cabe por baixo —
 * é isso que torna obrigatório o soco em quem vem pela faixa baixa sob uma placa ou luminária.
 */
export const UBER_OBSTACLES = {
  /** L — limitador de altura (1 coluna): PULE */
  limitador: { dx: 2, y: 130, w: 12, h: 12 },
  /** F — faixa de obra (2 colunas): PULE */
  faixa: { dx: 2, y: 130, w: 28, h: 12 },
  /** G — placa de pórtico (3 colunas): NÃO PULE */
  placa: { dx: 2, y: 82, w: 44, h: 28 },
  /** i — luminária de túnel (1 coluna): NÃO PULE */
  luminaria: { dx: 2, y: 96, w: 12, h: 14 },
} as const satisfies Record<string, UberZone>;
export type UberObstacleKind = keyof typeof UBER_OBSTACLES;

/** B — saco de entulho pendurado num guincho de obra: fere ao toque, estoura com 1 soco. W — isopor: não fere, soco = +1 gota. */
export const UBER_SACO: UberZone = { dx: 1, y: 128, w: 14, h: 16 };
export const UBER_ISOPOR: UberZone = { dx: 1, y: 124, w: 14, h: 20 };

/**
 * Inimigos de trajetória reta: hitbox w×h centrada no x de `uberEnemyX(encontroX, v, cameraX)`.
 * v > 0 vem de frente; v < 0 anda no sentido do Uber, mais devagar.
 * `bottom` = base da hitbox em repouso. Motoboys e patinetes RODAM NO ASFALTO (bottom = UBER.groundY) e
 * SALTAM ao chegar perto: a base sobe `hopLift·(1 − (t/hopT)²)` px enquanto |t| < hopT, onde t = segundos
 * até o encontro (`uberTimeTo`). O ápice do salto é exatamente o encontro, na altura do peito do Pardo.
 * Caixas voam em linha reta (hopLift = 0).
 */
export const UBER_ENEMIES = {
  motoboy: { w: 22, h: 18, bottom: 168, v: 60, points: 300, hopLift: 26, hopT: 0.4 },
  motoboy_fast: { w: 22, h: 18, bottom: 168, v: 100, points: 400, hopLift: 26, hopT: 0.35 },
  patinete: { w: 14, h: 20, bottom: 168, v: -40, points: 200, hopLift: 26, hopT: 0.6 },
  caixa_baixa: { w: 10, h: 10, bottom: 141, v: 100, points: 50, hopLift: 0, hopT: 0 },
  caixa_alta: { w: 10, h: 10, bottom: 93, v: 100, points: 50, hopLift: 0, hopT: 0 },
} as const;
export type UberLinearKind = keyof typeof UBER_ENEMIES;

/** Drone: hitbox e tempos (s antes do encontro). Trajetória em `uberDronePos`. */
export const UBER_DRONE = {
  w: 16, h: 12, points: 250,
  /** centro Y pairando (faixa alta) e no rasante (faixa baixa) */
  hoverCy: 88, lowCy: 134,
  /** velocidade própria pairando e no rasante */
  hoverV: 30, diveV: 80,
  /** t ≤ flat: voa reto na faixa baixa · flat < t ≤ dive: desce em diagonal · dive < t ≤ warn: aviso parado na tela */
  flat: 0.2, dive: 0.5, warn: 0.8,
} as const;

/** Pichador de rapel (preso ao mundo, centrado no centro da célula): corpo na faixa alta + nuvem de spray contínua. */
export const UBER_PICHADOR = {
  points: 350,
  body: { w: 12, h: 20, y: 88 },
  spray: { w: 12, h: 32, y: 112 },
} as const;

/** x de mundo (centro) de um inimigo de trajetória reta, função pura da câmera. */
export function uberEnemyX(encontroX: number, v: number, cameraX: number): number {
  return encontroX + (v / UBER.speed) * (encontroX - (cameraX + UBER.screenNeutral));
}

/** y de mundo da BASE da hitbox de um inimigo de trajetória reta (inclui o salto), função pura da câmera. */
export function uberEnemyBottom(kind: UberLinearKind, encontroX: number, cameraX: number): number {
  const E = UBER_ENEMIES[kind];
  if (E.hopLift <= 0) return E.bottom;
  const u = (encontroX - (cameraX + UBER.screenNeutral)) / UBER.speed / E.hopT;
  return u > -1 && u < 1 ? E.bottom - E.hopLift * (1 - u * u) : E.bottom;
}

/** true enquanto o inimigo está no ar (para trocar de sprite/soltar poeira na decolagem e no pouso). */
export function uberEnemyHopping(kind: UberLinearKind, encontroX: number, cameraX: number): boolean {
  const E = UBER_ENEMIES[kind];
  if (E.hopLift <= 0) return false;
  const u = (encontroX - (cameraX + UBER.screenNeutral)) / UBER.speed / E.hopT;
  return u > -1 && u < 1;
}

/** Segundos que faltam para o encontro na posição neutra (negativo = já passou). */
export function uberTimeTo(encontroX: number, cameraX: number): number {
  return (encontroX - (cameraX + UBER.screenNeutral)) / UBER.speed;
}

export type UberDronePhase = 'hover' | 'warn' | 'dive' | 'flat';

/** Centro (cx, cy) e fase do drone, função pura da câmera. Contínua em todas as fronteiras de fase. */
export function uberDronePos(encontroX: number, cameraX: number): { cx: number; cy: number; phase: UberDronePhase } {
  const D = UBER_DRONE;
  const t = uberTimeTo(encontroX, cameraX);
  if (t <= D.flat) return { cx: encontroX + D.diveV * t, cy: D.lowCy, phase: 'flat' };
  if (t <= D.dive) {
    const k = (t - D.flat) / (D.dive - D.flat);
    return { cx: encontroX + D.diveV * t, cy: D.lowCy + (D.hoverCy - D.lowCy) * k, phase: 'dive' };
  }
  const xDive = encontroX + D.diveV * D.dive;
  if (t <= D.warn) return { cx: xDive - UBER.speed * (t - D.dive), cy: D.hoverCy, phase: 'warn' };
  const xWarn = xDive - UBER.speed * (D.warn - D.dive);
  return { cx: xWarn + D.hoverV * (t - D.warn), cy: D.hoverCy, phase: 'hover' };
}

/**
 * Quanto o teto do carro SOBE (px ≥ 0) quando o centro do Pardo está em `centerX`, dadas as
 * posições (px, borda esquerda da célula) dos marcadores de rampa `J` — ver LEVEL5_RAMP_COLS.
 */
export function uberRampOffset(centerX: number, rampStartsPx: readonly number[]): number {
  const len = UBER.rampCols * UBER.tile;
  for (const s of rampStartsPx) {
    const u = (centerX - s) / len;
    if (u > 0 && u < 1) return UBER.rampHeight * 4 * u * (1 - u);
  }
  return 0;
}

/** Estrelas da corrida a partir das gotas perdidas na fase. */
export function uberStars(rideHits: number): number {
  return Math.max(1, UBER.maxStars - rideHits);
}
