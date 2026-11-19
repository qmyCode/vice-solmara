// rng.js — one job: deterministic randomness. A seeded mulberry32 generator plus the small
// helpers every other module shares, so the whole city is identical on every load for a seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  /** Float in [0, 1). */
  f() { return this.next(); }
  /** Float in [min, max). */
  range(min, max) { return min + this.next() * (max - min); }
  /** Integer in [min, max] inclusive. */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  /** True with probability p. */
  chance(p) { return this.next() < p; }
  /** A random element of arr. */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** A new array with arr's elements shuffled. */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Shortest signed angular difference from a to b, in radians. */
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dist2d = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
