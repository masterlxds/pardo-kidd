// Validador da Fase Bônus ("Tubo do Bonfim" — Special Stage Pseudo-3D).
// Uso: node scripts/check-bonus.mjs

const {
  BONUS_CONSTANTS,
  BONUS_STAGES,
  BONUS_TRACK_ITEMS,
  createBonusStage,
} = await import('../src/game/bonus.ts');

const errors = [];
const notes = [];
const err = (msg) => errors.push(msg);

// ── 1. Estrutura dos 3 trechos e metas [20, 45, 70] ──────────────────────────
if (!Array.isArray(BONUS_STAGES) || BONUS_STAGES.length !== 3) {
  err(`BONUS_STAGES deve ter exatamente 3 trechos, encontrado: ${BONUS_STAGES?.length}`);
} else {
  const expectedTargets = [20, 45, 70];
  for (let i = 0; i < 3; i++) {
    const st = BONUS_STAGES[i];
    if (st.stage !== i + 1) err(`Trecho ${i}: stage=${st.stage} != ${i + 1}`);
    if (st.target !== expectedTargets[i]) {
      err(`Trecho ${st.stage}: target=${st.target} != ${expectedTargets[i]}`);
    }
    if (i > 0) {
      if (!(st.target > BONUS_STAGES[i - 1].target)) {
        err(`Trecho ${st.stage}: meta não crescente (${st.target} <= ${BONUS_STAGES[i - 1].target})`);
      }
      if (st.startS !== BONUS_STAGES[i - 1].endS) {
        err(`Trecho ${st.stage}: startS=${st.startS} != endS anterior (${BONUS_STAGES[i - 1].endS})`);
      }
      if (!(st.speedMul > BONUS_STAGES[i - 1].speedMul)) {
        err(`Trecho ${st.stage}: speedMul não crescente (${st.speedMul} <= ${BONUS_STAGES[i - 1].speedMul})`);
      }
    }
  }
}

// Verifica presença de gates nos 3 checkpoints e da Esmeralda após o 3º checkpoint
const gates = BONUS_TRACK_ITEMS.filter((it) => it.kind === 'gate');
const emeralds = BONUS_TRACK_ITEMS.filter((it) => it.kind === 'emerald');
if (gates.length !== 6) err(`Esperadas 6 balizas bonus_gate (2 por checkpoint), encontrado: ${gates.length}`);
if (emeralds.length !== 1) err(`Esperada exatamente 1 bonus_emerald, encontrado: ${emeralds.length}`);
if (emeralds[0] && BONUS_STAGES[2] && !(emeralds[0].s > BONUS_STAGES[2].endS)) {
  err(`bonus_emerald (s=${emeralds[0].s}) deve ficar após o Checkpoint 3 (s=${BONUS_STAGES[2].endS})`);
}

// ── 2. Densidade de moedas por trecho e acumulada (≥ 135%) ───────────────────
const coins = BONUS_TRACK_ITEMS.filter((it) => it.kind === 'coin');
for (const c of coins) {
  if (Math.abs(c.theta) > BONUS_CONSTANTS.THETA_MAX + 1e-6) {
    err(`Moeda fora de [-1.48, +1.48] em s=${c.s}: theta=${c.theta}`);
  }
  if (c.h < 0 || c.h > 22.5) {
    err(`Moeda com altura inválida/inalcançável em s=${c.s}: h=${c.h}`);
  }
}

let cumCoins = 0;
let prevTarget = 0;
for (const st of BONUS_STAGES) {
  const stageCoins = coins.filter((c) => c.stage === st.stage && c.s > st.startS && c.s <= st.endS).length;
  cumCoins += stageCoins;
  const deltaTarget = st.target - prevTarget;
  const incRatio = stageCoins / deltaTarget;
  const cumRatio = cumCoins / st.target;
  const approxSec = (st.endS - st.startS) / (BONUS_CONSTANTS.BASE_SPEED * st.speedMul);

  notes.push(
    `trecho ${st.stage} (${st.name}, ~${approxSec.toFixed(1)}s, ${st.speedMul.toFixed(2)}x): ` +
      `+${stageCoins} moedas para +${deltaTarget} meta (${(incRatio * 100).toFixed(0)}%), ` +
      `acumulado ${cumCoins}/${st.target} (${(cumRatio * 100).toFixed(0)}%)`,
  );

  if (incRatio < 1.35) {
    err(`Trecho ${st.stage}: moedas do trecho (${stageCoins}) < 135% do incremento (${deltaTarget})`);
  }
  if (cumRatio < 1.35) {
    err(`Trecho ${st.stage}: moedas acumuladas (${cumCoins}) < 135% da meta (${st.target})`);
  }
  prevTarget = st.target;
}

// ── 3. Ondas de bombas: sem bloqueio > 60% sem corredor livre ou pulo ────────
const bombs = BONUS_TRACK_ITEMS.filter((it) => it.kind === 'bomb').slice().sort((a, b) => a.s - b.s);
if (bombs.length < 6) err(`Poucas bombas na pista (${bombs.length} < 6)`);

// Agrupa bombas próximas em distância (Δs <= 18 unidades)
const bombGroups = [];
for (const b of bombs) {
  const last = bombGroups.at(-1);
  if (last && Math.abs(b.s - last.at(-1).s) <= 18) {
    last.push(b);
  } else {
    bombGroups.push([b]);
  }
}

const ARC_MIN = -BONUS_CONSTANTS.THETA_MAX;
const ARC_MAX = BONUS_CONSTANTS.THETA_MAX;
const ARC_SPAN = ARC_MAX - ARC_MIN;
// Margem conservadora ao redor de cada bomba (colisão ±0.15 + folga de manobra = ±0.22 rad)
const BOMB_CLEARANCE = 0.22;

for (const grp of bombGroups) {
  const intervals = grp
    .map((b) => [Math.max(ARC_MIN, b.theta - BOMB_CLEARANCE), Math.min(ARC_MAX, b.theta + BOMB_CLEARANCE)])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const iv of intervals) {
    const top = merged.at(-1);
    if (top && iv[0] <= top[1]) {
      top[1] = Math.max(top[1], iv[1]);
    } else {
      merged.push([...iv]);
    }
  }

  let blocked = 0;
  let maxGap = 0;
  let cursor = ARC_MIN;
  for (const [lo, hi] of merged) {
    blocked += hi - lo;
    maxGap = Math.max(maxGap, lo - cursor);
    cursor = hi;
  }
  maxGap = Math.max(maxGap, ARC_MAX - cursor);

  const blockedFrac = blocked / ARC_SPAN;
  const allJumpable = grp.every((b) => b.h <= BONUS_CONSTANTS.BOMB_HIT_H);
  const sLabel = grp[0].s === grp.at(-1).s ? `${grp[0].s}` : `${grp[0].s}..${grp.at(-1).s}`;

  if (blockedFrac > 0.6 && !(maxGap >= 0.45 || allJumpable)) {
    err(
      `Onda de bombas em s=${sLabel} bloqueia ${(blockedFrac * 100).toFixed(1)}% (> 60%) ` +
        `sem corredor livre >= 0.45 rad (maxGap=${maxGap.toFixed(2)}) nem pulo`,
    );
  }
  if (maxGap < 0.45) {
    err(`Onda de bombas em s=${sLabel} tem maior corredor angular ${maxGap.toFixed(2)} < 0.45 rad`);
  }
}
notes.push(`ondas de bombas verificadas: ${bombGroups.length} ondas (${bombs.length} bombas no total), todas com corredor >= 0.45 rad e puláveis`);

// ── 4. Simulação real passo a passo (dt = 1/60) de createBonusStage() ────────
function makeMockCanvasCtx() {
  return {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    ellipse() {},
    arc() {},
    fill() {},
    stroke() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {},
  };
}

function makeMockWorld(initialLives = 3) {
  const sfxCounts = {};
  let fxCount = 0;
  let shakeCount = 0;
  const world = {
    time: 0,
    state: {
      scene: 'bonus',
      sceneTime: 0,
      score: 0,
      lives: initialLives,
      coins: 0,
      hydration: 3,
      maxHydration: 3,
      elapsed: 0,
      timeBonus: 0,
      muted: false,
      levelIndex: 2,
      air: 5,
      maxAir: 5,
      ribbons: 3,
      ribbonsTotal: 3,
      dialogue: null,
      difficulty: 'normal',
      bonus: {
        active: false,
        coins: 0,
        target: 20,
        stage: 1,
        cleared: false,
        endedByCheckpoint: false,
      },
    },
    audio: {
      muted: false,
      unlock() {},
      play(name) {
        sfxCounts[name] = (sfxCounts[name] ?? 0) + 1;
      },
      startMusic() {},
      stopMusic() {},
      setMuted() {},
    },
    sprites: {
      has: () => true,
      size: () => ({ w: 16, h: 16, frames: 2 }),
      draw() {},
    },
    addScore(pts) {
      world.state.score += pts;
    },
    addCoin() {
      world.state.coins += 1;
      if (world.state.coins >= 100) {
        world.state.coins -= 100;
        world.state.lives = Math.min(99, world.state.lives + 1);
      }
    },
    fx() {
      fxCount += 1;
    },
    shake() {
      shakeCount += 1;
    },
    spawn() {},
    win() {},
    say() {},
    addRibbon() {},
    sfxCounts,
    get fxCount() {
      return fxCount;
    },
    get shakeCount() {
      return shakeCount;
    },
  };
  return world;
}

function makeBotInput() {
  const downSet = new Set();
  const pressedSet = new Set();
  return {
    set(left, right, jumpPress) {
      downSet.clear();
      pressedSet.clear();
      if (left) downSet.add('left');
      if (right) downSet.add('right');
      if (jumpPress) {
        downSet.add('jump');
        pressedSet.add('jump');
      }
    },
    down: (a) => downSet.has(a),
    pressed: (a) => pressedSet.has(a),
    released: () => false,
    endStep() {
      pressedSet.clear();
    },
    clear() {
      downSet.clear();
      pressedSet.clear();
    },
    onGesture() {},
    tapPos: () => null,
    touch: false,
  };
}

// 4A. Simulação do Bot coletando moedas, desviando/pulando bombas e vencendo os 3 trechos
{
  const DT = 1 / 60;
  const stage = createBonusStage();
  const world = makeMockWorld(3);
  const input = makeBotInput();
  const ctx = makeMockCanvasCtx();

  stage.reset(world);
  // Testa render logo após reset (como ocorre em 'bonus_intro')
  stage.render(ctx, world);

  // Estado cinemático espelhado pelo bot para tomada de decisão olhando a pista à frente
  let estS = 0;
  let estSpeedMul = BONUS_STAGES[0].speedMul;
  let estTheta = 0;
  let estOmega = 0;
  let estH = 0;
  let estVh = 0;

  let result = 'running';
  let steps = 0;
  const MAX_STEPS = 4200;

  while (result === 'running' && steps < MAX_STEPS) {
    // 1. Bot olha moedas e bombas à frente em BONUS_TRACK_ITEMS
    const lookCoins = BONUS_TRACK_ITEMS.filter(
      (it) => it.kind === 'coin' && it.s >= estS - 1 && it.s <= estS + 46,
    );
    const lookBombs = BONUS_TRACK_ITEMS.filter(
      (it) => it.kind === 'bomb' && it.s >= estS - 1 && it.s <= estS + 34,
    );

    let desiredTheta = 0;
    let wantJump = false;

    // Escolhe a moeda segura mais próxima à frente
    const safeCoin = lookCoins.find((c) => {
      return !lookBombs.some(
        (b) => Math.abs(b.s - c.s) < 6 && Math.abs(b.theta - c.theta) < 0.24 && c.h <= 11,
      );
    });
    if (safeCoin) {
      desiredTheta = safeCoin.theta;
      // Se a moeda é aérea (arco alto), pula um pouco antes dela!
      const dsCoin = safeCoin.s - estS;
      if (safeCoin.h >= 10 && dsCoin >= 6 && dsCoin <= 16 && estH === 0 && Math.abs(safeCoin.theta - estTheta) < 0.3) {
        wantJump = true;
      }
    }

    // Verifica bombas perigosas no caminho imediato
    const threatBombs = lookBombs.filter((b) => b.s - estS >= 1 && b.s - estS <= 24);
    if (threatBombs.length > 0) {
      const dsNearest = threatBombs[0].s - estS;
      const onCollisionCourse = threatBombs.some((b) => Math.abs(b.theta - estTheta) < 0.25);
      if (onCollisionCourse) {
        // Se já está perto e no chão, salta por cima da bomba!
        if (dsNearest >= 5 && dsNearest <= 15 && estH === 0) {
          wantJump = true;
        } else {
          // Procura o ângulo livre mais próximo longe das bombas desta onda
          let bestCandidate = desiredTheta;
          let bestDist = Infinity;
          for (let cand = -1.25; cand <= 1.25; cand += 0.1) {
            const clear = threatBombs.every((b) => Math.abs(b.theta - cand) >= 0.34);
            if (clear && Math.abs(cand - estTheta) < bestDist) {
              bestDist = Math.abs(cand - estTheta);
              bestCandidate = cand;
            }
          }
          desiredTheta = bestCandidate;
        }
      }
    }

    // Após o Checkpoint 3, alinha no centro para a Esmeralda do Bonfim
    if (estS >= BONUS_STAGES[2].endS) {
      desiredTheta = 0;
    }

    // Controlador PD simples para apontar left/right sem oscilar
    const errTheta = desiredTheta - (estTheta + estOmega * 0.12);
    const goLeft = errTheta < -0.045;
    const goRight = errTheta > 0.045;
    input.set(goLeft, goRight, wantJump);

    // Avança 1 passo real do motor bônus
    world.time += DT;
    result = stage.update(DT, world, input);
    if (steps % 30 === 0) stage.render(ctx, world);
    input.endStep();

    // Atualiza estimativa cinemática do bot
    const stgIdx = Math.min(2, Math.max(0, world.state.bonus.stage - 1));
    const targetMul = BONUS_STAGES[stgIdx].speedMul;
    estSpeedMul += (targetMul - estSpeedMul) * Math.min(1, DT * 4.5);
    estS += BONUS_CONSTANTS.BASE_SPEED * estSpeedMul * DT;

    const dir = (goRight ? 1 : 0) - (goLeft ? 1 : 0);
    const airFactor = estH > 0 ? BONUS_CONSTANTS.AIR_CONTROL_FACTOR : 1.0;
    estOmega += (dir * BONUS_CONSTANTS.ANG_ACCEL * airFactor - BONUS_CONSTANTS.TANGENTIAL_GRAV * Math.sin(estTheta)) * DT;
    if (dir === 0) {
      estOmega *= Math.exp(-3.0 * DT);
      if (Math.abs(estTheta) < 0.015 && Math.abs(estOmega) < 0.04) {
        estTheta = 0;
        estOmega = 0;
      }
    } else if (dir * estOmega < 0) {
      estOmega += dir * 3.2 * airFactor * DT;
    }
    const maxOm = BONUS_CONSTANTS.ANG_MAX_SPEED * airFactor;
    estOmega = Math.max(-maxOm, Math.min(maxOm, estOmega));
    estTheta += estOmega * DT;
    if (estTheta >= BONUS_CONSTANTS.THETA_MAX) {
      estTheta = BONUS_CONSTANTS.THETA_MAX;
      if (estOmega > 0) estOmega = 0;
    } else if (estTheta <= -BONUS_CONSTANTS.THETA_MAX) {
      estTheta = -BONUS_CONSTANTS.THETA_MAX;
      if (estOmega < 0) estOmega = 0;
    }
    if (estH <= 0 && wantJump) {
      estVh = BONUS_CONSTANTS.JUMP_VEL;
      estH = 0.001;
    }
    if (estH > 0 || estVh > 0) {
      estVh -= BONUS_CONSTANTS.JUMP_GRAV * DT;
      estH += estVh * DT;
      if (estH <= 0) {
        estH = 0;
        estVh = 0;
      }
    }

    steps += 1;
  }

  if (result !== 'cleared') {
    err(`Simulação do bot não terminou com 'cleared' (result='${result}', steps=${steps}, coins=${world.state.bonus.coins})`);
  }
  if (world.state.bonus.cleared !== true) {
    err(`Simulação do bot: state.bonus.cleared=${world.state.bonus.cleared} != true`);
  }
  if (world.state.bonus.endedByCheckpoint !== false) {
    err(`Simulação do bot: endedByCheckpoint=${world.state.bonus.endedByCheckpoint} != false`);
  }
  if (world.state.bonus.coins < 70) {
    err(`Simulação do bot: coins=${world.state.bonus.coins} < 70`);
  }
  if (world.state.lives < 4) {
    err(`Simulação do bot: vidas finais (${world.state.lives}) não refletem o +1UP da Esmeralda`);
  }
  if ((world.sfxCounts.checkpoint ?? 0) !== 3) {
    err(`Simulação do bot: esperados 3 SFX 'checkpoint', tocados: ${world.sfxCounts.checkpoint ?? 0}`);
  }
  if ((world.sfxCounts.emerald ?? 0) !== 1 || (world.sfxCounts.oneup ?? 0) < 1) {
    err(`Simulação do bot: SFX 'emerald'/'oneup' ausentes (${JSON.stringify(world.sfxCounts)})`);
  }

  notes.push(
    `simulação bot: result='${result}' em ${(steps * DT).toFixed(1)}s (${steps} frames) | ` +
      `moedas bônus=${world.state.bonus.coins}/${cumCoins} | bombas atingidas=${world.sfxCounts.bomb ?? 0} | ` +
      `score=${world.state.score} | vidas=3→${world.state.lives}`,
  );
}

// 4B. Simulação do jogador parado (falha limpa no Checkpoint 1 sem perder vidas nem hidratação)
{
  const DT = 1 / 60;
  const stage = createBonusStage();
  const world = makeMockWorld(3);
  const input = makeBotInput();
  const ctx = makeMockCanvasCtx();

  stage.reset(world);
  input.set(false, false, false);

  let result = 'running';
  let steps = 0;
  while (result === 'running' && steps < 1500) {
    world.time += DT;
    result = stage.update(DT, world, input);
    if (steps % 45 === 0) stage.render(ctx, world);
    input.endStep();
    steps += 1;
  }

  if (result !== 'failed') {
    err(`Simulação parado: esperado 'failed' no Checkpoint 1, obtido '${result}' (coins=${world.state.bonus.coins})`);
  }
  if (world.state.bonus.endedByCheckpoint !== true) {
    err(`Simulação parado: esperado endedByCheckpoint=true, obtido ${world.state.bonus.endedByCheckpoint}`);
  }
  if (world.state.bonus.cleared !== false) {
    err(`Simulação parado: esperado cleared=false, obtido ${world.state.bonus.cleared}`);
  }
  if (world.state.lives !== 3) {
    err(`Simulação parado: perdeu vida indevidamente na Fase Bônus (lives=${world.state.lives} != 3)`);
  }
  if (world.state.hydration !== 3) {
    err(`Simulação parado: perdeu hidratação indevidamente na Fase Bônus (hydration=${world.state.hydration} != 3)`);
  }
  if ((world.sfxCounts.bomb ?? 0) < 1 || (world.sfxCounts.hurt ?? 0) < 1 || world.shakeCount < 1) {
    err(`Simulação parado: colisão com bomba central em s=295 deveria tocar 'bomb'/'hurt' e shake`);
  }

  notes.push(
    `simulação parado: result='${result}' em ${(steps * DT).toFixed(1)}s | ` +
      `moedas bônus=${world.state.bonus.coins}/20 (bomba descontou 5) | endedByCheckpoint=${world.state.bonus.endedByCheckpoint} | ` +
      `vidas=3→${world.state.lives} (intactas)`,
  );
}

// ── 5. Resumo final ──────────────────────────────────────────────────────────
console.log(`Tubo do Bonfim: ${BONUS_STAGES.length} trechos, ${coins.length} moedas, ${bombs.length} bombas, ${gates.length} gates, ${emeralds.length} esmeralda`);
for (const line of notes) console.log('  •', line);

if (errors.length > 0) {
  console.error('\nERROS:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log('bonus OK');
