import './style.css';
import type { GameState } from './core/types';
import { RENDER_SCALE, VIEW_H, VIEW_W } from './core/constants';
import { createInput, type Input } from './core/input';
import { createLoop } from './core/loop';
import { createGame, type GameWorld } from './game/game';

/** Gancho para QA automatizado. */
export interface PkDebug {
  world: GameWorld;
  state: GameState;
  input: Input;
}

declare global {
  interface Window {
    __pk?: PkDebug;
  }
}

/** `?fase=N` (1-based) → índice inicial da fase (atalho de teste). */
function startLevelFromUrl(): number {
  try {
    const n = Number.parseInt(new URLSearchParams(window.location.search).get('fase') ?? '', 10);
    return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
  } catch {
    return 0;
  }
}

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas #game não encontrado');
  canvas.width = VIEW_W * RENDER_SCALE;
  canvas.height = VIEW_H * RENDER_SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.imageSmoothingEnabled = false;

  const input = createInput(canvas);
  try {
    const game = createGame(ctx, input, { startLevel: startLevelFromUrl() });
    window.__pk = { world: game.world, state: game.state, input };
    const loop = createLoop({
      update: (dt) => game.update(dt),
      render: () => game.render(),
      onHidden: () => game.onHidden(),
    });
    game.render();
    loop.start();
  } catch (err) {
    console.error(err);
    ctx.fillStyle = '#1a1423';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '8px monospace';
    ctx.fillText('Erro ao iniciar o jogo', 8, 16);
    ctx.fillText(String(err instanceof Error ? err.message : err).slice(0, 60), 8, 28);
  }
}

boot();
