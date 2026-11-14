import type { Entity, Player, PlayerState, Rect, World } from '../core/types';
import { PHYS, PLAYER_H, PLAYER_W, TILE } from '../core/constants';
import { moveBody } from '../core/physics';
import type { Input } from '../core/input';

/** Ajuste fino de game feel (o envelope de pulo continua o de PHYS). */
export const FEEL = {
  /** aceleração no chão (px/s²) — atinge runMax em ~0.12s */
  groundAccel: 950,
  /** desaceleração sem input no chão */
  groundFriction: 1100,
  /** aceleração ao inverter a direção no chão (derrapagem curta) */
  turnAccel: 1800,
  /** aceleração no ar (controle aéreo reduzido) */
  airAccel: 620,
  /** arrasto no ar sem input (mantém a inércia) */
  airDrag: 160,
  /** fator que corta vy ao soltar o pulo subindo */
  jumpCut: 0.55,
  coyote: 0.1,
  jumpBuffer: 0.1,
  /** limiar de |vx| para idle ⇄ run */
  runThreshold: 8,
  /** soco */
  punchTime: 0.22,
  punchWindup: 0.04,
  punchActive: 0.1,
  /** dano */
  hurtTime: 0.35,
  invulnTime: 1.5,
  knockbackX: 120,
  knockbackY: 170,
  /** salto de morte */
  deathVy: 280,
  /** sequência de vitória */
  drinkWalk: 50,
  drinkSip: 1.8,
  /** velocidade de queda a partir da qual o pouso faz som/poeira */
  landFxVy: 170,
} as const;

/** Sprite do corpo 20x24 centralizado na base da hitbox. */
const SPR_W = 20;
const SPR_H = 24;

type DrinkPhase = 'walk' | 'sip' | 'done';

/** Pardo — implementa a interface `Player` com a máquina de estados do PLAN §4. */
export class PardoPlayer implements Player {
  x = 0;
  y = 0;
  w = PLAYER_W;
  h = PLAYER_H;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  state: PlayerState = 'idle';
  onGround = false;
  invuln = 0;
  dead = false;

  /** Incrementa a cada soco (game.ts usa para "1× por alvo por soco"). */
  punchId = 0;
  /** true quando a sequência `drink` terminou. */
  drinkDone = false;

  private coyoteT = 0;
  private bufferT = 0;
  private jumping = false;
  private punchT = 0;
  private hurtT = 0;
  private stateT = 0;
  private animT = 0;
  private standingOn: Entity | null = null;
  private drinkPhase: DrinkPhase = 'done';
  private drinkX = 0;
  private drinkT = 0;

  constructor(x: number, y: number) {
    this.respawn(x, y);
  }

  /** Reinicia o Pardo em (x,y) = canto sup. esq. da hitbox. */
  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.state = 'idle';
    this.onGround = false;
    this.invuln = 0;
    this.dead = false;
    this.punchId = 0;
    this.drinkDone = false;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.jumping = false;
    this.punchT = 0;
    this.hurtT = 0;
    this.stateT = 0;
    this.animT = 0;
    this.standingOn = null;
    this.drinkPhase = 'done';
  }

  get centerX(): number {
    return this.x + this.w / 2;
  }

  // ── API de Player ──────────────────────────────────────────────────────────
  hurt(world: World, sourceX: number, amount = 1): void {
    if (this.dead || this.invuln > 0 || this.state === 'drink' || world.state.scene !== 'playing') return;
    const st = world.state;
    st.hydration = Math.max(0, st.hydration - amount);
    if (st.hydration <= 0) {
      this.kill(world);
      return;
    }
    const dir: 1 | -1 = this.centerX >= sourceX ? 1 : -1;
    this.vx = dir * FEEL.knockbackX;
    this.vy = -FEEL.knockbackY;
    this.facing = dir === 1 ? -1 : 1;
    this.onGround = false;
    this.standingOn = null;
    this.jumping = false;
    this.punchT = 0;
    this.hurtT = FEEL.hurtTime;
    this.invuln = FEEL.invulnTime;
    this.setState('hurt');
    world.audio.play('hurt');
    world.shake(2, 0.15);
  }

  kill(world: World): void {
    if (this.dead || this.state === 'drink') return;
    this.dead = true;
    this.vx = 0;
    this.vy = -FEEL.deathVy;
    this.onGround = false;
    this.standingOn = null;
    this.punchT = 0;
    this.invuln = 0;
    this.setState('dead');
    world.audio.play('die');
    world.shake(3, 0.25);
  }

  heal(world: World, n: number): number {
    const st = world.state;
    const before = st.hydration;
    st.hydration = Math.min(st.maxHydration, st.hydration + Math.max(0, n));
    return st.hydration - before;
  }

  // ── Extras usados por game.ts ──────────────────────────────────────────────
  /** Inicia a sequência de vitória: anda até targetX (centro) e bebe. */
  startDrink(targetX: number): void {
    if (this.dead) return;
    this.drinkX = targetX;
    this.drinkPhase = 'walk';
    this.drinkT = 0;
    this.drinkDone = false;
    this.punchT = 0;
    this.hurtT = 0;
    this.invuln = 0;
    this.jumping = false;
    this.setState('drink');
  }

  /** Caixa de acerto do soco (só na fase ativa), senão null. */
  punchBox(): Rect | null {
    if (this.state !== 'punch') return null;
    const t = FEEL.punchTime - this.punchT;
    if (t < FEEL.punchWindup || t >= FEEL.punchWindup + FEEL.punchActive) return null;
    const w = 20;
    const h = 12;
    const x = this.facing === 1 ? this.x + this.w - 2 : this.x + 2 - w;
    return { x, y: this.y + 4, w, h };
  }

  // ── Simulação ──────────────────────────────────────────────────────────────
  update(dt: number, world: World, input: Input): void {
    this.animT += dt;
    this.stateT += dt;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    if (this.dead) {
      // salto de morte: sem colisão
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      this.y += this.vy * dt;
      return;
    }

    if (this.state === 'drink') {
      this.updateDrink(dt, world);
      return;
    }

    const left = input.down('left');
    const right = input.down('right');
    const dirIn = (right ? 1 : 0) - (left ? 1 : 0);

    // timers
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    this.coyoteT = this.onGround ? FEEL.coyote : Math.max(0, this.coyoteT - dt);
    this.bufferT = input.pressed('jump') ? FEEL.jumpBuffer : Math.max(0, this.bufferT - dt);

    const inHurt = this.hurtT > 0;
    const punching = this.punchT > 0;
    const punchRecovery = punching && FEEL.punchTime - this.punchT >= FEEL.punchWindup + FEEL.punchActive;

    // soco
    if (!inHurt && !punching && input.pressed('punch')) {
      this.punchT = FEEL.punchTime;
      this.punchId++;
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      this.setState('punch');
      world.audio.play('punch');
    }
    const lockedPunch = this.punchT > 0 && !punchRecovery;

    // movimento horizontal
    if (inHurt) {
      // sem controle; leve arrasto
      this.vx = approach(this.vx, 0, FEEL.airDrag * dt);
    } else if (this.punchT > 0) {
      if (this.onGround) this.vx = approach(this.vx, 0, FEEL.groundFriction * 2 * dt); // trava no chão
      // no ar mantém a inércia
    } else {
      if (dirIn !== 0) this.facing = dirIn > 0 ? 1 : -1;
      const target = dirIn * PHYS.runMax;
      let rate: number;
      if (this.onGround) {
        if (dirIn === 0) rate = FEEL.groundFriction;
        else if (Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dirIn) rate = FEEL.turnAccel;
        else rate = FEEL.groundAccel;
      } else {
        rate = dirIn === 0 ? FEEL.airDrag : FEEL.airAccel;
      }
      this.vx = approach(this.vx, target, rate * dt);
    }

    // pulo (permitido também na recuperação do soco)
    if (!inHurt && !lockedPunch && this.bufferT > 0 && (this.onGround || this.coyoteT > 0)) {
      this.vy = -PHYS.jumpVel;
      this.jumping = true;
      this.onGround = false;
      this.coyoteT = 0;
      this.bufferT = 0;
      this.standingOn = null;
      if (this.punchT > 0) this.punchT = 0;
      this.setState('jump');
      world.audio.play('jump');
      world.fx('dust', this.centerX, this.y + this.h - 2, (this.facing === 1 ? -1 : 1));
    }
    // pulo variável: soltou subindo → corta
    if (this.jumping && this.vy < 0 && !input.down('jump')) {
      this.vy *= FEEL.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    this.physics(dt, world);

    // perigos
    if (this.touchesHazard(world) || this.y > world.level.heightPx + 32) {
      this.kill(world);
      return;
    }

    // estado
    if (this.state === 'hurt' && !inHurt && this.hurtT === 0) this.setState(this.onGround ? 'idle' : 'fall');
    if (this.state === 'punch' && this.punchT === 0) this.setState(this.locomotionState());
    if (this.state !== 'hurt' && this.state !== 'punch') {
      const next = this.locomotionState();
      if (next !== this.state) this.setState(next);
    }
  }

  private locomotionState(): PlayerState {
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    return Math.abs(this.vx) > FEEL.runThreshold ? 'run' : 'idle';
  }

  private setState(s: PlayerState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  /** Gravidade, carregamento por plataforma, colisão com tiles e com topos de plataformas. */
  private physics(dt: number, world: World): void {
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    const prevBottom = this.y + this.h;

    // carregado pela plataforma em que estava em pé
    const plat = this.standingOn;
    if (plat && !plat.dead && plat.platform) {
      const dx = plat.dx ?? 0;
      const dy = plat.dy ?? 0;
      if (dx !== 0 || dy !== 0) {
        const carry = { x: this.x, y: this.y, w: this.w, h: this.h, vx: dx, vy: dy };
        moveBody(carry, world.level, 1, { oneWay: false });
        this.x = carry.x;
        this.y = carry.y;
      }
    }

    this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
    const col = moveBody(this, world.level, dt);
    this.onGround = col.bottom;
    this.standingOn = null;

    // topo de plataformas (one-way), inclusive subindo contra o Pardo
    if (!this.onGround && this.vy >= 0) {
      const bottom = this.y + this.h;
      let best: Entity | null = null;
      for (const e of world.entities) {
        if (!e.platform || e.dead) continue;
        if (this.x + this.w <= e.x || this.x >= e.x + e.w) continue;
        const prevTop = e.y - (e.dy ?? 0);
        if (prevBottom <= prevTop + 1 && bottom >= e.y && (!best || e.y < best.y)) best = e;
      }
      if (best) {
        this.y = best.y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.standingOn = best;
      }
    }
    if (this.standingOn) this.standingOn.onStand?.(world);

    if (this.onGround && !wasGround) {
      this.jumping = false;
      if (fallSpeed > FEEL.landFxVy) {
        world.audio.play('land');
        world.fx('dust', this.centerX, this.y + this.h - 2);
      }
    }
  }

  private touchesHazard(world: World): boolean {
    const lv = world.level;
    const x0 = Math.floor((this.x + 2) / TILE);
    const x1 = Math.floor((this.x + this.w - 2) / TILE);
    const y0 = Math.floor((this.y + 4) / TILE);
    const y1 = Math.floor((this.y + this.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (lv.isHazard(tx, ty)) return true;
    }
    return false;
  }

  private updateDrink(dt: number, world: World): void {
    this.drinkT += dt;
    if (this.drinkPhase === 'walk') {
      const d = this.drinkX - this.centerX;
      if (this.onGround && (Math.abs(d) < 1.5 || this.drinkT > 2.5)) {
        this.vx = 0;
        this.drinkPhase = 'sip';
        this.drinkT = 0;
        this.facing = 1;
      } else if (this.onGround) {
        this.facing = d > 0 ? 1 : -1;
        this.vx = Math.sign(d) * Math.min(FEEL.drinkWalk, Math.abs(d) / dt);
      } else {
        this.vx = approach(this.vx, 0, FEEL.airDrag * dt);
      }
    } else {
      this.vx = 0;
      if (this.drinkPhase === 'sip' && this.drinkT >= FEEL.drinkSip) {
        this.drinkPhase = 'done';
        this.drinkDone = true;
      }
    }
    this.physics(dt, world);
    if (this.y > world.level.heightPx + 32) {
      // segurança: nunca deveria cair durante a vitória
      this.drinkPhase = 'done';
      this.drinkDone = true;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, world: World): void {
    // pisca enquanto invulnerável
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln * 20) % 2 === 0) return;
    const sx = Math.round(this.x + this.w / 2 - SPR_W / 2);
    const sy = Math.round(this.y + this.h - SPR_H);
    const flip = this.facing === -1;
    const spr = world.sprites;
    let name = 'pardo_idle';
    let frame = 0;
    switch (this.state) {
      case 'idle':
        name = 'pardo_idle';
        frame = Math.floor(this.animT * 2);
        break;
      case 'run':
        name = 'pardo_run';
        frame = Math.floor(this.animT * (6 + Math.abs(this.vx) / 16));
        break;
      case 'jump':
        name = 'pardo_jump';
        break;
      case 'fall':
        name = 'pardo_fall';
        break;
      case 'punch':
        name = 'pardo_punch';
        break;
      case 'hurt':
        name = 'pardo_hurt';
        break;
      case 'dead':
        name = 'pardo_dead';
        break;
      case 'drink':
        if (this.drinkPhase === 'walk' && this.onGround && Math.abs(this.vx) > 1) {
          name = 'pardo_run';
          frame = Math.floor(this.animT * 8);
        } else if (this.drinkPhase === 'walk') {
          name = this.onGround ? 'pardo_idle' : 'pardo_fall';
        } else {
          name = 'pardo_drink';
          frame = Math.floor(this.drinkT * 3);
        }
        break;
    }
    if (spr.has(name)) spr.draw(ctx, name, frame, sx, sy, flip);

    // punho gigante na fase ativa (e um quadro antes/depois para leitura)
    if (this.state === 'punch' && spr.has('fist')) {
      const t = FEEL.punchTime - this.punchT;
      if (t >= FEEL.punchWindup * 0.5 && t < FEEL.punchWindup + FEEL.punchActive + 0.03) {
        const fw = 12;
        const fy = sy + 8;
        const fx = flip ? sx - fw + 2 : sx + SPR_W - 2;
        spr.draw(ctx, 'fist', 0, fx, fy, flip);
      }
    }
  }
}

function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

export function createPlayer(x: number, y: number): PardoPlayer {
  return new PardoPlayer(x, y);
}
