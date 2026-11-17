import type { Entity, World } from '../core/types';
import { TILE } from '../core/constants';

/** Objetos e NPCs do Bahia World (PLAN-FASE3.md §5). */

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

/** Fase da sequência de bebida/lambida do Pardo (exposta por PardoPlayer.drinkStage). */
function drinkStage(world: World): string | undefined {
  return (world.player as Partial<{ drinkStage: string }>).drinkStage;
}

function playerCx(world: World): number { return world.player.x + world.player.w / 2; }
function playerCy(world: World): number { return world.player.y + world.player.h / 2; }

/** Bolha grande de oxigênio (entidade interna da fissura). */
function createAirBubble(x: number, y: number, seed: number): Entity {
  const startY = y;
  let age = 0;
  const pop = (e: Entity, world: World): void => {
    e.dead = true;
    world.fx('bubble', e.x + e.w / 2, e.y + e.h / 2);
    world.fx('bubble', e.x + e.w / 2, e.y + e.h / 2);
  };
  const e: Entity = {
    ...base('air_bubble', x - 6, y - 6, 12, 12),
    update(dt, world) {
      age += dt;
      e.y -= 28 * dt;
      e.x += Math.cos(age * 3 + seed) * 10 * dt;
      const cx = e.x + e.w / 2;
      const hitSolid = world.level.isSolid(Math.floor(cx / TILE), Math.floor(e.y / TILE));
      if (hitSolid || startY - (e.y + 6) > TILE * 6 || e.y < -8) pop(e, world);
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'air_bubble', Math.floor(age * 4) & 1, Math.round(e.x - 2), Math.round(e.y - 2));
    },
    onTouchPlayer(world) {
      if (e.dead) return;
      world.player.refillAir(world);
      world.audio.play('air');
      pop(e, world);
    },
  };
  return e;
}

/** Fissura de bolhas. (centerX, footY) = centro da base. kind 'vent'. */
export function createAirVent(centerX: number, footY: number): Entity {
  let tBubble = 0;
  let tBig = 1.0 + (centerX % 7) * 0.1;
  const e: Entity = {
    ...base('vent', centerX - 8, footY - 8, 16, 8),
    update(dt, world) {
      tBubble -= dt;
      if (tBubble <= 0) {
        tBubble = 0.35 + ((world.time * 7) % 1) * 0.3;
        world.fx('bubble', centerX + (((world.time * 13) % 1) - 0.5) * 8, footY - 9);
      }
      tBig -= dt;
      if (tBig <= 0) {
        tBig = 2.2;
        world.spawn(createAirBubble(centerX, footY - 14, centerX));
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'air_vent', Math.floor(world.time * 6) & 1, Math.round(centerX - 8), footY - 8);
    },
  };
  return e;
}

/** Fitinha do Bonfim colecionável, centrada em (cx, cy). kind 'ribbon'. */
export function createRibbon(cx: number, cy: number): Entity {
  const phase = (cx * 0.37) % (Math.PI * 2);
  const e: Entity = {
    ...base('ribbon', cx - 4, cy - 6, 8, 12),
    update(_dt, world) {
      e.y = cy - 6 + Math.sin(world.time * 2.4 + phase) * 2;
      if (Math.random() < 0.03) world.fx('sparkle', cx + (Math.random() - 0.5) * 10, e.y + Math.random() * 12);
    },
    draw(ctx, world) {
      // brilho suave
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(world.time * 4 + phase);
      ctx.fillStyle = '#fff4a0';
      ctx.beginPath();
      ctx.arc(cx, e.y + 6, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      world.sprites.draw(ctx, 'ribbon', Math.floor(world.time * 3 + phase) & 1, Math.round(e.x), Math.round(e.y));
    },
    onTouchPlayer(world) {
      if (e.dead) return;
      e.dead = true;
      world.addRibbon();
      world.addScore(1000, cx, e.y);
      world.audio.play('ribbon');
      for (let i = 0; i < 4; i++) world.fx('sparkle', cx, e.y + 6);
    },
  };
  return e;
}

/** Cardume neutro de peixes-dourados em torno de (cx, cy). kind 'goldfish'. */
export function createGoldfishSchool(cx: number, cy: number): Entity {
  const N = 5;
  const fish = Array.from({ length: N }, (_, i) => ({
    ph: i * 1.7 + (cx % 5),
    rx: 14 + (i % 3) * 6,
    ry: 6 + (i % 2) * 5,
    sp: 0.7 + i * 0.13,
    dx: 0,
    dy: 0,
    fx: 1 as 1 | -1,
    px: cx,
  }));
  const e: Entity = {
    ...base('goldfish', cx - 8, cy - 8, 16, 16),
    update(dt, world) {
      const pcx = playerCx(world), pcy = playerCy(world);
      for (const f of fish) {
        const t = world.time * f.sp + f.ph;
        const bx = cx + Math.cos(t) * f.rx;
        const by = cy + Math.sin(t * 1.3) * f.ry;
        // dispersão suave quando o Pardo se aproxima
        const ddx = bx + f.dx - pcx, ddy = by + f.dy - pcy;
        const d = Math.hypot(ddx, ddy);
        let tx = 0, ty = 0;
        if (d < 40 && d > 0.01) {
          const k = (40 - d) / 40 * 22;
          tx = (ddx / d) * k;
          ty = (ddy / d) * k;
        }
        const a = Math.min(1, dt * 4);
        f.dx += (tx - f.dx) * a;
        f.dy += (ty - f.dy) * a;
        const nx = bx + f.dx;
        if (Math.abs(nx - f.px) > 0.05) f.fx = nx > f.px ? 1 : -1;
        f.px = nx;
      }
    },
    draw(ctx, world) {
      for (const f of fish) {
        const t = world.time * f.sp + f.ph;
        const x = cx + Math.cos(t) * f.rx + f.dx;
        const y = cy + Math.sin(t * 1.3) * f.ry + f.dy;
        world.sprites.draw(ctx, 'peixe_dourado', Math.floor(world.time * 6 + f.ph) & 1, Math.round(x - 5), Math.round(y - 4), f.fx < 0);
      }
    },
  };
  return e;
}

/** Jandira sentada na pedra. (centerX, footY) = centro da base. kind 'jandira'. */
export function createJandira(centerX: number, footY: number): Entity {
  // Personagem silenciosa: não fala; só acena, ri e mantém a aura de respiração.
  const e: Entity = {
    ...base('jandira', centerX - 24, footY - 56, 48, 56),
    update(_dt, world) {
      if (world.state.scene !== 'playing') return;
      if (Math.abs(playerCx(world) - centerX) <= 12 * TILE) world.player.refillAir(world);
    },
    draw(ctx, world) {
      const scene = world.state.scene;
      let name = 'jandira';
      if (scene === 'winning' || scene === 'win') name = 'jandira_laugh';
      else if (Math.abs(playerCx(world) - centerX) <= 9 * TILE) name = 'jandira_wave';
      world.sprites.draw(ctx, name, Math.floor(world.time * 2.5) & 1, Math.round(centerX - 24), footY - 56, true);
    },
  };
  return e;
}

/** Altar + Cajado Jailnesco (objetivo). (centerX, footY) = centro da base do altar. kind 'staff'. */
export function createStaffGoal(centerX: number, footY: number): Entity {
  let won = false;
  let licked = false;
  const e: Entity = {
    ...base('staff', centerX - 6, footY - 16 - 28, 12, 28),
    update(_dt, world) {
      const scene = world.state.scene;
      if (!won || (scene !== 'winning' && scene !== 'win')) return;
      const stage = drinkStage(world);
      if (stage === 'sip' || stage === 'done') {
        if (!licked) {
          licked = true;
          world.audio.play('lick');
        }
        if (scene === 'winning' && Math.random() < 0.5) {
          const p = world.player;
          world.fx('sparkle', p.x + p.w / 2 + (Math.random() - 0.5) * 24, p.y + Math.random() * p.h);
        }
      }
    },
    draw(ctx, world) {
      const t = world.time;
      const sp = world.sprites;
      const altarX = Math.round(centerX - 16);
      sp.draw(ctx, 'altar', 0, altarX, footY - 16);
      const inLick = won && (world.state.scene === 'winning' || world.state.scene === 'win');
      const stage = drinkStage(world);
      if (inLick && (stage === 'sip' || stage === 'done')) return; // o cajado está no sprite pardo_lick
      const pulse = Math.sin(t * 3);
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.09 * pulse;
      ctx.fillStyle = '#9ff7e6';
      ctx.beginPath();
      ctx.arc(centerX, footY - 16 - 14, 12 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      sp.draw(ctx, 'cajado', pulse > 0.2 ? 1 : 0, Math.round(centerX - 4), footY - 16 - 28);
    },
    onTouchPlayer(world) {
      if (won) return;
      world.win();
      won = world.state.scene === 'winning';
    },
  };
  return e;
}
