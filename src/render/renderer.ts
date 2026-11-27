// Owns the WebGL renderer and the scene. Builds everything from a GameState,
// reacts to sim events, and draws one viewport per player.

import * as THREE from 'three';
import type { GameState, Side } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { TILE, VEHICLES } from '../sim/tuning';
import { ActorView } from './actors';
import { FollowCamera } from './camera';
import { Effects } from './effects';
import { SkullScene } from './skull';
import { WorldView } from './worldview';

export type Quality = 'low' | 'medium' | 'high';

interface QualityPreset {
  shadows: boolean;
  shadowMap: number;
  soft: boolean;
  maxDpr: number;
  flashes: boolean;
  density: number;
  antialias: boolean;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  high: { shadows: true, shadowMap: 2048, soft: true, maxDpr: 2, flashes: true, density: 1, antialias: true },
  medium: { shadows: true, shadowMap: 1024, soft: false, maxDpr: 1.5, flashes: true, density: 0.8, antialias: true },
  low: { shadows: false, shadowMap: 512, soft: false, maxDpr: 1, flashes: false, density: 0.5, antialias: false },
};

export interface ViewSpec {
  /** Whose vehicle this view follows. */
  side: Side;
  /** Seconds since the laughing skull appeared in this view, or null. */
  skull?: number | null;
  /** Viewport in CSS pixels, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private state: GameState | null = null;
  world: WorldView | null = null;
  actors: ActorView | null = null;
  effects: Effects | null = null;
  readonly cameras: FollowCamera[] = [];
  private preset: QualityPreset;
  private reducedMotion: boolean;
  quality: Quality;
  private skullScene: SkullScene | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality, reducedMotion: boolean) {
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.reducedMotion = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' });
    this.renderer.setScissorTest(true);
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic response: brighter highlights roll off instead of clipping (explosions, sand).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const sky = new THREE.Color('#8fbcc6');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 600, 2000);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5d5a3e, 1.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    // Warm, low-ish afternoon sun for long readable shadows.
    this.sun = new THREE.DirectionalLight(0xffe2b8, 3.1);
    this.sun.castShadow = this.preset.shadows;
    this.sun.shadow.mapSize.set(this.preset.shadowMap, this.preset.shadowMap);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    if (this.preset.soft) this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);
  }

  /** (Re)build the scene for a new game. */
  setState(state: GameState) {
    if (this.world) this.scene.remove(this.world.group);
    if (this.actors) this.scene.remove(this.actors.group);
    if (this.effects) this.scene.remove(this.effects.group);
    this.state = state;
    this.world = new WorldView(state, this.quality !== 'low');
    this.actors = new ActorView(state, this.world.terrain);
    this.effects = new Effects(state, this.world.terrain, {
      flashes: this.preset.flashes,
      density: this.preset.density,
      reducedMotion: this.reducedMotion,
    });
    this.scene.add(this.world.group, this.actors.group, this.effects.group);
    const W = state.world.W * TILE;
    const H = state.world.H * TILE;
    this.cameras.length = 0;
    for (const side of [0, 1] as Side[]) {
      const sd = state.sides[side];
      this.cameras.push(new FollowCamera(sd.padX, sd.padY, W, H));
    }
  }

  onEvents(events: readonly SimEvent[]) {
    for (const e of events) {
      this.world?.onEvent(e);
      this.actors?.onEvent(e);
      this.effects?.onEvent(e);
    }
  }

  /** Size the drawing buffer to the canvas' CSS size. */
  resize(cssW: number, cssH: number) {
    const dpr = Math.min(this.preset.maxDpr, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
  }

  /** Advance animations by `dt` real seconds and draw every view. */
  draw(dt: number, time: number, views: ViewSpec[], orbit: boolean) {
    const s = this.state;
    if (!s || !this.world || !this.actors || !this.effects) return;
    this.world.update(dt, time);
    this.actors.update(dt, time);
    this.effects.update(dt);
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    for (const v of views) {
      const y0 = size.y - v.y - v.h;
      if (v.skull != null) {
        this.skullScene ??= new SkullScene();
        this.skullScene.pose(v.skull, v.w / Math.max(1, v.h));
        this.renderer.setViewport(v.x, y0, v.w, v.h);
        this.renderer.setScissor(v.x, y0, v.w, v.h);
        this.renderer.render(this.skullScene.scene, this.skullScene.camera);
        continue;
      }
      const cam = this.cameras[v.side];
      cam.resize(v.w, v.h);
      cam.orbit = orbit;
      const veh = s.sides[v.side].vehicle;
      const target = veh ? { x: veh.x, y: veh.y, a: veh.a, fly: VEHICLES[veh.type].fly } : null;
      const { tx, tz, D } = cam.update(dt, target, this.effects.shakeAt(cam.x, cam.y));
      const fog = this.scene.fog as THREE.Fog;
      fog.near = D * 1.25;
      fog.far = D * 3.4;
      if (this.preset.shadows) {
        const sc = this.sun.shadow.camera;
        const ext = D * 1.15;
        sc.left = -ext;
        sc.right = ext;
        sc.top = ext;
        sc.bottom = -ext;
        sc.near = 50;
        sc.far = 2200;
        sc.updateProjectionMatrix();
      }
      this.sun.position.set(tx - 320, 620, tz + 260);
      this.sun.target.position.set(tx, 0, tz);
      this.sun.target.updateMatrixWorld();
      this.effects.setViewScale(cam.pixelScale(v.h) * this.renderer.getPixelRatio());
      const y = size.y - v.y - v.h;
      this.renderer.setViewport(v.x, y, v.w, v.h);
      this.renderer.setScissor(v.x, y, v.w, v.h);
      this.renderer.render(this.scene, cam.camera);
    }
  }

  dispose() {
    this.renderer.dispose();
  }
}
