// Map layouts. Every layout is written from side 0's point of view (the west
// base). Side 1 gets the point reflection through the map centre, so both sides
// play the same island. Islands are listed for the whole map; the generator
// computes the west half and mirrors it.

export interface IslandDef {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Wobble phase. Use the same phase for an island and its mirror. */
  ph: number;
}

export interface MapDef {
  name: string;
  W: number;
  H: number;
  islands: IslandDef[];
  /** Inclusive tile rectangles [x0, y0, x1, y1]; each is mirrored automatically. */
  roads: [number, number, number, number][];
  /** Side 0 layout in tile coordinates. Side 1 is mirrored. */
  bunker: [number, number];
  /** Top-left tile of the 2x2 landing pad. */
  pad: [number, number];
  guards: [number, number][];
  /** Six flag towers (2x2). Each gets two turrets and a partial wall ring. */
  towers: [number, number][];
  turrets: [number, number][];
  aa: [number, number][];
  patrolTanks: [number, number][];
  treeDensity: number;
}

/**
 * "Two Shores": the prototype's archipelago made symmetric. The east island
 * keeps the prototype's tower positions; the west island mirrors them.
 */
export const TWO_SHORES: MapDef = {
  name: 'twoShores',
  W: 96,
  H: 56,
  islands: [
    { cx: 15, cy: 28, rx: 13, ry: 16, ph: 0.7 },
    { cx: 80, cy: 27, rx: 13, ry: 16, ph: 0.7 },
    { cx: 46, cy: 16, rx: 11, ry: 7, ph: 2.1 },
    { cx: 49, cy: 39, rx: 11, ry: 7, ph: 2.1 },
  ],
  roads: [
    [15, 16, 80, 17],
    [15, 16, 16, 39],
    [9, 27, 16, 28],
  ],
  bunker: [7, 27],
  pad: [10, 27],
  guards: [[9, 24], [9, 31]],
  towers: [[23, 32], [7, 35], [5, 20], [9, 16], [22, 20], [21, 26]],
  turrets: [[22, 41], [22, 36], [22, 13], [24, 16], [51, 42], [54, 36]],
  aa: [[19, 30], [11, 33], [19, 23], [45, 43]],
  patrolTanks: [[49, 36], [20, 37], [12, 22], [19, 25], [20, 14]],
  treeDensity: 0.085,
};

/**
 * "The Strait": two long islands facing each other across a chain of islets,
 * joined by a single causeway through the middle. Everything funnels into it.
 */
export const STRAIT: MapDef = {
  name: 'strait',
  W: 96,
  H: 56,
  islands: [
    { cx: 13, cy: 28, rx: 11, ry: 20, ph: 1.3 },
    { cx: 82, cy: 27, rx: 11, ry: 20, ph: 1.3 },
    { cx: 32, cy: 27, rx: 6, ry: 5, ph: 0.4 },
    { cx: 63, cy: 28, rx: 6, ry: 5, ph: 0.4 },
    { cx: 47, cy: 27, rx: 5, ry: 8, ph: 2.6 },
    { cx: 48, cy: 28, rx: 5, ry: 8, ph: 2.6 },
  ],
  roads: [
    [12, 27, 48, 28],
    [12, 12, 13, 43],
  ],
  bunker: [4, 27],
  pad: [8, 27],
  guards: [[6, 24], [6, 31]],
  towers: [[18, 14], [8, 18], [18, 22], [17, 33], [7, 38], [18, 41]],
  turrets: [[29, 24], [30, 31], [44, 22], [21, 27], [22, 30]],
  aa: [[16, 25], [9, 33], [33, 29], [21, 38]],
  patrolTanks: [[31, 27], [17, 18], [17, 37], [8, 23]],
  treeDensity: 0.07,
};

/**
 * "The Atoll": bases in opposite corners of a ring of islands around a big
 * central island. The road zig-zags through the centre; the long way round
 * is by sea, which only the jeep (and the helicopter) can take.
 */
export const ATOLL: MapDef = {
  name: 'atoll',
  W: 96,
  H: 56,
  islands: [
    { cx: 15, cy: 15, rx: 12, ry: 11, ph: 0.9 },
    { cx: 80, cy: 40, rx: 12, ry: 11, ph: 0.9 },
    { cx: 47, cy: 27, rx: 13, ry: 10, ph: 1.7 },
    { cx: 48, cy: 28, rx: 13, ry: 10, ph: 1.7 },
    { cx: 14, cy: 42, rx: 7, ry: 6, ph: 0.2 },
    { cx: 81, cy: 13, rx: 7, ry: 6, ph: 0.2 },
  ],
  roads: [
    [14, 15, 48, 16],
    [47, 15, 48, 28],
    [14, 15, 15, 42],
    [9, 14, 15, 15],
  ],
  bunker: [5, 13],
  pad: [9, 14],
  guards: [[7, 11], [7, 18]],
  towers: [[20, 7], [6, 19], [21, 20], [24, 12], [11, 41], [17, 44]],
  turrets: [[36, 13], [36, 19], [42, 23], [12, 22], [27, 17]],
  aa: [[18, 11], [10, 9], [39, 24], [16, 39]],
  patrolTanks: [[41, 18], [19, 17], [11, 21], [14, 39]],
  treeDensity: 0.09,
};

export const MAPS: Record<string, MapDef> = {
  [TWO_SHORES.name]: TWO_SHORES,
  [STRAIT.name]: STRAIT,
  [ATOLL.name]: ATOLL,
};

export const MAP_NAMES = ['twoShores', 'strait', 'atoll'] as const;
