/**
 * FASE 5 — "Marginal de São Paulo" (De Uber até o Galpão), versão 2. Dados puros (sem imports).
 * Autoscroller linear sobre o carro preto da Uber: pista única, tudo vem da direita.
 * Grade de 888 colunas x 12 linhas (tile 16px), escrita em 74 COMPASSOS de 12 colunas (1,6 s a 120 px/s,
 * 150 BPM; 1 tempo = 3 colunas). Depois de editar: `node scripts/check-level5.mjs`.
 * Design: level-5-refs/level_design_fase5.md (partitura) · gdd_fase5_marginal.md · gdd_bestiario_fase5.md.
 *
 * LINHAS: 0-1 céu/HUD · 2-4 estrutura (decoração) · 5 FAIXA ALTA · 6-7 livre (moedas) · 8 FAIXA BAIXA ·
 *         9 carro (teto em y=144) · 10 pista · 11 mureta/pilares e decoração.
 * Não existe tile sólido acima da linha 10. Todo marcador de ameaça fica na 1ª coluna do seu tempo.
 *
 * LEGENDA (CONTRATO — só o orquestrador altera)
 * Tiles:       .  vazio    =  asfalto (linha 10)    #  mureta/pilar (linha 11)    ~  Tietê (linha 11, só visual)
 * Obstáculos:  L  limitador de altura (linha 8; PULE)        F  faixa de obra, 2 colunas (linha 8; PULE)
 *              G  placa de pórtico, 3 colunas (linha 5; NÃO PULE)   i  luminária de túnel (linha 5; NÃO PULE)
 * Socáveis:    B  barreira da CET (linha 8)                  W  isopor do ambulante, +1 gota (linha 8)
 * Inimigos (a coluna é o ponto de ENCONTRO com o Pardo na posição neutra; todos morrem com 1 soco):
 *              y  motoboy (linha 8)     Y  motoboy rápido (linha 8)     p  patinete (linha 8)
 *              u  drone (linha 8: onde o rasante termina)               z  pichador de rapel (linha 5)
 *              x  caixa baixa (linha 8)   X  caixa alta (linha 5) — só enquanto o caminhão-baú está na tela
 * Estrutura:   P  spawn do Pardo + carro (linha 9)     K  checkpoint por passagem de coluna (linha 11)
 *              J  início de rampa: 12 colunas de voo (linha 10, na 1ª coluna do compasso; pista vazia no vão)
 *              T  entrada do caminhão-baú, fica 8 compassos (linha 9)     A  desembarque 5★ (linha 9)
 *              c  moeda (qualquer linha de 5 a 8)
 *              1 2 3 4  placas de tutorial PULE / SOQUE / NÃO PULE / PULE+SOQUE (linha 11)
 * Decoração (linha 11; base na base da célula): s placa da Marginal · r radar · l poste · n cone
 */
export const LEVEL5_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'asfalto', '#': 'mureta/pilar', '~': 'água do Tietê (visual)',
  'L': 'limitador de altura', 'F': 'faixa de obra', 'G': 'placa de pórtico', 'i': 'luminária de túnel',
  'B': 'barreira da CET', 'W': 'isopor do ambulante',
  'y': 'motoboy', 'Y': 'motoboy rápido', 'p': 'patinete', 'u': 'drone', 'z': 'pichador de rapel',
  'x': 'caixa baixa', 'X': 'caixa alta',
  'P': 'spawn + carro', 'K': 'checkpoint', 'J': 'rampa', 'T': 'caminhão-baú', 'A': 'desembarque 5★', 'c': 'moeda',
  '1': 'tutorial PULE', '2': 'tutorial SOQUE', '3': 'tutorial NÃO PULE', '4': 'tutorial PULE+SOQUE',
  's': 'placa da Marginal', 'r': 'radar', 'l': 'poste', 'n': 'cone',
};

export const LEVEL5_BAR_COLS = 12;
export const LEVEL5_BAR_COUNT = 74;

/** Compasso vazio com pista (STUB — o dono do mapa substitui pelos 74 compassos da partitura). */
const VAZIO: string[] = [
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '============',
  '############',
];

function comMarcador(base: string[], row: number, col: number, ch: string): string[] {
  return base.map((r, y) => (y === row ? r.slice(0, col) + ch + r.slice(col + 1) : r));
}

/** 74 compassos de 12 colunas x 12 linhas, na ordem. */
export const LEVEL5_BARS: string[][] = Array.from({ length: LEVEL5_BAR_COUNT }, (_, i) => {
  if (i === 0) return comMarcador(VAZIO, 9, 4, 'P');
  if (i === LEVEL5_BAR_COUNT - 1) return comMarcador(VAZIO, 9, 6, 'A');
  return VAZIO;
});

/** Mapa completo: concatenação horizontal dos compassos (888 x 12). */
export const LEVEL5_ROWS: string[] = Array.from({ length: 12 }, (_, y) => LEVEL5_BARS.map((b) => b[y]).join(''));

/** Colunas dos marcadores de rampa `J` (ordem crescente). */
export const LEVEL5_RAMP_COLS: number[] = (() => {
  const out: number[] = [];
  for (const row of LEVEL5_ROWS) for (let x = 0; x < row.length; x++) if (row[x] === 'J') out.push(x);
  return out.sort((a, b) => a - b);
})();
