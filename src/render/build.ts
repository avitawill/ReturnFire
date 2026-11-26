// Builds low-poly models from primitives, merged into a single geometry with
// vertex colours (one draw call per moving part).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export interface PartOpts {
  /** Euler rotation (radians). */
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];

  /** Adds a geometry. Pass `color: null` to keep an existing colour attribute. */
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, x: number, y: number, z: number, o: PartOpts = {}): this {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.deleteAttribute('uv');
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    geo.applyMatrix4(_m);
    if (color !== null || !geo.attributes.color) {
      _c.set(color ?? '#ffffff');
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.parts.push(geo);
    g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, o?: PartOpts) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, o);
  }

  /** Cylinder along Y unless `axis` says otherwise. */
  cyl(r1: number, r2: number, h: number, seg: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, axis: 'y' | 'x' | 'z' = 'y', o: PartOpts = {}) {
    const rot: PartOpts = axis === 'x' ? { rz: -Math.PI / 2 } : axis === 'z' ? { rx: Math.PI / 2 } : {};
    return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), color, x, y, z, { ...rot, ...o });
  }

  sphere(r: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, o: PartOpts = {}, ws = 10, hs = 7, half = false) {
    return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI), color, x, y, z, o);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, o);
  }

  /** Extruded 2D outline (in the XY plane), extruded along Z and centred. */
  prism(shape: [number, number][], depth: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, o: PartOpts = {}) {
    const s = new THREE.Shape(shape.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, x, y, z, o);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Shared materials keyed by kind. Vertex-coloured, so one material serves many models. */
export const MATERIALS = {
  matte: new THREE.MeshLambertMaterial({ vertexColors: true }),
  satin: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: new THREE.Color('#3a3a3a') }),
  glass: new THREE.MeshPhongMaterial({ color: '#bfe6f5', shininess: 120, specular: new THREE.Color('#ffffff') }),
};

export function mesh(g: THREE.BufferGeometry, mat: THREE.Material = MATERIALS.matte, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}
