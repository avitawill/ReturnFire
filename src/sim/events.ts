import type { EndReason, GameState, Side, StructKind, UnitKind } from './entities';
import type { VehicleType } from './tuning';

/** Discrete things that happened during a step. Render and audio subscribe to these. */
export type SimEvent =
  | { type: 'shot'; side: Side; weapon: 'gun' | 'shell' | 'rocket' | 'aaRocket'; x: number; y: number; h: number; a: number; byVehicle: boolean }
  | { type: 'explosion'; x: number; y: number; h: number; size: number; quiet: boolean }
  | { type: 'structureDamaged'; id: number; hp: number; max: number }
  | { type: 'structureDestroyed'; id: number; kind: StructKind; side: Side; x: number; y: number }
  | { type: 'treeCrushed'; tile: number; x: number; y: number }
  | { type: 'vehicleSpawned'; side: Side; vehicle: VehicleType; id: number }
  | { type: 'vehicleDocked'; side: Side; vehicle: VehicleType }
  | { type: 'vehicleLost'; side: Side; vehicle: VehicleType; cause: 'destroyed' | 'drowned' | 'fuel'; x: number; y: number; a: number; ta: number }
  | { type: 'vehicleHit'; side: Side; hp: number }
  | { type: 'sinking'; side: Side; vehicle: VehicleType }
  | { type: 'fuelLow'; side: Side }
  | { type: 'unitDestroyed'; id: number; kind: UnitKind; side: Side; x: number; y: number; a: number; ta: number }
  | { type: 'mineLaid'; side: Side; id: number; x: number; y: number }
  | { type: 'mineTriggered'; id: number; x: number; y: number }
  | { type: 'flagRevealed'; side: Side; x: number; y: number }
  | { type: 'towerEmpty'; side: Side; towersLeft: number }
  | { type: 'flagTaken'; side: Side; by: Side }
  | { type: 'flagDropped'; side: Side; x: number; y: number; atSea: boolean }
  | { type: 'droneLaunched'; side: Side; id: number }
  | { type: 'gameOver'; winner: Side; reason: EndReason };

export type SimEventType = SimEvent['type'];

/** Per-step context handed to every system. */
export interface Ctx {
  s: GameState;
  ev: SimEvent[];
  dt: number;
}
