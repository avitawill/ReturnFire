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

## Milestone 2: render and controls

**Rendering split.** `src/render` builds its scene from a `GameState` once, then reads positions each frame
and reacts to sim events (`treeCrushed`, `structureDestroyed`, `explosion`, ...) for discrete changes.
It never writes to the state. Effects use `Math.random`; they are not part of the deterministic sim.

**Terrain** is a heightfield with two vertices per tile edge. Heights come from distance to the shore
(land rises over two tiles, sea deepens over four), blurred near the coast so shorelines are curves
rather than tile steps. Sand is coloured by height, not by tile, for the same reason. Roads, pads and
the ground under structures stay exactly at deck height. The terrain and trees are split into 16×16-tile
chunks so off-screen parts are frustum-culled; trees in a chunk are one merged mesh, rebuilt when one
is crushed.

**Camera.** Same tilt and distances as the prototype (elevation 0.7, distance 480–1100 depending on
aspect ratio), with the heading fixed north-up in play. Portrait screens get a slightly closer camera
(half-width 170 instead of 200 world units) so vehicles are not tiny on phones. The camera only orbits
on the start and victory screens.

**Single player pauses while choosing a vehicle**, as the prototype did. (Split screen will not pause.)

**Input.** Keyboard: arrows or WASD, Space/J fire, M/E/K mine, Escape/P pause. Gamepad (standard
mapping): left stick or D-pad, A/RT/RB fire, B/X/LT/LB mine, Start pause; it also navigates the bay.
Touch: drag on the left 60 % of the view for a floating stick; fire and mine buttons on the right.
On-screen buttons are shown only on coarse-pointer devices or after a touch.

**Quality presets** (selectable with `?quality=low|medium|high`, menu setting in milestone 5):
high = 2048 shadow map, DPR ≤ 2, explosion lights; medium = 1024 shadow map, DPR ≤ 1.5 (default on touch
devices); low = no shadows, no explosion lights, DPR 1, half the particles. Three.js r187 dropped
`PCFSoftShadowMap`; PCF with a blur radius is used instead.

**Performance could not be measured on a real GPU here.** The container has no GPU; Chromium renders
with SwiftShader on the CPU, which manages 3–11 fps for this scene regardless of optimisation (it is
fill-rate bound). What can be measured is main-thread cost: about 4–5 ms per frame on desktop, 10 ms
under 4× CPU throttle with mobile emulation (6 ms on low), at ~80 draw calls and ~80k triangles
including the shadow pass. That leaves headroom for 30 fps throttled, but the 60 fps and 30 fps targets
still need confirming on hardware: run `node scripts/perf.mjs <url> [throttle] [mobile]` against
`npm run preview` on a machine with a GPU.

## Milestone 3: models, effects, audio

**Models are procedural glTF.** The brief allows CC0 packs or procedural models. Kenney and Quaternius
were not reachable from the build environment, and one consistent style beats a mix of packs, so every
model is defined in `src/render/modeldefs.ts`, exported by `npm run models` (a ~150-line GLB writer in
`scripts/glb.ts`, no new dependencies) to `public/models/models.glb`, and loaded at startup with
Three's GLTFLoader. Parts that move are separate named nodes (`turret`, `rotor`, `tailRotor`, `head`).
Team colours and wrecks are baked as variants (`tank.0`, `tank.1`, `tank.wreck`, ...) because vertex
colours are cheaper than per-instance materials. GLTFLoader renames repeated node names (`base_1`),
so lookups match by prefix.

**Music.** Recordings are used where a public-domain or CC0 *recording* could be verified and
downloaded: helicopter (Valkyries, Edison 1921) and jeep (Bumblebee, US Air Force Band). Wikimedia's
rate limiting stopped the Mars and Mountain King downloads; both have verified candidates listed in
ASSETS.md, and until they are added the tank and launcher play the prototype's synthesised arrangements.
Recordings loop; synthesised tunes loop (Mountain King speeds up each pass, as in the prototype).
Music starts when a vehicle launches and stops when it docks, is lost, or the game ends.

**Sound effects are synthesised** (no sample files) and attenuated by distance from the nearest
player's camera; machine-gun sounds are rate-limited so a long burst does not saturate the mix.

**One mute control.** Everything (effects, music, laugh) goes through one master gain; the sound
button in the bay sets it to zero. The choice is remembered in `localStorage`.

**Skull.** As in the prototype: when a vehicle is lost the wreck burns for 1.5 s, then the skull
laughs for about 3 s (tap to skip after 0.6 s) before the bay opens. On defeat the skull stays behind
the end screen. On victory, fireworks go off over the winner's pad for 12 s.

**Tower collapse:** the tower sinks and tilts over 1.25 s while the sim slows to 30 % for a second
(single player), with debris, a ring of dust, fire and smoke for 14 s, a scorch mark and rubble.
