/**
 * Entrada: teclado + touch (pointer events, multitouch).
 * `down` = estado atual; `pressed`/`released` = bordas acumuladas desde o último passo fixo,
 * válidas até `endStep()` (chamado no fim de cada passo).
 */

import { VIEW_H, VIEW_W } from './constants';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'boost' | 'punch' | 'start' | 'confirm' | 'pause' | 'mute';

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

const ACTIONS: readonly Action[] = ['left', 'right', 'up', 'down', 'jump', 'boost', 'punch', 'start', 'confirm', 'pause', 'mute'];

/** Mapeamento de teclado por `KeyboardEvent.code`. */
const KEYMAP: Readonly<Record<string, readonly Action[]>> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['jump', 'up'],
  KeyW: ['jump', 'up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  KeyX: ['boost'],
  KeyK: ['boost'],
  ShiftLeft: ['boost'],
  ShiftRight: ['boost'],
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
const SWALLOW = new Set(['PageUp', 'PageDown']);

/** Botões touch → ações (pulo/soco também confirmam nas telas de título/fim; pulo também aciona boost na Fase 7). */
const BUTTONS: ReadonlyArray<readonly [string, readonly Action[]]> = [
  ['btn-left', ['left']],
  ['btn-right', ['right']],
  ['btn-up', ['up']],
  ['btn-down', ['down']],
  ['btn-jump', ['jump', 'confirm', 'boost']],
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

  const DIR_ACTIONS: Record<string, readonly Action[]> = {
    'btn-left': ['left'],
    'btn-right': ['right'],
    'btn-up': ['up'],
    'btn-down': ['down'],
  };
  /** Direcional (◀/▶/▲/▼ ou diagonal na Fase 7) ativo por pointerId. */
  const activeDir = new Map<number, readonly Action[]>();
  const btnUpEl = document.getElementById('btn-up');
  const padLeftEl = document.querySelector<HTMLElement>('.pad-left');

  const isSpaceDpad = (): boolean => Boolean(btnUpEl && btnUpEl.getClientRects().length > 0);

  const cornerDiagonalAt = (x: number, y: number): readonly Action[] | null => {
    if (!padLeftEl || !isSpaceDpad()) return null;
    const r = padLeftEl.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    const nx = (x - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (y - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.abs(nx) <= 0.3 || Math.abs(ny) <= 0.3) return null;
    return [nx < 0 ? 'left' : 'right', ny < 0 ? 'up' : 'down'];
  };

  const resolveDirActions = (x: number, y: number): readonly Action[] | null => {
    const selector = isSpaceDpad() ? '#btn-left,#btn-right,#btn-up,#btn-down' : '#btn-left,#btn-right';
    const under = document.elementFromPoint(x, y)?.closest(selector);
    if (under && DIR_ACTIONS[under.id]) return DIR_ACTIONS[under.id];
    return cornerDiagonalAt(x, y);
  };

  const applyDirActions = (id: number, next: readonly Action[]): void => {
    const cur = activeDir.get(id);
    if (cur && cur.length === next.length && cur.every((a, i) => a === next[i])) return;
    const src = `p:${id}`;
    if (cur) {
      for (const a of cur) {
        if (!next.includes(a)) release(a, src);
      }
    }
    for (const a of next) {
      if (!cur || !cur.includes(a)) press(a, src);
    }
    activeDir.set(id, next);
  };

  const moveDirPointer = (e: PointerEvent): void => {
    if (!activeDir.has(e.pointerId)) return; // só ponteiros que estão segurando um direcional
    const next = resolveDirActions(e.clientX, e.clientY);
    if (!next) return; // fora dos botões/cantos, mantém o último (histerese)
    applyDirActions(e.pointerId, next);
  };

  for (const [id, acts] of BUTTONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const src = (e: PointerEvent): string => `p:${e.pointerId}`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'touch') markTouch();
      gesture();
      // mantém a captura do ponteiro: um deslize leve para fora do botão não o solta;
      // pointerup/pointercancel/lostpointercapture continuam soltando sempre
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já inativo: segue sem captura */
      }
      if (DIR_ACTIONS[id]) {
        applyDirActions(e.pointerId, acts);
      } else {
        for (const a of acts) press(a, src(e));
      }
    });
    // deslize contínuo no D-pad (o ponteiro fica capturado no botão inicial): troca direções
    // pelo elemento sob o dedo (e cantos diagonais na Fase 7); fora, mantém histerese
    if (DIR_ACTIONS[id]) {
      el.addEventListener('pointermove', moveDirPointer);
    }
    // solta TODAS as ações do ponteiro (inclusive a do direcional trocado)
    const up = (e: PointerEvent): void => {
      releasePointer(e.pointerId);
      activeDir.delete(e.pointerId);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Suporte a toque direto nos cantos diagonais do D-pad 3x3 na Fase 7
  if (padLeftEl) {
    padLeftEl.addEventListener('pointerdown', (e) => {
      if (e.target !== padLeftEl) return;
      const diag = cornerDiagonalAt(e.clientX, e.clientY);
      if (!diag) return;
      e.preventDefault();
      if (e.pointerType === 'touch') markTouch();
      gesture();
      try {
        padLeftEl.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já inativo: segue sem captura */
      }
      applyDirActions(e.pointerId, diag);
    });
    padLeftEl.addEventListener('pointermove', moveDirPointer);
    const padUp = (e: PointerEvent): void => {
      if (!activeDir.has(e.pointerId)) return;
      releasePointer(e.pointerId);
      activeDir.delete(e.pointerId);
    };
    padLeftEl.addEventListener('pointerup', padUp);
    padLeftEl.addEventListener('pointercancel', padUp);
    padLeftEl.addEventListener('lostpointercapture', padUp);
    padLeftEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // rede de segurança: qualquer dedo que sai da tela solta tudo que segurava
  window.addEventListener('pointerup', (e) => {
    releasePointer(e.pointerId);
    activeDir.delete(e.pointerId);
  });
  window.addEventListener('pointercancel', (e) => {
    releasePointer(e.pointerId);
    activeDir.delete(e.pointerId);
  });

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
