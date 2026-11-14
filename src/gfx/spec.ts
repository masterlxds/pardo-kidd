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
} as const satisfies Record<string, readonly [number, number, number]>;

export type SpriteName = keyof typeof SPRITE_SPEC;
