/**
 * Hands, melds, winning shapes and legal moves.
 *
 * A "meld" is a set shown face up on the table after claiming a tile:
 * - chow 上: three in a row of one suit (e.g. 3-4-5 dots)
 * - pong 碰: three the same
 * - gong 槓: four the same (can also be concealed, made from your own hand)
 *
 * A winning hand 胡 is 4 sets (chows or pongs/gongs) plus 1 pair, or the
 * special hand Thirteen Orphans 十三么.
 */
import {
  NORMAL_TYPES,
  NormalType,
  Tile,
  TileType,
  isFlower,
  isSuited,
  typeIndex,
} from './tiles.js';
import { SEATS } from './wall.js';

export type MeldKind = 'chow' | 'pong' | 'gong';

export interface Meld {
  kind: MeldKind;
  tiles: Tile[];
  /** True only for a gong made entirely from the player's own hand. */
  concealed: boolean;
  /** Seat the claimed tile came from (undefined for a concealed gong). */
  claimedFrom?: number;
}

/** One way to split a hand into sets plus a pair. Types are NORMAL_TYPES indexes. */
export interface Decomposition {
  pair: number;
  /** Sets found in the hidden tiles. `start` is the lowest tile of a chow. */
  sets: { kind: 'chow' | 'pong'; start: number }[];
}

export const THIRTEEN_ORPHANS: readonly NormalType[] = [
  'm1', 'm9', 'p1', 'p9', 's1', 's9', 'wE', 'wS', 'wW', 'wN', 'dR', 'dG', 'dW',
];

function countTypes(tiles: readonly (Tile | TileType)[]): number[] {
  const counts = new Array<number>(NORMAL_TYPES.length).fill(0);
  for (const t of tiles) {
    const type = typeof t === 'string' ? t : t.type;
    if (isFlower(type)) throw new Error('Flowers cannot be part of a hand.');
    counts[typeIndex(type)]!++;
  }
  return counts;
}

/** A chow can start at index i if i is a suited tile ranked 1 to 7. */
function chowCanStartAt(i: number): boolean {
  return i < 27 && i % 9 <= 6;
}

/** Find every way to split `counts` into `setsNeeded` sets plus one pair. */
function decompose(counts: number[], setsNeeded: number): Decomposition[] {
  const results: Decomposition[] = [];
  const sets: Decomposition['sets'] = [];

  const findSets = (pair: number): void => {
    const i = counts.findIndex((c) => c > 0);
    if (i === -1) {
      if (sets.length === setsNeeded) results.push({ pair, sets: sets.slice() });
      return;
    }
    if (counts[i]! >= 3) {
      counts[i]! -= 3;
      sets.push({ kind: 'pong', start: i });
      findSets(pair);
      sets.pop();
      counts[i]! += 3;
    }
    if (chowCanStartAt(i) && counts[i + 1]! > 0 && counts[i + 2]! > 0) {
      counts[i]!--; counts[i + 1]!--; counts[i + 2]!--;
      sets.push({ kind: 'chow', start: i });
      findSets(pair);
      sets.pop();
      counts[i]!++; counts[i + 1]!++; counts[i + 2]!++;
    }
  };

  for (let p = 0; p < counts.length; p++) {
    if (counts[p]! >= 2) {
      counts[p]! -= 2;
      findSets(p);
      counts[p]! += 2;
    }
  }
  return results;
}

export interface WinShape {
  /** 'standard' = 4 sets + pair. 'thirteenOrphans' = 十三么. */
  kind: 'standard' | 'thirteenOrphans';
  /** All ways the hidden tiles split up (standard only). Scoring picks the best. */
  decompositions: Decomposition[];
}

/**
 * Is this a winning hand? `hidden` must include the winning tile.
 * Returns null if it is not a win.
 */
export function findWinShape(hidden: readonly (Tile | TileType)[], melds: readonly Meld[]): WinShape | null {
  const setsNeeded = 4 - melds.length;
  if (hidden.length !== setsNeeded * 3 + 2) return null;
  const counts = countTypes(hidden);

  if (melds.length === 0 && THIRTEEN_ORPHANS.every((t) => counts[typeIndex(t)]! >= 1)) {
    return { kind: 'thirteenOrphans', decompositions: [] };
  }
  const decompositions = decompose(counts, setsNeeded);
  return decompositions.length > 0 ? { kind: 'standard', decompositions } : null;
}

// ---------- Legal moves ----------

/** Only the next player in turn order may chow 上 a discard. */
export function mayChowFrom(discarder: number, claimer: number): boolean {
  return claimer === (discarder + 1) % SEATS;
}

/**
 * Ways to chow 上 the discarded tile. Each option is the two tile types from
 * the hand that would join it (e.g. discard 5 dots → [p3,p4], [p4,p6], [p6,p7]).
 */
export function chowOptions(hidden: readonly Tile[], discard: TileType): [NormalType, NormalType][] {
  if (!isSuited(discard)) return [];
  const have = new Set(hidden.map((t) => t.type));
  const suit = discard[0]!;
  const rank = Number(discard[1]);
  const options: [NormalType, NormalType][] = [];
  for (const [a, b] of [[-2, -1], [-1, 1], [1, 2]] as const) {
    const ra = rank + a;
    const rb = rank + b;
    if (ra < 1 || rb > 9) continue;
    const ta = `${suit}${ra}` as NormalType;
    const tb = `${suit}${rb}` as NormalType;
    if (have.has(ta) && have.has(tb)) options.push([ta, tb]);
  }
  return options;
}

function countOf(hidden: readonly Tile[], type: TileType): number {
  return hidden.filter((t) => t.type === type).length;
}

/** Pong 碰 a discard: need two of the same in hand. */
export function canPong(hidden: readonly Tile[], discard: TileType): boolean {
  return !isFlower(discard) && countOf(hidden, discard) >= 2;
}

/** Gong 槓 a discard: need three of the same in hand. */
export function canGongDiscard(hidden: readonly Tile[], discard: TileType): boolean {
  return !isFlower(discard) && countOf(hidden, discard) >= 3;
}

/** On your own turn: types you hold all four of (concealed gong). */
export function concealedGongOptions(hidden: readonly Tile[]): NormalType[] {
  return NORMAL_TYPES.filter((type) => countOf(hidden, type) === 4);
}

/** On your own turn: shown pongs you can turn into a gong with a tile in hand. */
export function addedGongOptions(hidden: readonly Tile[], melds: readonly Meld[]): NormalType[] {
  return melds
    .filter((m) => m.kind === 'pong' && countOf(hidden, m.tiles[0]!.type) >= 1)
    .map((m) => m.tiles[0]!.type as NormalType);
}

/** Win 胡 by claiming a discard (or robbing a gong). */
export function canWinWith(hidden: readonly Tile[], melds: readonly Meld[], tile: TileType): boolean {
  if (isFlower(tile)) return false;
  return findWinShape([...hidden, tile], melds) !== null;
}

/** Win 胡 by self-draw: the drawn tile is already in `hidden`. */
export function canWinSelfDraw(hidden: readonly Tile[], melds: readonly Meld[]): boolean {
  return findWinShape(hidden, melds) !== null;
}

/**
 * Several players want to win 胡 on the same discard. Standard HK
 * "stealing the win" 截糊: only the player nearest in turn order after the
 * discarder wins. Returns that seat, or null if nobody claimed.
 */
export function resolveWinClaims(discarder: number, claimers: readonly number[]): number | null {
  for (let step = 1; step < SEATS; step++) {
    const seat = (discarder + step) % SEATS;
    if (claimers.includes(seat)) return seat;
  }
  return null;
}
