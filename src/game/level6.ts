/**
 * FASE 6 — "Transportadora de São Paulo" (Hora do Café). Dados puros (sem imports).
 * Grade de ~240 colunas x 14 linhas; tile = 16px; chão-base na linha 11 (topo y=176).
 * Envelope de pulo (o mesmo das Fases 1, 2 e 4): degraus obrigatórios ≤2 tiles, vãos obrigatórios ≤3 tiles.
 * Depois de editar: `node scripts/check-level6.mjs` (simula o Pardo e prova que a fase fecha).
 * Design: level-6-refs/gdd_fase6_transportadora.md §4 · PLAN-FASE6.md §5.
 *
 * LEGENDA (CONTRATO — só o orquestrador altera) — células com TILE (sólidos/perigos):
 *   .  vazio              =  piso de concreto com faixa zebrada (GroundTop)   #  concreto/fundação (Ground)
 *   R  lataria de baú de caminhão / contêiner (Rock, indestrutível)           ^  palete quebrado com pregos (Spike, mata)
 *   B  caixa de papelão "FRÁGIL" (soco)   ?  caixa-estrela com moeda   W  caixa-gota com gota   -  prateleira/palete (one-way)
 *   Não há água: os abismos são fossos de doca (colunas vazias até a base do mapa).
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula)
 *   c  moeda (centrada na célula)
 *   r  rato   g  carregador de caixa   e  empilhadeira   a  arremessador
 *      (base na base da célula, centro horizontal da célula; `g` requer corredor plano ≥ 9 tiles, `e` ≥ 8 tiles;
 *       `a` fica sobre superfície ≥ 2 tiles acima do chão-base e a ≥ 12 tiles de qualquer `e`)
 *   V  bebedouro de galão 16x32 (base na base da célula, alinhado à esquerda)
 *   m  paleteira móvel H   M  plataforma elevatória de doca móvel V (parâmetros em LEVEL6_MOVERS)
 *   d  pilha de caixas bamba 32x10 (canto sup. esq. na célula)
 *   A  Renan Maia com a xícara de café (objetivo; base na base da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   t  cabine de caminhão 40x48 (olhando para a direita)   w  rodas/chassi 48x16 (3 tiles)   n  cone
 *   s  placa de doca   f  placa "CUIDADO: EMPILHADEIRA"   h  carrinho de mão   o  tambor de óleo
 *   G  guarita 48x48 (3 tiles)   q  relógio de ponto   C  máquina de café 24x32
 *
 * CAMINHÃO-BAÚ (convenção): baú = retângulo de `R` com 5–7 tiles de largura x 3 de altura, nas linhas 7..9
 *   (teto andável na linha 7); a linha 10 sob o baú fica VAZIA e recebe `w` (rodas, uma a cada 3 tiles, a
 *   partir da 1ª coluna do baú); a cabine `t` vai na linha 10, na coluna logo à DIREITA do baú.
 *   O vão de 1 tile sob o baú não deixa o Pardo passar (hitbox de 24px), mas os ratos passam.
 *   A cor do baú (branco/azul/laranja) é escolhida por level.ts a partir da coluna inicial do retângulo.
 *
 * ROTEIRO (colunas) — 4 Atos (240 colunas; o validador usa os mesmos limites de ato):
 *  ATO 1 · PORTARIA & PÁTIO (0–58) — ensina
 *    0-19   Guarita G, spawn P (4), placa e cones; caixas B?B no chão (soco ou pulo); 1º rato isolado (17).
 *   20-34   Caminhão T1 (baú 23..28): escada de caixas + paletes, moedas no teto e segredo ?W acima.
 *   35-46   2º rato, paletes com moedas, 1º bebedouro V1 (39), tambor, K1 (44).
 *   47-58   Caminhão T1b (baú 47..52) com segredo ?W, 3º rato e o 1º fosso de doca (57-58) com pilha bamba d1.
 *  ATO 2 · DOCAS DE CARGA (59–125)
 *   59-82   Doca D1 (topo na linha 9), fosso, caminhão T2 com o 1º arremessador no teto (69); corredor com
 *           o 1º carregador (76), rato e paletes em dois níveis.
 *   83-96   Fosso e doca longa D2: K2 (86), bebedouro V2 (88), 2º carregador no corredor da doca (93).
 *   97-117  Fosso largo com plataforma elevatória M1 (98), caminhão T3 com arremessador (103) e segredo ?W;
 *           corredor do 3º carregador (113) com pilhas bambas d2/d3 e moedas (rota opcional).
 *  118-125  Fosso de 6 tiles cruzado pela paleteira m1 (118); K3 (124).
 *  ATO 3 · GALPÃO & PORTA-PALETES (126–205) — interior (LEVEL6_INDOOR_FROM_COL)
 *  126-145  Estante 1 em 3 níveis (linhas 9/7/5): rota alta com arremessador (134) e segredo ?W (137);
 *           rota baixa com 2 carregadores (130, 140) e bando de ratos (134+136); parede de caixas (3) em 144-145.
 *  146-167  Corredor da empilhadeira 1 (154) com placa e prateleira de fuga; fosso de pregos (162-166)
 *           cruzado pela paleteira m2 (162).
 *  168-191  K4 (168), V3 (170); corredor da empilhadeira 2 (179) sob a estante 2 (pilha bamba d4 no topo),
 *           bando de ratos (183+185), parede de caixas (4) em 187-188 e fosso de pregos (189-191).
 *  192-205  Estante 3: arremessador (196), carregador (194) e bando de 3 ratos (197+199+201); elevatória M2
 *           (202) sobe ao segredo ?W na prateleira da linha 3 (204-207).
 *  ATO 4 · COPA DA EXPEDIÇÃO (206–239) — 100% pacífica
 *  206-239  K5 (207), relógio de ponto (211), bebedouro V4 (214), mesinha de paletes com moedas, carrinho,
 *           máquina de café (228), Renan Maia A (233) com a xícara; parede R fecha a coluna 239.
 */
export const LEVEL6_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'piso de concreto', '#': 'concreto/fundação', 'R': 'lataria de baú', '^': 'palete com pregos',
  'B': 'caixa de papelão', '?': 'caixa com moeda', 'W': 'caixa com gota', '-': 'prateleira one-way',
  'P': 'spawn', 'K': 'checkpoint', 'c': 'moeda',
  'r': 'rato', 'g': 'carregador de caixa', 'e': 'empilhadeira', 'a': 'arremessador',
  'V': 'bebedouro de galão', 'm': 'paleteira móvel H', 'M': 'plataforma elevatória V',
  'd': 'pilha de caixas bamba', 'A': 'Renan Maia com a xícara de café',
  't': 'cabine de caminhão', 'w': 'rodas de caminhão', 'n': 'cone', 's': 'placa de doca',
  'f': 'placa de empilhadeira', 'h': 'carrinho de mão', 'o': 'tambor de óleo', 'G': 'guarita',
  'q': 'relógio de ponto', 'C': 'máquina de café',
};

/**
 * Coluna a partir da qual o cenário é INTERIOR de galpão (Atos 3 e 4). background6.ts lê esta constante;
 * o dono LEVEL ajusta o valor se o início do Ato 3 mudar de coluna.
 */
export const LEVEL6_INDOOR_FROM_COL = 126;

/** Parâmetros das plataformas móveis, chave "col,linha": range em tiles e velocidade média px/s. */
export const LEVEL6_MOVERS: Record<string, { range: number; speed: number }> = {
  '98,7': { range: 3, speed: 28 },
  '118,10': { range: 4, speed: 34 },
  '162,10': { range: 3, speed: 30 },
  '202,3': { range: 5, speed: 30 },
};

export const LEVEL6_ROWS: string[] = [
  '.............................................................................................................................................................................................................?W................................R',
  '...................................................................................................................................................................................cc..........................................................R',
  '.........................................................................................................................................?W.................................................................cccc...............................R',
  '...................................................................................................................................................................................d......................M.----...............................R',
  '.........................?W......................?W.....................................................?W......cc....................a.ccccc.....................................ccccc........................................................R',
  '..................................................................................................cc..........cc..cc...............-----------...................................-------.......................................................R',
  '........................cccc....................cccc.....cc..........a...........cc........ccccc.......a..cc.....................cc...........cc......cccccccccc...............cc................ccca..........................................R',
  '..........ccc..........RRRRRR..................RRRRRR.......ccc...RRRRRRccc......--...............M...RRRRRR..d...d....cccc.....------------------...------------..............-----------.BB....--------......................................R',
  '................ccc....RRRRRR.......cc.........RRRRRR....d..s.....RRRRRR.....cccc.....K.V.s..g........RRRRRR....................................BB.................ccc.....................BB...........................ccccccc................R',
  '..............--.....--RRRRRR.......--.......--RRRRRR......=====..RRRRRR......--.....============.....RRRRRR..................--................BB.--........................--............BB............................-----.................R',
  'G...P.s.n.B?B.n..r..BBBw..w..t...h.r...V.o..K.Bw..w..t.r...#####..w..w..t...g.n.r....############.....w..w..t....g....m.....Ko....g...r.r...g...BBf.......e.......m.....K.V=f......e...r.r.B?.....g..r.r.r.....K...q..V.........h...C....A..o..R',
  '=========================================================..#####..=================..############.....================......======================================.....====#=================...================================================',
  '#########################################################..#####..#################..############.....################......######################################.....######################...################################################',
  '#########################################################..#####..#################..############.....################......######################################^^^^^######################^^^################################################',
];
