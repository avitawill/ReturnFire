// The skull's laugh: an original synthesis in the spirit of a deep, villainous
// "MWAHAHAHA...". A shared syllable timeline drives both the sound and the
// skull's jaw, so they move together.

export interface Syllable {
  /** Seconds from the start of the laugh. */
  at: number;
  dur: number;
  /** Pitch at the start and end of the syllable (Hz). */
  f0: number;
  f1: number;
  /** Loudness 0..1. */
  amp: number;
  /** Vowel: 'a' (ha) or 'o' (the opening "mwo"). */
  v: 'a' | 'o';
}

/** "MWAH... ha-ha-ha-ha-ha-ha-ha-ha... HAAAA". About 3.3 seconds. */
export const LAUGH: Syllable[] = (() => {
  const s: Syllable[] = [{ at: 0, dur: 0.5, f0: 82, f1: 104, amp: 0.95, v: 'o' }];
  let t = 0.68;
  for (let i = 0; i < 9; i++) {
    // Starts high and fast, slows and sinks as it goes on.
    const f = 132 - i * 4.5;
    const dur = 0.13 + i * 0.006;
    s.push({ at: t, dur, f0: f * 1.06, f1: f * 0.9, amp: 0.9 - i * 0.025, v: 'a' });
    t += dur + 0.06 + i * 0.004;
  }
  s.push({ at: t + 0.06, dur: 0.95, f0: 118, f1: 70, amp: 1, v: 'a' });
  return s;
})();

export const LAUGH_LENGTH = LAUGH[LAUGH.length - 1].at + LAUGH[LAUGH.length - 1].dur;

/** How open the jaw is (0..1) at `t` seconds into the laugh. */
export function jawOpen(t: number): number {
  for (const s of LAUGH) {
    if (t < s.at || t > s.at + s.dur) continue;
    const u = (t - s.at) / s.dur;
    // Snap open quickly, close slowly.
    return u < 0.18 ? u / 0.18 : 1 - ((u - 0.18) / 0.82) ** 1.6;
  }
  return 0;
}

// Formants (Hz, bandwidth Q, gain) of a deep male voice, lowered for menace.
const FORMANTS: Record<Syllable['v'], [number, number, number][]> = {
  a: [[650, 5, 1], [1050, 7, 0.55], [2350, 9, 0.18], [3200, 10, 0.06]],
  o: [[430, 5, 1], [760, 6, 0.5], [2300, 9, 0.12], [3100, 10, 0.04]],
};

function impulse(ac: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}

function glottal(ac: BaseAudioContext): PeriodicWave {
  // A buzzy, chesty source: harmonics falling off at about -9 dB per octave.
  const N = 48;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let k = 1; k < N; k++) im[k] = 1 / Math.pow(k, 1.45);
  return ac.createPeriodicWave(re, im);
}

/** Plays the laugh into `out`, starting `delay` seconds from now. */
export function playLaugh(ac: BaseAudioContext, out: AudioNode, noise: AudioBuffer, delay = 0.25) {
  const t0 = ac.currentTime + delay;
  const dry = ac.createGain();
  dry.gain.value = 0.75;
  // Gentle saturation for a gravelly edge.
  const grit = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  grit.curve = curve;
  const voice = ac.createGain();
  voice.gain.value = 0.55;
  voice.connect(grit);
  grit.connect(dry);
  dry.connect(out);
  // A cavernous hall plus a slap echo.
  const verb = ac.createConvolver();
  verb.buffer = impulse(ac, 3.2, 2.4);
  const wet = ac.createGain();
  wet.gain.value = 0.55;
  grit.connect(verb);
  verb.connect(wet);
  wet.connect(out);
  const echo = ac.createDelay(1);
  echo.delayTime.value = 0.27;
  const fb = ac.createGain();
  fb.gain.value = 0.3;
  const echoOut = ac.createGain();
  echoOut.gain.value = 0.35;
  grit.connect(echo);
  echo.connect(fb);
  fb.connect(echo);
  echo.connect(echoOut);
  echoOut.connect(out);

  const wave = glottal(ac);
  for (const s of LAUGH) {
    const st = t0 + s.at;
    const end = st + s.dur;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, st);
    env.gain.exponentialRampToValueAtTime(s.amp, st + 0.03);
    env.gain.setValueAtTime(s.amp, st + s.dur * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    // Three layers: the voice, a growl an octave below, and a detuned double.
    for (const [mul, g, det] of [[1, 1, 0], [0.5, 0.55, 0], [1, 0.35, 9]] as const) {
      const o = ac.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.setValueAtTime(s.f0 * mul, st);
      o.frequency.exponentialRampToValueAtTime(s.f1 * mul, end);
      o.detune.value = det;
      // A little wobble so it sounds like a throat, not a synth.
      const vib = ac.createOscillator();
      const vibG = ac.createGain();
      vib.frequency.value = 5.5 + Math.random() * 1.5;
      vibG.gain.value = s.f0 * mul * 0.025;
      vib.connect(vibG);
      vibG.connect(o.frequency);
      const lg = ac.createGain();
      lg.gain.value = g;
      o.connect(lg);
      lg.connect(env);
      o.start(st);
      vib.start(st);
      o.stop(end + 0.05);
      vib.stop(end + 0.05);
    }
    for (const [f, q, a] of FORMANTS[s.v]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 0.92, st);
      // The vowel opens a little as the jaw drops.
      bp.frequency.linearRampToValueAtTime(f, st + s.dur * 0.3);
      bp.Q.value = q;
      const fg = ac.createGain();
      fg.gain.value = a * 2.2;
      env.connect(bp);
      bp.connect(fg);
      fg.connect(voice);
    }
    // Chest resonance under it all.
    const lo = ac.createBiquadFilter();
    lo.type = 'lowpass';
    lo.frequency.value = 220;
    const lg = ac.createGain();
    lg.gain.value = 0.5;
    env.connect(lo);
    lo.connect(lg);
    lg.connect(voice);
    // The breathy "h" (or "m") before each syllable.
    const n = ac.createBufferSource();
    n.buffer = noise;
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = s.v === 'o' ? 500 : 1300;
    nf.Q.value = 0.9;
    const ng = ac.createGain();
    const hs = Math.max(t0, st - 0.06);
    ng.gain.setValueAtTime(0.0001, hs);
    ng.gain.exponentialRampToValueAtTime(0.35 * s.amp, st + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(voice);
    n.start(hs, Math.random() * 0.5);
    n.stop(st + 0.12);
  }
  // Release the graph once the reverb has died away.
  setTimeout(() => {
      dry.disconnect();
      wet.disconnect();
      echoOut.disconnect();
    }, (delay + LAUGH_LENGTH + 4.5) * 1000);
}
