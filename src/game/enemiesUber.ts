import type { Entity, Rect, World } from '../core/types';
import { Tile } from '../core/types';
import { TILE } from '../core/constants';
import { type Collision, moveBody } from '../core/physics';

/** Inimigos da Fase 5 — Marginal de São Paulo (todos morrem com 1 soco). */
export type UberEnemyKind = 'motoboy' | 'drone' | 'patinete' | 'pichador';

type Dir = 1 | -1;

const GRAV = 900;
const MAX_FALL = 360;
const LATA_GRAV = 480;
/** Pista principal do Pardo no autoscroller (teto do Uber = base da linha 9 = 160 px). */
const ROAD_Y = 10 * TILE;

interface SpriteRef {
  name: string;
  frame: number;
  flip: boolean;
  align?: 'bottom' | 'center';
}

interface EnemyAi {
  update(e: Entity, dt: number, world: World): void;
  sprite(): SpriteRef;
  onKill?(e: Entity, dir: Dir, world: World): void;
}

interface Thrown {
  rot: number;
  spin: number;
  dir: Dir;
}

const cx = (r: Rect): number => r.x + r.w / 2;

/** Fase determinística [0..1) a partir da posição inicial para dessincronizar ciclos. */
function phase01(x: number, y: number): number {
  const v = Math.sin(x * 0.0713 + y * 0.0539) * 43758.5453;
  return v - Math.floor(v);
}

/** Empurra levemente em X no 1º frame caso uma hitbox mais larga que 16px nasça encostada em parede. */
function unstuckSpawnX(e: Entity, world: World): void {
  const r0 = Math.floor(e.y / TILE);
  const r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  const txL = Math.floor(e.x / TILE);
  const txR = Math.floor((e.x + e.w - 0.001) / TILE);
  if (txL >= txR) return;
  let solidL = false;
  let solidR = false;
  for (let ty = r0; ty <= r1; ty++) {
    if (world.level.isSolid(txL, ty)) solidL = true;
    if (world.level.isSolid(txR, ty)) solidR = true;
  }
  if (solidL && !solidR) e.x = (txL + 1) * TILE;
  else if (solidR && !solidL) e.x = txR * TILE - e.w;
}

/**
 * Há chão seguro à frente-abaixo (tile sólido, one-way ou faixa da pista em `y = 10 * TILE`
 * quando há asfalto `Tile.GroundTop` na linha 11) e sem perigo (`isHazard`) à frente?
 */
function safeGroundAhead(e: Entity, dir: Dir, world: World): boolean {
  const ax = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const tx = Math.floor(ax / TILE);
  const tyBelow = Math.floor((e.y + e.h + 1) / TILE);
  const hasTileGround = world.level.isSolid(tx, tyBelow) || world.level.isOneWay(tx, tyBelow);
  const hasUberLaneGround = tyBelow === 10 && world.level.tileAt(tx, 11) === Tile.GroundTop;
  if (!hasTileGround && !hasUberLaneGround) return false;
  if (world.level.isHazard(tx, tyBelow)) return false;
  const r0 = Math.floor(e.y / TILE);
  const r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  for (let ty = r0; ty <= r1; ty++) {
    if (world.level.isHazard(tx, ty)) return false;
  }
  return true;
}

/**
 * Aplica gravidade + `moveBody` e apoia inimigos terrestres na pista principal (`y = 10 * TILE = 160`)
 * sempre que a coluna atual tiver asfalto (`Tile.GroundTop`) na linha 11.
 */
function stepGroundEnemy(e: Entity, dt: number, world: World): Collision {
  e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
  const c = moveBody(e, world.level, dt);
  const foot = e.y + e.h;
  const tx = Math.floor(cx(e) / TILE);
  if (
    e.vy >= 0 &&
    foot >= ROAD_Y &&
    foot <= ROAD_Y + 8 &&
    world.level.tileAt(tx, 11) === Tile.GroundTop
  ) {
    e.y = ROAD_Y - e.h;
    e.vy = 0;
    c.bottom = true;
  }
  return c;
}

function guardDead(e: Entity, world: World): void {
  if (e.y > world.level.heightPx + 60) e.dead = true;
}

/**
 * Monta a entidade de um inimigo da Marginal de São Paulo.
 * REGRA DE OURO: todos os inimigos desta fase morrem com apenas 1 golpe (1 soco)!
 */
function buildUberEnemy(
  kind: UberEnemyKind,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number,
  makeAi: (e: Entity) => EnemyAi,
): Entity {
  let thrown: Thrown | null = null;
  let ai!: EnemyAi;

  const e: Entity = {
    kind,
    dead: false,
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (thrown) {
        e.vy = Math.min(e.vy + GRAV * dt, 520);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        thrown.rot += thrown.spin * dt;
        if (e.y > world.level.heightPx + 60) e.dead = true;
        return;
      }
      ai.update(e, dt, world);
    },
    draw(ctx, world) {
      const s = ai.sprite();
      const size = world.sprites.size(s.name);
      const sx = e.x + e.w / 2 - size.w / 2;
      const sy = s.align === 'center' ? e.y + e.h / 2 - size.h / 2 : e.y + e.h - size.h;
      if (thrown) {
        ctx.save();
        ctx.translate(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2));
        ctx.rotate(thrown.rot);
        world.sprites.draw(ctx, s.name, s.frame, -size.w / 2, -size.h / 2, thrown.dir < 0);
        ctx.restore();
        return;
      }
      world.sprites.draw(ctx, s.name, s.frame, sx, sy, s.flip);
    },
    onPunch(world, dir) {
      if (thrown) return false;
      ai.onKill?.(e, dir, world);
      thrown = { rot: 0, spin: dir * 12, dir };
      e.vx = dir * 150;
      e.vy = -210;
      world.audio.play('hit');
      world.addScore(points, cx(e), e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead) return;
      world.player.hurt(world, cx(e), 1);
    },
  };

  ai = makeAi(e);
  return e;
}

// ── 1. Motoboy do Grau (`'motoboy'`): patrulha 36 px/s + grau (`rev`) + arrancada 95 px/s ──
function motoboyAi(e: Entity): EnemyAi {
  type State = 'patrol' | 'wheelie_warn' | 'dash' | 'rest';
  const SIGHT = 8 * TILE; // 128 px
  let state: State = 'patrol';
  let dir: Dir = -1;
  let timer = 0;
  let dashCd = 0;
  let t = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      if (dashCd > 0) dashCd = Math.max(0, dashCd - dt);

      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';

      if (state === 'patrol') {
        e.vx = dir * 36;
        const c = stepGroundEnemy(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;

        const dx = cx(p) - cx(e);
        const dy = p.y + p.h - (e.y + e.h);
        if (
          c.bottom &&
          active &&
          dashCd <= 0 &&
          Math.abs(dx) <= SIGHT &&
          Math.abs(dy) <= 24
        ) {
          if (Math.abs(dx) > 1) dir = dx >= 0 ? 1 : -1;
          if (safeGroundAhead(e, dir, world)) {
            state = 'wheelie_warn';
            timer = 0.32;
            e.vx = 0;
            world.audio.play('rev');
            world.fx('dust', cx(e) - dir * 10, e.y + e.h, (dir * -1) as Dir);
          }
        }
      } else if (state === 'wheelie_warn') {
        e.vx = 0;
        stepGroundEnemy(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'dash';
          timer = 0.85;
          world.fx('dust', cx(e) - dir * 10, e.y + e.h, (dir * -1) as Dir);
        }
      } else if (state === 'dash') {
        if (!safeGroundAhead(e, dir, world)) {
          e.vx = 0;
          state = 'rest';
          timer = 0.5;
          stepGroundEnemy(e, dt, world);
        } else {
          e.vx = dir * 95;
          const c = stepGroundEnemy(e, dt, world);
          timer -= dt;
          if (c.left || c.right || (c.bottom && !safeGroundAhead(e, dir, world)) || timer <= 0) {
            e.vx = 0;
            state = 'rest';
            timer = 0.5;
          }
        }
      } else {
        e.vx = 0;
        stepGroundEnemy(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          if (!safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;
          state = 'patrol';
          dashCd = 0.45;
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'wheelie_warn' || state === 'dash') {
        return { name: 'motoboy_wheelie', frame: 0, flip: dir < 0 };
      }
      const frame = state === 'patrol' ? Math.floor(t / 0.12) % 2 : 0;
      return { name: 'motoboy', frame, flip: dir < 0 };
    },
  };
}

// ── 2. Drone de Delivery (`'drone'`): senoide aérea + rasante diagonal ────────────────
function droneAi(e: Entity): EnemyAi {
  type State = 'patrol' | 'warn' | 'dive' | 'recover';
  const PATROL_RANGE = 2.5 * TILE; // 40 px
  const DIVE_TRIGGER = 6.5 * TILE; // 104 px
  const homeX = e.x;
  const homeY = e.y;
  const phase = phase01(homeX, homeY) * Math.PI * 2;

  let state: State = 'patrol';
  let dir: Dir = -1;
  let face: Dir = -1;
  let timer = 0;
  let cd = 0;
  let t = 0;

  const blockedAt = (world: World, nx: number, ny: number): boolean => {
    const tx0 = Math.floor(nx / TILE);
    const tx1 = Math.floor((nx + e.w - 0.001) / TILE);
    const ty0 = Math.floor(ny / TILE);
    const ty1 = Math.floor((ny + e.h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (world.level.isSolid(tx, ty)) return true;
      }
    }
    return false;
  };

  return {
    update(_e, dt, world) {
      t += dt;
      if (cd > 0) cd = Math.max(0, cd - dt);

      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';
      const dx = cx(p) - cx(e);

      if (state === 'patrol') {
        e.vx = dir * 28;
        const nx = e.x + e.vx * dt;
        const ny = homeY + Math.sin(t * 4.5 + phase) * 5;
        if (
          (dir > 0 && nx >= homeX + PATROL_RANGE) ||
          (dir < 0 && nx <= homeX - PATROL_RANGE) ||
          blockedAt(world, nx, e.y)
        ) {
          dir = (dir * -1) as Dir;
        } else {
          e.x = nx;
        }
        if (!blockedAt(world, e.x, ny)) e.y = ny;
        face = dir;

        if (active && cd <= 0 && Math.abs(dx) <= DIVE_TRIGGER) {
          state = 'warn';
          timer = 0.35;
          e.vx = 0;
          e.vy = 0;
          face = dx >= 0 ? 1 : -1;
        }
      } else if (state === 'warn') {
        e.vx = 0;
        e.vy = 0;
        if (active && Math.abs(dx) > 1) face = dx >= 0 ? 1 : -1;
        timer -= dt;
        if (timer <= 0) {
          state = 'dive';
          timer = 0.6;
          e.vx = face * 80;
          e.vy = 70;
        }
      } else if (state === 'dive') {
        timer -= dt;
        const nx = e.x + e.vx * dt;
        const maxDiveY = ROAD_Y - e.h - 2;
        const ny = Math.min(maxDiveY, e.y + e.vy * dt);
        if (!blockedAt(world, nx, e.y) && Math.abs(nx - homeX) <= 5 * TILE) {
          e.x = nx;
        }
        if (!blockedAt(world, e.x, ny)) {
          e.y = ny;
        }
        if (timer <= 0 || e.y >= maxDiveY) {
          state = 'recover';
          cd = 1.4;
        }
      } else {
        // 'recover': sobe suavemente de volta até homeY
        const dyHome = homeY - e.y;
        const stepY = Math.sign(dyHome) * Math.min(Math.abs(dyHome), 65 * dt);
        if (!blockedAt(world, e.x, e.y + stepY)) e.y += stepY;

        const dxHome = homeX - e.x;
        if (Math.abs(dxHome) > PATROL_RANGE) {
          const stepX = Math.sign(dxHome) * Math.min(Math.abs(dxHome), 45 * dt);
          if (!blockedAt(world, e.x + stepX, e.y)) e.x += stepX;
        }

        if (Math.abs(homeY - e.y) <= 1.5) {
          e.y = homeY;
          state = 'patrol';
        }
      }
    },
    sprite() {
      if (state === 'warn' || state === 'dive') {
        return { name: 'drone_dive', frame: 0, flip: face < 0, align: 'center' };
      }
      return { name: 'drone', frame: Math.floor(t / 0.08) % 2, flip: face < 0, align: 'center' };
    },
    onKill(_e, _dir, world) {
      world.fx('debris', cx(e), e.y + e.h / 2);
    },
  };
}

// ── 3. Faria Limer de Patinete (`'patinete'`): desliza a 45 px/s + bunny-hop ──────────
function patineteAi(e: Entity): EnemyAi {
  const JUMP_TRIGGER = 5 * TILE; // 80 px
  let dir: Dir = -1;
  let onGround = false;
  let jumpCd = 0.25;
  let t = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      if (jumpCd > 0) jumpCd = Math.max(0, jumpCd - dt);

      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';

      e.vx = dir * 45;
      if (!onGround && !safeGroundAhead(e, dir, world)) {
        // Evita se jogar em abismos durante o bunny-hop
        e.vx = 0;
      }

      const c = stepGroundEnemy(e, dt, world);
      onGround = c.bottom;

      if (c.left || c.right) {
        dir = c.left ? 1 : -1;
      } else if (onGround && !safeGroundAhead(e, dir, world)) {
        dir = (dir * -1) as Dir;
      }

      const dx = cx(p) - cx(e);
      const dy = p.y + p.h - (e.y + e.h);
      if (onGround && active && jumpCd <= 0 && Math.abs(dx) <= JUMP_TRIGGER && Math.abs(dy) <= 36) {
        if (Math.abs(dx) > 2) {
          const wantDir: Dir = dx >= 0 ? 1 : -1;
          if (safeGroundAhead(e, wantDir, world)) dir = wantDir;
        }
        e.vy = -215;
        onGround = false;
        jumpCd = 1.3;
        world.audio.play('boing');
      }

      guardDead(e, world);
    },
    sprite() {
      if (!onGround) {
        return { name: 'patinete_jump', frame: 0, flip: dir < 0 };
      }
      return { name: 'patinete', frame: Math.floor(t / 0.14) % 2, flip: dir < 0 };
    },
  };
}

// ── Projétil do Pichador (`lata`): voa em arco, 1 de dano, morre com 1 soco (+10 pts) ─
function createLata(spawnX: number, spawnY: number, dir: Dir): Entity {
  let t = 0;
  const d: Entity = {
    kind: 'lata',
    dead: false,
    x: spawnX - 4,
    y: spawnY - 4,
    w: 8,
    h: 8,
    vx: 95 * dir,
    vy: -170,
    update(dt, world) {
      t += dt;
      d.vy = Math.min(d.vy + LATA_GRAV * dt, MAX_FALL);
      const c = moveBody(d, world.level, dt);
      if (c.bottom || c.top || c.left || c.right || d.y > ROAD_Y + 8) {
        world.fx('debris', d.x + d.w / 2, d.y + d.h / 2);
        d.dead = true;
      } else if (d.y > world.level.heightPx + 60 || d.x < -24 || d.x > world.level.widthPx + 24) {
        d.dead = true;
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'lata', Math.floor(t / 0.1) % 2, d.x, d.y);
    },
    onPunch(world) {
      if (d.dead) return false;
      d.dead = true;
      world.audio.play('hit');
      world.fx('debris', d.x + d.w / 2, d.y + d.h / 2);
      world.addScore(10, d.x + d.w / 2, d.y);
      return true;
    },
    onTouchPlayer(world) {
      if (d.dead || world.player.dead) return;
      d.dead = true;
      world.player.hurt(world, d.x + d.w / 2, 1);
    },
  };
  return d;
}

// ── 4. Pichador do Viaduto (`'pichador'`): espera 1,4 s → aviso 0,4 s → lança `lata` ─
function pichadorAi(e: Entity, homeX: number): EnemyAi {
  type State = 'wait' | 'warn' | 'release';
  const RANGE = 8.5 * TILE; // 136 px
  const WAIT = 1.4;
  const WARN = 0.4;
  const RELEASE = 0.25;

  let state: State = 'wait';
  let timer = 0.35 + phase01(homeX, e.y) * 0.9;
  let face: Dir = -1;
  let t = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';
      const dx = cx(p) - cx(e);

      e.vx = 0;
      stepGroundEnemy(e, dt, world);

      if (state !== 'release' && !p.dead && Math.abs(dx) > 1) {
        face = dx >= 0 ? 1 : -1;
      }

      if (state === 'wait') {
        if (active && Math.abs(dx) <= RANGE) {
          timer -= dt;
          if (timer <= 0) {
            state = 'warn';
            timer = WARN;
          }
        } else {
          timer = Math.min(Math.max(timer, 0.3), WAIT);
        }
      } else if (state === 'warn') {
        timer -= dt;
        if (timer <= 0) {
          state = 'release';
          timer = RELEASE;
          world.audio.play('throw');
          world.spawn(createLata(cx(e) + face * 6, e.y + 4, face));
        }
      } else {
        timer -= dt;
        if (timer <= 0) {
          state = 'wait';
          timer = WAIT;
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'warn') return { name: 'pichador_throw', frame: 0, flip: face < 0 };
      if (state === 'release') return { name: 'pichador_throw', frame: 1, flip: face < 0 };
      return { name: 'pichador', frame: Math.floor(t / 0.28) % 2, flip: face < 0 };
    },
  };
}

/** (centerX, footY) = centro horizontal e base dos pés. CONTRATO: assinatura e `kind` não mudam. */
export function createUberEnemy(kind: UberEnemyKind, centerX: number, footY: number): Entity {
  switch (kind) {
    case 'motoboy':
      return buildUberEnemy(kind, centerX - 11, footY - 18, 22, 18, 300, motoboyAi);
    case 'drone':
      return buildUberEnemy(kind, centerX - 8, footY - 12, 16, 12, 250, droneAi);
    case 'patinete':
      return buildUberEnemy(kind, centerX - 7, footY - 20, 14, 20, 200, patineteAi);
    case 'pichador':
      return buildUberEnemy(kind, centerX - 6, footY - 20, 12, 20, 350, (e) => pichadorAi(e, centerX));
  }
}
