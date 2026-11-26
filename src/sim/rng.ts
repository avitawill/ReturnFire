// Mulberry32. The generator state lives inside GameState so that a saved state
// fully determines the future.

export interface RngHolder {
  rng: number;
}

export function rand(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [-0.5, 0.5). */
export function randCentered(h: RngHolder): number {
  return rand(h) - 0.5;
}

export function randInt(h: RngHolder, n: number): number {
  return Math.floor(rand(h) * n);
}

/** Standalone generator for setup code that does not have a GameState yet. */
export function makeRng(seed: number): RngHolder {
  return { rng: seed | 0 };
}
