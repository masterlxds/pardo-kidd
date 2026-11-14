import type { Body, Level, Rect } from './types';
import { TILE } from './constants';

export interface Collision { left: boolean; right: boolean; top: boolean; bottom: boolean }

/** AABB overlap (bordas encostadas não contam). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Deslocamento máximo por sub-passo (px). Bem abaixo de meio tile → sem tunelamento. */
const MAX_SUBSTEP = 4;
/** Pequena folga para converter bordas em índices de tile sem pegar o vizinho. */
const EPS = 0.001;
/** Tolerância para considerar que a base anterior estava acima do topo do one-way. */
const ONEWAY_TOL = 0.5;

/**
 * Integra b.x/b.y por b.vx/b.vy*dt resolvendo colisão AABB contra os tiles sólidos do level
 * (eixo X depois Y, em sub-passos de no máx. 4px). Zera a componente de velocidade que colidiu.
 * NÃO aplica gravidade (o chamador faz `b.vy += g*dt` antes).
 * opts.oneWay (padrão true): pousa em tiles OneWay quando caindo vindo de cima.
 */
export function moveBody(b: Body, level: Level, dt: number, opts?: { oneWay?: boolean }): Collision {
  const col: Collision = { left: false, right: false, top: false, bottom: false };
  const oneWay = opts?.oneWay ?? true;
  const totalX = b.vx * dt;
  const totalY = b.vy * dt;
  if (!Number.isFinite(totalX) || !Number.isFinite(totalY)) return col;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalX), Math.abs(totalY)) / MAX_SUBSTEP));
  let sx = totalX / steps;
  let sy = totalY / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      b.x += sx;
      if (resolveX(b, level, sx)) {
        if (sx > 0) col.right = true; else col.left = true;
        b.vx = 0;
        sx = 0;
      }
    }
    if (sy !== 0) {
      const prevBottom = b.y + b.h;
      b.y += sy;
      if (resolveY(b, level, sy, prevBottom, oneWay)) {
        if (sy > 0) col.bottom = true; else col.top = true;
        b.vy = 0;
        sy = 0;
      }
    }
    if (sx === 0 && sy === 0) break;
  }
  return col;
}

function rowRange(b: Body): [number, number] {
  return [Math.floor(b.y / TILE), Math.floor((b.y + b.h - EPS) / TILE)];
}

function colRange(b: Body): [number, number] {
  return [Math.floor(b.x / TILE), Math.floor((b.x + b.w - EPS) / TILE)];
}

/** Resolve a borda dianteira em X. Retorna true se colidiu. */
function resolveX(b: Body, level: Level, dx: number): boolean {
  const [r0, r1] = rowRange(b);
  const tx = dx > 0 ? Math.floor((b.x + b.w - EPS) / TILE) : Math.floor(b.x / TILE);
  for (let ty = r0; ty <= r1; ty++) {
    if (level.isSolid(tx, ty)) {
      b.x = dx > 0 ? tx * TILE - b.w : (tx + 1) * TILE;
      return true;
    }
  }
  return false;
}

/** Resolve a borda dianteira em Y (com one-way ao descer). Retorna true se colidiu. */
function resolveY(b: Body, level: Level, dy: number, prevBottom: number, oneWay: boolean): boolean {
  const [c0, c1] = colRange(b);
  if (dy > 0) {
    const ty = Math.floor((b.y + b.h - EPS) / TILE);
    const top = ty * TILE;
    for (let tx = c0; tx <= c1; tx++) {
      if (level.isSolid(tx, ty) || (oneWay && prevBottom <= top + ONEWAY_TOL && level.isOneWay(tx, ty))) {
        b.y = top - b.h;
        return true;
      }
    }
  } else {
    const ty = Math.floor(b.y / TILE);
    for (let tx = c0; tx <= c1; tx++) {
      if (level.isSolid(tx, ty)) {
        b.y = (ty + 1) * TILE;
        return true;
      }
    }
  }
  return false;
}
