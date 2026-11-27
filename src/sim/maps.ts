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
  /** Water cut out of the islands (same shape rules as islands). */
  lakes?: IslandDef[];
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

/**
 * "The Lagoon": one long landmass around a central lagoon. Tanks can drive
 * all the way round, north or south; there is no sea to hide behind.
 */
export const LAGOON: MapDef = {
  name: 'lagoon',
  W: 96,
  H: 56,
  islands: [
    { cx: 48, cy: 28, rx: 44, ry: 20, ph: 0.5 },
    { cx: 13, cy: 28, rx: 12, ry: 17, ph: 1.2 },
  ],
  lakes: [
    { cx: 48, cy: 28, rx: 20, ry: 9, ph: 1.1 },
    { cx: 30, cy: 6, rx: 9, ry: 4, ph: 0.3 },
    { cx: 66, cy: 50, rx: 9, ry: 4, ph: 0.3 },
  ],
  roads: [
    [12, 14, 48, 15],
    [12, 14, 13, 41],
    [7, 27, 13, 28],
  ],
  bunker: [3, 27],
  pad: [6, 27],
  guards: [[5, 24], [5, 31]],
  towers: [[18, 9], [6, 17], [19, 21], [18, 33], [7, 38], [25, 42]],
  turrets: [[23, 13], [16, 18], [16, 37], [31, 41], [40, 12]],
  aa: [[9, 22], [22, 27], [12, 46]],
  patrolTanks: [[20, 27], [33, 12], [15, 45], [38, 16]],
  treeDensity: 0.1,
};

/**
 * "The Archipelago": a scatter of islets. Tanks have one way across, a long
 * bridge down the middle; jeeps that dare the open sea have many routes.
 */
export const ARCHIPELAGO: MapDef = {
  name: 'archipelago',
  W: 96,
  H: 56,
  islands: [
    { cx: 12, cy: 28, rx: 10, ry: 13, ph: 2.2 },
    { cx: 83, cy: 27, rx: 10, ry: 13, ph: 2.2 },
    { cx: 27, cy: 12, rx: 6, ry: 5, ph: 0.8 },
    { cx: 68, cy: 43, rx: 6, ry: 5, ph: 0.8 },
    { cx: 28, cy: 44, rx: 5, ry: 5, ph: 1.6 },
    { cx: 67, cy: 11, rx: 5, ry: 5, ph: 1.6 },
    { cx: 40, cy: 22, rx: 5, ry: 4, ph: 2.9 },
    { cx: 55, cy: 33, rx: 5, ry: 4, ph: 2.9 },
    { cx: 46, cy: 8, rx: 4, ry: 3, ph: 0.1 },
    { cx: 49, cy: 47, rx: 4, ry: 3, ph: 0.1 },
  ],
  roads: [
    [12, 12, 13, 43],
    [12, 12, 48, 13],
    [47, 12, 48, 28],
    [12, 43, 28, 44],
    [6, 27, 13, 28],
  ],
  bunker: [3, 27],
  pad: [7, 27],
  guards: [[5, 24], [5, 31]],
  towers: [[16, 18], [6, 34], [17, 33], [25, 9], [27, 46], [39, 21]],
  turrets: [[24, 15], [30, 11], [26, 41], [42, 24], [18, 25]],
  aa: [[9, 21], [29, 47], [37, 19]],
  patrolTanks: [[16, 26], [28, 13], [40, 23], [27, 42]],
  treeDensity: 0.09,
};

/**
 * "The Canals": a wide plateau cut by two north-south canals. Each canal has
 * three crossings, so the front keeps shifting between them.
 */
export const CANALS: MapDef = {
  name: 'canals',
  W: 96,
  H: 56,
  islands: [{ cx: 48, cy: 28, rx: 46, ry: 21, ph: 1.9 }],
  lakes: [
    { cx: 32, cy: 28, rx: 2.4, ry: 30, ph: 0 },
    { cx: 63, cy: 27, rx: 2.4, ry: 30, ph: 0 },
    { cx: 48, cy: 4, rx: 10, ry: 4, ph: 0.6 },
  ],
  roads: [
    [11, 16, 48, 17],
    [11, 38, 48, 39],
    [11, 16, 12, 39],
    [26, 27, 48, 28],
    [6, 27, 11, 28],
  ],
  bunker: [2, 27],
  pad: [5, 27],
  guards: [[4, 24], [4, 31]],
  towers: [[17, 11], [5, 18], [17, 22], [18, 31], [6, 37], [20, 43]],
  turrets: [[28, 15], [28, 37], [28, 25], [21, 19], [40, 31]],
  aa: [[9, 22], [23, 33], [41, 22]],
  patrolTanks: [[22, 27], [38, 14], [38, 42], [15, 46]],
  treeDensity: 0.08,
};

/**
 * "The Two Rivers": the bases sit at the mouths of two rivers on a single
 * continent; the only way across each river is a long bridge, and the centre
 * is open ground with ruins of defences from an earlier war.
 */
export const RIVERS: MapDef = {
  name: 'rivers',
  W: 96,
  H: 56,
  islands: [{ cx: 48, cy: 28, rx: 47, ry: 24, ph: 2.7 }],
  lakes: [
    { cx: 25, cy: 8, rx: 3, ry: 18, ph: 0.4 },
    { cx: 70, cy: 47, rx: 3, ry: 18, ph: 0.4 },
    { cx: 28, cy: 34, rx: 4, ry: 6, ph: 1.4 },
    { cx: 67, cy: 21, rx: 4, ry: 6, ph: 1.4 },
  ],
  roads: [
    [12, 22, 48, 23],
    [12, 22, 13, 40],
    [7, 30, 13, 31],
    [12, 40, 40, 41],
  ],
  bunker: [3, 30],
  pad: [7, 30],
  guards: [[5, 27], [5, 34]],
  towers: [[17, 14], [6, 18], [18, 26], [18, 35], [7, 43], [33, 45]],
  turrets: [[22, 20], [22, 25], [20, 43], [37, 37], [44, 26]],
  aa: [[10, 25], [15, 46], [39, 43]],
  patrolTanks: [[30, 27], [17, 30], [26, 44], [42, 32]],
  treeDensity: 0.11,
};

export const MAPS: Record<string, MapDef> = {
  [TWO_SHORES.name]: TWO_SHORES,
  [STRAIT.name]: STRAIT,
  [ATOLL.name]: ATOLL,
  [LAGOON.name]: LAGOON,
  [ARCHIPELAGO.name]: ARCHIPELAGO,
  [CANALS.name]: CANALS,
  [RIVERS.name]: RIVERS,
};

export const MAP_NAMES = ['twoShores', 'strait', 'atoll', 'lagoon', 'archipelago', 'canals', 'rivers'] as const;
