/**
 * Sorting a hand the way Kyle wants it shown (left to right):
 * 1. The three suits. The suit you hold the FEWEST of is on the left, the one you
 *    hold the MOST of on the right (ties: characters, dots, bamboo). Each suit 1 → 9.
 * 2. Winds: East, South, West, North.
 * 3. Dragons on the far right: the dragon you hold the fewest of first, the most
 *    of last (ties: 中 red, 發 green, 白 white).
 * Flowers (if any are passed in) go last.
 */
import { DRAGONS, SUITS, Tile, TileType, WINDS, isFlower } from './tiles.js';

export function sortHand<T extends { type: TileType; id: number }>(tiles: readonly T[]): T[] {
  const count = (pred: (t: T) => boolean): number => tiles.filter(pred).length;
  const suitOrder = [...SUITS].sort(
    (a, b) => count((t) => t.type[0] === a && t.type.length === 2 && /\d/.test(t.type[1]!)) -
      count((t) => t.type[0] === b && t.type.length === 2 && /\d/.test(t.type[1]!)) ||
      SUITS.indexOf(a) - SUITS.indexOf(b),
  );
  const dragonOrder = [...DRAGONS].sort(
    (a, b) => count((t) => t.type === a) - count((t) => t.type === b) || DRAGONS.indexOf(a) - DRAGONS.indexOf(b),
  );
  const rank = (t: T): number => {
    const type = t.type;
    if (isFlower(type)) return 1000 + type.charCodeAt(0) * 10 + Number(type[1]);
    const w = (WINDS as readonly string[]).indexOf(type);
    if (w >= 0) return 300 + w;
    const d = (dragonOrder as readonly string[]).indexOf(type);
    if (d >= 0) return 400 + d;
    const s = suitOrder.indexOf(type[0] as (typeof SUITS)[number]);
    return s * 10 + Number(type[1]);
  };
  return [...tiles].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

export type { Tile };
