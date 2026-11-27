// Synthesised sound effects, the skull's laugh and fallback melodies.
// Everything here is generated at runtime; there are no sample files.

import type { VehicleType } from '../sim/tuning';

export type Sfx = 'gun' | 'shell' | 'rocket' | 'boom' | 'bigBoom' | 'splash' | 'mine' | 'clank' | 'crunch' | 'pickup' | 'dock' | 'alarm' | 'rumble';

export function noiseBuffer(ac: BaseAudioContext, seconds = 1): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(1, n, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Plays one effect into `out` at volume `vol` (0..1). */
export function playSfx(ac: AudioContext, out: AudioNode, noise: AudioBuffer, k: Sfx, vol: number) {
  const t = ac.currentTime + 0.005;
  const g = ac.createGain();
  g.connect(out);
  const noiseSrc = (filterType: BiquadFilterType, f0: number, f1: number, dur: number, q = 1) => {
    const s = ac.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f);
    f.connect(g);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.05);
  };
  const osc = (type: OscillatorType, f0: number, f1: number, dur: number) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  switch (k) {
    case 'gun':
      env(g, t, 0.18 * vol, 0.002, 0.07);
      noiseSrc('bandpass', 2400, 900, 0.08, 1.2);
      osc('square', 520, 210, 0.06);
      break;
    case 'shell':
      env(g, t, 0.5 * vol, 0.004, 0.35);
      noiseSrc('lowpass', 2200, 120, 0.38);
      osc('sine', 110, 40, 0.3);
      break;
    case 'rocket':
      env(g, t, 0.25 * vol, 0.03, 0.5);
      noiseSrc('bandpass', 900, 3200, 0.5, 0.7);
      osc('sawtooth', 300, 120, 0.25);
      break;
    case 'boom':
    case 'bigBoom': {
      const big = k === 'bigBoom';
      env(g, t, (big ? 0.85 : 0.5) * vol, 0.005, big ? 1.4 : 0.55);
      noiseSrc('lowpass', big ? 1400 : 1000, 60, big ? 1.4 : 0.55);
      osc('sine', big ? 70 : 90, 28, big ? 0.9 : 0.4);
      break;
    }
    case 'rumble':
      env(g, t, 0.6 * vol, 0.15, 2.2);
      noiseSrc('lowpass', 380, 50, 2.4, 0.5);
      break;
    case 'splash':
      env(g, t, 0.35 * vol, 0.02, 0.9);
      noiseSrc('bandpass', 1800, 300, 0.9, 0.6);
      break;
    case 'mine':
      env(g, t, 0.2 * vol, 0.002, 0.12);
      osc('triangle', 900, 600, 0.1);
      break;
    case 'clank':
      env(g, t, 0.16 * vol, 0.002, 0.1);
      osc('square', 1300, 700, 0.08);
      noiseSrc('highpass', 3000, 2000, 0.06);
      break;
    case 'crunch':
      env(g, t, 0.22 * vol, 0.005, 0.25);
      noiseSrc('bandpass', 700, 250, 0.25, 0.9);
      break;
    case 'pickup':
    case 'dock': {
      g.gain.value = 0.14 * vol;
      const notes = k === 'pickup' ? [523.25, 659.25, 783.99, 1046.5] : [392, 523.25];
      notes.forEach((f, i) => {
        const o = ac.createOscillator();
        const og = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        env(og, t + i * 0.09, 1, 0.01, 0.25);
        o.connect(og);
        og.connect(g);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.3);
      });
      break;
    }
    case 'alarm': {
      g.gain.value = 0.12 * vol;
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      for (let i = 0; i < 4; i++) {
        o.frequency.setValueAtTime(660, t + i * 0.3);
        o.frequency.setValueAtTime(880, t + i * 0.3 + 0.15);
      }
      const og = ac.createGain();
      env(og, t, 1, 0.02, 1.2);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      o.connect(f);
      f.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 1.25);
      break;
    }
  }
  // Disconnect when done so the graph does not grow.
  setTimeout(() => g.disconnect(), 3000);
}

export { playLaugh } from './laugh';

// ---------------------------------------------------------------- melodies

const NOTE: Record<string, number> = {};
'C,C#,D,D#,E,F,F#,G,G#,A,A#,B'.split(',').forEach((n, i) => {
  for (let o = 1; o < 7; o++) NOTE[n + o] = 440 * Math.pow(2, (i - 9) / 12 + o - 4);
});
const BEE = 'E5 D#5 D5 C#5 C5 F5 E5 D#5 E5 D#5 D5 C#5 C5 C#5 D5 D#5 ';
const BEE2 = 'A5 G#5 G5 F#5 F5 A#5 A5 G#5 A5 G#5 G5 F#5 F5 F#5 G5 G#5 ';

interface Tune {
  /** Seconds per beat unit. */
  u: number;
  w: OscillatorType;
  /** Add an octave-up voice. */
  oct?: boolean;
  /** Accelerate each loop (Mountain King) down to `min`. */
  acc?: number;
  min?: number;
  voices: string[];
}

/** The prototype's arrangements of the four themes (public-domain compositions). */
export const TUNES: Record<VehicleType, Tune> = {
  heli: { u: 0.16, w: 'sawtooth', oct: true, voices: ['B3:1.5 F#3:.5 B3:1 D4:3 B3:3 D4:1.5 B3:.5 D4:1 F#4:3 D4:3 F#4:1.5 D4:.5 F#4:1 A4:3 A3:3 D4:1.5 A3:.5 D4:1 F#4:6 0:3'] },
  launcher: { u: 0.22, acc: 0.92, min: 0.085, w: 'square', voices: ['B2 C#3 D3 E3 F#3 D3 F#3:2 F3 C#3 F3:2 E3 C3 E3:2 B2 C#3 D3 E3 F#3 D3 F#3 B3 A3 F#3 D3 F#3 A3:4'] },
  jeep: { u: 0.075, w: 'sawtooth', voices: [(BEE + BEE + BEE2 + BEE2).trim()] },
  tank: { u: 0.13, w: 'sawtooth', voices: ['G2 G2 G2 G2:3 G2:3 G2:1.5 G2:1.5 G2:3', 'G3:30 D4:30 C#4:30'] },
};

/** A scheduler that plays a synthesised tune into `out` until stopped. */
export class SynthMusic {
  private ac: AudioContext;
  private out: AudioNode;
  private tune: Tune;
  private u: number;
  private voices: { n: [number, number][]; i: number; at: number }[];

  constructor(ac: AudioContext, out: AudioNode, type: VehicleType) {
    this.ac = ac;
    this.out = out;
    this.tune = TUNES[type];
    this.u = this.tune.u;
    this.voices = this.tune.voices.map((s) => ({
      n: s.split(' ').map((x) => {
        const [name, len] = x.split(':');
        return [NOTE[name] || 0, +(len || 1)] as [number, number];
      }),
      i: 0,
      at: ac.currentTime + 0.3,
    }));
  }

  /** Schedule notes up to 0.3 s ahead. Call every frame. */
  tick() {
    const now = this.ac.currentTime;
    this.voices.forEach((v, vi) => {
      if (v.at < now) v.at = now + 0.05;
      while (v.at < now + 0.3) {
        const [f, len] = v.n[v.i];
        const d = len * this.u;
        if (f) {
          this.tone(f, v.at, d, 0.06);
          if (this.tune.oct) this.tone(f * 2, v.at, d, 0.025);
        }
        v.at += d;
        if (++v.i >= v.n.length) {
          v.i = 0;
          if (vi === 0 && this.tune.acc) this.u = Math.max(this.tune.min ?? 0.05, this.u * this.tune.acc);
        }
      }
    });
  }

  private tone(f: number, t: number, d: number, g: number) {
    const ac = this.ac;
    const o = ac.createOscillator();
    const gn = ac.createGain();
    const fl = ac.createBiquadFilter();
    o.type = this.tune.w;
    o.frequency.value = f;
    fl.type = 'lowpass';
    fl.frequency.value = Math.min(4200, f * 5);
    o.connect(fl);
    fl.connect(gn);
    gn.connect(this.out);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.015);
    gn.gain.setValueAtTime(g, t + Math.max(0.02, d * 0.7));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.98);
    o.start(t);
    o.stop(t + d);
  }
}
