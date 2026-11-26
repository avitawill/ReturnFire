// The client: menus, match setup, the fixed-step loop, and fan-out of sim
// events to the renderer, audio and UI.

import { AudioEngine } from '../audio/audio';
import { connectedPads, GamepadDevice } from '../input/gamepad';
import { DEFAULT_KEYS, KeyboardDevice, type KeyScheme } from '../input/keyboard';
import { PlayerInput } from '../input/player-input';
import type { InputDevice } from '../input/types';
import { GameRenderer, type Quality, type ViewSpec } from '../render/renderer';
import { createGame, step, DT, type GameState, type Intent, type Side } from '../sim';
import type { Difficulty } from '../sim/ai/commander';
import type { SimEvent } from '../sim/events';
import { TILE, HEIGHT } from '../sim/tuning';
import { PlayerLayer } from '../ui/player-layer';
import { Screens } from '../ui/screens';
import { EventBus } from './bus';
import { AiController, type Controller } from './controllers';
import { loadSettings, saveSettings, type Settings } from './settings';

export interface GameConfig {
  seed?: number;
  quality?: Quality;
  difficulty?: Difficulty;
  map?: string;
  /** Start a match straight away (tests, links) instead of showing the main menu. */
  autostart?: 1 | 2;
  /** Simulation speed multiplier (tests). */
  speed?: number;
}

const MAX_STEPS_PER_FRAME = 8;

/** Split-screen keyboard layouts used when no gamepads are connected. */
const KEYS_P1: KeyScheme = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  fire: ['KeyF', 'Space'], secondary: ['KeyG', 'KeyE'], pause: ['Escape'],
};
const KEYS_P2: KeyScheme = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  fire: ['Enter', 'ShiftRight', 'Slash'], secondary: ['Period', 'ControlRight'], pause: ['KeyP'],
};

export class Game {
  readonly root: HTMLElement;
  canvas!: HTMLCanvasElement;
  readonly bus = new EventBus();
  renderer!: GameRenderer;
  readonly audio = new AudioEngine();
  readonly screens: Screens;
  readonly settings: Settings;
  state!: GameState;
  players: 1 | 2 = 1;
  layers: PlayerLayer[] = [];
  inputs: PlayerInput[] = [];
  opponent: Controller | null = null;
  phase: 'menu' | 'play' = 'menu';
  paused = false;
  private keyboards = { solo: new KeyboardDevice(DEFAULT_KEYS), p1: new KeyboardDevice(KEYS_P1), p2: new KeyboardDevice(KEYS_P2) };
  private pads = [0, 1, 2, 3].map((i) => new GamepadDevice(i));
  private acc = 0;
  private last = 0;
  private time = 0;
  private slowT = 0;
  private raf = 0;
  private speed: number;
  private begun = false;
  private deadT: Record<Side, number> = { 0: 0, 1: 0 };
  private skullT: Record<Side, number | null> = { 0: null, 1: null };
  private winFx = 0;
  private reducedMotion: boolean;
  private seed = 1;
  readonly stats = { fps: 0, frames: 0, frameMs: 0, ticks: 0, cpuMs: 0, calls: 0, triangles: 0 };
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(root: HTMLElement, cfg: GameConfig = {}) {
    this.root = root;
    root.dir = 'rtl';
    root.lang = 'he';
    this.settings = loadSettings();
    if (cfg.quality) this.settings.quality = cfg.quality;
    if (cfg.difficulty) this.settings.difficulty = cfg.difficulty;
    if (cfg.map) this.settings.map = cfg.map;
    this.speed = cfg.speed ?? 1;
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.makeRenderer(this.settings.quality);
    this.bus.on((ev) => this.renderer.onEvents(ev));
    this.bus.on((ev) => this.onEvents(ev));
    this.bus.on((ev) => this.audio.onEvents(ev));
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    addEventListener('keydown', (e) => this.onKey(e));
    this.screens = new Screens(root, {
      start: (p) => this.startMatch(p),
      setMap: (m) => this.updateSetting({ map: m }, true),
      reroll: () => this.updateSetting({ randomSeed: 1 + Math.floor(Math.random() * 9999) }, true),
      setDifficulty: (d) => this.updateSetting({ difficulty: d as Difficulty }),
      openSettings: () => this.screens.showSettings(this.settings.quality, this.audio.volumes, this.audio.muted),
      closeSettings: () => (this.screens.returnTo === 'pause' ? this.screens.showPause() : this.showMenu()),
      setQuality: (q) => this.setQuality(q as Quality),
      setVolume: (k, v) => {
        this.audio.unlock();
        this.audio.setVolumes({ [k]: v });
      },
      setMuted: (m) => {
        this.audio.setMuted(m);
        for (const l of this.layers) l.setSound(!m);
      },
      resume: () => this.setPaused(false),
      quit: () => this.showMenu(),
    });
    addEventListener('resize', () => this.resize());
    if (cfg.seed !== undefined) this.seed = cfg.seed;
    if (cfg.autostart) this.startMatch(cfg.autostart, cfg.seed);
    else this.showMenu();
    this.resize();
  }

  // ---------------------------------------------------------------- setup

  private makeRenderer(q: Quality) {
    if (this.renderer) {
      this.renderer.dispose();
      this.canvas.remove();
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    this.root.prepend(this.canvas);
    this.renderer = new GameRenderer(this.canvas, q, this.reducedMotion);
    if (this.state) this.renderer.setState(this.state);
  }

  private setQuality(q: Quality) {
    if (q === this.settings.quality) return;
    this.updateSetting({ quality: q });
    this.makeRenderer(q);
    this.screens.setQuality(q);
    this.resize();
  }

  private updateSetting(patch: Partial<Settings>, refreshPreview = false) {
    Object.assign(this.settings, patch);
    saveSettings(this.settings);
    if (this.phase === 'menu') {
      if (refreshPreview) this.loadPreview();
      this.screens.updateMain(this.menuState());
    }
  }

  private menuState() {
    return { map: this.settings.map, randomSeed: this.settings.randomSeed, difficulty: this.settings.difficulty, pads: connectedPads().length };
  }

  /** The map shown, slowly orbiting, behind the main menu. */
  private loadPreview() {
    const s = this.settings;
    this.state = createGame({ seed: s.map === 'random' ? s.randomSeed : 7, map: s.map });
    this.renderer.setState(this.state);
    this.renderer.cameras[0].snapTo((this.state.world.W * TILE) / 2, (this.state.world.H * TILE) / 2);
  }

  showMenu() {
    this.phase = 'menu';
    this.paused = false;
    this.audio.stopMusic();
    this.clearLayers();
    this.loadPreview();
    this.screens.showMain(this.menuState());
    this.resize();
  }

  private clearLayers() {
    for (const l of this.layers) {
      l.touch.dispose();
      l.el.remove();
    }
    this.layers = [];
    this.inputs = [];
  }

  /** Devices per player for this match. */
  private assignDevices(players: 1 | 2): InputDevice[][] {
    const found = connectedPads();
    const pad = (i: number) => this.pads[i];
    if (players === 1) return [[this.keyboards.solo, pad(found.length ? found[0] : 0)]];
    if (found.length >= 2) return [[this.keyboards.solo, pad(found[0])], [pad(found[1])]];
    if (found.length === 1) return [[this.keyboards.solo], [pad(found[0])]];
    return [[this.keyboards.p1], [this.keyboards.p2]];
  }

  startMatch(players: 1 | 2, seed?: number) {
    const s = this.settings;
    this.players = players;
    this.seed = seed ?? (s.map === 'random' ? s.randomSeed : (Math.random() * 2 ** 31) | 0);
    this.state = createGame({ seed: this.seed, map: s.map });
    this.renderer.setState(this.state);
    this.clearLayers();
    const devices = this.assignDevices(players);
    for (let i = 0; i < players; i++) {
      const side = i as Side;
      const layer = new PlayerLayer(
        this.root,
        side,
        {
          select: (t) => this.inputs[i].select(t),
          again: () => this.startMatch(this.players),
          toMenu: () => this.showMenu(),
          toggleSound: () => {
            this.audio.unlock();
            this.audio.setMuted(!this.audio.muted);
            for (const l of this.layers) l.setSound(!this.audio.muted);
            return !this.audio.muted;
          },
        },
        players,
      );
      layer.setSound(!this.audio.muted);
      layer.el.addEventListener('pointerdown', () => this.skipSkull(side));
      this.layers.push(layer);
      this.inputs.push(new PlayerInput([...devices[i], layer.touch]));
    }
    // Keep the full-screen overlays above the player layers.
    this.root.append(this.screens.root);
    this.opponent = players === 1 ? new AiController(1, s.difficulty, this.seed) : null;
    this.audio.setPlayers(players === 1 ? [0] : [0, 1]);
    this.audio.stopMusic();
    this.acc = 0;
    this.slowT = 0;
    this.begun = false;
    this.deadT = { 0: 0, 1: 0 };
    this.skullT = { 0: null, 1: null };
    this.winFx = 0;
    this.paused = false;
    this.phase = 'play';
    this.screens.hideAll();
    this.resize();
    for (const l of this.layers) l.openBay('start', this.state);
  }

  setPaused(p: boolean) {
    if (this.phase !== 'play') return;
    this.paused = p;
    if (p) this.screens.showPause();
    else {
      this.screens.hideAll();
      for (const i of this.inputs) i.reset();
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.code !== 'Escape') return;
    const open = this.screens.open;
    if (open === 'settings') {
      if (this.screens.returnTo === 'pause') this.screens.showPause();
      else this.showMenu();
    } else if (open === 'pause') this.setPaused(false);
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

  // ---------------------------------------------------------------- loop

  /** True when the sim should advance. */
  private get running() {
    if (this.phase !== 'play' || this.paused || this.state.winner !== -1) return false;
    const pending = this.inputs.some((i) => i.hasPendingSelect);
    // Single player pauses while choosing a vehicle (prototype); split screen runs once anyone has launched.
    if (this.players === 1) return this.layers.some((l) => !l.bayOpen) || pending;
    return this.begun || pending;
  }

  private frame(ts: number) {
    const t0 = performance.now();
    this.frameInner(ts);
    this.stats.cpuMs += (performance.now() - t0 - this.stats.cpuMs) * 0.05;
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

    if (this.phase === 'play' && !this.paused) {
      for (const i of this.inputs) i.poll();
      if (this.inputs.some((i) => i.pauseRequested)) {
        for (const i of this.inputs) i.pauseRequested = false;
        this.setPaused(true);
      }
    } else this.menuPads();

    const eff = this.renderer.effects;
    if (eff && eff.slowMo > 0) {
      // Slow motion only when nobody else shares the screen.
      if (this.players === 1) this.slowT = eff.slowMo;
      eff.slowMo = 0;
    }
    let gdt = dt * this.speed;
    if (this.slowT > 0) {
      this.slowT -= dt;
      gdt *= 0.3;
    }
    if (this.running) {
      this.acc += gdt;
      let n = 0;
      const cap = MAX_STEPS_PER_FRAME * Math.max(1, Math.ceil(this.speed));
      while (this.acc >= DT && n < cap) {
        this.acc -= DT;
        n++;
        this.tick();
        if (this.state.winner !== -1) break;
      }
      if (n === cap) this.acc = 0;
    }
    if (this.phase === 'play' && !this.paused) this.gamepadBays();
    for (const l of this.layers) l.update(dt, this.state, this.time);
    this.updateBays(dt);
    this.updateFx(dt);
    this.audio.update(this.layers.map((l) => ({ side: l.side, x: this.renderer.cameras[l.side]?.x ?? 0, y: this.renderer.cameras[l.side]?.y ?? 0 })));
    const orbit = this.phase === 'menu' || this.layers.every((l) => l.mode === 'start' || l.mode === 'win');
    this.renderer.draw(dt, this.time, this.views(), orbit);
  }

  private tick() {
    const intents: [Intent, Intent] = [this.intentFor(0), this.intentFor(1)];
    const events = step(this.state, intents, DT);
    this.stats.ticks++;
    this.bus.emit(events);
  }

  private intentFor(side: Side): Intent {
    const input = this.inputs[side];
    if (input) return input.intent();
    return this.opponent!.intent(this.state, side);
  }

  // ---------------------------------------------------------------- menus by gamepad

  private static moveFocus(buttons: HTMLElement[], nav: GamepadDevice['nav']) {
    if (!buttons.length) return;
    let k = buttons.indexOf(document.activeElement as HTMLElement);
    // RTL: "left" moves forward through the list.
    const delta = nav.left || nav.down ? 1 : nav.right || nav.up ? -1 : 0;
    if (delta) {
      k = k < 0 ? 0 : (k + delta + buttons.length) % buttons.length;
      buttons[k].focus();
    }
    if (nav.confirm) (k >= 0 ? buttons[k] : buttons[0]).click();
  }

  /** Any gamepad drives the main menu, settings and pause screens. */
  private menuPads() {
    for (const p of this.pads) {
      if (!p.connected()) continue;
      p.read();
      if (this.screens.open) Game.moveFocus(this.screens.buttons(), p.nav);
      if (this.paused && p.nav.back) this.setPaused(false);
    }
  }

  /** Each player's gamepad drives their own vehicle bay. */
  private gamepadBays() {
    this.inputs.forEach((input, i) => {
      const l = this.layers[i];
      if (!l?.bayOpen) return;
      const pad = input.devices.find((d): d is GamepadDevice => d instanceof GamepadDevice);
      if (pad) Game.moveFocus(l.bayButtons(), pad.nav);
    });
  }

  // ---------------------------------------------------------------- events

  private onEvents(events: readonly SimEvent[]) {
    for (const e of events) {
      for (const l of this.layers) l.onEvent(e, this.state);
      if (e.type === 'vehicleSpawned') {
        this.begun = true;
        this.inputs[e.side]?.clearSelect();
        this.layers[e.side]?.closeBay(this.state);
      } else if (e.type === 'vehicleDocked') {
        const l = this.layers[e.side];
        if (l && this.state.winner === -1) l.openBay('dock', this.state);
      } else if (e.type === 'gameOver') {
        for (const l of this.layers) {
          const won = e.winner === l.side;
          l.openBay(won ? 'win' : 'lose', this.state, { reason: e.reason, winner: e.winner });
          if (won) this.winFx = 12;
          else {
            this.skullT[l.side] = 0;
            this.audio.laugh();
          }
        }
      }
    }
  }

  /** After a vehicle is lost: the wreck burns, the skull laughs, then the bay opens. */
  private updateBays(dt: number) {
    if (this.phase !== 'play' || this.state.winner !== -1) return;
    for (const l of this.layers) {
      const sd = this.state.sides[l.side];
      if (sd.vehicle || l.bayOpen) {
        this.deadT[l.side] = 0;
        continue;
      }
      this.deadT[l.side] += dt;
      const sk = this.skullT[l.side];
      if (sk === null) {
        if (this.deadT[l.side] > 1.5) {
          this.skullT[l.side] = 0;
          this.audio.laugh();
        }
      } else if (sk > 3.2 && sd.respawn <= 0) this.skipSkull(l.side, true);
    }
  }

  private skipSkull(side: Side, force = false) {
    const t = this.skullT[side];
    if (t === null || this.state.winner !== -1 || (!force && t < 0.6)) return;
    this.skullT[side] = null;
    this.layers[side]?.openBay('lost', this.state);
  }

  private updateFx(dt: number) {
    for (const side of [0, 1] as Side[]) if (this.skullT[side] !== null) this.skullT[side]! += dt;
    if (this.winFx > 0 && this.state.winner !== -1) {
      this.winFx -= dt;
      const sd = this.state.sides[this.state.winner];
      if (Math.random() < dt * 3)
        this.renderer.effects?.boom(sd.padX + (Math.random() - 0.5) * 300, sd.padY + (Math.random() - 0.5) * 300, 1.3, HEIGHT.ground + 70 + Math.random() * 80, true);
    }
  }

  // ---------------------------------------------------------------- layout

  /** One viewport per player: side by side on wide screens, stacked on tall ones. */
  private rects(): { x: number; y: number; w: number; h: number }[] {
    const w = this.root.clientWidth || 800;
    const h = this.root.clientHeight || 600;
    if (this.phase !== 'play' || this.players === 1) return [{ x: 0, y: 0, w, h }];
    if (w >= h) {
      const half = Math.floor(w / 2);
      return [{ x: 0, y: 0, w: half - 1, h }, { x: half + 1, y: 0, w: w - half - 1, h }];
    }
    const half = Math.floor(h / 2);
    return [{ x: 0, y: 0, w, h: half - 1 }, { x: 0, y: half + 1, w, h: h - half - 1 }];
  }

  private views(): ViewSpec[] {
    const rects = this.rects();
    if (this.phase !== 'play') return [{ side: 0, ...rects[0] }];
    return this.layers.map((l, i) => ({ side: l.side, ...rects[i], skull: this.skullT[l.side] }));
  }

  resize() {
    const w = this.root.clientWidth || 800;
    const h = this.root.clientHeight || 600;
    this.renderer.resize(w, h);
    const rects = this.rects();
    this.layers.forEach((l, i) => l.setRect(rects[i].x, rects[i].y, rects[i].w, rects[i].h));
    this.root.classList.toggle('split', this.layers.length > 1);
  }
}
