# מבצע דגל (Operation Flag)

A top-down 3D capture-the-flag vehicle game for the browser, in the spirit of *Return Fire* (1995).
Original name, models, maps and sound. Hebrew, right-to-left UI.

Each side hides its flag in one of six towers on its island. Blow towers open until the enemy flag is
exposed, fetch it with a jeep (the only vehicle that can carry it) and bring it back to your bunker.
Each side has a limited stock of helicopters, tanks, rocket launchers and jeeps; docking at the bunker
repairs a vehicle and returns it to stock. Lose your last jeep and you lose the war.

Play against the AI (easy / medium / hard) or split-screen against a friend.

## Run it

```sh
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # static site in dist/, works offline and from any subfolder
npm run preview      # serve dist/ at http://127.0.0.1:4173
```

Node 20+ is needed. The build has no server component; copy `dist/` anywhere.

## Controls

| | Player 1 (single player) | Split screen, no gamepads: P1 / P2 | Gamepad | Touch |
|---|---|---|---|---|
| Drive | Arrows or WASD | WASD / Arrows | Left stick or D-pad | Drag on the left of the screen |
| Fire | Space (or J) | F / Enter | A, RT or RB | **אש** button |
| Mine (launcher) | M or E | G / . (period) | B, X, LT or LB | **מוקש** button |
| Pause | Esc or P | Esc / P | Start | — |

Driving is screen-relative: up is always north. Menus work with mouse, touch, Tab/Enter, or a gamepad
(stick or D-pad to move, A to choose, B to go back from pause).

**Split screen:** one keyboard plus one gamepad, or two gamepads (player 1 can also use the keyboard).
With no gamepads connected, both players share the keyboard using the split layout above.

## Vehicles

| | Armour | Speed | Notes |
|---|---|---|---|
| מסוק Helicopter | 60 | 200 | Flies over everything. 70 s of fuel; crashes when it runs out. Only target of anti-air sites. |
| טנק Tank | 160 | 82 | Turret aims itself. Best against structures. Sinks in water. |
| משגר Launcher | 200 | 62 | Homing rockets (ground and air, long range) and 5 mines. Sinks in water. |
| ג'יפ Jeep | 45 | 150 | The only flag carrier. Swims. Blocked by trees (heavier vehicles flatten them). |

## URL options

Useful for testing and sharing: `?map=twoShores|strait|atoll|random`, `?seed=123`,
`?difficulty=easy|medium|hard`, `?quality=low|medium|high`, `?play=1|2` (skip the menu),
`?speed=4` (faster simulation).

## Tests

```sh
npm test             # Vitest: headless simulation, AI, maps, assets (about 30 s)
npm run e2e          # builds, then Playwright: driving, models, music, split screen, subfolder deploy
npm run typecheck
```

Headless tools in `scripts/` (run with `npx vitest run --config scripts/vitest.scripts.ts <name>`):
`aimatch` plays AI matches and prints results (`P0=scripted P1=easy N=30 MAP=strait`),
`aitrace` prints a match's event log, `mapdump` prints a map as ASCII (`MAP=random SEED=5`).
`node scripts/perf.mjs <url> [cpuThrottle] [mobile]` measures frame rate and main-thread cost.
`npm run models` regenerates `public/models/models.glb` from `src/render/modeldefs.ts`.

## Layout

```
src/sim/      pure game logic: fixed 60 Hz step(state, intents, dt), seeded RNG, no DOM/WebGL
  ai/         AI commander and path following
  systems/    movement, combat, units, raids (alarm drones), rules
src/render/   Three.js scene built from sim state and events
src/audio/    Web Audio: synthesised effects, music channels, the skull's laugh
src/input/    keyboard, gamepad, touch -> one Intent per player
src/ui/       menus, HUD, minimap (plain DOM + CSS)
src/i18n/     all player-facing text (Hebrew)
```

See `DECISIONS.md` for the choices made along the way and `ASSETS.md` for asset sources and licences.

## What I would do next

1. **Add the two missing recordings.** Holst's *Mars* and Grieg's *Mountain King* have verified CC0/PD
   recordings on Wikimedia Commons (listed in `ASSETS.md`) but downloads were rate-limited; until then the
   tank and launcher play synthesised arrangements.
2. **Measure on real hardware.** The build environment had no GPU, so the 60 fps / 30 fps targets are only
   backed by CPU-side numbers (about 5 ms per frame on desktop, under 9 ms with 4× throttling on low).
   Profile on a mid-range laptop and a phone, then tune shadow-map size and tree density per preset.
3. **Make AI-vs-AI matches end by capture more often.** Most are decided when one side throws away its
   last jeep. Escorting the jeep, timing the run around the enemy's vehicle, and dodging drones would make
   the AI's endgame more interesting. A visible side-1 bias in AI-vs-AI (around 60–70 % on some maps)
   deserves a look.
4. **Render interpolation** between 60 Hz sim ticks for smoother motion on 120 Hz displays.
5. **Fog of war** on the minimap, so scouting with the helicopter matters.
6. **More hand-made maps** and a map preview in the menu; random maps could vary tower density and add
   lakes and cliffs.
7. **Accessibility:** remappable keys, a colour-blind palette for the two sides, and screen-reader
   announcements for the most important events.
