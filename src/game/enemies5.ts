import type { Entity } from '../core/types';

/**
 * Inimigos da Fase 5 — Marginal de São Paulo (STUB de contrato; dono: agente ENEMY).
 * Todos morrem com 1 soco e têm posição em função PURA de `world.camera.x` (src/game/uberRules.ts):
 * nenhum guarda estado que mude a trajetória. Design: level-5-refs/gdd_bestiario_fase5.md §1 e §3.
 */
export type UberEnemyKind = 'motoboy' | 'motoboy_fast' | 'patinete' | 'drone' | 'pichador';

function stub(kind: string, x: number): Entity {
  return { kind, x, y: 128, w: 16, h: 16, vx: 0, vy: 0, dead: false, update() {}, draw() {} };
}

/** `encontroX` = centro da célula do marcador (ponto de encontro na posição neutra; no pichador, onde ele está pendurado). */
export function createUberEnemy(kind: UberEnemyKind, encontroX: number): Entity {
  return stub(kind, encontroX);
}

/** Caixa arremessada pelo caminhão-baú: `alta` = faixa alta (X), senão faixa baixa (x). */
export function createCaixa(encontroX: number, alta: boolean): Entity {
  return stub(alta ? 'caixa_alta' : 'caixa_baixa', encontroX);
}
