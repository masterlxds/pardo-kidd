import { STEP } from './constants';

export interface LoopHandlers {
  /** Um passo fixo de simulação (dt = STEP). */
  update(dt: number): void;
  /** Render 1× por frame. */
  render(): void;
  /** Chamado quando a aba fica oculta (o loop para sozinho). */
  onHidden?(): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

const MAX_STEPS = 5;
/** Delta máximo aceito por frame (s) — evita saltos após travadas longas. */
const MAX_FRAME = 0.25;

/** Loop de passo fixo com acumulador; pausa enquanto a aba está oculta. */
export function createLoop(h: LoopHandlers): Loop {
  let raf = 0;
  let running = false;
  let wanted = false;
  let last = 0;
  let acc = 0;

  const frame = (now: number): void => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let delta = (now - last) / 1000;
    last = now;
    if (!(delta > 0)) delta = 0;
    acc += Math.min(delta, MAX_FRAME);
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      h.update(STEP);
      acc -= STEP;
      steps++;
    }
    // anti-espiral: descarta o excedente se não deu conta
    if (acc >= STEP) acc %= STEP;
    h.render();
  };

  const run = (): void => {
    if (running) return;
    running = true;
    acc = 0;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const halt = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (running) {
        halt();
        h.onHidden?.();
      }
    } else if (wanted) {
      run();
    }
  });

  return {
    start() {
      wanted = true;
      if (!document.hidden) run();
    },
    stop() {
      wanted = false;
      halt();
    },
    get running() {
      return running;
    },
  };
}
