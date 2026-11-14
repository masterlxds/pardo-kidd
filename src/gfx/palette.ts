/**
 * Paleta única do jogo (estética Master System + sertão). CONTRATO: 1 caractere = 1 cor.
 * '.' = transparente. Arquivo sem imports (também é lido por scripts/check-art.mjs).
 */
export const PALETTE: Record<string, string> = {
  k: '#1a1423', // preto-contorno
  K: '#3b3340', // cinza muito escuro
  w: '#ffffff', // branco
  W: '#d8d4c8', // osso / branco sujo
  g: '#8a8f98', // cinza
  G: '#5a5f6a', // cinza escuro
  s: '#f2b98a', // pele
  S: '#c98a5e', // pele sombra
  h: '#3a2418', // cabelo escuro
  H: '#5e3d28', // cabelo brilho
  y: '#ffd23f', // amarelo (camiseta, sol)
  Y: '#d99a1c', // amarelo sombra
  b: '#3b6fd6', // jeans
  B: '#24418f', // jeans sombra / azul-marinho
  c: '#9fe0ff', // água clara
  C: '#2f9be0', // água
  o: '#e8a04a', // ocre
  O: '#c9782e', // ocre escuro
  t: '#b5532a', // terracota
  T: '#7a3418', // terracota escura
  n: '#8a5a34', // madeira
  N: '#5a371e', // madeira escura
  e: '#6fbf3a', // verde cacto
  E: '#3d8a2a', // verde escuro
  d: '#2a5e22', // verde profundo
  r: '#e23b3b', // vermelho
  R: '#9e1f2e', // vermelho escuro
  p: '#f7e6b0', // areia clara
  P: '#e8c97a', // areia
  m: '#ff8a2a', // laranja vivo
  a: '#fff3a0', // amarelo pálido (brilho)
  v: '#c7a27a', // rocha clara
  l: '#a8744a', // rocha média
  L: '#6e4a30', // rocha escura
  // ── extensão para arte em alta resolução
  i: '#ffd9b5', // pele brilho
  u: '#a56a48', // pele sombra profunda
  x: '#24160f', // cabelo sombra profunda
  z: '#7a5236', // cabelo reflexo claro
  M: '#2b2733', // máscara: tom médio (entre k e K)
  q: '#aab4c2', // aço claro
  Q: '#e6edf5', // aço brilho
  f: '#fff7d6', // amarelo quase branco
  D: '#16264f', // azul-marinho profundo
  j: '#8fd45a', // verde claro (brilho de cacto)
  A: '#ffb86b', // laranja claro
  V: '#f08a8a', // vermelho claro / rosado
};
