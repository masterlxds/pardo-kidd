import type { SpriteArt } from '../artTypes';

const blank = (w: number, h: number, frames: number): string[][] =>
  Array.from({ length: frames }, () => Array.from({ length: h * 2 }, () => '.'.repeat(w * 2)));

/**
 * Fase 7 — Pardo Astronauta (grades em 2×; implementação final por ART-PARDO).
 */
export const PARDO_SPACE: SpriteArt = {
  pardo_space_idle: blank(24, 24, 2),
  pardo_space_thrust: blank(24, 24, 2),
  pardo_space_boost: blank(24, 24, 2),
  pardo_space_punch: blank(28, 24, 2),
  pardo_space_hurt: blank(24, 24, 1),
  pardo_space_drink: blank(24, 24, 2),
};
