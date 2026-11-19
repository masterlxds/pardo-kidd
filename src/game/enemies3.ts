import type { EnemyKind, Entity, Rect, World } from '../core/types';
import { STEP, TILE, VIEW_H, VIEW_W } from '../core/constants';
import { moveBody } from '../core/physics';

export type SeaEnemyKind = Extract<EnemyKind, 'agua_viva' | 'peixe_agulha' | 'baiacu' | 'dentao' | 'siri' | 'tartaruga' | 'moreia'>;

type Dir = 1 | -1;

/** Duração do atordoamento dos blindados (s). */
const STUN_TIME = 1.5;
const TAU = Math.PI * 2;

interface SpriteRef {
  name: string;
  frame: number;
  flip: boolean;
  /** 'center' (padrão): sprite centrado na hitbox; 'bottom': base do sprite na base da hitbox */
  align?: 'center' | 'bottom';
  hide?: boolean;
  /** rotação (rad) em torno do centro */
  rot?: number;
}

/** 'ok' conecta; 'miss' não conecta; 'block' bloqueado (sfx hit); 'bounce' rebatido (sfx boing). */
type HitResult = 'ok' | 'miss' | 'block' | 'bounce';

interface Core {
  /** tempo de vida da entidade */
  t: number;
  /** > 0 enquanto atordoado */
  stun: number;
  /** derrotado (afundando ou, na moreia, recolhida de vez) */
  defeated: boolean;
}

interface Ai {
  /** passo normal (nem atordoado nem derrotado) */
  update(dt: number, world: World): void;
  /** passo durante o atordoamento (padrão: desliza com amortecimento, sem gravidade) */
  stunUpdate?(dt: number, world: World): void;
  /** passo depois de derrotado quando a derrota é personalizada (moreia) */
  defeatedUpdate?(dt: number, world: World): void;
  sprite(): SpriteRef;
  /** decide se o soco conecta (antes de stun/derrota) */
  hit?(dir: Dir, world: World): HitResult;
  /** 1º soco num blindado (padrão: knockback curto) */
  onStun?(dir: Dir, world: World): void;
  onRecover?(): void;
  /** chamado na derrota depois do setup padrão de afundar; true = derrota personalizada (não afunda) */
  onDefeat?(dir: Dir, world: World): boolean;
  /** true → toque não faz nada agora */
  harmless?(): boolean;
  /** efeito do toque (padrão: dano) */
  touch?(world: World): void;
  /** desenho personalizado; true = já desenhou tudo */
  draw?(ctx: CanvasRenderingContext2D, world: World): boolean;
}

const cx = (r: Rect): number => r.x + r.w / 2;
const cy = (r: Rect): number => r.y + r.h / 2;
const damp = (v: number, k: number, dt: number): number => v * Math.max(0, 1 - k * dt);
/** fase pseudoaleatória estável a partir da posição (dessincroniza vizinhos) */
const phaseOf = (x: number, y: number): number => ((x * 0.0731 + y * 0.0457) % 1) * TAU;

function onScreen(e: Rect, world: World, margin = 0): boolean {
  const c = world.camera;
  return e.x + e.w > c.x - margin && e.x < c.x + VIEW_W + margin && e.y + e.h > c.y - margin && e.y < c.y + VIEW_H + margin;
}

/** Linha horizontal livre de tiles sólidos entre x0 e x1 na altura y? */
function clearRow(world: World, x0: number, x1: number, y: number): boolean {
  const ty = Math.floor(y / TILE);
  const a = Math.floor(Math.min(x0, x1) / TILE);
  const b = Math.floor(Math.max(x0, x1) / TILE);
  for (let tx = a; tx <= b; tx++) if (world.level.isSolid(tx, ty)) return false;
  return true;
}

/** Redimensiona mantendo o centro. */
function resizeCentered(e: Entity, w: number, h: number): void {
  const x = cx(e), y = cy(e);
  e.w = w; e.h = h; e.x = x - w / 2; e.y = y - h / 2;
}

function drawSpriteRef(ctx: CanvasRenderingContext2D, world: World, e: Rect, s: SpriteRef, upsideDown: boolean): { top: number; cx: number } {
  const size = world.sprites.size(s.name);
  const ax = cx(e);
  const ay = s.align === 'bottom' ? e.y + e.h - size.h / 2 : cy(e);
  if (!s.hide) {
    if (upsideDown || s.rot) {
      ctx.save();
      ctx.translate(Math.round(ax), Math.round(ay));
      if (s.rot) ctx.rotate(s.rot);
      if (upsideDown) ctx.scale(1, -1);
      world.sprites.draw(ctx, s.name, s.frame, -size.w / 2, -size.h / 2, s.flip);
      ctx.restore();
    } else {
      world.sprites.draw(ctx, s.name, s.frame, ax - size.w / 2, ay - size.h / 2, s.flip);
    }
  }
  return { top: ay - size.h / 2, cx: ax };
}

/** Estrelinhas girando acima de um inimigo atordoado. */
function drawStars(ctx: CanvasRenderingContext2D, world: World, x: number, top: number, t: number): void {
  const sz = world.sprites.size('stun_stars');
  world.sprites.draw(ctx, 'stun_stars', Math.floor(t / 0.1) % 2, x - sz.w / 2 + Math.sin(t * 9) * 2, top - sz.h - 1 + Math.cos(t * 9) * 1);
}

/** alpha do "piscar" durante o stun */
const stunAlpha = (t: number): number => (Math.floor(t / 0.08) % 2 === 0 ? 0.4 : 1);

/**
 * Entidade comum: stun (blindados), derrota (vira de ponta-cabeça e afunda), dano ao toque, desenho.
 * (centerX, centerY) = centro da hitbox inicial.
 */
function build(kind: SeaEnemyKind, centerX: number, centerY: number, w: number, h: number, points: number,
  armored: boolean, make: (e: Entity, core: Core) => Ai): Entity {
  const core: Core = { t: 0, stun: 0, defeated: false };
  let sinking = false;
  let bubbleT = 0;
  let ai!: Ai;
  const e: Entity = {
    kind, dead: false, x: centerX - w / 2, y: centerY - h / 2, w, h, vx: 0, vy: 0,
    update(dt, world) {
      core.t += dt;
      if (sinking) {
        e.vx = damp(e.vx, 1.2, dt);
        e.vy = Math.min(e.vy + 220 * dt, 110);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        bubbleT -= dt;
        if (bubbleT <= 0) { bubbleT = 0.25; world.fx('bubble', cx(e), e.y); }
        if (e.y > world.camera.y + VIEW_H + 24 || e.y > world.level.heightPx + 32) e.dead = true;
        return;
      }
      if (core.defeated) { ai.defeatedUpdate?.(dt, world); return; }
      if (core.stun > 0) {
        core.stun -= dt;
        if (ai.stunUpdate) ai.stunUpdate(dt, world);
        else {
          e.vx = damp(e.vx, 4, dt);
          e.vy = damp(e.vy, 4, dt);
          moveBody(e, world.level, dt, { oneWay: false });
        }
        if (core.stun <= 0) { core.stun = 0; ai.onRecover?.(); }
        return;
      }
      ai.update(dt, world);
    },
    draw(ctx, world) {
      if (ai.draw && ai.draw(ctx, world)) return;
      const stunned = !sinking && core.stun > 0;
      if (stunned) { ctx.save(); ctx.globalAlpha *= stunAlpha(core.t); }
      const r = drawSpriteRef(ctx, world, e, ai.sprite(), sinking);
      if (stunned) {
        ctx.restore();
        drawStars(ctx, world, r.cx, r.top, core.t);
      }
    },
    onPunch(world, dir) {
      if (sinking || core.defeated) return false;
      const res = ai.hit ? ai.hit(dir, world) : 'ok';
      if (res === 'miss') return false;
      if (res === 'block') { world.audio.play('hit'); return false; }
      if (res === 'bounce') { world.audio.play('boing'); return false; }
      if (armored && core.stun <= 0) {
        core.stun = STUN_TIME;
        world.audio.play('stun');
        if (ai.onStun) ai.onStun(dir, world);
        else { e.vx = dir * 70; e.vy = 0; }
        return true;
      }
      // derrota
      core.defeated = true;
      world.audio.play('hit');
      world.addScore(points, cx(e), e.y);
      world.fx('bubble', cx(e), cy(e));
      sinking = true;
      e.vx = dir * 60;
      e.vy = -50;
      if (ai.onDefeat?.(dir, world)) sinking = false;
      return true;
    },
    onTouchPlayer(world) {
      if (sinking || core.defeated || core.stun > 0 || world.player.dead) return;
      if (ai.harmless?.()) return;
      if (ai.touch) ai.touch(world);
      else world.player.hurt(world, cx(e));
    },
  };
  ai = make(e, core);
  return e;
}

// ── Água-viva: senoide vertical ±24px (~3s); choque ao toque ─────────────────────────
function aguaVivaAi(e: Entity, core: Core): Ai {
  const homeY = cy(e);
  const ph = phaseOf(e.x, e.y);
  return {
    update() {
      e.y = homeY + 24 * Math.sin(core.t * TAU / 3 + ph) - e.h / 2;
    },
    sprite: () => ({ name: 'agua_viva', frame: Math.floor((core.t + ph) / 0.3) % 2, flip: false }),
    touch(world) {
      const p = world.player;
      if (p.invuln <= 0 && world.state.scene === 'playing') world.audio.play('zap');
      p.hurt(world, cx(e));
    },
  };
}

// ── Peixe-agulha: espera, pisca 0.5s e dispara na horizontal ────────────────────────
function peixeAgulhaAi(e: Entity, core: Core): Ai {
  // 'rest': sumiu (bateu na parede ou saiu da tela) e aguarda, invisível e inofensivo no posto, até o posto sair da tela
  let state: 'idle' | 'warn' | 'dash' | 'rest' = 'idle';
  let face: Dir = -1;
  let timer = 0;
  const homeX = e.x;
  const homeY = e.y;
  const ph = phaseOf(e.x, e.y);
  /** volta ao posto sem morrer (o peixe só some de vez se o Pardo o derrotar) */
  const recolher = () => {
    state = 'rest';
    e.x = homeX;
    e.y = homeY;
    e.vx = 0;
    e.vy = 0;
  };
  return {
    update(dt, world) {
      const p = world.player;
      const dx = cx(p) - cx(e);
      const dy = cy(p) - cy(e);
      if (state === 'rest') {
        // só rearma quando o posto está fora da tela: o peixe nunca reaparece à vista nem ataca de fora dela
        if (!onScreen({ x: homeX, y: homeY, w: e.w, h: e.h }, world, 32)) state = 'idle';
      } else if (state === 'idle') {
        if (Math.abs(dx) > 2) face = dx >= 0 ? 1 : -1;
        e.y = homeY + 1.5 * Math.sin(core.t * 3 + ph);
        if (!p.dead && Math.abs(dx) <= 11 * TILE && Math.abs(dy) <= 3 * TILE && onScreen(e, world)) {
          state = 'warn';
          timer = 0.5;
        }
      } else if (state === 'warn') {
        timer -= dt;
        if (timer <= 0) {
          state = 'dash';
          e.vx = face * 170;
          e.vy = 0;
        }
      } else {
        e.vx = face * 170;
        const c = moveBody(e, world.level, dt, { oneWay: false });
        if (c.left || c.right) {
          world.fx('bubble', face > 0 ? e.x + e.w : e.x, cy(e), face);
          recolher();
        } else if (!onScreen(e, world, 64)) recolher();
      }
    },
    harmless: () => state === 'rest',
    hit: () => (state === 'rest' ? 'miss' : 'ok'),
    sprite() {
      if (state === 'rest') return { name: 'peixe_agulha', frame: 0, flip: face < 0, hide: true };
      if (state === 'warn') return { name: 'peixe_agulha', frame: 0, flip: face < 0, hide: Math.floor(core.t / 0.06) % 2 === 0 };
      const per = state === 'dash' ? 0.06 : 0.25;
      return { name: 'peixe_agulha', frame: Math.floor(core.t / per) % 2, flip: face < 0 };
    },
  };
}

// ── Baiacu-bomba: murcho 2s / inflado 2s; inflado rebate o soco ─────────────────────
function baiacuAi(e: Entity, core: Core): Ai {
  const hx = cx(e), hy = cy(e);
  const ph = phaseOf(e.x, e.y);
  let puffed = false;
  let timer = 0.5 + (ph / TAU) * 1.5;
  let face: Dir = -1;
  return {
    update(dt, world) {
      timer -= dt;
      if (timer <= 0) {
        puffed = !puffed;
        timer = 2;
        resizeCentered(e, puffed ? 18 : 12, puffed ? 18 : 10);
      }
      const p = world.player;
      const dx = cx(p) - hx;
      if (Math.abs(dx) > 4) face = dx >= 0 ? 1 : -1;
      e.x = hx + 4 * Math.sin(core.t * 0.9 + ph) - e.w / 2;
      e.y = hy + 2 * Math.sin(core.t * 1.3 + ph) - e.h / 2;
    },
    sprite: () => ({ name: puffed ? 'baiacu_puff' : 'baiacu', frame: Math.floor(core.t / 0.3) % 2, flip: face < 0 }),
    hit(dir, world) {
      if (!puffed) return 'ok';
      const p = world.player;
      if (!p.dead) p.vx = -dir * 110; // rebate o Pardo
      return 'bounce';
    },
  };
}

// ── Baiacu-dentão: patrulha ±3 tiles, telegrafa e dá dash na linha ─────────────────
function dentaoAi(e: Entity, core: Core): Ai {
  type S = 'patrol' | 'tele' | 'dash' | 'rest';
  const hx = cx(e), hy = cy(e);
  let state: S = 'patrol';
  let dir: Dir = -1;
  let timer = 0;
  return {
    update(dt, world) {
      const p = world.player;
      if (state === 'patrol') {
        e.vx = dir * 35;
        e.vy = (hy - cy(e)) * 2;
        const c = moveBody(e, world.level, dt, { oneWay: false });
        if (c.left) dir = 1;
        else if (c.right) dir = -1;
        else if (dir > 0 && cx(e) > hx + 3 * TILE) dir = -1;
        else if (dir < 0 && cx(e) < hx - 3 * TILE) dir = 1;
        const dx = cx(p) - cx(e);
        const dy = cy(p) - cy(e);
        if (!p.dead && Math.abs(dy) <= 12 && dx * dir > 0 && Math.abs(dx) <= 6 * TILE && clearRow(world, cx(e), cx(p), cy(e))) {
          state = 'tele';
          timer = 0.35;
          e.vx = 0; e.vy = 0;
        }
      } else if (state === 'tele') {
        timer -= dt;
        if (timer <= 0) {
          state = 'dash';
          timer = 0.6;
          if (onScreen(e, world)) world.audio.play('chomp');
        }
      } else if (state === 'dash') {
        e.vx = dir * 190;
        e.vy = 0;
        const c = moveBody(e, world.level, dt, { oneWay: false });
        timer -= dt;
        if (c.left || c.right) timer = 0;
        if (timer <= 0) { state = 'rest'; timer = 0.8; }
      } else {
        e.vx = damp(e.vx, 6, dt);
        e.vy = 0;
        moveBody(e, world.level, dt, { oneWay: false });
        timer -= dt;
        if (timer <= 0) state = 'patrol';
      }
    },
    sprite() {
      if (core.stun > 0) return { name: 'dentao', frame: 0, flip: dir < 0 };
      if (state === 'tele' || state === 'dash') return { name: 'dentao_dash', frame: 0, flip: dir < 0 };
      return { name: 'dentao', frame: Math.floor(core.t / (state === 'patrol' ? 0.25 : 0.5)) % 2, flip: dir < 0 };
    },
    onStun(pdir) {
      state = 'rest';
      timer = 0;
      e.vx = pdir * 90;
      e.vy = 0;
      dir = (pdir * -1) as Dir; // fica virado para o Pardo
    },
    onRecover() { state = 'patrol'; },
  };
}

// ── Siri-de-recife: anda no chão, guarda frontal periódica ──────────────────────────
function siriAi(e: Entity, core: Core): Ai {
  let state: 'walk' | 'guard' = 'walk';
  let dir: Dir = -1;
  let timer = 1.2 + (phaseOf(e.x, e.y) / TAU) * 1.3;
  const fall = (dt: number, world: World) => {
    e.vy = Math.min(e.vy + 500 * dt, 140);
    return moveBody(e, world.level, dt);
  };
  const groundAhead = (world: World): boolean => {
    const ax = dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const tx = Math.floor(ax / TILE);
    const ty = Math.floor((e.y + e.h + 1) / TILE);
    return world.level.isSolid(tx, ty) || world.level.isOneWay(tx, ty);
  };
  return {
    update(dt, world) {
      if (state === 'walk') {
        e.vx = dir * 25;
        const c = fall(dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !groundAhead(world)) dir = (dir * -1) as Dir;
        timer -= dt;
        if (timer <= 0) { state = 'guard'; timer = 1.2; e.vx = 0; }
      } else {
        e.vx = 0;
        fall(dt, world);
        timer -= dt;
        if (timer <= 0) { state = 'walk'; timer = 2.5; }
      }
      if (e.y > world.level.heightPx + 32) e.dead = true;
    },
    stunUpdate(dt, world) {
      e.vx = damp(e.vx, 5, dt);
      fall(dt, world);
    },
    sprite() {
      if (core.stun > 0) return { name: 'siri', frame: 0, flip: dir < 0, align: 'bottom' };
      if (state === 'guard') return { name: 'siri_guard', frame: 0, flip: dir < 0, align: 'bottom' };
      return { name: 'siri', frame: Math.floor(core.t / 0.2) % 2, flip: dir < 0, align: 'bottom' };
    },
    hit(_dir, world) {
      if (state === 'guard' && core.stun <= 0) {
        const front = (cx(world.player) - cx(e)) * dir > 0;
        if (front) return 'block';
      }
      return 'ok';
    },
    onStun(pdir) {
      state = 'walk';
      timer = 2.5;
      e.vx = pdir * 50;
    },
  };
}

// ── Tartaruga-de-couro: diagonais lentas; empurra sem dano ──────────────────────────
function tartarugaAi(e: Entity, core: Core): Ai {
  const hx = cx(e), hy = cy(e);
  const ph = phaseOf(e.x, e.y);
  let sx: Dir = ph < Math.PI ? 1 : -1;
  let sy: Dir = (ph % Math.PI) < Math.PI / 2 ? 1 : -1;
  const VX = 22, VY = 12;
  return {
    update(dt, world) {
      e.vx = sx * VX;
      e.vy = sy * VY;
      const c = moveBody(e, world.level, dt, { oneWay: false });
      if (c.left) sx = 1; else if (c.right) sx = -1;
      if (c.top) sy = 1; else if (c.bottom) sy = -1;
      if (sx > 0 && cx(e) > hx + 6 * TILE) sx = -1;
      else if (sx < 0 && cx(e) < hx - 6 * TILE) sx = 1;
      if (sy > 0 && cy(e) > hy + 3 * TILE) sy = -1;
      else if (sy < 0 && cy(e) < hy - 3 * TILE) sy = 1;
    },
    sprite() {
      if (core.stun > 0 || core.defeated) {
        return { name: 'tartaruga_shell', frame: Math.floor(core.t / 0.1) % 2, flip: sx < 0, rot: core.t * 9 * sx };
      }
      return { name: 'tartaruga', frame: Math.floor(core.t / 0.4) % 2, flip: sx < 0 };
    },
    touch(world) {
      const p = world.player;
      const ox = Math.min(p.x + p.w, e.x + e.w) - Math.max(p.x, e.x);
      const oy = Math.min(p.y + p.h, e.y + e.h) - Math.max(p.y, e.y);
      let px = 0, py = 0;
      if (oy < ox) {
        const ny = cy(p) < cy(e) ? -1 : 1;
        p.vy = ny * 70 + e.vy;
        py = ny * 60;
      } else {
        const nx = cx(p) < cx(e) ? -1 : 1;
        p.vx = nx * 90 + e.vx;
        px = nx * 60;
      }
      // empurrão na posição pelas mesmas regras da física do Pardo (tiles/one-way, teto do nado, ouriços)
      p.shove(world, px + e.vx, py + e.vy, STEP);
    },
    onStun(pdir) {
      e.vx = pdir * 60;
      e.vy = 0;
      sx = (pdir * -1) as Dir;
    },
    onDefeat(pdir) {
      // o 2º soco arremessa longe
      e.vx = pdir * 240;
      e.vy = -70;
      sx = pdir;
      return false;
    },
  };
}

// ── Moreia: emboscada na toca, estica para o lado livre ─────────────────────────────
function moreiaAi(e: Entity, core: Core): Ai {
  type S = 'hidden' | 'extend' | 'exposed' | 'retract' | 'cool';
  const hx = cx(e), hy = cy(e);
  const HOLE = 16, LEN = 28, THICK = 10;
  let side: Dir = 1;
  let fixedSide = false;
  let resolved = false;
  let state: S = 'hidden';
  let ext = 0; // 0..1
  let timer = 0;
  let exposedT = 0;
  const sway = () => (core.stun > 0 ? Math.sin(core.t * 10) * 2 : 0);
  const setBox = () => {
    if (ext <= 0.15) {
      e.w = HOLE; e.h = HOLE; e.x = hx - HOLE / 2; e.y = hy - HOLE / 2;
      return;
    }
    const len = LEN * ext;
    e.w = len; e.h = THICK;
    e.x = side > 0 ? hx : hx - len;
    e.y = hy - THICK / 2 + sway();
  };
  const resolveSide = (world: World) => {
    resolved = true;
    const tx = Math.floor(hx / TILE), ty = Math.floor(hy / TILE);
    const l = world.level.isSolid(tx - 1, ty), r = world.level.isSolid(tx + 1, ty);
    if (l && !r) { side = 1; fixedSide = true; } else if (r && !l) { side = -1; fixedSide = true; }
  };
  const exposed = () => ext >= 0.4;
  return {
    update(dt, world) {
      if (!resolved) resolveSide(world);
      const p = world.player;
      if (state === 'hidden') {
        ext = 0;
        const dx = cx(p) - hx;
        const dy = cy(p) - hy;
        if (!fixedSide && Math.abs(dx) > 2) side = dx >= 0 ? 1 : -1;
        if (!p.dead && dx * side > 0 && Math.abs(dx) <= 3.5 * TILE && Math.abs(dy) <= 1.5 * TILE) state = 'extend';
      } else if (state === 'extend') {
        ext = Math.min(1, ext + dt / 0.15);
        if (ext >= 1) {
          state = 'exposed';
          timer = 1;
          exposedT = 0;
          if (onScreen(e, world)) world.audio.play('chomp');
        }
      } else if (state === 'exposed') {
        timer -= dt;
        exposedT += dt;
        if (timer <= 0) state = 'retract';
      } else if (state === 'retract') {
        ext = Math.max(0, ext - dt / 0.4);
        if (ext <= 0) { state = 'cool'; timer = 1; }
      } else {
        ext = 0;
        timer -= dt;
        if (timer <= 0) state = 'hidden';
      }
      setBox();
    },
    stunUpdate() {
      ext = 1;
      setBox();
    },
    defeatedUpdate(dt) {
      ext = Math.max(0, ext - dt / 0.4);
      setBox();
    },
    sprite: () => ({ name: 'moreia', frame: state === 'exposed' && exposedT < 0.3 && core.stun <= 0 ? 1 : 0, flip: side < 0 }),
    hit: () => (exposed() ? 'ok' : 'miss'),
    onStun() {
      state = 'exposed';
      ext = 1;
      e.vx = 0; e.vy = 0;
    },
    onRecover() { state = 'retract'; },
    onDefeat() {
      e.vx = 0; e.vy = 0;
      return true; // recolhe de vez; a toca fica
    },
    harmless: () => !exposed(),
    draw(ctx, world) {
      const hole = world.sprites.size('moreia_hole');
      world.sprites.draw(ctx, 'moreia_hole', 0, hx - hole.w / 2, hy - hole.h / 2, side < 0);
      if (ext <= 0) return true;
      const s = world.sprites.size('moreia');
      const len = LEN * ext;
      const y = hy - s.h / 2 + sway();
      const stunned = core.stun > 0 && !core.defeated;
      // cabeça na ponta da extensão; o resto do corpo some dentro da toca (recorte)
      const headX = side > 0 ? hx + len + 2 : hx - len - 2;
      const sxDraw = side > 0 ? headX - s.w : headX;
      ctx.save();
      ctx.beginPath();
      if (side > 0) ctx.rect(hx - 4, y - 4, s.w + 16, s.h + 8);
      else ctx.rect(hx + 4 - (s.w + 16), y - 4, s.w + 16, s.h + 8);
      ctx.clip();
      if (stunned) ctx.globalAlpha *= stunAlpha(core.t);
      const frame = state === 'exposed' && exposedT < 0.3 && !stunned && !core.defeated ? 1 : 0;
      world.sprites.draw(ctx, 'moreia', frame, sxDraw, y, side < 0);
      ctx.restore();
      if (stunned) drawStars(ctx, world, side > 0 ? headX - 6 : headX + 6, y, core.t);
      return true;
    },
  };
}

/**
 * Inimigos do Bahia World (ver PLAN-FASE3.md §4).
 * (centerX, y): para 'siri' y = base (pés); para os demais y = centro vertical do corpo.
 * Hitboxes · pontos: água-viva 12x16 · 200, peixe-agulha 20x6 · 200, baiacu 12x10 (inflado 18x18) · 300,
 * dentão 20x14 · 600, siri 20x12 · 500, tartaruga 28x14 · 700, moreia toca 16x16 / esticada 28x10 · 600.
 * Blindados (2 socos, stun 1.5s): dentão, siri, tartaruga, moreia.
 */
export function createSeaEnemy(kind: SeaEnemyKind, centerX: number, y: number): Entity {
  switch (kind) {
    case 'agua_viva': return build(kind, centerX, y, 12, 16, 200, false, aguaVivaAi);
    case 'peixe_agulha': return build(kind, centerX, y, 20, 6, 200, false, peixeAgulhaAi);
    case 'baiacu': return build(kind, centerX, y, 12, 10, 300, false, baiacuAi);
    case 'dentao': return build(kind, centerX, y, 20, 14, 600, true, dentaoAi);
    case 'siri': return build(kind, centerX, y - 6, 20, 12, 500, true, siriAi);
    case 'tartaruga': return build(kind, centerX, y, 28, 14, 700, true, tartarugaAi);
    case 'moreia': return build(kind, centerX, y, 16, 16, 600, true, moreiaAi);
  }
}
