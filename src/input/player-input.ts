// Combines a player's devices into one sim Intent per tick.

import { idleIntent, type Intent } from '../sim/entities';
import type { VehicleType } from '../sim/tuning';
import type { DeviceState, InputDevice } from './types';

export class PlayerInput {
  devices: InputDevice[];
  /** Vehicle chosen in the bay, consumed by the next tick. */
  private pendingSelect: VehicleType | null = null;
  private secondaryLatch = false;
  pauseRequested = false;
  /** Last combined device state, for UI (e.g. pause handling). */
  last: DeviceState | null = null;

  constructor(devices: InputDevice[]) {
    this.devices = devices;
  }

  select(t: VehicleType) {
    this.pendingSelect = t;
  }

  /** Poll devices once per frame. */
  poll() {
    let mx = 0;
    let my = 0;
    let fire = false;
    let secondary = false;
    for (const d of this.devices) {
      const s = d.read();
      mx += s.move.x;
      my += s.move.y;
      fire ||= s.fire;
      secondary ||= s.secondary;
      if (s.pause) this.pauseRequested = true;
    }
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    if (secondary) this.secondaryLatch = true;
    this.last = { move: { x: mx, y: my }, fire, secondary, pause: false };
  }

  /** Intent for one sim tick. A latched secondary press is delivered once, then released. */
  intent(): Intent {
    const it = idleIntent();
    if (this.last) {
      it.move = { ...this.last.move };
      it.fire = this.last.fire;
    }
    it.secondary = this.secondaryLatch;
    if (this.secondaryLatch && !this.last?.secondary) this.secondaryLatch = false;
    else if (this.secondaryLatch) this.secondaryLatch = !!this.last?.secondary;
    it.select = this.pendingSelect;
    return it;
  }

  get hasPendingSelect() {
    return this.pendingSelect !== null;
  }

  /** Called when the sim spawned our vehicle (or the selection is no longer wanted). */
  clearSelect() {
    this.pendingSelect = null;
  }

  reset() {
    for (const d of this.devices) d.reset();
    this.pendingSelect = null;
    this.secondaryLatch = false;
    this.last = null;
  }
}
