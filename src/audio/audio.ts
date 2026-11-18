import type { MusicTrack, AudioApi, SfxName } from '../core/types';

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
/** semicolcheia (16avo) em segundos */
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
  q = 0.8,
): void {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const flt = g.ctx.createBiquadFilter();
  flt.type = filter;
  flt.Q.value = q;
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

function roar(g: Graph, t: number): void {
  const { ctx } = g;
  const dur = 0.55;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(55, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 26;
  const depth = ctx.createGain();
  depth.gain.value = 12;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const amp = ctx.createGain();
  envelope(amp, t, 0.3, dur);
  o.connect(lp);
  lp.connect(amp);
  amp.connect(g.sfx);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.04);
  lfo.stop(t + dur + 0.04);
  noise(g, g.sfx, t, dur, 0.3, 'bandpass', 420, 220, 1.4);
}

function splash(g: Graph, t: number): void {
  noise(g, g.sfx, t, 0.4, 0.35, 'bandpass', 3200, 500, 0.9);
  noise(g, g.sfx, t, 0.15, 0.2, 'highpass', 5000);
  for (let i = 0; i < 4; i++) {
    const at = t + 0.08 + i * 0.06 + Math.random() * 0.03;
    const f = 400 + Math.random() * 500;
    osc(g, g.sfx, 'sine', f, at, 0.07, 0.16, f * 2.2);
  }
}

function chomp(g: Graph, t: number): void {
  for (const dt of [0, 0.1]) {
    osc(g, g.sfx, 'square', 200, t + dt, 0.06, 0.28, 70);
    noise(g, g.sfx, t + dt, 0.05, 0.3, 'lowpass', 1200, 300);
  }
}

/** Berimbau: corda dedilhada com "wah" (passa-banda que abre e fecha), leve bend inicial e vibrato. */
function berimbau(g: Graph, dest: AudioNode, midi: number, t: number, dur: number, peak: number): void {
  const { ctx } = g;
  const f = midiToHz(midi);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 1.04, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6;
  const depth = ctx.createGain();
  depth.gain.value = f * 0.012;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(450, t);
  bp.frequency.exponentialRampToValueAtTime(1900, t + dur * 0.35);
  bp.frequency.exponentialRampToValueAtTime(650, t + dur * 0.95);
  const amp = ctx.createGain();
  envelope(amp, t, peak * 2, dur);
  o.connect(bp);
  bp.connect(amp);
  amp.connect(dest);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.03);
  lfo.stop(t + dur + 0.03);
}

function agogo(g: Graph, dest: AudioNode, t: number, high: boolean, level: number): void {
  const f = high ? 1568 : 1175;
  osc(g, dest, 'square', f, t, 0.08, 0.07 * level);
  osc(g, dest, 'sine', f * 2.76, t, 0.05, 0.035 * level);
}

function atabaque(g: Graph, dest: AudioNode, t: number, level: number, f: number): void {
  osc(g, dest, 'sine', f, t, 0.14, 0.4 * level, f * 0.6);
  noise(g, dest, t, 0.03, 0.1 * level, 'bandpass', 1800);
}

function surdo(g: Graph, dest: AudioNode, t: number, level: number): void {
  osc(g, dest, 'sine', 100, t, 0.28, 0.55 * level, 42);
  noise(g, dest, t, 0.05, 0.1 * level, 'lowpass', 400);
}

function bubbles(g: Graph, dest: AudioNode, t: number, n: number, peak: number): void {
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.05 + Math.random() * 0.04);
    const f = 500 + Math.random() * 700;
    osc(g, dest, 'sine', f, at, 0.07, peak, f * 2);
  }
}

/** Latido duplo curto e enérgico do Vira-Lata Caramelo. */
function bark(g: Graph, t: number): void {
  const { ctx } = g;
  for (let i = 0; i < 2; i++) {
    const at = t + i * 0.11;
    const dur = 0.085;
    const pitchMult = i === 0 ? 1 : 1.08;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * pitchMult, at);
    o.frequency.exponentialRampToValueAtTime(720 * pitchMult, at + 0.025);
    o.frequency.exponentialRampToValueAtTime(260 * pitchMult, at + dur);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(600, at);
    bp.frequency.exponentialRampToValueAtTime(1100, at + 0.025);
    bp.frequency.exponentialRampToValueAtTime(400, at + dur);

    const amp = ctx.createGain();
    envelope(amp, at, 0.32, dur);
    o.connect(bp);
    bp.connect(amp);
    amp.connect(g.sfx);
    o.start(at);
    o.stop(at + dur + 0.02);

    noise(g, g.sfx, at, 0.04, 0.14, 'bandpass', 950, 450, 1.5);
  }
}

/** Estampido seco e claro de tiro 8-bit da arma do Traficante. */
function shoot(g: Graph, t: number): void {
  noise(g, g.sfx, t, 0.06, 0.36, 'highpass', 2400, 1000);
  noise(g, g.sfx, t, 0.14, 0.42, 'bandpass', 1600, 380, 1.1);
  osc(g, g.sfx, 'square', 240, t, 0.09, 0.28, 55);
  osc(g, g.sfx, 'sine', 240, t, 0.11, 0.36, 55);
}

const SFX: Record<SfxName, (g: Graph, t: number) => void> = {
  // braçada: "blub" curto e suave (toca muito, volume baixo)
  swim: (g, t) => {
    const f = 260 + Math.random() * 60;
    osc(g, g.sfx, 'sine', f, t, 0.09, 0.1, f * 1.8);
    noise(g, g.sfx, t, 0.07, 0.04, 'lowpass', 900, 300);
  },
  // ar: bolha grande estoura + respiro aliviado + arpejo suave
  air: (g, t) => {
    osc(g, g.sfx, 'sine', 380, t, 0.12, 0.3, 1500);
    noise(g, g.sfx, t + 0.1, 0.03, 0.2, 'highpass', 4500);
    noise(g, g.sfx, t + 0.14, 0.4, 0.14, 'bandpass', 1800, 700, 0.9);
    seq(g, t + 0.16, [
      tone(523.25, 0.09, 0.14, 'triangle'),
      tone(659.25, 0.09, 0.14, 'triangle'),
      tone(783.99, 0.28, 0.16, 'triangle'),
    ]);
  },
  // contagem: bip de alerta tenso (dois tons levemente dissonantes)
  countdown: (g, t) => {
    osc(g, g.sfx, 'square', 880, t, 0.1, 0.18);
    osc(g, g.sfx, 'square', 932, t, 0.1, 0.1);
    osc(g, g.sfx, 'sine', 110, t, 0.12, 0.2, 80);
  },
  // afogamento: glissando descendente borbulhante
  drown: (g, t) => {
    const { ctx } = g;
    const dur = 1.1;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(55, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.value = 40;
    lfo.connect(depth);
    depth.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const amp = ctx.createGain();
    envelope(amp, t, 0.2, dur);
    o.connect(lp);
    lp.connect(amp);
    amp.connect(g.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.04);
    lfo.stop(t + dur + 0.04);
    for (let i = 0; i < 6; i++) {
      const at = t + 0.1 + i * 0.14 + Math.random() * 0.05;
      const f = 300 + Math.random() * 500;
      osc(g, g.sfx, 'sine', f, at, 0.08, 0.14, f * 2.2);
    }
  },
  // atordoado: pancada + "piu-piu" de tontura
  stun: (g, t) => {
    osc(g, g.sfx, 'triangle', 170, t, 0.14, 0.45, 50);
    noise(g, g.sfx, t, 0.08, 0.3, 'lowpass', 1800, 300);
    for (let i = 0; i < 4; i++) {
      const up = i % 2 === 0;
      osc(g, g.sfx, 'sine', up ? 1400 : 2100, t + 0.16 + i * 0.08, 0.07, 0.14, up ? 2100 : 1400);
    }
  },
  // choque elétrico curto
  zap: (g, t) => {
    osc(g, g.sfx, 'sawtooth', 2000, t, 0.2, 0.2, 180);
    osc(g, g.sfx, 'square', 95, t, 0.2, 0.14, 70);
    noise(g, g.sfx, t, 0.15, 0.25, 'highpass', 5000, 2500);
    osc(g, g.sfx, 'square', 1200, t + 0.06, 0.06, 0.12, 600);
  },
  // fitinha rara: arpejo brilhante ascendente com brilho agudo
  ribbon: (g, t) => {
    const notes = [1046.5, 1318.51, 1567.98, 2093, 2637];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      const at = t + i * 0.07;
      osc(g, g.sfx, 'square', f, at, last ? 0.5 : 0.1, 0.13);
      osc(g, g.sfx, 'sine', f * 2, at, last ? 0.4 : 0.08, 0.06);
    });
    osc(g, g.sfx, 'triangle', 523.25, t, 0.5, 0.2);
  },
  // fanfarra baiana (~3.6s): lead + berimbau com wah + agogô e atabaque (Fá lídio)
  fanfare: (g, t) => {
    const U = 0.14;
    const lead: readonly Note[] = [
      [65, 2], [69, 2], [72, 2], [77, 3], [76, 1], [74, 2], [72, 2], [74, 2], [77, 2], [81, 2], [84, 6],
    ];
    let pos = 0;
    for (const [m, u] of lead) {
      const at = t + pos * U;
      const d = u * U;
      const o = g.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(midiToHz(m), at);
      if (u >= 3) {
        const lfo = g.ctx.createOscillator();
        lfo.frequency.value = 6;
        const dp = g.ctx.createGain();
        dp.gain.value = midiToHz(m) * 0.012;
        lfo.connect(dp);
        dp.connect(o.frequency);
        lfo.start(at);
        lfo.stop(at + d + 0.03);
      }
      const amp = g.ctx.createGain();
      envelope(amp, at, 0.15, d * 0.97);
      o.connect(amp);
      amp.connect(g.sfx);
      o.start(at);
      o.stop(at + d + 0.03);
      pos += u;
    }
    // berimbau: raiz e segunda, em ostinato
    const bass: readonly (readonly [number, number, number])[] = [
      [0, 53, 3], [3, 55, 2], [6, 53, 2], [8, 60, 3], [11, 55, 2], [14, 53, 2], [16, 60, 3], [19, 57, 2],
    ];
    for (const [u, m, du] of bass) berimbau(g, g.sfx, m, t + u * U, du * U, 0.12);
    // agogô (3-3-2) e atabaque
    [0, 3, 6, 8, 11, 14, 16, 19, 22].forEach((u, i) => agogo(g, g.sfx, t + u * U, i % 3 !== 1, 1.3));
    [0, 6, 8, 14, 16, 22].forEach((u) => atabaque(g, g.sfx, t + u * U, 1, 200));
    [0, 8, 16, 20].forEach((u) => surdo(g, g.sfx, t + u * U, 0.9));
    // acorde final (F A C) + rufada
    for (const m of [65, 69, 72]) osc(g, g.sfx, 'triangle', midiToHz(m), t + 20 * U, 6 * U, 0.18);
    for (let u = 20; u < 24; u++) noise(g, g.sfx, t + u * U, 0.05, 0.12, 'highpass', 6500);
  },
  // lambida: slurp cômico
  lick: (g, t) => {
    osc(g, g.sfx, 'sine', 250, t, 0.13, 0.28, 800);
    osc(g, g.sfx, 'sine', 800, t + 0.13, 0.12, 0.26, 300);
    noise(g, g.sfx, t, 0.22, 0.1, 'bandpass', 1500, 700, 2);
    bubbles(g, g.sfx, t + 0.18, 2, 0.08);
  },
  // fala: blip curtíssimo com altura aleatória
  talk: (g, t) => {
    const f = 300 + Math.random() * 140;
    osc(g, g.sfx, 'square', f, t, 0.045, 0.1, f * 1.05);
  },

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
  // vida extra: arpejo ascendente alegre
  oneup: (g, t) => {
    seq(g, t, [tone(659.25, 0.08, 0.18), tone(783.99, 0.08, 0.18), tone(1318.51, 0.08, 0.18), tone(1046.5, 0.08, 0.18), tone(1174.66, 0.08, 0.18), tone(1567.98, 0.24, 0.18)]);
  },
  checkpoint: (g, t) => {
    seq(g, t, [tone(784, 0.1, 0.18), tone(1046.5, 0.22, 0.18)]);
  },
  // grito de ave: sawtooth com vibrato rápido descendente
  squawk: (g, t) => squawk(g, t),
  // mola: sine com sweep sobe-desce
  boing: (g, t) => boing(g, t),
  // mergulho: respingo de ruído + bolhas
  splash: (g, t) => splash(g, t),
  // rugido de onça
  roar: (g, t) => roar(g, t),
  // sibilo de cobra
  hiss: (g, t) => noise(g, g.sfx, t, 0.3, 0.3, 'highpass', 5500, 7500),
  // mordida: estalo duplo grave
  chomp: (g, t) => chomp(g, t),
  // entrega: fanfarra alegre de 5 notas (Dó maior)
  deliver: (g, t) => {
    const top: Tone[] = [
      tone(523.25, 0.1, 0.16),
      tone(659.25, 0.1, 0.16),
      tone(783.99, 0.1, 0.16),
      tone(1046.5, 0.16, 0.16),
      tone(1318.51, 0.5, 0.18),
    ];
    seq(g, t, top);
    seq(g, t, top.map((n) => tone(n.f / 2, n.d, 0.22, 'triangle')));
  },
  // latido duplo curto e enérgico do vira-lata caramelo
  bark: (g, t) => bark(g, t),
  // estampido seco de tiro 8-bit do traficante
  shoot: (g, t) => shoot(g, t),
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

function scheduleSertao(g: Graph, step: number, t: number): void {
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

/* ----------------------------------------------------------------------------
 * Faixa "Carimbó da Mata" — Sol mixolídio (G A B C D E F), ~120 BPM, 16 compassos.
 * Parte A (cc. 1–8): pergunta/resposta; parte B (cc. 9–16): mais aguda e rítmica.
 * Curimbó (tambor grave), maracas, baixo sincopado, banjo arpejado e pássaros.
 * ------------------------------------------------------------------------- */

const AMZ_BARS = 16;
const AMZ_LOOP_STEPS = STEPS_PER_BAR * AMZ_BARS;

const AMZ_MELODY_BARS: readonly (readonly Note[])[] = [
  // A — pergunta
  [[67, 2], [71, 2], [74, 4], [72, 2], [71, 2], [69, 4]],
  [[71, 2], [69, 2], [67, 4], [0, 4], [67, 2], [69, 2]],
  [[72, 2], [69, 2], [77, 4], [76, 2], [74, 2], [72, 4]],
  [[72, 2], [69, 2], [65, 4], [0, 8]],
  // A — resposta
  [[76, 2], [72, 2], [79, 4], [76, 2], [74, 2], [72, 4]],
  [[74, 2], [72, 2], [69, 4], [72, 2], [74, 2], [76, 4]],
  [[74, 3], [72, 1], [69, 4], [74, 4], [0, 4]],
  [[71, 2], [74, 2], [79, 4], [74, 2], [71, 2], [67, 4]],
  // B
  [[79, 1], [79, 1], [0, 2], [79, 2], [76, 2], [72, 4], [76, 4]],
  [[77, 2], [76, 2], [74, 4], [72, 2], [74, 2], [76, 2], [0, 2]],
  [[74, 2], [79, 2], [79, 2], [74, 2], [71, 4], [74, 4]],
  [[76, 2], [74, 2], [71, 2], [69, 2], [67, 8]],
  [[77, 2], [77, 2], [72, 4], [77, 2], [76, 2], [74, 4]],
  [[72, 2], [74, 2], [76, 4], [77, 4], [0, 4]],
  [[74, 2], [74, 2], [69, 2], [74, 2], [72, 2], [69, 2], [67, 4]],
  [[69, 4], [71, 2], [72, 2], [74, 4], [0, 4]],
];

/** Raiz do baixo (G2 = 43): G G F F C C D G | C C G G F F D D */
const AMZ_ROOTS: readonly number[] = [43, 43, 41, 41, 36, 36, 38, 43, 36, 36, 43, 43, 41, 41, 38, 38];

/** Baixo sincopado: [semicolcheia, intervalo, duração] */
const AMZ_BASS: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [3, 7, 2],
  [6, 0, 2],
  [8, 0, 2],
  [11, 7, 2],
  [14, 12, 2],
];

/** Passos do banjo nos contratempos e síncopes, com índice do arpejo. */
const AMZ_BANJO: readonly (readonly [number, number])[] = [
  [2, 0], [5, 1], [7, 2], [10, 1], [13, 2], [15, 1],
];
const TRIAD = [12, 16, 19, 24] as const;

const AMZ_MELODY: (Note | undefined)[] = new Array<Note | undefined>(AMZ_LOOP_STEPS).fill(undefined);
{
  let pos = 0;
  for (const bar of AMZ_MELODY_BARS) {
    for (const [midi, steps] of bar) {
      if (midi > 0) AMZ_MELODY[pos] = [midi, steps];
      pos += steps;
    }
  }
}

function curimbo(g: Graph, t: number, level: number): void {
  osc(g, g.music, 'sine', 140, t, 0.2, 0.55 * level, 48);
  noise(g, g.music, t, 0.04, 0.12 * level, 'lowpass', 500);
}

function maraca(g: Graph, t: number, peak: number): void {
  noise(g, g.music, t, 0.04, peak, 'highpass', 6500);
}

function banjo(g: Graph, midi: number, t: number): void {
  const { ctx } = g;
  const o = ctx.createOscillator();
  o.setPeriodicWave(g.pulse);
  o.frequency.setValueAtTime(midiToHz(midi), t);
  const amp = ctx.createGain();
  envelope(amp, t, 0.2, 0.11);
  o.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + 0.14);
}

function lead(g: Graph, midi: number, t: number, steps: number): void {
  const { ctx } = g;
  const dur = steps * STEP;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(midiToHz(midi), t);
  // vibrato leve nas notas longas
  if (steps >= 4) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const d = ctx.createGain();
    d.gain.value = midiToHz(midi) * 0.01;
    lfo.connect(d);
    d.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  const amp = ctx.createGain();
  const peak = 0.17;
  amp.gain.setValueAtTime(FLOOR, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
  amp.gain.exponentialRampToValueAtTime(peak * 0.55, t + dur * 0.7);
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur * 0.95);
  o.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Piado: 2–3 glissandos rápidos de seno, bem baixo. */
function birdChirp(g: Graph, t: number): void {
  const base = 2200 + Math.random() * 1600;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const at = t + i * 0.09;
    const up = Math.random() < 0.5;
    osc(g, g.music, 'sine', up ? base : base * 1.4, at, 0.07, 0.05, up ? base * 1.4 : base);
  }
}

function scheduleAmazonia(g: Graph, step: number, t: number): void {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const root = AMZ_ROOTS[bar % AMZ_ROOTS.length] ?? 43;

  for (const [bs, interval, len] of AMZ_BASS) {
    if (bs === s) bassNote(g, root + interval, t, len);
  }

  // curimbó: acento no 1, síncopes no 4 e 7, resposta fraca no 9 e 15
  if (s === 0) curimbo(g, t, 1);
  else if (s === 3 || s === 6) curimbo(g, t, 0.6);
  else if (s === 8 || s === 14) curimbo(g, t, 0.4);

  // maracas em todas as semicolcheias, acentos alternados
  maraca(g, t, s % 4 === 2 ? 0.1 : s % 2 === 0 ? 0.07 : 0.04);

  for (const [bs, idx] of AMZ_BANJO) {
    if (bs === s) banjo(g, root + 12 + (TRIAD[idx] ?? 12), t);
  }

  const note = AMZ_MELODY[step];
  if (note) lead(g, note[0], t, note[1]);

  // pássaros ocasionais (a cada poucos compassos, em volume baixo)
  if (s === 9 && bar % 2 === 1 && Math.random() < 0.45) birdChirp(g, t);
}

/* ----------------------------------------------------------------------------
 * Faixa "Sonho de Maré" — Fá lídio (F G A B C D E), ~104 BPM, 16 compassos.
 * Levada de ijexá: agogô 3-3-2 (dois tons), atabaque, surdo, afoxé (chocalho),
 * linha de berimbau com wah; melodia onírica (pulso 25% suave + eco) e pad aquático.
 * Acordes: F G Am C | F G Dm C || Dm C F G | Am Dm G C
 * ------------------------------------------------------------------------- */

const BAH_STEP = 60 / 104 / 4;
const BAH_BARS = 16;
const BAH_LOOP_STEPS = STEPS_PER_BAR * BAH_BARS;

const BAH_MELODY_BARS: readonly (readonly Note[])[] = [
  // A
  [[69, 3], [72, 1], [77, 4], [76, 2], [72, 2], [69, 4]],
  [[74, 2], [71, 2], [67, 4], [0, 2], [71, 2], [74, 4]],
  [[72, 3], [69, 1], [76, 4], [74, 2], [72, 2], [69, 4]],
  [[67, 2], [72, 2], [76, 4], [0, 4], [74, 2], [72, 2]],
  // A'
  [[77, 3], [76, 1], [72, 4], [69, 2], [72, 2], [77, 4]],
  [[79, 4], [74, 2], [71, 2], [74, 4], [71, 2], [67, 2]],
  [[69, 2], [74, 2], [77, 4], [76, 2], [74, 2], [69, 4]],
  [[72, 4], [67, 2], [72, 2], [76, 6], [0, 2]],
  // B — mais aguda
  [[81, 3], [77, 1], [74, 4], [77, 2], [81, 2], [77, 4]],
  [[79, 2], [76, 2], [72, 4], [76, 2], [79, 2], [84, 4]],
  [[81, 2], [77, 2], [72, 4], [77, 2], [81, 2], [77, 4]],
  [[79, 2], [74, 2], [71, 4], [74, 2], [79, 2], [83, 4]],
  [[81, 4], [76, 2], [72, 2], [76, 2], [81, 2], [84, 2], [81, 2]],
  [[81, 2], [77, 2], [74, 4], [77, 4], [74, 2], [69, 2]],
  [[71, 2], [74, 2], [79, 4], [77, 2], [76, 2], [74, 4]],
  [[72, 6], [67, 2], [69, 2], [72, 2], [0, 4]],
];

/** Raiz do baixo (F2 = 41) */
const BAH_ROOTS: readonly number[] = [41, 43, 45, 48, 41, 43, 38, 48, 38, 48, 41, 43, 45, 38, 43, 48];

/** Baixo em triângulo: [semicolcheia, intervalo, duração] */
const BAH_BASS: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [6, 0, 2],
  [8, 7, 3],
  [11, 0, 2],
  [14, 7, 2],
];

/** Berimbau: [semicolcheia, intervalo acima da raiz, duração] */
const BAH_BERIMBAU: readonly (readonly [number, number, number])[] = [
  [0, 12, 3],
  [3, 14, 2],
  [8, 19, 3],
  [11, 14, 2],
];

/** Agogô ijexá (3-3-2): [semicolcheia, agudo?] */
const BAH_AGOGO: readonly (readonly [number, boolean])[] = [
  [0, true], [3, false], [6, true], [8, true], [11, false], [14, true],
];

const BAH_MELODY: (Note | undefined)[] = new Array<Note | undefined>(BAH_LOOP_STEPS).fill(undefined);
{
  let pos = 0;
  for (const bar of BAH_MELODY_BARS) {
    for (const [midi, steps] of bar) {
      if (midi > 0) BAH_MELODY[pos] = [midi, steps];
      pos += steps;
    }
  }
}

/** Melodia onírica: pulso 25% suavizado por lowpass, vibrato nas longas e eco. */
function dreamLead(g: Graph, midi: number, t: number, steps: number, peak: number, lp: number): void {
  const { ctx } = g;
  const dur = steps * BAH_STEP;
  const o = ctx.createOscillator();
  o.setPeriodicWave(g.pulse);
  o.frequency.setValueAtTime(midiToHz(midi), t);
  if (steps >= 3) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const d = ctx.createGain();
    d.gain.value = midiToHz(midi) * 0.008;
    lfo.connect(d);
    d.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = lp;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(FLOOR, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.7);
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur * 0.95);
  o.connect(flt);
  flt.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Pad aquático: duas senoides com ataque e saída lentos. */
function pad(g: Graph, midi: number, t: number, dur: number, peak: number): void {
  const o = g.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(midiToHz(midi), t);
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(FLOOR, t);
  amp.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
  amp.gain.linearRampToValueAtTime(FLOOR, t + dur);
  o.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function scheduleBahia(g: Graph, step: number, t: number): void {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const root = BAH_ROOTS[bar % BAH_ROOTS.length] ?? 41;

  for (const [bs, interval, len] of BAH_BASS) {
    if (bs === s) osc(g, g.music, 'triangle', midiToHz(root + interval), t, len * BAH_STEP * 0.95, 0.45);
  }

  for (const [bs, interval, len] of BAH_BERIMBAU) {
    if (bs === s) berimbau(g, g.music, root + interval, t, len * BAH_STEP, 0.07);
  }

  // surdo nos tempos 1 e 3; atabaque nas síncopes
  if (s === 0 || s === 8) surdo(g, g.music, t, s === 0 ? 1 : 0.7);
  else if (s === 6 || s === 14) atabaque(g, g.music, t, 0.6, 210);
  else if (s === 3 || s === 11) atabaque(g, g.music, t, 0.35, 280);

  for (const [bs, high] of BAH_AGOGO) {
    if (bs === s) agogo(g, g.music, t, high, 0.8);
  }

  // afoxé: chocalho suave em colcheias, sopros nas semicolcheias ímpares
  if (s % 2 === 0) noise(g, g.music, t, 0.05, s % 4 === 2 ? 0.07 : 0.05, 'highpass', 6000);
  else noise(g, g.music, t, 0.03, 0.025, 'highpass', 7000);

  // pad de dois em dois compassos
  if (s === 0 && bar % 2 === 0) {
    const dur = 2 * STEPS_PER_BAR * BAH_STEP;
    pad(g, root + 24, t, dur, 0.07);
    pad(g, root + 31, t, dur, 0.05);
  }

  const note = BAH_MELODY[step];
  if (note) {
    dreamLead(g, note[0], t, note[1], 0.26, 3200);
    // eco (delay de 3 semicolcheias) em volume baixo e mais escuro
    if (note[1] >= 2) dreamLead(g, note[0], t + 3 * BAH_STEP, Math.min(note[1], 3), 0.07, 1400);
  }

  // bolhas ocasionais
  if (s === 5 && bar % 2 === 0 && Math.random() < 0.5) bubbles(g, g.music, t, 3, 0.04);
}

/* ----------------------------------------------------------------------------
 * Faixa "Samba-Funk do Morro" — Lá menor / Lá dórico (A B C D E F# G), ~124 BPM, 16 compassos.
 * Parte A (cc. 1–8): Partido-Alto & Samba de Morro (surdo, tamborim telecoteco, cuíca, 7 cordas).
 * Parte B (cc. 9–16): Batidão de Baile / Tamborzão 8-bit ("tum-pá-tum-tum-pá" + Funk Melody).
 * ------------------------------------------------------------------------- */

const RIO_BPM = 124;
const RIO_STEP = 60 / RIO_BPM / 4;
const RIO_BARS = 16;
const RIO_LOOP_STEPS = STEPS_PER_BAR * RIO_BARS;

const RIO_MELODY_BARS: readonly (readonly Note[])[] = [
  // Parte A (cc. 1–8) — Partido-Alto & Samba de Morro
  [[76, 2], [72, 2], [69, 3], [72, 1], [76, 2], [74, 2], [72, 4]],
  [[74, 2], [78, 2], [81, 4], [78, 2], [74, 2], [76, 4]],
  [[72, 2], [76, 2], [79, 3], [76, 1], [74, 2], [72, 2], [69, 4]],
  [[71, 2], [74, 2], [79, 4], [0, 4], [76, 2], [74, 2]],
  [[72, 2], [74, 2], [76, 3], [79, 1], [76, 2], [72, 2], [74, 4]],
  [[78, 2], [74, 2], [81, 4], [78, 2], [76, 2], [74, 4]],
  [[76, 2], [74, 2], [72, 2], [71, 2], [69, 3], [71, 1], [72, 4]],
  [[74, 2], [72, 2], [69, 4], [0, 4], [72, 2], [76, 2]],
  // Parte B (cc. 9–16) — Batidão de Baile / Funk Melody 8-bit
  [[81, 2], [81, 2], [79, 2], [76, 2], [72, 3], [74, 1], [76, 4]],
  [[79, 2], [79, 2], [76, 2], [72, 2], [74, 2], [76, 2], [79, 4]],
  [[78, 2], [78, 2], [81, 2], [78, 2], [74, 3], [76, 1], [78, 4]],
  [[76, 2], [74, 2], [71, 4], [0, 4], [76, 2], [79, 2]],
  [[81, 2], [84, 2], [81, 2], [79, 2], [76, 3], [74, 1], [72, 4]],
  [[79, 2], [83, 2], [79, 2], [74, 2], [76, 2], [79, 2], [74, 4]],
  [[78, 2], [81, 2], [78, 2], [74, 2], [78, 2], [76, 2], [74, 4]],
  [[76, 2], [74, 2], [72, 2], [71, 2], [69, 6], [0, 2]],
];

/** Raiz do baixo + modo menor/maior por compasso: Am D Am G | C D Em Am || Am C D Em | Am G D Em */
const RIO_CHORDS: readonly (readonly [root: number, minor: boolean])[] = [
  [45, true], [50, false], [45, true], [43, false],
  [48, false], [50, false], [40, true], [45, true],
  [45, true], [48, false], [50, false], [40, true],
  [45, true], [43, false], [50, false], [40, true],
];

/** Baixo de samba (7 cordas): [semicolcheia, intervalo, duração]. */
const RIO_SAMBA_BASS: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [3, 7, 2],
  [6, 0, 2],
  [8, 0, 3],
  [11, 7, 2],
  [14, 7, 2],
];

/** Sub-bass do tamborzão: [semicolcheia, intervalo, duração]. */
const RIO_FUNK_BASS: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [6, 0, 2],
  [8, 7, 3],
  [12, 0, 2],
];

/** Tamborim no padrão telecoteco: semicolcheia -> intensidade. */
const RIO_TAMBORIM: ReadonlyMap<number, number> = new Map([
  [0, 0.9], [2, 0.55], [3, 0.85], [6, 0.9],
  [8, 0.85], [10, 0.55], [12, 0.8], [14, 0.7],
]);

const RIO_MELODY: (Note | undefined)[] = new Array<Note | undefined>(RIO_LOOP_STEPS).fill(undefined);
{
  let pos = 0;
  for (const bar of RIO_MELODY_BARS) {
    for (const [midi, steps] of bar) {
      if (midi > 0) RIO_MELODY[pos] = [midi, steps];
      pos += steps;
    }
  }
}

function surdoRio(g: Graph, t: number, mode: 'mark' | 'reply' | 'mute'): void {
  if (mode === 'mute') {
    osc(g, g.music, 'sine', 128, t, 0.1, 0.24, 72);
    noise(g, g.music, t, 0.03, 0.06, 'lowpass', 480);
    return;
  }
  const f0 = mode === 'mark' ? 106 : 92;
  const peak = mode === 'mark' ? 0.56 : 0.46;
  osc(g, g.music, 'sine', f0, t, 0.24, peak, 40);
  noise(g, g.music, t, 0.04, 0.09, 'lowpass', 380);
}

function tamborim(g: Graph, t: number, level: number): void {
  osc(g, g.music, 'triangle', 740, t, 0.035, 0.16 * level, 380);
  noise(g, g.music, t, 0.03, 0.12 * level, 'bandpass', 3200, 1800, 1.8);
}

/** Cuíca sintetizada: oscilador com pitch bend rápido e filtro bandpass Q=6. */
function cuica(g: Graph, t: number, f0: number, f1: number, dur: number, peak: number): void {
  const { ctx } = g;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.85);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(f0 * 1.1, t);
  bp.frequency.exponentialRampToValueAtTime(f1 * 1.1, t + dur * 0.85);

  const amp = ctx.createGain();
  envelope(amp, t, peak, dur);
  o.connect(bp);
  bp.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function cavaquinho(g: Graph, root: number, minor: boolean, t: number, peak: number): void {
  const { ctx } = g;
  const third = minor ? 15 : 16;
  for (const interval of [12, third, 19]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(g.pulse);
    o.frequency.setValueAtTime(midiToHz(root + 12 + interval), t);
    const amp = ctx.createGain();
    envelope(amp, t, peak, 0.075);
    o.connect(amp);
    amp.connect(g.music);
    o.start(t);
    o.stop(t + 0.095);
  }
}

function tamborzaoKick(g: Graph, t: number, level: number): void {
  osc(g, g.music, 'sine', 135, t, 0.2, 0.62 * level, 38);
  osc(g, g.music, 'triangle', 95, t, 0.08, 0.25 * level, 42);
}

function tamborzaoSnare(g: Graph, t: number, level: number): void {
  osc(g, g.music, 'triangle', 220, t, 0.07, 0.22 * level, 110);
  noise(g, g.music, t, 0.09, 0.22 * level, 'bandpass', 1900, 900, 1.0);
  noise(g, g.music, t + 0.012, 0.06, 0.14 * level, 'highpass', 3600);
}

function rioLead(g: Graph, midi: number, t: number, steps: number, funk: boolean): void {
  const { ctx } = g;
  const dur = steps * RIO_STEP;
  const o = ctx.createOscillator();
  if (funk) o.type = 'square';
  else o.setPeriodicWave(g.pulse);
  o.frequency.setValueAtTime(midiToHz(midi), t);
  if (steps >= 3) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = funk ? 6 : 5.2;
    const d = ctx.createGain();
    d.gain.value = midiToHz(midi) * 0.01;
    lfo.connect(d);
    d.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  const amp = ctx.createGain();
  const peak = funk ? 0.18 : 0.28;
  amp.gain.setValueAtTime(FLOOR, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
  amp.gain.exponentialRampToValueAtTime(peak * 0.58, t + dur * 0.72);
  amp.gain.exponentialRampToValueAtTime(FLOOR, t + dur * 0.95);
  o.connect(amp);
  amp.connect(g.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function scheduleRio(g: Graph, step: number, t: number): void {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const [root, minor] = RIO_CHORDS[bar % RIO_CHORDS.length] ?? [45, true];
  const isPartB = bar >= 8;

  if (!isPartB) {
    // Parte A: Partido-Alto & Samba de Morro
    for (const [bs, interval, len] of RIO_SAMBA_BASS) {
      if (bs === s) osc(g, g.music, 'triangle', midiToHz(root + interval), t, len * RIO_STEP * 0.95, 0.45);
    }

    if (s === 0) surdoRio(g, t, 'mark');
    else if (s === 8) surdoRio(g, t, 'reply');
    else if (s === 4 || s === 12) surdoRio(g, t, 'mute');

    const tambLevel = RIO_TAMBORIM.get(s);
    if (tambLevel !== undefined) tamborim(g, t, tambLevel);

    // ganzá suave em semicolcheias
    noise(g, g.music, t, 0.03, s % 2 === 0 ? 0.055 : 0.03, 'highpass', 7200);

    // acordes sincopados de cavaquinho no partido-alto
    if (s === 2 || s === 6 || s === 11 || s === 14) cavaquinho(g, root, minor, t, 0.055);

    // cuíca característica nos compassos pares (2, 4, 6, 8 → bar ímpar 0-based)
    if (bar % 2 === 1) {
      if (s === 10) cuica(g, t, 540, 1120, 0.11, 0.22);
      else if (s === 13) cuica(g, t, 980, 440, 0.14, 0.2);
    }
  } else {
    // Parte B: Batidão de Baile / Tamborzão 8-bit ("tum-pá-tum-tum-pá")
    for (const [bs, interval, len] of RIO_FUNK_BASS) {
      if (bs === s) osc(g, g.music, 'triangle', midiToHz(root + interval), t, len * RIO_STEP * 0.95, 0.5);
    }

    if (s === 0) tamborzaoKick(g, t, 1.0);
    else if (s === 6 || s === 8) tamborzaoKick(g, t, 0.88);
    else if (s === 14 && bar % 2 === 1) tamborzaoKick(g, t, 0.6);

    if (s === 3 || s === 12) tamborzaoSnare(g, t, 0.95);

    // chimbau/shaker nos contratempos para manter o balanço a 124 BPM
    if (s % 2 === 0) noise(g, g.music, t, 0.025, s % 4 === 2 ? 0.075 : 0.04, 'highpass', 7600);

    // acordes curtos de cavaquinho nos contratempos
    if (s === 2 || s === 6 || s === 10 || s === 14) cavaquinho(g, root, minor, t, 0.065);
  }

  const note = RIO_MELODY[step];
  if (note) rioLead(g, note[0], t, note[1], isPartB);
}

interface Track {
  readonly stepDur: number;
  readonly loopSteps: number;
  readonly scheduleStep: (g: Graph, step: number, t: number) => void;
}

const TRACKS: Record<MusicTrack, Track> = {
  sertao: { stepDur: STEP, loopSteps: LOOP_STEPS, scheduleStep: scheduleSertao },
  amazonia: { stepDur: STEP, loopSteps: AMZ_LOOP_STEPS, scheduleStep: scheduleAmazonia },
  bahia: { stepDur: BAH_STEP, loopSteps: BAH_LOOP_STEPS, scheduleStep: scheduleBahia },
  rio: { stepDur: RIO_STEP, loopSteps: RIO_LOOP_STEPS, scheduleStep: scheduleRio },
};

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
  let current: MusicTrack = 'sertao';
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
    const tr = TRACKS[current];
    while (nextTime < horizon) {
      tr.scheduleStep(g, nextStep, nextTime);
      nextTime += tr.stepDur;
      nextStep = (nextStep + 1) % tr.loopSteps;
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

  function silenceMusic(): void {
    stopScheduler();
    const g = graph;
    if (g) {
      // desconecta o barramento: notas já agendadas são silenciadas na hora
      g.music.disconnect();
      g.music = makeMusicBus(g.ctx, g.master);
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

    startMusic(track: MusicTrack = 'sertao'): void {
      if (musicWanted && current === track) return;
      if (musicWanted) silenceMusic();
      current = track;
      musicWanted = true;
      startScheduler();
    },

    stopMusic(): void {
      musicWanted = false;
      silenceMusic();
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
