// On-ground aiming marker for the local players' drone or helicopter:
// a ring where the dive/shots would land, and a dotted guide line to it.

import * as THREE from 'three';
import type { GameState, Side } from '../sim/entities';
import { aimPoint } from '../sim/systems/aim';
import type { Terrain } from './terrain';

const DOTS = 14;
const FREE = new THREE.Color('#f0e6c8');
const LOCK = new THREE.Color('#ff4a2e');

class Marker {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private cross: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  /** Dark outlines under the ring and dots, so the marker reads on sand and grass alike. */
  private ringShadow: THREE.Mesh;
  private dotShadows: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private dotMat: THREE.MeshBasicMaterial;

  constructor() {
    const common = { transparent: true, depthTest: false, depthWrite: false, fog: false } as const;
    this.mat = new THREE.MeshBasicMaterial({ ...common, color: FREE, opacity: 1, side: THREE.DoubleSide });
    this.dotMat = new THREE.MeshBasicMaterial({ ...common, color: FREE, opacity: 0.85 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(9, 12, 32).rotateX(-Math.PI / 2), this.mat);
    // A small cross in the middle of the ring.
    const cg = new THREE.PlaneGeometry(10, 2).rotateX(-Math.PI / 2);
    const cg2 = cg.clone().rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pa = [...(cg.attributes.position.array as Float32Array), ...(cg2.attributes.position.array as Float32Array)];
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
    const idx = cg.index!.array as ArrayLike<number>;
    merged.setIndex([...Array.from(idx), ...Array.from(idx).map((i) => i + 4)]);
    this.cross = new THREE.Mesh(merged, this.mat);
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1.6, 8).rotateX(-Math.PI / 2), this.dotMat, DOTS);
    this.dots.frustumCulled = false;
    const dark = new THREE.MeshBasicMaterial({ ...common, color: '#0b1214', opacity: 0.55, side: THREE.DoubleSide });
    this.ringShadow = new THREE.Mesh(new THREE.RingGeometry(7.5, 13.5, 32).rotateX(-Math.PI / 2), dark);
    this.dotShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(2.7, 8).rotateX(-Math.PI / 2), dark, DOTS);
    this.dotShadows.frustumCulled = false;
    this.ringShadow.renderOrder = 9;
    this.dotShadows.renderOrder = 9;
    for (const m of [this.ring, this.cross, this.dots]) m.renderOrder = 10;
    this.group.add(this.ringShadow, this.dotShadows, this.ring, this.cross, this.dots);
    this.group.visible = false;
  }

  update(s: GameState, side: Side, terrain: Terrain, time: number) {
    const v = s.sides[side].vehicle;
    const p = v && aimPoint(s, v);
    this.group.visible = !!p;
    if (!p) return;
    const h = (x: number, y: number) => Math.max(0.5, terrain.heightAt(x, y)) + 1.2;
    const gy = h(p.x, p.y);
    this.ring.position.set(p.x, gy, p.y);
    this.cross.position.set(p.x, gy, p.y);
    // Pulse when something is under the reticle.
    const k = p.locked ? 1.15 + 0.12 * Math.sin(time * 14) : 1;
    this.ring.scale.setScalar(k);
    this.ringShadow.position.set(p.x, gy - 0.1, p.y);
    this.ringShadow.scale.setScalar(k);
    this.cross.rotation.y = p.locked ? time * 3 : 0;
    this.mat.color.copy(p.locked ? LOCK : FREE);
    this.dotMat.color.copy(p.locked ? LOCK : FREE);
    const m = new THREE.Matrix4();
    for (let i = 0; i < DOTS; i++) {
      // Start a little ahead of the vehicle so the line reads as "from the nose".
      const t = 0.12 + (0.88 * (i + 1)) / (DOTS + 1);
      const x = p.fromX + (p.x - p.fromX) * t;
      const y = p.fromY + (p.y - p.fromY) * t;
      m.makeTranslation(x, h(x, y), y);
      this.dots.setMatrixAt(i, m);
      m.elements[13] -= 0.1;
      this.dotShadows.setMatrixAt(i, m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.dotShadows.instanceMatrix.needsUpdate = true;
  }
}

/** One marker per locally controlled side. */
export class ReticleView {
  readonly group = new THREE.Group();
  private markers = new Map<Side, Marker>();
  private terrain: Terrain;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  setSides(sides: Side[]) {
    for (const [side, m] of this.markers)
      if (!sides.includes(side)) {
        this.group.remove(m.group);
        this.markers.delete(side);
      }
    for (const side of sides)
      if (!this.markers.has(side)) {
        const m = new Marker();
        this.markers.set(side, m);
        this.group.add(m.group);
      }
  }

  update(s: GameState, time: number) {
    for (const [side, m] of this.markers) m.update(s, side, this.terrain, time);
  }
}
