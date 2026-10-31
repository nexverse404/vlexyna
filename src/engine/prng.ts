/** Deterministic PRNG (mulberry32) — same seed, same sequence, everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded helper for per-index stable pseudo-random values in [0,1). */
export function hash01(...vals: number[]): number {
  let h = 2166136261;
  for (const v of vals) {
    h ^= Math.imul(v | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
