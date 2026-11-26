import { emptyDevice, type DeviceState, type InputDevice } from './types';

export interface KeyScheme {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  fire: string[];
  secondary: string[];
  pause: string[];
}

/** Arrows or WASD to drive, Space to fire, M/E for a mine, Escape/P to pause. */
export const DEFAULT_KEYS: KeyScheme = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  fire: ['Space', 'KeyJ'],
  secondary: ['KeyM', 'KeyE', 'KeyK'],
  pause: ['Escape', 'KeyP'],
};

export class KeyboardDevice implements InputDevice {
  readonly kind = 'keyboard' as const;
  private down = new Set<string>();
  private pressed = new Set<string>();
  private lastUse = -1e9;
  private scheme: KeyScheme;
  /** When false, keys are not captured (e.g. a menu has focus). */
  capture = true;

  constructor(scheme: KeyScheme = DEFAULT_KEYS) {
    this.scheme = scheme;
    addEventListener('keydown', this.onDown);
    addEventListener('keyup', this.onUp);
    addEventListener('blur', this.onBlur);
  }

  private owns(code: string) {
    const s = this.scheme;
    return [s.up, s.down, s.left, s.right, s.fire, s.secondary, s.pause].some((l) => l.includes(code));
  }

  private onDown = (e: KeyboardEvent) => {
    if (!this.owns(e.code)) return;
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    this.lastUse = performance.now();
    // Keep the page from scrolling while playing; let menus use Space/Enter on buttons.
    const t = e.target as HTMLElement | null;
    if (this.capture && !(t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT'))) e.preventDefault();
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => this.reset();

  private any(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  read(): DeviceState {
    const s = this.scheme;
    const st = emptyDevice();
    st.move.x = (this.any(s.right) ? 1 : 0) - (this.any(s.left) ? 1 : 0);
    st.move.y = (this.any(s.down) ? 1 : 0) - (this.any(s.up) ? 1 : 0);
    st.fire = this.any(s.fire);
    // Mines are edge-triggered: report a press for one frame even if released before polling.
    st.secondary = this.any(s.secondary) || s.secondary.some((c) => this.pressed.has(c));
    st.pause = s.pause.some((c) => this.pressed.has(c));
    this.pressed.clear();
    return st;
  }

  active() {
    return performance.now() - this.lastUse < 15000;
  }

  reset() {
    this.down.clear();
    this.pressed.clear();
  }

  dispose() {
    removeEventListener('keydown', this.onDown);
    removeEventListener('keyup', this.onUp);
    removeEventListener('blur', this.onBlur);
  }
}
