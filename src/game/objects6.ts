import type { Entity, World } from '../core/types';
import { createDrop } from './objects';

/** Objetos e NPC da Fase 6 — Transportadora de São Paulo (PLAN-FASE6.md §4). */

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

/** Fase atual da sequência de bebida do Pardo (exposta por PardoPlayer.drinkStage). */
function drinkStage(world: World): string | undefined {
  return (world.player as Partial<{ drinkStage: string }>).drinkStage;
}

/** Bebedouro de galão 16x32 (x,y = canto sup. esq.). Solta até 3 gotas a socos, depois fica vazio. */
export function createBebedouro(x: number, y: number): Entity {
  let drops = 0;
  let shake = 0;
  const e: Entity = {
    ...base('bebedouro', x, y, 16, 32),
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt);
    },
    draw(ctx, world) {
      const off = shake > 0 ? (Math.floor(shake * 60) % 2 ? 1 : -1) : 0;
      world.sprites.draw(ctx, 'bebedouro', drops >= 3 ? 1 : 0, e.x + off, e.y);
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
 * Objetivo da Fase 6: Renan Maia com a xícara de café. (centerX, footY) = centro da base.
 * Silencioso, parado. Hitbox 22x32; toque → world.win().
 */
export function createMaiaGoal(centerX: number, footY: number): Entity {
  const HW = 22;
  const HH = 32;
  let won = false;
  let delivered = false;
  let steamTimer = 0.6;
  let sparkleTimer = 0;

  const e: Entity = {
    ...base('maia', centerX - HW / 2, footY - HH, HW, HH),
    update(dt, world) {
      const scene = world.state.scene;

      if (scene === 'playing') {
        // Fumacinha ocasional da xícara (mão voltada para o Pardo, lado esquerdo após o flip)
        steamTimer -= dt;
        if (steamTimer <= 0) {
          steamTimer = 1.4;
          world.fx('sparkle', centerX - 13, footY - 26);
        }
        return;
      }

      if (won && (scene === 'winning' || scene === 'win')) {
        if (scene === 'winning' && !delivered) {
          delivered = true;
          world.audio.play('deliver');
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
      const left = Math.round(centerX - 17);
      const top = footY - 36;
      const giving = won && (world.state.scene === 'winning' || world.state.scene === 'win');

      if (!giving) {
        // Brilho suave pulsante de objetivo
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 4);
        ctx.fillStyle = '#fff4a0';
        ctx.beginPath();
        ctx.arc(centerX, footY - 16, 16 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        sp.draw(ctx, 'maia_idle', Math.floor(t * 2) & 1, left, top, true);
        return;
      }

      const stage = drinkStage(world);
      if (stage !== 'sip' && stage !== 'done') {
        // maia_give já inclui a xícara na mão estendida
        sp.draw(ctx, 'maia_give', Math.floor(t * 3) & 1, left, top, true);
      } else {
        sp.draw(ctx, 'maia_cheer', Math.floor(t * 4) & 1, left, top, true);
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
