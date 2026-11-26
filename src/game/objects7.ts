import { STEP } from '../core/constants';
import type { Entity, Rect, World } from '../core/types';
import { overlaps } from '../core/physics';
import { drawText, textWidth } from '../gfx/font';
import { PALETTE as P } from '../gfx/palette';
import { LEVEL7_WAVES } from './level7';
import { createPlasmaOrb, createSpaceEnemy } from './enemies7';
import {
  beamSatellitePos,
  debrisPos,
  PLANET_GRAV,
  planetPos,
  satellitePos,
  solarWindAt,
  SPACE,
  SPACE_BRAKE_START_CAM_X,
  SPACE_OBSTACLES,
  SPACE_STOP_CAM_X,
  type BeamPhase,
  type PlanetDef,
  type PlanetPhase,
} from './spaceRules';

/**
 * Planetas, obstáculos e objetos da Fase 7 — Espaço Sideral (Órbita de Quixadá).
 * Dono na Etapa 2: agente OBJECTS. Todos os números e trajetórias vêm exclusivamente de `spaceRules.ts`
 * (sem `Math.random` na lógica de jogo).
 */

const HOLO_LABELS = ['MOVA 2D', 'IMPULSO', 'GRAVIDADE'] as const;

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

/** Triângulo de alerta amarelo 9×8 em pixel art (a fonte bitmap não possui o glifo `⚠`). */
function drawWarnTriangle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillStyle = P.k;
  ctx.fillRect(rx + 4, ry, 1, 1);
  ctx.fillRect(rx + 3, ry + 1, 3, 1);
  ctx.fillRect(rx + 2, ry + 2, 5, 2);
  ctx.fillRect(rx + 1, ry + 4, 7, 3);
  ctx.fillRect(rx, ry + 7, 9, 1);

  ctx.fillStyle = P.y;
  ctx.fillRect(rx + 4, ry + 1, 1, 1);
  ctx.fillRect(rx + 3, ry + 2, 3, 2);
  ctx.fillRect(rx + 2, ry + 4, 5, 2);
  ctx.fillRect(rx + 1, ry + 6, 7, 1);

  // '!' interno
  ctx.fillStyle = P.k;
  ctx.fillRect(rx + 4, ry + 2, 1, 3);
  ctx.fillRect(rx + 4, ry + 6, 1, 1);
}

/** Seta 5×7 apontando para a direita na altura exata do alerta. */
function drawRightArrow(ctx: CanvasRenderingContext2D, x: number, cy: number, color: string): void {
  const rx = Math.round(x);
  const ry = Math.round(cy) - 3;
  ctx.fillStyle = P.k;
  ctx.fillRect(rx, ry + 1, 2, 5);
  ctx.fillRect(rx + 2, ry, 2, 7);
  ctx.fillRect(rx + 4, ry + 2, 2, 3);

  ctx.fillStyle = color;
  ctx.fillRect(rx + 1, ry + 2, 2, 3);
  ctx.fillRect(rx + 3, ry + 1, 1, 5);
  ctx.fillRect(rx + 4, ry + 3, 1, 1);
}

/** Desenha alerta orbital piscante (`[triângulo] LABEL ►`) ancorado à direita em `(rightX, cy)`. */
function drawRightWarning(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  cy: number,
  label: string,
  time: number,
  urgent = false,
): void {
  const blink = Math.floor(time * (urgent ? 14 : 9)) % 2 === 0;
  const rx = Math.round(rightX);
  const y = Math.round(cy);

  if (!blink) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    drawRightArrow(ctx, rx - 5, y, P.y);
    ctx.restore();
    return;
  }

  const arrowW = 6;
  const textX = rx - arrowW - 2;
  const labelW = textWidth(label);
  const triX = textX - labelW - 11;

  drawWarnTriangle(ctx, triX, y - 4);
  drawText(ctx, label, textX, y - 3, { color: P.y, align: 'right', shadow: P.k });
  drawRightArrow(ctx, rx - arrowW, y, P.y);
}

/** Planeta Yuri (`Y`) ou Planeta Yumi (`U`) com telegraph orbital, anéis gravitacionais e linhas de tração. */
export function createPlanet(def: PlanetDef): Entity {
  const kind = def.kind === 'yuri' ? 'planet_yuri' : 'planet_yumi';
  const d = PLANET_GRAV.radius * 2;
  const triggerX = def.col * SPACE.tile + SPACE.tile / 2;
  let lastPhase: PlanetPhase = 'inactive';
  let pos = planetPos(0, def);

  const e: Entity = {
    ...base(kind, triggerX - PLANET_GRAV.radius, def.y - PLANET_GRAV.radius, d, d),
    update(_dt, world) {
      pos = planetPos(world.camera.x, def);
      if (lastPhase === 'inactive' && pos.phase === 'warn') {
        world.audio.play('grav_warn');
      }
      lastPhase = pos.phase;

      if (pos.phase === 'done') {
        e.dead = true;
        return;
      }
      if (pos.phase === 'warn' || pos.phase === 'active') {
        e.x = pos.worldX - PLANET_GRAV.radius;
        e.y = pos.y - PLANET_GRAV.radius;
      }
    },
    draw(ctx, world) {
      if (e.dead || pos.phase === 'inactive' || pos.phase === 'done') return;

      if (pos.phase === 'warn') {
        const label = def.kind === 'yuri' ? 'YURI' : 'YUMI';
        drawRightWarning(ctx, world.camera.x + SPACE.viewW - 4, pos.y, label, world.time, pos.warnLeft < 0.4);
        return;
      }

      const cx = Math.round(pos.worldX);
      const cy = Math.round(pos.y);
      const isYuri = def.kind === 'yuri';
      const ringColA = isYuri ? P.y : P.Z;
      const ringColB = isYuri ? P.m : P['&'];

      // (a) Anéis gravitacionais concêntricos tracejados contraindo dentro de R_grav
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = ringColB;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, PLANET_GRAV.rGrav, 0, Math.PI * 2);
      ctx.stroke();

      const span = PLANET_GRAV.rGrav - PLANET_GRAV.rKill;
      for (let i = 0; i < 3; i++) {
        const phase = (world.time * 0.65 + i / 3) % 1;
        const r = PLANET_GRAV.rGrav - phase * span;
        ctx.globalAlpha = 0.22 + 0.48 * Math.sin(phase * Math.PI);
        ctx.strokeStyle = i % 2 === 0 ? ringColA : ringColB;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = (isYuri ? 1 : -1) * world.time * 20 + i * 7;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // (b) Linhas sutis de tração ligando o centro do planeta ao centro do Pardo quando d < R_grav
      const px = world.player.x + world.player.w / 2;
      const py = world.player.y + world.player.h / 2;
      const dx = cx - px;
      const dy = cy - py;
      const dist = Math.hypot(dx, dy);
      if (dist < PLANET_GRAV.rGrav && dist > 1) {
        const u = Math.max(0, Math.min(1, 1 - (dist - PLANET_GRAV.rKill) / span));
        const critical = dist < PLANET_GRAV.critical;
        const nx = -dy / dist;
        const ny = dx / dist;
        ctx.save();
        ctx.strokeStyle = critical ? P.w : ringColB;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -world.time * (36 + 64 * u);
        for (let k = -1; k <= 1; k++) {
          ctx.globalAlpha = (k === 0 ? 0.35 : 0.18) + (critical ? 0.3 : 0.25 * u);
          ctx.beginPath();
          ctx.moveTo(px + nx * k * 4, py + ny * k * 4);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // (d) Sprite 48×48 do planeta
      const frame = Math.floor(world.time * 2) & 1;
      world.sprites.draw(ctx, kind, frame, Math.round(pos.worldX - PLANET_GRAV.radius), Math.round(pos.y - PLANET_GRAV.radius));

      // (c) Anel vermelho/branco sutil no raio letal R_kill (21 px)
      ctx.save();
      const pulse = (Math.floor(world.time * 8) & 1) === 0;
      ctx.globalAlpha = 0.42 + 0.16 * Math.sin(world.time * 10);
      ctx.strokeStyle = pulse ? P.r : P.w;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.lineDashOffset = world.time * 14;
      ctx.beginPath();
      ctx.arc(cx, cy, PLANET_GRAV.rKill, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    onPunch() {
      return false;
    },
  };
  return e;
}

/** W — Cápsula de Água Espacial (16×16): não fere; tocar ou socar cura +1 gota e soma 100 pts. */
export function createWaterCapsule(cx: number, cy: number): Entity {
  const s = SPACE_OBSTACLES.water_capsule;
  const collect = (world: World): void => {
    if (e.dead) return;
    e.dead = true;
    world.player.heal(world, s.heal);
    world.audio.play('water');
    world.fx('splash', cx, cy);
    world.addScore(100, cx, cy - 8);
  };

  const e: Entity = {
    ...base('water_capsule', cx - s.w / 2, cy - s.h / 2, s.w, s.h),
    update() {},
    draw(ctx, world) {
      if (e.dead) return;
      const bob = Math.round(Math.sin(world.time * 3 + cx) * 2);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(world.time * 5 + cx);
      ctx.fillStyle = P.c;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      world.sprites.draw(ctx, 'water_capsule', Math.floor(world.time * 4) & 1, e.x, e.y + bob);
    },
    onTouchPlayer(world) {
      collect(world);
    },
    onPunch(world) {
      if (e.dead) return false;
      collect(world);
      return true;
    },
  };
  return e;
}

/** K — Boia de Checkpoint Orbital (16×24): acende verde ao Pardo cruzar `cx`. */
export function createBeacon(cx: number, cy: number): Entity {
  const s = SPACE_OBSTACLES.space_beacon;
  const e: Entity = {
    ...base('space_beacon', cx - s.w / 2, cy - s.h / 2, s.w, s.h),
    update() {},
    draw(ctx, world) {
      const active = world.player.x + world.player.w / 2 >= cx;
      if (active) {
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.14 * Math.sin(world.time * 6);
        ctx.fillStyle = P['1'];
        ctx.beginPath();
        ctx.arc(cx, cy - 6, 10 + Math.sin(world.time * 6) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      world.sprites.draw(ctx, 'space_beacon', active ? 1 : 0, e.x, e.y);
    },
  };
  return e;
}

/** A — Estação Espacial de Quixadá — EEIQ (80×64): objetivo final com o Sachê de Água Espacial na escotilha. */
export function createStation(cx: number, cy: number): Entity {
  const s = SPACE_OBSTACLES.eeiq_station;
  let won = false;
  let fxTimer = 0.7;

  const e: Entity = {
    ...base('eeiq_station', cx - s.w / 2, cy - s.h / 2, s.w, s.h),
    update(dt, world) {
      if (world.state.scene === 'playing') {
        fxTimer -= dt;
        if (fxTimer <= 0) {
          fxTimer = 0.9;
          world.fx('sparkle', e.x + 14, cy);
        }
      }
    },
    draw(ctx, world) {
      const t = world.time;
      world.sprites.draw(ctx, 'eeiq_station', Math.floor(t * 3) & 1, e.x, e.y);
      if (world.state.scene === 'playing') {
        const bob = Math.round(Math.sin(t * 4) * 1.5);
        const px = Math.round(e.x + 8);
        const py = Math.round(cy - 8 + bob);
        ctx.save();
        ctx.globalAlpha = 0.26 + 0.1 * Math.sin(t * 5);
        ctx.fillStyle = P.c;
        ctx.beginPath();
        ctx.arc(px + 6, py + 8, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        world.sprites.draw(ctx, 'water_pouch', 0, px, py);
      }
    },
    onTouchPlayer(world) {
      if (won) return;
      if (world.camera.x < SPACE_STOP_CAM_X) return;
      const px = world.player.x + world.player.w / 2;
      const py = world.player.y + world.player.h / 2;
      if (Math.hypot(px - (e.x + 12), py - cy) > 14) return;
      world.win();
      won = world.state.scene === 'winning';
    },
  };
  return e;
}

/** t — Holograma de Tutorial (24×24, 3 quadros): decoração sem colisão com legenda curta abaixo. */
export function createHoloSign(cx: number, cy: number, frame: number): Entity {
  const f = Math.max(0, Math.min(HOLO_LABELS.length - 1, Math.floor(frame)));
  const label = HOLO_LABELS[f] ?? HOLO_LABELS[0];
  const e: Entity = {
    ...base('holo_sign', cx - 12, cy - 12, 24, 24),
    update() {},
    draw(ctx, world) {
      const shimmer = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(world.time * 12 + cx * 0.1));
      ctx.save();
      ctx.globalAlpha = shimmer;
      world.sprites.draw(ctx, 'holo_sign', f, e.x, e.y);
      drawText(ctx, label, Math.round(cx), Math.round(e.y + e.h + 2), {
        color: P.c,
        align: 'center',
        shadow: P.k,
      });
      ctx.restore();
    },
  };
  return e;
}

/** s — Satélite em Órbita (indestrutível; posição pura via `satellitePos`). */
export function createSatellite(cx: number, cy: number): Entity {
  const s = SPACE_OBSTACLES.satellite;
  let active = false;

  const e: Entity = {
    ...base('satellite', cx - s.w / 2, cy - s.h / 2, s.w, s.h),
    update(_dt, world) {
      const pos = satellitePos(world.camera.x, cx, cy);
      active = pos.phase === 'active';
      if (!active) return;
      e.x = pos.worldX - e.w / 2;
      e.y = pos.y - e.h / 2;
      if (pos.screenX < -48) e.dead = true;
    },
    draw(ctx, world) {
      if (!active || e.dead) return;
      const sz = world.sprites.size('satellite');
      const frame = Math.floor(world.time * 4 + cx * 0.05) & 1;
      world.sprites.draw(ctx, 'satellite', frame, e.x + e.w / 2 - sz.w / 2, e.y + e.h / 2 - sz.h / 2);
    },
    onTouchPlayer(world) {
      if (!active || e.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world) {
      if (!active || e.dead) return false;
      world.audio.play('clang');
      world.fx('impact', e.x + e.w / 2, e.y + e.h / 2);
      return false;
    },
  };
  return e;
}

/** d — Lixo Espacial (indestrutível; posição pura via `debrisPos`). */
export function createDebris(cx: number, cy: number): Entity {
  const s = SPACE_OBSTACLES.space_debris;
  let active = false;

  const e: Entity = {
    ...base('space_debris', cx - s.w / 2, cy - s.h / 2, s.w, s.h),
    update(_dt, world) {
      const pos = debrisPos(world.camera.x, cx, cy);
      active = pos.phase === 'active';
      if (!active) return;
      e.x = pos.worldX - e.w / 2;
      e.y = pos.y - e.h / 2;
      if (pos.screenX < -48) e.dead = true;
    },
    draw(ctx, world) {
      if (!active || e.dead) return;
      const sz = world.sprites.size('space_debris');
      const frame = Math.floor(world.time * 3 + cx * 0.05) & 1;
      world.sprites.draw(ctx, 'space_debris', frame, e.x + e.w / 2 - sz.w / 2, e.y + e.h / 2 - sz.h / 2);
    },
    onTouchPlayer(world) {
      if (!active || e.dead) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world) {
      if (!active || e.dead) return false;
      world.audio.play('clang');
      world.fx('impact', e.x + e.w / 2, e.y + e.h / 2);
      return false;
    },
  };
  return e;
}

export function createBeamSatellite(cx: number, cy: number): Entity {
  let st = beamSatellitePos(0, cx, cy);
  let wasActive = false;
  let prevPhase: BeamPhase = 'off';

  const e: Entity = {
    ...base('satellite_beam', st.bodyBox.x, st.bodyBox.y, st.bodyBox.w, st.bodyBox.h),
    update(_dt, world) {
      st = beamSatellitePos(world.camera.x, cx, cy);
      if (!st.active) {
        if (wasActive) e.dead = true;
        prevPhase = 'off';
        return;
      }
      wasActive = true;

      if (st.beamPhase !== prevPhase) {
        if (st.beamPhase === 'charge') world.audio.play('laser_charge');
        else if (st.beamPhase === 'fire') world.audio.play('laser_fire');
        prevPhase = st.beamPhase;
      }

      if (st.beamPhase === 'fire') {
        const minX = Math.min(st.bodyBox.x, st.beamBox.x);
        const minY = Math.min(st.bodyBox.y, st.beamBox.y);
        const maxX = Math.max(st.bodyBox.x + st.bodyBox.w, st.beamBox.x + st.beamBox.w);
        const maxY = Math.max(st.bodyBox.y + st.bodyBox.h, st.beamBox.y + st.beamBox.h);
        e.x = minX;
        e.y = minY;
        e.w = maxX - minX;
        e.h = maxY - minY;
      } else {
        e.x = st.bodyBox.x;
        e.y = st.bodyBox.y;
        e.w = st.bodyBox.w;
        e.h = st.bodyBox.h;
      }
    },
    draw(ctx, world) {
      if (!st.active || e.dead) return;
      const bb = st.beamBox;
      if (st.beamPhase === 'charge') {
        const lx = Math.round(bb.x + bb.w / 2);
        ctx.save();
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(world.time * 18);
        ctx.strokeStyle = P.r;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -world.time * 24;
        ctx.beginPath();
        ctx.moveTo(lx, bb.y);
        ctx.lineTo(lx, bb.y + bb.h);
        ctx.stroke();
        ctx.restore();
      } else if (st.beamPhase === 'fire') {
        const bx = Math.round(bb.x);
        const by = Math.round(bb.y);
        const coreW = (Math.floor(world.time * 24) & 1) === 0 ? 6 : 4;
        const coreX = Math.round(bx + (bb.w - coreW) / 2);
        ctx.fillStyle = P.R;
        ctx.fillRect(bx, by, bb.w, bb.h);
        ctx.fillStyle = P.r;
        ctx.fillRect(bx + 1, by, bb.w - 2, bb.h);
        ctx.fillStyle = P.w;
        ctx.fillRect(coreX, by, coreW, bb.h);
      }

      const sz = world.sprites.size('satellite_beam');
      const frame = st.beamPhase === 'off' ? 0 : 1;
      world.sprites.draw(
        ctx,
        'satellite_beam',
        frame,
        st.bodyBox.x + st.bodyBox.w / 2 - sz.w / 2,
        st.bodyBox.y + st.bodyBox.h / 2 - sz.h / 2,
      );
    },
    onTouchPlayer(world) {
      if (!st.active || e.dead) return;
      const hitBody = overlaps(world.player, st.bodyBox);
      const hitBeam = st.beamPhase === 'fire' && overlaps(world.player, st.beamBox);
      if (hitBody || hitBeam) world.player.hurt(world, st.worldX);
    },
    onPunch(world) {
      if (!st.active || e.dead) return false;
      const pbox = (world.player as Partial<{ punchBox: (camX?: number) => Rect | null }>).punchBox?.(world.camera.x);
      if (pbox && !overlaps(pbox, st.bodyBox)) return false;
      world.audio.play('clang');
      world.fx('impact', st.bodyBox.x + st.bodyBox.w / 2, st.bodyBox.y + st.bodyBox.h / 2);
      return false;
    },
  };
  return e;
}

/** v — Rajada de Vento Solar (telegrafada 1,0 s e ativa 1,4 s via `solarWindAt`). */
export function createSolarWind(cx: number, cy: number): Entity {
  const V = SPACE_OBSTACLES.solar_wind;
  let wind = solarWindAt(0, cx, cy);

  const e: Entity = {
    ...base('solar_wind', cx - V.w / 2, wind.yTop, V.w, V.h),
    update(_dt, world) {
      wind = solarWindAt(world.camera.x, cx, cy);
      if (wind.phase === 'done') {
        e.dead = true;
        return;
      }
      if (wind.phase === 'warn' || wind.phase === 'active') {
        e.x = world.camera.x;
        e.y = wind.yTop;
        e.w = SPACE.viewW;
        e.h = V.h;
      }
    },
    draw(ctx, world) {
      if (e.dead || wind.phase === 'inactive' || wind.phase === 'done') return;
      const leftX = world.camera.x;

      if (wind.phase === 'warn') {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = P.y;
        ctx.fillRect(leftX, wind.yTop, SPACE.viewW, V.h);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = P.y;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = world.time * 36;
        ctx.beginPath();
        ctx.moveTo(leftX, wind.yTop + 0.5);
        ctx.lineTo(leftX + SPACE.viewW, wind.yTop + 0.5);
        ctx.moveTo(leftX, wind.yBottom - 0.5);
        ctx.lineTo(leftX + SPACE.viewW, wind.yBottom - 0.5);
        ctx.stroke();
        ctx.restore();

        drawRightWarning(ctx, leftX + SPACE.viewW - 4, wind.y, 'VENTO SOLAR', world.time, wind.elapsed > 0.6);
        return;
      }

      const sz = world.sprites.size('solar_wind_tile');
      const frame = Math.floor(world.time * 12) & 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftX, wind.yTop, SPACE.viewW, V.h);
      ctx.clip();
      ctx.globalAlpha = 0.85;
      const startX = leftX - ((world.time * 220) % sz.w);
      for (let tx = startX; tx < leftX + SPACE.viewW; tx += sz.w) {
        world.sprites.draw(ctx, 'solar_wind_tile', frame, tx, wind.y - sz.h / 2);
      }
      ctx.restore();
    },
    onTouchPlayer(world) {
      if (wind.phase !== 'active' || e.dead) return;
      world.player.shove(world, V.pushVx, 0, STEP);
      world.player.hurt(world, world.camera.x + SPACE.viewW);
    },
  };
  return e;
}

/**
 * N — Nave-Mãe Alienígena (64×56): escolta nos compassos 50–61 sem ferir pelo corpo e dispara
 * determinísticamente as ondas declaradas em `LEVEL7_WAVES`.
 */
export function createMothership(cx: number): Entity {
  const S = SPACE_OBSTACLES.mothership;
  const enterCamX = (50 - 1) * SPACE.barCols * SPACE.tile;
  const exitCamX = SPACE_BRAKE_START_CAM_X;
  const enterDist = SPACE.scrollSpeed;
  const firedWaves = new Set<number>();
  let hornPlayed = false;
  let visible = false;
  let retreatT = 0;
  let sparkTimer = 0;

  const e: Entity = {
    ...base('mothership', cx - S.w / 2, SPACE.viewH / 2 - S.h / 2, S.w, S.h),
    update(dt, world) {
      const camX = world.camera.x;

      // Disparo determinístico de LEVEL7_WAVES (D16)
      for (let i = 0; i < LEVEL7_WAVES.length; i++) {
        if (firedWaves.has(i)) continue;
        const w = LEVEL7_WAVES[i];
        if (!w) continue;
        const waveCamX = ((w.bar - 1) * SPACE.barCols + (w.beat - 1) * SPACE.beatCols) * SPACE.tile;
        if (camX >= waveCamX) {
          firedWaves.add(i);
          if (w.kind === 'plasma_orb') {
            world.audio.play('ufo_zap');
            world.spawn(createPlasmaOrb(waveCamX + SPACE.motherScreenX - 24, w.y));
          } else {
            world.spawn(createSpaceEnemy(w.kind, waveCamX + SPACE.viewW, w.y));
          }
        }
      }

      if (camX < enterCamX) {
        visible = false;
        e.x = cx - S.w / 2;
        return;
      }

      if (!hornPlayed) {
        hornPlayed = true;
        if (camX < enterCamX + enterDist) world.audio.play('horn');
      }

      let screenCenterX: number;
      if (camX < enterCamX + enterDist) {
        const k = (camX - enterCamX) / enterDist;
        const ease = 1 - (1 - k) * (1 - k);
        const startX = SPACE.viewW + S.w / 2;
        screenCenterX = startX + (SPACE.motherScreenX - startX) * ease;
      } else if (camX < exitCamX) {
        screenCenterX = SPACE.motherScreenX;
      } else {
        retreatT += dt;
        screenCenterX = SPACE.motherScreenX + 140 * retreatT * retreatT + 80 * retreatT;
        sparkTimer -= dt;
        if (sparkTimer <= 0) {
          sparkTimer = 0.14;
          const off = (Math.floor(retreatT * 20) % 3) - 1;
          world.fx('impact', e.x + 12, e.y + S.h / 2 + off * 10);
        }
      }

      const centerY = SPACE.viewH / 2 + Math.sin(world.time * 2.2) * 8;
      e.x = camX + screenCenterX - S.w / 2;
      e.y = centerY - S.h / 2;
      visible = screenCenterX - S.w / 2 < SPACE.viewW + 16;
      if (!visible && camX >= exitCamX) e.dead = true;
    },
    draw(ctx, world) {
      if (!visible || e.dead) return;
      const rx = Math.round(e.x);
      const ry = Math.round(e.y);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.12 * Math.sin(world.time * 10);
      ctx.fillStyle = P['1'];
      ctx.beginPath();
      ctx.arc(rx + S.w / 2, ry + S.h / 2 + 8, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      world.sprites.draw(ctx, 'mothership', Math.floor(world.time * 4) & 1, rx, ry);
    },
  };
  return e;
}
