import type { EnemyKind, Entity, World } from '../core/types';
import { TILE, VIEW_H, VIEW_W } from '../core/constants';
import { moveBody } from '../core/physics';

const GRAV = 900;
const MAX_FALL = 360;

interface SpriteRef { name: string; frame: number; flip: boolean }

interface Ai {
  update(e: Entity, dt: number, world: World): void;
  sprite(): SpriteRef;
  /** pode ser derrotado por soco agora? */
  vulnerable(): boolean;
}

interface Thrown { rot: number; spin: number; dir: 1 | -1 }

function cx(e: Entity): number { return e.x + e.w / 2; }

function onScreen(e: Entity, world: World): boolean {
  const c = world.camera;
  return e.x + e.w > c.x && e.x < c.x + VIEW_W && e.y + e.h > c.y && e.y < c.y + VIEW_H;
}

/** Monta a entidade comum: arremesso ao morrer, dano ao toque, desenho alinhado à hitbox. */
function build(kind: EnemyKind, centerX: number, bottom: number, w: number, h: number, points: number,
  makeAi: (e: Entity) => Ai): Entity {
  let thrown: Thrown | null = null;
  let ai!: Ai;
  const e: Entity = {
    kind, dead: false, x: centerX - w / 2, y: bottom - h, w, h, vx: 0, vy: 0,
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
      const sy = e.y + e.h - size.h;
      if (thrown) {
        ctx.save();
        ctx.translate(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2));
        ctx.rotate(thrown.rot);
        world.sprites.draw(ctx, s.name, s.frame, -size.w / 2, -size.h / 2, thrown.dir < 0);
        ctx.restore();
      } else {
        world.sprites.draw(ctx, s.name, s.frame, sx, sy, s.flip);
      }
    },
    onPunch(world, dir) {
      if (thrown || !ai.vulnerable()) return false;
      thrown = { rot: 0, spin: dir * 12, dir };
      e.vx = dir * 150;
      e.vy = -210;
      world.audio.play('hit');
      world.addScore(points, cx(e), e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown) return;
      world.player.hurt(world, cx(e));
    },
  };
  ai = makeAi(e);
  return e;
}

/** Redimensiona a hitbox mantendo base e centro horizontal. */
function resize(e: Entity, w: number, h: number): void {
  const c = cx(e);
  const b = e.y + e.h;
  e.w = w; e.h = h; e.x = c - w / 2; e.y = b - h;
}

/** Há chão (sólido ou one-way) à frente-abaixo? */
function groundAhead(e: Entity, dir: 1 | -1, world: World): boolean {
  const ax = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const tx = Math.floor(ax / TILE);
  const ty = Math.floor((e.y + e.h + 1) / TILE);
  return world.level.isSolid(tx, ty) || world.level.isOneWay(tx, ty);
}

function fall(e: Entity, dt: number, world: World) {
  e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
  return moveBody(e, world.level, dt);
}

function guardDead(e: Entity, world: World): void {
  if (e.y > world.level.heightPx + 60) e.dead = true;
}

// ── Calango: patrulha, não cai de bordas ─────────────────────────────────────────────
function calangoAi(e: Entity): Ai {
  let dir: 1 | -1 = -1;
  let t = 0;
  const speed = 35;
  return {
    update(_e, dt, world) {
      t += dt;
      e.vx = dir * speed;
      const c = fall(e, dt, world);
      if (c.left || c.right) dir = (c.left ? 1 : -1);
      else if (c.bottom && !groundAhead(e, dir, world)) dir = (dir * -1) as 1 | -1;
      guardDead(e, world);
    },
    sprite: () => ({ name: 'calango', frame: Math.floor(t / 0.2) % 2, flip: dir < 0 }),
    vulnerable: () => true,
  };
}

// ── Carcará: senoide + rasante ───────────────────────────────────────────────────────
function carcaraAi(e: Entity): Ai {
  const homeX = cx(e);
  const homeY = e.y;
  const RANGE = 48; // ±48 => vai-e-vem de 96px
  const OMEGA = 1.0;
  const AMP_Y = 12;
  let t = 0;
  let state: 'patrol' | 'dive' | 'recover' = 'patrol';
  let cooldown = 1.5;
  let diveT = 0;
  let targetY = 0;
  let face: 1 | -1 = 1;
  const patrolX = () => homeX + RANGE * Math.sin(t * OMEGA) - e.w / 2;
  const patrolY = () => homeY + AMP_Y * Math.sin(t * 2.4);
  return {
    update(_e, dt, world) {
      t += dt;
      cooldown -= dt;
      const p = world.player;
      if (state === 'patrol') {
        e.x = patrolX();
        e.y = patrolY();
        face = Math.cos(t * OMEGA) >= 0 ? 1 : -1;
        const dx = p.x + p.w / 2 - cx(e);
        const dy = p.y + p.h / 2 - (e.y + e.h / 2);
        if (cooldown <= 0 && !p.dead && Math.abs(dx) < 70 && dy > 10 && dy < 90) {
          state = 'dive';
          diveT = 0;
          targetY = p.y + p.h / 2;
          const len = Math.hypot(dx, dy) || 1;
          e.vx = (dx / len) * 200;
          e.vy = (dy / len) * 200;
          if (e.vx !== 0) face = e.vx > 0 ? 1 : -1;
          world.audio.play('squawk');
        }
      } else if (state === 'dive') {
        diveT += dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y + e.h / 2 >= targetY || diveT > 0.8) state = 'recover';
      } else {
        const tx = patrolX();
        const ty = patrolY();
        const dx = tx - e.x;
        const dy = ty - e.y;
        const d = Math.hypot(dx, dy);
        const step = 100 * dt;
        if (d <= step + 2) {
          state = 'patrol';
          cooldown = 2.5;
        } else {
          e.x += (dx / d) * step;
          e.y += (dy / d) * step;
          face = dx >= 0 ? 1 : -1;
        }
      }
    },
    sprite: () => state === 'dive'
      ? { name: 'carcara_dive', frame: 0, flip: face < 0 }
      : { name: 'carcara', frame: Math.floor(t / 0.15) % 2, flip: face < 0 },
    vulnerable: () => true,
  };
}

// ── Palma-brava: salta; só vulnerável no chão ───────────────────────────────────────
function palmaAi(e: Entity): Ai {
  let state: 'idle' | 'crouch' | 'air' = 'idle';
  let timer = 0.5 + ((e.x * 0.0137) % 1) * 0.7; // dessincroniza vizinhas
  const H_STAND = 17;
  const H_CROUCH = 14;
  return {
    update(_e, dt, world) {
      if (state === 'idle') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'crouch';
          timer = 0.3;
          resize(e, e.w, H_CROUCH);
        }
      } else if (state === 'crouch') {
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          resize(e, e.w, H_STAND);
          state = 'air';
          e.vy = -230;
          e.y -= 1;
          timer = 0.1;
          if (onScreen(e, world)) world.audio.play('boing');
        }
      } else {
        timer -= dt;
        const c = fall(e, dt, world);
        if (timer <= 0 && c.bottom) {
          state = 'idle';
          timer = 1.2;
        }
      }
      guardDead(e, world);
    },
    sprite: () => ({ name: 'palma', frame: state === 'crouch' ? 1 : 0, flip: false }),
    vulnerable: () => state !== 'air',
  };
}

// ── Tatu-bola: anda, enrola e dispara ───────────────────────────────────────────────
function tatuAi(e: Entity): Ai {
  type S = 'walk' | 'curl' | 'roll' | 'bounce' | 'rest';
  let state: S = 'walk';
  let dir: 1 | -1 = -1;
  let t = 0;
  let timer = 0;
  let speed = 0;
  let cooldown = 0;
  const WALK_W = 14, WALK_H = 10, BALL = 10;
  return {
    update(_e, dt, world) {
      t += dt;
      cooldown -= dt;
      const p = world.player;
      if (state === 'walk') {
        e.vx = dir * 25;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !groundAhead(e, dir, world)) dir = (dir * -1) as 1 | -1;
        const dy = p.y + p.h / 2 - (e.y + e.h / 2);
        const dx = p.x + p.w / 2 - cx(e);
        if (cooldown <= 0 && !p.dead && c.bottom && Math.abs(dy) < 16 && Math.abs(dx) < 110) {
          dir = dx >= 0 ? 1 : -1;
          state = 'curl';
          timer = 0.3;
          e.vx = 0;
          resize(e, BALL, BALL);
        }
      } else if (state === 'curl') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) { state = 'roll'; speed = 70; }
      } else if (state === 'roll') {
        speed = Math.min(170, speed + 260 * dt);
        e.vx = dir * speed;
        const c = fall(e, dt, world);
        if (c.left || c.right) {
          dir = (dir * -1) as 1 | -1;
          state = 'bounce';
          timer = 0.15;
          e.vx = dir * 70;
          e.vy = -130;
          world.audio.play('land');
        }
      } else if (state === 'bounce') {
        timer -= dt;
        const c = fall(e, dt, world);
        if (timer <= 0 && c.bottom) {
          state = 'rest';
          timer = 1.0;
          resize(e, WALK_W, WALK_H);
          e.vx = 0;
        }
      } else {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) { state = 'walk'; cooldown = 0.6; }
      }
      guardDead(e, world);
    },
    sprite() {
      if (state === 'curl' || state === 'roll' || state === 'bounce') {
        return { name: 'tatu_ball', frame: state === 'roll' ? Math.floor(t / 0.06) % 2 : 0, flip: dir < 0 };
      }
      return { name: 'tatu', frame: state === 'walk' ? Math.floor(t / 0.25) % 2 : 0, flip: dir < 0 };
    },
    vulnerable: () => true,
  };
}

/**
 * Cria um inimigo com a BASE (pés) apoiada em `footY` e centro horizontal em `centerX`
 * (para o carcará, footY é a base da hitbox na altitude média de voo).
 * Hitboxes: calango 16x10, carcará 20x11, palma 12x17 (14 agachada), tatu 14x10 (bola 10x10).
 */
export function createEnemy(kind: EnemyKind, centerX: number, footY: number): Entity {
  switch (kind) {
    case 'calango': return build(kind, centerX, footY, 16, 10, 200, calangoAi);
    case 'carcara': return build(kind, centerX, footY, 20, 11, 400, carcaraAi);
    case 'palma': return build(kind, centerX, footY, 12, 17, 300, palmaAi);
    case 'tatu': return build(kind, centerX, footY, 14, 10, 500, tatuAi);
  }
}
