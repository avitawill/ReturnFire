import { emptyDevice, type DeviceState, type InputDevice } from './types';

const DEADZONE = 0.2;

/**
 * Standard-mapping gamepad: left stick or D-pad to drive, A / right trigger
 * to fire, B / X for a mine, Start to pause.
 */
export class GamepadDevice implements InputDevice {
  readonly kind = 'gamepad' as const;
  /** Index into navigator.getGamepads(). */
  index: number;
  private prev = { secondary: false, pause: false, confirm: false, back: false, up: false, down: false, left: false, right: false };
  private lastUse = -1e9;
  /** Edge-triggered menu navigation, filled by read(). */
  nav = { confirm: false, back: false, up: false, down: false, left: false, right: false };

  constructor(index: number) {
    this.index = index;
  }

  connected(): boolean {
    return !!navigator.getGamepads?.()[this.index];
  }

  read(): DeviceState {
    const st = emptyDevice();
    const pad = navigator.getGamepads?.()[this.index];
    this.nav = { confirm: false, back: false, up: false, down: false, left: false, right: false };
    if (!pad) return st;
    const b = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
    let x = pad.axes[0] ?? 0;
    let y = pad.axes[1] ?? 0;
    const m = Math.hypot(x, y);
    if (m < DEADZONE) {
      x = 0;
      y = 0;
    } else {
      // Rescale so the stick starts at zero just outside the deadzone.
      const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
      x *= k;
      y *= k;
    }
    const du = b(12);
    const dd = b(13);
    const dl = b(14);
    const dr = b(15);
    if (du || dd || dl || dr) {
      x = (dr ? 1 : 0) - (dl ? 1 : 0);
      y = (dd ? 1 : 0) - (du ? 1 : 0);
    }
    st.move = { x, y };
    st.fire = b(0) || b(7) || b(5);
    const sec = b(1) || b(2) || b(6) || b(4);
    st.secondary = sec;
    const pause = b(9) || b(8);
    st.pause = pause && !this.prev.pause;
    const up = du || y < -0.6;
    const down = dd || y > 0.6;
    const left = dl || x < -0.6;
    const right = dr || x > 0.6;
    this.nav = {
      confirm: b(0) && !this.prev.confirm,
      back: b(1) && !this.prev.back,
      up: up && !this.prev.up,
      down: down && !this.prev.down,
      left: left && !this.prev.left,
      right: right && !this.prev.right,
    };
    this.prev = { secondary: sec, pause, confirm: b(0), back: b(1), up, down, left, right };
    if (m > DEADZONE || pad.buttons.some((bt) => bt.pressed)) this.lastUse = performance.now();
    return st;
  }

  active() {
    return this.connected() && performance.now() - this.lastUse < 15000;
  }

  reset() {
    this.prev = { secondary: false, pause: false, confirm: false, back: false, up: false, down: false, left: false, right: false };
  }

  dispose() {}
}

/** Indices of currently connected gamepads. */
export function connectedPads(): number[] {
  const out: number[] = [];
  const pads = navigator.getGamepads?.() ?? [];
  for (let i = 0; i < pads.length; i++) if (pads[i]) out.push(i);
  return out;
}
