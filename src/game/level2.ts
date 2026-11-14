/**
 * FASE 2 — "Coração da Amazônia". Dados puros (sem imports).
 * Grade de ~230 colunas x 14 linhas; tile = 16px; chão base na linha 11 (topo y=176).
 * (Mesmo envelope de pulo da Fase 1: degraus ≤2 tiles, vãos ≤3 tiles nos saltos obrigatórios.)
 *
 * LEGENDA — células com TILE (sólidos/perigos):
 *   .  vazio              =  grama sobre terra vermelha (GroundTop)     #  terra vermelha (Ground)
 *   R  pedra com musgo (Rock)   ^  espinheiro (Spike, mata)   B  bloco rachado (soco)
 *   ?  bloco-estrela com moeda  W  bloco-estrela com gota     -  galho (one-way)
 *   ~  água do rio (Water: mata ao tocar; o desenho escolhe superfície/funda sozinho)
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula)
 *   c  moeda (centrada na célula)
 *   o  onça  j  jacaré  n  cobra   (base na base da célula, centro horizontal da célula)
 *   u  tucano (altitude média de voo = centro vertical da célula)
 *   V  cipó-d'água 16x32 (base na base da célula, alinhado à esquerda)
 *   m  tronco flutuante horizontal  M  tronco/plataforma vertical
 *      (canto sup. esq. da célula = posição inicial/extremo; parâmetros em LEVEL2_MOVERS)
 *   d  vitória-régia que afunda 32x10 (canto sup. esq. na célula)
 *   A  alien com a mamadeira (objetivo; base na base da célula, centro horizontal da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   s  placa   O  oca (5 tiles)   h  helicônia   f  samambaia   F  cerca de taquara (2 tiles)
 *   q  canoa (2.5 tiles, use sobre água: base na base da célula)   t  totem
 *
 * TRECHOS: 1 Margem do Igarapé (0-57) · 2 Rio das Cachoeiras (58-139) ·
 *          3 Copa das Árvores (140-205) · 4 Aldeia (206-229)
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
  '77,10': { range: 7, speed: 40 },   // tronco: ilhota 70-75 -> ilhota 87-90
  '109,10': { range: 6, speed: 45 },  // tronco: margem 92-107 -> vitórias-régias
  '134,10': { range: 3, speed: 35 },  // tronco: ilha 127-132 -> margem da copa (140)
  '188,9': { range: 2, speed: 30 },   // vertical sobre o fosso de espinhos (187-190)
};

export const LEVEL2_ROWS: string[] = [
  '......................................................................................................................................................................................................................................',
  '......................................................................................................................................................................................................................................',
  '.........................................................................................................................................................................?.W..........................................................',
  '................................................................................................................................................................................u.....................................................',
  '........................................................................................................................................................................ccccc.........................................................',
  '.........................................................................................u.......................u....................................u..........ccccc..-----.........................................................',
  '........................ccccc....?W?............................................u.........................................u........................................o................?W................................................',
  '................................ccccc...........................................................................................................................-------.............BB......cc..cccc..................................',
  '..........ccc...........B?B?B........................cc....cc.cc..............ccccccc.........................ccccccc.cccccccc........ccccc................ccc......................BB..............ot................................',
  '.................................===...........c.ccc..................cccccc............ccc...ccccccc...........................ccccc...........cccc......-----.....................BB......M..========.....cc...cccccccc.............',
  '...P..s..h..f...h...n......f...==###==h.n.f.V.h......h.F...d..d.q..d...h.j...m................h..K.....j.f...m........d..d..d...f.j...m......s.K..h.n...fo..................V...n...BB.hn......########.V..n....K..F..t.h.O........A..',
  '===============================#######===========~~~======~~~~~~~~~~~~RRRRRR~~~~~~~~~~~RRRR~================~~~~~~~~~~~~~~~~~~~RRRRRR~~~~~~~===============================================....########===============================',
  '#################################################~~~######~~~~~~~~~~~~RRRRRR~~~~~~~~~~~RRRR~################~~~~~~~~~~~~~~~~~~~RRRRRR~~~~~~~###############################################....#######################################',
  '#################################################~~~######~~~~~~~~~~~~RRRRRR~~~~~~~~~~~RRRR~################~~~~~~~~~~~~~~~~~~~RRRRRR~~~~~~~###############################################^^^^#######################################',
];
