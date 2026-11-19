/**
 * FASE 4 — "Favela do Rio". Dados puros (sem imports).
 * Grade de 254 colunas x 14 linhas; tile = 16px; chão-base na linha 11 (topo y=176).
 * Envelope de pulo (o mesmo das Fases 1 e 2): degraus obrigatórios ≤2 tiles, vãos obrigatórios ≤3 tiles.
 * Depois de editar: `node scripts/check-level4.mjs` (simula o Pardo e prova que a fase fecha).
 *
 * LEGENDA — células com TILE (sólidos/perigos):
 *   .  vazio              =  laje/calçada de concreto (GroundTop)     #  alvenaria de tijolo baiano (Ground)
 *   R  concreto/pedra carioca (Rock)   ^  muro com cacos de vidro (Spike, mata)   B  mureta rachada (soco)
 *   ?  bloco-estrela com moeda         W  bloco-estrela com gota                  -  telha de zinco (one-way)
 *   ~  valão do morro (Water: mata ao tocar; 3 linhas nas linhas 11..13)
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (pés na base da célula)      K  checkpoint (pés na base da célula)
 *   c  moeda (centrada na célula)
 *   l  vira-lata caramelo  g  gato elétrico  o  capivara  z  traficante rubro-negro
 *      (base na base da célula, centro horizontal da célula; capivara requer superfície >= 5 tiles)
 *   u  pombo-da-praça territorial (linhas 3..6, >=20 tiles entre pombos, >7 tiles de P/K)
 *   V  filtro de barro 16x32 (base na base da célula, alinhado à esquerda)
 *   m  andaime/bondinho móvel H   M  elevador de obra móvel V (parâmetros em LEVEL4_MOVERS)
 *   d  telha de zinco bamba que cede 32x10 (canto sup. esq. na célula)
 *   A  Amaro, o faxineiro do tribunal, varrendo o chão com a água mineral (objetivo; base na base da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   s  placa azul de rua   T  fachada do Tribunal (5 tiles)   x  caixa d'água azul (2 tiles)
 *   p  poste com gato de luz   v  varal de roupas (2 tiles)   F  paredão de som (2 tiles)
 *   b  balde amarelo de faxina do Amaro
 *
 * ROTEIRO (colunas) — 4 Atos ("Do Morro ao Tribunal"):
 *  ATO 1 · PÉ DO MORRO & BECO DAS LAJES (0–62)
 *    0-18   Chegada: placa de rua, mureta B?B (soco), 1º vira-lata caramelo com telhado de zinco por cima, poste.
 *   19-39   Laje com paredão de som F, fileira suspensa B?BWB (abrigo contra o 1º pombo) e subida pelos telhados.
 *   40-62   Casa alta com caixa d'água x e segredo ?W; descida por telha bamba d1, 1º filtro de barro V1,
 *           K1 (56) e 1º gato elétrico vigiando a entrada do Valão.
 *  ATO 2 · O VALÃO E AS ESCADARIAS (63–144)
 *   63-92   1º andaime móvel (m1) sobre o Valão (~), ilhota com varal v, ?W? e 1º traficante rubro-negro (z1);
 *           2º trecho do Valão com duas rotas: telhas bambas d2/d3 (moedas) ou telhados altos seguros.
 *   93-109  1ª capivara-do-valão (o1), filtro de barro V2, laje de K2 (104) com placa de rua.
 *  110-144  2º andaime móvel (m2) sobre o Valão, 2º gato elétrico, escadaria com caixa d'água e 2º pombo,
 *           2º traficante (z2) na laje, 2ª capivara (o2), filtro V3 e K3 (142).
 *  ATO 3 · LABIRINTO DOS TELHADOS & GATOS DE LUZ (145–218)
 *  145-179  Fosso com cacos de vidro (^), telha d4, pilar de concreto R e elevador vertical M1 até bifurcação:
 *           Rota Alta por telhados com gato elétrico, 3º pombo e segredo ?W no mirante; Rota Baixa com
 *           paredão F, caramelo, parede alta de blocos B (altura 4), 3ª capivara e 3º traficante.
 *  180-218  Convergência em K4 (183) e V4, elevador vertical M2 sobre fosso de cacos, postes com gato de luz e
 *           4º pombo, viela com varal e caramelo, 4º traficante na laje e mirante final com K5 (217) + segredo ?W.
 *  ATO 4 · O PÁTIO DO TRIBUNAL & O FAXINEIRO AMARO (219–253)
 *  219-253  Descida com moedas e telhados sobre a praça, filtro V5, 5º pombo e 4ª capivara de guarda,
 *           portão de tijolos B?W?B e zona 100% pacífica: fachada do Tribunal T (241..245), balde b (246)
 *           e Amaro A (250) varrendo o chão com a água mineral!
 */
export const LEVEL4_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'calçada/laje', '#': 'tijolo baiano', 'R': 'concreto/pedra', '^': 'cacos de vidro',
  'B': 'tijolo rachado', '?': 'bloco com moeda', 'W': 'bloco com gota', '-': 'telha de zinco one-way', '~': 'valão',
  'P': 'spawn', 'K': 'checkpoint', 'c': 'moeda',
  'l': 'vira-lata caramelo', 'u': 'pombo-da-praça', 'g': 'gato elétrico', 'o': 'capivara-do-valão', 'z': 'traficante rubro-negro',
  'V': 'filtro de barro', 'm': 'andaime móvel H', 'M': 'elevador móvel V',
  'd': 'telha de zinco bamba', 'A': 'Amaro faxineiro com água mineral',
  's': 'placa de rua', 'T': 'fachada do Tribunal', 'x': 'caixa d\'água azul',
  'p': 'poste com fios', 'v': 'varal de roupas', 'F': 'paredão de som', 'b': 'balde de faxina',
};

/** Parâmetros das plataformas móveis, chave "col,linha": range em tiles e velocidade média px/s. */
export const LEVEL4_MOVERS: Record<string, { range: number; speed: number }> = {
  '67,10': { range: 4, speed: 36 },
  '110,10': { range: 5, speed: 44 },
  '150,7': { range: 3, speed: 30 },
  '188,7': { range: 3, speed: 30 },
};

export const LEVEL4_ROWS: string[] = [
  '..............................................................................................................................................................................................................................................................',
  '..............................................................................................................................................................................................................................................................',
  '.........................................................................................................................................................................?W...................................................................................',
  '............................u................................................................................................u.................................u...................................u...............................u..........................',
  '............................................?W........................................................................................................cc..ccc............cc.................cc........................?W......................................',
  '............................................cc.............................................................................................................g.....cccc..------.................................ccc.....cc......................................',
  '.....................................cc...x............................................ccc.ccc.................cccc..........x.c.......cccc..............-----..------.........ccc.....................cccc..-----..x....K....................................',
  '............cccc..........ccccc.....----=======........................................---.---.................----.........=====......----...........M...........BB..........-----.........M..........----.........=======........cc.........................',
  '.........c..----...ccF.cc.B?BWB..cc.....#######.............cc......cccc....?W?.....cc..........ccc.....K.s..............ccc#####...z.............................?B.........?W......V.K.........p.g............z...#######...ccc.----........................',
  '........c.c........======.......====....#######==cc........----.....................==.cc.cc..........======.............===#####=====............cc..............BB..c...c.........=======.....======......========#######...---.....ccc.....................',
  '...P..s.B?B....l.p.######.......####.cc.#########d....KV....l..g.p.m......v.ccc...z.##.d..d......o..V.######..m........g.#############..o...V.K...d.RR...F..l.....BB....o....cc..z..#######.....######.v..l.###############.V........o....B?W?BscT....b...A...',
  '===================######=======####====#########..================~~~~~~===========##~~~~~~~~========######==~~~~~~~====#############============..RR..============================#######.....######======###############===================================',
  '#################################################..################~~~~~~#############~~~~~~~~################~~~~~~~#############################..RR..###################################.....##############################################################',
  '#################################################^^################~~~~~~#############~~~~~~~~################~~~~~~~#############################^^RR^^###################################^^^^^##############################################################',
];
