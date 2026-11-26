// Web Audio engine. Effects are synthesised and attenuated by distance from
// the nearest player; each player has a music channel (recording when one is
// shipped, synthesised melody otherwise). Everything passes through one
// master gain, so muting silences all of it.

import type { Side } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import type { VehicleType } from '../sim/tuning';
import { noiseBuffer, playLaugh, playSfx, SynthMusic, type Sfx } from './synth';

/** Recordings shipped in public/audio (see ASSETS.md). Missing ones fall back to synthesis. */
export const MUSIC_FILES: Partial<Record<VehicleType, string>> = {
  heli: 'valkyries.mp3',
  jeep: 'bumblebee.mp3',
};

export interface Listener {
  side: Side;
  x: number;
  y: number;
}

class MusicChannel {
  private engine: AudioEngine;
  readonly out: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private srcGain: GainNode | null = null;
  private synth: SynthMusic | null = null;
  current: VehicleType | null = null;

  constructor(engine: AudioEngine, ac: AudioContext, dest: AudioNode, pan: number) {
    this.engine = engine;
    this.out = ac.createGain();
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      this.out.connect(p);
      p.connect(dest);
    } else this.out.connect(dest);
  }

  async play(type: VehicleType) {
    this.stop();
    this.current = type;
    const ac = this.engine.ac!;
    const buf = await this.engine.musicBuffer(type);
    if (this.current !== type) return;
    if (buf) {
      const s = ac.createBufferSource();
      const g = ac.createGain();
      s.buffer = buf;
      s.loop = true;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.8, ac.currentTime + 0.6);
      s.connect(g);
      g.connect(this.out);
      s.start();
      this.src = s;
      this.srcGain = g;
    } else this.synth = new SynthMusic(ac, this.out, type);
  }

  stop() {
    this.current = null;
    this.synth = null;
    const ac = this.engine.ac;
    if (this.src && this.srcGain && ac) {
      const s = this.src;
      this.srcGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.12);
      s.stop(ac.currentTime + 0.6);
    }
    this.src = null;
    this.srcGain = null;
  }

  tick() {
    this.synth?.tick();
  }
}

export class AudioEngine {
  ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private channels: MusicChannel[] = [];
  private buffers = new Map<VehicleType, Promise<AudioBuffer | null>>();
  private listeners: Listener[] = [];
  private humans: Side[] = [0];
  private gunBudget = 0;
  private lastT = 0;
  muted = false;
  volumes = { master: 0.9, music: 0.55, sfx: 0.8 };
  /** Pending music requests made before the context was unlocked. */
  private pending = new Map<number, VehicleType>();

  constructor() {
    try {
      this.muted = localStorage.getItem('mivtza.muted') === '1';
      const v = JSON.parse(localStorage.getItem('mivtza.volumes') ?? 'null');
      if (v) Object.assign(this.volumes, v);
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new AC();
    } catch {
      this.ac = null;
      return;
    }
    const ac = this.ac;
    this.master = ac.createGain();
    this.master.connect(ac.destination);
    this.sfxBus = ac.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ac.createGain();
    this.musicBus.connect(this.master);
    this.noise = noiseBuffer(ac, 1);
    this.applyVolumes();
    this.setPlayers(this.humans);
    for (const [i, t] of this.pending) void this.channels[i]?.play(t);
    this.pending.clear();
  }

  /** Which sides are human players; one music channel each (panned in split screen). */
  setPlayers(sides: Side[]) {
    this.humans = sides;
    if (!this.ac || !this.musicBus) return;
    for (const c of this.channels) {
      c.stop();
      c.out.disconnect();
    }
    this.channels = sides.map((_, i) => new MusicChannel(this, this.ac!, this.musicBus!, sides.length > 1 ? (i === 0 ? -0.6 : 0.6) : 0));
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
    try {
      localStorage.setItem('mivtza.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setVolumes(v: Partial<AudioEngine['volumes']>) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
    try {
      localStorage.setItem('mivtza.volumes', JSON.stringify(this.volumes));
    } catch {
      /* ignore */
    }
  }

  private applyVolumes() {
    if (!this.ac || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.02);
  }

  /** Effective output level, for tests: 0 when muted. */
  get level() {
    return this.muted ? 0 : this.volumes.master;
  }

  musicBuffer(type: VehicleType): Promise<AudioBuffer | null> {
    const file = MUSIC_FILES[type];
    if (!file || !this.ac) return Promise.resolve(null);
    let p = this.buffers.get(type);
    if (!p) {
      const ac = this.ac;
      p = fetch(`${import.meta.env.BASE_URL}audio/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ac.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(type, p);
    }
    return p;
  }

  /** What each player's music channel is playing (null = silence). */
  musicState(): (VehicleType | null)[] {
    return this.humans.map((_, i) => this.channels[i]?.current ?? this.pending.get(i) ?? null);
  }

  private channelFor(side: Side) {
    return this.humans.indexOf(side);
  }

  playMusic(side: Side, type: VehicleType) {
    const i = this.channelFor(side);
    if (i < 0) return;
    if (!this.ac) this.pending.set(i, type);
    else void this.channels[i]?.play(type);
  }

  stopMusic(side?: Side) {
    for (let i = 0; i < this.humans.length; i++) {
      if (side !== undefined && this.humans[i] !== side) continue;
      this.channels[i]?.stop();
      this.pending.delete(i);
    }
  }

  laugh() {
    if (!this.ac || !this.master || !this.noise) return;
    playLaugh(this.ac, this.sfxBus!, this.noise);
  }

  /** Called once per rendered frame. */
  update(listeners: Listener[]) {
    this.listeners = listeners;
    for (const c of this.channels) c.tick();
    const now = performance.now();
    this.gunBudget = Math.min(6, this.gunBudget + ((now - this.lastT) / 1000) * 18);
    this.lastT = now;
  }

  private sfx(k: Sfx, vol: number) {
    if (!this.ac || !this.sfxBus || !this.noise || vol < 0.03) return;
    playSfx(this.ac, this.sfxBus, this.noise, k, Math.min(1, vol));
  }

  /** Loudness for a sound at (x, y): falls off with distance from the nearest player. */
  private at(x: number, y: number) {
    let best = 0;
    for (const l of this.listeners) {
      const d = Math.hypot(l.x - x, l.y - y);
      best = Math.max(best, Math.pow(Math.max(0, 1 - d / 850), 1.4));
    }
    return best;
  }

  onEvents(events: readonly SimEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.weapon === 'gun') {
            if (this.gunBudget < 1) break;
            this.gunBudget--;
            this.sfx('gun', this.at(e.x, e.y));
          } else this.sfx(e.weapon === 'shell' ? 'shell' : 'rocket', this.at(e.x, e.y));
          break;
        case 'explosion':
          if (!e.quiet && e.size >= 0.8) this.sfx(e.size >= 1.5 ? 'bigBoom' : 'boom', this.at(e.x, e.y));
          else if (!e.quiet && e.size >= 0.5) this.sfx('clank', this.at(e.x, e.y) * 0.7);
          break;
        case 'structureDestroyed':
          if (e.kind === 'tower') this.sfx('rumble', this.at(e.x, e.y));
          break;
        case 'treeCrushed':
          this.sfx('crunch', this.at(e.x, e.y) * 0.8);
          break;
        case 'vehicleHit':
          if (this.humans.includes(e.side)) this.sfx('clank', 0.5);
          break;
        case 'sinking':
          if (this.humans.includes(e.side)) this.sfx('splash', 1);
          break;
        case 'mineLaid':
          this.sfx('mine', this.at(e.x, e.y));
          break;
        case 'flagTaken':
          if (this.humans.includes(e.by)) this.sfx('pickup', 1);
          if (this.humans.includes(e.side)) this.sfx('alarm', 1);
          break;
        case 'vehicleSpawned':
          this.playMusic(e.side, e.vehicle);
          break;
        case 'vehicleDocked':
          this.stopMusic(e.side);
          if (this.humans.includes(e.side)) this.sfx('dock', 1);
          break;
        case 'vehicleLost':
          this.stopMusic(e.side);
          break;
        case 'gameOver':
          this.stopMusic();
          break;
      }
    }
  }
}
