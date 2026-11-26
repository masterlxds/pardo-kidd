import type { World } from '../core/types';
import { AIR_COUNTDOWN, VIEW_H, VIEW_W } from '../core/constants';
import { PALETTE as P } from '../gfx/palette';
import { drawText, textWidth } from '../gfx/font';
import { UBER, uberStars } from './uberRules';
import { SPACE, spaceStars } from './spaceRules';

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
  if (world.level.theme === 'uber' && st.scene === 'playing') {
    // nota atual da corrida: 5 − gotas perdidas (mín. 1), discreta no centro da barra
    const stars = uberStars(st.rideHits);
    for (let i = 0; i < UBER.maxStars; i++) drawStar(ctx, 150 + i * 11, 6, 4, i < stars);
  } else if (world.level.space && st.scene === 'playing') {
    // estrelas atuais na Fase 7 (espaço)
    const stars = spaceStars(st.rideHits, st.gravDeaths);
    for (let i = 0; i < SPACE.maxStars; i++) drawStar(ctx, 150 + i * 11, 6, 4, i < stars);
  }
}

/** Estrela de 5 pontas (centro cx,cy; raio r) preenchida ou só contorno; sem depender de glifo da fonte. */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, filled: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? P.Y : 'rgba(26,20,35,0.35)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = filled ? P.k : P.K;
  ctx.stroke();
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
  drawText(ctx, 'PARDO KIDD', 160, 6, { scale: 4, color: P.B, align: 'center', shadow: P.c });
  drawText(ctx, 'IN', 160, 41, { scale: 1, color: P.r, align: 'center', shadow: P.R });
  drawText(ctx, 'QUIXADÁ WORLD', 160, 54, { scale: 3, color: P.r, align: 'center', shadow: P.R });

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
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const faseParam = params?.get('fase');
  const isBonusTest = faseParam?.toLowerCase() === 'bonus' || params?.get('bonus') === '1';
  if (isBonusTest) {
    drawText(ctx, 'MODO TESTE:', 5, 149, { color: P.G });
    drawText(ctx, 'FASE BÔNUS', 5, 157, { color: P.G });
  } else if (
    faseParam === '2' ||
    faseParam === '3' ||
    faseParam === '4' ||
    faseParam === '5' ||
    faseParam === '6' ||
    faseParam === '7'
  ) {
    drawText(ctx, 'MODO TESTE:', 5, 149, { color: P.G });
    drawText(ctx, `FASE ${faseParam}`, 5, 157, { color: P.G });
  }
}

export function drawPaused(ctx: CanvasRenderingContext2D, _world: World): void {
  veil(ctx, 0.6);
  drawText(ctx, 'PAUSA', 160, 74, { scale: 3, color: P.y, align: 'center', shadow: P.k });
  drawText(ctx, 'P, ESC OU TOQUE PARA CONTINUAR', 160, 104, { color: P.w, align: 'center', shadow: P.k });
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
  const uber = world.level.theme === 'uber';
  const sampa = world.level.theme === 'sampa';

  // cores por tema
  const veilRgb = sampa ? '14,18,28' : uber ? '8,12,28' : rio ? '36,18,12' : bahia ? '4,18,40' : amazon ? '10,26,12' : '26,20,35';
  const panelBg = sampa ? '#d3d8de' : uber ? '#dce4f2' : rio ? '#fff3c4' : bahia ? '#bfe9f5' : amazon ? '#d4efb8' : P.p;
  const grid = sampa ? 'rgba(60,70,90,0.25)' : uber ? 'rgba(36,65,143,0.24)' : rio ? 'rgba(181,83,42,0.28)' : bahia ? 'rgba(36,65,143,0.25)' : amazon ? 'rgba(47,107,30,0.3)' : 'rgba(201,120,46,0.35)';
  const border = sampa ? P.K : uber ? P.D : rio ? P.t : bahia ? P.B : amazon ? P.d : P.T;
  const titleCol = sampa ? P.K : uber ? P.D : rio ? P.B : bahia ? P.B : amazon ? P.d : P.t;
  const titleSh = sampa ? P.y : uber ? P['8'] : rio ? P.c : bahia ? P.c : amazon ? P.j : P.T;
  const nameCol = sampa ? P.D : uber ? P.k : rio ? P.r : bahia ? P.C : amazon ? P.E : P.r;
  const nameSh = sampa ? P.y : uber ? P.c : rio ? P.k : bahia ? P.B : amazon ? P.J : P.R;
  const divider = sampa ? P.Y : uber ? P['8'] : rio ? P.t : bahia ? P.C : amazon ? P.I : P.O;

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
  // nome longo (2 linhas): sobe um pouco e empurra divisor/rodapé para baixo
  const extra = name.lines.length > 1 ? 5 : 0;
  name.lines.forEach((line, i) => {
    const y = py + (extra ? 30 : 34) + i * (8 * name.scale + (extra ? 0 : 2));
    drawText(ctx, line, cx, y, { scale: name.scale, color: nameCol, align: 'center', shadow: nameSh });
  });

  if (bahia) {
    drawText(ctx, 'UM SONHO NO FUNDO DO MAR', cx, py + 58, { color: P.B, align: 'center' });
  } else if (uber) {
    drawText(ctx, 'DE UBER ATÉ O GALPÃO', cx, py + 65, { color: P.B, align: 'center' });
  } else if (sampa) {
    drawText(ctx, 'HORA DO CAFÉ', cx, py + 65, { color: P.R, align: 'center' });
  } else if (rio) {
    drawText(ctx, 'DO MORRO AO TRIBUNAL', cx, py + 58, { color: P.T, align: 'center' });
  }

  // divisor
  ctx.fillStyle = divider;
  ctx.fillRect(px + 16, py + 70 + extra, pw - 32, 1);

  // rodapé: Pardo animado + ícone de vida ×N, centralizados
  const lifeTxt = `×${st.lives}`;
  const groupW = 40 + 14 + 16 + 6 + textWidth(lifeTxt, 2);
  const gx = Math.round(cx - groupW / 2);
  const footY = py + 76 + extra;
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
  const uber = idx === 4;
  const sp = idx === 5;
  const tall = sea || sp;
  const last = idx >= 5;
  const unlockBonus = sea && st.ribbonsTotal > 0 && st.ribbons >= st.ribbonsTotal;
  veil(ctx, Math.min(0.55, t * 1.5), sp ? '14,18,28' : uber ? '8,12,28' : rio ? '36,18,12' : sea ? '4,18,40' : '26,20,35');
  const ease = Math.min(1, t / 0.5);
  const slide = Math.round((1 - ease * (2 - ease)) * -170);
  ctx.save();
  ctx.translate(0, slide);
  // Fase 3: painel mais alto para caber a Jandira (48x56 em 2x); com 3/3 fitinhas abre espaço para 2 linhas no rodapé
  const px = 28;
  const py = unlockBonus ? 2 : tall ? 5 : 12;
  const pw = 264;
  const ph = unlockBonus ? 176 : tall ? 170 : 156;
  const bg = sp ? '#d3d8de' : uber ? '#dce4f2' : rio ? '#fff3c4' : sea ? '#bfe9f5' : phase2 ? '#d4efb8' : P.W;
  const grid = sp ? 'rgba(60,70,90,0.22)' : uber ? 'rgba(36,65,143,0.24)' : rio ? 'rgba(181,83,42,0.25)' : sea ? 'rgba(36,65,143,0.25)' : phase2 ? 'rgba(47,107,30,0.3)' : 'rgba(159,224,255,0.75)';
  const edge = sp ? P.K : uber ? P.D : rio ? P.t : sea ? P.B : phase2 ? P.d : P.B;
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

  const titleY = unlockBonus ? py + 4 : py + 8;
  const subTitleY = unlockBonus ? py + 24 : py + 27;
  if (sp) drawText(ctx, 'FASE 6', 160, titleY, { scale: 2, color: P.K, align: 'center', shadow: P.y });
  else if (uber) drawText(ctx, 'FASE 5', 160, titleY, { scale: 2, color: P.D, align: 'center', shadow: P['8'] });
  else if (rio) drawText(ctx, 'FASE 4', 160, titleY, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  else if (sea) drawText(ctx, `FASE ${idx + 1}`, 160, titleY, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  else if (phase2) drawText(ctx, 'FASE 2', 160, titleY, { scale: 2, color: P.d, align: 'center', shadow: P.j });
  else drawText(ctx, 'FASE 1', 160, titleY, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  drawText(ctx, 'CONCLUÍDA!', 160, subTitleY, { scale: 3, color: P.r, align: 'center', shadow: P.R });

  if (sp) {
    // Maia (34x36, 2x = 68x72) na coluna esquerda; Pardo e xícara ao lado; frase abaixo, em largura total
    spr(ctx, world, 'maia_cheer', Math.floor(t * 2) % 2, px + 2, py + 50, 2, true);
    spr(ctx, world, 'pardo_drink_coffee', Math.floor(t * 3) % 2, px + 76, py + 68, 2);
    spr(ctx, world, 'coffee_cup', Math.floor(t * 4) % 2, px + 120, py + 94, 2);
  } else if (uber) {
    spr(ctx, world, 'uber_car', Math.floor(t * 6) % 2, px + 6, py + 72, 1);
    spr(ctx, world, 'pardo_drink_mineral', Math.floor(t * 3) % 2, px + 26, py + 44, 2);
    spr(ctx, world, 'mineral_bottle', Math.floor(t * 4) % 2, px + 70, py + 56, 2);
  } else if (rio) {
    spr(ctx, world, 'pardo_drink_mineral', Math.floor(t * 3) % 2, px + 6, py + 48, 2);
    spr(ctx, world, 'mineral_bottle', Math.floor(t * 4) % 2, px + 50, py + 60, 2);
    spr(ctx, world, 'amaro_cheer', Math.floor(t * 2) % 2, px + 66, py + 44, 2, true);
  } else if (sea) {
    // coluna esquerda: Jandira (2x) e o Pardo lambendo o cajado; contadores e frase na coluna direita
    spr(ctx, world, 'jandira_laugh', Math.floor(t * 3) % 2, px + 2, py + (unlockBonus ? 41 : 44), 2, true);
    spr(ctx, world, 'pardo_lick', Math.floor(t * 3) % 2, px + 96, py + (unlockBonus ? 89 : 92), 2);
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
  const lx = tall ? px + 150 : (phase2 || rio || uber) ? px + 128 : px + 100, rx = px + pw - 12;
  const row = (label: string, value: string, y: number, col: string): void => {
    drawText(ctx, label, lx, y, { color: ink });
    drawText(ctx, value, rx, y, { color: col, align: 'right', shadow: P.W });
  };
  const y0 = unlockBonus ? py + 52 : tall ? py + 54 : py + 56;
  const dy = tall ? 11 : 12;
  row('PONTOS', pad6(cnt(st.score)), y0, P.k);
  row('MOEDAS', `×${String(cnt(st.coins)).padStart(2, '0')}`, y0 + dy, P.Y);
  row(tall ? 'BÔNUS' : 'BÔNUS DE TEMPO', `+${cnt(st.timeBonus)}`, y0 + dy * 2, P.R);
  if (sea) row('FITINHAS', `${cnt(st.ribbons)}/${st.ribbonsTotal}`, y0 + dy * 3, P.C);

  if (sp) {
    drawText(ctx, 'O PARDO TOMOU O CAFÉ', 160, py + 128, { color: P.R, align: 'center' });
    drawText(ctx, 'NA TRANSPORTADORA', 160, py + 138, { color: P.R, align: 'center' });
  } else if (uber) {
    const stars = uberStars(st.rideHits);
    const shown = Math.ceil(stars * k);
    drawText(ctx, 'AVALIAÇÃO DA CORRIDA', 160, py + 88, { color: P.D, align: 'center' });
    for (let i = 0; i < UBER.maxStars; i++) drawStar(ctx, 160 + (i - 2) * 14, py + 103, 6, i < shown);
    drawText(ctx, `BÔNUS +${cnt(UBER.starBonus * stars)}`, 160, py + 114, { color: P.B, align: 'center' });
    drawText(ctx, 'O PARDO CHEGOU DE UBER', 160, py + 126, { color: P.D, align: 'center' });
  } else if (rio) {
    drawText(ctx, 'PARDO SE HIDRATOU', 160, py + 104, { color: P.B, align: 'center' });
    drawText(ctx, 'COM A ÁGUA DO AMARO', 160, py + 114, { color: P.B, align: 'center' });
  } else if (sea) {
    const seaTextY = unlockBonus ? py + 104 : py + 106;
    drawText(ctx, 'PARDO LAMBEU O', px + 202, seaTextY, { color: P.B, align: 'center' });
    drawText(ctx, 'CAJADO JAILNESCO', px + 202, seaTextY + 10, { color: P.B, align: 'center' });
  } else if (phase2) {
    drawText(ctx, 'PARDO SE HIDRATOU', 160, py + 104, { color: P.d, align: 'center' });
    drawText(ctx, 'MAMANDO O ÍNDIO', 160, py + 114, { color: P.d, align: 'center' });
  } else {
    drawText(ctx, 'O PARDO MATOU A SEDE', 160, py + 104, { color: P.N, align: 'center' });
    drawText(ctx, 'NA CAPELA DO HORIZONTE.', 160, py + 114, { color: P.N, align: 'center' });
  }
  if (t > 2 && blink(t)) {
    if (unlockBonus) {
      drawText(ctx, '3/3 FITINHAS! ENTER OU TOQUE', 160, py + 154, { color: P.r, align: 'center', shadow: P.W });
      drawText(ctx, 'PARA A FASE BÔNUS', 160, py + 164, { color: P.r, align: 'center', shadow: P.W });
    } else {
      const msg = last ? 'ENTER OU TOQUE PARA JOGAR NOVAMENTE' : `ENTER OU TOQUE PARA A FASE ${idx + 2}`;
      drawText(ctx, msg, 160, py + (tall ? 159 : 138), { color: P.r, align: 'center', shadow: tall ? P.W : undefined });
    }
  }
  ctx.restore();
}

/** Filete decorativo de 4px nas cores das Fitinhas do Bonfim (turquesa, ouro, coral, azul). */
function drawBonfimRibbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const stripes = [P['8'], P.y, P['!'], P.b];
  for (let i = 0; i < stripes.length; i++) {
    ctx.fillStyle = stripes[i];
    ctx.fillRect(x, y + i, w, 1);
  }
}

/** Cartão de abertura da Fase Bônus ("FASE BÔNUS · TUBO DO BONFIM", ~2.2s). */
export function drawBonusIntro(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const t = st.sceneTime;

  const ease = Math.min(1, t / 0.4);
  const eased = 1 - (1 - ease) * (1 - ease) * (1 - ease);
  const slide = Math.round((1 - eased) * -60);
  veil(ctx, 0.72 * Math.min(1, t / 0.3), '6,18,44');

  ctx.save();
  ctx.translate(0, slide);

  const px = 24, py = 18, pw = 272, ph = 144;
  ctx.fillStyle = P.k;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = '#bfe9f5';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(36,65,143,0.22)';
  for (let x = px + 8; x < px + pw; x += 8) ctx.fillRect(x, py, 1, ph);
  for (let y = py + 8; y < py + ph; y += 8) ctx.fillRect(px, y, pw, 1);
  ctx.strokeStyle = P.B;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  ctx.strokeStyle = P['8'];
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 3.5, py + 3.5, pw - 7, ph - 7);

  const cx = 160;
  drawText(ctx, 'FASE BÔNUS', cx, py + 8, { scale: 2, color: P.B, align: 'center', shadow: P.c });
  drawText(ctx, 'TUBO DO BONFIM', cx, py + 25, { scale: 3, color: P.r, align: 'center', shadow: P.B });
  drawText(ctx, 'COLETE MOEDAS E DESVIE DAS BOMBAS!', cx, py + 52, { color: P.B, align: 'center' });

  const target = st.bonus.target > 0 ? st.bonus.target : 20;
  const metaTxt = `META 1: ${target} MOEDAS`;
  const mw = textWidth(metaTxt) + 12;
  ctx.fillStyle = P.D;
  ctx.fillRect(Math.round(cx - mw / 2), py + 60, mw, 10);
  drawText(ctx, metaTxt, cx, py + 61, { color: P.y, align: 'center', shadow: P.k });

  drawBonfimRibbon(ctx, px + 16, py + 73, pw - 32);

  // sombras no chão do cartão + sprites 2x (Pardo, Caramelo-Tails e moedas girando)
  ctx.fillStyle = 'rgba(22,38,79,0.22)';
  ctx.fillRect(120, py + 130, 32, 3);
  ctx.fillRect(172, py + 130, 28, 3);

  const bobL = Math.round(Math.sin(t * 6) * 2);
  const bobR = Math.round(Math.cos(t * 6) * 2);
  spr(ctx, world, 'bonus_coin', Math.floor(t * 8) % 4, 78, py + 96 + bobL, 2);
  spr(ctx, world, 'pardo_bonus_run', Math.floor(t * 10) % 4, 116, py + 84, 2);
  spr(ctx, world, 'buddy_bonus_run', Math.floor(t * 10 + 1) % 4, 168, py + 88, 2);
  spr(ctx, world, 'bonus_coin', Math.floor(t * 8 + 2) % 4, 218, py + 96 + bobR, 2);

  ctx.restore();
}

/** HUD enxuta (14px de altura) exclusiva da corrida no Tubo do Bonfim. */
export function drawBonusHud(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  ctx.fillStyle = 'rgba(10,24,52,0.78)';
  ctx.fillRect(0, 0, VIEW_W, 13);
  ctx.fillStyle = P['8'];
  ctx.fillRect(0, 13, VIEW_W, 1);

  const o = { shadow: P.k };

  // Esquerda: moeda do bônus animada + contador atual/meta
  spr(ctx, world, 'bonus_coin', Math.floor(world.time * 8) % 4, 4, 1);
  const bonusTxt = `${String(st.bonus.coins).padStart(2, '0')}/${String(st.bonus.target).padStart(2, '0')}`;
  const metGoal = st.bonus.coins >= st.bonus.target;
  drawText(ctx, bonusTxt, 19, 3, { ...o, color: metGoal ? P.j : P.y });

  // Centro: indicador do trecho (1..3)
  drawText(ctx, `TRECHO ${st.bonus.stage}/3`, 152, 3, { ...o, color: P.c, align: 'center' });

  // Direita: vidas + moedas da campanha + pontuação total
  const scoreTxt = pad6(st.score);
  const scoreRight = VIEW_W - 4;
  drawText(ctx, scoreTxt, scoreRight, 3, { ...o, color: P.w, align: 'right' });

  const coinTxt = `×${String(st.coins).padStart(2, '0')}`;
  const coinTextX = scoreRight - textWidth(scoreTxt) - 7 - textWidth(coinTxt);
  spr(ctx, world, 'icon_coin', 0, coinTextX - 10, 3);
  drawText(ctx, coinTxt, coinTextX, 3, { ...o, color: P.a });

  const lifeTxt = `×${st.lives}`;
  const lifeTextX = coinTextX - 10 - 7 - textWidth(lifeTxt);
  spr(ctx, world, 'icon_life', 0, lifeTextX - 10, 3);
  drawText(ctx, lifeTxt, lifeTextX, 3, { ...o, color: P.w });
}

/** Painel de resultado da Fase Bônus (vitória com a Esmeralda do Bonfim ou fim parcial em checkpoint). */
export function drawBonusEnd(ctx: CanvasRenderingContext2D, world: World): void {
  const st = world.state;
  const t = st.sceneTime;
  const cleared = st.bonus.cleared;

  veil(ctx, Math.min(0.72, t * 1.8), '6,18,44');
  const ease = Math.min(1, t / 0.45);
  const eased = 1 - (1 - ease) * (1 - ease) * (1 - ease);
  const slide = Math.round((1 - eased) * -170);

  ctx.save();
  ctx.translate(0, slide);

  const px = 16, py = 8, pw = 288, ph = 164;
  ctx.fillStyle = P.k;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = '#bfe9f5';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(36,65,143,0.22)';
  for (let x = px + 8; x < px + pw; x += 8) ctx.fillRect(x, py, 1, ph);
  for (let y = py + 8; y < py + ph; y += 8) ctx.fillRect(px, y, pw, 1);
  ctx.strokeStyle = cleared ? P.y : P.B;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  ctx.strokeStyle = P['8'];
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 3.5, py + 3.5, pw - 7, ph - 7);

  const lx = 140, rx = 294;
  const row = (label: string, value: string, y: number, col: string): void => {
    drawText(ctx, label, lx, y, { color: P.B });
    drawText(ctx, value, rx, y, { color: col, align: 'right', shadow: P.w });
  };

  if (cleared) {
    // Faixa superior azul-marinho para contraste máximo do título dourado/turquesa
    ctx.fillStyle = P.D;
    ctx.fillRect(px + 5, py + 5, pw - 10, 42);
    drawText(ctx, 'ESPECIAL CONCLUÍDO!', 160, py + 9, { scale: 2, color: P.y, align: 'center', shadow: P.k });
    drawText(ctx, 'ESMERALDA DO BONFIM!', 160, py + 28, { scale: 2, color: P['8'], align: 'center', shadow: P.k });
    drawBonfimRibbon(ctx, px + 5, py + 48, pw - 10);

    // Ilustração esquerda: Esmeralda do Bonfim brilhando + Pardo e Caramelo-Tails comemorando de frente
    const emBob = Math.round(Math.sin(t * 5));
    ctx.fillStyle = 'rgba(255,243,160,0.45)';
    ctx.fillRect(61, py + 58 + emBob, 36, 22);
    ctx.fillRect(67, py + 52 + emBob, 24, 34);
    spr(ctx, world, 'bonus_emerald', Math.floor(t * 5) % 2, 63, py + 53 + emBob, 2);
    spr(ctx, world, 'sparkle', Math.floor(t * 6) % 2, 51, py + 56);
    spr(ctx, world, 'sparkle', Math.floor(t * 6 + 1) % 2, 99, py + 72);

    const pJump = Math.abs(Math.round(Math.sin(t * 7) * 3));
    const bJump = Math.abs(Math.round(Math.cos(t * 7) * 3));
    ctx.fillStyle = 'rgba(22,38,79,0.2)';
    ctx.fillRect(38, py + 137, 32, 3);
    ctx.fillRect(88, py + 137, 28, 3);
    spr(ctx, world, 'pardo_bonus_cheer', Math.floor(t * 6) % 2, 34, py + 91 - pJump, 2);
    spr(ctx, world, 'buddy_bonus_cheer', Math.floor(t * 6 + 1) % 2, 84, py + 95 - bJump, 2);

    row('MOEDAS NO TUBO', `×${String(st.bonus.coins).padStart(2, '0')}`, py + 64, P.Y);
    row('BÔNUS ESMERALDA', '+5000', py + 81, P['9']);
    row('RECOMPENSA', '+1 VIDA (1UP)', py + 98, P.E);
    ctx.fillStyle = P['8'];
    ctx.fillRect(lx, py + 112, rx - lx, 1);
    row('PONTOS TOTAIS', pad6(st.score), py + 118, P.k);
  } else {
    drawText(ctx, 'FIM DA FASE BÔNUS', 160, py + 9, { scale: 2, color: P.B, align: 'center', shadow: P.c });
    drawText(ctx, 'MOEDAS E PONTOS MANTIDOS!', 160, py + 31, { color: P['9'], align: 'center' });
    drawBonfimRibbon(ctx, px + 12, py + 44, pw - 24);

    // Ilustração esquerda: moeda girando + Pardo e Caramelo-Tails correndo
    const coinBob = Math.round(Math.sin(t * 5));
    spr(ctx, world, 'bonus_coin', Math.floor(t * 8) % 4, 67, py + 55 + coinBob, 2);
    ctx.fillStyle = 'rgba(22,38,79,0.2)';
    ctx.fillRect(38, py + 135, 32, 3);
    ctx.fillRect(88, py + 135, 28, 3);
    spr(ctx, world, 'pardo_bonus_run', Math.floor(t * 8) % 4, 34, py + 88, 2);
    spr(ctx, world, 'buddy_bonus_run', Math.floor(t * 8 + 1) % 4, 84, py + 92, 2);

    const clearedStages = Math.max(0, st.bonus.stage - 1);
    row('TRECHOS VENCIDOS', `${clearedStages}/3`, py + 62, P['9']);
    row('MOEDAS NO TUBO', `×${String(st.bonus.coins).padStart(2, '0')}`, py + 79, P.Y);
    row('MOEDAS TOTAIS', `×${String(st.coins).padStart(2, '0')}`, py + 96, P.Y);
    ctx.fillStyle = P['8'];
    ctx.fillRect(lx, py + 110, rx - lx, 1);
    row('PONTOS TOTAIS', pad6(st.score), py + 116, P.k);
  }

  ctx.fillStyle = 'rgba(36,65,143,0.35)';
  ctx.fillRect(px + 16, py + 143, pw - 32, 1);
  if (t > 0.8 && blink(t)) {
    drawText(ctx, 'ENTER OU TOQUE PARA A FASE 4', 160, py + 148, { color: P.r, align: 'center', shadow: P.w });
  }

  ctx.restore();
}

