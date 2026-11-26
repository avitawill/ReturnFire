// Tilted follow camera. During play the heading is fixed: screen-up is always
// north (sim -y). In menus it may slowly orbit.

import * as THREE from 'three';
import { clamp } from '../sim/math';

const ELEV_PLAY = 0.7;
const ELEV_ORBIT = 0.45;

export interface CameraTarget {
  x: number;
  y: number;
  a: number;
  fly: boolean;
}

export class FollowCamera {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 10, 6000);
  x: number;
  y: number;
  private zoom = 1;
  private theta = 0;
  private elev = ELEV_PLAY;
  /** Base distance; recomputed on resize so a similar width of world is visible. */
  baseD = 480;
  orbit = false;
  private worldW: number;
  private worldH: number;

  constructor(x: number, y: number, worldW: number, worldH: number) {
    this.x = x;
    this.y = y;
    this.worldW = worldW;
    this.worldH = worldH;
  }

  resize(w: number, h: number) {
    const asp = w / Math.max(1, h);
    this.camera.fov = asp < 1 ? 50 : 40;
    this.camera.aspect = asp;
    this.camera.updateProjectionMatrix();
    // Keep roughly the same width of ground in view; portrait screens get a little closer.
    const halfWidth = asp < 1 ? 170 : 200;
    this.baseD = clamp(halfWidth / (Math.tan((this.camera.fov * Math.PI) / 360) * asp), asp < 1 ? 420 : 480, 1100);
  }

  /** Pixels per world unit at distance 1 for a viewport of height `h` (for point sprites). */
  pixelScale(h: number) {
    return h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  snapTo(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  update(dt: number, target: CameraTarget | null, shake: number) {
    const k = Math.min(1, dt * 3);
    this.zoom += ((target?.fly ? 1.2 : 1) - this.zoom) * k;
    if (target) {
      const f = Math.min(1, dt * 6);
      this.x += (target.x + Math.cos(target.a) * 30 - this.x) * f;
      this.y += (target.y + Math.sin(target.a) * 30 - this.y) * f;
    }
    let sx = 0;
    let sy = 0;
    if (shake > 0) {
      sx = (Math.random() - 0.5) * shake;
      sy = (Math.random() - 0.5) * shake;
    }
    if (this.orbit) this.theta += dt * 0.14;
    else {
      // Unwind to exactly north-up.
      let d = this.theta % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.theta = d - d * Math.min(1, dt * 3);
      if (Math.abs(this.theta) < 1e-4) this.theta = 0;
    }
    this.elev += ((this.orbit ? ELEV_ORBIT : ELEV_PLAY) - this.elev) * k;
    const D = this.baseD * this.zoom;
    const margin = 120;
    const tx = clamp(this.x, margin, this.worldW - margin) + sx;
    const tz = clamp(this.y, margin, this.worldH - margin) - 50 + sy;
    const cr = Math.sqrt(1 - this.elev * this.elev);
    this.camera.position.set(tx + Math.sin(this.theta) * D * cr, D * this.elev, tz + Math.cos(this.theta) * D * cr);
    this.camera.lookAt(tx, 0, tz);
    return { tx, tz, D };
  }
}
