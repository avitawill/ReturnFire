# Assets

Every file shipped in `public/` and `src/assets/` is listed here with its source and licence.
`tests/assets.test.ts` fails if a file is missing from this table.

| File | What | Source | Licence |
|---|---|---|---|
| `public/models/models.glb` | All vehicle, structure and tree models (28 low-poly models, vertex-coloured) | Original, generated procedurally by `npm run models` from `src/render/modeldefs.ts` | CC0 (made for this project) |
| `public/audio/valkyries.mp3` | Helicopter theme: Wagner, *Ride of the Valkyries*; American Symphony Orchestra, Edison Records Diamond Disc 80638-R, 1921 | [Wikimedia Commons: Richard Wagner - Ride of the Valkyries.ogg](https://commons.wikimedia.org/wiki/File:Richard_Wagner_-_Ride_of_the_Valkyries.ogg) (from the US National Park Service, Thomas Edison NHP) | Public domain (composition: Wagner d. 1883; recording: pre-1923 US sound recording, `PD-Edison Records`) |
| `public/audio/bumblebee.mp3` | Jeep theme: Rimsky-Korsakov, *Flight of the Bumblebee*; US Air Force Band of the Rockies Concert Band, arr. Gary Poffenbarger, 2007 | [Wikimedia Commons: Flight of the Bumblebee - Concert Band - United States Air Force Band of the Rockies.mp3](https://commons.wikimedia.org/wiki/File:Flight_of_the_Bumblebee_-_Concert_Band_-_United_States_Air_Force_Band_of_the_Rockies.mp3) | Public domain (composition: d. 1908; arrangement, performance and recording: US federal government work, `PD-USGov-Military-Air Force`) |
| `public/icons/icon.svg` | App icon (vector source) | Original, drawn for this project | CC0 (made for this project) |
| `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon.png` | App icon at install sizes | Rendered from `icon.svg` by `scripts/make-icons.mjs` | CC0 (made for this project) |
| `public/manifest.webmanifest` | Web app manifest (name, icons, colours) for installing the game | Written for this project | CC0 (made for this project) |
| `src/assets/fonts/heebo-hebrew.woff2`, `src/assets/fonts/heebo-latin.woff2` | Heebo (UI text), Hebrew and Latin subsets | [Google Fonts: Heebo](https://fonts.google.com/specimen/Heebo) | SIL Open Font License 1.1 |
| `src/assets/fonts/secular-one-hebrew.woff2`, `src/assets/fonts/secular-one-latin.woff2` | Secular One (headings), Hebrew and Latin subsets | [Google Fonts: Secular One](https://fonts.google.com/specimen/Secular+One) | SIL Open Font License 1.1 |

Recordings were re-encoded with `scripts/encode-music.sh` (mono, loudness-normalised, 64 kbps MP3, short fades).
Licences were checked on each file's Commons page for the *recording*, not only the composition.

## Not files

- **Sound effects** (guns, shells, rockets, explosions, splash, alarm, chimes) are synthesised at runtime in `src/audio/synth.ts`.
- **The skull's laugh** is an original synthesis (`src/audio/laugh.ts`): a deep "mwah... ha-ha-ha... haaa" built from a buzzy glottal source with a growl an octave below, vowel formants, breathy onsets, light saturation, an echo and a generated reverb. The skull's jaw follows the same syllable timeline. `docs/laugh-preview.wav` is a rendering of it for listening (`scripts/render-laugh.mjs`).
- **Tank and launcher themes** (Holst, *Mars*; Grieg, *In the Hall of the Mountain King*) fall back to the prototype's synthesised arrangements of the public-domain compositions (`TUNES` in `src/audio/synth.ts`) because no recording is shipped yet. Verified candidates: [Holst, The Planets - Mars (Skidmore College Orchestra, CC0)](https://commons.wikimedia.org/wiki/File:Holst,_The_Planets,_Op._32_-_I._Mars,_the_Bringer_of_War.ogg) and [Musopen - In the Hall Of The Mountain King (Musopen Symphony Orchestra, public domain)](https://commons.wikimedia.org/wiki/File:Musopen_-_In_the_Hall_Of_The_Mountain_King.ogg). To add one: download it, run `scripts/encode-music.sh <file> public/audio/<name>.mp3`, add it to `MUSIC_FILES` in `src/audio/audio.ts` and a row here.
- The rejected Mars recording by the US Air Force Band (`Holst- mars.ogg`) is a transcription by a civilian arranger whose copyright status is unclear, so it was not used.
- Textures (sea normal map) are generated in code.
