import { Tile, otherSide, type GameState, type Side } from '../sim/entities';
import type { SimEvent } from '../sim/events';
import { TILE } from '../sim/tuning';
import { he } from '../i18n/he';

const COLOURS: Record<number, [number, number, number]> = {
  [Tile.Water]: [23, 82, 92],
  [Tile.Grass]: [120, 134, 66],
  [Tile.Sand]: [207, 185, 128],
  [Tile.Road]: [178, 160, 126],
  [Tile.Bridge]: [150, 118, 80],
  [Tile.Tree]: [60, 100, 58],
  [Tile.Rubble]: [110, 106, 92],
  [Tile.Pad]: [111, 155, 212],
};

/** Overhead map, north up. Redraws the terrain layer only when tiles change. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private dirty = true;
  private side: Side;
  private sx = 2;

  constructor(side: Side) {
    this.side = side;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', he.hud.minimap);
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
  }

  onEvent(e: SimEvent) {
    if (e.type === 'treeCrushed' || e.type === 'structureDestroyed') this.dirty = true;
  }

  draw(s: GameState, time: number) {
    const { W, H, tiles, block } = s.world;
    if (this.canvas.width !== W * this.sx) {
      this.canvas.width = W * this.sx;
      this.canvas.height = H * this.sx;
      this.base.width = W;
      this.base.height = H;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      const bc = this.base.getContext('2d')!;
      const im = bc.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const c = block[i] ? [70, 72, 66] : COLOURS[tiles[i]];
        im.data[i * 4] = c[0];
        im.data[i * 4 + 1] = c[1];
        im.data[i * 4 + 2] = c[2];
        im.data[i * 4 + 3] = 255;
      }
      bc.putImageData(im, 0, 0);
    }
    const c = this.ctx;
    const k = this.sx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.base, 0, 0, W * k, H * k);
    const me = this.side;
    const foe = otherSide(me);
    for (const st of s.structs) {
      if (!st.alive || st.kind !== 'tower') continue;
      c.fillStyle = st.side === foe ? '#e0563c' : '#6f9bd4';
      c.fillRect(st.tx * k, st.ty * k, st.w * k, st.h * k);
    }
    const pad = s.sides[me];
    c.fillStyle = '#6f9bd4';
    c.fillRect((pad.padX / TILE) * k - 3, (pad.padY / TILE) * k - 3, 6, 6);
    const blink = Math.sin(time * 8) > 0;
    const ef = s.flags[foe];
    if (ef.state === 'ground' && blink) {
      c.fillStyle = '#f0c24a';
      c.fillRect((ef.x / TILE) * k - 3, (ef.y / TILE) * k - 3, 6, 6);
    }
    const mf = s.flags[me];
    if ((mf.state === 'ground' || mf.state === 'carried') && Math.sin(time * 10) > 0) {
      c.fillStyle = '#ff3b1f';
      c.fillRect((mf.x / TILE) * k - 3, (mf.y / TILE) * k - 3, 6, 6);
    }
    const v = s.sides[me].vehicle;
    if (v) {
      c.fillStyle = v.carrying && blink ? '#f0c24a' : '#ffffff';
      c.fillRect((v.x / TILE) * k - 2, (v.y / TILE) * k - 2, 5, 5);
    }
  }
}
