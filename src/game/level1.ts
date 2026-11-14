/**
 * FASE 1 — "Trilha dos Monólitos". Dados puros (sem imports).
 * Grade de 222 colunas x 14 linhas; tile = 16px; chão base na linha 11 (topo y=176).
 *
 * LEGENDA — células com TILE (sólidos/perigos):
 *   .  vazio              =  chão com topo (GroundTop)     #  terra (Ground)
 *   R  rocha (Rock)       ^  espinhos (Spike, mata)        B  bloco quebrável (soco)
 *   ?  bloco com moeda    W  bloco com gota d'água         -  plataforma one-way
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula)
 *   c  moeda (centrada na célula)
 *   l  calango  p  palma-brava  t  tatu   (base na base da célula, centro horizontal da célula)
 *   v  carcará (altitude média = centro vertical da célula)
 *   C  cacto d'água 24x32 (centrado na célula, base na base da célula)
 *   m  plataforma móvel horizontal  M  plataforma móvel vertical
 *      (canto sup. esq. da célula = posição inicial/extremo; parâmetros em LEVEL1_MOVERS)
 *   d  plataforma que desmorona 32x10 (canto sup. esq. na célula)
 *   G  caneca esmaltada (sobre o pedestal; base na base da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   s  placa  k  crânio  f  cerca (2 tiles)  T  árvore seca (2 tiles)  b  arbusto
 *   o  pedrinhas  j  mandacaru  H  capela (4 tiles)  D  pedestal
 *
 * TRECHOS: 1 Saída do Povoado (0-55) · 2 Desfiladeiro Seco (55-150) ·
 *          3 Subida da Galinha Choca (150-205) · 4 Capela do Horizonte (205-221)
 */
export const LEVEL1_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'chão com topo', '#': 'terra', 'R': 'rocha', '^': 'espinho',
  'B': 'bloco quebrável', '?': 'bloco com moeda', 'W': 'bloco com gota', '-': 'one-way',
  'P': 'spawn', 'K': 'checkpoint', 'c': 'moeda',
  'l': 'calango', 'p': 'palma', 't': 'tatu', 'v': 'carcará',
  'C': 'cacto d\'água', 'm': 'plataforma móvel H', 'M': 'plataforma móvel V',
  'd': 'plataforma que desmorona', 'G': 'caneca',
  's': 'placa', 'k': 'crânio', 'f': 'cerca', 'T': 'árvore seca', 'b': 'arbusto',
  'o': 'pedrinhas', 'j': 'mandacaru', 'H': 'capela', 'D': 'pedestal',
};

/** Parâmetros das plataformas móveis, chave "col,linha": range em tiles (a partir da célula) e velocidade média px/s. */
export const LEVEL1_MOVERS: Record<string, { range: number; speed: number }> = {
  '108,10': { range: 9, speed: 40 },  // ravina dos 14 tiles (horizontal)
  '138,10': { range: 8, speed: 50 },  // ravina antes do trecho 3 (horizontal)
  '177,7': { range: 3, speed: 30 },   // subida vertical sobre os espinhos (de y=112 até y=160)
};

export const LEVEL1_ROWS: string[] = [
  '..............................................................................................................................................................................................................................',
  '..............................................................................................................................................................................................................................',
  '..............................................................................................................................................................................................................................',
  '................................................................................................................................................................................v.............................................',
  '.............................................................................................................................................?B...............................................................................',
  '.........................................................................v....................v.......................................c.c.c..BBcccc.............................c..c.cc............c..........................',
  '.........................................................................................................................v...BB.....---------------..................c.................lb.....C...............................',
  '................................................................................ccc..........................................?B.................v..........c.....cc.........o....M..RRRRRR.p.RRR.p.RR.........................',
  '......................B?B?B...............ccc................ccc........ccc.........cc....c...c...c.............c.c..........BW.--...cc.......ccc...................RRR.p.RRRR......RRRRRRRRRRRRRRRRRRR.......................',
  '..............ccc...........cc............===.o.............................c.l....====..d...d...d....oK.c................oCbBB....l.^^.k.............oKc.RRR.p.RRRRRRRRRRRRRR......RRRRRRRRRRRRRRRRRRRRR.................G...',
  '...P..s.T.o.b.===..jcc..k..b.....C.cl.b.==###==..f...kb.T.l......o.l^^.....=====...####..............======.m............================.m..........=====RRRRRRRRRRRRRRRRRRRR......RRRRRRRRRRRRRRRRRRRRR==..cc.t..f.H..c.D.f.',
  '==============###===========..==========#######==============...========...#####...####..............######..............################............#####RRRRRRRRRRRRRRRRRRRR......RRRRRRRRRRRRRRRRRRRRR##===================',
  '############################..###############################...########...#####...####..............######..............################............#####RRRRRRRRRRRRRRRRRRRR......RRRRRRRRRRRRRRRRRRRRR#####################',
  '############################..###############################^^^########^^^#####^^^####^^^^^^^^^^^^^^######^^^^^^^^^^^^^^################^^^^^^^^^^^^#####RRRRRRRRRRRRRRRRRRRR^^^^^^RRRRRRRRRRRRRRRRRRRRR#####################',
];
