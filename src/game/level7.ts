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
 * 65 compassos de 12 colunas × 11 linhas:
 *  - Embarque: c.1–4   (cols 0–47)
 *  - Ato 1:    c.5–17  (cols 48–203)
 *  - CP1:      c.18    (cols 204–215)
 *  - Ato 2:    c.19–32 (cols 216–383)
 *  - CP2:      c.33    (cols 384–395)
 *  - Ato 3:    c.34–48 (cols 396–575)
 *  - CP3:      c.49    (cols 576–587)
 *  - Ato 4:    c.50–61 (cols 588–731)
 *  - Final:    c.62–65 (cols 732–779)
 */
export const LEVEL7_BARS: string[][] = [
  // ── EMBARQUE (c.1–4) ────────────────────────────────────────────────────────
  // c.1 (cols 0–11): spawn P (col 4, l.5), holograma MOVA 2D (col 9, l.2), moedas
  bloco({
    2: '.........t..',
    5: '....P.ccccc.',
  }),
  // c.2 (cols 12–23): holograma IMPULSO (col 14, l.2), linha de moedas (1,8 s livres)
  bloco({
    2: '..t.........',
    4: '.....ccccc..',
  }),
  // c.3 (cols 24–35): estreia isolada do meteoro comum m (col 31, l.5)
  bloco({
    5: '.......m....',
    7: '..cccc......',
  }),
  // c.4 (cols 36–47): moedas baixas após o 1º meteoro m (isolamento R2)
  bloco({
    8: '..ccccc.....',
  }),

  // ── ATO 1 — CINTURÃO DE SUCATA (c.5–17) ─────────────────────────────────────
  // c.5 (cols 48–59): 2º meteoro comum m isolado (col 48, l.3) + moedas
  bloco({
    3: 'm...........',
    6: '..cccc......',
  }),
  // c.6 (cols 60–71): estreia isolada do meteoro flamejante M (col 69, l.5)
  bloco({
    3: '..cccc......',
    5: '.........M..',
  }),
  // c.7 (cols 72–83): estreia isolada do satélite em órbita s (col 81, l.5)
  bloco({
    5: '.........s..',
    8: '..cccc......',
  }),
  // c.8 (cols 84–95): respiro com moedas altas
  bloco({
    3: '..cccc......',
  }),
  // c.9 (cols 96–107): estreia isolada do lixo espacial d (col 100, l.5)
  bloco({
    2: '.....ccccc..',
    5: '....d.......',
  }),
  // c.10 (cols 108–119): combo leve m (col 118, l.7) após saída de d #1
  bloco({
    4: '..cccc......',
    7: '..........m.',
  }),
  // c.11 (cols 120–131): holograma GRAVIDADE (col 126, l.2) antes do 1º Yuri
  bloco({
    2: '......t.....',
    5: '..cccc......',
  }),
  // c.12 (cols 132–143): corredor limpo de aproximação do 1º Yuri
  bloco({
    8: '..cccccc....',
  }),
  // c.13 (cols 144–155): estreia SOLO do Planeta Yuri #1 (col 146, y=52)
  bloco({
    3: '..Y.........',
    8: '....cccccc..',
  }),
  // c.14 (cols 156–167): passagem limpa sob Yuri #1
  bloco({
    8: '..cccccc....',
  }),
  // c.15 (cols 168–179): respiro entre planetas
  bloco({
    5: '..cccc......',
  }),
  // c.16 (cols 180–191): Planeta Yuri #2 (col 186, y=132) + início do estilingue
  bloco({
    3: '...........c',
    4: '..........c.',
    8: '......Y.....',
  }),
  // c.17 (cols 192–203): arco de estilingue gravitacional (d ≈ 60–76 px acima de Y #2)
  bloco({
    3: 'cccc........',
    4: '....c.......',
  }),

  // ── CHECKPOINT 1 (c.18) ─────────────────────────────────────────────────────
  // c.18 (cols 204–215): K #1 (col 204), W #1 (col 210), 1,8 s livres após K
  bloco({
    5: 'K..c..W..c..',
  }),

  // ── ATO 2 — FRONTEIRA DOS ALIENS (c.19–32) ──────────────────────────────────
  // c.19 (cols 216–227): respiro pós-CP1 (sem ameaças no grace)
  bloco({
    5: '..cccccc....',
  }),
  // c.20 (cols 228–239): estreia isolada do OVNI patrulheiro u (col 233, l.5)
  bloco({
    5: '.....u......',
    8: '.......cccc.',
  }),
  // c.21 (cols 240–251): estreia isolada do alien de jetpack a (col 251, l.4)
  bloco({
    4: '...........a',
    7: '..cccc......',
  }),
  // c.22 (cols 252–263): respiro acompanhando a esquiva do alien
  bloco({
    5: '....cccc....',
  }),
  // c.23 (cols 264–275): corredor livre para telegraph do cometa de gelo
  bloco({
    6: '..cccc......',
  }),
  // c.24 (cols 276–287): estreia isolada do cometa de gelo g (col 286, l.1 → desce)
  bloco({
    1: '..........g.',
    8: '..cccc......',
  }),
  // c.25 (cols 288–299): aproximação limpa da estreia de Yumi
  bloco({
    4: '....cccc....',
  }),
  // c.26 (cols 300–311): estreia LIMPA do Planeta Yumi #1 (col 308, y=130)
  bloco({
    3: '........cccc',
    8: '........U...',
  }),
  // c.27 (cols 312–323): arco de estilingue acima de Yumi #1
  bloco({
    3: 'cccc........',
  }),
  // c.28 (cols 324–335): cápsula W #2 (col 328) + saída limpa de Yumi #1
  bloco({
    5: '....W..ccc..',
  }),
  // c.29 (cols 336–347): combo leve u (col 339, l.7) + m (col 342, l.2) após Yumi #1
  bloco({
    2: '......m.....',
    7: '...u........',
    9: '........ccc.',
  }),
  // c.30 (cols 348–359): preparação limpa para Yuri #3
  bloco({
    8: '..cccccc....',
  }),
  // c.31 (cols 360–371): Planeta Yuri #3 (col 364, y=50) + m leve fora do crítico (col 371, l.9)
  bloco({
    3: '....Y.......',
    8: '....ccccc...',
    9: '...........m',
  }),
  // c.32 (cols 372–383): saída limpa antes do CP2
  bloco({
    5: '....cccc....',
  }),

  // ── CHECKPOINT 2 (c.33) ─────────────────────────────────────────────────────
  // c.33 (cols 384–395): K #2 (col 384), W #3 (col 390), 1,8 s livres após K
  bloco({
    5: 'K..c..W..c..',
  }),

  // ── ATO 3 — CORREDOR GRAVITACIONAL (c.34–48) ────────────────────────────────
  // c.34 (cols 396–407): respiro pós-CP2 (sem ameaças no grace)
  bloco({
    5: '..cccccc....',
  }),
  // c.35 (cols 408–419): estreia isolada da mina orbital b (col 412, l.5)
  bloco({
    2: '......cccc..',
    5: '....b.......',
  }),
  // c.36 (cols 420–431): respiro após mina
  bloco({
    7: '..cccc......',
  }),
  // c.37 (cols 432–443): estreia isolada do satélite de varredura S (col 433, l.1 topo)
  bloco({
    1: '.S..........',
    5: '.....cccc...',
  }),
  // c.38 (cols 444–455): estreia isolada da rajada de vento solar v (col 455, l.5)
  bloco({
    2: '..cccc......',
    5: '...........v',
  }),
  // c.39 (cols 456–467): preparação para U #2 + cápsula W #4 (col 464, l.3)
  bloco({
    3: '........W...',
  }),
  // c.40 (cols 468–479): Planeta Yumi #2 (col 478, y=136)
  bloco({
    3: '.......ccccc',
    8: '..........U.',
  }),
  // c.41 (cols 480–491): corredor seguro superior sob/sobre Yumi #2
  bloco({
    3: 'ccccc.......',
  }),
  // c.42 (cols 492–503): respiro antes do planeta em onda
  bloco({
    7: '....cccc....',
  }),
  // c.43 (cols 504–515): Planeta Yuri #4 (wave: true, col 516 no c.44) — preparação
  bloco({
    8: '.....ccccc..',
  }),
  // c.44 (cols 516–527): Planeta Yuri #4 (wave: true, col 516, y=46) + corredor inferior
  bloco({
    2: 'Y...........',
    8: 'cccccc......',
  }),
  // c.45 (cols 528–539): transição antes do par escalonado em "S"
  bloco({
    8: '..cccc......',
  }),
  // c.46 (cols 540–551): par escalonado em "S" — parte 1: Planeta Yumi #3 (col 548, y=46)
  bloco({
    2: '........U...',
    8: '......ccccc.',
  }),
  // c.47 (cols 552–563): par escalonado em "S" — parte 2: Planeta Yuri #5 (col 561, y=136)
  bloco({
    3: '....cccccccc',
    8: '.........Y..',
  }),
  // c.48 (cols 564–575): saída limpa antes do CP3
  bloco({
    5: '..cccc......',
  }),

  // ── CHECKPOINT 3 (c.49) ─────────────────────────────────────────────────────
  // c.49 (cols 576–587): K #3 (col 576), W #5 (col 582), 1,8 s livres após K
  bloco({
    5: 'K..c..W..c..',
  }),

  // ── ATO 4 — ESCOLTA DA NAVE-MÃE (c.50–61) ───────────────────────────────────
  // c.50 (cols 588–599): respiro pós-CP3 + chegada da Nave-Mãe N (col 599, fim do c.50)
  bloco({
    5: '..cccccc...N',
  }),
  // c.51 (cols 600–611): início da escolta (ondas disparam a partir de c.52)
  bloco({
    4: '..cccc......',
  }),
  // c.52 (cols 612–623): Onda 1 (ufo) + mina b (col 616, l.5)
  bloco({
    5: '....b.......',
    8: '.......cccc.',
  }),
  // c.53 (cols 624–635): Onda 2 (plasma_orb) + alien a (col 626, l.4)
  bloco({
    4: '..a.........',
    7: '.....cccc...',
  }),
  // c.54 (cols 636–647): corredor de transição para Yuri final
  bloco({
    8: '..cccccc....',
  }),
  // c.55 (cols 648–659): Planeta Yuri #6 (col 650, y=48), corredor inferior limpo
  bloco({
    3: '..Y.........',
    8: '....cccccc..',
  }),
  // c.56 (cols 660–671): Onda 3 (meteor_fire alto) após passagem de Yuri #6
  bloco({
    8: '..cccccc....',
  }),
  // c.57 (cols 672–683): corredor entre os dois planetas finais
  bloco({
    5: '..cccc......',
  }),
  // c.58 (cols 684–695): Onda 4 (ufo baixo) + Onda 5 (plasma_orb baixo) + cometa g ascendente (col 688, l.9)
  bloco({
    3: '..cccccc....',
    9: '....g.......',
  }),
  // c.59 (cols 696–707): Planeta Yumi #4 final (wave: true, col 706, y=132)
  bloco({
    3: '........cccc',
    8: '..........U.',
  }),
  // c.60 (cols 708–719): arco alto acima de Yumi #4
  bloco({
    3: 'cccccc......',
  }),
  // c.61 (cols 720–731): cápsula W #6 (col 726, l.5) e fim da escolta
  bloco({
    5: '..c...W..c..',
  }),

  // ── FINAL — ACOPLAGEM EEIQ (c.62–65) ────────────────────────────────────────
  // c.62 (cols 732–743): Nave-Mãe recua; início da desaceleração; zero ameaças
  bloco({
    5: '.cccc.cccc..',
  }),
  // c.63 (cols 744–755): desaceleração suave até a EEIQ
  bloco({
    5: '.cccc.cccc..',
  }),
  // c.64 (cols 756–767): parada em SPACE_STOP_CAM_X (EEIQ à vista)
  bloco({
    5: '....cccc....',
  }),
  // c.65 (cols 768–779): doca da Estação Espacial de Quixadá A (col 774, l.5)
  bloco({
    5: '......A.....',
  }),
];

/** Mapa completo: concatenação horizontal dos 65 compassos (780 × 11). */
export const LEVEL7_ROWS: string[] = Array.from({ length: 11 }, (_, y) =>
  LEVEL7_BARS.map((b) => b[y] ?? '.'.repeat(LEVEL7_BAR_COLS)).join(''),
);

/** Trajetórias e alturas exatas dos planetas Yuri e Yumi (coincidem 1:1 com Y/U). */
export const LEVEL7_PLANETS: Level7Planet[] = [
  { col: 146, kind: 'yuri', y: 52 },
  { col: 186, kind: 'yuri', y: 132 },
  { col: 308, kind: 'yumi', y: 130 },
  { col: 364, kind: 'yuri', y: 50 },
  { col: 478, kind: 'yumi', y: 136 },
  { col: 516, kind: 'yuri', y: 46, wave: true },
  { col: 548, kind: 'yumi', y: 46 },
  { col: 561, kind: 'yuri', y: 136 },
  { col: 650, kind: 'yuri', y: 48 },
  { col: 706, kind: 'yumi', y: 132, wave: true },
];

/** Ondas ritmadas e determinísticas da Nave-Mãe no Ato 4 (D16). */
export const LEVEL7_WAVES: Level7Wave[] = [
  { bar: 52, beat: 1, kind: 'ufo', y: 58 },
  { bar: 52, beat: 3, kind: 'meteor_fire', y: 120 },
  { bar: 53, beat: 1, kind: 'plasma_orb', y: 54 },
  { bar: 56, beat: 2, kind: 'meteor_fire', y: 54 },
  { bar: 58, beat: 1, kind: 'ufo', y: 130 },
  { bar: 58, beat: 3, kind: 'plasma_orb', y: 130 },
];
