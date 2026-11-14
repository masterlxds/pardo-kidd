import type { TextOpts } from '../core/types';

/**
 * Fonte bitmap procedural 5x7 (avanço 6px, linha 8px).
 * Cada glifo = 7 linhas de 5 colunas ('#' = pixel). Acentos são sobrepostos 1px acima do topo (linha -1);
 * a cedilha desce 1px abaixo da base.
 */
const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '♥': ['.....', '.#.#.', '#####', '#####', '.###.', '..#..', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

const ACUTE = '...#.';
const GRAVE = '.#...';
const CIRC = '..#..';
const TILDE = '.#.#.';
/** char acentuado → [base, marca superior | null, cedilha] */
const ACC: Record<string, [string, string | null, boolean]> = {
  'Á': ['A', ACUTE, false], 'À': ['A', GRAVE, false], 'Â': ['A', CIRC, false], 'Ã': ['A', TILDE, false],
  'É': ['E', ACUTE, false], 'Ê': ['E', CIRC, false],
  'Í': ['I', ACUTE, false],
  'Ó': ['O', ACUTE, false], 'Ô': ['O', CIRC, false], 'Õ': ['O', TILDE, false],
  'Ú': ['U', ACUTE, false],
  'Ç': ['C', null, true],
};

const ADV = 6;
const CELL_H = 9; // linha 0 = acento, 1..7 = glifo, 8 = cedilha
const CHARS = Object.keys(G).concat(Object.keys(ACC));
const INDEX = new Map<string, number>();
CHARS.forEach((c, i) => INDEX.set(c, i));
const SPACE = INDEX.get(' ') as number;

function glyphRows(ch: string): { rows: string[]; top: string | null; cedilla: boolean } {
  const a = ACC[ch];
  if (a) return { rows: G[a[0]], top: a[1], cedilla: a[2] };
  return { rows: G[ch], top: null, cedilla: false };
}

const atlasCache = new Map<string, HTMLCanvasElement>();

function atlasFor(color: string): HTMLCanvasElement {
  let cv = atlasCache.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = CHARS.length * ADV;
  cv.height = CELL_H;
  const c = cv.getContext('2d');
  if (c) {
    c.fillStyle = color;
    CHARS.forEach((ch, i) => {
      const { rows, top, cedilla } = glyphRows(ch);
      const ox = i * ADV;
      for (let r = 0; r < 7; r++) {
        const row = rows[r];
        for (let x = 0; x < 5; x++) if (row[x] === '#') c.fillRect(ox + x, 1 + r, 1, 1);
      }
      if (top) for (let x = 0; x < 5; x++) if (top[x] === '#') c.fillRect(ox + x, 0, 1, 1);
      if (cedilla) c.fillRect(ox + 2, 8, 1, 1);
    });
  }
  atlasCache.set(color, cv);
  return cv;
}

function normalize(text: string): string {
  return text.toUpperCase();
}

export function textWidth(text: string, scale = 1): number {
  return text.length * ADV * scale;
}

function blit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, s: number): void {
  const atlas = atlasFor(color);
  for (let i = 0; i < text.length; i++) {
    const idx = INDEX.get(text[i]) ?? SPACE;
    if (idx === SPACE) continue;
    ctx.drawImage(atlas, idx * ADV, 0, ADV, CELL_H, x + i * ADV * s, y - s, ADV * s, CELL_H * s);
  }
}

/** Desenha texto com (x,y) = topo; x é esquerda/centro/direita conforme opts.align. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts?: TextOpts): void {
  const s = Math.max(1, Math.floor(opts?.scale ?? 1));
  const t = normalize(text);
  const w = textWidth(t, s);
  let px = x;
  if (opts?.align === 'center') px = x - Math.floor(w / 2);
  else if (opts?.align === 'right') px = x - w;
  px = Math.round(px);
  const py = Math.round(y);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (opts?.shadow) blit(ctx, t, px + s, py + s, opts.shadow, s);
  blit(ctx, t, px, py, opts?.color ?? '#ffffff', s);
  ctx.imageSmoothingEnabled = prev;
}
