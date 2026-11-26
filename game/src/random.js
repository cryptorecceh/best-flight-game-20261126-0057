// A small seeded random number generator (mulberry32): the same seed gives the same course,
// which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic 1-D value-noise helper built on the seeded generator: smooth rolling hills. */
export function makeNoise(random) {
  const knots = [];
  for (let i = 0; i < 64; i += 1) knots.push(random() * 2 - 1);
  return function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = knots[((i % 64) + 64) % 64];
    const b = knots[(((i + 1) % 64) + 64) % 64];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}
