/**
 * Randomness. A "random number generator" (RNG) is any function that returns
 * a number from 0 (included) up to 1 (not included), like Math.random.
 *
 * Tests pass in a "seeded" RNG, which gives the same numbers every time, so a
 * test always sees the same shuffle.
 */

export type Rng = () => number;

/** A small, fast seeded RNG (the "mulberry32" algorithm). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random whole number from 0 to max - 1. */
export function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

/**
 * Fair shuffle (Fisher-Yates). Returns a NEW array with the same items in a
 * random order. The original array is not changed, and no item is added or lost.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Roll three six-sided dice. */
export function rollDice(rng: Rng): [number, number, number] {
  return [1 + randomInt(rng, 6), 1 + randomInt(rng, 6), 1 + randomInt(rng, 6)];
}
