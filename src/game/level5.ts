/**
 * FASE 5 — "Marginal de São Paulo" (De Uber até o Galpão), versão 2. Dados puros (sem imports).
 * Autoscroller linear sobre o carro preto da Uber: pista única, tudo vem da direita. O carro fica fixo na
 * tela (centro do Pardo em x de tela = UBER.screenNeutral) e o Pardo só tem PULO e SOCO: não há direcional.
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
 * Socáveis:    B  saco de entulho pendurado num guincho de obra (linha 8)   W  isopor do ambulante, +1 gota (linha 8)
 * Inimigos (a coluna é o ponto de ENCONTRO com o Pardo; todos morrem com 1 soco):
 *              y  motoboy     Y  motoboy rápido     p  patinete — rodam NO ASFALTO e SALTAM ao chegar perto;
 *                 o marcador fica na linha 8 porque o ápice do salto (o encontro) é na faixa baixa
 *              u  drone (linha 8: onde o rasante termina)               z  pichador de rapel (linha 5)
 *              x  caixa baixa (linha 8)   X  caixa alta (linha 5) — só enquanto o caminhão-baú está na tela
 * Estrutura:   P  spawn do Pardo + carro (linha 9)     K  checkpoint por passagem de coluna (linha 11)
 *              J  início de rampa: 12 colunas de voo (linha 10, na 1ª coluna do compasso; pista vazia no vão)
 *              T  entrada do caminhão-baú, fica 8 compassos (linha 9)
 *              A  desembarque 5★: totem com a garrafa d'água; o carro chega até ele sozinho, em cutscene (linha 9)
 *              c  moeda (qualquer linha de 5 a 8)
 *              1 2 3 4  placas de tutorial PULE / SOQUE / NÃO PULE / PULE+SOQUE (linha 11)
 * Decoração (linha 11; base na base da célula): s placa da Marginal · r radar · l poste · n cone
 */
export const LEVEL5_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'asfalto', '#': 'mureta/pilar', '~': 'água do Tietê (visual)',
  'L': 'limitador de altura', 'F': 'faixa de obra', 'G': 'placa de pórtico', 'i': 'luminária de túnel',
  'B': 'saco de entulho', 'W': 'isopor do ambulante',
  'y': 'motoboy', 'Y': 'motoboy rápido', 'p': 'patinete', 'u': 'drone', 'z': 'pichador de rapel',
  'x': 'caixa baixa', 'X': 'caixa alta',
  'P': 'spawn + carro', 'K': 'checkpoint', 'J': 'rampa', 'T': 'caminhão-baú', 'A': 'desembarque 5★', 'c': 'moeda',
  '1': 'tutorial PULE', '2': 'tutorial SOQUE', '3': 'tutorial NÃO PULE', '4': 'tutorial PULE+SOQUE',
  's': 'placa da Marginal', 'r': 'radar', 'l': 'poste', 'n': 'cone',
};

export const LEVEL5_BAR_COLS = 12;
export const LEVEL5_BAR_COUNT = 74;

/** Compasso vazio com pista: 10 linhas livres, asfalto na linha 10, mureta na linha 11. */
const PISTA: string[] = [
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

/** Compasso de rampa: `J` na 1ª coluna da linha 10, pista vazia no vão e o Tietê na linha 11. */
const VAO: string[] = [
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
  'J...........',
  '~~~~~~~~~~~~',
];

/** Compasso = `base` com as linhas indicadas trocadas (índice da linha → 12 caracteres). */
function bloco(linhas: Record<number, string>, base: string[] = PISTA): string[] {
  return base.map((r, y) => linhas[y] ?? r);
}

/**
 * Arco de moedas de um pulo cheio a 120 px/s (5 colunas, ápice ~50 px), decolando na coluna 3:
 * linha 7 na decolagem e no pouso, linha 6 na subida e na descida, linha 5 no ápice.
 */
const ARCO: string[] = bloco({ 5: '.....c......', 6: '....c.c.....', 7: '...c...c....' });

/** Rampa com 8 moedas acompanhando o arco do carro (sobe ~40 px no meio): o Pardo pega todas em pé. */
const RAMPA8: string[] = bloco({ 5: '...c.cc.c...', 6: '.c........c.', 7: 'c..........c' }, VAO);

/** Rampa final com 12 moedas, uma por coluna, no mesmo arco. */
const RAMPA12: string[] = bloco({ 5: '...cccccc...', 6: '.cc......cc.', 7: 'c..........c' }, VAO);

/**
 * 74 compassos de 12 colunas x 12 linhas, na ordem da partitura (level_design_fase5.md §6).
 * Tempos nas colunas 0, 3, 6 e 9; linha 5 = faixa alta, linha 8 = faixa baixa.
 * Desvios da partitura (todos para o validador passar, dentro da margem do §7):
 *  - c.15 e c.17 trocados: `L · · y` tem 2 decisões e só cabe nos 4 últimos compassos do Ato 1 (R9);
 *    o primeiro drone continua sozinho no seu compasso e as estreias seguem na mesma ordem.
 */
export const LEVEL5_BARS: string[][] = [
  // c.01 — Embarque: Pardo já no teto; o carro arranca
  bloco({ 9: '....P.......', 11: '########s###' }),
  // c.02 — (linha) sentir a velocidade: as moedas vêm sozinhas
  bloco({ 8: 'c..c..c..c..' }),
  // c.03 — placa PULE e o primeiro limitador (tempo 3)
  bloco({ 8: '......L.....', 11: '1###########' }),
  // c.04 — (arco) desenha o pulo ideal
  ARCO,
  // c.05 — Ato 1 · limitador no tempo 3
  bloco({ 8: '......L.....' }),
  // c.06 — mesmo verbo, tempo diferente (tempo 4)
  bloco({ 8: '.........L..', 11: '##l#########' }),
  // c.07 — placa SOQUE e o primeiro saco de entulho
  bloco({ 8: '......B.....', 11: '2###########' }),
  // c.08 — respiro (linha)
  bloco({ 8: 'cccc........' }),
  // c.09 — primeiro motoboy
  bloco({ 8: '......y.....', 11: '#r##########' }),
  // c.10 — limitador no tempo 2
  bloco({ 8: '...L........' }),
  // c.11 — motoboy no tempo 3
  bloco({ 8: '......y.....' }),
  // c.12 — respiro (arco)
  ARCO,
  // c.13 — placa NÃO PULE; primeira placa de pórtico com linha de moedas embaixo
  bloco({ 5: '......G.....', 8: '......ccc...', 11: '3###########' }),
  // c.14 — PONTO ALTO: primeiro soco obrigatório (G+B)
  bloco({ 5: '......G.....', 8: '......B.....' }),
  // c.15 — primeiro drone, sozinho (trocado com o c.17 por causa da R9)
  bloco({ 8: '......u.....' }),
  // c.16 — respiro + isopor
  bloco({ 8: '...W........', 11: '#########l##' }),
  // c.17 — pulo, depois soco (L · · y; veio do c.15)
  bloco({ 8: 'L........y..' }),
  // c.18 — pulo, depois saco de entulho
  bloco({ 8: 'L........B..' }),
  // c.19 — motoboy, depois placa
  bloco({ 5: '.........G..', 8: '...y........' }),
  // c.20 — fecho do ato: motoboy e limitador
  bloco({ 8: 'y.....L.....' }),
  // c.21 — CHECKPOINT 1 + linha de moedas
  bloco({ 8: '......cccc..', 11: 'K###########' }),
  // c.22 — RAMPA 1: salto para o Minhocão
  RAMPA8,
  // c.23 — Ato 2 · primeira fila de patinetes: soco, soco
  bloco({ 8: '...p..p.....' }),
  // c.24 — limitador, depois motoboy
  bloco({ 8: '...L.....y..', 11: '#####l######' }),
  // c.25 — fila de 3 patinetes
  bloco({ 8: 'p..p..p.....' }),
  // c.26 — respiro (arco)
  ARCO,
  // c.27 — placa PULE+SOQUE; primeiro pichador
  bloco({ 5: '......z.....', 11: '4###########' }),
  // c.28 — limitador, depois saco de entulho
  bloco({ 8: '...L.....B..' }),
  // c.29 — soco no ar, pouso, soco no chão
  bloco({ 5: 'z...........', 8: '.........y..' }),
  // c.30 — respiro + isopor
  bloco({ 8: '...W........', 11: '########l###' }),
  // c.31 — soco obrigatório (G+y), depois pulo
  bloco({ 5: 'G...........', 8: 'y.....L.....' }),
  // c.32 — rasante e fila
  bloco({ 8: 'u.....p..p..' }),
  // c.33 — pulo, depois pulo com soco
  bloco({ 5: '.........z..', 8: 'L...........' }),
  // c.34 — respiro (linha)
  bloco({ 8: '....cccc....', 11: '######s#####' }),
  // c.35 — dois motoboys a 2 tempos
  bloco({ 8: 'y.....y.....' }),
  // c.36 — soco obrigatório (G+B), depois rasante
  bloco({ 5: 'G...........', 8: 'B.....u.....' }),
  // c.37 — primeira faixa de obra: decolar mais cedo; depois motoboy
  bloco({ 8: 'F........y..', 11: '###n########' }),
  // c.38 — fecho do ato: pichador e limitador
  bloco({ 5: 'z...........', 8: '.........L..' }),
  // c.39 — CHECKPOINT 2 + linha de moedas
  bloco({ 8: '......cccc..', 11: 'K###########' }),
  // c.40 — RAMPA 2: do fim do elevado para a boca do túnel
  RAMPA8,
  // c.41 — Ato 3 · só luminárias, com linha de moedas: ficar no chão
  bloco({ 5: 'i.....i.....', 8: 'c.c.c.c.c.c.' }),
  // c.42 — luminárias e motoboy
  bloco({ 5: 'i.....i.....', 8: '...y........' }),
  // c.43 — luminárias, saco de entulho e motoboy
  bloco({ 5: 'i.....i.....', 8: '...B.....y..' }),
  // c.44 — respiro: trecho sem luminária (arco)
  ARCO,
  // c.45 — primeiro motoboy rápido, isolado
  bloco({ 8: '......Y.....' }),
  // c.46 — fila sob as luzes
  bloco({ 5: 'i........i..', 8: '...p..p.....' }),
  // c.47 — motoboy rápido, depois soco obrigatório (i+B)
  bloco({ 5: '......i.....', 8: 'Y.....B.....' }),
  // c.48 — respiro + isopor
  bloco({ 8: '...W........' }),
  // c.49 — obra no túnel: pulo duplo ritmado
  bloco({ 8: 'L.....L.....', 11: '###n########' }),
  // c.50 — motoboy, depois limitador
  bloco({ 8: '...y.....L..' }),
  // c.51 — rasante por baixo das luzes
  bloco({ 5: '...i........', 8: '......u.....' }),
  // c.52 — respiro (linha)
  bloco({ 8: 'cccc........' }),
  // c.53 — PONTO ALTO: rajada, três socos no tempo (i+y ×3)
  bloco({ 5: 'i..i..i.....', 8: 'y..y..y.....' }),
  // c.54 — limitador, depois motoboy rápido
  bloco({ 8: '...L.....Y..' }),
  // c.55 — fila de 4 patinetes
  bloco({ 8: 'p..p..p..p..' }),
  // c.56 — fecho do ato: soco obrigatório (i+B), depois faixa de obra
  bloco({ 5: 'i...........', 8: 'B.....F.....', 11: '#########n##' }),
  // c.57 — CHECKPOINT 3 + linha de moedas; amanhece
  bloco({ 8: '......cccc..', 11: 'K###########' }),
  // c.58 — isopor; o caminhão-baú entra buzinando
  bloco({ 8: '...W........', 9: '.........T..' }),
  // c.59 — Ato 4 · COMBOIO: primeira caixa baixa
  bloco({ 8: '......x.....' }),
  // c.60 — comboio: baixa, depois alta
  bloco({ 5: '......X.....', 8: 'x...........' }),
  // c.61 — comboio: duas baixas, depois limitador
  bloco({ 8: 'x..x.....L..' }),
  // c.62 — respiro (arco)
  ARCO,
  // c.63 — comboio: alta, baixa, motoboy
  bloco({ 5: 'X...........', 8: '......x..y..' }),
  // c.64 — comboio: limitador, duas baixas
  bloco({ 8: 'L.....x..x..' }),
  // c.65 — comboio: pichador pendurado num estai, depois caixa
  bloco({ 5: 'z...........', 8: '......x.....' }),
  // c.66 — respiro (arco); o caminhão pega a saída TRANSPORTADORA
  bloco({ 11: '#####s######' }, ARCO),
  // c.67 — motoboy rápido, depois limitador
  bloco({ 8: 'Y.....L.....' }),
  // c.68 — fila de 2 e rasante
  bloco({ 8: 'p..p.....u..' }),
  // c.69 — soco obrigatório (G+y), depois faixa de obra
  bloco({ 5: 'G...........', 8: 'y.....F.....', 11: '#########n##' }),
  // c.70 — última ameaça: motoboy e pichador
  bloco({ 5: '......z.....', 8: 'y...........' }),
  // c.71 — RAMPA 3: salto final sobre a obra da ponte; o maior arco de moedas
  RAMPA12,
  // c.72 — pouso do salto final (linha)
  bloco({ 8: '...cccc.....' }),
  // c.73 — a rolagem freia e para na portaria da Transportadora (linha)
  bloco({ 8: 'c..c..c..c..', 11: '##l#########' }),
  // c.74 — totem UBER 5★ com a garrafa d'água: o carro chega sozinho (cutscene)
  bloco({ 9: '......A.....' }),
];

/** Mapa completo: concatenação horizontal dos compassos (888 x 12). */
export const LEVEL5_ROWS: string[] = Array.from({ length: 12 }, (_, y) => LEVEL5_BARS.map((b) => b[y]).join(''));

/** Colunas dos marcadores de rampa `J` (ordem crescente). */
export const LEVEL5_RAMP_COLS: number[] = (() => {
  const out: number[] = [];
  for (const row of LEVEL5_ROWS) for (let x = 0; x < row.length; x++) if (row[x] === 'J') out.push(x);
  return out.sort((a, b) => a - b);
})();
