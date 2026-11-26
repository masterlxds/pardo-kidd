/**
 * FASE 7 — "Espaço Sideral (Órbita de Quixadá)". Dados puros (SEM IMPORTS).
 * Autoscroller espacial 2D em gravidade zero: 780 colunas × 11 linhas (tile 16px → 12480×176 px),
 * escrito em 65 COMPASSOS de 12 colunas (2,0 s por compasso a 120 BPM / 96 px/s; 1 tempo = 3 colunas).
 * Câmera Y travada em 0 (y de mundo = y de tela). Marcadores ancorados no centro da célula (col·16+8, row·16+8).
 *
 * LEGENDA (CONTRATO — só o orquestrador altera):
 *  .  vazio (nenhum tile sólido existe nesta fase)
 *  P  spawn do Pardo Astronauta (c.1)
 *  K  boia de checkpoint orbital (ativação por coluna; 1,8 s livres após cada K)
 *  c  moeda estelar
 *  W  cápsula de água espacial (+1 gota; não fere)
 *  t  holograma de tutorial (quadro pela ordem de aparição: 0 MOVA 2D, 1 IMPULSO, 2 GRAVIDADE)
 *  A  Estação Espacial de Quixadá — EEIQ (c.65, objetivo final + Sachê de Água Espacial)
 *  Y  Planeta Yuri (gravidade letal; metadados em LEVEL7_PLANETS)
 *  U  Planeta Yumi (gravidade letal; metadados em LEVEL7_PLANETS)
 *  m  meteoro comum (1 soco)
 *  M  meteoro flamejante (1 soco; aviso 0,5 s na borda)
 *  g  cometa de gelo diagonal (1 soco; linhas 0–4 desce, 6–10 sobe; aviso 0,7 s)
 *  u  OVNI patrulheiro (1 soco; senoide + plasma_orb)
 *  a  alien de jetpack (1 soco; persegue Y, trava e avança)
 *  b  mina orbital magnética (1 soco só desarmada)
 *  s  satélite em órbita (indestrutível)
 *  S  satélite de varredura com laser (indestrutível)
 *  d  lixo espacial (indestrutível)
 *  v  rajada de vento solar (indestrutível; faixa telegrafada 1,0 s)
 *  N  Nave-Mãe alienígena (c.50; escolta 12 compassos com ondas em LEVEL7_WAVES)
 */

export const LEVEL7_LEGEND: Record<string, string> = {
  '.': 'vazio',
  'P': 'spawn do Pardo Astronauta',
  'K': 'boia de checkpoint orbital',
  'c': 'moeda estelar',
  'W': 'cápsula de água espacial',
  't': 'holograma de tutorial',
  'A': 'Estação Espacial de Quixadá (EEIQ)',
  'Y': 'Planeta Yuri',
  'U': 'Planeta Yumi',
  'm': 'meteoro comum',
  'M': 'meteoro flamejante',
  'g': 'cometa de gelo',
  'u': 'OVNI patrulheiro',
  'a': 'alien de jetpack',
  'b': 'mina orbital magnética',
  's': 'satélite em órbita',
  'S': 'satélite de varredura',
  'd': 'lixo espacial',
  'v': 'rajada de vento solar',
  'N': 'Nave-Mãe alienígena',
};

export const LEVEL7_BAR_COLS = 12;
export const LEVEL7_BAR_COUNT = 65;

export interface Level7Planet {
  col: number;
  kind: 'yuri' | 'yumi';
  y: number;
  wave?: boolean;
}

export interface Level7Wave {
  bar: number;
  beat: number;
  kind: 'ufo' | 'meteor_fire' | 'plasma_orb';
  y: number;
}

const VAZIO: string[] = Array.from({ length: 11 }, () => '.'.repeat(LEVEL7_BAR_COLS));

function bloco(linhas: Record<number, string>): string[] {
  return VAZIO.map((r, y) => linhas[y] ?? r);
}

/**
 * 65 compassos de 12 colunas × 11 linhas (stub da Etapa 1 com P no c.1 e A no c.65;
 * preenchido pelo agente LEVEL na Etapa 2).
 */
export const LEVEL7_BARS: string[][] = Array.from({ length: LEVEL7_BAR_COUNT }, (_, i) => {
  // c.1 (i=0), linha 5, col 4 → x = 4*16+8 = 72..80, y = 5*16+8 = 88
  if (i === 0) return bloco({ 5: '....P.......' });
  // c.65 (i=64), linha 5, col 6 → x = (64*12+6)*16+8 = 12392, y = 88
  if (i === LEVEL7_BAR_COUNT - 1) return bloco({ 5: '......A.....' });
  return [...VAZIO];
});

/** Mapa completo: concatenação horizontal dos 65 compassos (780 × 11). */
export const LEVEL7_ROWS: string[] = Array.from({ length: 11 }, (_, y) =>
  LEVEL7_BARS.map((b) => b[y] ?? '.'.repeat(LEVEL7_BAR_COLS)).join(''),
);

/** Trajetórias e alturas exatas dos planetas Yuri e Yumi (preenchido na Etapa 2). */
export const LEVEL7_PLANETS: Level7Planet[] = [];

/** Ondas ritmadas da Nave-Mãe no Ato 4 (preenchido na Etapa 2). */
export const LEVEL7_WAVES: Level7Wave[] = [];
