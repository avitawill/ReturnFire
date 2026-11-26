// Virtual stick (drag anywhere on the left of the view) and fire / mine
// buttons on the right.

import { he } from '../i18n/he';
import { emptyDevice, type DeviceState, type InputDevice } from './types';

const RADIUS = 46;

export class TouchDevice implements InputDevice {
  readonly kind = 'touch' as const;
  readonly pad: HTMLDivElement;
  readonly controls: HTMLDivElement;
  readonly mineButton: HTMLButtonElement;
  private joy: HTMLDivElement;
  private knob: HTMLDivElement;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private vx = 0;
  private vy = 0;
  private firePtr: number | null = null;
  private fireBtn = false;
  private mineReq = false;
  private lastUse = -1e9;
  private fireButton: HTMLButtonElement;
  private mineCount: HTMLSpanElement;
  /** On-screen buttons are only shown on touch screens. */
  private touchSeen = !!window.matchMedia?.('(pointer: coarse)').matches;
  private shown = false;

  constructor(layer: HTMLElement) {
    this.pad = document.createElement('div');
    this.pad.className = 'touchpad';
    this.joy = document.createElement('div');
    this.joy.className = 'joy';
    this.joy.hidden = true;
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.joy.append(this.knob);
    this.controls = document.createElement('div');
    this.controls.className = 'ctl';
    this.mineButton = document.createElement('button');
    this.mineButton.type = 'button';
    this.mineButton.className = 'mine';
    this.mineButton.hidden = true;
    this.mineCount = document.createElement('span');
    this.mineButton.append(he.hud.mine, document.createElement('br'), this.mineCount);
    this.fireButton = document.createElement('button');
    this.fireButton.type = 'button';
    this.fireButton.className = 'fire';
    this.fireButton.textContent = he.hud.fire;
    this.controls.append(this.mineButton, this.fireButton);
    layer.append(this.pad, this.joy, this.controls);

    this.pad.addEventListener('pointerdown', this.onPadDown);
    this.pad.addEventListener('pointermove', this.onPadMove);
    this.pad.addEventListener('pointerup', this.onPadUp);
    this.pad.addEventListener('pointercancel', this.onPadUp);
    this.pad.addEventListener('contextmenu', (e) => e.preventDefault());
    this.fireButton.addEventListener('pointerdown', (e) => {
      this.fireBtn = true;
      this.fireButton.classList.add('down');
      this.lastUse = performance.now();
      try {
        this.fireButton.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      e.preventDefault();
    });
    for (const ev of ['pointerup', 'pointercancel'] as const)
      this.fireButton.addEventListener(ev, () => {
        this.fireBtn = false;
        this.fireButton.classList.remove('down');
      });
    this.mineButton.addEventListener('pointerdown', (e) => {
      this.mineReq = true;
      this.lastUse = performance.now();
      e.preventDefault();
    });
  }

  private local(e: PointerEvent) {
    const r = this.pad.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  }

  private onPadDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !this.touchSeen) {
      this.touchSeen = true;
      this.controls.hidden = !this.shown;
    }
    const p = this.local(e);
    this.lastUse = performance.now();
    if (p.x < p.w * 0.6 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.ox = p.x;
      this.oy = p.y;
      this.vx = this.vy = 0;
      this.joy.hidden = false;
      this.joy.style.left = `${p.x}px`;
      this.joy.style.top = `${p.y}px`;
      this.knob.style.transform = '';
    } else if (this.firePtr === null) this.firePtr = e.pointerId;
    try {
      this.pad.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    e.preventDefault();
  };

  private onPadMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return;
    const p = this.local(e);
    let dx = (p.x - this.ox) / RADIUS;
    let dy = (p.y - this.oy) / RADIUS;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.vx = dx;
    this.vy = dy;
    this.knob.style.transform = `translate(${dx * RADIUS}px,${dy * RADIUS}px)`;
  };

  private onPadUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) this.endStick();
    if (e.pointerId === this.firePtr) this.firePtr = null;
  };

  private endStick() {
    this.stickId = null;
    this.vx = this.vy = 0;
    this.joy.hidden = true;
  }

  setMines(n: number | null) {
    this.mineButton.hidden = n === null;
    if (n !== null) this.mineCount.textContent = String(n);
  }

  setVisible(v: boolean) {
    this.shown = v;
    this.controls.hidden = !v || !this.touchSeen;
    this.pad.hidden = !v;
    if (!v) this.reset();
  }

  read(): DeviceState {
    const st = emptyDevice();
    if (this.stickId !== null) st.move = { x: this.vx, y: this.vy };
    st.fire = this.fireBtn || this.firePtr !== null;
    st.secondary = this.mineReq;
    this.mineReq = false;
    return st;
  }

  active() {
    return performance.now() - this.lastUse < 15000;
  }

  reset() {
    this.endStick();
    this.firePtr = null;
    this.fireBtn = false;
    this.mineReq = false;
    this.fireButton.classList.remove('down');
  }

  dispose() {
    this.pad.remove();
    this.joy.remove();
    this.controls.remove();
  }
}
