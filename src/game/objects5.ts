import type { Entity, World } from '../core/types';
import { LEVEL5_RAMP_COLS } from './level5';
import {
  UBER,
  UBER_BARREIRA,
  UBER_ISOPOR,
  UBER_OBSTACLES,
  uberRampOffset,
  type UberObstacleKind,
  type UberZone,
} from './uberRules';

/**
 * Objetos da Fase 5 — Marginal de São Paulo (dono: agente OBJECTS).
 * Carro da Uber, obstáculos, barreira, isopor, rampa, caminhão-baú, placas de tutorial e desembarque.
 * Números (zonas que ferem, rampa, caminhão) em src/game/uberRules.ts. Design: gdd_bestiario_fase5.md §2, §4, §5.
 * `left` = canto esquerdo da célula do marcador (px de mundo).
 *
 * Linhas do mapa (level_design_fase5.md): teto do carro y = 144 · asfalto 160..176 · mureta 176..192.
 * game.ts testa toque e soco com `overlaps(caixa, entidade)` sobre (x, y, w, h): por isso o retângulo
 * de cada perigo é EXATAMENTE a zona de uberRules.ts e o desenho é posicionado em volta dela.
 */

const T = UBER.tile;
/** y do topo do asfalto (linha 10) */
const ROAD_Y = 160;
/** base das rodas do carro e do caminhão (afundam 8 px no asfalto) */
const WHEEL_BASE_Y = ROAD_Y + 8;
/** y do topo da mureta (linha 11) */
const WALL_Y = 176;
/** inícios das rampas em px de mundo (borda esquerda da célula do `J`) */
const RAMP_STARTS_PX: readonly number[] = LEVEL5_RAMP_COLS.map((c) => c * T);

function base(kind: string, x: number, y: number, w: number, h: number): Omit<Entity, 'update' | 'draw'> {
  return { kind, x, y, w, h, vx: 0, vy: 0, dead: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Retângulo absoluto de uma zona relativa à célula. */
function zoneRect(z: UberZone, left: number): { x: number; y: number; w: number; h: number } {
  return { x: left + z.dx, y: z.y, w: z.w, h: z.h };
}

/** Hash inteiro determinístico de uma coluna (variação visual estável entre renascimentos). */
function hashCol(col: number): number {
  let h = Math.imul(col | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Fase atual da sequência de bebida do Pardo (exposta por PardoPlayer.drinkStage). */
function drinkStage(world: World): string | undefined {
  return (world.player as Partial<{ drinkStage: string }>).drinkStage;
}

function playerCenterX(world: World): number {
  return world.player.x + world.player.w / 2;
}

/**
 * Carro preto da Uber (kind 'uber_car', 64x24). NÃO é plataforma do sistema genérico: o chão do Pardo é
 * calculado por player.ts (UBER.roofY − uberRampOffset). O carro apenas se desenha centrado sob o Pardo,
 * todo passo, em qualquer lugar da fase (game.ts o isenta do culling por distância).
 */
export function createUberCar(centerX: number): Entity {
  let lastCamX: number | null = null;
  /** velocidade estimada da rolagem (px/s), suavizada */
  let scrollV = 0;
  /** inclinação visual atual (px, + = nariz para cima) */
  let tilt = 0;
  let rampOff = 0;
  let dustTimer = 0.18;

  const e: Entity = {
    ...base('uber_car', centerX - 32, UBER.roofY, 64, 24),
    update(dt, world) {
      // Velocidade da rolagem = deslocamento da câmera entre passos
      const camX = world.camera.x;
      if (lastCamX !== null && dt > 0) {
        const v = (camX - lastCamX) / dt;
        scrollV += (v - scrollV) * Math.min(1, dt * 20);
      }
      lastCamX = camX;

      const cx = playerCenterX(world);
      rampOff = uberRampOffset(cx, RAMP_STARTS_PX);
      e.x = cx - 32;
      e.y = UBER.roofY - rampOff;

      // Inclinação ±2 px: acelera → nariz sobe; freia → nariz desce
      const rel = world.player.vx - scrollV;
      const want = clamp((rel / UBER.steer) * 2, -2, 2);
      tilt += (want - tilt) * Math.min(1, dt * 10);

      const rolling = scrollV > 1 && world.state.scene === 'playing';
      if (rolling && rampOff <= 0) {
        dustTimer -= dt;
        if (dustTimer <= 0) {
          dustTimer = 0.18;
          // poeira na roda traseira; de vez em quando uma faísca (impacto) no escapamento
          world.fx('dust', e.x + 12, WHEEL_BASE_Y - 2, -1);
          if (hashCol(Math.floor(world.time * 10)) % 5 === 0) world.fx('impact', e.x + 2, WHEEL_BASE_Y - 4, -1);
        }
      } else {
        dustTimer = Math.min(dustTimer, 0.05);
      }
    },
    draw(ctx, world) {
      const rx = Math.round(e.x);
      const ry = Math.round(e.y);
      const rolling = scrollV > 1 && world.state.scene === 'playing';

      ctx.save();

      // Sombra no asfalto (encolhe e some conforme o carro sobe na rampa)
      const shadowK = clamp(1 - rampOff / UBER.rampHeight, 0.3, 1);
      const sw = Math.round((e.w - 8) * shadowK);
      ctx.fillStyle = `rgba(8, 10, 20, ${0.45 * shadowK})`;
      ctx.fillRect(rx + 32 - Math.round(sw / 2), WHEEL_BASE_Y - 2, sw, 3);

      // Cone de luz dos faróis à frente (44 px)
      const hx = rx + e.w - 2;
      const hy = ry + 11 - Math.round(tilt);
      const grad = ctx.createLinearGradient(hx, hy, hx + 44, hy);
      grad.addColorStop(0, 'rgba(255, 230, 130, 0.22)');
      grad.addColorStop(1, 'rgba(255, 230, 130, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 2);
      ctx.lineTo(hx + 44, hy - 9);
      ctx.lineTo(hx + 44, hy + 11);
      ctx.lineTo(hx, hy + 3);
      ctx.closePath();
      ctx.fill();

      // Lanterna traseira (mais forte ao frear)
      const brake = tilt < -0.5;
      ctx.fillStyle = brake ? 'rgba(255, 60, 60, 0.45)' : 'rgba(230, 50, 50, 0.25)';
      ctx.fillRect(rx - 6, ry + 10 + Math.round(tilt), 6, 5);

      // Carro com cisalhamento vertical em torno do centro: ±2 px nas pontas
      const k = -tilt / 32;
      const pivX = rx + 32;
      const pivY = ry + 24;
      ctx.translate(pivX, pivY);
      ctx.transform(1, k, 0, 1, 0, 0);
      ctx.translate(-pivX, -pivY);
      const frame = rolling ? Math.floor(world.time * 18) % 2 : 0;
      world.sprites.draw(ctx, 'uber_car', frame, rx, ry);

      ctx.restore();
    },
  };
  return e;
}

/** Obstáculo indestrutível (L, F, G, i): fere ao toque na zona de UBER_OBSTACLES e atravessa. */
export function createObstaculo(tipo: UberObstacleKind, left: number): Entity {
  const z = zoneRect(UBER_OBSTACLES[tipo], left);
  const col = Math.floor(left / T);
  const placaFrame = hashCol(col) & 1;

  const e: Entity = {
    ...base('obst_' + tipo, z.x, z.y, z.w, z.h),
    update() {},
    draw(ctx, world) {
      const sp = world.sprites;
      switch (tipo) {
        case 'limitador':
        case 'faixa': {
          // Barra/lona nas linhas 32..44 do sprite: alinhada à zona que fere (y 130..142), acima do teto do carro.
          const name = tipo === 'limitador' ? 'obst_limitador' : 'obst_faixa';
          const sw = tipo === 'limitador' ? 16 : 32;
          const top = z.y - 32;
          // Pés dos postes até o asfalto (o sprite termina acima do teto do carro)
          ctx.fillStyle = '#2a2d36';
          ctx.fillRect(left, top + 48, 2, ROAD_Y - (top + 48));
          ctx.fillRect(left + sw - 2, top + 48, 2, ROAD_Y - (top + 48));
          sp.draw(ctx, name, 0, left, top);
          break;
        }
        case 'placa': {
          // Pórtico: dois postes nas pontas (decoração, até o asfalto) + travessa; placa pendurada cobrindo a zona.
          const postTop = ROAD_Y - 96;
          sp.draw(ctx, 'portico_post', 0, left - 16, postTop);
          sp.draw(ctx, 'portico_post', 0, left + 48, postTop);
          ctx.fillStyle = '#3a3f4c';
          ctx.fillRect(left - 8, postTop + 2, 64, 4);
          // placa 48x32 em y 80..112 ⊃ zona 82..110
          const py = z.y - 2;
          ctx.fillStyle = '#2a2d36';
          ctx.fillRect(left + 8, postTop + 6, 2, py - (postTop + 6));
          ctx.fillRect(left + 38, postTop + 6, 2, py - (postTop + 6));
          sp.draw(ctx, 'obst_placa', placaFrame, left, py);
          break;
        }
        case 'luminaria': {
          // Calha de 16x16 em y 94..110 ⊃ zona 96..110, pendurada por um cabo
          const ly = z.y - 2;
          ctx.fillStyle = '#2a2d36';
          ctx.fillRect(left + 7, UBER.camY, 2, ly - UBER.camY);
          const pulse = Math.floor(world.time * 5 + col * 0.5) & 1;
          if (pulse) {
            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(left - 4, ly + 12, 24, 10);
            ctx.restore();
          }
          sp.draw(ctx, 'obst_luminaria', pulse, left, ly);
          break;
        }
      }
    },
    onTouchPlayer(world) {
      world.player.hurt(world, e.x + e.w / 2);
    },
  };
  return e;
}

/** B — barreira da CET: fere ao toque, quebra com 1 soco (+50). */
export function createBarreira(left: number): Entity {
  const z = zoneRect(UBER_BARREIRA, left);
  /** > 0: rachada, mostrando o frame do golpe antes de sumir */
  let breaking = 0;

  const e: Entity = {
    ...base('barreira_cet', z.x, z.y, z.w, z.h),
    update(dt) {
      if (breaking > 0) {
        breaking -= dt;
        if (breaking <= 0) e.dead = true;
      }
    },
    draw(ctx, world) {
      world.sprites.draw(ctx, 'barreira_cet', breaking > 0 ? 1 : 0, left, z.y + z.h - 16);
    },
    onTouchPlayer(world) {
      if (breaking > 0) return;
      world.player.hurt(world, e.x + e.w / 2);
    },
    onPunch(world) {
      if (breaking > 0 || e.dead) return false;
      breaking = 0.08;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      world.addScore(50, cx, e.y - 4);
      world.audio.play('break');
      world.fx('debris', cx, cy);
      world.shake(1, 0.08);
      return true;
    },
  };
  return e;
}

/** W — isopor do ambulante: não fere; 1 soco = +1 gota (uma vez). */
export function createIsopor(left: number): Entity {
  const z = zoneRect(UBER_ISOPOR, left);
  const SPRITE_BASE = 148;
  let used = false;
  let shake = 0;

  const e: Entity = {
    ...base('isopor_agua', z.x, z.y, z.w, z.h),
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt);
    },
    draw(ctx, world) {
      // Suporte da mureta até a base do isopor
      ctx.fillStyle = '#4a4f5c';
      ctx.fillRect(left + 7, SPRITE_BASE, 2, WALL_Y - SPRITE_BASE);
      const off = shake > 0 ? (Math.floor(shake * 60) % 2 ? 1 : -1) : 0;
      world.sprites.draw(ctx, 'isopor_agua', used ? 1 : 0, left + off, SPRITE_BASE - 24);
    },
    onPunch(world, dir) {
      if (used) return false;
      used = true;
      shake = 0.15;
      world.player.heal(world, 1);
      world.audio.play('water');
      world.fx('splash', e.x + e.w / 2, e.y + 6, dir);
      return true;
    },
  };
  return e;
}

/** J — rampa de obra (só desenho + efeitos; a altura do voo vem de uberRampOffset). */
export function createRampa(left: number): Entity {
  const landX = left + UBER.rampCols * T;
  // Retângulo cobre decolagem e pouso, para não sumir no culling de desenho no meio do salto
  const e: Entity = {
    ...base('rampa_obra', left - 32, WALL_Y - 16, landX + 32 - (left - 32), 16),
    update() {},
    draw(ctx, world) {
      const sp = world.sprites;
      // Decolagem: canto direito em x = left, base no fim da pista
      sp.draw(ctx, 'rampa_obra', 0, left - 32, WALL_Y - 16);
      // Pouso espelhado
      sp.draw(ctx, 'rampa_obra', 0, landX, WALL_Y - 16, true);
    },
  };
  return e;
}

/**
 * Janela do caminhão-baú em posição de câmera (px de mundo), função pura de `left` (idêntica após renascer):
 * c0 = left − 320 (entra pela direita) · c1 = c0 + 96 (chega em UBER.truckScreenX, ~0,8 s) ·
 * c2 = c1 + truckBars·12·16 (começa a sair) · c3 = c2 + 128 (fora da tela; entidade some).
 */
function truckWindow(left: number): { c0: number; c1: number; c2: number; c3: number } {
  const ENTER = 96; // 0,8 s de rolagem a 120 px/s
  const EXIT = 128;
  const c0 = left - 320;
  const c1 = c0 + ENTER;
  const c2 = c1 + UBER.truckBars * UBER.barCols * T;
  return { c0, c1, c2, c3: c2 + EXIT };
}

/** T — caminhão-baú: entra quando a câmera alcança `left`, fica UBER.truckBars compassos em UBER.truckScreenX e sai. */
export function createTruckBau(left: number): Entity {
  const W = 80;
  const H = 48;
  const { c0, c1, c2, c3 } = truckWindow(left);
  let hornDone = false;
  let visible = false;

  const e: Entity = {
    ...base('truck_bau', left, WHEEL_BASE_Y - H, W, H),
    update(_dt, world) {
      const cam = world.camera.x;
      if (cam < c0) {
        visible = false;
        e.x = left;
        return;
      }
      if (!hornDone) {
        hornDone = true;
        // criado com a câmera já depois da entrada (renascer): aparece direto, sem buzina
        if (cam < c1) world.audio.play('horn');
      }
      let sx: number;
      if (cam < c1) {
        const k = (cam - c0) / (c1 - c0);
        const ease = 1 - (1 - k) * (1 - k);
        sx = 320 + (UBER.truckScreenX - 320) * ease;
      } else if (cam < c2) {
        sx = UBER.truckScreenX;
      } else {
        const d = cam - c2;
        sx = UBER.truckScreenX + (d * d) / 48;
      }
      e.x = cam + sx;
      visible = cam < c3 && sx < 320;
      if (cam >= c3) e.dead = true;
    },
    draw(ctx, world) {
      if (!visible) return;
      const bob = Math.floor(world.time * 6) & 1;
      const frame = Math.floor(world.time * 6) % 2;
      const rx = Math.round(e.x);
      ctx.fillStyle = 'rgba(8, 10, 20, 0.4)';
      ctx.fillRect(rx + 4, WHEEL_BASE_Y - 2, W - 8, 3);
      world.sprites.draw(ctx, 'truck_bau', frame, rx, e.y - bob);
    },
  };
  return e;
}

/** 1..4 — placa de tutorial (frame 0 PULE, 1 SOQUE, 2 NÃO PULE, 3 PULE+SOQUE), decoração na mureta. */
export function createTutorialSign(left: number, frame: number): Entity {
  const SIGN_Y = 100;
  const e: Entity = {
    ...base('tutorial_sign', left, SIGN_Y, 24, WALL_Y - SIGN_Y),
    update() {},
    draw(ctx, world) {
      // Poste da mureta até a placa (fica legível acima do carro e da faixa baixa)
      ctx.fillStyle = '#2a2d36';
      ctx.fillRect(left + 11, SIGN_Y + 24, 2, WALL_Y - (SIGN_Y + 24));
      world.sprites.draw(ctx, 'tutorial_sign', frame, left, SIGN_Y);
    },
  };
  return e;
}

/** A — desembarque VIP 5★ (kind 'uber_goal'): toque → world.win(). footY = y do asfalto (160). */
export function createUberGoal(centerX: number, footY: number): Entity {
  const HW = 22;
  const HH = 32;
  let won = false;
  let delivered = false;
  let idleSparkleTimer = 0.9;
  let winSparkleTimer = 0;

  const e: Entity = {
    ...base('uber_goal', centerX - HW / 2, footY - HH, HW, HH),
    update(dt, world) {
      const scene = world.state.scene;

      if (scene === 'playing') {
        idleSparkleTimer -= dt;
        if (idleSparkleTimer <= 0) {
          idleSparkleTimer = 0.9;
          world.fx('sparkle', centerX + (Math.random() - 0.5) * 16, footY - 28);
        }
        return;
      }

      if (won && (scene === 'winning' || scene === 'win')) {
        if (scene === 'winning' && !delivered) {
          delivered = true;
          world.audio.play('horn');
          world.audio.play('deliver');
        }
        const stage = drinkStage(world);
        if (scene === 'winning' && (!stage || stage === 'sip' || stage === 'done')) {
          winSparkleTimer -= dt;
          if (winSparkleTimer <= 0) {
            winSparkleTimer = 0.18;
            world.fx('sparkle', world.player.x + 5, world.player.y + 4);
          }
        }
      }
    },
    draw(ctx, world) {
      const t = world.time;

      // Halo dourado pulsante atrás do totem
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 4);
      ctx.fillStyle = '#fff4a0';
      ctx.beginPath();
      ctx.arc(centerX, footY - 20, 18 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      world.sprites.draw(ctx, 'uber_goal', Math.floor(t * 3) & 1, Math.round(centerX - 16), footY - 40);
    },
    onTouchPlayer(world) {
      if (won) return;
      world.win();
      won = world.state.scene === 'winning';
    },
  };
  return e;
}
