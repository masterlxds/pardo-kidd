import type { Background } from '../core/types';
import { VIEW_H, VIEW_W } from '../core/constants';

/**
 * Parallax da Fase 7 — Espaço Sideral (Órbita de Quixadá).
 * Stub compilável da Etapa 1 (implementação completa por BG na Etapa 2).
 */
export function createSpaceBackground(): Background {
  return {
    draw(ctx) {
      ctx.fillStyle = '#07091a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    },
    drawForeground() {},
  };
}
