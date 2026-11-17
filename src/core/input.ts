/**
 * Entrada: teclado + touch (pointer events, multitouch).
 * `down` = estado atual; `pressed`/`released` = bordas acumuladas desde o último passo fixo,
 * válidas até `endStep()` (chamado no fim de cada passo).
 */

import { VIEW_H, VIEW_W } from './constants';

export type Action = 'left' | 'right' | 'jump' | 'punch' | 'start' | 'confirm' | 'pause' | 'mute';

export interface Input {
  down(a: Action): boolean;
  pressed(a: Action): boolean;
  released(a: Action): boolean;
  /** Limpa as bordas; chamar no fim de cada passo fixo. */
  endStep(): void;
  /** Solta tudo (ex.: perda de foco). */
  clear(): void;
  /** Callback chamado de forma SÍNCRONA dentro de todo gesto do usuário (para destravar áudio). */
  onGesture(cb: () => void): void;
  /** Posição (coordenadas lógicas 320x180) do toque/clique no canvas neste passo, ou null. Limpa em endStep(). */
  tapPos(): { x: number; y: number } | null;
  /** true depois do primeiro toque detectado. */
  readonly touch: boolean;
}

const ACTIONS: readonly Action[] = ['left', 'right', 'jump', 'punch', 'start', 'confirm', 'pause', 'mute'];

/** Mapeamento de teclado por `KeyboardEvent.code`. */
const KEYMAP: Readonly<Record<string, readonly Action[]>> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['jump'],
  KeyW: ['jump'],
  Space: ['punch', 'confirm'],
  KeyZ: ['punch'],
  KeyJ: ['punch'],
  Enter: ['start', 'confirm'],
  NumpadEnter: ['start', 'confirm'],
  KeyP: ['pause'],
  Escape: ['pause'],
  KeyM: ['mute'],
};
/** Teclas sem ação, mas cujo comportamento padrão (rolar a página) bloqueamos. */
const SWALLOW = new Set(['ArrowDown', 'KeyS', 'PageUp', 'PageDown']);

/** Botões touch → ações (pulo/soco também confirmam nas telas de título/fim). */
const BUTTONS: ReadonlyArray<readonly [string, readonly Action[]]> = [
  ['btn-left', ['left']],
  ['btn-right', ['right']],
  ['btn-jump', ['jump', 'confirm']],
  ['btn-punch', ['punch', 'confirm']],
];

export function createInput(canvas: HTMLCanvasElement): Input {
  /** Fontes que mantêm cada ação pressionada (ex.: "k:KeyA", "p:3"). */
  const sources = new Map<Action, Set<string>>();
  const pressedSet = new Set<Action>();
  const releasedSet = new Set<Action>();
  const gestureCbs: Array<() => void> = [];
  let touch = false;
  let lastTap: { x: number; y: number } | null = null;

  for (const a of ACTIONS) sources.set(a, new Set());

  const press = (a: Action, src: string): void => {
    const s = sources.get(a);
    if (!s || s.has(src)) return;
    if (s.size === 0) pressedSet.add(a);
    s.add(src);
  };
  const release = (a: Action, src: string): void => {
    const s = sources.get(a);
    if (!s || !s.has(src)) return;
    s.delete(src);
    if (s.size === 0) releasedSet.add(a);
  };
  /** Borda instantânea (toque que não fica "segurado"). */
  const tap = (a: Action): void => {
    pressedSet.add(a);
    releasedSet.add(a);
  };
  const gesture = (): void => {
    for (const cb of gestureCbs) {
      try {
        cb();
      } catch (err) {
        console.error(err);
      }
    }
  };
  const markTouch = (): void => {
    if (touch) return;
    touch = true;
    document.body.classList.add('touch');
  };
  const clear = (): void => {
    for (const [a, s] of sources) {
      if (s.size > 0) releasedSet.add(a);
      s.clear();
    }
  };

  // ── Teclado ────────────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const acts = KEYMAP[e.code];
    if (!acts) {
      if (SWALLOW.has(e.code)) e.preventDefault();
      return;
    }
    e.preventDefault();
    gesture();
    if (e.repeat) return;
    for (const a of acts) press(a, `k:${e.code}`);
  });
  window.addEventListener('keyup', (e) => {
    const acts = KEYMAP[e.code];
    if (!acts) return;
    e.preventDefault();
    for (const a of acts) release(a, `k:${e.code}`);
  });
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear();
  });

  // ── Touch / pointer ────────────────────────────────────────────────────────
  const releasePointer = (id: number): void => {
    const src = `p:${id}`;
    for (const a of ACTIONS) release(a, src);
  };

  window.addEventListener('touchstart', markTouch, { passive: true, capture: true });

  for (const [id, acts] of BUTTONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const src = (e: PointerEvent): string => `p:${e.pointerId}`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'touch') markTouch();
      gesture();
      // libera a captura implícita do touch para permitir deslizar entre botões
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      for (const a of acts) press(a, src(e));
    });
    el.addEventListener('pointerenter', (e) => {
      const held = e.pointerType === 'touch' ? e.pressure > 0 || e.buttons > 0 : (e.buttons & 1) === 1;
      if (!held) return;
      for (const a of acts) {
        if (a === 'confirm') continue; // confirmar só no toque inicial
        press(a, src(e));
      }
    });
    const up = (e: PointerEvent): void => {
      for (const a of acts) release(a, src(e));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // rede de segurança: qualquer dedo que sai da tela solta tudo que segurava
  window.addEventListener('pointerup', (e) => releasePointer(e.pointerId));
  window.addEventListener('pointercancel', (e) => releasePointer(e.pointerId));

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'touch') markTouch();
    gesture();
    const r = canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      lastTap = { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
    }
    tap('confirm');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const mute = document.getElementById('btn-mute');
  if (mute) {
    mute.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'touch') markTouch();
      gesture();
      tap('mute');
    });
    // teclado/leitores de tela (click sem pointerdown precedente: detail === 0)
    mute.addEventListener('click', (e) => {
      if (e.detail === 0) {
        gesture();
        tap('mute');
      }
    });
  }

  return {
    down: (a) => (sources.get(a)?.size ?? 0) > 0,
    pressed: (a) => pressedSet.has(a),
    released: (a) => releasedSet.has(a),
    endStep() {
      pressedSet.clear();
      releasedSet.clear();
      lastTap = null;
    },
    tapPos: () => lastTap,
    clear,
    onGesture(cb) {
      gestureCbs.push(cb);
    },
    get touch() {
      return touch;
    },
  };
}
