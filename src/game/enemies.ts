import type { EnemyKind, Entity, World } from '../core/types';
import { TILE, VIEW_H, VIEW_W } from '../core/constants';
import { moveBody } from '../core/physics';

const GRAV = 900;
const MAX_FALL = 360;

interface SpriteRef { name: string; frame: number; flip: boolean; hide?: boolean }

interface Ai {
  update(e: Entity, dt: number, world: World): void;
  sprite(): SpriteRef;
  /** pode ser derrotado por soco agora? */
  vulnerable(): boolean;
  /** se definido, decide o efeito do soco (substitui `vulnerable`): 'kill' derrota, 'absorb' conecta sem matar, 'miss' não conecta */
  onHit?(e: Entity, dir: 1 | -1, world: World): 'kill' | 'absorb' | 'miss';
  /** true → não causa dano ao toque agora */
  harmless?(): boolean;
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
      if (s.hide) return;
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
      if (thrown) return false;
      if (ai.onHit) {
        const r = ai.onHit(e, dir, world);
        if (r === 'miss') return false;
        if (r === 'absorb') { world.audio.play('hit'); return true; }
      } else if (!ai.vulnerable()) return false;
      thrown = { rot: 0, spin: dir * 12, dir };
      e.vx = dir * 150;
      e.vy = -210;
      world.audio.play('hit');
      world.addScore(points, cx(e), e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || ai.harmless?.()) return;
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

// ── Onça: patrulha, agacha e dá bote em arco; 2 socos ───────────────────────────────
function oncaAi(e: Entity): Ai {
  type S = 'patrol' | 'crouch' | 'pounce' | 'rest' | 'stun';
  let state: S = 'patrol';
  let dir: 1 | -1 = -1;
  let t = 0;
  let timer = 0;
  let hits = 0;
  return {
    update(_e, dt, world) {
      t += dt;
      const p = world.player;
      if (state === 'patrol') {
        e.vx = dir * 30;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !groundAhead(e, dir, world)) dir = (dir * -1) as 1 | -1;
        const dx = p.x + p.w / 2 - cx(e);
        const dy = (p.y + p.h) - (e.y + e.h);
        if (c.bottom && !p.dead && dx * dir > 0 && Math.abs(dx) <= 7 * TILE && Math.abs(dy) <= TILE) {
          state = 'crouch';
          timer = 0.4;
          e.vx = 0;
        }
      } else if (state === 'crouch') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'pounce';
          timer = 0.1;
          e.vx = dir * 150;
          e.vy = -220;
          e.y -= 1;
          world.audio.play('roar');
        }
      } else if (state === 'pounce') {
        timer -= dt;
        const c = fall(e, dt, world);
        if (timer <= 0 && c.bottom) { state = 'rest'; timer = 0.8; e.vx = 0; }
      } else if (state === 'rest') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) state = 'patrol';
      } else {
        e.vx *= Math.max(0, 1 - 6 * dt);
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) { state = 'patrol'; e.vx = 0; }
      }
      guardDead(e, world);
    },
    sprite() {
      if (state === 'stun') return { name: 'onca_crouch', frame: 0, flip: dir < 0, hide: Math.floor(t / 0.07) % 2 === 0 };
      if (state === 'crouch') return { name: 'onca_crouch', frame: 0, flip: dir < 0 };
      if (state === 'pounce') return { name: 'onca_pounce', frame: 0, flip: dir < 0 };
      return { name: 'onca', frame: state === 'patrol' ? Math.floor(t / 0.25) % 2 : 0, flip: dir < 0 };
    },
    vulnerable: () => true,
    onHit(_e, pdir) {
      if (hits === 0) {
        hits = 1;
        state = 'stun';
        timer = 1.0;
        e.vx = pdir * 70;
        e.vy = -60;
        dir = (pdir * -1) as 1 | -1; // vira para o Pardo
        return 'absorb';
      }
      return 'kill';
    },
    harmless: () => state === 'stun',
  };
}

// ── Jacaré: boca fechada (vulnerável) / aberta (rebate o soco) ──────────────────────
function jacareAi(e: Entity): Ai {
  let open = false;
  let timer = 1.6;
  let dir: 1 | -1 = -1;
  return {
    update(_e, dt, world) {
      fall(e, dt, world);
      timer -= dt;
      if (timer <= 0) {
        open = !open;
        timer = open ? 0.9 : 1.6;
        if (!open && onScreen(e, world)) world.audio.play('chomp');
      }
      if (!open) dir = world.player.x + world.player.w / 2 >= cx(e) ? 1 : -1;
      guardDead(e, world);
    },
    sprite: () => ({ name: 'jacare', frame: open ? 1 : 0, flip: dir < 0 }),
    vulnerable: () => !open,
  };
}

// ── Cobra: enrolada; hiss, telegrafa, bote, recolhe ─────────────────────────────────
function cobraAi(e: Entity): Ai {
  type S = 'coil' | 'tele' | 'strike' | 'recoil' | 'cool';
  let state: S = 'coil';
  let face: 1 | -1 = -1;
  let t = 0;
  let timer = 0;
  const W = 12, W_STRIKE = 24;
  const setW = (w: number) => {
    // mantém o lado da cauda fixo
    if (face > 0) e.w = w;
    else { const r = e.x + e.w; e.w = w; e.x = r - w; }
  };
  return {
    update(_e, dt, world) {
      t += dt;
      const p = world.player;
      fall(e, dt, world);
      const dx = p.x + p.w / 2 - cx(e);
      if (state === 'coil' || state === 'cool' || state === 'recoil') {
        if (Math.abs(dx) > 2) face = dx >= 0 ? 1 : -1;
      }
      timer -= dt;
      if (state === 'coil') {
        const dy = (p.y + p.h) - (e.y + e.h);
        if (!p.dead && dx * face > 0 && Math.abs(dx) <= 3 * TILE && Math.abs(dy) <= 10) {
          state = 'tele';
          timer = 0.25;
          world.audio.play('hiss');
        }
      } else if (state === 'tele') {
        if (timer <= 0) { state = 'strike'; timer = 0.3; setW(W_STRIKE); }
      } else if (state === 'strike') {
        if (timer <= 0) { setW(W); state = 'recoil'; timer = 0.6; }
      } else if (state === 'recoil') {
        if (timer <= 0) { state = 'cool'; timer = 1.0; }
      } else if (timer <= 0) state = 'coil';
      guardDead(e, world);
    },
    sprite() {
      if (state === 'strike') return { name: 'cobra_strike', frame: 0, flip: face < 0 };
      const fr = state === 'tele' ? Math.floor(t / 0.06) % 2 : Math.floor(t / 0.4) % 2;
      return { name: 'cobra', frame: fr, flip: face < 0 };
    },
    vulnerable: () => state !== 'strike',
  };
}

// ── Fruto do tucano ─────────────────────────────────────────────────────────────────
function createFruit(x: number, y: number): Entity {
  let t = 0;
  const e: Entity = {
    kind: 'fruit', dead: false, x: x - 3, y: y - 3, w: 6, h: 6, vx: 0, vy: 0,
    update(dt, world) {
      t += dt;
      e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
      const c = moveBody(e, world.level, dt);
      if (c.bottom) {
        world.fx('dust', e.x + e.w / 2, e.y + e.h);
        e.dead = true;
      } else if (e.y > world.level.heightPx + 60) e.dead = true;
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'fruit', Math.floor(t / 0.1) % 2, e.x, e.y);
    },
    onPunch(world) {
      if (e.dead) return false;
      e.dead = true;
      world.audio.play('hit');
      world.addScore(10, e.x, e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (e.dead) return;
      e.dead = true;
      world.player.hurt(world, e.x + e.w / 2);
    },
  };
  return e;
}

// ── Tucano: voa senoidal até o Pardo e solta frutos ─────────────────────────────────
function tucanoAi(e: Entity): Ai {
  const baseY = e.y;
  let active = false;
  let t = 0;
  let face: 1 | -1 = -1;
  let drop = 1.2;
  return {
    update(_e, dt, world) {
      if (!active) {
        if (onScreen(e, world)) active = true; else return;
      }
      t += dt;
      drop -= dt;
      const p = world.player;
      const dx = p.x + p.w / 2 - cx(e);
      if (Math.abs(dx) > 4) face = dx >= 0 ? 1 : -1;
      e.x += face * 45 * dt;
      e.y = baseY + 10 * Math.sin(t * 3);
      const dy = p.y + p.h / 2 - (e.y + e.h / 2);
      if (drop <= 0 && !p.dead && dy > 12 && Math.abs(dx) < 50) {
        drop = 2.2;
        world.audio.play('squawk');
        world.spawn(createFruit(cx(e), e.y + e.h));
      }
      const c = world.camera;
      if (e.x + e.w < c.x - 160 || e.x > c.x + VIEW_W + 160) e.dead = true;
    },
    sprite: () => ({ name: 'tucano', frame: Math.floor(t / 0.15) % 2, flip: face < 0 }),
    vulnerable: () => true,
  };
}

/**
 * Cria um inimigo com a BASE (pés) apoiada em `footY` e centro horizontal em `centerX`
 * (para o carcará, footY é a base da hitbox na altitude média de voo).
 * Hitboxes: calango 16x10, carcará 20x11, palma 12x17 (14 agachada), tatu 14x10 (bola 10x10),
 * onça 24x12, jacaré 32x10, cobra 12x12 (24 de largura no bote), tucano 18x10 (footY = base na altitude média de voo).
 */
export function createEnemy(kind: EnemyKind, centerX: number, footY: number): Entity {
  switch (kind) {
    case 'calango': return build(kind, centerX, footY, 16, 10, 200, calangoAi);
    case 'carcara': return build(kind, centerX, footY, 20, 11, 400, carcaraAi);
    case 'palma': return build(kind, centerX, footY, 12, 17, 300, palmaAi);
    case 'tatu': return build(kind, centerX, footY, 14, 10, 500, tatuAi);
    case 'onca': return build(kind, centerX, footY, 24, 12, 600, oncaAi);
    case 'jacare': return build(kind, centerX, footY, 32, 10, 400, jacareAi);
    case 'cobra': return build(kind, centerX, footY, 12, 12, 300, cobraAi);
    case 'tucano': return build(kind, centerX, footY, 18, 10, 400, tucanoAi);
    default: throw new Error(`inimigo ${kind} não é deste módulo (Fase 3: src/game/enemies3.ts)`);
  }
}
