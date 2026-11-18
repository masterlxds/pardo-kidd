import { TILE, UBER_SPEED, VIEW_W } from '../core/constants';
import { Tile, type Entity, type World } from '../core/types';
import { createDrop } from './objects';

/** Objetos, Carro da Uber e Desembarque VIP da Fase 5 — Marginal de São Paulo (PLAN-FASE5.md §4). */

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Fase atual da sequência de bebida do Pardo (exposta por PardoPlayer.drinkStage). */
function drinkStage(world: World): string | undefined {
  return (world.player as Partial<{ drinkStage: string }>).drinkStage;
}

/**
 * Carro preto da Uber (64x24, platform = true, teto em y = 160 quando há asfalto na linha 11).
 * Acompanha o Pardo dentro dos limites da câmera; dx = 0 e dy = 0 sempre (player.ts já aplica UBER_SPEED).
 */
export function createUberCar(spawnX: number, roofY: number): Entity {
  let leadOffset = 0;
  let dipY = 0;
  let dustTimer = 0.22;

  const e: Entity = {
    ...base('uber_car', spawnX - 24, roofY, 64, 24),
    platform: true,
    dx: 0,
    dy: 0,
    update(dt, world) {
      e.dx = 0;
      e.dy = 0;

      const scrolling =
        world.camera.x < world.level.widthPx - VIEW_W - 1 && world.state.scene === 'playing';
      const baseVx = scrolling ? UBER_SPEED : 0;
      const relVx = world.player.vx - baseVx;

      const targetLead = clamp(relVx * 0.1, -12, 12);
      leadOffset += (targetLead - leadOffset) * Math.min(1, dt * 10);

      const wantX = world.player.x + world.player.w / 2 - e.w / 2 - leadOffset;
      e.x = clamp(wantX, world.camera.x + 2, world.camera.x + VIEW_W - e.w - 2);

      const txL = Math.floor((world.player.x + 1) / TILE);
      const txR = Math.floor((world.player.x + world.player.w - 1) / TILE);
      const hasRoad =
        world.level.tileAt(txL, 11) === Tile.GroundTop ||
        world.level.tileAt(txR, 11) === Tile.GroundTop;

      if (hasRoad) {
        e.platform = true;
        e.y = roofY;
        dipY = Math.max(0, dipY - 140 * dt);
      } else {
        e.platform = false;
        dipY = Math.min(20, dipY + 110 * dt);
      }

      if (scrolling && hasRoad) {
        dustTimer -= dt;
        if (dustTimer <= 0) {
          dustTimer = 0.22;
          world.fx('dust', e.x + 10, e.y + e.h - 2, -1);
        }
      }
    },
    draw(ctx, world) {
      const scrolling =
        world.camera.x < world.level.widthPx - VIEW_W - 1 && world.state.scene === 'playing';
      const rx = Math.round(e.x);
      const ry = Math.round(e.y + dipY);

      ctx.save();

      // Sombra escura suave sob as rodas no asfalto
      ctx.fillStyle = 'rgba(8, 10, 20, 0.45)';
      ctx.fillRect(rx + 4, ry + e.h - 2, e.w - 8, 3);

      // Cone de luz dos faróis dianteiros à direita do carro (44 px à frente)
      const hx = rx + e.w - 2;
      const hy = ry + 11;
      const grad = ctx.createLinearGradient(hx, hy, hx + 44, hy);
      grad.addColorStop(0, 'rgba(255, 230, 130, 0.22)');
      grad.addColorStop(1, 'rgba(255, 230, 130, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 2);
      ctx.lineTo(hx + 44, hy - 9);
      ctx.lineTo(hx + 44, hy + 11);
      ctx.lineTo(hx, hy + 3);
      ctx.closePath();
      ctx.fill();

      // Luz vermelha suave de freio/lanterna atrás
      ctx.fillStyle = 'rgba(230, 50, 50, 0.25)';
      ctx.fillRect(rx - 6, ry + 10, 6, 5);

      ctx.restore();

      const frame = scrolling ? Math.floor(world.time * 18) % 2 : 0;
      world.sprites.draw(ctx, 'uber_car', frame, rx, ry);
    },
  };
  return e;
}

/** Cooler térmico "5★ ÁGUA" 16x32 (x,y = canto sup. esq.). Solta até 3 gotas a socos, depois fica vazio. */
export function createCoolerUber(x: number, y: number): Entity {
  let drops = 0;
  let shake = 0;
  const e: Entity = {
    ...base('cooler_uber', x, y, 16, 32),
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt);
    },
    draw(ctx, world) {
      const off = shake > 0 ? (Math.floor(shake * 60) % 2 ? 1 : -1) : 0;
      world.sprites.draw(ctx, 'cooler_uber', drops >= 3 ? 1 : 0, e.x + off, e.y);
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
 * Objetivo da Fase 5: Ponto de Desembarque VIP 5 Estrelas na entrada da Transportadora.
 * Hitbox 22x32 centrada em centerX, base em footY; toque → world.win().
 */
export function createUberGoal(centerX: number, footY: number): Entity {
  const HW = 22;
  const HH = 32;
  let won = false;
  let delivered = false;
  let idleSparkleTimer = 0.9;
  let winSparkleTimer = 0;

  const e: Entity = {
    ...base('uber_goal', centerX - HW / 2, footY - HH, HW, HH),
    update(dt, world) {
      const scene = world.state.scene;

      if (scene === 'playing') {
        idleSparkleTimer -= dt;
        if (idleSparkleTimer <= 0) {
          idleSparkleTimer = 0.9;
          world.fx('sparkle', centerX + (Math.random() - 0.5) * 16, footY - 28);
        }
        return;
      }

      if (won && (scene === 'winning' || scene === 'win')) {
        if (scene === 'winning' && !delivered) {
          delivered = true;
          world.audio.play('horn');
          world.audio.play('deliver');
        }
        const stage = drinkStage(world);
        if (scene === 'winning' && (!stage || stage === 'sip' || stage === 'done')) {
          winSparkleTimer -= dt;
          if (winSparkleTimer <= 0) {
            winSparkleTimer = 0.18;
            world.fx('sparkle', world.player.x + 5, world.player.y + 4);
          }
        }
      }
    },
    draw(ctx, world) {
      const t = world.time;

      // Halo dourado pulsante suave atrás do totem
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 4);
      ctx.fillStyle = '#fff4a0';
      ctx.beginPath();
      ctx.arc(centerX, footY - 20, 18 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      world.sprites.draw(ctx, 'uber_goal', Math.floor(t * 3) & 1, Math.round(centerX - 16), footY - 40);
    },
    onTouchPlayer(world) {
      if (won) return;
      world.win();
      won = world.state.scene === 'winning';
    },
  };
  return e;
}

