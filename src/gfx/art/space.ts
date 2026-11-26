import type { SpriteArt } from '../artTypes';

const blank = (w: number, h: number, frames: number): string[][] =>
  Array.from({ length: frames }, () => Array.from({ length: h * 2 }, () => '.'.repeat(w * 2)));

/**
 * Fase 7 — Planetas, estação EEIQ e objetos espaciais (grades em 2×; implementação final por ART-WORLD).
 */
export const SPACE_ART: SpriteArt = {
  planet_yuri: blank(48, 48, 2),
  planet_yumi: blank(48, 48, 2),
  water_capsule: blank(16, 16, 2),
  space_beacon: blank(16, 24, 2),
  eeiq_station: blank(80, 64, 2),
  water_pouch: blank(12, 16, 1),
  holo_sign: blank(24, 24, 3),
  solar_wind_tile: blank(16, 24, 2),
};
