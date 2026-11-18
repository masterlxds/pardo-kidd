import type { Entity, World } from '../core/types';
import { TILE } from '../core/constants';
import { createDrop } from './objects';

/** Objetos e NPCs da Fase 4 — Favela do Rio (PLAN-FASE4.md §3). */

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

/** Fase atual da sequência de bebida do Pardo (exposta por PardoPlayer.drinkStage). */
function drinkStage(world: World): string | undefined {
  return (world.player as Partial<{ drinkStage: string }>).drinkStage;
}

/** Filtro de barro 16x32 (x,y = canto sup. esq.). Solta até 3 gotas a socos, depois seca. */
export function createClayFilter(x: number, y: number): Entity {
  let drops = 0;
  let shake = 0;
  const e: Entity = {
    ...base('clay_filter', x, y, 16, 32),
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt);
    },
    draw(ctx, world) {
      const off = shake > 0 ? (Math.floor(shake * 60) % 2 ? 1 : -1) : 0;
      world.sprites.draw(ctx, 'clay_filter', drops >= 3 ? 1 : 0, e.x + off, e.y);
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

/**
 * Objetivo da Fase 4: Amaro, o faxineiro do tribunal, varrendo o chão com a garrafa de água mineral.
 * (centerX, footY) = centro da base. Hitbox 16x22.
 */
export function createAmaroGoal(centerX: number, footY: number): Entity {
  const HW = 16;
  const HH = 22;
  let won = false;
  let delivered = false;
  let greeted = false;
  let sweepOffset = 0;
  let sweepDir: 1 | -1 = -1;
  let dustTimer = 0.45;
  let sparkleTimer = 0;

  const e: Entity = {
    ...base('amaro', centerX - HW / 2, footY - HH, HW, HH),
    update(dt, world) {
      const scene = world.state.scene;

      if (scene === 'playing') {
        // Vai-e-vem tranquilo (±6px em torno de centerX a ~10 px/s)
        sweepOffset += sweepDir * 10 * dt;
        if (sweepOffset >= 6) {
          sweepOffset = 6;
          sweepDir = -1;
        } else if (sweepOffset <= -6) {
          sweepOffset = -6;
          sweepDir = 1;
        }
        e.x = centerX + sweepOffset - HW / 2;

        // Poeira discreta na vassoura (~0.9s)
        dustTimer -= dt;
        if (dustTimer <= 0) {
          dustTimer = 0.9;
          world.fx('dust', e.x - 2, footY - 2, -1);
        }

        // Fala de aproximação (<= 7.5 tiles = 120px)
        if (!greeted) {
          const pcx = world.player.x + world.player.w / 2;
          const acx = e.x + e.w / 2;
          if (Math.abs(pcx - acx) <= 7.5 * TILE) {
            greeted = true;
            world.audio.play('talk');
            world.say('AMARO', 'OPA DOUTOR! PISOU NO CHÃO LIMPO? TOMA UMA ÁGUA MINERAL AÍ!', 4.2);
          }
        }
        return;
      }

      if (won && (scene === 'winning' || scene === 'win')) {
        if (scene === 'winning' && !delivered) {
          delivered = true;
          world.audio.play('deliver');
          world.audio.play('talk');
          world.say('AMARO', 'ÁGUA MINERAL TRINCANDO DIRETO DO BEBEDOURO DO TRIBUNAL!', 3.8);
        }

        const stage = drinkStage(world);
        if (scene === 'winning' && (stage === 'sip' || stage === 'done')) {
          sparkleTimer -= dt;
          if (sparkleTimer <= 0) {
            sparkleTimer = 0.18;
            world.fx('sparkle', world.player.x + 5, world.player.y + 4);
          }
        }
      }
    },
    draw(ctx, world) {
      const t = world.time;
      const sp = world.sprites;
      const left = Math.round(e.x + e.w / 2 - 14);
      const top = footY - 26;
      const giving = won && (world.state.scene === 'winning' || world.state.scene === 'win');

      if (!giving) {
        // Brilho suave pulsante de objetivo
        const cx = e.x + e.w / 2;
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 4);
        ctx.fillStyle = '#fff4a0';
        ctx.beginPath();
        ctx.arc(cx, footY - 12, 12 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        sp.draw(ctx, 'amaro_sweep', Math.floor(t * 6) & 3, left, top, true);
        return;
      }

      const stage = drinkStage(world);
      if (stage !== 'sip' && stage !== 'done') {
        sp.draw(ctx, 'amaro_give', Math.floor(t * 3) & 1, left, top, true);
        sp.draw(ctx, 'mineral_bottle', Math.floor(t * 4) & 1, left - 6, top + 8);
      } else {
        sp.draw(ctx, 'amaro_cheer', Math.floor(t * 4) & 1, left, top, true);
      }
    },
    onTouchPlayer(world) {
      if (won) return;
      world.win();
      won = world.state.scene === 'winning';
    },
  };
  return e;
}
