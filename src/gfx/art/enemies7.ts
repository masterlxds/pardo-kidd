import type { SpriteArt } from '../artTypes';

const blank = (w: number, h: number, frames: number): string[][] =>
  Array.from({ length: frames }, () => Array.from({ length: h * 2 }, () => '.'.repeat(w * 2)));

/**
 * Fase 7 — Inimigos, obstáculos e Nave-Mãe (grades em 2×; implementação final por ART-ENEMIES).
 */
export const ENEMIES7: SpriteArt = {
  meteor: blank(16, 16, 2),
  meteor_fire: blank(20, 16, 2),
  comet_ice: blank(20, 16, 2),
  ufo: blank(24, 16, 2),
  plasma_orb: blank(8, 8, 2),
  alien_jet: blank(20, 24, 2),
  space_mine: blank(16, 16, 2),
  satellite: blank(32, 20, 2),
  satellite_beam: blank(24, 20, 2),
  space_debris: blank(24, 24, 2),
  mothership: blank(64, 56, 2),
};
