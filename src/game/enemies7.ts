import type { Entity } from '../core/types';
import { SPACE_ENEMIES } from './spaceRules';

/**
 * Inimigos da Fase 7 — Espaço Sideral (dono na Etapa 2: agente ENEMY).
 * Stub compilável da Etapa 1 usando as dimensões contratuais de `SPACE_ENEMIES`.
 */
export type SpaceEnemyKind =
  | 'meteor'
  | 'meteor_fire'
  | 'comet_ice'
  | 'ufo'
  | 'alien_jet'
  | 'space_mine'
  | 'plasma_orb';

export function createSpaceEnemy(kind: SpaceEnemyKind, cx: number, cy: number, _variant?: number): Entity {
  const spec = SPACE_ENEMIES[kind];
  const e: Entity = {
    kind,
    x: cx - spec.w / 2,
    y: cy - spec.h / 2,
    w: spec.w,
    h: spec.h,
    vx: 0,
    vy: 0,
    dead: false,
    update() {},
    draw() {},
  };
  return e;
}

export function createPlasmaOrb(cx: number, cy: number): Entity {
  return createSpaceEnemy('plasma_orb', cx, cy);
}
