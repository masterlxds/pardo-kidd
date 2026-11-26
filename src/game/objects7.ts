import type { Entity } from '../core/types';
import { PLANET_GRAV, SPACE, SPACE_OBSTACLES, type PlanetDef } from './spaceRules';

/**
 * Planetas, obstáculos e objetos da Fase 7 — Espaço Sideral (dono na Etapa 2: agente OBJECTS).
 * Stub compilável da Etapa 1 usando as dimensões contratuais de `spaceRules.ts`.
 */

function stubEntity(kind: string, cx: number, cy: number, w: number, h: number): Entity {
  return {
    kind,
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    vx: 0,
    vy: 0,
    dead: false,
    update() {},
    draw() {},
  };
}

export function createPlanet(def: PlanetDef): Entity {
  const d = PLANET_GRAV.radius * 2;
  const x = def.col * SPACE.tile + SPACE.tile / 2;
  return stubEntity(`planet_${def.kind}`, x, def.y, d, d);
}

export function createWaterCapsule(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.water_capsule;
  return stubEntity('water_capsule', x, y, s.w, s.h);
}

export function createBeacon(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.space_beacon;
  return stubEntity('space_beacon', x, y, s.w, s.h);
}

export function createStation(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.eeiq_station;
  return stubEntity('eeiq_station', x, y, s.w, s.h);
}

export function createHoloSign(x: number, y: number, _frame: number): Entity {
  return stubEntity('holo_sign', x, y, 24, 24);
}

export function createSatellite(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.satellite;
  return stubEntity('satellite', x, y, s.w, s.h);
}

export function createBeamSatellite(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.satellite_beam;
  return stubEntity('satellite_beam', x, y, s.w, s.h);
}

export function createDebris(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.space_debris;
  return stubEntity('space_debris', x, y, s.w, s.h);
}

export function createSolarWind(x: number, y: number): Entity {
  const s = SPACE_OBSTACLES.solar_wind;
  return stubEntity('solar_wind', x, y, s.w, s.h);
}

export function createMothership(x: number): Entity {
  const s = SPACE_OBSTACLES.mothership;
  return stubEntity('mothership', x, SPACE.viewH / 2, s.w, s.h);
}
