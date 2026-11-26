// The client: runs the fixed-step sim, feeds it intents, and fans events out
// to the renderer, audio and UI.

import { createGame, step, DT, type GameState, type Intent, type Side } from '../sim';
import type { SimEvent } from '../sim/events';
import { GameRenderer, type Quality, type ViewSpec } from '../render/renderer';
import { GamepadDevice } from '../input/gamepad';
import { KeyboardDevice } from '../input/keyboard';
import { PlayerInput } from '../input/player-input';
import { PlayerLayer } from '../ui/player-layer';
import { AudioEngine } from '../audio/audio';
import { HEIGHT } from '../sim/tuning';
import { EventBus } from './bus';
import { AiController, type Controller } from './controllers';
import type { Difficulty } from '../sim/ai/commander';

export interface GameConfig {
  seed?: number;
  quality?: Quality;
  difficulty?: Difficulty;
}

const MAX_STEPS_PER_FRAME = 8;

export class Game {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly bus = new EventBus();
  readonly renderer: GameRenderer;
  state!: GameState;
  layers: PlayerLayer[] = [];
  inputs: PlayerInput[] = [];
  opponent!: Controller;
  difficulty: Difficulty;
  private keyboard = new KeyboardDevice();
  private pads: GamepadDevice[] = [new GamepadDevice(0)];
  private acc = 0;
  private last = 0;
  private time = 0;
  private slowT = 0;
  private raf = 0;
  /** Seconds the side has been without a vehicle (drives the "lost" bay delay). */
  private deadT: Record<Side, number> = { 0: 0, 1: 0 };
  readonly stats = { fps: 0, frames: 0, frameMs: 0, ticks: 0, cpuMs: 0, calls: 0, triangles: 0 };
  private fpsAcc = 0;
  private fpsN = 0;
  readonly audio = new AudioEngine();
  /** Seconds the laughing skull has been showing per side, or null. */
  private skullT: Record<Side, number | null> = { 0: null, 1: null };
  private winFx = 0;
  private reducedMotion: boolean;

  constructor(root: HTMLElement, cfg: GameConfig = {}) {
    this.root = root;
    this.difficulty = cfg.difficulty ?? 'medium';
    root.dir = 'rtl';
    root.lang = 'he';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    root.append(this.canvas);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new GameRenderer(this.canvas, cfg.quality ?? defaultQuality(), this.reducedMotion);
    this.bus.on((ev) => this.renderer.onEvents(ev));
    this.bus.on((ev) => this.onEvents(ev));
    this.bus.on((ev) => this.audio.onEvents(ev));
    // Browsers only allow audio after a gesture.
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    const layer = new PlayerLayer(root, 0, {
      select: (t) => this.inputs[0].select(t),
      again: () => this.newGame((Math.random() * 2 ** 31) | 0),
      toggleSound: () => {
        this.audio.unlock();
        this.audio.setMuted(!this.audio.muted);
        return !this.audio.muted;
      },
    });
    layer.setSound(!this.audio.muted);
    layer.el.addEventListener('pointerdown', () => this.skipSkull(layer.side));
    this.layers = [layer];
    this.inputs = [new PlayerInput([this.keyboard, layer.touch, this.pads[0]])];
    addEventListener('resize', () => this.resize());
    this.newGame(cfg.seed ?? ((Math.random() * 2 ** 31) | 0));
    this.resize();
  }

  newGame(seed: number) {
    this.state = createGame({ seed });
    this.opponent = new AiController(1, this.difficulty, seed);
    this.renderer.setState(this.state);
    for (const i of this.inputs) i.reset();
    this.acc = 0;
    this.slowT = 0;
    this.deadT = { 0: 0, 1: 0 };
    this.skullT = { 0: null, 1: null };
    this.winFx = 0;
    this.audio.stopMusic();
    for (const l of this.layers) l.openBay('start', this.state);
  }

  start() {
    const frame = (ts: number) => {
      this.frame(ts);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** True when the sim should advance. Single player pauses while choosing a vehicle (prototype). */
  private get running() {
    if (this.state.winner !== -1) return false;
    return this.layers.some((l) => !l.bayOpen) || this.inputs.some((i) => i.hasPendingSelect);
  }

  private frame(ts: number) {
    const t0 = performance.now();
    this.frameInner(ts);
    const cpu = performance.now() - t0;
    this.stats.cpuMs += (cpu - this.stats.cpuMs) * 0.05;
    const info = this.renderer.renderer.info.render;
    this.stats.calls = info.calls;
    this.stats.triangles = info.triangles;
  }

  private frameInner(ts: number) {
    const raw = (ts - this.last) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    this.last = ts;
    this.time += dt;
    this.fpsAcc += raw;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = this.fpsN / this.fpsAcc;
      this.stats.frameMs = (this.fpsAcc / this.fpsN) * 1000;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.stats.frames++;

    for (const i of this.inputs) i.poll();
    const eff = this.renderer.effects;
    if (eff && eff.slowMo > 0) {
      this.slowT = eff.slowMo;
      eff.slowMo = 0;
    }
    let gdt = dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      gdt = dt * 0.3;
    }
    if (this.running) {
      this.acc += gdt;
      let n = 0;
      while (this.acc >= DT && n < MAX_STEPS_PER_FRAME) {
        this.acc -= DT;
        n++;
        this.tick();
        if (this.state.winner !== -1) break;
      }
      if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    this.gamepadMenus();
    for (const l of this.layers) l.update(dt, this.state, this.time);
    this.updateBays(dt);
    this.updateFx(dt);
    this.audio.update(this.layers.map((l) => ({ side: l.side, x: this.renderer.cameras[l.side]?.x ?? 0, y: this.renderer.cameras[l.side]?.y ?? 0 })));
    this.renderer.draw(dt, this.time, this.views(), this.layers.every((l) => l.mode === 'start' || l.mode === 'win'));
  }

  /** Lets a gamepad move focus through the bay and press buttons. */
  private gamepadMenus() {
    this.inputs.forEach((input, i) => {
      const l = this.layers[i];
      if (!l?.bayOpen) return;
      const pad = input.devices.find((d): d is GamepadDevice => d instanceof GamepadDevice);
      if (!pad) return;
      const nav = pad.nav;
      const buttons = l.bayButtons();
      if (!buttons.length) return;
      let k = buttons.indexOf(document.activeElement as HTMLButtonElement);
      // Cards sit in a two-column RTL grid: "left" moves to the next card.
      const delta = nav.left || nav.down ? 1 : nav.right || nav.up ? -1 : 0;
      if (delta) {
        k = k < 0 ? 0 : (k + delta + buttons.length) % buttons.length;
        buttons[k].focus();
      }
      if (nav.confirm) (k >= 0 ? buttons[k] : buttons[0]).click();
    });
  }

  private tick() {
    const s = this.state;
    const intents: [Intent, Intent] = [this.intentFor(0), this.intentFor(1)];
    const events = step(s, intents, DT);
    this.stats.ticks++;
    this.bus.emit(events);
  }

  private intentFor(side: Side): Intent {
    const input = this.inputs[side];
    if (input) return input.intent();
    return this.opponent.intent(this.state, side);
  }

  private onEvents(events: readonly SimEvent[]) {
    for (const e of events) {
      for (const l of this.layers) l.onEvent(e, this.state);
      if (e.type === 'vehicleSpawned') {
        const input = this.inputs[e.side];
        input?.clearSelect();
        const l = this.layers[e.side];
        if (l) l.closeBay(this.state);
      } else if (e.type === 'vehicleDocked') {
        const l = this.layers[e.side];
        if (l && this.state.winner === -1) l.openBay('dock', this.state);
      } else if (e.type === 'gameOver') {
        for (const l of this.layers) {
          const won = e.winner === l.side;
          l.openBay(won ? 'win' : 'lose', this.state, { reason: e.reason });
          if (won) this.winFx = 12;
          else {
            this.skullT[l.side] = 0;
            this.audio.laugh();
          }
        }
      }
    }
  }

  /** After a vehicle is lost, show the bay once the wreck has had a moment on screen. */
  private updateBays(dt: number) {
    if (this.state.winner !== -1) return;
    for (const l of this.layers) {
      const sd = this.state.sides[l.side];
      if (sd.vehicle || l.bayOpen) {
        this.deadT[l.side] = 0;
        continue;
      }
      this.deadT[l.side] += dt;
      const sk = this.skullT[l.side];
      if (sk === null) {
        // Let the wreck burn for a moment, then the skull laughs.
        if (this.deadT[l.side] > 1.5) {
          this.skullT[l.side] = 0;
          this.audio.laugh();
        }
      } else if (sk > 3.2 && sd.respawn <= 0) this.skipSkull(l.side, true);
    }
  }

  /** Tap to dismiss the skull (after a short grace period) and open the bay. */
  private skipSkull(side: Side, force = false) {
    const t = this.skullT[side];
    if (t === null || this.state.winner !== -1 || (!force && t < 0.6)) return;
    this.skullT[side] = null;
    this.layers[side]?.openBay('lost', this.state);
  }

  private updateFx(dt: number) {
    for (const side of [0, 1] as Side[]) if (this.skullT[side] !== null) this.skullT[side]! += dt;
    // Victory fireworks over the winner's pad.
    if (this.winFx > 0 && this.state.winner !== -1) {
      this.winFx -= dt;
      const sd = this.state.sides[this.state.winner];
      if (Math.random() < dt * 3)
        this.renderer.effects?.boom(sd.padX + (Math.random() - 0.5) * 300, sd.padY + (Math.random() - 0.5) * 300, 1.3, HEIGHT.ground + 70 + Math.random() * 80, true);
    }
  }

  private views(): ViewSpec[] {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    return [{ side: 0, x: 0, y: 0, w, h, skull: this.skullT[0] }];
  }

  resize() {
    const w = this.root.clientWidth || 800;
    const h = this.root.clientHeight || 600;
    this.renderer.resize(w, h);
    this.layers[0]?.setRect(0, 0, w, h);
  }
}

function defaultQuality(): Quality {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}
