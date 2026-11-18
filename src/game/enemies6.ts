import type { Entity, Rect, World } from '../core/types';
import { TILE } from '../core/constants';
import { moveBody } from '../core/physics';
import { createPopCoin } from './objects';

/** Inimigos da Fase 6 — Transportadora de São Paulo (level-6-refs/gdd_bestiario_e_maia.md §1). */
export type SampaEnemyKind = 'rato' | 'carregador' | 'empilhadeira' | 'arremessador';

type Dir = 1 | -1;

const GRAV = 900;
const MAX_FALL = 360;
const PKG_GRAV = 520;

interface SpriteRef {
  name: string;
  frame: number;
  flip: boolean;
}

/**
 * Resultado de soco:
 * - 'kill': derrota e arremessa para fora da tela
 * - 'stun': soco conecta sem pontuar nem arremessar (1º soco do carregador)
 * - 'bounce': soco rebatido (retorna false em onPunch)
 */
type PunchOutcome = 'kill' | 'stun' | 'bounce';

interface EnemyAi {
  update(e: Entity, dt: number, world: World): void;
  sprite(): SpriteRef;
  onHit?(e: Entity, dir: Dir, world: World): PunchOutcome;
  harmless?(): boolean;
}

interface Thrown {
  rot: number;
  spin: number;
  dir: Dir;
}

const cx = (r: Rect): number => r.x + r.w / 2;

/** Fase determinística [0..1) a partir da posição para dessincronizar ciclos. */
function phase01(x: number, y: number): number {
  const v = Math.sin(x * 0.0713 + y * 0.0539) * 43758.5453;
  return v - Math.floor(v);
}

/** Empurra levemente em X no 1º frame caso uma hitbox mais larga que 16px nasça encostada em parede. */
function unstuckSpawnX(e: Entity, world: World): void {
  const r0 = Math.floor(e.y / TILE);
  const r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  const txL = Math.floor(e.x / TILE);
  const txR = Math.floor((e.x + e.w - 0.001) / TILE);
  if (txL >= txR) return;
  let solidL = false;
  let solidR = false;
  for (let ty = r0; ty <= r1; ty++) {
    if (world.level.isSolid(txL, ty)) solidL = true;
    if (world.level.isSolid(txR, ty)) solidR = true;
  }
  if (solidL && !solidR) e.x = (txL + 1) * TILE;
  else if (solidR && !solidL) e.x = txR * TILE - e.w;
}

/** Há chão seguro (sólido ou one-way) à frente-abaixo e sem perigo (`isHazard`) à frente? */
function safeGroundAhead(e: Entity, dir: Dir, world: World): boolean {
  const ax = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const tx = Math.floor(ax / TILE);
  const tyBelow = Math.floor((e.y + e.h + 1) / TILE);
  if (!world.level.isSolid(tx, tyBelow) && !world.level.isOneWay(tx, tyBelow)) return false;
  if (world.level.isHazard(tx, tyBelow)) return false;
  const r0 = Math.floor(e.y / TILE);
  const r1 = Math.floor((e.y + e.h - 0.001) / TILE);
  for (let ty = r0; ty <= r1; ty++) {
    if (world.level.isHazard(tx, ty)) return false;
  }
  return true;
}

function fall(e: Entity, dt: number, world: World) {
  e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
  return moveBody(e, world.level, dt);
}

function guardDead(e: Entity, world: World): void {
  if (e.y > world.level.heightPx + 60) e.dead = true;
}

/** Monta a entidade de um inimigo da Sampa com arremesso ao morrer, colisão e renderização. */
function buildSampaEnemy(
  kind: SampaEnemyKind,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number,
  makeAi: (e: Entity) => EnemyAi,
  deathSfx: 'hit' | 'squeak' = 'hit',
): Entity {
  let thrown: Thrown | null = null;
  let ai!: EnemyAi;

  const e: Entity = {
    kind,
    dead: false,
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (thrown) {
        e.vy = Math.min(e.vy + GRAV * dt, 520);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        thrown.rot += thrown.spin * dt;
        if (e.y > world.level.heightPx + 60) e.dead = true;
        return;
      }
      ai.update(e, dt, world);
    },
    draw(ctx, world) {
      const s = ai.sprite();
      const size = world.sprites.size(s.name);
      const sx = e.x + e.w / 2 - size.w / 2;
      const sy = e.y + e.h - size.h;
      if (thrown) {
        ctx.save();
        ctx.translate(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2));
        ctx.rotate(thrown.rot);
        world.sprites.draw(ctx, s.name, s.frame, -size.w / 2, -size.h / 2, thrown.dir < 0);
        ctx.restore();
        return;
      }
      world.sprites.draw(ctx, s.name, s.frame, sx, sy, s.flip);
    },
    onPunch(world, dir) {
      if (thrown) return false;
      if (ai.onHit) {
        const res = ai.onHit(e, dir, world);
        if (res === 'bounce') return false;
        if (res === 'stun') return true;
      }
      thrown = { rot: 0, spin: dir * 12, dir };
      e.vx = dir * 150;
      e.vy = -210;
      world.audio.play(deathSfx);
      world.addScore(points, cx(e), e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead || ai.harmless?.()) return;
      world.player.hurt(world, cx(e), 1);
    },
  };

  ai = makeAi(e);
  return e;
}

const RATO_LEASH = 7 * TILE;

// ── 1. Rato de Galpão: corre a 55 px/s, vira em bordas e paredes ─────────────────────
function ratoAi(e: Entity): EnemyAi {
  let dir: Dir = phase01(e.x, e.y) < 0.5 ? -1 : 1;
  let t = 0;
  let spawned = false;
  // território: o rato não se afasta mais que RATO_LEASH da toca (não invade a copa nem os checkpoints)
  const homeX = e.x;
  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      if (e.x - homeX > RATO_LEASH) dir = -1;
      else if (homeX - e.x > RATO_LEASH) dir = 1;
      e.vx = dir * 55;
      const c = fall(e, dt, world);
      if (c.left || c.right) dir = c.left ? 1 : -1;
      else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;
      guardDead(e, world);
    },
    sprite() {
      return { name: 'rato', frame: Math.floor(t / 0.09) % 2, flip: dir < 0 };
    },
  };
}

// ── 2. Carregador de Caixa: 2 socos (caixa quebra → bravo) ───────────────────────────
function carregadorAi(e: Entity, homeX: number): EnemyAi {
  type State = 'walk' | 'surprise' | 'angry';
  const RANGE = 4 * TILE;
  const WALK = 32;
  const RUN = 70;
  const SURPRISE = 0.6;

  let state: State = 'walk';
  let dir: Dir = phase01(homeX, e.y) < 0.5 ? -1 : 1;
  let timer = 0;
  let t = 0;
  let spawned = false;

  const atLimit = (d: Dir): boolean => (d > 0 ? cx(e) >= homeX + RANGE : cx(e) <= homeX - RANGE);

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;

      if (state === 'walk') {
        e.vx = dir * WALK;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;
        else if (atLimit(dir)) dir = (dir * -1) as Dir;
      } else if (state === 'surprise') {
        // knockback curto que decai rapidamente, sem cair de bordas
        e.vx *= Math.max(0, 1 - 10 * dt);
        if (Math.abs(e.vx) > 1) {
          const sd: Dir = e.vx > 0 ? 1 : -1;
          if (!safeGroundAhead(e, sd, world)) e.vx = 0;
        } else {
          e.vx = 0;
        }
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'angry';
          e.vx = 0;
        }
      } else {
        const p = world.player;
        if (!p.dead) {
          const dx = cx(p) - cx(e);
          if (Math.abs(dx) > 4) dir = dx > 0 ? 1 : -1;
        }
        // não sai do trecho, não cai de bordas e não atravessa paredes: fica parado no limite
        const blocked = atLimit(dir) || !safeGroundAhead(e, dir, world);
        e.vx = blocked ? 0 : dir * RUN;
        const c = fall(e, dt, world);
        if (c.left || c.right) e.vx = 0;
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'walk') return { name: 'carregador', frame: Math.floor(t / 0.22) % 2, flip: dir < 0 };
      if (state === 'surprise') return { name: 'carregador_bravo', frame: 0, flip: dir < 0 };
      const moving = Math.abs(e.vx) > 1;
      return { name: 'carregador_bravo', frame: moving ? Math.floor(t / 0.1) % 2 : 0, flip: dir < 0 };
    },
    onHit(_e, punchDir, world) {
      if (state !== 'walk') return 'kill';
      // caixa quebra: troca hitbox 14×24 → 12×20 mantendo pés e centro
      const feet = e.y + e.h;
      const mid = cx(e);
      e.w = 12;
      e.h = 20;
      e.x = mid - e.w / 2;
      e.y = feet - e.h;

      state = 'surprise';
      timer = SURPRISE;
      dir = (punchDir * -1) as Dir; // vira para quem bateu
      e.vx = safeGroundAhead(e, punchDir, world) ? punchDir * 60 : 0;
      e.vy = -30;
      world.audio.play('crate');
      world.fx('debris', mid, e.y + 4);
      world.spawn(createPopCoin(mid - 4, e.y - 6));
      return 'stun';
    },
    harmless: () => state === 'surprise',
  };
}

// ── 3. Empilhadeira: indestrutível, patrulha + arrancada telegrafada ─────────────────
function empilhadeiraAi(e: Entity): EnemyAi {
  type State = 'patrol' | 'tele' | 'dash' | 'rest';
  const SIGHT = 6 * TILE;
  let state: State = 'patrol';
  let dir: Dir = phase01(e.x, e.y) < 0.5 ? -1 : 1;
  let timer = 0;
  let t = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';

      if (state === 'patrol') {
        e.vx = dir * 28;
        const c = fall(e, dt, world);
        if (c.left || c.right) dir = c.left ? 1 : -1;
        else if (c.bottom && !safeGroundAhead(e, dir, world)) dir = (dir * -1) as Dir;

        const dx = cx(p) - cx(e);
        const dy = p.y + p.h - (e.y + e.h);
        if (c.bottom && active && dx * dir > 0 && Math.abs(dx) <= SIGHT && Math.abs(dy) <= 16) {
          state = 'tele';
          timer = 0.4;
          e.vx = 0;
          world.audio.play('beep');
        }
      } else if (state === 'tele') {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'dash';
          timer = 0.6;
          world.fx('dust', cx(e) - dir * 14, e.y + e.h, (dir * -1) as Dir);
        }
      } else if (state === 'dash') {
        if (!safeGroundAhead(e, dir, world)) {
          e.vx = 0;
          state = 'rest';
          timer = 0.8;
          fall(e, dt, world);
        } else {
          e.vx = dir * 150;
          const c = fall(e, dt, world);
          timer -= dt;
          if (c.left || c.right) {
            e.vx = 0;
            state = 'rest';
            timer = 0.8;
          } else if (c.bottom && !safeGroundAhead(e, dir, world)) {
            e.vx = 0;
            state = 'rest';
            timer = 0.8;
          } else if (timer <= 0) {
            e.vx = 0;
            state = 'rest';
            timer = 0.8;
          }
        }
      } else {
        e.vx = 0;
        fall(e, dt, world);
        timer -= dt;
        if (timer <= 0) {
          state = 'patrol';
          dir = (dir * -1) as Dir; // vira após descansar para não repetir contra parede/borda
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'tele' || state === 'dash') return { name: 'empilhadeira_dash', frame: 0, flip: dir < 0 };
      const frame = state === 'patrol' ? Math.floor(t / 0.18) % 2 : 0;
      return { name: 'empilhadeira', frame, flip: dir < 0 };
    },
    onHit(_e, punchDir, world) {
      world.audio.play('hit');
      world.fx('impact', cx(e) - punchDir * (e.w / 2), e.y + e.h / 2, punchDir);
      return 'bounce';
    },
  };
}

// ── Projétil do Arremessador (`pacote`): arco, socável (+10 pts) ─────────────────────
function createPacote(spawnX: number, spawnY: number, dir: Dir): Entity {
  let t = 0;
  const d: Entity = {
    kind: 'pacote',
    dead: false,
    x: spawnX - 4,
    y: spawnY - 4,
    w: 8,
    h: 8,
    vx: 90 * dir,
    vy: -200,
    update(dt, world) {
      t += dt;
      d.vy = Math.min(d.vy + PKG_GRAV * dt, MAX_FALL);
      const c = moveBody(d, world.level, dt);
      if (c.bottom || c.top || c.left || c.right) {
        world.fx('debris', d.x + d.w / 2, d.y + d.h / 2);
        d.dead = true;
      } else if (d.y > world.level.heightPx + 60 || d.x < -24 || d.x > world.level.widthPx + 24) {
        d.dead = true;
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'pacote', Math.floor(t / 0.1) % 2, d.x, d.y);
    },
    onPunch(world) {
      if (d.dead) return false;
      d.dead = true;
      world.audio.play('hit');
      world.fx('debris', d.x + d.w / 2, d.y + d.h / 2);
      world.addScore(10, d.x + d.w / 2, d.y);
      return true;
    },
    onTouchPlayer(world) {
      if (d.dead || world.player.dead) return;
      d.dead = true;
      world.player.hurt(world, d.x + d.w / 2, 1);
    },
  };
  return d;
}

// ── 4. Arremessador de Encomendas: parado, espera 1,6 s → aviso 0,45 s → pacote ──────
function arremessadorAi(e: Entity, homeX: number): EnemyAi {
  type State = 'wait' | 'warn' | 'release';
  const RANGE = 8 * TILE;
  const WAIT = 1.6;
  const WARN = 0.45;
  const RELEASE = 0.25;

  let state: State = 'wait';
  let timer = 0.4 + phase01(homeX, e.y) * 1.0;
  let face: Dir = -1;
  let t = 0;
  let spawned = false;

  return {
    update(_e, dt, world) {
      if (!spawned) {
        spawned = true;
        unstuckSpawnX(e, world);
      }
      t += dt;
      const p = world.player;
      const active = !p.dead && world.state.scene === 'playing';
      const dx = cx(p) - cx(e);

      e.vx = 0;
      fall(e, dt, world);

      if (state !== 'release' && !p.dead && Math.abs(dx) > 1) face = dx >= 0 ? 1 : -1;

      if (state === 'wait') {
        if (active && Math.abs(dx) <= RANGE) {
          timer -= dt;
          if (timer <= 0) {
            state = 'warn';
            timer = WARN;
          }
        } else {
          // fora de alcance: o ciclo espera pronto, sem passar de WAIT
          timer = Math.min(Math.max(timer, 0.35), WAIT);
        }
      } else if (state === 'warn') {
        timer -= dt;
        if (timer <= 0) {
          state = 'release';
          timer = RELEASE;
          world.audio.play('throw');
          world.spawn(createPacote(cx(e) + face * 6, e.y + 4, face));
        }
      } else {
        timer -= dt;
        if (timer <= 0) {
          state = 'wait';
          timer = WAIT;
        }
      }

      guardDead(e, world);
    },
    sprite() {
      if (state === 'warn') return { name: 'arremessador_throw', frame: 0, flip: face < 0 };
      if (state === 'release') return { name: 'arremessador_throw', frame: 1, flip: face < 0 };
      return { name: 'arremessador', frame: Math.floor(t / 0.3) % 2, flip: face < 0 };
    },
  };
}

/** (centerX, footY) = centro horizontal e base dos pés. CONTRATO: assinatura e `kind` não mudam. */
export function createSampaEnemy(kind: SampaEnemyKind, centerX: number, footY: number): Entity {
  switch (kind) {
    case 'rato':
      return buildSampaEnemy(kind, centerX - 6, footY - 8, 12, 8, 100, ratoAi, 'squeak');
    case 'carregador':
      return buildSampaEnemy(kind, centerX - 7, footY - 24, 14, 24, 500, (e) => carregadorAi(e, centerX));
    case 'empilhadeira':
      return buildSampaEnemy(kind, centerX - 14, footY - 24, 28, 24, 0, empilhadeiraAi);
    case 'arremessador':
      return buildSampaEnemy(kind, centerX - 6, footY - 20, 12, 20, 400, (e) => arremessadorAi(e, centerX));
  }
}
