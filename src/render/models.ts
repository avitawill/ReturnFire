// Procedural low-poly models. Each returns merged geometries per moving part.
// Shapes follow the prototype; milestone 3 refines them.

import * as THREE from 'three';
import type { Side } from '../sim/entities';
import type { VehicleType } from '../sim/tuning';
import { MATERIALS, ModelBuilder, mesh } from './build';

export interface Palette {
  b: string;
  l: string;
  d: string;
}
export const PALETTES: Record<Side, Palette> = {
  0: { b: '#3f74b8', l: '#6f9bd4', d: '#1f3d66' },
  1: { b: '#b8452f', l: '#d9735c', d: '#6b2416' },
};
export const WRECK: Palette = { b: '#2b2a27', l: '#35332f', d: '#1a1a19' };
const DK = '#1d2224';
const TYRE = '#2a2f31';

export type VehicleModelKind = VehicleType | 'drone' | 'ptank';

export interface VehicleModel {
  root: THREE.Group;
  /** Rotates with the weapon heading. */
  turret: THREE.Object3D | null;
  rotor: THREE.Object3D | null;
}

const cache = new Map<string, { hull: THREE.BufferGeometry; turret?: THREE.BufferGeometry; rotor?: THREE.BufferGeometry; glass?: THREE.BufferGeometry; disc?: boolean }>();

function geometries(kind: VehicleModelKind, p: Palette) {
  const key = kind + p.b;
  const hit = cache.get(key);
  if (hit) return hit;
  const hull = new ModelBuilder();
  let turret: ModelBuilder | null = null;
  let rotor: ModelBuilder | null = null;
  let glass: ModelBuilder | null = null;
  if (kind === 'tank' || kind === 'ptank') {
    for (const z of [-9, 9]) {
      hull.box(28, 6, 5, DK, 0, 3.5, z);
      for (const x of [-11, -5.5, 0, 5.5, 11]) hull.cyl(3, 3, 5.6, 10, TYRE, x, 3, z, 'z');
    }
    hull.box(26, 5, 13, p.b, 0, 7, 0);
    hull.box(18, 3, 12, p.l, -1, 10.5, 0);
    hull.box(8, 3, 12, p.b, 11, 8.6, 0, { rz: -0.5 });
    turret = new ModelBuilder();
    turret.cyl(7, 8, 5, 16, p.b, 0, 2.5, 0);
    turret.cyl(3, 3, 1.5, 10, p.d, -2, 5.5, 2);
    turret.cyl(1.5, 1.5, 18, 8, p.d, 15, 3, 0, 'x');
    turret.cyl(2.1, 2.1, 3, 8, DK, 23, 3, 0, 'x');
    turret.box(0.5, 12, 0.5, DK, -5, 9, -4);
  } else if (kind === 'launcher') {
    for (const z of [-9, 9]) for (const x of [-10, 0, 10]) hull.cyl(4, 4, 4, 12, DK, x, 4, z, 'z');
    hull.box(30, 6, 15, p.b, 0, 8.5, 0);
    hull.box(8, 7, 13, p.l, 10, 15, 0);
    hull.box(0.6, 4, 11, '#16262b', 14.2, 15.5, 0);
    // Rocket pod, fixed facing forward and tilted up.
    const pod = new ModelBuilder();
    pod.box(17, 8, 13, p.d, 0, 4, 0);
    for (const y of [2, 6]) for (const z of [-4, 0, 4]) pod.cyl(1.7, 1.7, 0.8, 8, '#e9e2cf', 8.7, y, z, 'x');
    const pg = pod.build();
    pg.rotateZ(0.3);
    pg.translate(-5, 13, 0);
    hull.add(pg, null, 0, 0, 0);
  } else if (kind === 'jeep') {
    for (const z of [-7, 7]) for (const x of [-7, 7]) hull.cyl(3.5, 3.5, 3, 12, DK, x, 3.5, z, 'z');
    hull.box(21, 4, 11, p.b, 0, 6, 0);
    hull.box(7, 2, 10, p.l, 6.5, 9, 0);
    hull.box(4, 4, 9, '#2b2f2a', -2, 9.5, 0);
    hull.box(7, 3, 11, p.d, -7, 9.5, 0);
    hull.cyl(3, 3, 2, 10, DK, -11.5, 8, 0, 'x');
    hull.box(0.8, 6, 10, DK, -4, 12, 0);
    glass = new ModelBuilder();
    glass.box(0.6, 5, 10, '#bfe0ea', 2.5, 11.5, 0);
  } else {
    // Helicopter and drone.
    hull.sphere(8, p.b, 0, 0, 0, { sx: 1.5 }, 18, 12);
    hull.cyl(1, 2.5, 18, 8, p.d, -18, 1.5, 0, 'x');
    hull.box(4, 9, 1, p.d, -26, 5, 0);
    hull.cyl(4, 4, 0.4, 10, DK, -26, 5, 1.2, 'z');
    for (const z of [-5, 5]) {
      hull.box(18, 0.8, 0.8, DK, 0, -8.5, z);
      hull.box(0.8, 4, 0.8, DK, -5, -6.5, z);
      hull.box(0.8, 4, 0.8, DK, 5, -6.5, z);
    }
    glass = new ModelBuilder();
    glass.sphere(5.5, '#bfe6f5', 7, 1.5, 0, {}, 14, 10);
    rotor = new ModelBuilder();
    rotor.cyl(1, 1, 3, 6, DK, 0, -1, 0);
    rotor.box(44, 0.5, 2.4, DK, 0, 0, 0);
    rotor.box(2.4, 0.5, 44, DK, 0, 0, 0);
  }
  const out = {
    hull: hull.build(),
    turret: turret?.build(),
    rotor: rotor?.build(),
    glass: glass?.build(),
    disc: kind === 'heli' || kind === 'drone',
  };
  cache.set(key, out);
  return out;
}

const discMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
const discGeo = new THREE.CircleGeometry(22, 24).rotateX(-Math.PI / 2);

export function vehicleModel(kind: VehicleModelKind, p: Palette): VehicleModel {
  const g = geometries(kind, p);
  const root = new THREE.Group();
  root.add(mesh(g.hull, MATERIALS.satin));
  if (g.glass) root.add(mesh(g.glass, MATERIALS.glass));
  let turret: THREE.Object3D | null = null;
  let rotor: THREE.Object3D | null = null;
  if (g.turret) {
    turret = mesh(g.turret, MATERIALS.satin);
    turret.position.y = 12;
    root.add(turret);
  }
  if (g.rotor) {
    const r = new THREE.Group();
    r.position.y = 9.5;
    r.add(mesh(g.rotor, MATERIALS.matte));
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.renderOrder = 2;
    r.add(disc);
    root.add(r);
    rotor = r;
  }
  if (kind === 'drone') root.scale.setScalar(0.8);
  root.rotation.order = 'YXZ';
  return { root, turret, rotor };
}

// ---------------------------------------------------------------- structures

export interface StructureGeo {
  base: THREE.BufferGeometry;
  head?: THREE.BufferGeometry;
  headY?: number;
}

const sCache = new Map<string, StructureGeo>();

export function structureGeometry(kind: 'tower' | 'bunker' | 'turret' | 'guard' | 'aa' | 'wall', side: Side): StructureGeo {
  const key = kind + side;
  const hit = sCache.get(key);
  if (hit) return hit;
  const p = PALETTES[side];
  const b = new ModelBuilder();
  let head: ModelBuilder | null = null;
  let headY = 10;
  if (kind === 'tower') {
    b.box(60, 34, 60, '#5a5d57', 0, 17, 0);
    b.box(62, 5, 62, p.b, 0, 22, 0);
    b.box(50, 6, 50, '#74776f', 0, 37, 0);
    for (const cx of [-25, 25]) for (const cz of [-25, 25]) b.box(12, 9, 12, '#6a6d66', cx, 38.5, cz);
    b.box(14, 18, 2, '#2c2e2b', 0, 9, 30.4);
    for (const wx of [-18, 18]) {
      b.box(7, 7, 1.2, '#22262a', wx, 12, 30.4);
      b.box(1.2, 7, 7, '#22262a', 30.4, 12, wx);
      b.box(1.2, 7, 7, '#22262a', -30.4, 12, wx);
    }
    // Flagpole with the owner's pennant.
    b.cyl(0.7, 0.7, 22, 6, '#ece4cf', 0, 51, 0);
    b.box(12, 7, 0.6, p.b, 6.5, 58, 0);
  } else if (kind === 'bunker') {
    b.box(60, 22, 60, '#6f7a80', 0, 11, 0);
    b.box(62, 4, 62, p.b, 0, 17, 0);
    b.box(2, 15, 24, '#20292c', side === 0 ? 30.4 : -30.4, 7.5, 0);
    b.cyl(30, 30, 58, 20, '#8a959b', 0, 22, 0, 'z', { sz: 0.35 });
    b.box(0.8, 22, 0.8, DK, -20, 38, -20);
    b.cyl(6, 3, 3, 12, '#c9d2d6', 16, 33, -14);
  } else if (kind === 'wall') {
    b.box(32, 20, 32, '#878a83', 0, 10, 0);
    b.box(22, 4, 22, '#a3a69e', 0, 22, 0);
  } else {
    b.cyl(13, 15, 10, 16, '#4f524d', 0, 5, 0);
    b.cyl(15.5, 15.5, 2, 16, '#3d403c', 0, 1, 0);
    head = new ModelBuilder();
    if (kind === 'aa') {
      head.box(10, 8, 10, p.b, 0, 4, 0);
      const pod = new ModelBuilder();
      pod.box(16, 3, 16, p.d, 0, 0, 0);
      for (const z of [-5, 5]) {
        pod.cyl(1.6, 1.6, 18, 8, '#e9e2cf', 2, 3, z, 'x');
        pod.cone(1.6, 4, 8, '#e0563c', 13, 3, z, { rz: -Math.PI / 2 });
      }
      const pg = pod.build();
      pg.rotateZ(0.45);
      pg.translate(0, 8, 0);
      head.add(pg, null, 0, 0, 0);
    } else {
      head.sphere(9, p.b, 0, 1, 0, {}, 14, 8, true);
      head.cyl(9, 9, 2, 14, p.d, 0, 1, 0);
      head.cyl(1.8, 1.8, 20, 8, p.d, 15, 5, 0, 'x');
      head.cyl(2.5, 2.5, 3, 8, DK, 25, 5, 0, 'x');
      if (kind === 'guard') head.box(4, 3, 18, '#c9d2d6', -4, 6, 0);
    }
  }
  const out: StructureGeo = { base: b.build(), head: head?.build(), headY };
  sCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- props

export function treeGeometries() {
  return {
    trunk: new THREE.CylinderGeometry(2, 3, 10, 6),
    crown1: new THREE.ConeGeometry(12, 22, 9),
    crown2: new THREE.ConeGeometry(10, 20, 9),
  };
}

export function flagModel(colour: string): { root: THREE.Group; pennant: THREE.Object3D } {
  const root = new THREE.Group();
  const pole = new ModelBuilder().cyl(0.9, 0.9, 28, 6, '#ece4cf', 0, 14, 0).build();
  root.add(mesh(pole, MATERIALS.matte));
  const pen = mesh(new ModelBuilder().box(15, 9, 0.8, colour, 7.5, 0, 0).build(), MATERIALS.matte);
  pen.position.set(0.5, 23, 0);
  root.add(pen);
  return { root, pennant: pen };
}
