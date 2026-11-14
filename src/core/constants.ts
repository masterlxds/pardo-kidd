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
