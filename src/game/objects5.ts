import type { Entity } from '../core/types';
import type { UberObstacleKind } from './uberRules';

/**
 * Objetos da Fase 5 — Marginal de São Paulo (STUB de contrato; dono: agente OBJECTS).
 * Carro da Uber, obstáculos, barreira, isopor, rampa, caminhão-baú, placas de tutorial e desembarque.
 * Números (zonas que ferem, rampa, caminhão) em src/game/uberRules.ts. Design: gdd_bestiario_fase5.md §2, §4, §5.
 * `left` = canto esquerdo da célula do marcador (px de mundo).
 */
function stub(kind: string, x: number): Entity {
  return { kind, x, y: 128, w: 16, h: 16, vx: 0, vy: 0, dead: false, update() {}, draw() {} };
}

/**
 * Carro preto da Uber (kind 'uber_car', 64x24). NÃO é plataforma do sistema genérico: o chão do Pardo é
 * calculado por player.ts (UBER.roofY − uberRampOffset). O carro apenas se desenha centrado sob o Pardo,
 * todo passo, em qualquer lugar da fase (game.ts o isenta do culling por distância).
 */
export function createUberCar(centerX: number): Entity { return stub('uber_car', centerX - 32); }
/** Obstáculo indestrutível (L, F, G, i): fere ao toque na zona de UBER_OBSTACLES e atravessa. */
export function createObstaculo(tipo: UberObstacleKind, left: number): Entity { return stub('obst_' + tipo, left); }
/** B — barreira da CET: fere ao toque, quebra com 1 soco (+50). */
export function createBarreira(left: number): Entity { return stub('barreira_cet', left); }
/** W — isopor do ambulante: não fere; 1 soco = +1 gota (uma vez). */
export function createIsopor(left: number): Entity { return stub('isopor_agua', left); }
/** J — rampa de obra (só desenho + efeitos; a altura do voo vem de uberRampOffset). */
export function createRampa(left: number): Entity { return stub('rampa_obra', left); }
/** T — caminhão-baú: entra quando a câmera alcança `left`, fica UBER.truckBars compassos em UBER.truckScreenX e sai. */
export function createTruckBau(left: number): Entity { return stub('truck_bau', left); }
/** 1..4 — placa de tutorial (frame 0 PULE, 1 SOQUE, 2 NÃO PULE, 3 PULE+SOQUE), decoração na mureta. */
export function createTutorialSign(left: number, frame: number): Entity { return stub('tutorial_sign' + frame, left); }
/** A — desembarque VIP 5★ (kind 'uber_goal'): toque → world.win(). footY = y do asfalto (160). */
export function createUberGoal(centerX: number, footY: number): Entity { return stub('uber_goal', centerX - 11 + footY * 0); }
