import type { Entity, World } from '../core/types';
import {
  SPACE,
  SPACE_ENEMIES,
  alienJetStep,
  cometPos,
  meteorPos,
  mineStep,
  ufoPos,
  ufoShouldFire,
  type AlienJetState,
  type SpaceMineState,
  type UfoState,
} from './spaceRules';

/**
 * Inimigos da Fase 7 — Espaço Sideral (Órbita de Quixadá).
 * Dono exclusivo: agente ENEMY.
 *
 * Toda posição e máquina de estados vem das funções puras de `src/game/spaceRules.ts`
 * (sem duplicar constantes numéricas e sem `Math.random`).
 * `game.ts` toca `'hit'` e `fx('impact')` quando `onPunch` retorna `true`.
 */
export type SpaceEnemyKind =
  | 'meteor'
  | 'meteor_fire'
  | 'comet_ice'
  | 'ufo'
  | 'alien_jet'
  | 'space_mine'
  | 'plasma_orb';

type Dir = 1 | -1;

/** Margem fora da borda esquerda antes de remover a entidade. */
const LEFT_CULL = 32;
/** Estacionamento logo fora da borda direita para evitar culling prematuro em game.ts. */
const RIGHT_PARK = SPACE.viewW + 40;

function base(kind: SpaceEnemyKind, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

function drawCentered(
  ctx: CanvasRenderingContext2D,
  world: World,
  e: Entity,
  spriteName: string,
  frame: number,
  flip = false,
): void {
  const sz = world.sprites.size(spriteName);
  world.sprites.draw(
    ctx,
    spriteName,
    frame,
    e.x + e.w / 2 - sz.w / 2,
    e.y + e.h / 2 - sz.h / 2,
    flip,
  );
}

function playerCenterX(world: World): number {
  return world.player.x + world.player.w / 2;
}

function playerCenterY(world: World): number {
  return world.player.y + world.player.h / 2;
}

// ── 1 & 2. Meteoro Comum ('m') e Meteoro Flamejante ('M') ─────────────────────

function createMeteor(cx: number, cy: number, isFire: boolean): Entity {
  const kind: SpaceEnemyKind = isFire ? 'meteor_fire' : 'meteor';
  const spec = isFire ? SPACE_ENEMIES.meteor_fire : SPACE_ENEMIES.meteor;
  let phase: 'inactive' | 'warn' | 'active' = 'inactive';

  const e: Entity = {
    ...base(kind, cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(_dt, world) {
      const pos = meteorPos(world.camera.x, cx, cy, isFire);
      phase = pos.phase;
      if (phase === 'inactive') {
        // Estaciona logo à direita da câmera para continuar recebendo update()
        e.x = world.camera.x + RIGHT_PARK;
        e.y = cy - spec.h / 2;
        return;
      }
      if (phase === 'warn') {
        e.x = world.camera.x + SPACE.viewW;
        e.y = cy - spec.h / 2;
        return;
      }
      e.x = pos.worldX - spec.w / 2;
      e.y = pos.y - spec.h / 2;
      if (pos.screenX + spec.w / 2 < -LEFT_CULL) e.dead = true;
    },
    draw(ctx, world) {
      if (phase === 'inactive') return;
      if (phase === 'warn') {
        // Brilho laranja/amarelo piscando na borda direita (sem ferir)
        const blink = Math.floor(world.time / 0.07) % 2 === 0;
        const wx = Math.round(world.camera.x + SPACE.viewW - 8);
        const wy = Math.round(cy);
        ctx.save();
        ctx.fillStyle = blink ? '#ff8a2a' : '#fff3a0';
        ctx.beginPath();
        ctx.arc(wx, wy, blink ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx - 1, wy - 1, 2, 2);
        ctx.restore();
        return;
      }
      const frame = Math.floor(world.time / (isFire ? 0.08 : 0.14)) % 2;
      drawCentered(ctx, world, e, kind, frame, isFire);
    },
    onTouchPlayer(world) {
      if (phase !== 'active' || e.dead || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world, dir: Dir) {
      if (phase !== 'active' || e.dead) return false;
      e.dead = true;
      world.audio.play('meteor_break');
      world.fx('debris', e.x + e.w / 2, e.y + e.h / 2, dir);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
  };
  return e;
}

// ── 3. Cometa de Gelo ('g') ──────────────────────────────────────────────────

function createComet(cx: number, cy: number, row: number): Entity {
  const spec = SPACE_ENEMIES.comet_ice;
  let phase: 'inactive' | 'warn' | 'active' = 'inactive';
  let vxScreen = 0;
  let vyScreen = 0;

  const e: Entity = {
    ...base('comet_ice', cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(_dt, world) {
      const pos = cometPos(world.camera.x, cx, cy, row);
      phase = pos.phase;
      vxScreen = pos.vxScreen;
      vyScreen = pos.vyScreen;
      if (phase === 'inactive') {
        e.x = world.camera.x + RIGHT_PARK;
        e.y = cy - spec.h / 2;
        return;
      }
      if (phase === 'warn') {
        e.x = world.camera.x + SPACE.viewW;
        e.y = cy - spec.h / 2;
        return;
      }
      e.x = pos.worldX - spec.w / 2;
      e.y = pos.y - spec.h / 2;
      if (pos.screenX + spec.w / 2 < -LEFT_CULL || pos.y < -LEFT_CULL || pos.y > SPACE.viewH + LEFT_CULL) {
        e.dead = true;
      }
    },
    draw(ctx, world) {
      if (phase === 'inactive') return;
      if (phase === 'warn') {
        // Linha tracejada azul-clara de aviso mostrando a trajetória exata em tela
        const blink = Math.floor(world.time / 0.08) % 2 === 0;
        const x0 = world.camera.x + SPACE.viewW;
        const y0 = cy;
        const tSpan = SPACE.viewW / Math.max(1, Math.abs(vxScreen));
        const x1 = x0 + vxScreen * tSpan;
        const y1 = y0 + vyScreen * tSpan;
        ctx.save();
        ctx.strokeStyle = blink ? '#9fe0ff' : '#2f9be0';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -(world.time * 48);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const frame = Math.floor(world.time / 0.08) % 2;
      drawCentered(ctx, world, e, 'comet_ice', frame, true);
    },
    onTouchPlayer(world) {
      if (phase !== 'active' || e.dead || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world, dir: Dir) {
      if (phase !== 'active' || e.dead) return false;
      e.dead = true;
      world.audio.play('meteor_break');
      world.fx('sparkle', e.x + e.w / 2, e.y + e.h / 2, dir);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      world.addCoin();
      return true;
    },
  };
  return e;
}

// ── 4. OVNI Patrulheiro ('u') ────────────────────────────────────────────────

function createUfo(cx: number, cy: number): Entity {
  const spec = SPACE_ENEMIES.ufo;
  const ufoState: UfoState = { phase: 'patrol', chargeTimer: 0 };
  let posPhase: 'inactive' | 'warn' | 'active' = 'inactive';

  const e: Entity = {
    ...base('ufo', cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(dt, world) {
      const pos = ufoPos(world.camera.x, cx, cy);
      posPhase = pos.phase;
      if (posPhase === 'inactive') {
        e.x = world.camera.x + RIGHT_PARK;
        e.y = cy - spec.h / 2;
        return;
      }
      e.x = pos.worldX - spec.w / 2;
      e.y = pos.y - spec.h / 2;

      const playerScreenX = playerCenterX(world) - world.camera.x;
      if (ufoShouldFire(ufoState, pos.screenX, playerScreenX, dt)) {
        world.audio.play('ufo_zap');
        world.spawn(createPlasmaOrb(pos.worldX - 10, pos.y));
      }

      if (pos.screenX + spec.w / 2 < -LEFT_CULL) e.dead = true;
    },
    draw(ctx, world) {
      if (posPhase !== 'active') return;
      const frame = Math.floor(world.time / 0.1) % 2;
      drawCentered(ctx, world, e, 'ufo', frame, true);
      if (ufoState.phase === 'charging') {
        // Halo branco piscando na cúpula durante o carregamento de 0,55 s
        const blink = Math.floor(world.time / 0.06) % 2 === 0;
        const hx = Math.round(e.x + e.w / 2);
        const hy = Math.round(e.y + 3);
        ctx.save();
        ctx.strokeStyle = blink ? '#ffffff' : '#a8f070';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, blink ? 6 : 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    onTouchPlayer(world) {
      if (posPhase !== 'active' || e.dead || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world, dir: Dir) {
      if (posPhase !== 'active' || e.dead) return false;
      e.dead = true;
      world.fx('debris', e.x + e.w / 2, e.y + e.h / 2, dir);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
  };
  return e;
}

// ── 5. Projétil de Plasma ('plasma_orb') ─────────────────────────────────────

function createPlasmaOrbEntity(cx: number, cy: number): Entity {
  const spec = SPACE_ENEMIES.plasma_orb;
  const e: Entity = {
    ...base('plasma_orb', cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(dt, world) {
      e.x -= spec.speed * dt;
      if (e.x + e.w < world.camera.x - 16) e.dead = true;
    },
    draw(ctx, world) {
      const frame = Math.floor(world.time / 0.07) % 2;
      drawCentered(ctx, world, e, 'plasma_orb', frame, true);
    },
    onTouchPlayer(world) {
      if (e.dead || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
      e.dead = true;
    },
    onPunch(world, dir: Dir) {
      if (e.dead) return false;
      e.dead = true;
      world.fx('sparkle', e.x + e.w / 2, e.y + e.h / 2, dir);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
  };
  return e;
}

// ── 6. Alien de Jetpack ('a') ────────────────────────────────────────────────

function createAlienJet(cx: number, cy: number): Entity {
  const spec = SPACE_ENEMIES.alien_jet;
  let active = false;
  const alienState: AlienJetState = {
    phase: 'approach',
    sx: SPACE.viewW + spec.w / 2,
    sy: cy,
    vy: 0,
    lockTimer: 0,
  };

  const e: Entity = {
    ...base('alien_jet', cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(dt, world) {
      if (!active) {
        if (world.camera.x < cx - SPACE.viewW) {
          e.x = world.camera.x + RIGHT_PARK;
          e.y = cy - spec.h / 2;
          return;
        }
        active = true;
        alienState.sx = SPACE.viewW + spec.w / 2;
        alienState.sy = cy;
      }

      const playerScreenX = playerCenterX(world) - world.camera.x;
      const playerScreenY = playerCenterY(world);
      alienJetStep(alienState, playerScreenX, playerScreenY, dt);

      e.x = world.camera.x + alienState.sx - spec.w / 2;
      e.y = alienState.sy - spec.h / 2;
      if (alienState.sx + spec.w / 2 < -LEFT_CULL) e.dead = true;
    },
    draw(ctx, world) {
      if (!active) return;
      const frame = Math.floor(world.time / (alienState.phase === 'dash' ? 0.06 : 0.12)) % 2;
      if (alienState.phase === 'lock') {
        // Contorno/alerta amarelo piscando antes do bote
        const blink = Math.floor(world.time / 0.06) % 2 === 0;
        if (blink) {
          ctx.save();
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(e.x) - 1, Math.round(e.y) - 1, e.w + 2, e.h + 2);
          ctx.restore();
        }
      }
      drawCentered(ctx, world, e, 'alien_jet', frame, true);
    },
    onTouchPlayer(world) {
      if (!active || e.dead || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world, dir: Dir) {
      if (!active || e.dead) return false;
      e.dead = true;
      world.fx('debris', e.x + e.w / 2, e.y + e.h / 2, dir);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
  };
  return e;
}

// ── 7. Mina Orbital Magnética ('b') ──────────────────────────────────────────

function createSpaceMine(cx: number, cy: number): Entity {
  const spec = SPACE_ENEMIES.space_mine;
  const mineState: SpaceMineState = { phase: 'idle', timer: 0 };

  const e: Entity = {
    ...base('space_mine', cx - spec.w / 2, cy - spec.h / 2, spec.w, spec.h),
    update(dt, world) {
      mineStep(mineState, cx, cy, playerCenterX(world), playerCenterY(world), dt);
      e.x = cx - spec.w / 2;
      e.y = cy - spec.h / 2;
      if (e.x + e.w < world.camera.x - LEFT_CULL) e.dead = true;
    },
    draw(ctx, world) {
      const mcx = Math.round(cx);
      const mcy = Math.round(cy);
      if (mineState.phase === 'arming') {
        const blink = Math.floor(world.time / 0.05) % 2 === 0;
        ctx.save();
        ctx.strokeStyle = blink ? '#e23b3b' : '#ffd23f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mcx, mcy, blink ? 10 : 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        drawCentered(ctx, world, e, 'space_mine', blink ? 1 : 0);
        return;
      }
      if (mineState.phase === 'armed') {
        const pulse = Math.floor(world.time / 0.08) % 2 === 0;
        ctx.save();
        ctx.strokeStyle = pulse ? '#e23b3b' : '#ff8a2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mcx, mcy, pulse ? 12 : 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        drawCentered(ctx, world, e, 'space_mine', 1);
        return;
      }
      drawCentered(ctx, world, e, 'space_mine', 0);
    },
    onTouchPlayer(world) {
      if (e.dead || world.player.dead) return;
      world.player.hurt(world, cx);
      if (mineState.phase === 'armed') {
        world.audio.play('bomb');
        world.fx('debris', cx, cy);
        e.dead = true;
      }
    },
    onPunch(world, dir: Dir) {
      if (e.dead) return false;
      if (mineState.phase !== 'armed') {
        // Desarmada ('idle' ou 'arming'): 1 Soco destrói sem ferir
        e.dead = true;
        world.audio.play('bomb');
        world.fx('debris', cx, cy, dir);
        world.addScore(spec.points, cx, e.y);
        return true;
      }
      // Armada: imune a soco — explode ferindo o Pardo
      world.audio.play('bomb');
      world.fx('debris', cx, cy, dir);
      world.player.hurt(world, cx);
      e.dead = true;
      return false;
    },
  };
  return e;
}

// ── Fábricas exportadas ──────────────────────────────────────────────────────

export function createSpaceEnemy(kind: SpaceEnemyKind, cx: number, cy: number, variant?: number): Entity {
  switch (kind) {
    case 'meteor':
      return createMeteor(cx, cy, false);
    case 'meteor_fire':
      return createMeteor(cx, cy, true);
    case 'comet_ice':
      return createComet(cx, cy, variant ?? 0);
    case 'ufo':
      return createUfo(cx, cy);
    case 'alien_jet':
      return createAlienJet(cx, cy);
    case 'space_mine':
      return createSpaceMine(cx, cy);
    case 'plasma_orb':
      return createPlasmaOrbEntity(cx, cy);
  }
}

export function createPlasmaOrb(cx: number, cy: number): Entity {
  return createPlasmaOrbEntity(cx, cy);
}
