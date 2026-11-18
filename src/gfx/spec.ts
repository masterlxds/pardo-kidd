/**
 * Especificação de TODOS os sprites do atlas: nome → [largura, altura, nº de frames]. CONTRATO.
 * Sprites olham para a DIREITA. Arquivo sem imports (também é lido por scripts/check-art.mjs).
 */
export const SPRITE_SPEC = {
  // ── Pardo (art/characters.ts) — quadro 20x24, corpo centralizado, pés na última linha.
  //    Hitbox de jogo = 10x20 centralizada na base do quadro.
  pardo_idle: [20, 24, 2],
  pardo_run: [20, 24, 4],
  pardo_jump: [20, 24, 1],
  pardo_fall: [20, 24, 1],
  /** pose de soco: tronco inclinado, braço da frente estendido até a borda direita (o punho gigante é o sprite `fist`, desenhado à parte) */
  pardo_punch: [20, 24, 1],
  pardo_hurt: [20, 24, 1],
  pardo_dead: [20, 24, 1],
  /** vitória: bebendo da caneca (2 frames) */
  pardo_drink: [20, 24, 2],
  /** punho gigante do "Soco da Caatinga" */
  fist: [12, 10, 1],

  // ── Inimigos (art/characters.ts) — pés/base na última linha
  calango: [20, 12, 2],
  carcara: [24, 16, 2],
  carcara_dive: [24, 16, 1],
  /** 0 = parada, 1 = agachada (carregando o salto) */
  palma: [16, 20, 2],
  tatu: [18, 12, 2],
  tatu_ball: [12, 12, 2],

  // ── Tiles 16x16 (art/world.ts)
  tile_ground_top: [16, 16, 2],
  tile_ground: [16, 16, 2],
  tile_rock: [16, 16, 2],
  tile_spike: [16, 16, 1],
  tile_block: [16, 16, 1],
  tile_block_item: [16, 16, 1],
  /** só os ~6px de cima são desenhados (tábua/laje); resto transparente */
  tile_oneway: [16, 16, 1],

  // ── Itens e objetos interativos (art/world.ts)
  coin: [8, 8, 4],
  drop: [8, 10, 2],
  /** caneca esmaltada branca de borda azul, com água (objetivo) */
  mug: [16, 14, 2],
  /** palma/cacto frutífero: 0 = cheio (frutos vermelhos), 1 = seco (já socado) */
  cactus_water: [24, 32, 2],
  platform_rock: [32, 10, 1],
  /** 0 = intacta, 1 = rachando */
  platform_crumble: [32, 10, 2],

  // ── Decoração de mundo (art/world.ts) — base na última linha
  sign: [16, 16, 1],
  skull: [16, 10, 1],
  fence: [32, 16, 1],
  deadtree: [32, 40, 1],
  chapel: [64, 56, 1],
  pedestal: [16, 16, 1],
  bush: [16, 8, 1],
  pebbles: [8, 6, 1],
  mandacaru: [16, 32, 1],

  // ── Efeitos (art/world.ts)
  impact: [16, 16, 2],
  dust: [8, 8, 3],
  debris: [6, 6, 2],
  splash: [8, 8, 2],

  // ── Ícones de HUD (art/world.ts)
  /** 0 = gota cheia, 1 = gota vazia */
  icon_drop: [8, 8, 2],
  /** rosto do Pardo (cabelo cacheado, óculos, máscara) */
  icon_life: [8, 8, 1],
  icon_coin: [8, 8, 1],

  // ════════ FASE 2 — AMAZÔNIA ════════
  // ── Pardo bebendo da mamadeira (art/enemies2.ts) — mesmo quadro 20x24 do Pardo
  pardo_drink_bottle: [20, 24, 2],

  // ── Inimigos (art/enemies2.ts) — base na última linha, olham para a DIREITA
  /** onça-pintada andando (2 frames) */
  onca: [32, 16, 2],
  /** agachada preparando o bote (também usada atordoada) */
  onca_crouch: [32, 16, 1],
  /** no ar, corpo esticado, patas à frente */
  onca_pounce: [32, 16, 1],
  /** jacaré: 0 = boca fechada, 1 = boca aberta (mandíbula superior levantada) */
  jacare: [40, 16, 2],
  /** cobra enrolada, cabeça erguida (2 frames balançando) */
  cobra: [16, 14, 2],
  /** cobra esticada no bote para a direita */
  cobra_strike: [28, 14, 1],
  /** tucano voando (2 frames de asa) */
  tucano: [24, 16, 2],
  /** tucano no rasante: asas recolhidas para trás, corpo inclinado, bico apontando para frente-baixo */
  tucano_dive: [24, 16, 1],
  /** fruto (açaí/castanha) solto pelo tucano, 2 frames girando */
  fruit: [6, 6, 2],
  /** alien verde de chapéu de explorador, camiseta amarela, calça azul (arte conceitual) — 2 frames parado */
  alien: [20, 24, 2],
  /** alien estendendo a mamadeira com o braço à frente */
  alien_give: [24, 24, 1],
  /** a "mamadeira do índio": mamadeira com bico, cheia de água (frame 1 = brilho) */
  bottle: [8, 12, 2],

  // ── Tiles da Amazônia 16x16 (art/amazon.ts) — 2 variações onde indicado
  /** grama verde viva sobre terra vermelha, tufos/cipós pendendo da borda */
  tile_jg_top: [16, 16, 2],
  /** terra vermelha com pedrinhas */
  tile_jg_ground: [16, 16, 2],
  /** pedra cinza com musgo — indestrutível */
  tile_jg_rock: [16, 16, 2],
  /** espinheiro (tucum) — perigo */
  tile_jg_spike: [16, 16, 1],
  /** bloco de pedra marrom rachada (como na arte) */
  tile_jg_block: [16, 16, 1],
  /** bloco rachado com estrela dourada no centro (guarda item) */
  tile_jg_block_item: [16, 16, 1],
  /** galho grosso horizontal com folhas (one-way, ~6px de cima) */
  tile_jg_oneway: [16, 16, 1],
  /** superfície do rio (topo com ondinhas/brilho), 4 frames de animação */
  tile_water_top: [16, 16, 4],
  /** água funda, 2 frames */
  tile_water: [16, 16, 2],

  // ── Objetos da Amazônia (art/amazon.ts)
  /** tronco flutuante (plataforma móvel) */
  platform_log: [32, 10, 1],
  /** vitória-régia: 0 = inteira, 1 = afundando (plataforma que desmorona) */
  platform_lily: [32, 10, 2],
  /** cipó-d'água pendurado/enrolado num tronco: 0 = cheio (gotas), 1 = seco (já socado) */
  vine_water: [16, 32, 2],

  // ── Decoração da Amazônia (art/amazon.ts) — base na última linha
  /** oca indígena de palha, porta escura no centro */
  oca: [80, 56, 1],
  heliconia: [16, 24, 1],
  fern: [16, 12, 1],
  /** cerca de taquara/bambu */
  bamboo_fence: [32, 16, 1],
  canoe: [40, 10, 1],
  /** totem de madeira entalhado e pintado */
  totem: [16, 32, 1],
  /** placa de madeira com seta e folhas */
  jsign: [16, 16, 1],

  // ════════ FASE 3 — BAHIA WORLD (subaquática) ════════
  // ── Pardo mergulhador (art/pardoSwim.ts) — mesmo Pardo de art/pardo.ts + SNORKEL (tubo laranja/azul
  //    subindo ao lado da cabeça, bocal sob a máscara preta). Quadro 20x24, hitbox 10x20 na base.
  /** flutuando/afundando devagar: corpo ereto, braços abertos, pernas soltas (2 frames) */
  pardo_swim_idle: [20, 24, 2],
  /** braçada (estilo Mario nadando): 3 frames — braços à frente, puxando, pernas batendo */
  pardo_swim: [20, 24, 3],
  /** soco subaquático: como pardo_punch (o punho gigante `fist` é desenhado à parte) */
  pardo_swim_punch: [20, 24, 1],
  pardo_swim_hurt: [20, 24, 1],
  /** afogado/derrotado: olhos em X, corpo mole */
  pardo_swim_dead: [20, 24, 1],
  /**
   * CLÍMAX: Pardo em pé segurando o Cajado Jailnesco com as duas mãos, máscara preta ABAIXADA no queixo,
   * língua para fora lambendo o cajado, expressão de determinação. Corpo do Pardo nas colunas 0-19
   * (alinhado à base, como o quadro 20x24); cajado vertical nas colunas ~17-23 ocupando a altura toda.
   * Frame 0 = língua encostando embaixo; frame 1 = língua mais acima (lambida).
   */
  pardo_lick: [24, 32, 2],

  // ── Jandira e o Cajado (art/jandira.ts) — arte conceitual em "level 3/"
  /**
   * Jandira sentada numa pedra cinza (pedra incluída no sprite, base na última linha), FIEL à "OPÇÃO 2"
   * da arte conceitual: rosto em 3/4, cabelo ruivo longo e ondulado caindo volumoso de um lado, cropped rosa
   * "Barbie", cauda turquesa→azul enrolada na frente da pedra com a nadadeira clara aberta, uma mão apoiada
   * na pedra, fitinhas do Bonfim nos pulsos. Autorado ESPELHADO em relação à arte (olhando para a DIREITA,
   * nadadeira à esquerda): o jogo desenha com flipX. 2 frames (cabelo/nadadeira balançando).
   */
  jandira: [48, 56, 2],
  /** mesma pose, o braço do lado de fora erguido acenando (fitinhas balançando) — 2 frames */
  jandira_wave: [48, 56, 2],
  /** rindo (olhos fechados, boca aberta) e acenando — 2 frames */
  jandira_laugh: [48, 56, 2],
  /** retrato do rosto para a caixa de diálogo */
  jandira_face: [16, 16, 1],
  /** Cajado Jailnesco: bastão de madeira retorcida, conchas, algas brilhantes, fitinhas na ponta. 0 = normal, 1 = brilhando */
  cajado: [8, 28, 2],

  // ── Fauna (art/sea.ts) — olham para a DIREITA; contorno preto, paleta vibrante
  /** água-viva roxa/lilás translúcida: domo em cima, tentáculos embaixo (2 frames pulsando) */
  agua_viva: [16, 20, 2],
  /** peixe-agulha prateado/azulado, focinho pontudo (2 frames) */
  peixe_agulha: [24, 8, 2],
  /** baiacu-bomba murcho, amarelo-alaranjado (2 frames nadando) */
  baiacu: [14, 12, 2],
  /** baiacu inflado, redondo, cheio de espinhos (2 frames) */
  baiacu_puff: [20, 20, 2],
  /** baiacu-dentão: peixe azul-esverdeado musculoso, dorsal laranja, boca fechada com dentes à mostra (2 frames) */
  dentao: [24, 18, 2],
  /** dentão na investida: bocarra aberta cheia de dentes */
  dentao_dash: [24, 18, 1],
  /** siri vermelho-alaranjado, garras abertas para os lados (2 frames andando) */
  siri: [24, 14, 2],
  /** siri em guarda: garras fechadas na frente do corpo */
  siri_guard: [24, 14, 1],
  /** tartaruga-de-couro: casco verde-escuro texturizado, nadadeiras fortes (2 frames nadando) */
  tartaruga: [32, 18, 2],
  /** só o casco (cabeça recolhida), 2 frames girando */
  tartaruga_shell: [20, 14, 2],
  /**
   * moreia verde-musgo/amarela esticada para a DIREITA: cabeça à direita, corpo saindo da borda esquerda
   * (o código recorta pela esquerda para ela "sair" da toca). 0 = boca fechada, 1 = boca aberta.
   */
  moreia: [32, 14, 2],
  /** toca da moreia: fenda escura numa pedra, dois olhos brilhantes dentro */
  moreia_hole: [16, 16, 1],
  /** estrelinhas/bolhas girando sobre a cabeça de inimigo atordoado (2 frames) */
  stun_stars: [16, 8, 2],
  /** peixe-dourado neutro: laranja com listras amarelas (2 frames) */
  peixe_dourado: [10, 8, 2],

  // ── Tiles do fundo do mar 16x16 (art/bahia.ts)
  /** areia dourada texturizada (topo), conchinhas */
  tile_bh_top: [16, 16, 2],
  /** areia compactada/sedimento */
  tile_bh_ground: [16, 16, 2],
  /** rocha escura com musgo verde — indestrutível */
  tile_bh_rock: [16, 16, 2],
  /** ouriço-do-mar preto/roxo — perigo */
  tile_bh_spike: [16, 16, 1],
  /** bloco de ruína/coral rachado (quebrável com soco) */
  tile_bh_block: [16, 16, 1],
  /** bloco rachado com concha dourada (guarda item) */
  tile_bh_block_item: [16, 16, 1],
  /** plataforma de coral rosado (one-way, ~6px de cima) */
  tile_bh_oneway: [16, 16, 1],

  // ── Objetos do fundo do mar (art/bahia.ts)
  /** fissura de bolhas no chão (base na última linha): 0 = quieta, 1 = soltando bolha */
  air_vent: [16, 8, 2],
  /** bolha grande de ar (2 frames oscilando) */
  air_bubble: [16, 16, 2],
  /** partícula: bolhinha (2 tamanhos) */
  bubble: [6, 6, 2],
  /** partícula: brilho dourado (0) / turquesa (1) */
  sparkle: [8, 8, 2],
  /** fitinha do Bonfim colecionável, tremulando (2 frames; cores verde/amarelo/azul/vermelho/branco) */
  ribbon: [8, 12, 2],
  /** altar de pedra com conchas onde fica o cajado */
  altar: [32, 16, 1],
  /** 0 = bolha cheia, 1 = bolha vazia (contorno) */
  icon_bubble: [8, 8, 2],
  /** 0 = coração vermelho cheio, 1 = vazio */
  icon_heart: [8, 8, 2],
  icon_ribbon: [8, 8, 1],

  // ── Decoração do fundo do mar (art/bahia.ts) — base na última linha
  coral_pink: [16, 16, 1],
  /** coral-leque/gorgônia vermelho-coral */
  coral_fan: [16, 24, 1],
  seaweed: [16, 32, 1],
  anchor: [16, 16, 1],
  /** coluna de ruína submersa com musgo */
  ruin_column: [16, 48, 1],
  /** arco de ruína (passa-se por baixo) */
  ruin_arch: [48, 48, 1],
  shell: [8, 6, 1],
  /** placa de madeira submersa com seta */
  bsign: [16, 16, 1],
  /** pedra com fitinhas do Bonfim amarradas */
  bonfim_rock: [16, 16, 1],
  amphora: [16, 16, 1],

  // ════════ FASE 4 — FAVELA DO RIO & TRIBUNAL ════════
  // ── Amaro e Água Mineral (art/amaro.ts) — referência em "level-4-refs/amaro.jpg"
  /** Pardo bebendo a garrafa de água mineral (máscara preta abaixada no queixo, garrafa azul-cristalina) */
  pardo_drink_mineral: [20, 24, 2],
  /**
   * Amaro (faxineiro do tribunal, uniforme azul-petróleo com crachá, calça cinza-escura, cabelo curto com franja
   * na testa e pele parda fiel a level-4-refs/amaro.jpg) varrendo o chão com vassoura de piaçava (4 frames).
   * Autorado olhando para a DIREITA (desenhado com flipX = true no jogo). Pés/vassoura na última linha.
   */
  amaro_sweep: [28, 26, 4],
  /** Amaro apoiando a vassoura e estendendo a garrafa de água mineral com a outra mão (2 frames) */
  amaro_give: [28, 26, 2],
  /** Amaro apoiado na vassoura sorrindo/comemorando na vitória (2 frames) */
  amaro_cheer: [28, 26, 2],
  /** Retrato 16x16 do rosto do Amaro para a caixa de diálogo da HUD */
  amaro_face: [16, 16, 1],
  /** Garrafa de água mineral gelada e cristalina (frame 1 = brilho/gotículas) */
  mineral_bottle: [8, 14, 2],

  // ── Inimigos Cariocas (art/enemies4.ts) — base na última linha, olham para a DIREITA
  /** vira-lata caramelo andando (2 frames) */
  caramelo: [24, 16, 2],
  /** vira-lata caramelo latindo / no bote rasante */
  caramelo_bark: [24, 16, 1],
  /** pombo urbano cinza-azulado de óculos juliet voando (2 frames) */
  pombo: [24, 16, 2],
  /** pombo preparando o bombardeio */
  pombo_dive: [24, 16, 1],
  /** projétil solto pelo pombo (2 frames) */
  dropping: [6, 6, 2],
  /** gato de rua malhado normal (2 frames) */
  gato: [22, 16, 2],
  /** gato eriçado em curto-circuito com faíscas elétricas azuis/amarelas (2 frames) */
  gato_shock: [22, 16, 2],
  /** capivara-do-valão parruda andando (2 frames) */
  capivara: [32, 18, 2],
  /** capivara na investida/cabeçada */
  capivara_charge: [32, 18, 1],
  /** traficante com camisa listrada rubro-negra (vermelha e preta) e bermuda, segurando arma (2 frames) */
  traficante: [22, 24, 2],
  /** traficante apontando a arma na horizontal: 0 = mirando (aviso), 1 = disparo com clarão de fogo no cano */
  traficante_aim: [24, 24, 2],
  /** projétil de tiro (bala indestrutível): 2 frames */
  bullet: [6, 4, 2],

  // ── Tiles do Rio 16x16 (art/rio.ts)
  /** laje/calçada de concreto cinza sobre topo de tijolo */
  tile_rj_top: [16, 16, 2],
  /** alvenaria de tijolo em tom ardósia frio/escuro (contraste contra o casario do fundo) */
  tile_rj_ground: [16, 16, 2],
  /** concreto armado / pedra carioca com grafite/musgo — indestrutível */
  tile_rj_rock: [16, 16, 2],
  /** muro com cacos de vidro coloridos fincados — perigo letal */
  tile_rj_spike: [16, 16, 1],
  /** mureta de bloco de concreto rachado, cinza-claro (quebrável com soco) */
  tile_rj_block: [16, 16, 1],
  /** bloco de tijolo caiado com estrela/sol dourado (guarda item) */
  tile_rj_block_item: [16, 16, 1],
  /** telhado de telha de zinco ondulada (one-way, ~6px de cima) */
  tile_rj_oneway: [16, 16, 1],

  // ── Objetos Interativos do Rio (art/rio.ts)
  /** prancha de andaime / teleférico suspenso (plataforma móvel) */
  platform_scaffold: [32, 10, 1],
  /** telha de zinco bamba: 0 = inteira, 1 = amassando/cedendo */
  platform_zinc: [32, 10, 2],
  /** filtro de barro São João sobre suporte: 0 = cheio, 1 = seco (já socado) */
  clay_filter: [16, 32, 2],

  // ── Decoração do Morro e Tribunal (art/rio.ts) — base na última linha
  /** fachada neoclássica do Tribunal com colunas e balança da justiça */
  tribunal_facade: [80, 56, 1],
  /** caixa d'água azul de polietileno */
  water_tank: [32, 24, 1],
  /** poste de concreto com emaranhado de fios ("gato de luz") */
  utility_pole: [16, 48, 1],
  /** varal de roupas coloridas */
  clothesline: [32, 16, 1],
  /** paredão de caixas de som de baile */
  party_speaker: [24, 24, 1],
  /** balde amarelo de faxina com esfregão do Amaro */
  mop_bucket: [16, 16, 1],
  /** placa azul de rua do Rio com seta */
  rsign: [16, 16, 1],
} as const satisfies Record<string, readonly [number, number, number]>;

export type SpriteName = keyof typeof SPRITE_SPEC;
