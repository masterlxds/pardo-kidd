/**
 * FASE 3 — "Bahia World" (100% subaquática). Dados puros (sem imports).
 * Grade de ~240 colunas x 18 linhas; tile = 16px; fundo de areia base na linha 15 (topo y=240).
 * O Pardo NADA (sem envelope de pulo): alcança qualquer espaço aberto de 1 tile de largura x 2 de altura.
 * As linhas 0-2 ficam ACIMA da linha d'água (SWIM_CEILING = 48px): inalcançáveis; só '.' (céu) ou 'R' (rocha que aflora).
 *
 * LEGENDA — células com TILE:
 *   .  água livre         =  areia dourada, topo (GroundTop)     #  areia/sedimento (Ground)
 *   R  rocha com musgo (Rock, indestrutível)   ^  ouriço-do-mar (Spike, mata)
 *   B  bloco de ruína rachado (soco)   ?  bloco com moeda   W  bloco com gota (cura 1 coração)
 *   -  plataforma de coral rosado (one-way)
 * LEGENDA — marcadores (a célula vira água livre; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula; precisa de chão abaixo)
 *   c  moeda (centrada)
 *   a  água-viva (centro da célula = centro da oscilação vertical de ±1.5 tile; precisa de 2 células livres acima e abaixo)
 *   g  peixe-agulha (centro da célula; dispara na horizontal em direção ao Pardo — precisa de corredor livre de ≥12 tiles à esquerda)
 *   b  baiacu-bomba (centro da célula; infla até 20x20 → 1 célula livre em volta)
 *   D  baiacu-dentão (centro da célula; patrulha ±3 tiles na horizontal e dá dash na linha)
 *   s  siri-de-recife (base na base da célula; precisa de superfície sólida/one-way de ≥4 tiles)
 *   T  tartaruga-de-couro (centro da célula; nada em diagonais lentas, precisa de área aberta ≥8x5 tiles)
 *   e  moreia (toca na célula; EXATAMENTE um dos lados esq./dir. deve ser tile sólido, e as 2 células do outro lado, livres)
 *   v  fissura de bolhas / air vent (base na base da célula; chão sólido abaixo; coluna livre de ≥4 tiles acima)
 *   f  fitinha do Bonfim (centrada; exatamente 3 na fase, em segredos)
 *   p  cardume de peixes-dourados (neutro; centro da célula; aponta segredos e fissuras)
 *   S  altar com o Cajado Jailnesco (objetivo; base na base da célula, centro horizontal da célula; chão de 2 tiles)
 *   J  Jandira sentada na pedra (base na base da célula, centro horizontal; 3 tiles de chão; fica 3-4 tiles à DIREITA do S)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   1  coral rosa   2  coral-leque (1.5 tile de altura)   3  alga alta (2 tiles)   4  âncora
 *   5  coluna de ruína (3 tiles de altura)   6  arco de ruína (3x3 tiles)   7  concha
 *   8  placa   9  pedra com fitinhas do Bonfim   0  ânfora
 *
 * TRECHOS: 1 Barra (0-55) · 2 Recife de Corais (56-120) · 3 Ruínas Submersas (121-195) · 4 Santuário de Jandira (196-239)
 */
export const LEVEL3_LEGEND: Record<string, string> = {
  '.': 'água', '=': 'areia', '#': 'sedimento', 'R': 'rocha', '^': 'ouriço',
  'B': 'bloco rachado', '?': 'bloco com moeda', 'W': 'bloco com gota', '-': 'coral one-way',
  'P': 'spawn', 'K': 'checkpoint', 'c': 'moeda',
  'a': 'água-viva', 'g': 'peixe-agulha', 'b': 'baiacu-bomba', 'D': 'baiacu-dentão',
  's': 'siri', 'T': 'tartaruga', 'e': 'moreia',
  'v': 'fissura de bolhas', 'f': 'fitinha do Bonfim', 'p': 'peixes-dourados',
  'S': 'altar com o cajado', 'J': 'Jandira',
  '1': 'coral rosa', '2': 'coral-leque', '3': 'alga', '4': 'âncora', '5': 'coluna', '6': 'arco',
  '7': 'concha', '8': 'placa', '9': 'pedra com fitinhas', '0': 'ânfora',
};

// Mapa 240x18 (gerado e conferido por scripts/check-level3.mjs).
export const LEVEL3_ROWS: string[] = [
  'R.............................................................................................................................................................................................................................................RR',
  'R........................................................RRR........RRR.RR............RRRR......................RR..............RR.........................................R................................................................RRRR',
  'R........................................................RRR........RRR.RR............RRRR..............RRR....RRRR.............RR..............RRRR......................RRR.........................................................RRRRRRRRRR',
  'R........................................................RRR........RRR.RR............RRRR............RRRRR....RRRRRRRR.........RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR..........................RRRRRRRRRRRRRRRRRR',
  'R........................................................RRR.........^..RR....ccc......^^.......................................RR............RR..................................^^..............................................RRRRRRRRRRRRRR',
  'R..................................cccccc.................^.............RR..c..RRc......................ccccc...ccccc.........................RR..ccccccc..cccc................ccccccccc...c....c.........................................71RRRR',
  'R.................................c......c........a...g.................RR.....RR.c..................g........D....................cccc....f..RR........Re.......c........g...............c.......g...................1.9..p..............RRRRRR',
  'R................................c........c..........................a..RR..c..RR.......................1...7....2............p.RR.0.7..0....5RR.....0..R....1....c...T.......5.s.......1...........................cc----..............2.RRRRRR',
  'R.........p............ccc..........1..3.7.c..p...............Dcccc.....RR.a...RR.......T..............RRRRRRRRRRRRRRRR.........RRRRRRRRRRRRRRRRe..RRRRRRRRRRRRRR..c..........RRRRRRRRRRR.............0.7........c......................RRRRRRRR',
  'R.............ccc.....1...7..a....RRRRRRRRR.....b.......................RR..c..RR............?W?.......RRRRRRRRRRRRRRRR.p..........................BB..?W......RR...c.................R.......T......----......c......................1.RRRRRRRR',
  'R............c...c....-----.......RRRRRRRRR.......1.7..g.2......s.......RR.....RR...................a..............R...................D...........BB..........RRe..............c.....R....................c.c........................RRRRRRRRRR',
  'R...........c.....c...............RR.....RR......-----..1RR1..------.........a.RR..s......ccc..............s....b..R.f.............................BB......f.b.RR...............R.......................c..........6..07....S...J..9.0RRRRRRRRRR',
  'R..........c.....1................RR.ccccRR.............RRRR..............c....RR.----...................------....RRRR............c1c...c.c.c.....BB.cccc.....RR...............R...D.............g...c.......1.5.============================RR',
  'R...............====.........................v......1.3.RRRR............cc.....RR.....1........K............................3.....RRRRRRRRRRRRRR...BB..........RR.......3...ccc.R.cc..c..6................9.2.====############################RR',
  'R..P.8.7..v.3.==####==.........3....0.7....====4...=====RRRR...........3....v..RR2...====.3..=====7v.3.7..cccc..1..7...6..K===v...RRRRRRRRRRRRRR.v.BB.00..7..5.RR.1.v..====..0..R....7.5.===v...13...4.7.3====################################RR',
  '==============########=====.7..============####====#####=====.7......1.==============####====#####=========================###=========================================####======.^^.====###==============####################################==',
  '###########################====##############################==^^^^^===##########################################################################################################====###########################################################',
  '###############################################################=====############################################################################################################################################################################',
];
