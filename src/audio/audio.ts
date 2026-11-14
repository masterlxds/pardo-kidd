import type { AudioApi, SfxName } from '../core/types';

/**
 * Áudio 100% Web Audio API (sem arquivos externos).
 *  - SFX: osciladores + ruído branco com envelopes curtos.
 *  - Música: chiptune original em baião (~120 BPM, 4/4), sequenciador com look-ahead.
 */

type AudioCtor = typeof AudioContext;

interface WebAudioWindow {
  AudioContext?: AudioCtor;
  webkitAudioContext?: AudioCtor;
}

interface Graph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  /** barramento da música; recriado a cada stopMusic para silenciar notas já agendadas */
  music: GainNode;
  readonly noise: AudioBuffer;
  readonly pulse: PeriodicWave;
}

type Note = readonly [midi: number, steps: number];

const MASTER_GAIN = 0.5;
const SFX_GAIN = 0.8;
const MUSIC_GAIN = 0.25;

const BPM = 120;
/** colcheia de semicolcheia (16avo) em segundos */
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS_PER_LOOP = 8;
const LOOP_STEPS = STEPS_PER_BAR * BARS_PER_LOOP;
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const FLOOR = 0.0001;
const ATTACK = 0.004;

/* ----------------------------------------------------------------------------
 * Música original: "Chamada do Sertão" — Ré mixolídio (D E F# G A B C).
 * Frase A (cc. 1–4): D D G A      Frase B (cc. 5–8): D G C D
 * Melodia em pulso 25%; baixo em triângulo com a célula do baião;
 * zabumba (ruído grave) e triângulo agudo (tic) em semicolcheias.
 * Notação: [midi, semicolcheias]; midi 0 = pausa.
 * ------------------------------------------------------------------------- */

const PHRASE_A: readonly (readonly Note[])[] = [
  [[74, 3], [72, 1], [69, 4], [71, 2], [74, 2], [71, 2], [69, 2]],
  [[67, 2], [69, 2], [71, 4], [74, 4], [71, 2], [69, 2]],
  [[74, 2], [71, 2], [67, 4], [71, 4], [74, 4]],
  [[76, 4], [74, 2], [71, 2], [69, 4], [66, 2], [64, 2]],
];

const PHRASE_B: readonly (readonly Note[])[] = [
  [[78, 2], [76, 2], [74, 4], [71, 2], [69, 2], [71, 2], [74, 2]],
  [[79, 3], [76, 1], [74, 4], [71, 4], [67, 4]],
  [[72, 4], [76, 2], [79, 2], [84, 4], [79, 2], [76, 2]],
  [[81, 2], [79, 2], [78, 2], [76, 2], [74, 4], [69, 2], [74, 2]],
];

/** Raiz do baixo por compasso (D2 = 38). Acordes: D, D, G, A | D, G, C, D */
const BASS_ROOTS: readonly number[] = [38, 38, 43, 45, 38, 43, 36, 38];

/** Célula rítmica do baião por meio-compasso: [semicolcheia, intervalo, duração]. */
const BASS_CELL: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [4, 7, 2],
  [6, 0, 2],
  [8, 0, 3],
  [12, 7, 2],
  [14, 0, 2],
];

const MELODY: (Note | undefined)[] = new Array<Note | undefined>(LOOP_STEPS).fill(undefined);
{
  let pos = 0;
  for (const bar of [...PHRASE_A, ...PHRASE_B]) {
    for (const [midi, steps] of bar) {
      if (midi > 0) MELODY[pos] = [midi, steps];
      pos += steps;
    }
  }
}

function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/* ----------------------------------------------------------------------------
 * Blocos de síntese
 * ------------------------------------------------------------------------- */

/** Envelope exponencial de ataque curto e queda até o piso. */
function envelope(gain: GainNode, t: number, peak: number, dur: number): void {
  gain.gain.setValueAtTime(FLOOR, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
  gain.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
}

function osc(
  g: Graph,
  dest: AudioNode,
  type: OscillatorType,
  f0: number,
  t: number,
  dur: number,
  peak: number,
  f1?: number,
): void {
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const amp = g.ctx.createGain();
  envelope(amp, t, peak, dur);
  o.connect(amp);
  amp.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(
  g: Graph,
  dest: AudioNode,
  t: number,
  dur: number,
  peak: number,
  filter: BiquadFilterType,
  f0: number,
  f1?: number,
): void {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const flt = g.ctx.createBiquadFilter();
  flt.type = filter;
  flt.Q.value = 0.8;
  flt.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const amp = g.ctx.createGain();
  envelope(amp, t, peak, dur);
  src.connect(flt);
  flt.connect(amp);
  amp.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

interface Tone {
  readonly f: number;
  readonly d: number;
  readonly peak: number;
  readonly type: OscillatorType;
}

const tone = (f: number, d: number, peak: number, type: OscillatorType = 'square'): Tone => ({
  f,
  d,
  peak,
  type,
});

/** Sequência de notas em série, a partir de t. */
function seq(g: Graph, t: number, tones: readonly Tone[]): void {
  let at = t;
  for (const tn of tones) {
    osc(g, g.sfx, tn.type, tn.f, at, tn.d, tn.peak);
    at += tn.d;
  }
}

/* ----------------------------------------------------------------------------
 * Efeitos sonoros
 * ------------------------------------------------------------------------- */

function crumble(g: Graph, t: number): void {
  const { ctx } = g;
  const dur = 0.5;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 380;
  flt.Q.value = 2;
  // tremolo: ganho base 0.25 com LFO de ±0.25 (18 Hz)
  const trem = ctx.createGain();
  trem.gain.value = 0.25;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 18;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.25;
  lfo.connect(lfoDepth);
  lfoDepth.connect(trem.gain);
  // fade-out
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(1, t);
  fade.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(flt);
  flt.connect(trem);
  trem.connect(fade);
  fade.connect(g.sfx);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
  lfo.start(t);
  lfo.stop(t + dur + 0.02);
}

function squawk(g: Graph, t: number): void {
  const { ctx } = g;
  const dur = 0.36;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(500, t + dur);
  // vibrato rápido
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 28;
  const depth = ctx.createGain();
  depth.gain.value = 60;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const amp = ctx.createGain();
  envelope(amp, t, 0.16, dur + 0.04);
  o.connect(amp);
  amp.connect(g.sfx);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.06);
  lfo.stop(t + dur + 0.06);
}

function boing(g: Graph, t: number): void {
  const { ctx } = g;
  const dur = 0.4;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(800, t + 0.1);
  o.frequency.exponentialRampToValueAtTime(250, t + 0.35);
  const amp = ctx.createGain();
  envelope(amp, t, 0.3, dur);
  o.connect(amp);
  amp.connect(g.sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX: Record<SfxName, (g: Graph, t: number) => void> = {
  // pulo: sweep ascendente curto
  jump: (g, t) => osc(g, g.sfx, 'square', 220, t, 0.14, 0.2, 660),
  // soco: whoosh de ruído + thump grave
  punch: (g, t) => {
    noise(g, g.sfx, t, 0.13, 0.35, 'lowpass', 1400, 300);
    osc(g, g.sfx, 'triangle', 150, t, 0.14, 0.45, 45);
  },
  // acerto: impacto seco agudo
  hit: (g, t) => {
    osc(g, g.sfx, 'square', 1800, t, 0.05, 0.22, 900);
    noise(g, g.sfx, t, 0.03, 0.18, 'highpass', 4000);
  },
  // bloco quebrando: ruído crocante descendente
  break: (g, t) => {
    noise(g, g.sfx, t, 0.3, 0.35, 'highpass', 6000, 1500);
    osc(g, g.sfx, 'square', 300, t, 0.2, 0.12, 80);
  },
  // moeda: B5 -> E6
  coin: (g, t) => {
    seq(g, t, [tone(987.77, 0.07, 0.2), tone(1318.51, 0.4, 0.2)]);
  },
  // gota: gotinha com sweep para cima
  water: (g, t) => {
    osc(g, g.sfx, 'sine', 500, t, 0.12, 0.3, 1400);
    osc(g, g.sfx, 'triangle', 400, t + 0.03, 0.1, 0.2, 1200);
  },
  // dano: descendente dissonante (sawtooth + square em trítono)
  hurt: (g, t) => {
    osc(g, g.sfx, 'sawtooth', 392, t, 0.25, 0.2, 180);
    osc(g, g.sfx, 'square', 466, t, 0.3, 0.12, 200);
  },
  // morte: queda melódica (~0.8s)
  die: (g, t) => {
    seq(g, t, [
      tone(659, 0.1, 0.2),
      tone(587, 0.1, 0.2),
      tone(523, 0.1, 0.2),
      tone(494, 0.12, 0.2),
      tone(440, 0.4, 0.2),
    ]);
  },
  crumble: (g, t) => crumble(g, t),
  // pouso: thump curto e grave
  land: (g, t) => {
    osc(g, g.sfx, 'sine', 150, t, 0.08, 0.35, 60);
    noise(g, g.sfx, t, 0.05, 0.12, 'lowpass', 300);
  },
  // início: arpejo ascendente de Ré
  start: (g, t) => {
    seq(g, t, [
      tone(293.66, 0.09, 0.16),
      tone(369.99, 0.09, 0.16),
      tone(440, 0.09, 0.16),
      tone(587.33, 0.3, 0.16),
    ]);
  },
  // vitória: fanfarra curta (~1.5s), com oitava grave em triângulo
  win: (g, t) => {
    const top: Tone[] = [
      tone(587.33, 0.14, 0.16),
      tone(739.99, 0.14, 0.16),
      tone(880, 0.14, 0.16),
      tone(1174.66, 0.35, 0.16),
      tone(1108.73, 0.12, 0.16),
      tone(1174.66, 0.6, 0.18),
    ];
    seq(g, t, top);
    seq(
      g,
      t,
      top.map((n) => tone(n.f / 2, n.d, 0.25, 'triangle')),
    );
  },
  // derrota: frase descendente triste (~1.5s)
  gameover: (g, t) => {
    seq(g, t, [
      tone(440, 0.3, 0.3, 'triangle'),
      tone(415.3, 0.3, 0.3, 'triangle'),
      tone(392, 0.3, 0.3, 'triangle'),
      tone(349.23, 0.6, 0.3, 'triangle'),
    ]);
  },
  // checkpoint: duas notas alegres
  checkpoint: (g, t) => {
    seq(g, t, [tone(784, 0.1, 0.18), tone(1046.5, 0.22, 0.18)]);
  },
  // grito de ave: sawtooth com vibrato rápido descendente
  squawk: (g, t) => squawk(g, t),
  // mola: sine com sweep sobe-desce
  boing: (g, t) => boing(g, t),
};

/* ----------------------------------------------------------------------------
 * Música
 * ------------------------------------------------------------------------- */

function bassNote(g: Graph, midi: number, t: number, steps: number): void {
  osc(g, g.music, 'triangle', midiToHz(midi), t, steps * STEP * 0.95, 0.5);
}

function zabumba(g: Graph, t: number, level: number): void {
  noise(g, g.music, t, 0.16, 0.5 * level, 'lowpass', 260, 80);
  osc(g, g.music, 'sine', 110, t, 0.12, 0.4 * level, 55);
}

function tic(g: Graph, t: number, peak: number): void {
  osc(g, g.music, 'triangle', 2200, t, 0.025, peak);
}

function melodyNote(g: Graph, midi: number, t: number, steps: number): void {
  const { ctx } = g;
  const dur = steps * STEP;
  const o = ctx.createOscillator();
  o.setPeriodicWave(g.pulse);
  o.frequency.setValueAtTime(midiToHz(midi), t);
  const amp = ctx.createGain();
  const peak = 0.4;
  amp.gain.setValueAtTime(FLOOR, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
  amp.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.7);
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur * 0.95);
  o.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function scheduleStep(g: Graph, step: number, t: number): void {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const root = BASS_ROOTS[bar % BASS_ROOTS.length] ?? 38;

  for (const [bs, interval, len] of BASS_CELL) {
    if (bs === s) bassNote(g, root + interval, t, len);
  }

  // zabumba: tempos fortes (0, 8) e gancho sincopado (6, 14)
  if (s === 0 || s === 8) zabumba(g, t, 1);
  else if (s === 6 || s === 14) zabumba(g, t, 0.5);

  // triângulo: tic em semicolcheias, acento nos contratempos (4, 12)
  if (s === 4 || s === 12) tic(g, t, 0.1);
  else if (s % 2 === 0) tic(g, t, 0.06);
  else tic(g, t, 0.035);

  const note = MELODY[step];
  if (note) melodyNote(g, note[0], t, note[1]);
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Onda pulso com 25% de ciclo útil (série de Fourier, sem componente DC). */
function makePulse(ctx: AudioContext): PeriodicWave {
  const N = 48;
  const duty = 0.25;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeMusicBus(ctx: AudioContext, master: GainNode): GainNode {
  const bus = ctx.createGain();
  bus.gain.value = MUSIC_GAIN;
  bus.connect(master);
  return bus;
}

function audioCtor(): AudioCtor | null {
  const w: WebAudioWindow = window;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/* ----------------------------------------------------------------------------
 * API
 * ------------------------------------------------------------------------- */

export function createAudio(): AudioApi {
  let graph: Graph | null = null;
  let muted = false;
  let musicWanted = false;
  let timer: number | null = null;
  let nextStep = 0;
  let nextTime = 0;

  /** Cria o AudioContext e o grafo na primeira chamada; null se não houver suporte. */
  function ensureGraph(): Graph | null {
    if (graph) return graph;
    const Ctor = audioCtor();
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = SFX_GAIN;
    sfx.connect(master);
    graph = {
      ctx,
      master,
      sfx,
      music: makeMusicBus(ctx, master),
      noise: makeNoise(ctx),
      pulse: makePulse(ctx),
    };
    return graph;
  }

  function tick(): void {
    const g = graph;
    if (!g) return;
    const horizon = g.ctx.currentTime + LOOKAHEAD_S;
    while (nextTime < horizon) {
      scheduleStep(g, nextStep, nextTime);
      nextTime += STEP;
      nextStep = (nextStep + 1) % LOOP_STEPS;
    }
  }

  function startScheduler(): void {
    const g = graph;
    if (!g || timer !== null) return;
    nextStep = 0;
    nextTime = g.ctx.currentTime + 0.05;
    timer = window.setInterval(tick, TICK_MS);
    tick();
  }

  function stopScheduler(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  return {
    unlock(): void {
      const g = ensureGraph();
      if (!g) return;
      if (g.ctx.state === 'suspended') {
        g.ctx.resume().catch(() => undefined);
      }
      if (musicWanted) startScheduler();
    },

    play(name: SfxName): void {
      const g = graph;
      if (!g) return;
      SFX[name](g, g.ctx.currentTime + 0.01);
    },

    startMusic(): void {
      musicWanted = true;
      startScheduler();
    },

    stopMusic(): void {
      musicWanted = false;
      stopScheduler();
      const g = graph;
      if (g) {
        // desconecta o barramento: notas já agendadas são silenciadas na hora
        g.music.disconnect();
        g.music = makeMusicBus(g.ctx, g.master);
      }
    },

    setMuted(m: boolean): void {
      muted = m;
      const g = graph;
      if (g) {
        g.master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, g.ctx.currentTime, 0.02);
      }
    },

    get muted(): boolean {
      return muted;
    },
  };
}
