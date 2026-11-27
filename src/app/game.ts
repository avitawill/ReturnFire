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
import { RelayClient, relayUrl, saveRelayUrl, type RelayEvent } from '../net/client';
import { delayForRtt, Lockstep, type NetMsg } from '../net/lockstep';
import { he } from '../i18n/he';

interface NetSetup {
  k: 'setup';
  seed: number;
  map: string;
  delay: number;
}

interface NetSession {
  client: RelayClient;
  local: Side;
  lock: Lockstep | null;
  ended: boolean;
  stallT: number;
  off: () => void;
}

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
  /** The last vehicle was a drone spent on purpose: no skull for that. */
  private spent: Record<Side, boolean> = { 0: false, 1: false };
  private winFx = 0;
  private reducedMotion: boolean;
  private seed = 1;
  readonly stats = { fps: 0, frames: 0, frameMs: 0, ticks: 0, cpuMs: 0, calls: 0, triangles: 0 };
  private fpsAcc = 0;
  private fpsN = 0;
  /** Online session, if any. */
  net: NetSession | null = null;
  private banner: HTMLDivElement;

  constructor(root: HTMLElement, cfg: GameConfig = {}) {
    this.root = root;
    root.dir = 'rtl';
    root.lang = 'he';
    this.settings = loadSettings();
    if (cfg.quality) this.settings.quality = cfg.quality;
    if (cfg.difficulty) this.settings.difficulty = cfg.difficulty;
    if (cfg.map) this.settings.map = cfg.map;
    this.speed = cfg.speed ?? 1;
    this.banner = document.createElement('div');
    this.banner.className = 'net-banner';
    this.banner.hidden = true;
    root.append(this.banner);
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
      openOnline: () => this.screens.showOnline(relayUrl()),
      onlineCreate: (relay) => void this.hostOnline(relay),
      onlineJoin: (code, relay) => void this.joinOnline(code, relay),
      onlineCancel: () => this.showMenu(),
      install: () => {
        const p = this.installPrompt;
        this.installPrompt = null;
        this.screens.setInstall(false, false);
        void p?.prompt();
      },
    });
    this.setupInstall();
    addEventListener('resize', () => this.resize());
    if (cfg.seed !== undefined) this.seed = cfg.seed;
    if (cfg.autostart) this.startMatch(cfg.autostart, cfg.seed);
    else this.showMenu();
    this.resize();
  }

  // ---------------------------------------------------------------- setup

  private installPrompt: { prompt(): Promise<unknown> } | null = null;

  /** Installable app: Chrome/Edge fire beforeinstallprompt; iOS Safari needs Share > Add to Home Screen. */
  private setupInstall() {
    const standalone = matchMedia?.('(display-mode: standalone)').matches || matchMedia?.('(display-mode: fullscreen)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.screens.setInstall(false, ios);
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e as unknown as { prompt(): Promise<unknown> };
      this.screens.setInstall(true, false);
    });
    addEventListener('appinstalled', () => this.screens.setInstall(false, false));
  }

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
    this.leaveOnline();
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

  startMatch(players: 1 | 2, seed?: number, online?: { local: Side; map: string; delay: number }) {
    const s = this.settings;
    if (!online) this.leaveOnline();
    this.players = players;
    this.seed = seed ?? (s.map === 'random' ? s.randomSeed : (Math.random() * 2 ** 31) | 0);
    this.state = createGame({ seed: this.seed, map: online?.map ?? s.map });
    this.renderer.setState(this.state);
    this.clearLayers();
    const devices = this.assignDevices(players);
    for (let i = 0; i < players; i++) {
      const side = (online ? online.local : i) as Side;
      const layer = new PlayerLayer(
        this.root,
        side,
        {
          select: (t) => this.inputs[i].select(t),
          again: () => (this.net ? this.showMenu() : this.startMatch(this.players)),
          toMenu: () => this.showMenu(),
          toggleSound: () => {
            this.audio.unlock();
            this.audio.setMuted(!this.audio.muted);
            for (const l of this.layers) l.setSound(!this.audio.muted);
            return !this.audio.muted;
          },
          pause: () => this.setPaused(true),
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
    this.opponent = players === 1 && !online ? new AiController(1, s.difficulty, this.seed) : null;
    this.audio.setPlayers(online ? [online.local] : players === 1 ? [0] : [0, 1]);
    if (online && this.net) {
      const net = this.net;
      net.lock = new Lockstep({
        state: this.state,
        local: online.local,
        delay: online.delay,
        send: (m) => net.client.send(m),
        onEvents: (ev) => this.bus.emit(ev),
        onResync: (st) => {
          this.state = st;
          this.renderer.setState(st);
        },
      });
    }
    this.audio.stopMusic();
    this.acc = 0;
    this.slowT = 0;
    this.begun = false;
    this.deadT = { 0: 0, 1: 0 };
    this.skullT = { 0: null, 1: null };
    this.spent = { 0: false, 1: false };
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
    if (p) this.screens.showPause(!!this.net);
    else {
      this.screens.hideAll();
      for (const i of this.inputs) i.reset();
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.code !== 'Escape') return;
    const open = this.screens.open;
    if (open === 'online') this.showMenu();
    else if (open === 'settings') {
      if (this.screens.returnTo === 'pause') this.screens.showPause();
      else this.showMenu();
    } else if (open === 'pause') this.setPaused(false);
  }

  // ---------------------------------------------------------------- online

  private async connectRelay(relay: string): Promise<RelayClient | null> {
    this.leaveOnline();
    if (relay && relay !== relayUrl()) saveRelayUrl(relay);
    const client = new RelayClient();
    this.screens.setOnlineStatus(he.online.connecting, '');
    try {
      await client.connect(relay || relayUrl());
    } catch {
      this.screens.setOnlineStatus(he.online.noServer, '');
      return null;
    }
    const net: NetSession = { client, local: 0, lock: null, ended: false, stallT: 0, off: () => {} };
    net.off = client.on((e) => this.onRelay(e));
    this.net = net;
    return client;
  }

  /** Create a room, wait for a friend, then pick the game and start as player 1. */
  private async hostOnline(relay: string) {
    const client = await this.connectRelay(relay);
    if (!client) return;
    this.net!.local = 0;
    client.create();
  }

  private async joinOnline(code: string, relay: string) {
    if (code.length < 4) return;
    const client = await this.connectRelay(relay);
    if (!client) return;
    this.net!.local = 1;
    client.join(code);
  }

  private onRelay(e: RelayEvent) {
    const net = this.net;
    if (!net) return;
    if (e.t === 'created') this.screens.setOnlineStatus(he.online.waiting, e.code);
    else if (e.t === 'error') this.screens.setOnlineStatus(e.e === 'no-room' ? he.online.noRoom : e.e === 'room-full' ? he.online.roomFull : he.online.noServer);
    else if (e.t === 'paired') {
      this.screens.setOnlineStatus(he.online.starting);
      if (e.role === 'host') {
        // Measure latency, then choose the input delay, the map and the seed for both.
        for (let i = 0; i < 4; i++) setTimeout(() => net.client.ping(), i * 120);
        setTimeout(() => {
          if (this.net !== net) return;
          const s = this.settings;
          const setup: NetSetup = {
            k: 'setup',
            seed: s.map === 'random' ? s.randomSeed : (Math.random() * 2 ** 31) | 0,
            map: s.map,
            delay: delayForRtt(net.client.rtt * 2),
          };
          net.client.send(setup);
          this.startMatch(1, setup.seed, { local: 0, map: setup.map, delay: setup.delay });
        }, 700);
      }
    } else if (e.t === 'm') {
      const d = e.d as NetMsg | NetSetup | { k: 'bye' };
      if (d.k === 'setup') this.startMatch(1, d.seed, { local: 1, map: d.map, delay: d.delay });
      else if (d.k === 'bye') this.peerGone();
      else net.lock?.receive(d);
    } else if (e.t === 'peer-left' || e.t === 'closed') {
      if (this.phase === 'play') this.peerGone();
      else this.screens.setOnlineStatus(he.online.peerLeft, '');
    }
  }

  private peerGone() {
    const net = this.net;
    if (!net || net.ended) return;
    net.ended = true;
    if (this.state.winner !== -1) return;
    for (const l of this.layers) l.say(he.online.peerLeft, 6);
    setTimeout(() => {
      if (this.net === net) this.showMenu();
    }, 4000);
  }

  private leaveOnline() {
    const net = this.net;
    if (!net) return;
    this.net = null;
    net.off();
    net.client.send({ k: 'bye' });
    net.client.close();
    this.banner.hidden = true;
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
    if (this.net) return this.phase === 'play' && !this.net.ended && !!this.net.lock && this.state.winner === -1;
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
        if (this.net) {
          if (!this.netTick()) {
            // Waiting for the other player's input: hold the clock, don't pile up time.
            this.acc = Math.min(this.acc, DT * 3);
            break;
          }
        } else this.tick();
        this.acc -= DT;
        n++;
        if (this.state.winner !== -1) break;
      }
      if (n === cap) this.acc = 0;
      // Fell behind the other machine (e.g. a slow frame): catch up a little.
      const lock = this.net?.lock;
      if (lock && lock.buffered > lock.delay + 6) for (let k = 0; k < 4 && this.netTick(); k++);
    }
    this.updateNetBanner(dt);
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

  /** One online tick; false while the other player's input has not arrived. */
  private netTick(): boolean {
    const net = this.net!;
    const input = this.inputOf(net.local);
    const ok = net.lock!.tick(input ? input.intent() : { move: { x: 0, y: 0 }, fire: false, secondary: false, select: null });
    if (ok) {
      net.stallT = 0;
      this.stats.ticks++;
    }
    this.state = net.lock!.state;
    return ok;
  }

  private updateNetBanner(dt: number) {
    const net = this.net;
    if (!net?.lock || net.ended || this.state.winner !== -1) {
      this.banner.hidden = true;
      return;
    }
    net.stallT += dt;
    // Only mention it when the wait is noticeable.
    this.banner.hidden = net.stallT < 0.5;
    this.banner.textContent = he.online.lagging;
  }

  private layerOf(side: Side) {
    return this.layers.find((l) => l.side === side);
  }

  private inputOf(side: Side) {
    const i = this.layers.findIndex((l) => l.side === side);
    return i >= 0 ? this.inputs[i] : undefined;
  }

  private intentFor(side: Side): Intent {
    const input = this.inputOf(side);
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
      if (e.type === 'vehicleLost') this.spent[e.side] = e.cause === 'expended';
      if (e.type === 'vehicleSpawned') {
        this.begun = true;
        this.inputOf(e.side)?.clearSelect();
        this.layerOf(e.side)?.closeBay(this.state);
      } else if (e.type === 'vehicleDocked') {
        const l = this.layerOf(e.side);
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
      if (this.spent[l.side]) {
        if (this.deadT[l.side] > 1.2 && sd.respawn <= 0) {
          this.spent[l.side] = false;
          l.openBay('lost', this.state);
        }
        continue;
      }
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
    this.layerOf(side)?.openBay('lost', this.state);
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
