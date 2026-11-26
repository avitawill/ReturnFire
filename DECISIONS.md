# Decisions

Where the brief or the prototype left a choice open, this records what was picked and why.
Rule of thumb from the brief: pick the option closest to the prototype.

## Milestone 1: simulation

**Symmetric map.** The prototype is one-sided: only the east island has flag towers, and the
player's flag sits next to the bunker for scripted raider jeeps to steal. The brief says each
side's flag is hidden in one of six towers and that the AI plays by the player's rules, so both
sides need the same assets. The map is generated for the west half and point-reflected through
the centre (tile `(x, y)` ↔ `(W-1-x, H-1-y)`), so the two bases are identical. The east island
keeps the prototype's tower positions; the west island mirrors them. Island outlines use
even-harmonic wobble so a reflected island lines up with its twin.

**Forward islands.** The prototype put enemy defences on both middle islands. Mirroring
that would stack both sides' guns on both islands, so each side owns one: the north island
belongs to the east side (as in the prototype), the south island to the west side.

**Raids become the opponent.** The prototype's timed raider jeep (`raidT`) is removed from the
rules; the AI commander (milestone 4) replaces it, using the same stock and vehicles as a human.
`systems/raids.ts` keeps the prototype's alarm response: once a flag is taken, the owner's
bunker scrambles up to two drones every 11 s (first after 5 s).

**Who shoots whom.** The prototype's defences only ever had one target (the player). Now:
- Gun turrets: the enemy's commander vehicle (ground or air) and enemy drones.
- Bunker guards (indestructible, the prototype's friendly turrets): any enemy vehicle or unit.
- AA sites: enemy helicopters only.
- Patrol tanks: the enemy's ground vehicle, within their leash (13 tiles from home).
- Drones: the enemy's commander vehicle.
Defences never fight other defences, so the map does not grind itself down with nobody playing.

**What projectiles hit.** As in the prototype, shots from defences do not collide with structures,
and shots from vehicles do. Vehicle shots only hit *enemy* structures and pass over your own
(the prototype player never had walls of their own to worry about).

**Mines** go off under enemy ground vehicles and enemy patrol tanks (prototype: enemy tanks only,
because there was no other enemy ground unit).

**Flags.** A flag revealed by a destroyed tower lies on the ground where the tower stood. If its
carrier is destroyed on land the flag drops there; at sea it returns to the tower site (prototype
behaviour). There is no "return your own flag" action; defending means killing the carrier.

**Defeat.** You lose when the enemy docks with your flag, or when your last jeep is lost with none in
stock (prototype: "no jeeps left, nobody can carry the flag").

**Respawn delay.** 1.5 s after a vehicle is destroyed, 0.75 s after one sinks (prototype: 1.5 s and 0.7 s).

**Turrets need land.** A few prototype turret slots fall in the sea on the mirrored map; turret and AA
placements now require land and are skipped otherwise (the prototype silently turned sea under a
turret into grass).

**Slow motion** on tower collapse (`slowT`) is presentation, not simulation; the sim always runs at a
fixed 60 Hz. The client may slow its own clock in single-player.

**Fixed step.** `step(state, intents, dt)` throws unless `dt` is the fixed 1/60 s, so a caller cannot
silently break determinism. Side 0 and side 1 alternate who acts first each tick so neither has a
systematic edge.

**Unchanged from the prototype:** fuel burns while idle; vehicles do not collide with each other;
heavy vehicles flatten trees (even on a blocked move); the jeep is blocked by trees and swims at 45 %
speed; ground vehicles other than the jeep start sinking as soon as their centre is over water.

**Pathfinding.** A* on the tile grid, 8-way, no corner cutting. If no open route exists (flag towers
are often fully walled in), the planner retries treating enemy destructible structures as passable at
a high cost and reports which structure blocks the next step, so the driver can shoot through it.

**TypeScript 5.9**, not 7.0: 7.0 is the new native compiler and the Vite/Vitest toolchain is
validated against 5.x. Revisit later.
