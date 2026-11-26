/**
 * Seleção secreta de fases (Level Select) para testes diretos em produção.
 *
 * Desbloqueio na tela de título (nenhuma tecla da sequência dispara 'confirm'):
 *  - Teclado: ↑ ↑ ↓ ↓ ← → ← → (ou W W S S A D A D)
 *  - Touch / Teclado: ← ← → → ← → ← → (botões ◀ e ▶ na tela de título)
 */

import type { Difficulty, Rect } from '../core/types';
import { PALETTE as P } from '../gfx/palette';

export type CodeDir = 'up' | 'down' | 'left' | 'right';

export interface LevelSelectEntry {
  /** número/selo curto exibido à esquerda ('01'..'07' ou 'BN') */
  readonly code: string;
  /** nome da fase exibido na lista */
  readonly label: string;
  /** cor de destaque do selo (identidade da fase) */
  readonly color: string;
  /** índice em LEVELS (0..6) ou 'bonus' para a Fase Bônus */
  readonly target: number | 'bonus';
}

export const LEVEL_SELECT_ENTRIES: readonly LevelSelectEntry[] = [
  { code: '01', label: 'TRILHA DOS MONÓLITOS', color: P.o, target: 0 },
  { code: '02', label: 'CORAÇÃO DA AMAZÔNIA', color: P.g, target: 1 },
  { code: '03', label: 'BAHIA WORLD', color: P.C, target: 2 },
  { code: '04', label: 'FAVELA DO RIO', color: P.t, target: 3 },
  { code: '05', label: 'MARGINAL DE SÃO PAULO', color: P.B, target: 4 },
  { code: '06', label: 'TRANSPORTADORA DE SP', color: P.Y, target: 5 },
  { code: '07', label: 'ESPAÇO SIDERAL', color: P.D, target: 6 },
  { code: 'BN', label: 'BÔNUS - TUBO DO BONFIM', color: P.c, target: 'bonus' },
];

// ── Layout compartilhado entre HUD (desenho) e GameWorld (hit-test de toque/clique) ──

/** Área da lista de fases dentro da tela 320×180. */
export const LS_LIST_X = 18;
export const LS_LIST_W = 284;
export const LS_LIST_Y = 29;
export const LS_ROW_H = 14;

/** Botões de dificuldade na barra inferior do Level Select. */
export const LS_DIFF_Y = 146;
export const LS_NORMAL_RECT: Rect = { x: 130, y: LS_DIFF_Y - 2, w: 58, h: 13 };
export const LS_AMARO_RECT: Rect = { x: 196, y: LS_DIFF_Y - 2, w: 54, h: 13 };

/** Botão "VOLTAR" no canto superior esquerdo da tela Level Select. */
export const LS_BACK_RECT: Rect = { x: 8, y: 7, w: 46, h: 14 };

/** Botão discreto "FASES" exibido na tela de título após desbloquear o segredo. */
export const TITLE_LS_RECT: Rect = { x: 264, y: 151, w: 46, h: 13 };

/** Botão "SELECIONAR FASE" exibido na tela de pausa após desbloquear o segredo. */
export const PAUSE_LS_RECT: Rect = { x: 84, y: 124, w: 152, h: 16 };

export type LevelSelectHit =
  | { kind: 'entry'; index: number }
  | { kind: 'difficulty'; difficulty: Difficulty }
  | { kind: 'back' }
  | null;

export function hitRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function hitTestLevelSelect(x: number, y: number): LevelSelectHit {
  if (hitRect(x, y, LS_BACK_RECT)) return { kind: 'back' };
  if (hitRect(x, y, LS_NORMAL_RECT)) return { kind: 'difficulty', difficulty: 'normal' };
  if (hitRect(x, y, LS_AMARO_RECT)) return { kind: 'difficulty', difficulty: 'amaro' };
  if (x >= LS_LIST_X && x <= LS_LIST_X + LS_LIST_W && y >= LS_LIST_Y) {
    const idx = Math.floor((y - LS_LIST_Y) / LS_ROW_H);
    if (idx >= 0 && idx < LEVEL_SELECT_ENTRIES.length) return { kind: 'entry', index: idx };
  }
  return null;
}

// ── Detector da combinação secreta ──────────────────────────────────────────

const SECRET_CODES: ReadonlyArray<readonly CodeDir[]> = [
  ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'],
  ['left', 'left', 'right', 'right', 'left', 'right', 'left', 'right'],
];
const MAX_CODE_LEN = Math.max(...SECRET_CODES.map((c) => c.length));
/** Tempo máximo (s) sem pressionar nenhuma direção antes de zerar o buffer. */
const CODE_IDLE_TIMEOUT = 4.0;

export interface SecretCodeTracker {
  /** Avança o temporizador de ociosidade. */
  tick(dt: number): void;
  /** Registra uma direção pressionada; retorna true ao completar qualquer código secreto. */
  push(dir: CodeDir): boolean;
  /** Limpa o histórico atual. */
  reset(): void;
}

export function createSecretCodeTracker(): SecretCodeTracker {
  const history: CodeDir[] = [];
  let idle = 0;

  return {
    tick(dt: number): void {
      if (history.length === 0) return;
      idle += dt;
      if (idle >= CODE_IDLE_TIMEOUT) {
        history.length = 0;
        idle = 0;
      }
    },
    push(dir: CodeDir): boolean {
      idle = 0;
      history.push(dir);
      if (history.length > MAX_CODE_LEN) history.shift();
      for (const code of SECRET_CODES) {
        if (history.length < code.length) continue;
        const offset = history.length - code.length;
        let match = true;
        for (let i = 0; i < code.length; i++) {
          if (history[offset + i] !== code[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          history.length = 0;
          return true;
        }
      }
      return false;
    },
    reset(): void {
      history.length = 0;
      idle = 0;
    },
  };
}
