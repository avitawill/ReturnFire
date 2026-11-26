// Static scenery built once from the initial state: terrain, sea, trees,
// bridges, structures. Changes arrive as sim events.

import * as THREE from 'three';
import { Tile, type GameState, type Side, type Structure } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { TILE } from '../sim/tuning';
import { MATERIALS, ModelBuilder, mesh } from './build';
import { PALETTES, flagModel, structureGeometry, treeGeometries } from './models';
import { CHUNK, G, Terrain } from './terrain';


const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const hash2 = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function compose(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz));
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadows = true) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  if (!list.length) im.setMatrixAt(0, ZERO);
  for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
  im.castShadow = shadows;
  im.receiveShadow = shadows;
  im.computeBoundingSphere();
  return im;
}

interface StructSlot {
  base: THREE.InstancedMesh;
  head?: THREE.InstancedMesh;
  index: number;
  headY: number;
}

interface Collapse {
  obj: THREE.Object3D;
  t: number;
}

export class WorldView {
  readonly group = new THREE.Group();
  readonly terrain: Terrain;
  readonly sea: THREE.Mesh;
  private seaNormal: THREE.Texture;
  /** Tree tiles per chunk, and the merged mesh drawing them. */
  private treeChunks = new Map<number, { tiles: Set<number>; mesh: THREE.Mesh | null }>();
  private slots = new Map<number, StructSlot>();
  private collapsing: Collapse[] = [];
  private state: GameState;
  /** Fallen-flag markers on destroyed towers etc. are owned by ActorView; this is static. */
  readonly homeFlags: THREE.Object3D[] = [];

  constructor(state: GameState) {
    this.state = state;
    const w = state.world;
    const flat = new Uint8Array(w.W * w.H);
    for (let i = 0; i < flat.length; i++) flat[i] = w.block[i] ? 1 : 0;
    this.terrain = new Terrain(w, flat);
    this.group.add(this.terrain.group);

    // Sea: translucent animated plane over the sloping seabed, plus a far floor.
    const span = Math.max(w.W, w.H) * TILE * 6;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ color: '#0d3a43' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((w.W * TILE) / 2, -16, (w.H * TILE) / 2);
    this.group.add(floor);
    this.seaNormal = makeWaveNormalMap();
    this.seaNormal.repeat.set(span / 150, span / 150);
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshPhongMaterial({
        color: '#1f7483', transparent: true, opacity: 0.74, shininess: 50, specular: new THREE.Color('#5f97a2'),
        normalMap: this.seaNormal, normalScale: new THREE.Vector2(0.3, 0.3), depthWrite: false,
      }),
    );
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set((w.W * TILE) / 2, 0, (w.H * TILE) / 2);
    this.sea.renderOrder = 1;
    this.sea.receiveShadow = true;
    this.group.add(this.sea);

    this.buildTreesAndBridges();
    this.buildStructures();
    this.buildPads();
  }

  private buildTreesAndBridges() {
    const { W, H, tiles } = this.state.world;
    const deck: THREE.Matrix4[] = [];
    const rail: THREE.Matrix4[] = [];
    const pile: THREE.Matrix4[] = [];
    const water = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || tiles[y * W + x] === Tile.Water;
    for (let i = 0; i < W * H; i++) {
      const tx = i % W;
      const ty = Math.floor(i / W);
      const x = (tx + 0.5) * TILE;
      const z = (ty + 0.5) * TILE;
      if (tiles[i] === Tile.Tree) {
        const ck = this.chunkOf(tx, ty);
        if (!this.treeChunks.has(ck)) this.treeChunks.set(ck, { tiles: new Set(), mesh: null });
        this.treeChunks.get(ck)!.tiles.add(i);
      }
      if (tiles[i] === Tile.Bridge) {
        deck.push(compose(x, G - 1.5, z));
        pile.push(compose(x, G - 11, z));
        if (water(tx, ty - 1)) rail.push(compose(x, G + 3, z - 15));
        if (water(tx, ty + 1)) rail.push(compose(x, G + 3, z + 15));
        if (water(tx - 1, ty)) rail.push(compose(x - 15, G + 3, z, 1, 1, 1, Math.PI / 2));
        if (water(tx + 1, ty)) rail.push(compose(x + 15, G + 3, z, 1, 1, 1, Math.PI / 2));
      }
    }
    for (const ck of this.treeChunks.keys()) this.rebuildTrees(ck);
    const white = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const deckM = instanced(new THREE.BoxGeometry(TILE, 3, TILE), white(), deck);
    for (let k = 0; k < deck.length; k++) deckM.setColorAt(k, _c.set(k % 2 ? '#8f6e47' : '#80613d'));
    this.group.add(deckM);
    this.group.add(instanced(new THREE.BoxGeometry(TILE, 2, 2), new THREE.MeshLambertMaterial({ color: '#5d452b' }), rail));
    this.group.add(instanced(new THREE.CylinderGeometry(3, 3, 18, 8), new THREE.MeshLambertMaterial({ color: '#5d452b' }), pile, false));
  }

  private chunkOf(tx: number, ty: number) {
    return Math.floor(ty / CHUNK) * 1000 + Math.floor(tx / CHUNK);
  }

  /** (Re)build the merged tree mesh of one chunk. */
  private rebuildTrees(ck: number) {
    const ch = this.treeChunks.get(ck);
    if (!ch) return;
    if (ch.mesh) {
      this.group.remove(ch.mesh);
      ch.mesh.geometry.dispose();
      ch.mesh = null;
    }
    if (!ch.tiles.size) return;
    const W = this.state.world.W;
    const b = new ModelBuilder();
    const tg = treeGeometries();
    for (const i of ch.tiles) {
      const tx = i % W;
      const ty = Math.floor(i / W);
      const n = hash2(tx, ty);
      const sc = 0.75 + n * 0.6;
      const x = (tx + 0.5) * TILE + (n - 0.5) * 9;
      const z = (ty + 0.5) * TILE + (hash2(ty, tx) - 0.5) * 9;
      const gy = this.terrain.heightAt(x, z) - 0.5;
      // Pines dominate; roughly one tree in four is broadleaf.
      const g = tg[hash2(tx * 3.1, ty * 1.7) < 0.27 ? 1 : 0];
      b.add(g.clone(), null, x, gy, z, { sx: sc, sy: sc * (0.9 + n * 0.25), sz: sc, ry: n * 6 });
    }
    ch.mesh = mesh(b.build(), MATERIALS.matte);
    this.group.add(ch.mesh);
  }

  private buildStructures() {
    const groups = new Map<string, Structure[]>();
    for (const st of this.state.structs) {
      const k = st.kind + st.side;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(st);
    }
    for (const list of groups.values()) {
      const { kind, side } = list[0];
      const geo = structureGeometry(kind, side);
      const mats = list.map((st) => compose(st.x, G, st.y));
      const mat = kind === 'wall' ? new THREE.MeshLambertMaterial({ vertexColors: true }) : MATERIALS.matte;
      const base = instanced(geo.base, mat, mats);
      this.group.add(base);
      let head: THREE.InstancedMesh | undefined;
      if (geo.head) {
        head = instanced(geo.head, MATERIALS.satin, list.map((st) => compose(st.x, G + (geo.headY ?? 10), st.y, 1, 1, 1, -st.a)));
        this.group.add(head);
      }
      list.forEach((st, index) => {
        base.setColorAt(index, _c.set(kind === 'wall' ? (index % 2 ? '#e6e6e6' : '#ffffff') : '#ffffff'));
        if (!st.alive) {
          // Rebuilt mid-match (e.g. after a quality change): already destroyed.
          base.setMatrixAt(index, ZERO);
          head?.setMatrixAt(index, ZERO);
          this.addRubble(st);
          return;
        }
        this.slots.set(st.id, { base, head, index, headY: geo.headY ?? 10 });
      });
      if (base.instanceColor) base.instanceColor.needsUpdate = true;
    }
  }

  private buildPads() {
    for (const side of [0, 1] as Side[]) {
      const sd = this.state.sides[side];
      const p = PALETTES[side];
      const b = new ModelBuilder();
      for (const dz of [-28, 28]) b.box(58, 1.2, 2, p.l, 0, 0, dz);
      for (const dx of [-28, 28]) b.box(2, 1.2, 58, p.l, dx, 0, 0);
      b.box(30, 0.6, 4, p.l, 0, 0, 0);
      const m = mesh(b.build(), MATERIALS.matte, false);
      m.receiveShadow = true;
      m.position.set(sd.padX, G + 0.6, sd.padY);
      this.group.add(m);
      const f = flagModel(p.l);
      const dir = side === 0 ? -1 : 1;
      f.root.position.set(sd.padX + 40 * dir, G, sd.padY + 50 * dir);
      this.group.add(f.root);
      this.homeFlags.push(f.root);
    }
  }

  /** Per-frame animation of turret heads, sea, collapses. */
  update(dt: number, time: number) {
    for (const st of this.state.structs) {
      if (!st.alive) continue;
      const slot = this.slots.get(st.id);
      if (!slot?.head) continue;
      _q.setFromAxisAngle(UP, -st.a);
      _m.compose(_v.set(st.x, G + slot.headY, st.y), _q, _s.set(1, 1, 1));
      slot.head.setMatrixAt(slot.index, _m);
      slot.head.instanceMatrix.needsUpdate = true;
    }
    this.seaNormal.offset.x = (time * 0.012) % 1;
    this.seaNormal.offset.y = (time * 0.007) % 1;
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const c = this.collapsing[i];
      c.t += dt;
      c.obj.position.y -= 42 * dt;
      c.obj.rotation.z += 0.22 * dt;
      c.obj.rotation.x += 0.1 * dt;
      if (c.t > 1.25) {
        this.group.remove(c.obj);
        this.collapsing.splice(i, 1);
      }
    }
  }

  onEvent(e: SimEvent) {
    if (e.type === 'treeCrushed') {
      const W = this.state.world.W;
      const ck = this.chunkOf(e.tile % W, Math.floor(e.tile / W));
      const ch = this.treeChunks.get(ck);
      if (ch?.tiles.delete(e.tile)) this.rebuildTrees(ck);
      this.terrain.repaint(e.tile);
    } else if (e.type === 'structureDamaged') {
      const slot = this.slots.get(e.id);
      if (!slot) return;
      const f = 1 - 0.55 * (1 - Math.max(0, e.hp) / e.max);
      slot.base.setColorAt(slot.index, _c.setRGB(f, f, f));
      slot.base.instanceColor!.needsUpdate = true;
    } else if (e.type === 'structureDestroyed') {
      const st = this.state.structs[e.id - 1];
      const slot = this.slots.get(e.id);
      if (!slot || !st) return;
      if (st.kind === 'tower') {
        const geo = structureGeometry('tower', st.side);
        const m = mesh(geo.base, MATERIALS.matte);
        m.position.set(st.x, G, st.y);
        this.group.add(m);
        this.collapsing.push({ obj: m, t: 0 });
      }
      slot.base.setMatrixAt(slot.index, ZERO);
      slot.base.instanceMatrix.needsUpdate = true;
      if (slot.head) {
        slot.head.setMatrixAt(slot.index, ZERO);
        slot.head.instanceMatrix.needsUpdate = true;
      }
      this.slots.delete(e.id);
      this.addRubble(st);
      const W = this.state.world.W;
      for (let y = st.ty; y < st.ty + st.h; y++) for (let x = st.tx; x < st.tx + st.w; x++) this.terrain.repaint(y * W + x);
    }
  }

  private addRubble(st: Structure) {
    const b = new ModelBuilder();
    const n = st.w * st.h * 6;
    let seed = st.id * 9301;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < n; k++) {
      const a = 3 + rnd() * 8;
      b.box(a, 2 + rnd() * 5, 3 + rnd() * 7, k % 2 ? '#7d7a70' : '#4b4a44',
        (rnd() - 0.5) * st.w * TILE * 0.85, G + 1 + rnd() * 2, (rnd() - 0.5) * st.h * TILE * 0.85,
        { rx: rnd(), ry: rnd() * 3, rz: rnd() * 0.6 });
    }
    const m = mesh(b.build());
    m.position.set(st.x, 0, st.y);
    this.group.add(m);
  }
}

/** Tileable wave normal map (sum of sines), generated at load. */
function makeWaveNormalMap(): THREE.Texture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const waves = [[1, 2, 0.9, 0], [3, -1, 0.6, 1], [-2, 4, 0.4, 2], [5, 3, 0.3, 4], [-6, 2, 0.2, 3]];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos((6.2832 * (w[0] * x + w[1] * y)) / S + w[3]) * w[2];
        dx += c * w[0];
        dy += c * w[1];
      }
      const l = Math.hypot(dx * 0.35, dy * 0.35, 1);
      const k = (y * S + x) * 4;
      data[k] = (-dx * 0.35 / l * 0.5 + 0.5) * 255;
      data[k + 1] = (-dy * 0.35 / l * 0.5 + 0.5) * 255;
      data[k + 2] = (1 / l * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
