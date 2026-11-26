// Things that move: commander vehicles, patrol tanks, drones, projectiles,
// mines and flags. Positions are read from sim state each frame; discrete
// changes (wrecks) come from events.

import * as THREE from 'three';
import { Tile, type GameState, type Side, type Vehicle } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { HEIGHT, TILE, VEHICLES, VEHICLE_TYPES, type VehicleType } from '../sim/tuning';
import { flagModel, PALETTES, vehicleModel, WRECK, type VehicleModel } from './models';
import type { Terrain } from './terrain';

const G = HEIGHT.ground;
const FH = HEIGHT.fly;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

interface Pose {
  bank: number;
  pitch: number;
}

const MAX_PROJ = 256;
const MAX_MINES = 32;

export class ActorView {
  readonly group = new THREE.Group();
  private state: GameState;
  private terrain: Terrain;
  private commander: Record<Side, Record<VehicleType, VehicleModel>>;
  private poses: Record<Side, Pose> = { 0: { bank: 0, pitch: 0 }, 1: { bank: 0, pitch: 0 } };
  private units = new Map<number, VehicleModel>();
  private proj: THREE.InstancedMesh;
  private mines: THREE.InstancedMesh;
  private flags: { root: THREE.Group; pennant: THREE.Object3D; ring: THREE.Mesh }[];
  private wakes: THREE.Mesh[];

  constructor(state: GameState, terrain: Terrain) {
    this.state = state;
    this.terrain = terrain;
    const mk = (side: Side) => {
      const out = {} as Record<VehicleType, VehicleModel>;
      for (const t of VEHICLE_TYPES) {
        const m = vehicleModel(t, PALETTES[side]);
        m.root.visible = false;
        this.group.add(m.root);
        out[t] = m;
      }
      return out;
    };
    this.commander = { 0: mk(0), 1: mk(1) };

    const pg = new THREE.SphereGeometry(1, 8, 6);
    this.proj = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PROJ);
    this.proj.frustumCulled = false;
    for (let i = 0; i < MAX_PROJ; i++) {
      this.proj.setMatrixAt(i, ZERO);
      this.proj.setColorAt(i, _c.set('#ffffff'));
    }
    this.group.add(this.proj);

    const mineGeo = new THREE.CylinderGeometry(5, 6, 3, 12);
    this.mines = new THREE.InstancedMesh(mineGeo, new THREE.MeshLambertMaterial({ color: '#1d2224' }), MAX_MINES);
    this.mines.castShadow = true;
    this.mines.frustumCulled = false;
    for (let i = 0; i < MAX_MINES; i++) this.mines.setMatrixAt(i, ZERO);
    this.group.add(this.mines);

    const ringGeo = new THREE.RingGeometry(15, 19, 32).rotateX(-Math.PI / 2);
    this.flags = ([0, 1] as Side[]).map((side) => {
      const f = flagModel(side === 0 ? '#6f9bd4' : '#e0563c');
      f.root.visible = false;
      this.group.add(f.root);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#f0c24a', side: THREE.DoubleSide }));
      ring.visible = false;
      this.group.add(ring);
      return { ...f, ring };
    });
    const wakeGeo = new THREE.RingGeometry(11, 14, 28).rotateX(-Math.PI / 2);
    this.wakes = [0, 1].map(() => {
      const w = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
      w.visible = false;
      w.renderOrder = 2;
      this.group.add(w);
      return w;
    });
  }

  /** Ground height under a vehicle, matching how it floats or sinks. */
  vehicleY(v: Vehicle): number {
    if (VEHICLES[v.type].fly) return G + FH;
    if (v.sink > 0) return -2 - v.sink * 16;
    if (v.wet) return -3;
    return Math.max(1, this.terrain.heightAt(v.x, v.y));
  }

  update(dt: number, time: number) {
    const s = this.state;
    for (const side of [0, 1] as Side[]) {
      const v = s.sides[side].vehicle;
      for (const t of VEHICLE_TYPES) this.commander[side][t].root.visible = !!v && v.type === t;
      this.wakes[side].visible = false;
      if (!v) continue;
      const m = this.commander[side][v.type];
      const y = this.vehicleY(v);
      const fly = VEHICLES[v.type].fly;
      const pose = this.poses[side];
      pose.bank += (v.steer - pose.bank) * Math.min(1, dt * 5);
      pose.pitch += (v.throttle - pose.pitch) * Math.min(1, dt * 4);
      m.root.position.set(v.x, y, v.y);
      m.root.rotation.y = -v.a;
      if (fly) {
        m.root.rotation.x = pose.bank * 0.5;
        m.root.rotation.z = -pose.pitch * 0.2;
      } else if (v.sink > 0) {
        m.root.rotation.x = 0;
        m.root.rotation.z = v.sink * 0.35;
      } else {
        this.slope(v.x, v.y, v.a, m.root);
      }
      if (m.turret) m.turret.rotation.y = -(v.ta - v.a);
      if (m.rotor) m.rotor.rotation.y += dt * 28;
      if (v.wet && v.sink === 0) {
        const w = this.wakes[side];
        w.visible = true;
        w.position.set(v.x, 0.4, v.y);
        w.scale.setScalar(1 + 0.25 * Math.sin(time * 8));
      }
    }

    // Patrol tanks and drones.
    const seen = new Set<number>();
    for (const u of s.units) {
      seen.add(u.id);
      let m = this.units.get(u.id);
      if (!m) {
        m = vehicleModel(u.kind === 'drone' ? 'drone' : 'ptank', PALETTES[u.side]);
        this.group.add(m.root);
        this.units.set(u.id, m);
      }
      const drone = u.kind === 'drone';
      const onWater = this.tile(u.x, u.y) === Tile.Water;
      m.root.position.set(u.x, drone ? G + FH : onWater ? -3 : Math.max(1, this.terrain.heightAt(u.x, u.y)), u.y);
      m.root.rotation.y = -u.a;
      if (!drone) this.slope(u.x, u.y, u.a, m.root);
      if (m.turret) m.turret.rotation.y = -(u.ta - u.a);
      if (m.rotor) m.rotor.rotation.y += dt * 28;
    }
    for (const [id, m] of this.units)
      if (!seen.has(id)) {
        this.group.remove(m.root);
        this.units.delete(id);
      }

    // Projectiles.
    const P = s.projectiles;
    const n = Math.min(P.length, MAX_PROJ);
    for (let i = 0; i < MAX_PROJ; i++) {
      if (i >= n) {
        this.proj.setMatrixAt(i, ZERO);
        continue;
      }
      const b = P[i];
      const k = b.kind === 'bullet' ? 1.5 : b.kind === 'rocket' ? 3.2 : 2.4;
      const len = b.kind === 'shell' ? 1.6 : 3.5;
      _e.set(0, -Math.atan2(b.vy, b.vx), 0);
      _q.setFromEuler(_e);
      _m.compose(_v.set(b.x, b.h, b.y), _q, _s.set(k * len, k, k));
      this.proj.setMatrixAt(i, _m);
      this.proj.setColorAt(i, _c.set(b.byVehicle ? (b.kind === 'rocket' ? '#ece4cf' : b.kind === 'shell' ? '#fff3c9' : '#ffe9a6') : '#ff7a5c'));
    }
    this.proj.instanceMatrix.needsUpdate = true;
    if (this.proj.instanceColor) this.proj.instanceColor.needsUpdate = true;

    for (let i = 0; i < MAX_MINES; i++) {
      const mn = s.mines[i];
      if (!mn) this.mines.setMatrixAt(i, ZERO);
      else this.mines.setMatrixAt(i, _m.makeTranslation(mn.x, Math.max(1, this.terrain.heightAt(mn.x, mn.y)) + 1.5, mn.y));
    }
    this.mines.instanceMatrix.needsUpdate = true;

    // Flags.
    for (const side of [0, 1] as Side[]) {
      const fl = s.flags[side];
      const f = this.flags[side];
      f.root.visible = fl.state !== 'hidden';
      f.ring.visible = fl.state === 'ground';
      f.pennant.rotation.y = Math.sin(time * 6 + side) * 0.25;
      if (fl.state === 'ground') {
        const fy = Math.max(1, this.terrain.heightAt(fl.x, fl.y));
        f.root.position.set(fl.x, fy, fl.y);
        f.ring.position.set(fl.x, fy + 1, fl.y);
        f.ring.scale.setScalar(1 + 0.15 * Math.sin(time * 5));
      } else if (fl.state === 'carried') {
        const carrier = s.sides[fl.side === 0 ? 1 : 0].vehicle;
        if (carrier) {
          f.root.position.set(carrier.x - Math.cos(carrier.a) * 6, this.vehicleY(carrier) + 8, carrier.y - Math.sin(carrier.a) * 6);
        }
      } else if (fl.state === 'captured') {
        const captor = s.sides[fl.side === 0 ? 1 : 0];
        f.root.position.set(captor.padX + (fl.side === 0 ? 40 : -40), G, captor.padY + (fl.side === 0 ? 50 : -50));
      }
    }
  }

  private tile(x: number, y: number) {
    const w = this.state.world;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    return tx < 0 || ty < 0 || tx >= w.W || ty >= w.H ? Tile.Water : w.tiles[ty * w.W + tx];
  }

  /** Tilt a ground vehicle to follow the terrain slope. */
  private slope(x: number, y: number, a: number, obj: THREE.Object3D) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const L = 12;
    const hf = this.terrain.heightAt(x + ca * L, y + sa * L);
    const hb = this.terrain.heightAt(x - ca * L, y - sa * L);
    const hl = this.terrain.heightAt(x + sa * L, y - ca * L);
    const hr = this.terrain.heightAt(x - sa * L, y + ca * L);
    obj.rotation.z = Math.atan2(hf - hb, 2 * L);
    obj.rotation.x = Math.atan2(hr - hl, 2 * L);
  }

  onEvent(e: SimEvent) {
    if (e.type === 'unitDestroyed' && e.kind === 'ptank') this.addWreck('ptank', e.x, e.y, e.a, e.ta);
    else if (e.type === 'vehicleLost' && e.cause === 'destroyed' && !VEHICLES[e.vehicle].fly) this.addWreck(e.vehicle, e.x, e.y, e.a, e.ta);
  }

  private addWreck(kind: 'ptank' | VehicleType, x: number, y: number, a: number, ta: number) {
    if (this.tile(x, y) === Tile.Water) return;
    const w = vehicleModel(kind, WRECK);
    w.root.position.set(x, Math.max(1, this.terrain.heightAt(x, y)) - 1, y);
    w.root.rotation.set(0.12, -a, 0.1);
    if (w.turret) w.turret.rotation.y = -(ta - a) + 0.6;
    this.group.add(w.root);
  }
}
