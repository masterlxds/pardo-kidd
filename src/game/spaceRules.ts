/**
 * FASE 7 — "Espaço Sideral (Órbita de Quixadá)": REGRAS E NÚMEROS (CONTRATO).
 * Somente o orquestrador altera este arquivo após a Etapa 1. Dados e funções puras, SEM IMPORTS,
 * para que `scripts/check-level7.mjs` importe este mesmo arquivo e simule exatamente o que o jogo faz.
 * Design: PLAN-FASE7.md · level-7-refs/gdd_fase7_espaco.md · gdd_bestiario_fase7.md.
 *
 * CONVENÇÕES DE COORDENADAS:
 *  - Tela lógica 320×180 px, câmera Y travada em 0 (y de mundo = y de tela).
 *  - `SPACE.bounds` e posições (`sx`, `sy`) em `SpacePlayerState` / `stepPlayerSpace` representam o CENTRO
 *    da hitbox do Pardo (`playerHitbox` 10×18) em coordenadas de tela (sx ∈ [20, 288], sy ∈ [18, 162]).
 *    Canto sup. esq. em tela: (sx - 5, sy - 9); em mundo: (camX + sx - 5, sy - 9).
 *  - Marcadores no mapa: ancorados no CENTRO da célula (`x = col * 16 + 8`, `y = row * 16 + 8`).
 *  - Planetas e ondas: metadados em `LEVEL7_PLANETS` / `LEVEL7_WAVES`.
 */

export const SPACE = {
  /** velocidade de rolagem em cruzeiro (px/s) = 6,0 colunas/s */
  scrollSpeed: 96,
  /** andamento da faixa 'space': 1 tempo = 0,5 s = 3 colunas; 1 compasso = 2,0 s = 12 colunas */
  bpm: 120,
  beatCols: 3,
  barCols: 12,
  /** dimensões da grade em tiles (65 compassos × 12 cols = 780; 11 linhas × 16 = 176 px) */
  cols: 780,
  rows: 11,
  tile: 16,
  viewW: 320,
  viewH: 180,
  /** aceleração do jetpack em 8 direções (px/s²) */
  thrust: 420,
  /** velocidade máxima em tela fora do boost (px/s) */
  maxSpeed: 125,
  /** amortecimento exponencial zero-G (s⁻¹) por eixo com direcional solto fora do boost */
  damping: 4.2,
  /** Soco Espacial (18 px de alcance à frente da hitbox do Pardo) */
  punch: {
    reach: 18,
    h: 14,
    windup: 0.04,
    active: 0.12,
    total: 0.24,
  },
  /** Impulso de Escape / Boost (botão Pulo na Fase 7) */
  boost: {
    dv: 190,
    t: 0.16,
    cooldown: 1.4,
  },
  /** hitbox 10×18 centrada no sprite 24×24 */
  playerHitbox: { w: 10, h: 18 },
  /** limites seguros do centro da hitbox do Pardo em coordenadas de tela */
  bounds: { minX: 20, maxX: 288, minY: 18, maxY: 162 },
  /** limite direito em tela enquanto a Nave-Mãe (64×56 em x=264) está ativa */
  motherMaxX: 216,
  /** x de tela do centro da Nave-Mãe durante a escolta do Ato 4 */
  motherScreenX: 264,
  /** duração da escolta da Nave-Mãe (compassos) */
  motherBars: 12,
  /** invulnerabilidade após dano comum (s) */
  invuln: 1.0,
  /** janela garantida sem ameaças após cada checkpoint K (s) */
  checkpointGrace: 1.8,
  /** deslocamento da câmera atrás da coluna do checkpoint no respawn (px) */
  checkpointCamOffset: 64,
  /** posição em tela do centro do Pardo no respawn (D9) */
  respawnScreenX: 80,
  respawnScreenY: 90,
  /** compassos 62–63 desaceleram a rolagem até parar exatamente no fim do mapa (camMax = 12160) */
  stopBars: 2,
  /** compassos finais reservados à EEIQ e cutscene (64–65) */
  cutsceneBars: 2,
  /** avaliação em estrelas: max(1, maxStars - hits - 2 * gravDeaths) */
  maxStars: 5,
  starBonus: 500,
} as const;

export const PLANET_GRAV = {
  /** raio visual do sprite 48×48 (px) */
  radius: 24,
  /** raio letal (instakill imediato, ignora gotas e invulnerabilidade) */
  rKill: 21,
  /** raio do campo gravitacional contínuo */
  rGrav: 92,
  /** aceleração centrípeta máxima na borda letal (px/s²) */
  gMax: 340,
  /** expoente da curva de atração gravitacional */
  exponent: 1.5,
  /** distância crítica de vibração do capacete / alerta visual */
  critical: 44,
  /** velocidade de passagem do planeta relativa à tela (px/s, para a esquerda) */
  speed: 72,
  /** duração do telegraph orbital na borda direita antes de surgir (s) */
  warnT: 1.2,
  /** oscilação vertical opcional nos Atos 3–4 */
  wave: { amp: 16, period: 4 },
  /** corredor vertical seguro mínimo (px) fora de R_kill + meia hitbox dentro de [18, 162] */
  corridorMin: 64,
  /** faixas permitidas para o centro Y do planeta (D5) */
  yRanges: [
    [38, 68],
    [112, 142],
  ] as readonly (readonly [number, number])[],
  /** faixas permitidas para a base Y de planetas com wave=true (D5) */
  waveYRanges: [
    [38, 52],
    [128, 142],
  ] as readonly (readonly [number, number])[],
} as const;

export const SPACE_ENEMIES = {
  meteor: {
    w: 12,
    h: 12,
    hp: 1,
    speed: 35,
    points: 150,
    punchable: true,
    warnT: 0,
  },
  meteor_fire: {
    w: 14,
    h: 12,
    hp: 1,
    speed: 95,
    points: 250,
    punchable: true,
    warnT: 0.5,
  },
  comet_ice: {
    w: 14,
    h: 12,
    hp: 1,
    speed: 110,
    points: 300,
    bonusCoin: 1,
    punchable: true,
    warnT: 0.7,
  },
  ufo: {
    w: 18,
    h: 12,
    hp: 1,
    speed: 40,
    points: 300,
    punchable: true,
    ampY: 28,
    periodY: 2.4,
    fireDistMin: 120,
    fireDistMax: 160,
    chargeT: 0.55,
  },
  plasma_orb: {
    w: 8,
    h: 8,
    hp: 1,
    speed: 130,
    points: 50,
    punchable: true,
  },
  alien_jet: {
    w: 14,
    h: 18,
    hp: 1,
    speed: 55,
    vyMax: 48,
    lockDist: 90,
    lockT: 0.45,
    dashSpeed: 140,
    points: 350,
    punchable: true,
  },
  space_mine: {
    w: 12,
    h: 12,
    hp: 1,
    speed: 0,
    armDist: 56,
    armT: 0.5,
    points: 250,
    punchable: true, // apenas quando desarmada ('idle')
  },
} as const;

export const SPACE_OBSTACLES = {
  satellite: {
    w: 28,
    h: 14,
    speed: 15,
    punchable: false,
  },
  satellite_beam: {
    w: 20,
    h: 14,
    beamW: 10,
    beamH: 140,
    topY: 22,
    bottomY: 158,
    chargeT: 0.8,
    fireT: 0.7,
    offT: 1.2,
    cycleT: 2.7,
    punchable: false,
  },
  space_debris: {
    w: 18,
    h: 18,
    speed: 20,
    punchable: false,
  },
  solar_wind: {
    w: SPACE.viewW,
    h: 22,
    warnT: 1.0,
    activeT: 1.4,
    totalT: 2.4,
    pushVx: -90,
    punchable: false,
  },
  mothership: {
    w: 64,
    h: 56,
    screenX: SPACE.motherScreenX,
    bars: SPACE.motherBars,
    punchable: false,
  },
  water_capsule: {
    w: 16,
    h: 16,
    heal: 1,
    punchable: true,
  },
  space_beacon: {
    w: 16,
    h: 24,
  },
  eeiq_station: {
    w: 80,
    h: 64,
  },
} as const;

export type PlanetKind = 'yuri' | 'yumi';

export interface PlanetDef {
  col: number;
  kind: PlanetKind;
  y: number;
  wave?: boolean;
}

export type SpaceWaveKind = 'ufo' | 'meteor_fire' | 'plasma_orb';

export interface SpaceWaveDef {
  bar: number;
  beat: number;
  kind: SpaceWaveKind;
  y: number;
}

export interface SpacePlayerState {
  /** centro X da hitbox em coordenadas de tela [bounds.minX, maxX] */
  sx: number;
  /** centro Y da hitbox em coordenadas de tela [bounds.minY, bounds.maxY] */
  sy: number;
  /** velocidade X relativa à tela (px/s) */
  vx: number;
  /** velocidade Y em tela (px/s) */
  vy: number;
  /** tempo restante da janela ativa do Impulso (s) */
  boostTimer: number;
  /** tempo restante de recarga do Impulso (s) */
  boostCd: number;
  /** tempo restante do ciclo completo do soco (s) */
  punchTimer: number;
  /** última direção unitária não nula de movimento/empuxo (+1/+0 por padrão) */
  lastDirX: number;
  lastDirY: number;
}

export interface SpaceInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
  punch: boolean;
}

export interface SpaceStepOpts {
  motherActive?: boolean;
  /** fator multiplicador do empuxo (ex.: 0.85 na passada de robustez do validador) */
  thrustScale?: number;
  /** impede disparo de boost quando falso */
  allowBoost?: boolean;
  /** altura mínima/máxima se sobrescrita */
  boundsMaxX?: number;
}

export interface SpaceStepResult {
  /** verdadeiro se entrou no raio letal (d <= R_kill) de algum planeta ativo neste passo */
  gravKilled: boolean;
  /** índice do planeta que causou morte gravitacional (-1 se nenhum) */
  killedByPlanet: number;
  /** maior intensidade normalizada de campo gravitacional ativo [0..1] para o hum contínuo */
  maxGravIntensity: number;
  /** verdadeiro se o boost foi acionado exatamente neste passo */
  boostTriggered: boolean;
  /** verdadeiro se o soco foi iniciado exatamente neste passo */
  punchTriggered: boolean;
}

export type PlanetPhase = 'inactive' | 'warn' | 'active' | 'done';

export interface PlanetPosResult {
  phase: PlanetPhase;
  screenX: number;
  worldX: number;
  y: number;
  warnLeft: number;
  elapsed: number;
}

export interface GravAccelResult {
  ax: number;
  ay: number;
  kill: boolean;
  dist: number;
}

export type AlienJetPhase = 'approach' | 'lock' | 'dash';

export interface AlienJetState {
  phase: AlienJetPhase;
  sx: number;
  sy: number;
  vy: number;
  lockTimer: number;
}

export type SpaceMinePhase = 'idle' | 'arming' | 'armed';

export interface SpaceMineState {
  phase: SpaceMinePhase;
  timer: number;
}

export type UfoFirePhase = 'patrol' | 'charging' | 'fired';

export interface UfoState {
  phase: UfoFirePhase;
  chargeTimer: number;
}

export type BeamPhase = 'charge' | 'fire' | 'off';

export type SolarWindPhase = 'warn' | 'active' | 'done';

export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Funções puras de câmera e desaceleração ─────────────────────────────────

/**
 * x de câmera no fim útil da fase (camMax = cols*tile - viewW = 780*16 - 320 = 12160 px, col 760).
 * Os compassos 62 e 63 (2 compassos = 384 px) desaceleram até parar em `scrollStopCamX()`.
 * Coluna de início do c.62 = 61 * 12 = 732 → x = 11712; c.64 inicia em 63 * 12 = 756 → x = 12096.
 * Travamos a parada exata no início do c.64 (`12096 px`), cabendo com folga dentro de `camMax = 12160`
 * com a EEIQ inteira visível à direita nos compassos 64–65!
 */
export const SPACE_CAM_MAX = SPACE.cols * SPACE.tile - SPACE.viewW; // 12160
export const SPACE_BRAKE_START_CAM_X = (62 - 1) * SPACE.barCols * SPACE.tile; // 11712 (início do c.62)
export const SPACE_STOP_CAM_X = SPACE_BRAKE_START_CAM_X + SPACE.stopBars * SPACE.barCols * SPACE.tile; // 12096 (início do c.64)

/**
 * Velocidade da rolagem da câmera (px/s) em função de `camX`.
 * Mantém `SPACE.scrollSpeed` (96 px/s) em cruzeiro até o início do compasso 62, desacelera
 * suavemente (desaceleração constante: v = v0 * sqrt(rest / D)) ao longo dos compassos 62–63
 * (384 px) e zera exatamente em `SPACE_STOP_CAM_X` (início do compasso 64, EEIQ à vista).
 */
export function scrollSpeedAt(camX: number): number {
  if (camX >= SPACE_STOP_CAM_X) return 0;
  if (camX <= SPACE_BRAKE_START_CAM_X) return SPACE.scrollSpeed;
  const dist = SPACE_STOP_CAM_X - SPACE_BRAKE_START_CAM_X;
  const rest = SPACE_STOP_CAM_X - camX;
  return SPACE.scrollSpeed * Math.sqrt(Math.max(0, rest) / dist);
}

// ── Planetas Yuri & Yumi ────────────────────────────────────────────────────

/**
 * Posição e fase de um planeta (Yuri ou Yumi) em função pura de `camX`.
 * `triggerX = def.col * 16 + 8` define o instante em que a borda direita da câmera alcança o marcador:
 *  - `warnCamX = enterCamX - PLANET_GRAV.warnT * SPACE.scrollSpeed` (1,2 s antes de surgir)
 *  - `enterCamX = triggerX - SPACE.viewW` → entra na borda direita em `screenX = viewW + radius`
 *  - atravessa a tela a `-PLANET_GRAV.speed` em relação à tela (`t = (camX - enterCamX) / scrollSpeed`)
 *  - sai completamente quando `screenX < -PLANET_GRAV.radius` (`phase = 'done'`).
 */
export function planetPos(camX: number, def: PlanetDef): PlanetPosResult {
  const triggerX = def.col * SPACE.tile + SPACE.tile / 2;
  const enterCamX = triggerX - SPACE.viewW;
  const warnCamX = enterCamX - PLANET_GRAV.warnT * SPACE.scrollSpeed;
  const startScreenX = SPACE.viewW + PLANET_GRAV.radius;

  if (camX < warnCamX) {
    return {
      phase: 'inactive',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: def.y,
      warnLeft: PLANET_GRAV.warnT,
      elapsed: 0,
    };
  }

  if (camX < enterCamX) {
    const warnLeft = Math.max(0, (enterCamX - camX) / SPACE.scrollSpeed);
    return {
      phase: 'warn',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: def.y,
      warnLeft,
      elapsed: 0,
    };
  }

  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX - PLANET_GRAV.speed * elapsed;
  const y = def.wave
    ? def.y + PLANET_GRAV.wave.amp * Math.sin((2 * Math.PI * elapsed) / PLANET_GRAV.wave.period)
    : def.y;

  if (screenX < -PLANET_GRAV.radius) {
    return {
      phase: 'done',
      screenX,
      worldX: camX + screenX,
      y,
      warnLeft: 0,
      elapsed,
    };
  }

  return {
    phase: 'active',
    screenX,
    worldX: camX + screenX,
    y,
    warnLeft: 0,
    elapsed,
  };
}

/**
 * Aceleração gravitacional centrípeta sofrida pelo Pardo em `(px, py)` devido a um planeta centrado em `(cx, cy)`.
 * Mesmo referencial (ambos em tela ou ambos em mundo).
 */
export function gravAccel(px: number, py: number, cx: number, cy: number): GravAccelResult {
  const dx = cx - px;
  const dy = cy - py;
  const dist = Math.hypot(dx, dy);
  if (dist <= PLANET_GRAV.rKill) {
    return { ax: 0, ay: 0, kill: true, dist };
  }
  if (dist >= PLANET_GRAV.rGrav || dist < 1e-6) {
    return { ax: 0, ay: 0, kill: false, dist };
  }
  const u = 1 - (dist - PLANET_GRAV.rKill) / (PLANET_GRAV.rGrav - PLANET_GRAV.rKill);
  const a = PLANET_GRAV.gMax * Math.pow(u, PLANET_GRAV.exponent);
  return {
    ax: (dx / dist) * a,
    ay: (dy / dist) * a,
    kill: false,
    dist,
  };
}

// ── Física do Pardo Astronauta ──────────────────────────────────────────────

/** Cria o estado inicial do Pardo Astronauta em coordenadas de tela (centro da hitbox). */
export function createSpacePlayerState(
  sx: number = SPACE.respawnScreenX,
  sy: number = SPACE.respawnScreenY,
): SpacePlayerState {
  return {
    sx,
    sy,
    vx: 0,
    vy: 0,
    boostTimer: 0,
    boostCd: 0,
    punchTimer: 0,
    lastDirX: 1,
    lastDirY: 0,
  };
}

/**
 * Avança 1 passo de física do Pardo Astronauta em coordenadas de tela.
 * `planets`: lista de centros em TELA `(cx, cy)` de planetas atualmente em `phase === 'active'`.
 * (Aceita também objetos com `{ screenX, y }` ou `{ x, y }` através da interface `{ cx, cy }`.)
 */
export function stepPlayerSpace(
  state: SpacePlayerState,
  input: SpaceInput,
  dt: number,
  planets: readonly { cx: number; cy: number }[],
  opts: SpaceStepOpts = {},
): SpaceStepResult {
  const thrustScale = opts.thrustScale ?? 1;
  const allowBoost = opts.allowBoost ?? true;
  const maxX = opts.boundsMaxX ?? (opts.motherActive ? SPACE.motherMaxX : SPACE.bounds.maxX);

  // Timers
  if (state.boostTimer > 0) state.boostTimer = Math.max(0, state.boostTimer - dt);
  if (state.boostCd > 0) state.boostCd = Math.max(0, state.boostCd - dt);
  if (state.punchTimer > 0) state.punchTimer = Math.max(0, state.punchTimer - dt);

  // Direção normalizada em 8 direções
  const rawX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const rawY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const mag = Math.hypot(rawX, rawY);
  const dx = mag > 0 ? rawX / mag : 0;
  const dy = mag > 0 ? rawY / mag : 0;

  if (mag > 0) {
    state.lastDirX = dx;
    state.lastDirY = dy;
  }

  // Soco Espacial
  let punchTriggered = false;
  if (input.punch && state.punchTimer <= 0) {
    state.punchTimer = SPACE.punch.total;
    punchTriggered = true;
  }

  // Impulso de Escape / Boost
  let boostTriggered = false;
  if (allowBoost && input.boost && state.boostCd <= 0) {
    const bx = mag > 0 ? dx : 1;
    const by = mag > 0 ? dy : 0;
    state.boostTimer = SPACE.boost.t;
    state.boostCd = SPACE.boost.cooldown;
    state.vx += bx * SPACE.boost.dv;
    state.vy += by * SPACE.boost.dv;
    boostTriggered = true;
  }

  // Empuxo do jetpack
  const accel = SPACE.thrust * thrustScale;
  state.vx += dx * accel * dt;
  state.vy += dy * accel * dt;

  // Gravidade de todos os planetas ativos + checagem de R_kill
  let gravKilled = false;
  let killedByPlanet = -1;
  let maxGravIntensity = 0;

  for (let i = 0; i < planets.length; i++) {
    const pl = planets[i];
    if (!pl) continue;
    const g = gravAccel(state.sx, state.sy, pl.cx, pl.cy);
    if (g.kill) {
      gravKilled = true;
      killedByPlanet = i;
    } else if (g.dist < PLANET_GRAV.rGrav) {
      state.vx += g.ax * dt;
      state.vy += g.ay * dt;
      const intensity = Math.min(1, Math.max(0, 1 - (g.dist - PLANET_GRAV.rKill) / (PLANET_GRAV.rGrav - PLANET_GRAV.rKill)));
      if (intensity > maxGravIntensity) maxGravIntensity = intensity;
    }
  }

  // Amortecimento exponencial por eixo somente quando o direcional daquele eixo está solto e fora da janela de boost
  if (state.boostTimer <= 0) {
    const dampFactor = Math.exp(-SPACE.damping * dt);
    if (rawX === 0) state.vx *= dampFactor;
    if (rawY === 0) state.vy *= dampFactor;
  }

  // Limite de velocidade (D4: maxSpeed em voo normal; maxSpeed + boost.dv na janela ativa do Impulso)
  const cap = state.boostTimer > 0 ? SPACE.maxSpeed + SPACE.boost.dv : SPACE.maxSpeed;
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > cap) {
    const k = cap / speed;
    state.vx *= k;
    state.vy *= k;
  }

  // Integração de posição e limites de tela
  state.sx += state.vx * dt;
  state.sy += state.vy * dt;

  if (state.sx < SPACE.bounds.minX) {
    state.sx = SPACE.bounds.minX;
    if (state.vx < 0) state.vx = 0;
  } else if (state.sx > maxX) {
    state.sx = maxX;
    if (state.vx > 0) state.vx = 0;
  }

  if (state.sy < SPACE.bounds.minY) {
    state.sy = SPACE.bounds.minY;
    if (state.vy < 0) state.vy = 0;
  } else if (state.sy > SPACE.bounds.maxY) {
    state.sy = SPACE.bounds.maxY;
    if (state.vy > 0) state.vy = 0;
  }

  return {
    gravKilled,
    killedByPlanet,
    maxGravIntensity,
    boostTriggered,
    punchTriggered,
  };
}

/** Retorna true se o soco do Pardo está dentro da janela ativa de dano. */
export function isSpacePunchActive(punchTimer: number): boolean {
  if (punchTimer <= 0) return false;
  const elapsed = SPACE.punch.total - punchTimer;
  return elapsed >= SPACE.punch.windup && elapsed < SPACE.punch.windup + SPACE.punch.active;
}

/**
 * Retângulo da caixa de soco do Pardo em coordenadas de MUNDO (ou tela se `camX = 0`).
 * Retorna `null` fora da janela ativa do soco.
 */
export function spacePunchBox(state: Pick<SpacePlayerState, 'sx' | 'sy' | 'punchTimer'>, camX: number): RectBox | null {
  if (!isSpacePunchActive(state.punchTimer)) return null;
  const halfW = SPACE.playerHitbox.w / 2;
  const x = camX + state.sx + halfW - 2;
  const y = state.sy - SPACE.punch.h / 2;
  return {
    x,
    y,
    w: SPACE.punch.reach + 2,
    h: SPACE.punch.h,
  };
}

// ── Inimigos e Obstáculos (funções puras determinísticas) ───────────────────

export interface LinearSpacePos {
  phase: 'inactive' | 'warn' | 'active';
  screenX: number;
  worldX: number;
  y: number;
  warnLeft: number;
}

/**
 * Posição do Meteoro Comum (`m`) ou Meteoro Flamejante (`M`) em função pura de `camX`.
 * Ativa quando `spawnX` chega à borda direita (`camX + viewW >= spawnX`).
 * `spec.speed` é velocidade própria para a esquerda no mundo; em tela soma-se `SPACE.scrollSpeed`.
 * Para `isFire = true`, fica `warnT = 0.5 s` na borda direita em aviso antes de entrar.
 */
export function meteorPos(
  camX: number,
  spawnX: number,
  spawnY: number,
  isFire = false,
): LinearSpacePos {
  const spec = isFire ? SPACE_ENEMIES.meteor_fire : SPACE_ENEMIES.meteor;
  const triggerCamX = spawnX - SPACE.viewW;
  const warnCamX = triggerCamX - spec.warnT * SPACE.scrollSpeed;
  const startScreenX = SPACE.viewW + spec.w / 2;

  if (camX < warnCamX) {
    return {
      phase: 'inactive',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: spawnY,
      warnLeft: spec.warnT,
    };
  }

  if (isFire && camX < triggerCamX) {
    const warnLeft = Math.max(0, (triggerCamX - camX) / SPACE.scrollSpeed);
    return {
      phase: 'warn',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: spawnY,
      warnLeft,
    };
  }

  const elapsed = (camX - triggerCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX - (SPACE.scrollSpeed + spec.speed) * elapsed;
  return {
    phase: 'active',
    screenX,
    worldX: camX + screenX,
    y: spawnY,
    warnLeft: 0,
  };
}

export interface CometPosResult extends LinearSpacePos {
  dirY: 1 | -1;
  vxScreen: number;
  vyScreen: number;
}

/**
 * Posição do Cometa de Gelo (`g`) em função pura de `camX` e da linha `row` do mapa.
 * D15: linhas 0–4 → desce (+1); linhas 6–10 → sobe (-1); linha 5 → desce (+1).
 * Inclinação de 45° no espaço (`vxWorld = -110 * SQRT1_2`, `vyWorld = dirY * 110 * SQRT1_2`),
 * somando `-scrollSpeed` em `vxScreen`, com telegraph de 0,7 s.
 */
export function cometPos(
  camX: number,
  spawnX: number,
  spawnY: number,
  row: number,
): CometPosResult {
  const spec = SPACE_ENEMIES.comet_ice;
  const dirY: 1 | -1 = row >= 6 ? -1 : 1;
  const vxScreen = -(SPACE.scrollSpeed + spec.speed * Math.SQRT1_2);
  const vyScreen = dirY * spec.speed * Math.SQRT1_2;
  const enterCamX = spawnX - SPACE.viewW;
  const warnCamX = enterCamX - spec.warnT * SPACE.scrollSpeed;
  const startScreenX = SPACE.viewW + spec.w / 2;

  if (camX < warnCamX) {
    return {
      phase: 'inactive',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: spawnY,
      warnLeft: spec.warnT,
      dirY,
      vxScreen,
      vyScreen,
    };
  }

  if (camX < enterCamX) {
    const warnLeft = Math.max(0, (enterCamX - camX) / SPACE.scrollSpeed);
    return {
      phase: 'warn',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: spawnY,
      warnLeft,
      dirY,
      vxScreen,
      vyScreen,
    };
  }

  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX + vxScreen * elapsed;
  const y = spawnY + vyScreen * elapsed;
  return {
    phase: 'active',
    screenX,
    worldX: camX + screenX,
    y,
    warnLeft: 0,
    dirY,
    vxScreen,
    vyScreen,
  };
}

/**
 * Posição do OVNI Patrulheiro (`u`) em função pura de `camX`.
 * Entra pela borda direita a `-(scrollSpeed + 40) = -136 px/s` em tela com senoide vertical `±28 px`, período `2.4 s`.
 */
export function ufoPos(camX: number, spawnX: number, spawnY: number): LinearSpacePos {
  const spec = SPACE_ENEMIES.ufo;
  const enterCamX = spawnX - SPACE.viewW;
  const startScreenX = SPACE.viewW + spec.w / 2;

  if (camX < enterCamX) {
    return {
      phase: 'inactive',
      screenX: startScreenX,
      worldX: camX + startScreenX,
      y: spawnY,
      warnLeft: 0,
    };
  }

  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX - (SPACE.scrollSpeed + spec.speed) * elapsed;
  const y = spawnY + spec.ampY * Math.sin((2 * Math.PI * elapsed) / spec.periodY);
  return {
    phase: 'active',
    screenX,
    worldX: camX + screenX,
    y,
    warnLeft: 0,
  };
}

/**
 * Máquina de estados de disparo do OVNI Patrulheiro:
 * quando a distância horizontal ao Pardo está em `[120, 160]` (e ainda não atirou),
 * carrega por `0.55 s` e retorna `true` no passo exato em que dispara 1 `plasma_orb`.
 */
export function ufoShouldFire(
  state: UfoState,
  ufoScreenX: number,
  playerScreenX: number,
  dt: number,
): boolean {
  if (state.phase === 'fired') return false;
  const spec = SPACE_ENEMIES.ufo;
  const dist = ufoScreenX - playerScreenX;

  if (state.phase === 'patrol') {
    if (dist >= spec.fireDistMin && dist <= spec.fireDistMax) {
      state.phase = 'charging';
      state.chargeTimer = spec.chargeT;
    }
    return false;
  }

  // state.phase === 'charging'
  state.chargeTimer -= dt;
  if (state.chargeTimer <= 0) {
    state.phase = 'fired';
    state.chargeTimer = 0;
    return true;
  }
  return false;
}

/**
 * Passo de estado do Alien de Jetpack (`a`) em coordenadas de tela:
 * entra a `-55 px/s` ajustando `y` até `vyMax = 48 px/s`; a `<= 90 px` horizontais do Pardo
 * trava `y` por `0.45 s` e depois avança reto a `-140 px/s` em tela.
 */
export function alienJetStep(
  state: AlienJetState,
  playerScreenX: number,
  playerScreenY: number,
  dt: number,
): void {
  const spec = SPACE_ENEMIES.alien_jet;

  switch (state.phase) {
    case 'approach': {
      state.sx -= spec.speed * dt;
      const dy = playerScreenY - state.sy;
      const desiredVy = Math.abs(dy) > 0.5 ? Math.sign(dy) * Math.min(spec.vyMax, Math.abs(dy) / Math.max(dt, 1e-4)) : 0;
      state.vy = desiredVy;
      state.sy += state.vy * dt;
      if (state.sx - playerScreenX <= spec.lockDist) {
        state.phase = 'lock';
        state.lockTimer = spec.lockT;
        state.vy = 0;
      }
      break;
    }
    case 'lock':
      state.vy = 0;
      state.lockTimer -= dt;
      if (state.lockTimer <= 0) {
        state.phase = 'dash';
        state.lockTimer = 0;
      }
      break;
    case 'dash':
      state.sx -= spec.dashSpeed * dt;
      break;
  }
}

/**
 * Passo de estado da Mina Orbital Magnética (`b`):
 * parada no mundo; se o Pardo entra em `dist < 56 px`, inicia contagem de `0.5 s` ('arming') → 'armed'.
 */
export function mineStep(
  state: SpaceMineState,
  mineWorldX: number,
  mineWorldY: number,
  playerWorldX: number,
  playerWorldY: number,
  dt: number,
): void {
  if (state.phase === 'armed') return;
  const spec = SPACE_ENEMIES.space_mine;
  if (state.phase === 'idle') {
    const dist = Math.hypot(mineWorldX - playerWorldX, mineWorldY - playerWorldY);
    if (dist < spec.armDist) {
      state.phase = 'arming';
      state.timer = spec.armT;
    }
    return;
  }
  state.timer -= dt;
  if (state.timer <= 0) {
    state.phase = 'armed';
    state.timer = 0;
  }
}

/** Ciclo do Satélite de Varredura (`S`): 0.8 s charge → 0.7 s fire → 1.2 s off (período 2.7 s). */
export function beamState(t: number): BeamPhase {
  const S = SPACE_OBSTACLES.satellite_beam;
  const m = ((t % S.cycleT) + S.cycleT) % S.cycleT;
  if (m + 1e-9 < S.chargeT) return 'charge';
  if (m + 1e-9 < S.chargeT + S.fireT) return 'fire';
  return 'off';
}

/** Ciclo da Rajada de Vento Solar (`v`): 0..1.0 s warn → 1.0..2.4 s active → >= 2.4 s done. */
export function solarWindState(t: number): SolarWindPhase {
  const V = SPACE_OBSTACLES.solar_wind;
  if (t + 1e-9 < V.warnT) return 'warn';
  if (t + 1e-9 < V.totalT) return 'active';
  return 'done';
}

/** Posição do Satélite em Órbita (`s`) em função pura de `camX` (deriva `-15 px/s` no mundo). */
export function satellitePos(camX: number, spawnX: number, spawnY: number): LinearSpacePos {
  const spec = SPACE_OBSTACLES.satellite;
  const enterCamX = spawnX - SPACE.viewW;
  const startScreenX = SPACE.viewW + spec.w / 2;
  if (camX < enterCamX) {
    return { phase: 'inactive', screenX: startScreenX, worldX: camX + startScreenX, y: spawnY, warnLeft: 0 };
  }
  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX - (SPACE.scrollSpeed + spec.speed) * elapsed;
  return { phase: 'active', screenX, worldX: camX + screenX, y: spawnY, warnLeft: 0 };
}

/** Posição do Lixo Espacial (`d`) em função pura de `camX` (deriva `-20 px/s` no mundo). */
export function debrisPos(camX: number, spawnX: number, spawnY: number): LinearSpacePos {
  const spec = SPACE_OBSTACLES.space_debris;
  const enterCamX = spawnX - SPACE.viewW;
  const startScreenX = SPACE.viewW + spec.w / 2;
  if (camX < enterCamX) {
    return { phase: 'inactive', screenX: startScreenX, worldX: camX + startScreenX, y: spawnY, warnLeft: 0 };
  }
  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  const screenX = startScreenX - (SPACE.scrollSpeed + spec.speed) * elapsed;
  return { phase: 'active', screenX, worldX: camX + screenX, y: spawnY, warnLeft: 0 };
}

export interface BeamSatelliteResult {
  active: boolean;
  beamPhase: BeamPhase;
  worldX: number;
  screenX: number;
  y: number;
  fromTop: boolean;
  bodyBox: RectBox;
  beamBox: RectBox;
}

/**
 * Posição e feixe do Satélite de Varredura (`S`) em função pura de `camX`.
 * Posiciona-se no topo (`y = 22`) se `spawnY < 90`, ou na base (`y = 158`) caso contrário, preso ao mundo (`worldX = spawnX`).
 */
export function beamSatellitePos(camX: number, spawnX: number, spawnY: number): BeamSatelliteResult {
  const S = SPACE_OBSTACLES.satellite_beam;
  const fromTop = spawnY < SPACE.viewH / 2;
  const y = fromTop ? S.topY : S.bottomY;
  const screenX = spawnX - camX;
  const enterCamX = spawnX - SPACE.viewW;
  const active = camX >= enterCamX && screenX + S.w / 2 >= 0;
  const elapsed = Math.max(0, (camX - enterCamX) / SPACE.scrollSpeed);
  const beamPhase: BeamPhase = active ? beamState(elapsed) : 'off';
  const bodyBox: RectBox = { x: spawnX - S.w / 2, y: y - S.h / 2, w: S.w, h: S.h };
  const beamY = fromTop ? y + S.h / 2 : y - S.h / 2 - S.beamH;
  const beamBox: RectBox = { x: spawnX - S.beamW / 2, y: beamY, w: S.beamW, h: S.beamH };
  return { active, beamPhase, worldX: spawnX, screenX, y, fromTop, bodyBox, beamBox };
}

export interface SolarWindAtResult {
  phase: 'inactive' | SolarWindPhase;
  y: number;
  yTop: number;
  yBottom: number;
  elapsed: number;
}

/** Estado da Rajada de Vento Solar (`v`) em função pura de `camX` (ativa quando `spawnX` chega à borda direita). */
export function solarWindAt(camX: number, spawnX: number, spawnY: number): SolarWindAtResult {
  const V = SPACE_OBSTACLES.solar_wind;
  const enterCamX = spawnX - SPACE.viewW;
  const yTop = spawnY - V.h / 2;
  const yBottom = spawnY + V.h / 2;
  if (camX < enterCamX) {
    return { phase: 'inactive', y: spawnY, yTop, yBottom, elapsed: 0 };
  }
  const elapsed = (camX - enterCamX) / SPACE.scrollSpeed;
  return { phase: solarWindState(elapsed), y: spawnY, yTop, yBottom, elapsed };
}

/** Avaliação em estrelas da Fase 7 (D7): mínimo 1, máximo 5. */
export function spaceStars(hits: number, gravDeaths: number): number {
  return Math.max(1, SPACE.maxStars - hits - 2 * gravDeaths);
}
