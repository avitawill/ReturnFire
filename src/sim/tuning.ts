// Every number that affects balance lives here. Values start as the prototype's
// (`V` table and enemy constants in prototype/mivtza-degel.html), unchanged unless
// noted in DECISIONS.md. Units: world pixels (TILE px per tile), seconds, radians.

export const TILE = 32;
export const DT = 1 / 60;

export type VehicleType = 'heli' | 'tank' | 'launcher' | 'jeep';
export const VEHICLE_TYPES: readonly VehicleType[] = ['heli', 'tank', 'launcher', 'jeep'];

export interface VehicleSpec {
  hp: number;
  speed: number;
  turn: number;
  fuel: number;
  ammo: number;
  mines: number;
  rate: number;
  radius: number;
  fly: boolean;
}

export const VEHICLES: Record<VehicleType, VehicleSpec> = {
  heli: { hp: 60, speed: 200, turn: 5, fuel: 70, ammo: 240, mines: 0, rate: 0.1, radius: 12, fly: true },
  tank: { hp: 160, speed: 82, turn: 3.2, fuel: 200, ammo: 40, mines: 0, rate: 0.9, radius: 12, fly: false },
  launcher: { hp: 200, speed: 62, turn: 2.6, fuel: 200, ammo: 20, mines: 5, rate: 1.5, radius: 12, fly: false },
  jeep: { hp: 45, speed: 150, turn: 5.5, fuel: 150, ammo: 150, mines: 0, rate: 0.16, radius: 9, fly: false },
};

export const STOCK: Record<VehicleType, number> = { heli: 2, tank: 3, launcher: 2, jeep: 3 };

export const PLAYER = {
  /** Input magnitude below this is treated as no input. */
  deadzone: 0.15,
  /** Speed multiplier with an empty tank (ground vehicles). */
  noFuelSpeed: 0.3,
  /** Speed multiplier in water (jeep). */
  waterSpeed: 0.45,
  /** Seconds a non-amphibious ground vehicle takes to sink. */
  sinkTime: 1.3,
  /** Distance from the pad that counts as having left it, and as docking. */
  leaveDist: 72,
  dockDist: 30,
  /** Seconds after losing a vehicle before a new one may be chosen. */
  respawnDelay: 1.5,
  /** Below this fraction of fuel the side gets a low-fuel warning event. */
  fuelWarn: 0.25,
  flagPickupDist: 24,
  /** Heli bullets and jeep bullets. */
  heliGun: { speed: 480, life: 0.55, dmg: 5, spread: 0.08, muzzle: 14 },
  jeepGun: { speed: 420, life: 0.45, dmg: 4, spread: 0.08, muzzle: 14 },
  tankShell: { speed: 380, life: 0.7, dmg: 36, muzzle: 20 },
  tankAimRange: 235,
  tankTurretTurn: 5,
  rocket: { speed: 250, turn: 3.5, life: 1.9, dmg: 60, range: 420, muzzle: 10 },
  mine: { dropBehind: 20, triggerDist: 17, dmg: 90 },
} as const;

export const DEFENCE = {
  /** Gun turret (enemy turret in the prototype). */
  turret: { hp: 70, range: 215, turn: 3, rate: 0.95, dmg: 8, speed: 250, life: 0.95, muzzle: 20, aimTol: 0.2 },
  /** Indestructible bunker guard turret (prototype's friendly turret). */
  guard: { range: 270, turn: 3.5, rate: 0.6, dmg: 4, speed: 330, life: 0.85, muzzle: 24, aimTol: 0.2 },
  /** Anti-air launcher: targets helicopters only. */
  aa: { hp: 60, range: 340, turn: 3, rate: 2.8, dmg: 16, speed: 235, rocketTurn: 2, life: 2.8 },
  tower: { hp: 260 },
  wall: { hp: 50, chance: 0.62 },
  patrolTank: {
    hp: 90, speed: 52, turn: 2.2, turretTurn: 4, idleTurretTurn: 2,
    sight: 270, range: 205, holdDist: 150, leash: 13 * 32,
    rate: 1.5, dmg: 16, shellSpeed: 240, life: 0.9, muzzle: 20, aimTol: 0.15,
    wanderMin: 3, wanderVar: 4, wanderBox: 10 * 32, radius: 12,
  },
  drone: {
    hp: 24, speed: 140, idleSpeed: 60, turn: 3, holdDist: 110, range: 210,
    rate: 0.5, dmg: 4, bulletSpeed: 330, life: 0.7, aimTol: 0.3,
    firstDelay: 5, interval: 11, maxAlive: 2,
  },
} as const;

export const PROJECTILE = {
  hitRadius: 14,
  /** Vertical speed limit when a projectile drifts to its target height. */
  climb: 120,
} as const;

/** Heights (render hints carried in projectiles; the sim itself is 2D). */
export const HEIGHT = {
  ground: 6,
  fly: 60,
} as const;

/** Whether the jeep is the only vehicle allowed to carry a flag. */
export const FLAG_CARRIERS: readonly VehicleType[] = ['jeep'];
