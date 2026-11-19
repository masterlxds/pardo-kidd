import type { Entity, Rect, World } from '../core/types';
import { Tile } from '../core/types';
import { TILE } from '../core/constants';
import { moveBody, overlaps } from '../core/physics';

export type RioEnemyKind = 'caramelo' | 'pombo' | 'gato' | 'capivara' | 'traficante';

type Dir = 1 | -1;

const GRAV = 900;
const MAX_FALL = 360;
const DROP_GRAV = 520;
const CAPIVARA_STUN = 1.2;

interface SpriteRef {
  name: string;
  frame: number;
  flip: boolean;
  /** 'bottom' (padrão): base do sprite na base da hitbox; 'center': centrado na hitbox */
  align?: 'bottom' | 'center';
}

/**
 * Resultado customizado de soco:
 * - 'kill': derrota e arremessa para fora da tela
 * - 'stun': 1º soco em inimigo de 2 socos (conecta sem pontuar nem arremessar)
 * - 'bounce': soco rebatido (retorna false em onPunch)
 */
type PunchOutcome = 'kill' | 'stun' | 'bounce';

interface EnemyAi {
  update(e: Entity, dt: number, world: World): void;
  sprite(): SpriteRef;
  onHit?(e: Entity, dir: Dir, world: World): PunchOutcome;
  harmless?(): boolean;
  onTouch?(e: Entity, world: World): void;
  stunned?(): boolean;
}

interface Thrown {
  rot: number;
  spin: number;
  dir: Dir;
}

const cx = (r: Rect): number => r.x + r.w / 2;
const cy = (r: Rect): number => r.y + r.h / 2;

/** Fase determinística [0..1) a partir da posição inicial para dessincronizar ciclos. */
function phase01(x: number, y: number): number {
  const v = Math.sin(x * 0.0713 + y * 0.0539) * 43758.5453;
  return v - Math.floor(v);
}

/** Alpha pulsante durante atordoamento. */
function stunAlpha(t: number): number {
  return Math.floor(t / 0.08) % 2 === 0 ? 0.4 : 1;
}

/** Desenha `stun_stars` girando sobre a cabeça do inimigo atordoado. */
function drawStunStars(ctx: CanvasRenderingContext2D, world: World, x: number, top: number, t: number): void {
  const sz = world.sprites.size('stun_stars');
  world.sprites.draw(
    ctx,
    'stun_stars',
    Math.floor(t / 0.1) % 2,
    x - sz.w / 2 + Math.sin(t * 9) * 2,
    top - sz.h - 1 + Math.cos(t * 9) * 1,
  );
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

/** Há chão seguro (sólido ou one-way) à frente-abaixo e sem perigo (`isHazard`) à frente? */
function safeGroundAhead(e: Entity, dir: Dir, world: World): boolean {
  const ax = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const tx = Math.floor(ax / TILE);
  const tyBelow = Math.floor((e.y + e.h + 1) / TILE);
  if (!world.level.isSolid(tx, tyBelow) && !world.level.isOneWay(tx, tyBelow)) return false;
  if (world.level.isHazard(tx, tyBelow)) return false;
  const r0 = Math.floor(e.y / TILE);
  const r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  for (let ty = r0; ty <= r1; ty++) {
    if (world.level.isHazard(tx, ty)) return false;
  }
  return true;
}

function fall(e: Entity, dt: number, world: World) {
  e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
  return moveBody(e, world.level, dt);
}

function guardDead(e: Entity, world: World): void {
  if (e.y > world.level.heightPx + 60) e.dead = true;
}

/** Monta a entidade de um inimigo carioca com arremesso ao morrer, colisão e renderização. */
function buildRioEnemy(
  kind: RioEnemyKind,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number,
  makeAi: (e: Entity) => EnemyAi,
): Entity {
  let thrown: Thrown | null = null;
  let lifeT = 0;
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
      lifeT += dt;
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
      const isStunned = ai.stunned?.() ?? false;
      if (isStunned) {
        ctx.save();
        ctx.globalAlpha *= stunAlpha(lifeT);
        world.sprites.draw(ctx, s.name, s.frame, sx, sy, s.flip);
        ctx.restore();
        drawStunStars(ctx, world, e.x + e.w / 2, sy, lifeT);
      } else {
        world.sprites.draw(ctx, s.name, s.frame, sx, sy, s.flip);
      }
    },
    onPunch(world, dir) {
      if (thrown) return false;
      if (ai.onHit) {
        const res = ai.onHit(e, dir, world);
        if (res === 'bounce') return false;
        if (res === 'stun') return true;
      }
      thrown = { rot: 0, spin: dir * 12, dir };
      e.vx = dir * 150;
      e.vy = -210;
      // 'hit' toca no motor (resolvePunch) quando retorna true
      world.addScore(points, cx(e), e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead || ai.harmless?.()) return;
      if (ai.onTouch) ai.onTouch(e, world);
      else world.player.hurt(world, cx(e));
    },
  };

  ai = makeAi(e);
  return e;
}

// ── 1. Vira-Lata Caramelo: patrulha ágil + latido + bote rasante em arco ─────────────
function carameloAi(e: Entity): EnemyAi {
  type State = 'patrol' | 'bark' | 'leap' | 'rest';
  let state: State = 'patrol';
  let dir: Dir = -1;
  let t = 0;
  let timer = 0;
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

      if (state === 'patrol') {
        e.vx = dir * 38;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;

        const dx = cx(p) - cx(e);
        const dy = (p.y + p.h) - (e.y + e.h);
        if (c.bottom && active && dx * dir > 0 && Math.abs(dx) <= 80 && Math.abs(dy) <= 20) {
          state = 'bark';
          timer = 0.25;
          e.vx = 0;
          world.audio.play('bark');
        }
      } else if (state === 'bark') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'leap';
          timer = 0.08;
          e.vx = 135 * dir;
          e.vy = -145;
          e.y -= 1;
        }
      } else if (state === 'leap') {
        timer -= dt;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        if (timer <= 0 && c.bottom) {
          state = 'rest';
          timer = 0.5;
          e.vx = 0;
        }
      } else {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) state = 'patrol';
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'bark' || state === 'leap') {
        return { name: 'caramelo_bark', frame: 0, flip: dir < 0 };
      }
      const frame = state === 'patrol' ? Math.floor(t / 0.16) % 2 : 0;
      return { name: 'caramelo', frame, flip: dir < 0 };
    },
  };
}

// ── Projétil do Pombo (`dropping`): cai com gravidade 520, socável (+10 pts) ─────────
function createDropping(spawnCx: number, spawnY: number): Entity {
  let t = 0;
  const d: Entity = {
    kind: 'dropping',
    dead: false,
    x: spawnCx - 3,
    y: spawnY,
    w: 6,
    h: 6,
    vx: 0,
    vy: 0,
    update(dt, world) {
      t += dt;
      d.vy = Math.min(d.vy + DROP_GRAV * dt, MAX_FALL);
      const c = moveBody(d, world.level, dt);
      const mx = d.x + d.w / 2;
      if (c.bottom || c.top || c.left || c.right) {
        world.fx('splash', mx, d.y + d.h);
        d.dead = true;
      } else if (world.level.tileAt(Math.floor(mx / TILE), Math.floor((d.y + d.h) / TILE)) === Tile.Water) {
        world.fx('splash', mx, d.y + d.h);
        d.dead = true;
      } else if (d.y > world.level.heightPx + 60) {
        d.dead = true;
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'dropping', Math.floor(t / 0.1) % 2, d.x, d.y);
    },
    onPunch(world) {
      if (d.dead) return false;
      d.dead = true;
      // 'hit' toca no motor (resolvePunch)
      world.addScore(10, d.x + d.w / 2, d.y);
      return true;
    },
    onTouchPlayer(world) {
      if (d.dead || world.player.dead) return;
      d.dead = true;
      world.player.hurt(world, d.x + d.w / 2);
    },
  };
  return d;
}

// ── 2. Pombo-da-Praça: territorial aéreo em senoide + bombardeio `dropping` ──────────
function pomboAi(e: Entity, homeX: number, homeY: number): EnemyAi {
  const WAKE_DIST = 7 * TILE;   // 112px
  const LEASH = 10 * TILE;      // 160px
  const DROP_RANGE = 3.5 * TILE; // 56px
  const SPEED = 48;
  const AMP_Y = 10;
  const DROP_INTERVAL = 2.1;

  let awake = false;
  let dir: Dir = -1;
  let face: Dir = -1;
  let t = phase01(homeX, homeY) * 2;
  let dropCd = 0.6;
  let diveTimer = 0;

  const minX = homeX - LEASH - e.w / 2;
  const maxX = homeX + LEASH - e.w / 2;

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

  const moveClamped = (world: World, dx: number, dy: number): boolean => {
    let hitX = false;
    if (dx !== 0) {
      const nx = Math.max(minX, Math.min(maxX, e.x + dx));
      if (nx === e.x || blockedAt(world, nx, e.y)) hitX = true;
      else e.x = nx;
    }
    if (dy !== 0) {
      const ny = e.y + dy;
      if (!blockedAt(world, e.x, ny)) e.y = ny;
    }
    return hitX;
  };

  return {
    update(_e, dt, world) {
      t += dt;
      if (diveTimer > 0) diveTimer = Math.max(0, diveTimer - dt);
      if (dropCd > 0) dropCd = Math.max(0, dropCd - dt);

      const p = world.player;
      const pcx = cx(p);
      const active = !p.dead && world.state.scene === 'playing';
      const distHome = Math.abs(pcx - homeX);

      if (!awake) {
        if (active && distHome <= WAKE_DIST) {
          awake = true;
          dir = pcx >= cx(e) ? 1 : -1;
          face = dir;
        } else {
          // Voo curto tranquilo em torno da âncora até o Pardo entrar no raio
          const wantX = homeX - e.w / 2 + Math.sin(t * 1.4) * 16;
          const wantY = homeY - e.h / 2 + Math.sin(t * 3.0) * 4;
          const stepX = Math.max(-SPEED * dt, Math.min(SPEED * dt, wantX - e.x));
          const stepY = Math.max(-SPEED * dt, Math.min(SPEED * dt, wantY - e.y));
          if (Math.abs(stepX) > 0.05) face = stepX >= 0 ? 1 : -1;
          moveClamped(world, stepX, stepY);
          return;
        }
      }

      // Saiu da coleira de 10 tiles ou morreu → desativa e retorna à âncora
      if (!active || distHome > LEASH) {
        awake = false;
        return;
      }

      const dx = pcx - cx(e);
      // Segue na direção do Pardo fazendo passadas suaves sobre a cabeça dele sem tremer em dx=0
      if (Math.abs(dx) > 20) {
        dir = dx >= 0 ? 1 : -1;
      }
      face = dir;

      const wantY = homeY - e.h / 2 + Math.sin(t * 3.4) * AMP_Y;
      const hitX = moveClamped(world, dir * SPEED * dt, wantY - e.y);
      if (hitX) {
        dir = (dir * -1) as Dir;
        face = dir;
      }

      // Bombardeio a cada 2.1s quando o Pardo está abaixo e a ≤ 3.5 tiles (56px) em X
      const pBelow = cy(p) > cy(e) + 4;
      if (dropCd <= 0 && pBelow && Math.abs(pcx - cx(e)) <= DROP_RANGE) {
        dropCd = DROP_INTERVAL;
        diveTimer = 0.25;
        world.audio.play('squawk');
        world.spawn(createDropping(cx(e), e.y + e.h));
      }
    },
    sprite() {
      if (diveTimer > 0) {
        return { name: 'pombo_dive', frame: 0, flip: face < 0, align: 'center' };
      }
      return { name: 'pombo', frame: Math.floor(t / 0.15) % 2, flip: face < 0, align: 'center' };
    },
  };
}

// ── 3. Gato-de-Telhado Elétrico: patrulha curta + ciclo normal (1.7s) / choque (0.95s) ─
function gatoAi(e: Entity, homeX: number): EnemyAi {
  const NORMAL_TIME = 1.7;
  const SHOCK_TIME = 0.95;
  const PATROL_RANGE = 24;
  const SPEED = 22;

  let shock = false;
  let timer = 0.5 + phase01(homeX, e.y) * 1.2;
  let sparkTimer = 0;
  let dir: Dir = -1;
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

      // Patrulha curta ±24px sem cair de bordas
      e.vx = dir * SPEED;
      const c = fall(e, dt, world);
      if (c.left) dir = 1;
      else if (c.right) dir = -1;
      else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;
      else if (dir > 0 && cx(e) >= homeX + PATROL_RANGE) dir = -1;
      else if (dir < 0 && cx(e) <= homeX - PATROL_RANGE) dir = 1;

      if (!shock && !p.dead) {
        const dx = cx(p) - cx(e);
        if (Math.abs(dx) > 2) face = dx >= 0 ? 1 : -1;
      }

      timer -= dt;
      if (timer <= 0) {
        shock = !shock;
        timer = shock ? SHOCK_TIME : NORMAL_TIME;
        if (shock) {
          sparkTimer = 0.45;
          const dist = Math.hypot(cx(p) - cx(e), cy(p) - cy(e));
          if (dist <= 200 && world.state.scene === 'playing') {
            world.audio.play('zap');
            world.fx('sparkle', cx(e), e.y + 2);
          }
        }
      } else if (shock) {
        sparkTimer -= dt;
        if (sparkTimer <= 0) {
          sparkTimer = 0.45;
          if (Math.abs(cx(p) - cx(e)) <= 200) {
            world.fx('sparkle', cx(e), e.y + 2);
          }
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (shock) {
        return { name: 'gato_shock', frame: Math.floor(t / 0.08) % 2, flip: face < 0 };
      }
      return { name: 'gato', frame: Math.floor(t / 0.22) % 2, flip: face < 0 };
    },
    onHit(_e, punchDir, world) {
      if (!shock) return 'kill';
      world.audio.play('hit');
      world.fx('sparkle', cx(e), cy(e), punchDir);
      return 'bounce';
    },
    onTouch(_e, world) {
      if (shock && world.player.invuln <= 0 && world.state.scene === 'playing') {
        world.audio.play('zap');
      }
      world.player.hurt(world, cx(e));
    },
  };
}

// ── 4. Capivara-do-Valão: patrulha + investida (dash) + blindagem de 2 socos (stun) ──
function capivaraAi(e: Entity): EnemyAi {
  type State = 'patrol' | 'tele' | 'dash' | 'rest';
  let state: State = 'patrol';
  let dir: Dir = -1;
  let t = 0;
  let timer = 0;
  let stunT = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;

      if (stunT > 0) {
        stunT = Math.max(0, stunT - dt);
        e.vx *= Math.max(0, 1 - 8 * dt);
        if (Math.abs(e.vx) > 1) {
          const slideDir: Dir = e.vx > 0 ? 1 : -1;
          if (!safeGroundAhead(e, slideDir, world)) e.vx = 0;
        } else {
          e.vx = 0;
        }
        fall(e, dt, world);
        if (stunT <= 0) {
          state = 'patrol';
          e.vx = 0;
        }
        guardDead(e, world);
        return;
      }

      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';

      if (state === 'patrol') {
        e.vx = dir * 30;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;

        const dx = cx(p) - cx(e);
        const dy = (p.y + p.h) - (e.y + e.h);
        if (c.bottom && active && dx * dir > 0 && Math.abs(dx) <= 104 && Math.abs(dy) <= 16) {
          state = 'tele';
          timer = 0.35;
          e.vx = 0;
          world.audio.play('roar');
        }
      } else if (state === 'tele') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'dash';
          timer = 0.55;
          world.fx('dust', cx(e) - dir * 10, e.y + e.h, (dir * -1) as Dir);
        }
      } else if (state === 'dash') {
        if (!safeGroundAhead(e, dir, world)) {
          e.vx = 0;
          dir = (dir * -1) as Dir;
          state = 'rest';
          timer = 0.7;
          fall(e, dt, world);
        } else {
          e.vx = dir * 155;
          const c = fall(e, dt, world);
          timer -= dt;
          if (c.left || c.right) {
            dir = c.left ? 1 : -1;
            e.vx = 0;
            state = 'rest';
            timer = 0.7;
          } else if (c.bottom && !safeGroundAhead(e, dir, world)) {
            dir = (dir * -1) as Dir;
            e.vx = 0;
            state = 'rest';
            timer = 0.7;
          } else if (timer <= 0) {
            e.vx = 0;
            state = 'rest';
            timer = 0.7;
          }
        }
      } else {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) state = 'patrol';
      }

      guardDead(e, world);
    },
    sprite() {
      if (stunT > 0) {
        return { name: 'capivara', frame: 0, flip: dir < 0 };
      }
      if (state === 'tele' || state === 'dash') {
        return { name: 'capivara_charge', frame: 0, flip: dir < 0 };
      }
      const frame = state === 'patrol' ? Math.floor(t / 0.22) % 2 : 0;
      return { name: 'capivara', frame, flip: dir < 0 };
    },
    onHit(_e, punchDir, world) {
      if (stunT > 0) {
        stunT = 0;
        return 'kill';
      }
      stunT = CAPIVARA_STUN;
      state = 'rest';
      timer = 0;
      e.vx = safeGroundAhead(e, punchDir, world) ? punchDir * 70 : 0;
      e.vy = -45;
      dir = (punchDir * -1) as Dir;
      world.audio.play('stun');
      return 'stun';
    },
    harmless: () => stunT > 0,
    stunned: () => stunT > 0,
  };
}

// ── Projétil do Traficante (`bullet`): horizontal 140px/s, indestrutível (sem onPunch)
function createBullet(muzzleX: number, centerY: number, dir: Dir): Entity {
  let t = 0;
  let traveled = 0;
  const b: Entity = {
    kind: 'bullet',
    dead: false,
    x: muzzleX - 3,
    y: centerY - 2,
    w: 6,
    h: 4,
    vx: 140 * dir,
    vy: 0,
    update(dt, world) {
      t += dt;
      const stepX = b.vx * dt;
      b.x += stepX;
      traveled += Math.abs(stepX);

      const tx0 = Math.floor(b.x / TILE);
      const tx1 = Math.floor((b.x + b.w - 0.001) / TILE);
      const ty0 = Math.floor(b.y / TILE);
      const ty1 = Math.floor((b.y + b.h - 0.001) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (world.level.isSolid(tx, ty)) {
            // poeira na face da parede (não dentro do tile)
            world.fx('dust', dir > 0 ? tx * TILE : (tx + 1) * TILE, b.y + b.h / 2, (dir * -1) as Dir);
            b.dead = true;
            return;
          }
        }
      }

      if (traveled >= 180) {
        b.dead = true;
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'bullet', Math.floor(t / 0.08) % 2, b.x, b.y, dir === -1);
    },
    onTouchPlayer(world) {
      if (b.dead || world.player.dead) return;
      world.player.hurt(world, b.x + b.w / 2, 1);
      b.dead = true;
    },
  };
  return b;
}

/** Face (x) da 1ª parede sólida entre a borda do corpo e `frontX` na altura do tiro, ou `null`. */
function muzzleWallX(e: Entity, facing: Dir, frontX: number, muzzleY: number, world: World): number | null {
  const bodyEdge = facing > 0 ? e.x + e.w : e.x;
  const txFrom = Math.floor((facing > 0 ? bodyEdge : bodyEdge - 0.001) / TILE);
  const txTo = Math.floor((facing > 0 ? frontX - 0.001 : frontX) / TILE);
  const ty0 = Math.floor((muzzleY - 2) / TILE);
  const ty1 = Math.floor((muzzleY + 2 - 0.001) / TILE);
  for (let tx = txFrom; facing > 0 ? tx <= txTo : tx >= txTo; tx += facing) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (world.level.isSolid(tx, ty)) return facing > 0 ? tx * TILE : (tx + 1) * TILE;
    }
  }
  return null;
}

// ── 5. Traficante Rubro-Negro: vigia laje + ciclo justo cooldown/mira/disparo ────────
function traficanteAi(e: Entity, homeX: number): EnemyAi {
  type State = 'cooldown' | 'aim' | 'fire';
  const COOLDOWN_TIME = 1.85;
  const AIM_TIME = 0.55;
  const FIRE_TIME = 0.20;
  const PATROL_RANGE = 16;
  const SPEED = 18;
  const RANGE_X = 9 * TILE; // 144px
  const RANGE_Y = 48;

  let state: State = 'cooldown';
  let timer = 0.4 + phase01(homeX, e.y) * 0.4;
  let patrolDir: Dir = -1;
  let facing: Dir = -1;
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
      const dy = (p.y + p.h) - (e.y + e.h);
      const inRange = active && Math.abs(dx) <= RANGE_X && Math.abs(dy) <= RANGE_Y;

      if (state !== 'fire' && !p.dead && Math.abs(dx) > 1) {
        facing = dx >= 0 ? 1 : -1;
      }

      if (state === 'cooldown') {
        e.vx = patrolDir * SPEED;
        const c = fall(e, dt, world);
        if (c.left) patrolDir = 1;
        else if (c.right) patrolDir = -1;
        else if (c.bottom && !safeGroundAhead(e, patrolDir, world)) patrolDir = (patrolDir * -1) as Dir;
        else if (patrolDir > 0 && cx(e) >= homeX + PATROL_RANGE) patrolDir = -1;
        else if (patrolDir < 0 && cx(e) <= homeX - PATROL_RANGE) patrolDir = 1;

        if (inRange) {
          timer -= dt;
          if (timer <= 0 && c.bottom) {
            state = 'aim';
            timer = AIM_TIME;
            e.vx = 0;
          }
        } else {
          // Fora de alcance: reduz o cooldown até uma folga mínima de reação (0.35s)
          timer = Math.max(0.35, timer - dt);
        }
      } else if (state === 'aim') {
        e.vx = 0;
        fall(e, dt, world);
        if (!active || Math.abs(dx) > RANGE_X + 32 || Math.abs(dy) > RANGE_Y + 16) {
          state = 'cooldown';
          timer = COOLDOWN_TIME;
        } else {
          timer -= dt;
          if (timer <= 0) {
            state = 'fire';
            timer = FIRE_TIME;
            const footY = e.y + e.h;
            const muzzleX = cx(e) + facing * 12;
            const muzzleY = footY - 14;
            world.audio.play('shoot');
            // Trecho do cano: do centro do corpo até a frente da bala no nascimento (cx ± 15).
            // Parede nesse trecho: o tiro estoura na face dela, sem projétil (não nasce dentro do tile).
            const wallX = muzzleWallX(e, facing, cx(e) + facing * 15, muzzleY, world);
            const reachX = wallX ?? cx(e) + facing * 15;
            const barrel: Rect = {
              x: Math.min(cx(e), reachX),
              y: muzzleY - 2,
              w: Math.abs(reachX - cx(e)),
              h: 4,
            };
            if (overlaps(barrel, p)) {
              // À queima-roupa: o Pardo está no cano (entre o traficante e a bala) → acerta na hora
              world.fx('dust', facing > 0 ? Math.max(p.x, barrel.x) : Math.min(p.x + p.w, barrel.x + barrel.w), muzzleY, facing);
              p.hurt(world, cx(e), 1);
            } else if (wallX !== null) {
              world.fx('dust', wallX, muzzleY, (facing * -1) as Dir);
            } else {
              world.fx('dust', muzzleX, muzzleY, facing);
              world.spawn(createBullet(muzzleX, muzzleY, facing));
            }
          }
        }
      } else {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'cooldown';
          timer = COOLDOWN_TIME;
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'aim') {
        return { name: 'traficante_aim', frame: 0, flip: facing < 0 };
      }
      if (state === 'fire') {
        return { name: 'traficante_aim', frame: 1, flip: facing < 0 };
      }
      return { name: 'traficante', frame: Math.floor(t / 0.25) % 2, flip: facing < 0 };
    },
  };
}

/**
 * Cria um inimigo da Fase 4 (Favela do Rio).
 * Para `pombo`, `footY` é o `centerY` da casa/âncora; para os terrestres, `footY` é a base dos pés.
 */
export function createRioEnemy(kind: RioEnemyKind, centerX: number, footY: number): Entity {
  switch (kind) {
    case 'caramelo':
      return buildRioEnemy(kind, centerX - 9, footY - 12, 18, 12, 300, carameloAi);
    case 'pombo':
      return buildRioEnemy(kind, centerX - 9, footY - 5, 18, 10, 400, (e) => pomboAi(e, centerX, footY));
    case 'gato':
      return buildRioEnemy(kind, centerX - 8, footY - 12, 16, 12, 400, (e) => gatoAi(e, centerX));
    case 'capivara':
      return buildRioEnemy(kind, centerX - 12, footY - 14, 24, 14, 600, capivaraAi);
    case 'traficante':
      return buildRioEnemy(kind, centerX - 6, footY - 20, 12, 20, 500, (e) => traficanteAi(e, centerX));
  }
}
