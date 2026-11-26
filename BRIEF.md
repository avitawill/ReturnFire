# Brief for Claude Code: "Mivtza Degel" (Operation Flag)

A top-down 3D capture-the-flag vehicle game for the browser, in the spirit of Return Fire (1995). Original name, art, map and audio. Do not copy assets, samples or level layouts from the original game.

A working single-file prototype is in `prototype/mivtza-degel.html`. Read it first. It proves the game loop and the tuning numbers. It was written without ever being viewed in a browser, so treat its visuals and audio as unverified and its code structure as throwaway.

## Goal

Rebuild the prototype as a real project: typed, tested, visually verified, with proper models and sound, an AI opponent that plays the same game as the player, and local two-player split screen.

## Working rules

- Work milestone by milestone, in order. Commit at the end of each one. Do not start the next until the "done when" list passes.
- Look at what you build. After every visual change, run the game and take a screenshot (Playwright) at 1280x720 and at 390x844, and inspect it before moving on. This is the main thing the prototype lacked.
- Keep simulation and rendering separate. The simulation must run headless in Node with no DOM or WebGL.
- Ask before adding a dependency that is not listed below.
- All player-facing text is Hebrew, RTL, and lives in one file (`src/i18n/he.ts`). Code, comments and commits are English.
- When something is ambiguous, pick the option closest to the prototype's behaviour and note it in `DECISIONS.md`.

## Stack

- Vite + TypeScript (strict), Three.js (current stable from npm), no framework for the UI (plain DOM + CSS).
- Vitest for simulation tests, Playwright for screenshots and smoke tests.
- Audio through the Web Audio API directly.
- Output is a static site (`npm run build` produces `dist/`), playable offline.

## Architecture

```
src/
  sim/        pure game logic, fixed 60 Hz timestep, deterministic with a seeded RNG
    world.ts      map generation, tiles, heights, pathfinding grid
    entities.ts   vehicles, structures, projectiles, flags
    systems/      movement, combat, ai, raids, rules (win/lose)
    tuning.ts     every number that affects balance, in one place
  render/     Three.js scene built from sim state; never mutates sim
  audio/      music and effects, driven by sim events
  input/      keyboard, gamepad, touch; produces an Intent per player
  ui/         menus, HUD, minimap
  i18n/
```

The sim exposes `step(state, intents, dt)` and emits events (`shot`, `explosion`, `structureDestroyed`, `flagTaken`, ...). Render and audio subscribe to events; they do not poll for changes.

## Game rules (carry over from the prototype)

- Two bases on separate islands joined by bridges, with islands between them.
- Each side's flag is hidden in one of six flag towers. Destroy towers to reveal it. Only the jeep can carry a flag. Bring the enemy flag to your bunker to win.
- Four vehicles, limited stock, chosen at the bunker. Returning to the bunker repairs, refuels and returns the vehicle to stock.
  - Helicopter: fast, flies over everything, thin armour, little fuel.
  - Tank: turret aims on its own, strongest against structures.
  - Launcher: homing rockets against ground and air, lays mines.
  - Jeep: fast, weak, amphibious, the only flag carrier.
- Ground vehicles other than the jeep sink in water and are lost. A helicopter out of fuel crashes.
- Defences: gun turrets, anti-air launchers (target helicopters only), patrol tanks, walls.
- Everything except terrain is destructible. Trees are crushed by heavy vehicles.
- A laughing skull is shown when a vehicle is lost and on defeat.
- Each vehicle has its own classical theme while driving: Wagner's Ride of the Valkyries (helicopter), Holst's Mars (tank), Grieg's In the Hall of the Mountain King (launcher), Rimsky-Korsakov's Flight of the Bumblebee (jeep).

Starting values for speeds, armour, damage, ranges and stock are in the prototype's `V` table and enemy constants. Move them into `tuning.ts` unchanged, then tune.

## Milestones

### 1. Skeleton and headless sim
Port map generation, movement, collision, combat and win/lose rules into `src/sim`.
Done when:
- `npm test` runs a scripted full match headless (drive, shoot, destroy a tower, carry flag home) and asserts a win.
- Same seed and same inputs give byte-identical final state on two runs.
- No file in `src/sim` imports `three` or touches `window`/`document`.

### 2. Render and controls
Three.js scene: smooth terrain with sloped beaches, water, shadows, a tilted follow camera that keeps a fixed heading (screen-up is always north). Keyboard, gamepad and touch input (virtual stick left, fire/secondary right).
Done when:
- Screenshots at both sizes show terrain, water, the player vehicle and at least one enemy structure, with no z-fighting or missing shadows.
- A Playwright test drives the tank across the first bridge using keyboard input.
- 60 fps on a mid-range laptop; at least 30 fps under Chrome's 4x CPU throttle with mobile emulation.

### 3. Models, effects, audio
Replace primitive-box models with low-poly glTF models. Use CC0 packs (Kenney, Quaternius) or build them procedurally; record every source and licence in `ASSETS.md`. Explosions, debris, smoke, wrecks, scorch marks, tower collapse. Sound effects. Music: use public-domain or CC0 recordings of the four pieces (check Musopen and Wikimedia Commons, verify the licence of the specific recording, not just the composition) and fall back to the prototype's synthesised melodies when a recording is missing. The skull laugh must be an original recording or synthesis.
Done when:
- Every asset in `public/` has a row in `ASSETS.md` with source URL and licence.
- Screenshots of each of the four vehicles and of a tower collapsing look intentional at both sizes.
- Music switches with the vehicle and stops at the bunker; one mute control silences everything.

### 4. A real opponent
An AI commander that plays by the player's rules: limited stock, picks a vehicle for a purpose (scout with helicopter, breach with tank, grab with jeep), searches the player's towers, carries the flag home, and defends when its own flag is exposed. Ground units use A* on the tile grid. Three difficulty levels that change reaction time and aim, not rules.
Done when:
- Headless AI-versus-AI matches finish with a winner in under 15 simulated minutes in at least 9 of 10 seeds.
- On "hard" the AI beats a scripted do-nothing player every time; on "easy" a scripted competent player beats it at least 8 of 10 times.
- AI vehicles never get permanently stuck (test: no AI ground vehicle stays within one tile for 20 s while it has a destination).

### 5. Two players and polish
Local two-player split screen (keyboard + gamepad, or two gamepads), each half with its own camera, HUD and music. Start menu, pause, settings (difficulty, volume, graphics quality low/medium/high), end screens. Three hand-tuned maps plus seeded random maps.
Done when:
- A Playwright test completes a two-player match using two simulated inputs.
- Graphics "low" disables shadows and particles' lighting and holds 30 fps on the throttled mobile profile.
- A fresh clone runs with `npm install && npm run dev`, and `npm run build` output works when served from a subfolder.

## Out of scope for now

Online multiplayer, accounts, saving progress, level editor, monetisation.

## Deliverables at the end

`README.md` (how to run, controls), `DECISIONS.md`, `ASSETS.md`, passing `npm test` and `npm run e2e`, and a short list of what you would do next.
