/**
 * FASE 5 — "Marginal de São Paulo" (De Uber até o Galpão). Dados puros (sem imports).
 * Autoscroller em cima do carro preto da Uber (`UBER_SPEED = 80 px/s`).
 * Grade de 240 colunas x 14 linhas; tile = 16px; asfalto na linha 11 (y=176), teto do Uber na linha 10 (y=160).
 * Depois de editar: `node scripts/check-level5.mjs` (simula o Pardo e prova que a fase fecha).
 * Design: level-5-refs/gdd_fase5_marginal.md · PLAN-FASE5.md.
 *
 * LEGENDA (CONTRATO — só o orquestrador altera) — células com TILE (sólidos/perigos):
 *   .  vazio              =  asfalto da Marginal (GroundTop)                  #  concreto do viaduto (Ground)
 *   R  carroceria de ônibus/furgão (Rock, indestrutível)                      ^  cavalete eletrificado (Spike, mata)
 *   ~  água poluída do Rio Tietê (Water, mata com splash)
 *   B  barreira laranja da CET (soco)     ?  caixa com moeda   W  caixa com gota   -  passarela/viga (one-way)
 * LEGENDA — marcadores (a célula vira Empty; ancoragem descrita):
 *   P  spawn do Pardo (sobre o teto do Uber, linha 9) + instancia o carro preto da Uber
 *   K  checkpoint (placa luminosa; pés na base da célula)
 *   c  moeda (centrada na célula)
 *   y  motoboy do grau (1 soco)   u  drone de delivery (1 soco)   p  Faria Limer de patinete (1 soco)   z  pichador (1 soco)
 *   V  cooler térmico "5★ ÁGUA" 16x32 (base na base da célula, alinhado à esquerda)
 *   m  drone-plataforma móvel H   M  drone-plataforma móvel V (parâmetros em LEVEL5_MOVERS)
 *   d  viga metálica bamba 32x10 (canto sup. esq. na célula)
 *   A  Desembarque VIP 5 Estrelas na entrada da Transportadora (objetivo; base na base da célula)
 * LEGENDA — decoração (não colide; base na base da célula, alinhada à esquerda):
 *   b  frente de ônibus/furgão 40x48 (à direita de um bloco R)   w  rodas de ônibus 48x16 (sob R)
 *   s  placa verde da Marginal 24x24   r  radar "60 KM/H" 16x32   l  poste curvo de luz 16x48   n  cone da CET 8x12
 *
 * ROTEIRO (colunas) — 4 Atos (240 colunas):
 *  ATO 1 · ENTRADA DA MARGINAL TIETÊ (0–59)
 *    0-23   Spawn P (5,9) sobre o teto do Uber, placa s, poste l, cones n; barreiras B?B (10..12,9);
 *           1º patinete p (17,9), 1º drone u (21,6) e passarelas com moedas.
 *   24-37   1º ônibus R (26..31, linhas 7..9) com degrau '-' (24..25,8), moedas no teto e segredo ?W (28..29,4);
 *           1º vão curto sobre o Rio Tietê '~' (36..37).
 *   38-59   Cooler V1 (41,9), checkpoint K1 (46,9), passarela elevada, 2º patinete p (53,9) e 2º drone u (56,6).
 *  ATO 2 · VIADUTOS DO TIETÊ & OBRAS DA CET (60–124)
 *   60-83   Estreia do Motoboy do Grau y (64,9); vão sobre o Tietê (70..72) com viga bamba d1 (70,9);
 *           2º ônibus R (75..80) com estreia do Pichador z (78,6) e segredo ?W (76..77,4).
 *   84-107  Checkpoint K2 (84,9), cooler V2 (86,9), 2º motoboy y (90,9), drone u (91,5);
 *           vão largo sobre o Tietê (94..98) com drone-plataforma m1 (94,9) e viga bamba alta d2 (95,6);
 *           3º ônibus R (101..106) com 2º pichador z (104,6) e caixa ? (103,4).
 *  108-124  Corredor com 3º motoboy y (111,9), 3º patinete p (114,9), drone u (115,6) e checkpoint K3 (120,9).
 *  ATO 3 · MINHOCÃO & HORA DO RUSH (125–207)
 *  125-143  Passarelas do Minhocão em 3 níveis (linhas 7, 5 e 3) com 3º pichador z (132,4), segredo ?W (131..132,1),
 *           motoboy y (128,9), patinete p (134,9), drone u (138,6) e parede dupla de barreiras B (142..143, linhas 7..9).
 *  144-164  Motoboy y (148,9), patinete p (152,9); vão de obras com cavaletes eletrificados '^' (155..159)
 *           cruzado por drone-plataforma m2 (155,9) e viga bamba alta d3 (156,6); checkpoint K4 (164,9).
 *  165-207  Cooler V3 (166,9), motoboy y (170,9), drone u (171,5); vão sobre o Tietê (174..176) com
 *           drone-plataforma vertical M1 (174,6); 4º ônibus R (180..185) com 4º pichador z (183,6) e ?W (182..183,4);
 *           parede de barreiras B (190, linhas 7..9), patinete p (195,9), motoboy y (198,9), drone u (200,6) e
 *           vão final sobre o Tietê (202..205) com m3 (202,9) e d4 (203,6).
 *  ATO 4 · DESEMBARQUE NA TRANSPORTADORA (208–239) — 100% pacífico
 *  208-239  Checkpoint K5 (208,9), cooler V4 (214,9), placas s, radar r, postes l, cones n, moedas de comemoração
 *           e Desembarque VIP 5 Estrelas A (233,9) diante da parede final R (239).
 */
export const LEVEL5_LEGEND: Record<string, string> = {
  '.': 'vazio', '=': 'asfalto da Marginal', '#': 'concreto do viaduto', 'R': 'carroceria de ônibus/furgão',
  '^': 'cavalete eletrificado', '~': 'água do Rio Tietê',
  'B': 'barreira da CET', '?': 'caixa com moeda', 'W': 'caixa com gota', '-': 'passarela one-way',
  'P': 'spawn no teto do Uber', 'K': 'checkpoint', 'c': 'moeda',
  'y': 'motoboy do grau', 'u': 'drone de delivery', 'p': 'Faria Limer de patinete', 'z': 'pichador do viaduto',
  'V': 'cooler térmico 5★', 'm': 'drone-plataforma H', 'M': 'drone-plataforma V',
  'd': 'viga bamba', 'A': 'Desembarque VIP 5 Estrelas',
  'b': 'frente de ônibus', 'w': 'rodas de ônibus', 's': 'placa da Marginal',
  'r': 'radar de velocidade', 'l': 'poste de luz', 'n': 'cone da CET',
};

export const LEVEL5_MOVERS: Record<string, { range: number; speed: number }> = {
  '94,9': { range: 3, speed: 34 },
  '155,9': { range: 3, speed: 34 },
  '174,6': { range: 3, speed: 30 },
  '202,9': { range: 2, speed: 30 },
};

export const LEVEL5_ROWS: string[] = [
  '...............................................................................................................................................................................................................................................R',
  '...................................................................................................................................?W..........................................................................................................R',
  '..................................................................................................................................ccccc........................................................................................................R',
  '..................................................................................................................................-----........................................................................................................R',
  '............................?W......................B?......................?W.........................?W.........................cczcc...............................................?W.......................................................R',
  '...........................................................................................u....................................---------..................................u...cc..........................................cccc................R',
  '...............ccc...u....ccccc.....................ccc.u......ccc.........ccczcc........cccc..dc....ccczcc.....cccu..........ccccccccccccu.........ccc.....dc..........ccc...M.....ccczcc..........ccc.u..dc..............----................R',
  '..........ccc.-----.......RRRRRR...................-----......-----........RRRRRR........----........RRRRRR....-----......ccc--------------...BB...-----...............-----........RRRRRR....B....-----..................cccccc...............R',
  '........................--RRRRRR....cc...........--.........--..........c--RRRRRR......--......ccc.--RRRRRR..--...........---.................BB.--.........ccc..--...............--RRRRRR....B..--........cc.--.........--------..............R',
  '.....P....B?B....p........RRRRRR.........V....K......p........ccycc...dc...RRRRRR...K.V...y...m......RRRRRR....y..p.....K.......y.....p.......BB....y...p..m........K.V...y.........RRRRRR....B?B..p..y...m.....K.....V..cccccccccc......A.....R',
  '..l...s..n....l.r..n......w..w..b......l...s....n..l...r..n..l.s...n.......w..w..b...l..r............w..w..b..l.r...n.s...l....l...r...n...s......l...r..n.......l......s...n.......w..w..b.......l..r..n.........l.n...s...r.l..n..n.l.........',
  '====================================..================================...=====================.....========================================================.....==============...=========================....==================================',
  '####################################~~################################~~~#####################~~~~~########################################################.....##############~~~#########################~~~~##################################',
  '####################################~~################################~~~#####################~~~~~########################################################^^^^^##############~~~#########################~~~~##################################',
];
