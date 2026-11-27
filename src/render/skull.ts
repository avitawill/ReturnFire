// The laughing skull shown when a vehicle is lost and on defeat.

import * as THREE from 'three';
import { jawOpen, LAUGH_LENGTH } from '../audio/laugh';

export class SkullScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private skull = new THREE.Group();
  private jaw = new THREE.Group();
  private eyes: THREE.Mesh[] = [];

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#120708');
    s.add(new THREE.AmbientLight(0xffffff, 1.1));
    const d1 = new THREE.DirectionalLight(0xfff1d6, 2.8);
    d1.position.set(-2, 3, 4);
    const d2 = new THREE.DirectionalLight(0xe0563c, 2.5);
    d2.position.set(2, -3, 2);
    s.add(d1, d2);
    const bone = new THREE.MeshPhongMaterial({ color: '#e8dfc6', shininess: 25, specular: '#443322', flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: '#0a0405' });
    const glow = new THREE.MeshBasicMaterial({ color: '#ff3b1f' });
    const sp = (par: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      par.add(o);
      return o;
    };
    const bx = (par: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bone);
      o.position.set(x, y, z);
      par.add(o);
    };
    const sk = this.skull;
    s.add(sk);
    sp(sk, 1, bone, 0, 0.35, 0, 1, 1.05, 1.1);
    sp(sk, 0.7, bone, 0, -0.38, 0.28, 1, 0.85, 0.9);
    sp(sk, 0.2, bone, -0.62, -0.2, 0.45, 1, 0.7, 1);
    sp(sk, 0.2, bone, 0.62, -0.2, 0.45, 1, 0.7, 1);
    for (const sx of [-1, 1]) {
      sp(sk, 0.28, dark, sx * 0.37, 0.14, 0.86, 1.1, 1, 0.6);
      this.eyes.push(sp(sk, 0.07, glow, sx * 0.37, 0.12, 0.98));
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 3), dark);
    nose.position.set(0, -0.25, 0.93);
    sk.add(nose);
    for (let i = 0; i < 6; i++) bx(sk, 0.12, 0.2, 0.1, -0.3 + i * 0.12, -0.86, 0.82 + (i === 0 || i === 5 ? -0.06 : 0));
    this.jaw.position.set(0, -0.7, -0.1);
    sk.add(this.jaw);
    sp(this.jaw, 0.6, bone, 0, -0.42, 0.42, 1, 0.5, 0.95);
    for (let i = 0; i < 6; i++) bx(this.jaw, 0.11, 0.18, 0.1, -0.28 + i * 0.112, -0.2, 0.94 + (i === 0 || i === 5 ? -0.06 : 0));
  }

  /** Pose for time `t` since the skull appeared, in a viewport of aspect `asp`. */
  pose(t: number, asp: number) {
    // The laugh starts 0.25 s after the skull appears; the jaw follows its syllables.
    const open = t - 0.25 < LAUGH_LENGTH ? jawOpen(t - 0.25) : 0;
    this.jaw.rotation.x = open * 0.42;
    this.skull.rotation.set(-0.08 - open * 0.1, Math.sin(t * 0.9) * 0.4, Math.sin(t * 0.6) * 0.08);
    // Rises into view during the first second.
    this.skull.position.y = open * 0.06 + Math.min(0, (t - 1) * 1.6) * -1.2;
    const e = 0.6 + 0.4 * Math.sin(t * 9);
    for (const o of this.eyes) o.scale.setScalar(0.8 + e * 0.5);
    this.camera.aspect = asp;
    this.camera.updateProjectionMatrix();
    // Leave room below for the end-screen sheet; narrower views need more distance.
    const d = asp < 0.75 ? 11 : asp < 1.2 ? 10 : 7;
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, asp < 1.2 ? -1.3 : -0.9, 0);
  }
}
