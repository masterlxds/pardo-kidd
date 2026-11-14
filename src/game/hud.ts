import type { World } from '../core/types';
import { VIEW_H, VIEW_W } from '../core/constants';
import { PALETTE as P } from '../gfx/palette';
import { drawText, textWidth } from '../gfx/font';

const pad6 = (n: number): string => String(Math.max(0, Math.floor(n))).padStart(6, '0');
const blink = (t: number, period = 0.5): boolean => Math.floor(t / period) % 2 === 0;

/** Desenha sprite do atlas com escala inteira. */
function spr(ctx: CanvasRenderingContext2D, world: World, name: string, frame: number,
  x: number, y: number, s = 1, flip = false): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  world.sprites.draw(ctx, name, frame, 0, 0, flip);
  ctx.restore();
}

function veil(ctx: CanvasRenderingContext2D, alpha: number, rgb = '26,20,35'): void {
  ctx.fillStyle = `rgba(${rgb},${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** HUD em jogo: vidas, hidratação (gotas), moedas, pontuação. */
export function drawHud(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  ctx.fillStyle = 'rgba(26,20,35,0.6)';
  ctx.fillRect(0, 0, VIEW_W, 12);
  ctx.fillStyle = P.K;
  ctx.fillRect(0, 12, VIEW_W, 1);
  const o = { shadow: P.k };
  spr(ctx, world, 'icon_life', 0, 4, 2);
  drawText(ctx, `×${st.lives}`, 14, 3, { ...o, color: P.w });
  for (let i = 0; i < st.maxHydration; i++) {
    spr(ctx, world, 'icon_drop', i < st.hydration ? 0 : 1, 44 + i * 9, 2);
  }
  spr(ctx, world, 'icon_coin', 0, 84, 2);
  drawText(ctx, `×${String(st.coins).padStart(2, '0')}`, 94, 3, { ...o, color: P.a });
  drawText(ctx, pad6(st.score), VIEW_W - 4, 3, { ...o, color: P.w, align: 'right' });
}

/** Tela de título (capa de cartucho 8-bit sobre papel quadriculado). */
export function drawTitle(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.state.sceneTime;
  // fundo e moldura
  ctx.fillStyle = P.B;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = P.k;
  ctx.fillRect(3, 2, 314, 177);
  ctx.fillStyle = P.W;
  ctx.fillRect(4, 3, 312, 175);
  // grade azul-clara fina
  ctx.fillStyle = 'rgba(159,224,255,0.75)';
  for (let x = 4 + 8; x < 316; x += 8) ctx.fillRect(x, 3, 1, 175);
  for (let y = 3 + 8; y < 178; y += 8) ctx.fillRect(4, y, 312, 1);
  ctx.fillStyle = P.B;
  ctx.fillRect(4, 3, 312, 1);
  ctx.fillRect(4, 177, 312, 1);

  // título
  drawText(ctx, 'PARDO KIDD', 160, 9, { scale: 4, color: P.B, align: 'center', shadow: P.c });
  drawText(ctx, 'IN', 160, 40, { scale: 2, color: P.r, align: 'center', shadow: P.R });
  drawText(ctx, 'QUIXADÁ WORLD', 160, 57, { scale: 3, color: P.r, align: 'center', shadow: P.R });

  // chão
  ctx.fillStyle = P.o;
  ctx.fillRect(4, 142, 312, 3);
  ctx.fillStyle = P.O;
  ctx.fillRect(4, 145, 312, 1);

  // cena: Pardo socando o cacto
  const feet = 142;
  spr(ctx, world, 'pardo_punch', 0, 60, feet - 48, 2);
  const jab = Math.round(Math.sin(t * 8) * 2);
  spr(ctx, world, 'fist', 0, 100 + jab, feet - 30, 2);
  spr(ctx, world, 'impact', Math.floor(t * 6) % 2, 122 + jab, feet - 42, 2);
  spr(ctx, world, 'cactus_water', Math.floor(t * 2) % 2 === 0 ? 0 : 0, 158, feet - 64, 2);
  // gotas caindo do cacto
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.9 + i * 0.27) % 1;
    const dx = 164 + i * 11 + (i % 2) * 4;
    spr(ctx, world, 'drop', Math.floor(t * 4 + i) % 2, dx, feet - 56 + ph * 52, 2);
  }
  spr(ctx, world, 'mug', Math.floor(t * 2) % 2, 236, feet - 28, 2);

  // textos
  drawText(ctx, 'FASE 1 - TRILHA DOS MONÓLITOS', 160, 149, { color: P.B, align: 'center' });
  if (blink(t)) drawText(ctx, 'PRESSIONE ENTER OU TOQUE', 160, 159, { color: P.r, align: 'center', shadow: P.R });
  drawText(ctx, 'SETAS/WASD MOVER  ESPAÇO/Z SOCAR', 160, 168, { color: P.G, align: 'center' });

  // atalho de teste (discreto, canto inferior esquerdo)
  if (new URLSearchParams(location.search).get('fase') === '2') {
    drawText(ctx, 'MODO TESTE:', 5, 149, { color: P.G });
    drawText(ctx, 'FASE 2', 5, 157, { color: P.G });
  }
}

export function drawPaused(ctx: CanvasRenderingContext2D, _world: World): void {
  veil(ctx, 0.6);
  drawText(ctx, 'PAUSA', 160, 74, { scale: 3, color: P.y, align: 'center', shadow: P.k });
  drawText(ctx, 'P OU ESC PARA CONTINUAR', 160, 104, { color: P.w, align: 'center', shadow: P.k });
}

export function drawGameOver(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.state.sceneTime;
  veil(ctx, Math.min(0.78, t * 1.5));
  drawText(ctx, 'FIM DE JOGO', 160, 56, { scale: 3, color: P.r, align: 'center', shadow: P.k });
  drawText(ctx, 'PONTOS', 160, 92, { color: P.W, align: 'center', shadow: P.k });
  drawText(ctx, pad6(world.state.score), 160, 103, { scale: 2, color: P.w, align: 'center', shadow: P.k });
  if (t > 0.6 && blink(t)) {
    drawText(ctx, 'ENTER OU TOQUE PARA TENTAR DE NOVO', 160, 136, { color: P.y, align: 'center', shadow: P.k });
  }
}

/** Quebra o nome da fase em até 2 linhas, por palavras, cabendo em maxW. */
function wrapWords(text: string, scale: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const cand = cur ? `${cur} ${word}` : word;
    if (!cur || textWidth(cand, scale) <= maxW) cur = cand;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Maior escala (3 em 1 linha, depois 2 em até 2 linhas) que caiba. */
function layoutName(text: string, maxW: number): { scale: number; lines: string[] } {
  const one = wrapWords(text, 3, maxW);
  if (one.length === 1) return { scale: 3, lines: one };
  const two = wrapWords(text, 2, maxW);
  return { scale: 2, lines: two };
}

/** Cartão de abertura de fase ("FASE N" + nome) sobre véu escuro. */
export function drawIntro(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const t = st.sceneTime;
  const amazon = world.level.theme === 'amazonia';

  // cores por tema
  const veilRgb = amazon ? '10,26,12' : '26,20,35';
  const panelBg = amazon ? '#d4efb8' : P.p;
  const grid = amazon ? 'rgba(47,107,30,0.3)' : 'rgba(201,120,46,0.35)';
  const border = amazon ? P.d : P.T;
  const titleCol = amazon ? P.d : P.t;
  const titleSh = amazon ? P.j : P.T;
  const nameCol = amazon ? P.E : P.r;
  const nameSh = amazon ? P.J : P.R;
  const divider = amazon ? P.I : P.O;

  // entrada: desliza de cima nos primeiros 0.4s; véu surge junto
  const ease = Math.min(1, t / 0.4);
  const eased = 1 - (1 - ease) * (1 - ease) * (1 - ease);
  const slide = Math.round((1 - eased) * -60);
  veil(ctx, 0.72 * Math.min(1, t / 0.3), veilRgb);

  ctx.save();
  ctx.translate(0, slide);

  const px = 24, py = 20, pw = 272, ph = 140;
  ctx.fillStyle = P.k;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = panelBg;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = grid;
  for (let x = px + 8; x < px + pw; x += 8) ctx.fillRect(x, py, 1, ph);
  for (let y = py + 8; y < py + ph; y += 8) ctx.fillRect(px, y, pw, 1);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  // "FASE N" e nome da fase
  const cx = 160;
  drawText(ctx, `FASE ${world.level.index + 1}`, cx, py + 12, {
    scale: 2, color: titleCol, align: 'center', shadow: titleSh,
  });
  const name = layoutName(world.level.name, pw - 32);
  name.lines.forEach((line, i) => {
    const y = py + 34 + i * (8 * name.scale + 2);
    drawText(ctx, line, cx, y, { scale: name.scale, color: nameCol, align: 'center', shadow: nameSh });
  });

  // divisor
  ctx.fillStyle = divider;
  ctx.fillRect(px + 16, py + 70, pw - 32, 1);

  // rodapé: Pardo animado + ícone de vida ×N, centralizados
  const lifeTxt = `×${st.lives}`;
  const groupW = 40 + 14 + 16 + 6 + textWidth(lifeTxt, 2);
  const gx = Math.round(cx - groupW / 2);
  const footY = py + 76;
  spr(ctx, world, 'pardo_idle', Math.floor(t * 2) % 2, gx, footY, 2);
  spr(ctx, world, 'icon_life', 0, gx + 40 + 14, footY + 16, 2);
  drawText(ctx, lifeTxt, gx + 40 + 14 + 16 + 6, footY + 17, { scale: 2, color: P.k, shadow: P.W });

  ctx.restore();
}

/** "FASE N CONCLUÍDA" com pontuação, bônus de tempo e "jogar novamente". */
export function drawWin(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const t = st.sceneTime;
  const phase2 = world.level.index === 1;
  veil(ctx, Math.min(0.55, t * 1.5));
  const ease = Math.min(1, t / 0.5);
  const slide = Math.round((1 - ease * (2 - ease)) * -170);
  ctx.save();
  ctx.translate(0, slide);
  const px = 28, py = 12, pw = 264, ph = 156;
  const bg = phase2 ? '#d4efb8' : P.W;
  const grid = phase2 ? 'rgba(47,107,30,0.3)' : 'rgba(159,224,255,0.75)';
  const edge = phase2 ? P.d : P.B;
  const ink = phase2 ? P.d : P.B;
  ctx.fillStyle = P.k;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = bg;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = grid;
  for (let x = px + 8; x < px + pw; x += 8) ctx.fillRect(x, py, 1, ph);
  for (let y = py + 8; y < py + ph; y += 8) ctx.fillRect(px, y, pw, 1);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  if (phase2) {
    drawText(ctx, 'FASE 2', 160, py + 8, { scale: 2, color: P.d, align: 'center', shadow: P.j });
  } else {
    drawText(ctx, 'FASE 1', 160, py + 8, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  }
  drawText(ctx, 'CONCLUÍDA!', 160, py + 27, { scale: 3, color: P.r, align: 'center', shadow: P.R });

  if (phase2) {
    // Pardo bebendo, alien (virado para o Pardo) segurando a mamadeira no meio
    spr(ctx, world, 'pardo_drink_bottle', Math.floor(t * 3) % 2, px + 6, py + 50, 2);
    spr(ctx, world, 'bottle', Math.floor(t * 4) % 2, px + 72, py + 62, 2);
    spr(ctx, world, 'alien', Math.floor(t * 2) % 2, px + 84, py + 50, 2, true);
  } else {
    spr(ctx, world, 'pardo_drink', Math.floor(t * 3) % 2, px + 16, py + 54, 2);
    spr(ctx, world, 'mug', 0, px + 58, py + 76, 2);
  }

  const k = Math.max(0, Math.min(1, (t - 0.6) / 1.2));
  const cnt = (v: number): number => Math.floor(v * k);
  // na Fase 2 os rótulos ficam mais à direita para caber o alien à esquerda
  const lx = phase2 ? px + 128 : px + 100, rx = px + pw - 12;
  const row = (label: string, value: string, y: number, col: string): void => {
    drawText(ctx, label, lx, y, { color: ink });
    drawText(ctx, value, rx, y, { color: col, align: 'right', shadow: P.W });
  };
  row('PONTOS', pad6(cnt(st.score)), py + 56, P.k);
  row('MOEDAS', `×${String(cnt(st.coins)).padStart(2, '0')}`, py + 68, P.Y);
  row('BÔNUS DE TEMPO', `+${cnt(st.timeBonus)}`, py + 80, P.R);

  if (phase2) {
    drawText(ctx, 'PARDO SE HIDRATOU', 160, py + 104, { color: P.d, align: 'center' });
    drawText(ctx, 'MAMANDO O ÍNDIO', 160, py + 114, { color: P.d, align: 'center' });
  } else {
    drawText(ctx, 'O PARDO MATOU A SEDE', 160, py + 104, { color: P.N, align: 'center' });
    drawText(ctx, 'NA CAPELA DO HORIZONTE.', 160, py + 114, { color: P.N, align: 'center' });
  }
  if (t > 2 && blink(t)) {
    const msg = phase2 ? 'ENTER OU TOQUE PARA JOGAR NOVAMENTE' : 'ENTER OU TOQUE PARA A FASE 2';
    drawText(ctx, msg, 160, py + 138, { color: P.r, align: 'center' });
  }
  ctx.restore();
}
