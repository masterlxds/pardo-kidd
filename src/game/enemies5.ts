import type { Entity, World } from '../core/types';
import { VIEW_W } from '../core/constants';
import { LEVEL5_RAMP_COLS } from './level5';
import {
  UBER,
  UBER_DRONE,
  UBER_ENEMIES,
  UBER_PICHADOR,
  uberDronePos,
  uberEnemyBottom,
  uberEnemyHopping,
  uberEnemyX,
  uberRampOffset,
  type UberDronePhase,
  type UberLinearKind,
} from './uberRules';

/**
 * Inimigos da Fase 5 — Marginal de São Paulo (dono: agente ENEMY).
 * Todos morrem com 1 soco e têm posição (x e y) em função PURA de `world.camera.x` (src/game/uberRules.ts):
 * nenhum guarda estado que mude a trajetória. O único estado é vivo/arremessado e timers cosméticos
 * (som de entrada, bip do drone, poeira da decolagem, giro do arremesso). Motoboys e patinetes rodam no
 * ASFALTO e saltam ao chegar perto (uberEnemyBottom); só cruzam o x do carro já no ar. Design: level-5-refs/gdd_bestiario_fase5.md §1 e §3.
 *
 * game.ts já toca 'hit' e `fx('impact')` quando `onPunch` retorna true; aqui só entram os pontos
 * e os efeitos próprios (caixa: 'crate' + 'debris').
 */
export type UberEnemyKind = 'motoboy' | 'motoboy_fast' | 'patinete' | 'drone' | 'pichador';

type Dir = 1 | -1;

/** Gravidade e impulso do arremesso cosmético (o inimigo sai girando para cima e para a DIREITA da tela). */
const THROW_GRAV = 900;
const THROW_VX = UBER.speed + 90;
const THROW_VY = -210;
const THROW_SPIN = 12;

/** Fora da tela pela esquerda (com folga) → some. */
const LEFT_MARGIN = 32;
/**
 * Teto para `e.x` enquanto a posição real está além da borda direita: game.ts só atualiza/desenha
 * entidades perto da câmera usando `e.x`; sem o teto um inimigo que vem de frente "congela" longe
 * à direita e reaparece atrasado. O valor fica fora da tela (nunca é visto nem toca o Pardo) e a
 * posição real é recalculada da câmera a cada passo, então a trajetória continua pura.
 */
const RIGHT_PARK = VIEW_W + 40;

interface Thrown {
  rot: number;
}

/** Desenha um sprite com a base e o centro alinhados à hitbox. */
function drawAligned(
  e: Entity,
  world: World,
  ctx: CanvasRenderingContext2D,
  name: string,
  frame: number,
  flip: boolean,
): void {
  const size = world.sprites.size(name);
  world.sprites.draw(ctx, name, frame, e.x + e.w / 2 - size.w / 2, e.y + e.h - size.h, flip);
}

/** Desenha girando em torno do centro da hitbox (arremessado). */
function drawSpinning(
  e: Entity,
  world: World,
  ctx: CanvasRenderingContext2D,
  name: string,
  frame: number,
  flip: boolean,
  rot: number,
): void {
  const size = world.sprites.size(name);
  ctx.save();
  ctx.translate(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2));
  ctx.rotate(rot);
  world.sprites.draw(ctx, name, frame, -size.w / 2, -size.h / 2, flip);
  ctx.restore();
}

/** Passo do arremesso (cosmético; integra com dt, mas não afeta mais nada do jogo). */
function stepThrown(e: Entity, t: Thrown, dt: number, world: World): void {
  e.vy = Math.min(e.vy + THROW_GRAV * dt, 520);
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  t.rot += THROW_SPIN * dt;
  const cam = world.camera;
  if (e.y > cam.y + 220 || e.x > cam.x + VIEW_W + 64) e.dead = true;
}

function startThrow(e: Entity): Thrown {
  e.vx = THROW_VX;
  e.vy = THROW_VY;
  return { rot: 0 };
}

/** Posiciona a hitbox centrada em `cx` (com teto à direita) e marca dead depois de sair pela esquerda. */
function placeX(e: Entity, cx: number, world: World): void {
  const camX = world.camera.x;
  e.x = Math.min(cx - e.w / 2, camX + RIGHT_PARK);
  if (e.x + e.w < camX - LEFT_MARGIN) e.dead = true;
}

const onScreen = (e: Entity, world: World): boolean =>
  e.x < world.camera.x + VIEW_W && e.x + e.w > world.camera.x;

// ── Trajetória reta no asfalto + salto: motoboy, motoboy rápido, patinete ─────────────
/** Início das rampas em px de mundo (mesma conta de objects5.ts), para saber onde o carro está desenhado. */
const RAMP_STARTS_PX: readonly number[] = LEVEL5_RAMP_COLS.map((c) => c * UBER.tile);
/** Carro da Uber: 64×24, centrado sob o Pardo, teto em UBER.roofY − uberRampOffset (ver objects5.ts). */
const CAR_W = 64;
const CAR_H = 24;

/**
 * Recorta do desenho a faixa ocupada pelo carro: um veículo que ainda roda no asfalto ao lado do carro
 * (decolagem do patinete, pouso atrás do carro) fica "atrás" dele em vez de atravessá-lo.
 */
function clipOutCar(ctx: CanvasRenderingContext2D, world: World): void {
  const cx = world.player.x + world.player.w / 2;
  const carL = Math.round(cx - CAR_W / 2);
  const carT = Math.round(UBER.roofY - uberRampOffset(cx, RAMP_STARTS_PX));
  const camX = world.camera.x;
  const camY = world.camera.y;
  const x0 = camX - 64;
  const x1 = camX + VIEW_W + 64;
  const y0 = camY - 64;
  const y1 = camY + 260;
  ctx.beginPath();
  ctx.rect(x0, y0, carL - x0, y1 - y0); // à esquerda do carro
  ctx.rect(carL + CAR_W, y0, x1 - (carL + CAR_W), y1 - y0); // à direita do carro
  ctx.rect(carL, y0, CAR_W, carT - y0); // acima do carro
  ctx.rect(carL, carT + CAR_H, CAR_W, y1 - (carT + CAR_H)); // abaixo do carro
  ctx.clip();
}

function createLinear(kind: 'motoboy' | 'motoboy_fast' | 'patinete', encontroX: number): Entity {
  const spec = UBER_ENEMIES[kind];
  const jumpSprite = kind === 'motoboy' ? 'motoboy_jump' : kind === 'motoboy_fast' ? 'motoboy_fast_jump' : 'patinete_jump';
  const flip = spec.v > 0; // vem de frente → espelhado; patinete anda no mesmo sentido → sem flip
  const animDt = kind === 'motoboy_fast' ? 0.07 : 0.1;
  let thrown: Thrown | null = null;
  let revved = kind === 'patinete'; // patinete não ronca
  /** no ar neste passo (função pura da câmera); null antes do 1º update (não solta poeira ao nascer no ar) */
  let hopping: boolean | null = null;

  const e: Entity = {
    kind,
    dead: false,
    x: encontroX - spec.w / 2,
    y: spec.bottom - spec.h,
    w: spec.w,
    h: spec.h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (thrown) {
        stepThrown(e, thrown, dt, world);
        return;
      }
      const camX = world.camera.x;
      placeX(e, uberEnemyX(encontroX, spec.v, camX), world);
      e.y = uberEnemyBottom(kind, encontroX, camX) - spec.h;
      const nowHop = uberEnemyHopping(kind, encontroX, camX);
      if (hopping === false && nowHop && onScreen(e, world)) {
        // decolagem: poeira na roda de trás (a roda de trás fica do lado oposto ao sentido de marcha)
        const back: Dir = flip ? 1 : -1;
        world.fx('dust', e.x + e.w / 2 + back * (e.w / 2 - 2), spec.bottom - 2, back);
      }
      hopping = nowHop;
      if (!revved && onScreen(e, world)) {
        revved = true;
        world.audio.play('rev');
      }
    },
    draw(ctx, world) {
      const frame = Math.floor(world.time / animDt) % 2;
      if (thrown) {
        drawSpinning(e, world, ctx, hopping ? jumpSprite : kind, hopping ? 0 : frame, flip, thrown.rot);
        return;
      }
      if (hopping) {
        drawAligned(e, world, ctx, jumpSprite, 0, flip);
        return;
      }
      ctx.save();
      clipOutCar(ctx, world);
      drawAligned(e, world, ctx, kind, frame, flip);
      ctx.restore();
    },
    onPunch(world, _dir: Dir) {
      if (thrown) return false;
      thrown = startThrow(e);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2, 1);
    },
  };
  return e;
}

// ── Drone de Delivery: paira na faixa alta, avisa, rasante para a faixa baixa ─────────
function createDrone(encontroX: number): Entity {
  const D = UBER_DRONE;
  let thrown: Thrown | null = null;
  let phase: UberDronePhase = 'hover';
  let beeped = false;

  const e: Entity = {
    kind: 'drone',
    dead: false,
    x: encontroX - D.w / 2,
    y: D.hoverCy - D.h / 2,
    w: D.w,
    h: D.h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (thrown) {
        stepThrown(e, thrown, dt, world);
        return;
      }
      const p = uberDronePos(encontroX, world.camera.x);
      phase = p.phase;
      placeX(e, p.cx, world);
      e.y = p.cy - D.h / 2;
      if (phase === 'warn' && !beeped) {
        beeped = true;
        world.audio.play('beep');
      }
    },
    draw(ctx, world) {
      if (thrown) {
        drawSpinning(e, world, ctx, 'drone_dive', 0, true, thrown.rot);
        return;
      }
      if (phase === 'hover') {
        drawAligned(e, world, ctx, 'drone', Math.floor(world.time / 0.05) % 2, true);
        return;
      }
      // aviso: pisca (meia transparência alternada) · rasante/reta final: sólido
      const blinkOff = phase === 'warn' && Math.floor(world.time / 0.06) % 2 === 1;
      if (blinkOff) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        drawAligned(e, world, ctx, 'drone_dive', 0, true);
        ctx.restore();
      } else {
        drawAligned(e, world, ctx, 'drone_dive', 0, true);
      }
    },
    onPunch(world, _dir: Dir) {
      if (thrown) return false;
      thrown = startThrow(e);
      world.addScore(D.points, e.x + e.w / 2, e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2, 1);
    },
  };
  return e;
}

// ── Pichador de Rapel: DUAS entidades ─────────────────────────────────────────────────
// Corpo (kind 'pichador'): socável, fere ao toque, faixa alta.
// Spray (kind 'pichador_spray'): SEM onPunch (o soco nunca "gasta" o golpe nele), só fere ao toque;
// é criado junto com o corpo e entra no mundo via world.spawn no 1º update do corpo. Quando o corpo
// é socado, o spray é marcado dead no mesmo passo (some antes de resolveContacts).
function createPichador(encontroX: number): Entity {
  const B = UBER_PICHADOR.body;
  const S = UBER_PICHADOR.spray;
  let thrown: Thrown | null = null;
  let spawnedSpray = false;

  const spray: Entity = {
    kind: 'pichador_spray',
    dead: false,
    x: encontroX - S.w / 2,
    y: S.y,
    w: S.w,
    h: S.h,
    vx: 0,
    vy: 0,
    update(_dt, world) {
      if (thrown || body.dead) spray.dead = true;
      else if (spray.x + spray.w < world.camera.x - LEFT_MARGIN) spray.dead = true;
    },
    draw(ctx, world) {
      if (thrown) return;
      drawAligned(spray, world, ctx, 'spray_cloud', Math.floor(world.time / 0.08) % 2, true);
    },
    onTouchPlayer(world) {
      if (thrown || body.dead || world.player.dead) return;
      world.player.hurt(world, spray.x + spray.w / 2, 1);
    },
  };

  const body: Entity = {
    kind: 'pichador',
    dead: false,
    x: encontroX - B.w / 2,
    y: B.y,
    w: B.w,
    h: B.h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (!spawnedSpray) {
        spawnedSpray = true;
        world.spawn(spray);
      }
      if (thrown) {
        stepThrown(body, thrown, dt, world);
        return;
      }
      body.x = encontroX - B.w / 2;
      body.y = B.y;
      if (body.x + body.w < world.camera.x - LEFT_MARGIN) {
        body.dead = true;
        spray.dead = true;
      }
    },
    draw(ctx, world) {
      const frame = Math.floor(world.time / 0.15) % 2;
      if (thrown) {
        drawSpinning(body, world, ctx, 'pichador_rapel', frame, true, thrown.rot);
        return;
      }
      // corda do topo da tela até o topo do sprite (o sprite já desenha o trecho de cima do corpo)
      const size = world.sprites.size('pichador_rapel');
      const spriteTop = body.y + body.h - size.h;
      const top = world.camera.y - 2;
      if (spriteTop > top) {
        ctx.fillStyle = '#c8b48a';
        ctx.fillRect(Math.round(encontroX), Math.round(top), 1, Math.round(spriteTop - top) + 1);
      }
      drawAligned(body, world, ctx, 'pichador_rapel', frame, true);
    },
    onPunch(world, _dir: Dir) {
      if (thrown) return false;
      thrown = startThrow(body);
      spray.dead = true; // a nuvem some no mesmo passo
      world.addScore(UBER_PICHADOR.points, body.x + body.w / 2, body.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || world.player.dead) return;
      world.player.hurt(world, body.x + body.w / 2, 1);
    },
  };
  return body;
}

/** `encontroX` = centro da célula do marcador (ponto de encontro na posição neutra; no pichador, onde ele está pendurado). */
export function createUberEnemy(kind: UberEnemyKind, encontroX: number): Entity {
  switch (kind) {
    case 'motoboy':
    case 'motoboy_fast':
    case 'patinete':
      return createLinear(kind, encontroX);
    case 'drone':
      return createDrone(encontroX);
    case 'pichador':
      return createPichador(encontroX);
  }
}

/** Caixa arremessada pelo caminhão-baú: `alta` = faixa alta (X), senão faixa baixa (x). */
export function createCaixa(encontroX: number, alta: boolean): Entity {
  const kind: UberLinearKind = alta ? 'caixa_alta' : 'caixa_baixa';
  const spec = UBER_ENEMIES[kind];
  let thrown: Thrown | null = null;
  /** Ainda dentro do baú: invisível, sem dano, sem soco. Recalculado da câmera a cada passo. */
  let hidden = true;

  const e: Entity = {
    kind,
    dead: false,
    x: encontroX - spec.w / 2,
    y: spec.bottom - spec.h,
    w: spec.w,
    h: spec.h,
    vx: 0,
    vy: 0,
    update(dt, world) {
      if (thrown) {
        stepThrown(e, thrown, dt, world);
        return;
      }
      placeX(e, uberEnemyX(encontroX, spec.v, world.camera.x), world);
      e.y = spec.bottom - spec.h;
      hidden = e.x > world.camera.x + UBER.truckScreenX + 8;
    },
    draw(ctx, world) {
      const frame = Math.floor(world.time / 0.08) % 2;
      if (thrown) {
        drawSpinning(e, world, ctx, 'caixa', frame, true, thrown.rot);
        return;
      }
      if (hidden) return;
      drawAligned(e, world, ctx, 'caixa', frame, true);
    },
    onPunch(world, _dir: Dir) {
      if (thrown || hidden) return false;
      thrown = startThrow(e);
      world.audio.play('crate');
      world.fx('debris', e.x + e.w / 2, e.y + e.h / 2);
      world.addScore(spec.points, e.x + e.w / 2, e.y);
      return true;
    },
    onTouchPlayer(world) {
      if (thrown || hidden || world.player.dead) return;
      world.player.hurt(world, e.x + e.w / 2, 1);
    },
  };
  return e;
}
