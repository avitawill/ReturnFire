export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Signed shortest difference a - b, in (-PI, PI]. */
export function adiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Rotate `a` toward `target` by at most `rate * dt`. */
export const turnToward = (a: number, target: number, maxStep: number) => a + clamp(adiff(target, a), -maxStep, maxStep);
