/** Constantes globais — CONTRATO. Level design e IA dependem destes números. */
export const VIEW_W = 320;
export const VIEW_H = 180;
export const TILE = 16;
/**
 * Fator de render: o canvas tem VIEW_W*RENDER_SCALE × VIEW_H*RENDER_SCALE pixels reais e todo o
 * desenho acontece em unidades lógicas (320x180) sob ctx.scale(RENDER_SCALE). Sprites são
 * autorados em alta resolução (RENDER_SCALE× o tamanho lógico de spec.ts).
 */
export const RENDER_SCALE = 2;
/** Passo fixo de simulação (s). */
export const STEP = 1 / 60;

/**
 * Física do Pardo (px, s). O agente do core pode ajustar a sensação (aceleração,
 * atrito, coyote, buffer), mas o ENVELOPE de pulo é contrato para o level design:
 *   altura máxima do pulo ≈ 50px (3 tiles)  → desenhar degraus de no máx. 2 tiles (3 no limite)
 *   alcance horizontal em pulo cheio ≈ 72px → abismos de no máx. 3 tiles (4 no limite, só opcional)
 */
export const PHYS = {
  gravity: 900,
  maxFall: 360,
  jumpVel: 300,
  runMax: 110,
} as const;

/** Hitbox do Pardo (sprite é 20x24, hitbox centralizada na base). */
export const PLAYER_W = 10;
export const PLAYER_H = 20;

export const MAX_HYDRATION = 3;
export const START_LIVES = 3;
/** Vidas iniciais no modo fácil "Amaro"; também é o teto de vidas. */
export const EASY_LIVES = 99;
/** A cada COINS_PER_LIFE moedas: +1 vida e o contador de moedas zera. Moedas não se perdem ao morrer. */
export const COINS_PER_LIFE = 100;

// ── Fase 3 (subaquática) ──
/** Bolhas de oxigênio na HUD. */
export const MAX_AIR = 5;
/** Segundos que cada bolha de oxigênio dura. */
export const AIR_BUBBLE_TIME = 6;
/** Valor inicial da contagem regressiva exibida na última bolha (número = ceil(air * AIR_COUNTDOWN)). */
export const AIR_COUNTDOWN = 5;
/**
 * Envelope de nado (referência para level design e IA; o agente CORE afina a sensação em player.ts):
 * afunda devagar (~45px/s terminal), cada braçada dá ~-115px/s (sobe ~1.5 tile), velocidade horizontal
 * máx. ~80px/s com deslize. O Pardo alcança qualquer espaço aberto de 1 tile de largura x 2 de altura.
 */
export const SWIM = {
  gravity: 200,
  maxSink: 45,
  strokeVel: 115,
  maxRise: 130,
  swimMax: 80,
} as const;
/**
 * Teto do nado (px de mundo): a linha d'água. O Pardo não sobe acima disso, então as linhas 0-2 do
 * mapa subaquático ficam acima da superfície (só céu ou rocha que aflora).
 */
export const SWIM_CEILING = 48;
