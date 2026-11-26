// Smooth heightfield terrain built from the sim's tile grid. Heights are a
// render concern only; the sim is 2D.

import * as THREE from 'three';
import { Tile, type World } from '../sim/entities';
import { HEIGHT, TILE } from '../sim/tuning';

export const G = HEIGHT.ground;
/** Vertices per tile edge. */
const R = 2;
const TS = TILE / R;

const TILE_COLOURS: Record<number, string> = {
  [Tile.Grass]: '#6f8a3c',
  [Tile.Tree]: '#66823a',
  [Tile.Sand]: '#d6c188',
  [Tile.Road]: '#a8956f',
  [Tile.Pad]: '#8f9894',
  [Tile.Rubble]: '#67635a',
  [Tile.Water]: '#c9b47c',
  [Tile.Bridge]: '#c9b47c',
};
const SEABED = new THREE.Color('#14505a');
const DEEP = new THREE.Color('#0d3a43');
const LAND_STEPS = [0.28, 0.72, 1, 1];
const DEPTH_STEPS = [3.5, 8, 12, 14];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const hash2 = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Chunk size in tiles, for frustum culling. */
export const CHUNK = 16;

export class Terrain {
  /** One mesh per chunk; all share the vertex buffers. */
  readonly group = new THREE.Group();
  private colorAttr: THREE.BufferAttribute;
  readonly NX: number;
  readonly NZ: number;
  /** Height per vertex. */
  readonly hg: Float32Array;
  /** Height per tile centre. */
  private th: Float32Array;
  private colours: THREE.Color[];
  private noise: Float32Array;
  private world: World;

  constructor(world: World, flat: Uint8Array) {
    this.world = world;
    const { W, H } = world;
    this.NX = W * R + 1;
    this.NZ = H * R + 1;
    this.colours = [];
    for (const k in TILE_COLOURS) this.colours[Number(k)] = new THREE.Color(TILE_COLOURS[Number(k)]);
    this.th = tileHeights(world, flat);
    this.noise = new Float32Array(this.NX * this.NZ);
    this.hg = new Float32Array(this.NX * this.NZ);
    const pos = new Float32Array(this.NX * this.NZ * 3);
    const col = new Float32Array(this.NX * this.NZ * 3);
    const c = new THREE.Color();
    for (let vj = 0; vj < this.NZ; vj++)
      for (let vi = 0; vi < this.NX; vi++) {
        const k = vj * this.NX + vi;
        const x = vi * TS;
        const z = vj * TS;
        this.noise[k] = (Math.sin(x * 0.013 + Math.sin(z * 0.021) * 1.7) + Math.sin(z * 0.017 + x * 0.009)) * 0.5 + (hash2(vi, vj) - 0.5) * 0.5;
        const h = this.sampleTileHeight(x, z);
        this.hg[k] = h;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        this.vertexColour(vi, vj, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    // Normals from the full grid, so chunk seams shade identically.
    const full = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    this.colorAttr = new THREE.BufferAttribute(col, 3);
    full.setAttribute('position', posAttr);
    full.setIndex(new THREE.BufferAttribute(this.indices(0, 0, this.NX - 1, this.NZ - 1), 1));
    full.computeVertexNormals();
    const normal = full.getAttribute('normal');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const step = CHUNK * R;
    for (let cj = 0; cj < this.NZ - 1; cj += step)
      for (let ci = 0; ci < this.NX - 1; ci += step) {
        const i1 = Math.min(ci + step, this.NX - 1);
        const j1 = Math.min(cj + step, this.NZ - 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', posAttr);
        g.setAttribute('normal', normal);
        g.setAttribute('color', this.colorAttr);
        g.setIndex(new THREE.BufferAttribute(this.indices(ci, cj, i1, j1), 1));
        const cx = ((ci + i1) / 2) * TS;
        const cz = ((cj + j1) / 2) * TS;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), Math.hypot((i1 - ci) * TS, (j1 - cj) * TS) / 2 + 20);
        g.boundingBox = new THREE.Box3(new THREE.Vector3(ci * TS, -20, cj * TS), new THREE.Vector3(i1 * TS, 20, j1 * TS));
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        m.name = 'terrain';
        this.group.add(m);
      }
  }

  /** Triangle indices for the vertex rectangle [i0, i1] x [j0, j1]. */
  private indices(i0: number, j0: number, i1: number, j1: number): Uint32Array {
    const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
    let q = 0;
    for (let vj = j0; vj < j1; vj++)
      for (let vi = i0; vi < i1; vi++) {
        const a = vj * this.NX + vi;
        const b = a + 1;
        const cc = a + this.NX;
        const d = cc + 1;
        // Alternate the diagonal to avoid a visible grain.
        if ((vi + vj) & 1) {
          idx[q++] = a; idx[q++] = cc; idx[q++] = b;
          idx[q++] = b; idx[q++] = cc; idx[q++] = d;
        } else {
          idx[q++] = a; idx[q++] = cc; idx[q++] = d;
          idx[q++] = a; idx[q++] = d; idx[q++] = b;
        }
      }
    return idx;
  }

  /** Bilinear interpolation of tile-centre heights. */
  private sampleTileHeight(x: number, z: number): number {
    const { W, H } = this.world;
    const fx = x / TILE - 0.5;
    const fz = z / TILE - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const u = fx - i0;
    const v = fz - j0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? -DEPTH_STEPS[3] : this.th[j * W + i]);
    return (at(i0, j0) * (1 - u) + at(i0 + 1, j0) * u) * (1 - v) + (at(i0, j0 + 1) * (1 - u) + at(i0 + 1, j0 + 1) * u) * v;
  }

  private vertexColour(vi: number, vj: number, out: THREE.Color) {
    const { W, H, tiles } = this.world;
    const x = vi * TS;
    const z = vj * TS;
    const e = TILE * 0.49;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let a = 0; a < 4; a++) {
      const tx = Math.floor((x + (a & 1 ? e : -e)) / TILE);
      const tz = Math.floor((z + (a & 2 ? e : -e)) / TILE);
      const t = tx < 0 || tz < 0 || tx >= W || tz >= H ? Tile.Water : tiles[tz * W + tx];
      const c = this.colours[t];
      r += c.r;
      g += c.g;
      b += c.b;
    }
    const k = vj * this.NX + vi;
    out.setRGB(r / 4, g / 4, b / 4);
    const h = this.hg[k];
    // Beaches follow the smooth heightfield rather than the tile grid.
    if (h < G * 0.85 && h > -1) out.lerp(this.colours[Tile.Sand], 1 - smooth(G * 0.45, G * 0.85, h));
    out.multiplyScalar(1 + 0.08 * this.noise[k]);
    if (h < 0) {
      out.lerp(SEABED, Math.min(1, -h / 5));
      out.lerp(DEEP, Math.min(1, Math.max(0, (-h - 6) / 8)));
    }
  }

  /** Ground height at a world position. Bridges report deck height. */
  heightAt(x: number, y: number): number {
    const { W, H, tiles } = this.world;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && tiles[ty * W + tx] === Tile.Bridge) return G;
    const fx = Math.min(Math.max(x / TS, 0), this.NX - 1.001);
    const fy = Math.min(Math.max(y / TS, 0), this.NZ - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * this.NX + i;
    const hg = this.hg;
    return (hg[k] * (1 - u) + hg[k + 1] * u) * (1 - v) + (hg[k + this.NX] * (1 - u) + hg[k + this.NX + 1] * u) * v;
  }

  /** Re-colour the vertices of one tile after it changed (tree crushed, rubble). */
  repaint(tile: number) {
    const { W } = this.world;
    const tx = tile % W;
    const ty = Math.floor(tile / W);
    const ca = this.colorAttr;
    const c = new THREE.Color();
    for (let vj = ty * R; vj <= ty * R + R; vj++)
      for (let vi = tx * R; vi <= tx * R + R; vi++) {
        this.vertexColour(vi, vj, c);
        ca.setXYZ(vj * this.NX + vi, c.r, c.g, c.b);
      }
    ca.needsUpdate = true;
  }

  /** Darken the ground around a point (explosion scorch). */
  scorch(x: number, y: number, r: number) {
    const ca = this.colorAttr;
    for (let j = Math.max(0, Math.floor((y - r) / TS)); j <= Math.min(this.NZ - 1, Math.ceil((y + r) / TS)); j++)
      for (let i = Math.max(0, Math.floor((x - r) / TS)); i <= Math.min(this.NX - 1, Math.ceil((x + r) / TS)); i++) {
        const k = j * this.NX + i;
        if (this.hg[k] < 0.5) continue;
        const d = Math.hypot(i * TS - x, j * TS - y);
        if (d > r) continue;
        const f = 0.55 + 0.45 * (d / r);
        ca.setXYZ(k, ca.getX(k) * f, ca.getY(k) * f, ca.getZ(k) * f);
      }
    ca.needsUpdate = true;
  }
}

/**
 * Height per tile centre: land rises with distance from the shore, the sea
 * deepens with distance from land. Flat tiles (roads, pads, under structures)
 * sit exactly at ground level; other inland tiles undulate a little.
 */
function tileHeights(world: World, flat: Uint8Array): Float32Array {
  const { W, H, tiles } = world;
  const N = W * H;
  const isLand = (i: number) => tiles[i] !== Tile.Water && tiles[i] !== Tile.Bridge;
  const dist = new Int8Array(N).fill(-1);
  // Multi-source BFS from every land/sea boundary, 8-connected.
  let frontier: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (isLand(ny * W + nx) !== isLand(i)) {
          edge = true;
          break;
        }
      }
    if (edge) {
      dist[i] = 1;
      frontier.push(i);
    }
  }
  for (let d = 2; d <= 4 && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const y = Math.floor(i / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (dist[j] !== -1 || isLand(j) !== isLand(i)) continue;
          dist[j] = d;
          next.push(j);
        }
    }
    frontier = next;
  }
  const th = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = dist[i] === -1 ? 4 : dist[i];
    if (isLand(i)) {
      const t = tiles[i];
      if (flat[i] || t === Tile.Road || t === Tile.Pad) th[i] = G;
      else {
        const x = i % W;
        const y = Math.floor(i / W);
        const bump = d >= 3 ? (Math.sin(x * 0.55 + y * 0.2) + Math.sin(y * 0.47 - x * 0.31)) * 1.4 : 0;
        th[i] = G * LAND_STEPS[d - 1] + bump;
      }
    } else th[i] = -DEPTH_STEPS[d - 1];
  }
  // Two blur passes near the shore round off the tile staircase; flat tiles keep their height.
  for (let pass = 0; pass < 2; pass++) {
    const src = th.slice();
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (flat[i] || tiles[i] === Tile.Road || tiles[i] === Tile.Pad || tiles[i] === Tile.Bridge) continue;
        if (dist[i] === -1 || dist[i] > 2) continue;
        let sum = src[i] * 4;
        let wsum = 4;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const w = dx && dy ? 1 : 2;
            sum += src[i + dy * W + dx] * w;
            wsum += w;
          }
        const v = sum / wsum;
        // Never let blur push land under water or sea above it: the sim's coastline stays put.
        th[i] = isLand(i) ? Math.max(0.6, v) : Math.min(-0.8, v);
      }
  }
  return th;
}
