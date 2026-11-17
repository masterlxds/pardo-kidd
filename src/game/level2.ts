/**
 * FASE 2 — "Coração da Amazônia". Dados puros (sem imports).
 * Grade de 254 colunas x 14 linhas; tile = 16px; chão-base na linha 11 (topo y=176).
 * Envelope de pulo (o mesmo da Fase 1): degraus obrigatórios ≤2 tiles, vãos obrigatórios ≤3 tiles.
 * Depois de editar: `node scripts/check-level2.mjs` (simula o Pardo e prova que a fase fecha).
 *
 * LEGENDA — células com TILE (sólidos/perigos):
 *   .  vazio              =  grama sobre terra vermelha (GroundTop)     #  terra vermelha (Ground)
 *   R  pedra com musgo (Rock)   ^  espinheiro (Spike, mata)   B  bloco rachado (soco)
 *   ?  bloco-estrela com moeda  W  bloco-estrela com gota     -  galho (one-way)
 *   ~  água do rio (Water: mata ao tocar; o desenho escolhe superfície/funda sozinho)
 *   ('=' só onde a terra fica exposta; terra coberta por terra é '#'. Blocos só quebram com soco
 *    PELO LADO: bloco para socar em pé fica na linha logo acima do piso onde o Pardo está.)
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula)
 *   c  moeda (centrada na célula)
 *   o  onça  j  jacaré  n  cobra   (base na base da célula, centro horizontal da célula)
 *   u  tucano territorial: a célula é a "casa" (paira na metade de baixo da célula, logo abaixo do HUD). Acorda a ~7 tiles
 *      em x, nunca passa de ~10 tiles do marcador → cada `u` é um encontro local de ~20 tiles.
 *      Regras de posicionamento: linhas 3..6, ≥20 tiles entre tucanos, >7 tiles de P/K, e nenhum
 *      piso do território acima da linha 6 (a casa fica sempre sobre a cabeça do Pardo).
 *   V  cipó-d'água 16x32 (base na base da célula, alinhado à esquerda)
 *   m  tronco flutuante horizontal  M  tronco/plataforma vertical
 *      (canto sup. esq. da célula = posição inicial/extremo; parâmetros em LEVEL2_MOVERS)
 *   d  vitória-régia que afunda 32x10 (canto sup. esq. na célula)
 *   A  alien com a mamadeira (objetivo; base na base da célula, centro horizontal da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   s  placa   O  oca (5 tiles)   h  helicônia   f  samambaia   F  cerca de taquara (2 tiles)
 *   q  canoa (2.5 tiles, sobre água) — NÃO usada: sobre água letal ela parece plataforma   t  totem
 *
 * ROTEIRO (colunas) — cada mecânica aparece sozinha antes de ser combinada:
 *  ATO 1 · MARGEM DO IGARAPÉ
 *    0-18   Chegada: mureta B?B no chão (soco), 1ª cobra a céu aberto com um galho por cima.
 *   19-38   Terraço → fileira suspensa B?BWB (abrigo contra fruto) → galho; 1º tucano, sozinho.
 *   35-44   Platô; SEGREDO: galho alto (37-40) com ?W, via blocos → galho → galho.
 *   45-58   Poça com a 1ª vitória-régia (4 tiles, sem pressa), 1º jacaré com moedas por cima, cipó.
 *   59-79   K1 (60) · balcão seguro de onde se vê a 1ª onça; arena fechada, galho como rota alta.
 *   80-105  "Cartão-postal" da arte de conceito: platô, jacaré, pedra, fileira BWB?B com cobra
 *           embaixo e o tucano no galho; depois o outeiro da margem com cipó e K2 (104).
 *  ATO 2 · RIO DAS CACHOEIRAS
 *  106-125  1º tronco (lento) → ilhota com cobra de sentinela: por baixo 2 vitórias-régias com
 *           moedas, por cima galhos (rota segura, menos moedas).
 *  126-145  Ilha grande: K3 (127), cipó, escadaria de pedra com ?W no cume, tucano e jacaré na saída.
 *  146-167  Trecho duro: tronco rápido, "árvore de moedas" (galhos 149-154) levando ao SEGREDO ?W
 *           (155-158), 2 vitórias-régias, pedra de espera e o elevador de tronco até o penhasco.
 *  ATO 3 · COPA DAS ÁRVORES
 *  168-191  K4 (169) no penhasco. Rota alta: galhos com cobra no galho e tucano; rota baixa: onça
 *           sob as árvores. As duas se encontram no elevador sobre o fosso de espinhos (188-191).
 *  192-205  Rota baixa: parede de blocos (196-197) → toca de teto baixo com jacaré (só soco no
 *           tempo certo) → porta W → cipó. Rota alta: galho → topo da parede → teto da toca.
 *  206-223  Árvore-escada até o mirante (K5 em 215); SEGREDO: salto de 4 tiles do mirante para o
 *           galho 224-227 com ?W (errar só derruba na aldeia).
 *  ATO 4 · ALDEIA
 *  224-253  Cascata de moedas na descida, última onça de guarda, portão ?W? (eco da mureta do
 *           início), totem, arco de moedas, oca e o alien — sem inimigos da oca em diante.
 */
export const LEVEL2_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'grama', '#': 'terra', 'R': 'pedra', '^': 'espinheiro',
  'B': 'bloco rachado', '?': 'bloco com moeda', 'W': 'bloco com gota', '-': 'galho one-way', '~': 'água',
  'P': 'spawn', 'K': 'checkpoint', 'c': 'moeda',
  'o': 'onça', 'j': 'jacaré', 'n': 'cobra', 'u': 'tucano',
  'V': 'cipó-d\'água', 'm': 'tronco móvel H', 'M': 'plataforma móvel V',
  'd': 'vitória-régia', 'A': 'alien com a mamadeira',
  's': 'placa', 'O': 'oca', 'h': 'helicônia', 'f': 'samambaia', 'F': 'cerca de taquara',
  'q': 'canoa', 't': 'totem',
};

/** Parâmetros das plataformas móveis, chave "col,linha": range em tiles e velocidade média px/s. */
export const LEVEL2_MOVERS: Record<string, { range: number; speed: number }> = {
  '106,10': { range: 6, speed: 40 },
  '146,10': { range: 5, speed: 50 },
  '163,7': { range: 3, speed: 30 },
  '189,7': { range: 3, speed: 30 },
};

export const LEVEL2_ROWS: string[] = [
  '..............................................................................................................................................................................................................................................................',
  '..............................................................................................................................................................................................................................................................',
  '.............................................................................................................................................................................................................................ccc..............................',
  '..........................u............?W..................................................u..............................................u..................?W....................u.....................u..................c.................................',
  '.....................................----.................................................----.............................................................----......................................................h.K.cc.......?W..........................',
  '.................................cc....................................................................................cc...............................ccc.......................ccc.n...........cc................========....----..........................',
  '.................................---................................ccc................................................----..........cc.................---...................ccc.-----.ccc.....---.BB............c.########cc................................',
  '.............ccc...........c.c.c....................................---.............cc....c.c.c........................................?W............cc............M.....K.V..---.......---..M......BB.ccc.c.....---########==..................cc............',
  '........ccc..----..........B?BWB........h....c..c.....cc........f................h....cc..BWB?B.....................--.c..c..c.......RRRR............--..............=======..................c.....BBRRRRRRR.......##########cc...............c..c...........',
  '....................ccc............=======...............V..K..====.............===.................f.V.Ks..c.c.c..h..n........K.V.RRRRRR....j..h........c..c..c.....#######.--..............c......BB........---...##########==..............................',
  '...P..shB?B.f..n..h======...ccc..f.#######===.d.......j.=======####.....o...f...###..j..R....n..ccc.======m........RRRR.d..d..====================m.......d..d..RR...#######......c.c.c.o.f......f..BB...j.cWV.f..cc############cc.f.o..F.?W?.t....O.......AF.',
  '===================######==========##########~~~~=======###########=============###=================######~~~~~~~~~RRRR~~~~~~~####################~~~~~~~~~~~~~~RR~~~#######================....====================############==============================',
  '#############################################~~~~#########################################################~~~~~~~~~RRRR~~~~~~~####################~~~~~~~~~~~~~~RR~~~#######################....##############################################################',
  '#############################################~~~~#########################################################~~~~~~~~~RRRR~~~~~~~####################~~~~~~~~~~~~~~RR~~~#######################^^^^##############################################################',
];
