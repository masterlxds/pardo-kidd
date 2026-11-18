import type { World } from '../core/types';
import { AIR_COUNTDOWN, VIEW_H, VIEW_W } from '../core/constants';
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

/** HUD em jogo: vidas, hidratação (gotas/corações), moedas, pontuação (+ oxigênio e fitinhas na Fase 3). */
export function drawHud(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const uw = world.level.underwater;
  ctx.fillStyle = uw ? 'rgba(10,30,60,0.65)' : 'rgba(26,20,35,0.6)';
  ctx.fillRect(0, 0, VIEW_W, 12);
  ctx.fillStyle = P.K;
  ctx.fillRect(0, 12, VIEW_W, 1);
  const o = { shadow: P.k };
  spr(ctx, world, 'icon_life', 0, 4, 2);
  drawText(ctx, `×${st.lives}`, 14, 3, { ...o, color: P.w });
  if (!uw) {
    for (let i = 0; i < st.maxHydration; i++) {
      spr(ctx, world, 'icon_drop', i < st.hydration ? 0 : 1, 44 + i * 9, 2);
    }
    spr(ctx, world, 'icon_coin', 0, 84, 2);
    drawText(ctx, `×${String(st.coins).padStart(2, '0')}`, 94, 3, { ...o, color: P.a });
    drawText(ctx, pad6(st.score), VIEW_W - 4, 3, { ...o, color: P.w, align: 'right' });
  } else {
    let x = 35;
    for (let i = 0; i < st.maxHydration; i++) {
      spr(ctx, world, 'icon_heart', i < st.hydration ? 0 : 1, x + i * 9, 2);
    }
    x += st.maxHydration * 9 + 4;
    // bolhas de oxigênio
    const full = Math.ceil(Math.max(0, st.air));
    for (let i = 0; i < st.maxAir; i++) {
      const isFull = i < full;
      const last = i === full - 1;
      if (isFull && last && st.air <= 1 && !blink(world.state.sceneTime, 0.2)) continue;
      ctx.globalAlpha = isFull ? 1 : 0.3;
      spr(ctx, world, 'icon_bubble', 0, x + i * 9, 2);
      ctx.globalAlpha = 1;
    }
    x += st.maxAir * 9 + 4;
    spr(ctx, world, 'icon_coin', 0, x, 2);
    drawText(ctx, `×${String(st.coins).padStart(2, '0')}`, x + 10, 3, { ...o, color: P.a });
    x += 10 + textWidth('×00') + 6;
    spr(ctx, world, 'icon_ribbon', 0, x, 2);
    drawText(ctx, `${st.ribbons}/${st.ribbonsTotal}`, x + 10, 3, { ...o, color: P.c });
    drawText(ctx, pad6(st.score), VIEW_W - 4, 3, { ...o, color: P.w, align: 'right' });
    if (st.scene === 'playing') drawAirAlert(ctx, world);
  }
  if (st.dialogue) drawDialogue(ctx, world);
}

/** Contagem regressiva sobre o Pardo + vinheta vermelha pulsante (air <= 1). */
function drawAirAlert(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  if (st.air > 1 || st.air <= 0) return;
  const c = st.air * AIR_COUNTDOWN;
  const n = Math.ceil(c);
  const f = n - c; // 0..1 dentro de cada número
  // vinheta
  const a = 0.12 + 0.28 * (1 - f) * (1 - f);
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 70, VIEW_W / 2, VIEW_H / 2, 190);
  g.addColorStop(0, 'rgba(120,10,20,0)');
  g.addColorStop(1, `rgba(120,10,20,${a.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // número
  const pl = world.player;
  const sx = Math.round(pl.x + pl.w / 2 - world.camera.x);
  const sy = Math.round(pl.y - world.camera.y);
  const scale = f < 0.15 ? 3 : 2;
  const h = 8 * scale;
  const y = Math.max(16, sy - h - 6 - (scale === 3 ? 0 : 0));
  drawText(ctx, String(n), sx, y, { scale, color: P.r, align: 'center', shadow: P.k });
}

/** Caixa de diálogo inferior com retrato, nome e texto digitado. */
function drawDialogue(ctx: CanvasRenderingContext2D, world: World): void {
  const d = world.state.dialogue;
  if (!d) return;
  const px = 6, ph = 36, py = VIEW_H - ph - 3, pw = VIEW_W - 12;
  ctx.fillStyle = P.k;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = 'rgba(14,40,80,0.94)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = P.c;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  // retrato 2x
  ctx.fillStyle = P.B;
  ctx.fillRect(px + 3, py + 2, 32, 32);
  const face = d.speaker === 'AMARO' ? 'amaro_face' : 'jandira_face';
  spr(ctx, world, face, 0, px + 3, py + 2, 2);
  const tx = px + 40;
  drawText(ctx, d.speaker, tx, py + 3, { color: P.y, shadow: P.k });
  const shown = Math.min(d.text.length, Math.floor(d.t * 30));
  const lines = wrapWords(d.text, 1, pw - 46, 99);
  let left = shown;
  lines.slice(0, 3).forEach((line, i) => {
    if (left <= 0) return;
    drawText(ctx, line.slice(0, left), tx, py + 12 + i * 8, { color: P.w, shadow: P.k });
    left -= line.length + 1;
  });
  if (shown >= d.text.length && blink(d.t, 0.4)) {
    drawText(ctx, '♥', px + pw - 9, py + ph - 10, { color: P.c });
  }
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
    spr(ctx, world, 'drop', Math.floor(t * 4 + i) % 2, dx, feet - 56 + ph * 36, 2);
  }
  spr(ctx, world, 'mug', Math.floor(t * 2) % 2, 236, feet - 28, 2);

  // textos
  drawText(ctx, 'SELECIONE A DIFICULDADE', 160, 147, { color: P.B, align: 'center' });
  const amaro = world.state.difficulty === 'amaro';
  const option = (label: string, cx: number, selected: boolean): void => {
    const w = textWidth(label) + 10;
    const x = Math.round(cx - w / 2);
    if (selected) {
      ctx.fillStyle = P.k;
      ctx.fillRect(x - 1, 156, w + 2, 11);
      ctx.fillStyle = blink(t, 0.3) ? P.r : P.R;
      ctx.fillRect(x, 157, w, 9);
    }
    drawText(ctx, label, cx, 158, { color: selected ? P.w : P.G, align: 'center' });
  };
  option('NORMAL', 118, !amaro);
  option('AMARO', 202, amaro);
  drawText(ctx, 'SETAS ESCOLHEM   ENTER OU TOQUE INICIA', 160, 169, { color: P.B, align: 'center' });

  // atalho de teste (discreto, canto inferior esquerdo)
  const faseParam = new URLSearchParams(location.search).get('fase');
  if (faseParam === '2' || faseParam === '3' || faseParam === '4') {
    drawText(ctx, 'MODO TESTE:', 5, 149, { color: P.G });
    drawText(ctx, `FASE ${faseParam}`, 5, 157, { color: P.G });
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
function wrapWords(text: string, scale: number, maxW: number, _maxLines = 2): string[] {
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
  const bahia = world.level.theme === 'bahia';
  const rio = world.level.theme === 'rio';

  // cores por tema
  const veilRgb = rio ? '36,18,12' : bahia ? '4,18,40' : amazon ? '10,26,12' : '26,20,35';
  const panelBg = rio ? '#fff3c4' : bahia ? '#bfe9f5' : amazon ? '#d4efb8' : P.p;
  const grid = rio ? 'rgba(181,83,42,0.28)' : bahia ? 'rgba(36,65,143,0.25)' : amazon ? 'rgba(47,107,30,0.3)' : 'rgba(201,120,46,0.35)';
  const border = rio ? P.t : bahia ? P.B : amazon ? P.d : P.T;
  const titleCol = rio ? P.B : bahia ? P.B : amazon ? P.d : P.t;
  const titleSh = rio ? P.c : bahia ? P.c : amazon ? P.j : P.T;
  const nameCol = rio ? P.r : bahia ? P.C : amazon ? P.E : P.r;
  const nameSh = rio ? P.k : bahia ? P.B : amazon ? P.J : P.R;
  const divider = rio ? P.t : bahia ? P.C : amazon ? P.I : P.O;

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

  if (bahia) {
    drawText(ctx, 'UM SONHO NO FUNDO DO MAR', cx, py + 58, { color: P.B, align: 'center' });
  } else if (rio) {
    drawText(ctx, 'DO MORRO AO TRIBUNAL', cx, py + 58, { color: P.T, align: 'center' });
  }

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

/** "FASE N CONCLUÍDA" com pontuação, bônus de tempo e "jogar novamente"/próxima fase. */
export function drawWin(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const t = st.sceneTime;
  const idx = world.level.index;
  const phase2 = idx === 1;
  const sea = idx === 2;
  const rio = idx === 3;
  const last = idx >= 3;
  veil(ctx, Math.min(0.55, t * 1.5), rio ? '36,18,12' : sea ? '4,18,40' : '26,20,35');
  const ease = Math.min(1, t / 0.5);
  const slide = Math.round((1 - ease * (2 - ease)) * -170);
  ctx.save();
  ctx.translate(0, slide);
  // Fase 3: painel mais alto para caber a Jandira (48x56 em 2x)
  const px = 28, py = sea ? 5 : 12, pw = 264, ph = sea ? 170 : 156;
  const bg = rio ? '#fff3c4' : sea ? '#bfe9f5' : phase2 ? '#d4efb8' : P.W;
  const grid = rio ? 'rgba(181,83,42,0.25)' : sea ? 'rgba(36,65,143,0.25)' : phase2 ? 'rgba(47,107,30,0.3)' : 'rgba(159,224,255,0.75)';
  const edge = rio ? P.t : sea ? P.B : phase2 ? P.d : P.B;
  const ink = edge;
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

  if (rio) drawText(ctx, 'FASE 4', 160, py + 8, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  else if (sea) drawText(ctx, `FASE ${idx + 1}`, 160, py + 8, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  else if (phase2) drawText(ctx, 'FASE 2', 160, py + 8, { scale: 2, color: P.d, align: 'center', shadow: P.j });
  else drawText(ctx, 'FASE 1', 160, py + 8, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  drawText(ctx, 'CONCLUÍDA!', 160, py + 27, { scale: 3, color: P.r, align: 'center', shadow: P.R });

  if (rio) {
    spr(ctx, world, 'pardo_drink_mineral', Math.floor(t * 3) % 2, px + 6, py + 48, 2);
    spr(ctx, world, 'mineral_bottle', Math.floor(t * 4) % 2, px + 50, py + 60, 2);
    spr(ctx, world, 'amaro_cheer', Math.floor(t * 2) % 2, px + 66, py + 44, 2, true);
  } else if (sea) {
    // coluna esquerda: Jandira (2x) e o Pardo lambendo o cajado; contadores e frase na coluna direita
    spr(ctx, world, 'jandira_laugh', Math.floor(t * 3) % 2, px + 2, py + 44, 2, true);
    spr(ctx, world, 'pardo_lick', Math.floor(t * 3) % 2, px + 96, py + 92, 2);
  } else if (phase2) {
    spr(ctx, world, 'pardo_drink_bottle', Math.floor(t * 3) % 2, px + 6, py + 50, 2);
    spr(ctx, world, 'bottle', Math.floor(t * 4) % 2, px + 72, py + 62, 2);
    spr(ctx, world, 'alien', Math.floor(t * 2) % 2, px + 84, py + 50, 2, true);
  } else {
    spr(ctx, world, 'pardo_drink', Math.floor(t * 3) % 2, px + 16, py + 54, 2);
    spr(ctx, world, 'mug', 0, px + 58, py + 76, 2);
  }

  const k = Math.max(0, Math.min(1, (t - 0.6) / 1.2));
  const cnt = (v: number): number => Math.floor(v * k);
  const lx = sea ? px + 150 : (phase2 || rio) ? px + 128 : px + 100, rx = px + pw - 12;
  const row = (label: string, value: string, y: number, col: string): void => {
    drawText(ctx, label, lx, y, { color: ink });
    drawText(ctx, value, rx, y, { color: col, align: 'right', shadow: P.W });
  };
  const y0 = sea ? py + 54 : py + 56;
  const dy = sea ? 11 : 12;
  row('PONTOS', pad6(cnt(st.score)), y0, P.k);
  row('MOEDAS', `×${String(cnt(st.coins)).padStart(2, '0')}`, y0 + dy, P.Y);
  row(sea ? 'BÔNUS' : 'BÔNUS DE TEMPO', `+${cnt(st.timeBonus)}`, y0 + dy * 2, P.R);
  if (sea) row('FITINHAS', `${cnt(st.ribbons)}/${st.ribbonsTotal}`, y0 + dy * 3, P.C);

  if (rio) {
    drawText(ctx, 'PARDO SE HIDRATOU', 160, py + 104, { color: P.B, align: 'center' });
    drawText(ctx, 'COM A ÁGUA DO AMARO', 160, py + 114, { color: P.B, align: 'center' });
  } else if (sea) {
    drawText(ctx, 'PARDO LAMBEU O', px + 202, py + 106, { color: P.B, align: 'center' });
    drawText(ctx, 'CAJADO JAILNESCO', px + 202, py + 116, { color: P.B, align: 'center' });
  } else if (phase2) {
    drawText(ctx, 'PARDO SE HIDRATOU', 160, py + 104, { color: P.d, align: 'center' });
    drawText(ctx, 'MAMANDO O ÍNDIO', 160, py + 114, { color: P.d, align: 'center' });
  } else {
    drawText(ctx, 'O PARDO MATOU A SEDE', 160, py + 104, { color: P.N, align: 'center' });
    drawText(ctx, 'NA CAPELA DO HORIZONTE.', 160, py + 114, { color: P.N, align: 'center' });
  }
  if (t > 2 && blink(t)) {
    const msg = last ? 'ENTER OU TOQUE PARA JOGAR NOVAMENTE' : `ENTER OU TOQUE PARA A FASE ${idx + 2}`;
    drawText(ctx, msg, 160, py + (sea ? 159 : 138), { color: P.r, align: 'center', shadow: sea ? P.W : undefined });
  }
  ctx.restore();
}
