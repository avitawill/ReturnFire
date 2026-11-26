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

export const MAPS: Record<string, MapDef> = {
  [TWO_SHORES.name]: TWO_SHORES,
};
