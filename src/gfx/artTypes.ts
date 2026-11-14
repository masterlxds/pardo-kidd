/**
 * Um sprite = lista de frames; cada frame = array de `altura` strings de `largura` caracteres,
 * cada caractere uma chave de PALETTE ('.' = transparente).
 */
export type SpriteArt = Record<string, string[][]>;
