# מבצע דגל (Operation Flag)

A top-down 3D capture-the-flag vehicle game for the browser, in the spirit of *Return Fire* (1995).
Original name, models, maps and sound. Hebrew, right-to-left UI.

Each side hides its flag in one of six towers on its island. Blow towers open until the enemy flag is
exposed, fetch it with a jeep (the only vehicle that can carry it) and bring it back to your bunker.
Each side has a limited stock of helicopters, tanks, rocket launchers and jeeps; docking at the bunker
repairs a vehicle and returns it to stock. Lose your last jeep and you lose the war.

Play against the AI (easy / medium / hard), split-screen against a friend, or online by room code.
Seven hand-made maps plus random ones. Installable on Windows, Android and iPhone; works offline.

## Run it

```sh
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # static site in dist/, works offline and from any subfolder
npm run preview      # serve dist/ at http://127.0.0.1:4173
```

Node 20+ is needed. The build has no server component; copy `dist/` anywhere.

## Install it (for players)

Open **https://avitawill.github.io/ReturnFire/** (once GitHub Pages is switched on, see below).

- **Windows (Chrome or Edge):** press **התקנת המשחק** in the main menu, or the install icon at the right of
  the address bar. The game gets a Start-menu and desktop icon, opens in its own window, and works offline.
- **Android (Chrome):** the same button, or menu ⋮ > *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari):** Share button > *Add to Home Screen*.

Updates arrive by themselves: the next time the game is opened online it fetches the new version.

## Play online

One player chooses **משחק ברשת** > **יצירת חדר** and sends the four-letter code to the other, who types
it under **הצטרפות**. The map is whatever the room's creator picked in the main menu. Both machines run
the same deterministic game and only exchange inputs, so it works fine on ordinary home connections.

This needs the small relay server in `server/relay.mjs` running somewhere reachable. One-time setup:

1. On [render.com](https://render.com) (free plan): *New +* > *Blueprint* > choose this repository >
   *Apply*. It reads `render.yaml` and starts the relay. Note its address, e.g.
   `https://mivtza-relay.onrender.com`.
2. In this GitHub repository: *Settings* > *Secrets and variables* > *Actions* > *Variables* >
   *New repository variable*: name `RELAY_URL`, value `wss://mivtza-relay.onrender.com`
   (`wss://`, not `https://`). Then re-run the *Publish game* workflow.

Without step 2 players can paste the relay address under *כתובת שרת* on the online screen.
Render's free plan sleeps after 15 minutes without players; the first connection then takes up to a
minute while it wakes. Any host that runs Node 18+ and allows WebSockets works too
(`PORT=8787 node server/relay.mjs`; set `ALLOWED_ORIGINS` to the game's address).

For local testing: `npm run relay` and `npm run dev`; the game finds a relay on port 8787 of the same
machine by default.

## Publish to GitHub Pages (one time)

The workflow `.github/workflows/pages.yml` tests, builds and publishes on every push. GitHub only needs
to be told to accept it: repository *Settings* > *Pages* > *Build and deployment* > *Source*:
**GitHub Actions**. Then re-run the latest *Publish game* run (or push any commit).

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

1. **Online polish:** reconnect after a dropped connection, a chat/emote line, and a rematch button that
   keeps the room. **Add the two missing recordings.** Holst's *Mars* and Grieg's *Mountain King* have verified CC0/PD
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
5. **Native Windows installer** (Electron or Tauri) if the installable web app turns out not to be enough.
6. **Fog of war** on the minimap, so scouting with the helicopter matters.
7. **More hand-made maps** and a map preview in the menu; random maps could vary tower density and add
   lakes and cliffs.
8. **Accessibility:** remappable keys, a colour-blind palette for the two sides, and screen-reader
   announcements for the most important events.
