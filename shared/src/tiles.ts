/**
 * Tiles: the 34 normal tile types, the 8 flower tiles, and the full set.
 *
 * Every physical tile has a unique `id` (0, 1, 2, ...) so that two copies of
 * the same type (for example two "5 of dots") can always be told apart. This
 * is what lets us prove no tile is ever created or lost.
 */

export type Suit = 'm' | 'p' | 's'; // m = characters 萬, p = dots 筒, s = bamboo 索

export const SUITS: readonly Suit[] = ['m', 'p', 's'];

/** Winds: East, South, West, North. */
export const WINDS = ['wE', 'wS', 'wW', 'wN'] as const;
/** Dragons: Red 中, Green 發, White 白. */
export const DRAGONS = ['dR', 'dG', 'dW'] as const;
/** Flowers 梅蘭菊竹 (1-4) and seasons 春夏秋冬 (1-4). Each exists only once. */
export const FLOWERS = [
  'f1', 'f2', 'f3', 'f4', // plum, orchid, chrysanthemum, bamboo
  'n1', 'n2', 'n3', 'n4', // spring, summer, autumn, winter
] as const;

export type WindType = (typeof WINDS)[number];
export type DragonType = (typeof DRAGONS)[number];
export type FlowerType = (typeof FLOWERS)[number];
export type SuitedType = `${Suit}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type HonourType = WindType | DragonType;
/** One of the 34 normal tile types (everything except flowers). */
export type NormalType = SuitedType | HonourType;
export type TileType = NormalType | FlowerType;

/** One physical tile. */
export interface Tile {
  readonly id: number;
  readonly type: TileType;
}

/** The 34 normal tile types, in a fixed order. */
export const NORMAL_TYPES: readonly NormalType[] = [
  ...SUITS.flatMap((suit) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${suit}${n}` as SuitedType),
  ),
  ...WINDS,
  ...DRAGONS,
];

export const COPIES_PER_TYPE = 4;

/** Total tiles in a full set: 144 with flowers, 136 without. */
export function tileCount(flowersOn: boolean): number {
  return NORMAL_TYPES.length * COPIES_PER_TYPE + (flowersOn ? FLOWERS.length : 0);
}

export function isFlower(type: TileType): type is FlowerType {
  return (FLOWERS as readonly string[]).includes(type);
}

export function isSuited(type: TileType): type is SuitedType {
  return type.length === 2 && (SUITS as readonly string[]).includes(type[0]!) && /[1-9]/.test(type[1]!);
}

export function isHonour(type: TileType): type is HonourType {
  return (WINDS as readonly string[]).includes(type) || (DRAGONS as readonly string[]).includes(type);
}

export function suitOf(type: SuitedType): Suit {
  return type[0] as Suit;
}

export function rankOf(type: SuitedType): number {
  return Number(type[1]);
}

/** A "terminal" is a 1 or 9 of a suit. */
export function isTerminal(type: TileType): boolean {
  return isSuited(type) && (rankOf(type) === 1 || rankOf(type) === 9);
}

/** Index 0..33 of a normal type (used for fast counting). */
export function typeIndex(type: NormalType): number {
  const i = NORMAL_TYPES.indexOf(type);
  if (i < 0) throw new Error(`Not a normal tile type: ${type}`);
  return i;
}

/**
 * Build a brand new, unshuffled full set. This is the ONLY place tiles are
 * created. Ids run 0, 1, 2, ... in order.
 */
export function buildTileSet(flowersOn: boolean): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (const type of NORMAL_TYPES) {
    for (let copy = 0; copy < COPIES_PER_TYPE; copy++) tiles.push({ id: id++, type });
  }
  if (flowersOn) for (const type of FLOWERS) tiles.push({ id: id++, type });
  return tiles;
}

/**
 * Check that a group of tiles is exactly one complete, correct set.
 * Returns a list of problems; an empty list means everything is correct.
 */
export function checkTileSet(tiles: readonly Tile[], flowersOn: boolean): string[] {
  const problems: string[] = [];
  const expectedTotal = tileCount(flowersOn);
  if (tiles.length !== expectedTotal) {
    problems.push(`Expected ${expectedTotal} tiles but found ${tiles.length}.`);
  }

  const seenIds = new Set<number>();
  for (const t of tiles) {
    if (seenIds.has(t.id)) problems.push(`Tile id ${t.id} appears more than once.`);
    seenIds.add(t.id);
  }

  const counts = new Map<string, number>();
  for (const t of tiles) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);

  for (const type of NORMAL_TYPES) {
    const n = counts.get(type) ?? 0;
    if (n !== COPIES_PER_TYPE) problems.push(`Expected ${COPIES_PER_TYPE} of ${type} but found ${n}.`);
  }
  for (const type of FLOWERS) {
    const n = counts.get(type) ?? 0;
    const want = flowersOn ? 1 : 0;
    if (n !== want) problems.push(`Expected ${want} of ${type} but found ${n}.`);
  }
  for (const type of counts.keys()) {
    if (!(NORMAL_TYPES as readonly string[]).includes(type) && !(FLOWERS as readonly string[]).includes(type)) {
      problems.push(`Unknown tile type ${type}.`);
    }
  }
  return problems;
}

/** Like checkTileSet, but stops with an error if anything is wrong. */
export function assertTileSet(tiles: readonly Tile[], flowersOn: boolean): void {
  const problems = checkTileSet(tiles, flowersOn);
  if (problems.length > 0) {
    throw new Error(`Tile set is wrong:\n- ${problems.join('\n- ')}`);
  }
}
