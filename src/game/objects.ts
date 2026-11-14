import type { Entity, World } from '../core/types';
import { overlaps } from '../core/physics';
import { TILE } from '../core/constants';

/** Fábricas das entidades de mundo (itens, cacto d'água, plataformas, caneca). Tudo em coordenadas de mundo. */

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

function collectCoin(e: Entity, world: World): void {
  if (e.dead) return;
  e.dead = true;
  world.addCoin();
  world.addScore(100, e.x + e.w / 2, e.y);
  world.audio.play('coin');
}

/** Moeda 8x8 flutuante (x,y = canto sup. esq. da hitbox). */
export function createCoin(x: number, y: number): Entity {
  const phase = x * 0.05;
  const e: Entity = {
    ...base('coin', x, y, 8, 8),
    update() {},
    draw(ctx, world) {
      if (e.dead) return;
      const bob = Math.round(Math.sin(world.time * 3 + phase) * 1.5);
      world.sprites.draw(ctx, 'coin', Math.floor(world.time * 10 + phase) & 3, e.x, e.y + bob);
    },
    onTouchPlayer(world) { collectCoin(e, world); },
  };
  return e;
}

/** Moeda que salta de um bloco e é coletada automaticamente ao completar o arco. */
export function createPopCoin(x: number, y: number): Entity {
  const startY = y;
  let t = 0;
  const e: Entity = {
    ...base('coin_pop', x, y, 8, 8),
    update(dt, world) {
      t += dt;
      e.vy += 700 * dt;
      e.y += e.vy * dt;
      if (e.dead) return;
      if (t > 0.2 && (e.y >= startY - 2 || t > 0.6)) collectCoin(e, world);
    },
    draw(ctx, world) {
      if (e.dead) return;
      world.sprites.draw(ctx, 'coin', Math.floor(t * 18) & 3, e.x, e.y);
    },
  };
  e.vy = -190;
  return e;
}

/** Gota d'água 8x10 centrada em (cx,cy); cai, quica e some após ~7s. */
export function createDrop(cx: number, cy: number, vx = 0, vy = -120): Entity {
  let life = 7;
  const e: Entity = {
    ...base('drop', cx - 4, cy - 5, 8, 10),
    update(dt, world) {
      life -= dt;
      if (life <= 0) { e.dead = true; return; }
      const lv = world.level;
      e.vy = Math.min(e.vy + 600 * dt, 300);
      // X
      const nx = e.x + e.vx * dt;
      const probeX = e.vx > 0 ? nx + e.w : nx;
      const rowA = Math.floor((e.y + 1) / TILE), rowB = Math.floor((e.y + e.h - 1) / TILE);
      const tx = Math.floor(probeX / TILE);
      if (lv.isSolid(tx, rowA) || lv.isSolid(tx, rowB)) e.vx = -e.vx * 0.4; else e.x = nx;
      // Y
      const ny = e.y + e.vy * dt;
      if (e.vy > 0) {
        const feet = ny + e.h;
        const row = Math.floor(feet / TILE);
        const colA = Math.floor((e.x + 1) / TILE), colB = Math.floor((e.x + e.w - 1) / TILE);
        const landed = [colA, colB].some((c) => lv.isSolid(c, row) || (lv.isOneWay(c, row) && e.y + e.h <= row * TILE + 0.5));
        if (landed) {
          e.y = row * TILE - e.h;
          if (e.vy > 90) e.vy = -e.vy * 0.35; else e.vy = 0;
          e.vx *= 0.8;
        } else e.y = ny;
      } else {
        const row = Math.floor(ny / TILE);
        if (lv.isSolid(Math.floor((e.x + e.w / 2) / TILE), row)) e.vy = 0; else e.y = ny;
      }
      if (e.y > lv.heightPx + 32) e.dead = true;
    },
    draw(ctx, world) {
      if (life < 1.5 && Math.floor(life * 10) % 2 === 0) return;
      world.sprites.draw(ctx, 'drop', Math.floor(world.time * 6) & 1, e.x, e.y);
    },
    onTouchPlayer(world) {
      if (e.dead) return;
      e.dead = true;
      const healed = world.player.heal(world, 1);
      if (healed <= 0) world.addScore(200, e.x + 4, e.y);
      world.audio.play('water');
    },
  };
  e.vx = vx; e.vy = vy;
  return e;
}

/** Cacto d'água 24x32 (x,y = canto sup. esq.). Solta até 3 gotas a socos, depois seca. */
export function createWaterCactus(x: number, y: number): Entity {
  let drops = 0;
  let shake = 0;
  const e: Entity = {
    ...base('cactus_water', x, y, 24, 32),
    update(dt) { if (shake > 0) shake = Math.max(0, shake - dt); },
    draw(ctx, world) {
      const off = shake > 0 ? (Math.floor(shake * 60) % 2 ? 1 : -1) : 0;
      world.sprites.draw(ctx, 'cactus_water', drops >= 3 ? 1 : 0, e.x + off, e.y);
    },
    onPunch(world, dir) {
      if (drops >= 3) return false;
      drops++;
      shake = 0.15;
      const px = e.x + e.w / 2 + dir * 8;
      world.fx('splash', px, e.y + 12, dir);
      world.spawn(createDrop(px, e.y + 12, dir * 45, -130));
      return true;
    },
  };
  return e;
}

/** Plataforma móvel 32x10. Vai-e-vem senoidal de (x,y) até +range px no eixo dado. */
export function createMovingPlatform(x: number, y: number, axis: 'x' | 'y', range: number, speed: number): Entity {
  let phase = 0;
  const omega = (Math.PI * speed) / range;
  const e: Entity = {
    ...base('platform_rock', x, y, 32, 10),
    platform: true,
    dx: 0,
    dy: 0,
    update(dt) {
      phase += dt * omega;
      const off = (range * (1 - Math.cos(phase))) / 2;
      const nx = axis === 'x' ? x + off : x;
      const ny = axis === 'y' ? y + off : y;
      e.dx = nx - e.x;
      e.dy = ny - e.y;
      e.vx = dt > 0 ? e.dx / dt : 0;
      e.vy = dt > 0 ? e.dy / dt : 0;
      e.x = nx;
      e.y = ny;
    },
    draw(ctx, world) { world.sprites.draw(ctx, 'platform_rock', 0, e.x, e.y); },
  };
  return e;
}

/** Plataforma que desmorona: treme ~0.5s após o Pardo pisar, cai, e reaparece após ~3s. */
export function createCrumblePlatform(x: number, y: number): Entity {
  type S = 'idle' | 'shaking' | 'falling' | 'gone';
  let state: S = 'idle';
  let timer = 0;
  const e: Entity = {
    ...base('platform_crumble', x, y, 32, 10),
    platform: true,
    dx: 0,
    dy: 0,
    onStand(world) {
      if (state !== 'idle') return;
      state = 'shaking';
      timer = 0.5;
      world.audio.play('crumble');
    },
    update(dt, world) {
      e.dx = 0; e.dy = 0;
      if (state === 'shaking') {
        timer -= dt;
        if (timer <= 0) { state = 'falling'; e.platform = false; e.vy = 0; }
      } else if (state === 'falling') {
        e.vy += 900 * dt;
        e.y += e.vy * dt;
        if (e.y > y + 260) { state = 'gone'; timer = 3; }
      } else if (state === 'gone') {
        timer -= dt;
        if (timer <= 0) {
          const zone = { x: x - 4, y: y - 24, w: e.w + 8, h: 40 };
          if (!overlaps(world.player, zone)) {
            state = 'idle'; e.x = x; e.y = y; e.vy = 0; e.platform = true;
          }
        }
      }
    },
    draw(ctx, world) {
      if (state === 'gone') return;
      let ox = 0;
      if (state === 'shaking') ox = Math.floor(timer * 60) % 2 ? 1 : -1;
      world.sprites.draw(ctx, 'platform_crumble', state === 'idle' ? 0 : 1, e.x + ox, e.y);
    },
  };
  return e;
}

/** Caneca Esmaltada 16x14 (x,y = canto sup. esq.), sobre o pedestal. */
export function createMug(x: number, y: number): Entity {
  let won = false;
  const e: Entity = {
    ...base('mug', x, y, 16, 14),
    update() {},
    draw(ctx, world) {
      const t = world.time;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 4);
      ctx.fillStyle = '#fff4a0';
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 9 - 1), 1, 1);
      }
      ctx.restore();
      world.sprites.draw(ctx, 'mug', Math.floor(t * 3) & 1, e.x, e.y);
    },
    onTouchPlayer(world) {
      if (won) return;
      won = true;
      world.win();
    },
  };
  return e;
}
