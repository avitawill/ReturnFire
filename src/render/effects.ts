// Visual effects driven by sim events: explosions, smoke, fire, debris,
// muzzle flashes, scorch marks, dust and rocket trails.

import * as THREE from 'three';
import type { GameState } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { HEIGHT, VEHICLES } from '../sim/tuning';
import type { Terrain } from './terrain';

const G = HEIGHT.ground;

/** 0 = fire (additive), 1 = dark smoke, 2 = light dust/steam. */
type PK = 0 | 1 | 2;
interface Particle {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  life: number;
  max: number;
  r: number;
  k: PK;
}
interface Debris {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  rx: number;
  rz: number;
  sp: number;
  life: number;
  s: number;
}
interface Fire {
  x: number;
  y: number;
  h: number;
  t: number;
  acc: number;
}
interface Shake {
  x: number;
  y: number;
  amount: number;
}

const MAX_P = 900;
const MAX_DEBRIS = 60;

const VERT = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float scale;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vTint;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = (1.0 - d);
    a = a * a;
    gl_FragColor = vec4(vTint.rgb, vTint.a * a);
  }
`;

class ParticleCloud {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private size: Float32Array;
  private tint: Float32Array;
  readonly material: THREE.ShaderMaterial;

  constructor(additive: boolean) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_P * 3);
    this.size = new Float32Array(MAX_P);
    this.tint = new Float32Array(MAX_P * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { scale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  write(list: Particle[], pick: (p: Particle) => boolean) {
    let n = 0;
    for (const q of list) {
      if (!pick(q) || n >= MAX_P) continue;
      const t = Math.max(0, q.life / q.max);
      this.pos[n * 3] = q.x;
      this.pos[n * 3 + 1] = q.h;
      this.pos[n * 3 + 2] = q.y;
      let r: number;
      let gc: number;
      let b: number;
      let a: number;
      let sz: number;
      if (q.k === 0) {
        r = 1;
        gc = 0.35 + 0.5 * t;
        b = 0.1 + 0.3 * t;
        a = Math.min(1, t * 1.6);
        sz = q.r * (2.2 + (1 - t) * 2.5);
      } else if (q.k === 1) {
        r = 0.17;
        gc = 0.165;
        b = 0.155;
        a = 0.6 * t;
        sz = q.r * (2.5 + (1 - t) * 4);
      } else {
        r = 0.9;
        gc = 0.88;
        b = 0.83;
        a = 0.4 * t;
        sz = q.r * (2 + (1 - t) * 3);
      }
      this.size[n] = sz * 2;
      this.tint[n * 4] = r;
      this.tint[n * 4 + 1] = gc;
      this.tint[n * 4 + 2] = b;
      this.tint[n * 4 + 3] = a;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.tint as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface EffectsOptions {
  /** Dynamic point lights for explosion flashes. */
  flashes: boolean;
  /** Particle budget multiplier (0..1). */
  density: number;
  reducedMotion: boolean;
}

export class Effects {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  private debris: Debris[] = [];
  private fires: Fire[] = [];
  private shakes: Shake[] = [];
  private fire = new ParticleCloud(true);
  private smoke = new ParticleCloud(false);
  private debrisMesh: THREE.InstancedMesh;
  private lights: THREE.PointLight[] = [];
  private state: GameState;
  private terrain: Terrain;
  private opts: EffectsOptions;
  private trailAcc = 0;
  /** Time-scale request (slow motion on tower collapse). Read and cleared by the app. */
  slowMo = 0;

  constructor(state: GameState, terrain: Terrain, opts: EffectsOptions) {
    this.state = state;
    this.terrain = terrain;
    this.opts = opts;
    this.group.add(this.smoke.points, this.fire.points);
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX_DEBRIS);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.debrisMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      this.debrisMesh.setColorAt(i, c.set(i % 3 ? '#6f6c62' : i % 2 ? '#8d8a7c' : '#3d3c38'));
    }
    this.group.add(this.debrisMesh);
    if (opts.flashes)
      for (let i = 0; i < 2; i++) {
        const l = new THREE.PointLight('#ffb060', 0, 320, 2);
        this.lights.push(l);
        this.group.add(l);
      }
  }

  setOptions(o: Partial<EffectsOptions>) {
    Object.assign(this.opts, o);
  }

  /** Point-sprite size scale for the current viewport (pixels per world unit at distance 1). */
  setViewScale(scale: number) {
    this.fire.material.uniforms.scale.value = scale;
    this.smoke.material.uniforms.scale.value = scale;
  }

  private add(p: Particle) {
    if (this.parts.length < MAX_P * 2) this.parts.push(p);
  }

  boom(x: number, y: number, s: number, h: number, quiet = false) {
    const n = Math.max(2, Math.floor((5 + s * 10) * this.opts.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const v = (20 + Math.random() * 70) * s;
      this.add({ x, y, h, vh: (15 + Math.random() * 60) * s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.5 * s, max: 0.8, r: (3 + Math.random() * 7) * s, k: i % 3 ? 0 : 1 });
    }
    if (s >= 0.8) {
      if (!quiet) this.flash(x, y, h);
      if (h < G + 25 && !quiet) {
        this.terrain.scorch(x, y, 26 * s);
        this.spawnDebris(x, y, Math.floor(s * 4), h);
      }
      if (!quiet && !this.opts.reducedMotion) this.shakes.push({ x, y, amount: s * 5 });
    }
  }

  puff(x: number, y: number, h: number) {
    for (let i = 0; i < 4; i++) this.add({ x, y, h, vh: 20, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.4, max: 0.4, r: 4, k: 2 });
  }

  private flash(x: number, y: number, h: number) {
    if (!this.lights.length) return;
    let b = this.lights[0];
    for (const l of this.lights) if (l.intensity < b.intensity) b = l;
    b.position.set(x, h + 30, y);
    b.intensity = 2.6 * 2000;
  }

  private spawnDebris(x: number, y: number, n: number, h: number) {
    for (let i = 0; i < n && this.debris.length < MAX_DEBRIS; i++) {
      const a = Math.random() * 6.28;
      const v = 40 + Math.random() * 120;
      this.debris.push({ x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vh: 120 + Math.random() * 200, rx: Math.random() * 6, rz: Math.random() * 6, sp: (Math.random() - 0.5) * 12, life: 2.6 + Math.random(), s: 2 + Math.random() * 5 });
    }
  }

  /** Camera shake amount for a view looking at (x, y); decays over time. */
  shakeAt(x: number, y: number): number {
    let s = 0;
    for (const k of this.shakes) if (Math.hypot(k.x - x, k.y - y) < 500) s = Math.max(s, k.amount);
    return s;
  }

  onEvent(e: SimEvent) {
    switch (e.type) {
      case 'explosion':
        this.boom(e.x, e.y, e.size, e.h, e.quiet);
        break;
      case 'shot':
        if (e.weapon === 'shell') this.add({ x: e.x, y: e.y, h: e.h, vh: 0, vx: 0, vy: 0, life: 0.1, max: 0.1, r: 7, k: 0 });
        break;
      case 'treeCrushed':
        this.puff(e.x, e.y, G + 8);
        break;
      case 'structureDestroyed':
        if (e.kind === 'tower') {
          this.spawnDebris(e.x, e.y, 22, G + 25);
          this.fires.push({ x: e.x, y: e.y, h: G + 6, t: 14, acc: 0 });
          if (!this.opts.reducedMotion) this.slowMo = 1;
        }
        break;
      case 'unitDestroyed':
        if (e.kind === 'ptank') this.fires.push({ x: e.x, y: e.y, h: G + 8, t: 9, acc: 0 });
        break;
      case 'vehicleLost':
        if (e.cause === 'destroyed' && !VEHICLES[e.vehicle].fly) this.fires.push({ x: e.x, y: e.y, h: G + 8, t: 7, acc: 0 });
        break;
    }
  }

  update(dt: number) {
    const s = this.state;
    // Rocket trails and driving dust.
    this.trailAcc += dt;
    const emit = this.trailAcc > 1 / 30;
    if (emit) {
      this.trailAcc = 0;
      for (const b of s.projectiles)
        if (b.kind === 'rocket') this.add({ x: b.x, y: b.y, h: b.h, vh: 0, vx: 0, vy: 0, life: 0.35, max: 0.35, r: 3, k: 2 });
      for (const sd of s.sides) {
        const v = sd.vehicle;
        if (!v || VEHICLES[v.type].fly || v.wet || v.throttle < 0.2) continue;
        if (Math.random() < 0.45 * this.opts.density)
          this.add({ x: v.x - Math.cos(v.a) * 12, y: v.y - Math.sin(v.a) * 12, h: Math.max(1, this.terrain.heightAt(v.x, v.y)) + 3, vh: 14, vx: 0, vy: 0, life: 0.6, max: 0.6, r: 3.5, k: 2 });
      }
      for (const sd of s.sides) {
        const v = sd.vehicle;
        if (v && v.sink > 0 && Math.random() < 0.6) this.add({ x: v.x + (Math.random() - 0.5) * 20, y: v.y + (Math.random() - 0.5) * 20, h: 2, vh: 20, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 4, k: 2 });
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.h += q.vh * dt;
      const damp = Math.pow(0.94, dt * 60);
      q.vx *= damp;
      q.vy *= damp;
      if (q.life <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vh -= 420 * dt;
      d.h += d.vh * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rx += d.sp * dt;
      d.rz += d.sp * 0.7 * dt;
      d.life -= dt;
      const gh = Math.max(0, this.terrain.heightAt(d.x, d.y));
      if (d.h < gh) {
        d.h = gh;
        d.vh = -d.vh * 0.35;
        d.vx *= 0.55;
        d.vy *= 0.55;
        d.sp *= 0.5;
      }
      if (d.life <= 0) this.debris.splice(i, 1);
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      f.acc += dt;
      const step = 0.1 / Math.max(0.25, this.opts.density);
      while (f.acc > step) {
        f.acc -= step;
        const ox = (Math.random() - 0.5) * 26;
        const oy = (Math.random() - 0.5) * 26;
        if (f.t > 3) this.add({ x: f.x + ox, y: f.y + oy, h: f.h, vh: 30 + Math.random() * 30, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 5 + Math.random() * 4, k: 0 });
        this.add({ x: f.x + ox, y: f.y + oy, h: f.h + 10, vh: 45 + Math.random() * 25, vx: 12, vy: -6, life: 1.6, max: 1.6, r: 6 + Math.random() * 5, k: 1 });
      }
      if (f.t <= 0) this.fires.splice(i, 1);
    }
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      this.shakes[i].amount -= dt * 20;
      if (this.shakes[i].amount <= 0) this.shakes.splice(i, 1);
    }
    for (const l of this.lights) l.intensity = Math.max(0, l.intensity - dt * 8 * 2000);

    this.fire.write(this.parts, (p) => p.k === 0);
    this.smoke.write(this.parts, (p) => p.k !== 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const d = this.debris[i];
      if (!d) {
        m.makeScale(0, 0, 0);
      } else {
        const sc = d.s * Math.min(1, d.life);
        q.setFromEuler(e.set(d.rx, 0, d.rz));
        m.compose(new THREE.Vector3(d.x, d.h + d.s * 0.4, d.y), q, new THREE.Vector3(sc, sc, sc));
      }
      this.debrisMesh.setMatrixAt(i, m);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }
}
