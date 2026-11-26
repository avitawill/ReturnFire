// Minimal binary glTF 2.0 writer for vertex-coloured, non-indexed meshes.
import type * as THREE from 'three';

export interface GlbNode {
  name: string;
  translation?: [number, number, number];
  mesh?: { geo: THREE.BufferGeometry; material: string };
  children?: GlbNode[];
}

export function writeGlb(roots: GlbNode[], materials: string[]): Uint8Array {
  const json: any = {
    asset: { version: '2.0', generator: 'mivtza-degel build-models' },
    scene: 0,
    scenes: [{ nodes: [] as number[] }],
    nodes: [] as any[],
    meshes: [] as any[],
    materials: materials.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } })),
    accessors: [] as any[],
    bufferViews: [] as any[],
    buffers: [{ byteLength: 0 }],
  };
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const addView = (arr: Float32Array, target: number) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    chunks.push(bytes.slice());
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += bytes.byteLength;
    return json.bufferViews.length - 1;
  };
  const addAccessor = (arr: Float32Array, withBounds: boolean) => {
    const view = addView(arr, 34962);
    const acc: any = { bufferView: view, componentType: 5126, count: arr.length / 3, type: 'VEC3' };
    if (withBounds) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < arr.length; i += 3)
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], arr[i + k]);
          max[k] = Math.max(max[k], arr[i + k]);
        }
      acc.min = min;
      acc.max = max;
    }
    json.accessors.push(acc);
    return json.accessors.length - 1;
  };
  const addNode = (n: GlbNode): number => {
    const node: any = { name: n.name };
    if (n.translation && n.translation.some((v) => v !== 0)) node.translation = n.translation;
    if (n.mesh) {
      const g = n.mesh.geo.index ? n.mesh.geo.toNonIndexed() : n.mesh.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      const attrs: any = {
        POSITION: addAccessor(g.attributes.position.array as Float32Array, true),
        NORMAL: addAccessor(g.attributes.normal.array as Float32Array, false),
      };
      if (g.attributes.color) attrs.COLOR_0 = addAccessor(g.attributes.color.array as Float32Array, false);
      json.meshes.push({ name: n.name, primitives: [{ attributes: attrs, material: materials.indexOf(n.mesh.material) }] });
      node.mesh = json.meshes.length - 1;
    }
    json.nodes.push(node);
    const idx = json.nodes.length - 1;
    if (n.children?.length) node.children = n.children.map(addNode);
    return idx;
  };
  for (const r of roots) json.scenes[0].nodes.push(addNode(r));
  const binLen = Math.ceil(offset / 4) * 4;
  json.buffers[0].byteLength = binLen;
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = new Uint8Array([...jsonBytes, ...new Array(jsonPad).fill(0x20)]);
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let p = 20 + jsonBytes.length;
  dv.setUint32(p, binLen, true);
  dv.setUint32(p + 4, 0x004e4942, true);
  p += 8;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}
