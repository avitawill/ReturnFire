import type { MoveIntent } from '../sim/entities';

/** What a single device contributes this frame. */
export interface DeviceState {
  move: MoveIntent;
  fire: boolean;
  secondary: boolean;
  /** Edge-triggered menu/pause request. */
  pause: boolean;
}

export interface InputDevice {
  readonly kind: 'keyboard' | 'gamepad' | 'touch';
  /** Poll the device. Called once per rendered frame. */
  read(): DeviceState;
  /** True if the device was used recently (decides which controls to show). */
  active(): boolean;
  reset(): void;
  dispose(): void;
}

export const emptyDevice = (): DeviceState => ({ move: { x: 0, y: 0 }, fire: false, secondary: false, pause: false });
