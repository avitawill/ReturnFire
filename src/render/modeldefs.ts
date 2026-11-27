// Procedural low-poly model definitions. `scripts/build-models.ts` runs these
// once and writes public/models/models.glb; the game loads that file.
// Units: world pixels (a tile is 32). Forward is +x, up is +y.

import * as THREE from 'three';
import { ModelBuilder } from './build';

export interface Palette {
  b: string;
  l: string;
  d: string;
}
export const PALETTES: Record<'0' | '1' | 'wreck', Palette> = {
  '0': { b: '#3f74b8', l: '#7aa5dc', d: '#1f3d66' },
  '1': { b: '#b8452f', l: '#de7f66', d: '#6b2416' },
  wreck: { b: '#2b2a27', l: '#383631', d: '#1a1a19' },
};
export type Variant = keyof typeof PALETTES;

export type MaterialKind = 'satin' | 'matte' | 'glass';

export interface PartDef {
  /** Node name the runtime looks for: hull, turret, rotor, tailRotor, head, base, glass. */
  name: string;
  geo: THREE.BufferGeometry;
  material: MaterialKind;
  /** Pivot position relative to the model root. */
  at?: [number, number, number];
}

export interface ModelDef {
  id: string;
  parts: PartDef[];
}

const TRACK = '#2a2e30';
const RUBBER = '#26292b';
const METAL = '#4a5053';
const STONE = '#6b6e66';
const STONE_L = '#7c7f76';
const STONE_D = '#55584f';
const CONCRETE = '#8a8f8a';
const OPENING = '#1b1f22';
const BONE = '#e9e2cf';

const isWreck = (p: Palette) => p === PALETTES.wreck;

// ---------------------------------------------------------------- vehicles

function tank(p: Palette): PartDef[] {
  const hull = new ModelBuilder();
  const tr = isWreck(p) ? p.d : TRACK;
  for (const z of [-8.5, 8.5]) {
    // Track run with sloped ends.
    hull.prism([[-13.5, 1], [13.5, 1], [16, 4], [14.5, 7.4], [-14.5, 7.4], [-16, 4]], 5, tr, 0, 0, z);
    for (const x of [-10, -5, 0, 5, 10]) hull.cyl(2.5, 2.5, 0.8, 10, METAL, x, 3.6, z + Math.sign(z) * 2.7, 'z');
    hull.cyl(2, 2, 0.8, 8, METAL, 14.3, 4.6, z + Math.sign(z) * 2.7, 'z');
    hull.cyl(2, 2, 0.8, 8, METAL, -14.3, 4.6, z + Math.sign(z) * 2.7, 'z');
    hull.box(31, 0.8, 5.8, p.d, 0, 7.8, z);
  }
  // Hull with a sloped glacis and a raised engine deck.
  hull.prism([[-14, 4], [11, 4], [15.5, 7.2], [12, 10.5], [-13, 10.5], [-14.5, 8]], 12.4, p.b, 0, 0, 0);
  hull.box(8, 0.6, 9, p.d, -9, 10.8, 0);
  for (const z of [-2.5, 0, 2.5]) hull.box(7, 0.4, 1, OPENING, -9, 11.2, z);
  hull.box(2, 1.2, 2, '#f2e6a8', 14.2, 8.6, 4.6);
  hull.box(2, 1.2, 2, '#f2e6a8', 14.2, 8.6, -4.6);
  const tur = new ModelBuilder();
  // Faceted turret, wider at the front.
  tur.prism([[-8, -6], [4, -6.8], [8.5, -3.2], [8.5, 3.2], [4, 6.8], [-8, 6]], 5.4, p.b, 0, 2.7, 0, { rx: -Math.PI / 2 });
  tur.prism([[-7, -5], [3.5, -5.6], [7, -2.6], [7, 2.6], [3.5, 5.6], [-7, 5]], 1.2, p.l, 0, 6, 0, { rx: -Math.PI / 2 });
  tur.box(3.5, 4, 6, p.d, 9, 2.6, 0);
  tur.cyl(1.35, 1.35, 17, 8, p.d, 18.5, 2.8, 0, 'x');
  tur.cyl(2, 2, 3.2, 8, OPENING, 26.5, 2.8, 0, 'x');
  tur.cyl(2.6, 2.6, 1.2, 10, p.d, -2, 6.8, 2.6);
  tur.box(5, 2.5, 7, p.d, -9.5, 3, 0);
  if (!isWreck(p)) tur.box(0.4, 12, 0.4, RUBBER, -6, 11, -4.2);
  return [
    { name: 'hull', geo: hull.build(), material: 'satin' },
    { name: 'turret', geo: tur.build(), material: 'satin', at: [-1, 10.5, 0] },
  ];
}

function launcher(p: Palette): PartDef[] {
  const h = new ModelBuilder();
  for (const z of [-8.5, 8.5])
    for (const x of [-10, 0, 11]) {
      h.cyl(3.8, 3.8, 3.4, 12, RUBBER, x, 3.8, z, 'z');
      h.cyl(1.8, 1.8, 3.6, 8, METAL, x, 3.8, z, 'z');
    }
  h.box(32, 2.5, 13, p.d, 0, 6.5, 0);
  // Cab with a sloped windscreen.
  h.prism([[7, 7.5], [16.5, 7.5], [16.5, 12], [14, 17], [7, 17]], 13.4, p.b, 0, 0, 0);
  h.prism([[14.3, 12.2], [16.6, 12.2], [14.1, 16.8]], 11, OPENING, 0, 0, 0);
  h.box(4, 3, 0.3, OPENING, 11, 14.5, 6.75);
  h.box(4, 3, 0.3, OPENING, 11, 14.5, -6.75);
  h.box(1.2, 1.5, 14, '#f2e6a8', 16.4, 9.2, 0);
  // Flatbed and turntable.
  h.box(22, 1.2, 14, p.b, -5, 8.4, 0);
  h.cyl(5.5, 6, 2, 12, METAL, -6, 9.8, 0);
  // Rocket pod tilted up, facing forward.
  const pod = new ModelBuilder();
  pod.box(17, 8, 13, p.l, 0, 4, 0);
  pod.box(17.2, 1, 13.2, p.d, 0, 0.5, 0);
  pod.box(17.2, 1, 13.2, p.d, 0, 7.5, 0);
  for (const y of [2.2, 5.8]) for (const z of [-4, 0, 4]) {
    pod.cyl(1.7, 1.7, 0.6, 8, OPENING, 8.6, y, z, 'x');
    if (!isWreck(p)) pod.cone(1.2, 2.4, 8, BONE, 9.6, y, z, { rz: -Math.PI / 2 });
  }
  const pg = pod.build();
  pg.rotateZ(0.32);
  pg.translate(-6, 11, 0);
  h.add(pg, null, 0, 0, 0);
  return [{ name: 'hull', geo: h.build(), material: 'satin' }];
}

function jeep(p: Palette): PartDef[] {
  const h = new ModelBuilder();
  for (const z of [-7.2, 7.2])
    for (const x of [-7, 7.5]) {
      h.cyl(3.5, 3.5, 2.8, 12, RUBBER, x, 3.5, z, 'z');
      h.cyl(1.6, 1.6, 3, 8, METAL, x, 3.5, z, 'z');
    }
  // Boat-like amphibious tub with a sloped nose.
  h.prism([[-11, 3], [8, 3], [12.5, 5.5], [11.5, 8.5], [-11, 8.5], [-11.5, 5]], 11.6, p.b, 0, 0, 0);
  h.box(8, 0.8, 11.8, p.l, 7, 8.6, 0);
  for (const z of [-7.2, 7.2]) h.box(5.5, 0.8, 2.4, p.d, -7, 7.6, z), h.box(6, 0.8, 2.4, p.d, 7.5, 7.6, z);
  // Seats and windscreen frame.
  h.box(3, 3.5, 3.5, '#3a3d36', -1.5, 10, 2.6);
  h.box(3, 3.5, 3.5, '#3a3d36', -1.5, 10, -2.6);
  h.box(4, 2.5, 9, '#3a3d36', -7, 9.8, 0);
  h.box(0.6, 0.6, 11, p.d, 3.2, 14.2, 0);
  for (const z of [-5.3, 5.3]) h.box(0.6, 5.5, 0.6, p.d, 3.2, 11.5, z);
  // Roll bar.
  for (const z of [-5, 5]) h.cyl(0.45, 0.45, 8, 6, METAL, -4.5, 12.5, z);
  h.cyl(0.45, 0.45, 10.4, 6, METAL, -4.5, 16.4, 0, 'z');
  // Spare wheel and mounted gun.
  h.cyl(3, 3, 1.8, 10, RUBBER, -12, 7, 0, 'x');
  h.cyl(0.6, 0.6, 7, 6, OPENING, -3, 15.8, 0, 'x');
  h.cyl(0.4, 0.4, 3.5, 6, OPENING, -4.5, 14.3, 0);
  const glass = new ModelBuilder();
  glass.box(0.3, 4.6, 10, '#bfe0ea', 3.2, 11.6, 0);
  return [
    { name: 'hull', geo: h.build(), material: 'satin' },
    { name: 'glass', geo: glass.build(), material: 'glass' },
  ];
}

function heli(p: Palette): PartDef[] {
  const h = new ModelBuilder();
  // Fuselage: stretched sphere, rounded nose, tapering tail boom.
  h.sphere(8, p.b, -1, 0, 0, { sx: 1.45, sy: 0.95, sz: 0.85 }, 14, 10);
  h.box(9, 2, 11, p.d, -3, -6.2, 0);
  h.cyl(1.2, 2.8, 20, 8, p.b, -19, 1.8, 0, 'x');
  h.box(10, 1.2, 1.2, p.l, -16, 3.3, 0);
  // Fin and stabiliser.
  h.prism([[-30.5, 1.5], [-26.5, 1.5], [-28, 10], [-31, 10]], 0.9, p.d, 0, 0, 0);
  h.box(4, 0.6, 10, p.d, -26.5, 2, 0);
  // Engine housing and exhausts.
  h.box(9, 3.5, 6, p.l, -4, 7.2, 0);
  h.cyl(1, 1, 3, 6, OPENING, -9, 7.5, 2, 'x');
  h.cyl(1, 1, 3, 6, OPENING, -9, 7.5, -2, 'x');
  // Skids.
  for (const z of [-5.5, 5.5]) {
    h.cyl(0.55, 0.55, 19, 6, RUBBER, 0, -9.2, z, 'x');
    h.cyl(0.4, 0.4, 4.5, 6, RUBBER, -5, -7.3, z);
    h.cyl(0.4, 0.4, 4.5, 6, RUBBER, 4.5, -7.3, z);
  }
  // Stub wings with gun pods.
  h.box(4, 0.8, 19, p.d, -2, -1.5, 0);
  h.cyl(1, 1, 6, 6, OPENING, 0, -2.6, 9.2, 'x');
  h.cyl(1, 1, 6, 6, OPENING, 0, -2.6, -9.2, 'x');
  const glass = new ModelBuilder();
  glass.sphere(5.6, '#bfe6f5', 7, 1.2, 0, { sx: 1.15, sy: 0.9, sz: 0.95 }, 12, 9);
  const rotor = new ModelBuilder();
  rotor.cyl(1.3, 1.3, 3, 8, METAL, 0, -1.2, 0);
  for (let k = 0; k < 4; k++) rotor.box(22, 0.4, 2.2, RUBBER, Math.cos((k * Math.PI) / 2) * 11, 0, Math.sin((k * Math.PI) / 2) * 11, { ry: (-k * Math.PI) / 2 });
  const tail = new ModelBuilder();
  tail.box(7, 1.4, 0.3, RUBBER, 0, 0, 0);
  tail.box(1.4, 7, 0.3, RUBBER, 0, 0, 0);
  const parts: PartDef[] = [
    { name: 'hull', geo: h.build(), material: 'satin' },
    { name: 'glass', geo: glass.build(), material: 'glass' },
  ];
  if (!isWreck(p)) {
    parts.push({ name: 'rotor', geo: rotor.build(), material: 'matte', at: [-1, 9.6, 0] });
    parts.push({ name: 'tailRotor', geo: tail.build(), material: 'matte', at: [-29, 6.5, 1.2] });
  }
  return parts;
}

function drone(p: Palette): PartDef[] {
  const h = new ModelBuilder();
  h.sphere(5, p.b, 0, 0, 0, { sx: 1.3, sy: 0.6, sz: 1 }, 10, 6);
  h.box(4, 2, 4, OPENING, 4, -1.5, 0);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    h.box(13, 1, 1.4, p.d, Math.cos(a) * 6.5, 0.5, Math.sin(a) * 6.5, { ry: -a });
    h.cyl(2, 2, 2, 8, p.d, Math.cos(a) * 12, 1, Math.sin(a) * 12);
  }
  const rotor = new ModelBuilder();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    rotor.box(10, 0.3, 1.2, RUBBER, Math.cos(a) * 12, 0, Math.sin(a) * 12, { ry: -a + 0.8 });
  }
  return [
    { name: 'hull', geo: h.build(), material: 'satin' },
    { name: 'rotor', geo: rotor.build(), material: 'matte', at: [0, 2.6, 0] },
  ];
}

/** FPV strike drone: an X-frame quadcopter carrying a warhead under its nose. */
function fpv(p: Palette): PartDef[] {
  const h = new ModelBuilder();
  h.box(9, 3, 6, p.b, 0, 0, 0);
  h.box(5, 1.5, 4.6, p.l, -1, 2, 0);
  // Camera pod and antenna.
  h.box(2.4, 2.2, 2.4, OPENING, 5, 1, 0);
  h.cyl(0.25, 0.25, 6, 4, RUBBER, -4, 4, 0, 'y', { rz: 0.5 });
  // Warhead slung underneath, pointing forward.
  h.cyl(1.6, 1.6, 9, 10, '#5d6b45', 2, -2.6, 0, 'x');
  h.cone(1.6, 3, 10, '#c9442f', 8, -2.6, 0, { rz: -Math.PI / 2 });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    h.box(9, 0.9, 1.2, p.d, Math.cos(a) * 4.5, 0.6, Math.sin(a) * 4.5, { ry: -a });
    h.cyl(1.4, 1.4, 1.8, 8, METAL, Math.cos(a) * 8.5, 1.2, Math.sin(a) * 8.5);
  }
  const rotor = new ModelBuilder();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    rotor.box(7, 0.25, 0.9, RUBBER, Math.cos(a) * 8.5, 0, Math.sin(a) * 8.5, { ry: -a + 0.7 });
    rotor.box(7, 0.25, 0.9, RUBBER, Math.cos(a) * 8.5, 0, Math.sin(a) * 8.5, { ry: -a - 0.9 });
  }
  return [
    { name: 'hull', geo: h.build(), material: 'satin' },
    { name: 'rotor', geo: rotor.build(), material: 'matte', at: [0, 2.4, 0] },
  ];
}

// ---------------------------------------------------------------- structures

/** Square frustum (pyramid stump) via a 4-sided cylinder turned 45 degrees. */
function frustum(b: ModelBuilder, halfBottom: number, halfTop: number, h: number, colour: string, x: number, y: number, z: number) {
  b.cyl(halfTop * Math.SQRT2, halfBottom * Math.SQRT2, h, 4, colour, x, y, z, 'y', { ry: Math.PI / 4 });
}

function tower(p: Palette): PartDef[] {
  const b = new ModelBuilder();
  frustum(b, 30, 27, 26, STONE, 0, 13, 0);
  b.box(55.5, 4, 55.5, p.b, 0, 24, 0);
  b.box(52, 12, 52, STONE_L, 0, 32, 0);
  // Crenellations.
  for (let i = -2; i <= 2; i++)
    for (const s of [-1, 1]) {
      b.box(6, 5, 3, STONE_D, i * 10.5, 40, s * 24.5);
      b.box(3, 5, 6, STONE_D, s * 24.5, 40, i * 10.5);
    }
  for (const cx of [-26, 26]) for (const cz of [-26, 26]) {
    b.cyl(6, 6.5, 44, 8, STONE_D, cx, 22, cz);
    b.cyl(7, 7, 2, 8, p.d, cx, 44.5, cz);
  }
  // Door and slit windows on all sides.
  b.box(13, 16, 1, OPENING, 0, 8, 28.6);
  b.box(13, 16, 1, OPENING, 0, 8, -28.6);
  for (const w of [-14, 14]) {
    b.box(2.5, 7, 1, OPENING, w, 32, 26.2);
    b.box(2.5, 7, 1, OPENING, w, 32, -26.2);
    b.box(1, 7, 2.5, OPENING, 26.2, 32, w);
    b.box(1, 7, 2.5, OPENING, -26.2, 32, w);
  }
  b.box(26, 4, 26, STONE_D, 0, 40, 0);
  b.cyl(0.7, 0.7, 22, 6, BONE, 0, 53, 0);
  b.box(12, 7, 0.6, p.b, 6.5, 60, 0);
  return [{ name: 'base', geo: b.build(), material: 'matte' }];
}

function bunker(p: Palette, side: '0' | '1'): PartDef[] {
  const b = new ModelBuilder();
  b.box(64, 3, 64, CONCRETE, 0, 1.5, 0);
  // Quonset hangar: half cylinder along x, door facing the pad.
  b.cyl(27, 27, 54, 16, '#97a09c', 0, 3, 0, 'x', { sx: 1, sy: 1, sz: 1 });
  const dir = side === '0' ? 1 : -1;
  b.box(1, 22, 30, OPENING, dir * 27.4, 11, 0);
  b.box(1.4, 3, 34, p.b, dir * 27.6, 23.5, 0);
  for (let i = -2; i <= 2; i++) b.box(54, 0.6, 1, '#7d8682', 0, 3 + 27 * Math.cos((i * Math.PI) / 6.5) - 0.4, 27 * Math.sin((i * Math.PI) / 6.5));
  // Radar mast and dish.
  b.box(1.2, 16, 1.2, METAL, -18 * dir, 34, -18);
  b.cyl(6, 2, 2, 12, '#c9d2d6', -18 * dir, 42, -18, 'y', { rz: 0.5 });
  b.box(20, 1.2, 64.2, p.b, -14 * dir, 3.3, 0);
  return [{ name: 'base', geo: b.build(), material: 'matte' }];
}

function gunBase(b: ModelBuilder) {
  b.cyl(13, 15.5, 9, 8, '#53564f', 0, 4.5, 0);
  b.cyl(15.6, 15.6, 1.6, 8, '#3d403c', 0, 0.8, 0);
  b.cyl(11, 11, 1, 8, '#62655e', 0, 9.5, 0);
}

function turret(p: Palette, guard: boolean): PartDef[] {
  const b = new ModelBuilder();
  gunBase(b);
  if (guard) for (let k = 0; k < 8; k++) b.box(6, 3, 3, '#8f8a6e', Math.cos((k * Math.PI) / 4) * 14, 10.5, Math.sin((k * Math.PI) / 4) * 14, { ry: (-k * Math.PI) / 4 + Math.PI / 2 });
  const h = new ModelBuilder();
  h.sphere(8.5, p.b, 0, 0, 0, {}, 12, 7, true);
  h.cyl(9, 9, 2, 12, p.d, 0, 0, 0);
  h.box(5, 5, 7, p.d, 7, 3, 0);
  if (guard) {
    h.cyl(1.5, 1.5, 18, 8, p.d, 16, 3.5, 2.2, 'x');
    h.cyl(1.5, 1.5, 18, 8, p.d, 16, 3.5, -2.2, 'x');
    h.box(2, 9, 14, p.l, 9, 3, 0);
  } else {
    h.cyl(1.8, 1.8, 18, 8, p.d, 16, 3.5, 0, 'x');
    h.cyl(2.5, 2.5, 3, 8, OPENING, 25, 3.5, 0, 'x');
  }
  return [
    { name: 'base', geo: b.build(), material: 'matte' },
    { name: 'head', geo: h.build(), material: 'satin', at: [0, 10, 0] },
  ];
}

function aa(p: Palette): PartDef[] {
  const b = new ModelBuilder();
  gunBase(b);
  const h = new ModelBuilder();
  h.box(10, 7, 10, p.b, 0, 3.5, 0);
  const pod = new ModelBuilder();
  pod.box(14, 2.4, 16, p.d, 0, 0, 0);
  for (const z of [-5, 5])
    for (const y of [2.6, 5.4]) {
      pod.cyl(1.4, 1.4, 16, 8, BONE, 1, y, z, 'x');
      pod.cone(1.4, 4, 8, '#e0563c', 11, y, z, { rz: -Math.PI / 2 });
    }
  const pg = pod.build();
  pg.rotateZ(0.5);
  pg.translate(0, 8, 0);
  h.add(pg, null, 0, 0, 0);
  return [
    { name: 'base', geo: b.build(), material: 'matte' },
    { name: 'head', geo: h.build(), material: 'satin', at: [0, 10, 0] },
  ];
}

function wall(): PartDef[] {
  const b = new ModelBuilder();
  // Chamfered concrete block with a sandbag top.
  b.prism([[-16, 0], [16, 0], [14, 15], [-14, 15]], 32, '#878a83', 0, 0, 0);
  b.prism([[-16, 0], [16, 0], [14, 15], [-14, 15]], 28, '#7c7f78', 0, 0, 0, { ry: Math.PI / 2 });
  for (const x of [-8, 0, 8]) for (const z of [-7, 7]) b.sphere(4.5, '#a49a74', x, 16, z, { sx: 1.1, sy: 0.55, sz: 1 }, 8, 5);
  return [{ name: 'base', geo: b.build(), material: 'matte' }];
}

// ---------------------------------------------------------------- props

function pine(): PartDef[] {
  const b = new ModelBuilder();
  b.cyl(1.8, 2.6, 10, 6, '#5b4630', 0, 5, 0);
  b.cone(12, 16, 8, '#2f5a30', 0, 15, 0);
  b.cone(9.5, 14, 8, '#3b6a35', 0, 23, 0, { ry: 0.4 });
  b.cone(6.5, 11, 8, '#4a7d3f', 0, 30, 0, { ry: 0.8 });
  return [{ name: 'base', geo: b.build(), material: 'matte' }];
}

function broadleaf(): PartDef[] {
  const b = new ModelBuilder();
  b.cyl(2, 3, 12, 6, '#64492f', 0, 6, 0);
  b.add(new THREE.IcosahedronGeometry(11, 0), '#4a7a37', 0, 19, 0, { sy: 0.85 });
  b.add(new THREE.IcosahedronGeometry(7, 0), '#5b8a3f', 4, 25, 2, { ry: 0.6 });
  b.add(new THREE.IcosahedronGeometry(6, 0), '#3f6d31', -5, 22, -3, { ry: 1.1 });
  return [{ name: 'base', geo: b.build(), material: 'matte' }];
}

export function allModels(): ModelDef[] {
  const out: ModelDef[] = [];
  const variants: Variant[] = ['0', '1', 'wreck'];
  for (const v of variants) {
    const p = PALETTES[v];
    out.push({ id: `tank.${v}`, parts: tank(p) });
    out.push({ id: `launcher.${v}`, parts: launcher(p) });
    out.push({ id: `jeep.${v}`, parts: jeep(p) });
    out.push({ id: `heli.${v}`, parts: heli(p) });
  }
  for (const v of ['0', '1'] as const) {
    const p = PALETTES[v];
    out.push({ id: `drone.${v}`, parts: drone(p) });
    out.push({ id: `fpv.${v}`, parts: fpv(p) });
    out.push({ id: `tower.${v}`, parts: tower(p) });
    out.push({ id: `bunker.${v}`, parts: bunker(p, v) });
    out.push({ id: `turret.${v}`, parts: turret(p, false) });
    out.push({ id: `guard.${v}`, parts: turret(p, true) });
    out.push({ id: `aa.${v}`, parts: aa(p) });
    out.push({ id: `wall.${v}`, parts: wall() });
  }
  out.push({ id: 'tree.pine', parts: pine() });
  out.push({ id: 'tree.broadleaf', parts: broadleaf() });
  return out;
}
