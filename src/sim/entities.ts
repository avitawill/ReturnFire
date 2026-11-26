import type { VehicleType } from './tuning';

export type Side = 0 | 1;
export const SIDES: readonly Side[] = [0, 1];
export const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);

export const Tile = {
  Water: 0,
  Grass: 1,
  Sand: 2,
  Road: 3,
  Bridge: 4,
  Tree: 5,
  Rubble: 6,
  Pad: 7,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/** A vehicle driven by a player or the AI commander. One per side at a time. */
export interface Vehicle {
  id: number;
  side: Side;
  type: VehicleType;
  x: number;
  y: number;
  /** Hull heading. 0 = east, PI/2 = south (screen down). */
  a: number;
  /** Turret / weapon heading. */
  ta: number;
  hp: number;
  fuel: number;
  ammo: number;
  mines: number;
  cool: number;
  carrying: boolean;
  /** Has driven far enough from the pad that returning to it docks. */
  left: boolean;
  wet: boolean;
  /** Seconds spent sinking, 0 when afloat or on land. */
  sink: number;
  fuelWarned: boolean;
  /** Last steering inputs, kept for the renderer (banking, tilt). */
  steer: number;
  throttle: number;
  prevSecondary: boolean;
}

export type UnitKind = 'ptank' | 'drone';

/** Autonomous defenders: patrol tanks and alarm drones. */
export interface Unit {
  id: number;
  side: Side;
  kind: UnitKind;
  x: number;
  y: number;
  a: number;
  ta: number;
  hp: number;
  max: number;
  cool: number;
  /** Home (patrol centre). */
  hx: number;
  hy: number;
  /** Current wander waypoint and time until a new one. */
  wx: number;
  wy: number;
  wt: number;
}

export type StructKind = 'bunker' | 'guard' | 'turret' | 'aa' | 'tower' | 'wall';

export interface Structure {
  id: number;
  side: Side;
  kind: StructKind;
  tx: number;
  ty: number;
  w: number;
  h: number;
  x: number;
  y: number;
  hp: number;
  max: number;
  indestructible: boolean;
  alive: boolean;
  /** Weapon heading for turrets. */
  a: number;
  cool: number;
  hasFlag: boolean;
}

export type ProjectileKind = 'bullet' | 'shell' | 'rocket';

export interface Projectile {
  id: number;
  side: Side;
  kind: ProjectileKind;
  x: number;
  y: number;
  /** Height above sea level, drifting from muzzle height to target height (render hint). */
  h: number;
  h1: number;
  vx: number;
  vy: number;
  /** Heading and speed, used by homing rockets. */
  a: number;
  sp: number;
  turn: number;
  /** Entity id of the homing target, or -1. */
  target: number;
  life: number;
  dmg: number;
  /** Can hit flying targets. */
  air: boolean;
  /** Explosion size on impact (0 = small puff). */
  big: number;
  /** Fired by a commander vehicle: these hit enemy structures. Defence fire does not. */
  byVehicle: boolean;
}

export interface Mine {
  id: number;
  side: Side;
  x: number;
  y: number;
}

export type FlagState = 'hidden' | 'ground' | 'carried' | 'captured';

export interface Flag {
  /** Owner of the flag. */
  side: Side;
  state: FlagState;
  x: number;
  y: number;
  /** Where the flag returns to if it is lost at sea. */
  hx: number;
  hy: number;
  towerId: number;
  /** Vehicle id while carried, otherwise -1. */
  carrier: number;
}

export interface SideState {
  side: Side;
  stock: Record<VehicleType, number>;
  vehicle: Vehicle | null;
  /** Seconds until a new vehicle may be chosen after a loss. */
  respawn: number;
  /** Enemy is carrying this side's flag: drones scramble. */
  alarm: boolean;
  droneT: number;
  padX: number;
  padY: number;
  /** Heading a fresh vehicle faces when it leaves the pad. */
  spawnA: number;
  bunkerId: number;
  towersLeft: number;
  vehiclesLost: number;
}

export interface World {
  W: number;
  H: number;
  tiles: Uint8Array;
  /** Index + 1 into GameState.structs, 0 when free. */
  block: Int16Array;
}

export type EndReason = 'flagCaptured' | 'noJeeps';

export interface GameState {
  seed: number;
  mapName: string;
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  world: World;
  structs: Structure[];
  units: Unit[];
  projectiles: Projectile[];
  mines: Mine[];
  flags: [Flag, Flag];
  sides: [SideState, SideState];
  winner: Side | -1;
  endReason: EndReason | null;
}

export interface MoveIntent {
  /** World-aligned stick: +x east, +y south. Magnitude 0..1. */
  x: number;
  y: number;
}

/** What one side wants to do this tick. Produced by input devices or the AI. */
export interface Intent {
  move: MoveIntent;
  fire: boolean;
  /** Secondary action (lay a mine). Edge-triggered inside the sim. */
  secondary: boolean;
  /** Vehicle to launch when the side has none in the field. */
  select: VehicleType | null;
}

export const idleIntent = (): Intent => ({ move: { x: 0, y: 0 }, fire: false, secondary: false, select: null });
