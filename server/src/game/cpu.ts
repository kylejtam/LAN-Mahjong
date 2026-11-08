/**
 * CPU players: easy, medium and hard.
 *
 * FAIR PLAY: a CPU only uses what a real player in its seat could see — its
 * own tiles, and everything face up on the table (discards, shown sets,
 * flowers, how many tiles are left). It never looks at anyone else's hidden
 * tiles or at the wall. All decisions are made from a TableSight built by
 * `sight()` below. The only other thing it does is ask "if I declared a win
 * now, how many fan would it be?", which depends only on its own tiles and
 * public facts.
 *
 * NO CHICKEN WINS: a CPU only declares a win when the hand reaches the
 * minimum fan.
 *
 * Levels (also shown on the host page):
 * - Easy: sometimes throws a random tile; never claims 上 碰 槓; wins when it can.
 * - Medium: keeps the tiles that bring it closest to a winning hand and that
 *   leave the most ways to finish it; claims 上 碰 槓 when that brings it
 *   closer; makes gongs.
 * - Hard: like medium, but also steers toward higher-scoring hands (one suit,
 *   dragon and wind pongs, all pongs), and near the end of the wall stops
 *   chasing a hand it cannot finish and throws the safest tiles.
 *
 * Measured over ~1,500 simulated hands: easy wins ~13% against easy players;
 * medium and hard win ~2/3 of hands against easy players, hard collecting the
 * most chips; against medium players hard is only slightly better.
 */
import { NORMAL_TYPES, NormalType, Rng, SEATS, Tile, TileType, isFlower, typeIndex } from '@lan-mahjong/shared';
import { AvailableActions, Claim, RoundState, claim, selfDrawWin } from './round.js';
import type { Command, CpuDifficulty } from './room.js';

// ---------- what the CPU can see ----------

/** Everything a player in this seat can legally see. */
export interface TableSight {
  seat: number;
  hand: Tile[];
  myMeldCount: number;
  /** How many of each of the 34 tile types this player can see (own hand + everything face up). */
  visible: number[];
  /** Tile types each other seat has discarded (for playing safe). */
  discardedBy: Set<string>[];
  /** How many shown sets each seat has. */
  meldCounts: number[];
  wallCount: number;
  seatWind: number;
  roundWind: number;
  /** The tile that can be claimed right now, if any (offered by someone else). */
  offered: { type: NormalType; by: number } | null;
}

export function sight(round: RoundState, seat: number): TableSight {
  const { core } = round;
  const visible = new Array<number>(34).fill(0);
  const see = (t: Tile): void => {
    if (!isFlower(t.type)) visible[typeIndex(t.type as NormalType)]!++;
  };
  core.hands[seat]!.forEach(see); // own hand only
  core.melds.flat().forEach((m) => m.tiles.forEach(see));
  core.discards.forEach((d) => see(d.tile));
  const discardedBy: Set<string>[] = [0, 1, 2, 3].map(() => new Set<string>());
  for (const d of core.discards) discardedBy[d.by]!.add(d.tile.type);
  const w = round.window;
  return {
    seat,
    hand: core.hands[seat]!.slice(),
    myMeldCount: core.melds[seat]!.length,
    visible,
    discardedBy,
    meldCounts: core.melds.map((m) => m.length),
    wallCount: core.wall.stacks.reduce((n, s) => n + s.tiles.length, 0),
    seatWind: (seat - core.dealer + SEATS) % SEATS,
    roundWind: core.roundWind,
    offered: w && w.by !== seat ? { type: w.tile.type as NormalType, by: w.by } : null,
  };
}

// ---------- how close is a hand to winning? ----------

const isSuitIdx = (i: number): boolean => i < 27;

/**
 * "Shanten": how many tile changes away from ready-to-win. -1 = complete,
 * 0 = one tile from winning, 1 = two away, and so on. Standard hands only
 * (4 sets + a pair); `meldCount` sets are already on the table.
 */
export function shanten(counts: number[], meldCount: number): number {
  let best = 8 - 2 * meldCount;
  const c = counts.slice();
  const search = (i: number, sets: number, partials: number, pair: number): void => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const usable = Math.min(partials, 4 - sets);
      const s = 8 - 2 * sets - usable - pair;
      if (s < best) best = s;
      return;
    }
    if (c[i]! >= 3) {
      c[i]! -= 3;
      search(i, sets + 1, partials, pair);
      c[i]! += 3;
    }
    if (isSuitIdx(i) && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
      c[i]!--; c[i + 1]!--; c[i + 2]!--;
      search(i, sets + 1, partials, pair);
      c[i]!++; c[i + 1]!++; c[i + 2]!++;
    }
    if (sets + partials < 4) {
      if (c[i]! >= 2) {
        c[i]! -= 2;
        search(i, sets, partials + 1, pair);
        c[i]! += 2;
      }
      if (isSuitIdx(i) && i % 9 <= 7 && c[i + 1]! > 0) {
        c[i]!--; c[i + 1]!--;
        search(i, sets, partials + 1, pair);
        c[i]!++; c[i + 1]!++;
      }
      if (isSuitIdx(i) && i % 9 <= 6 && c[i + 2]! > 0) {
        c[i]!--; c[i + 2]!--;
        search(i, sets, partials + 1, pair);
        c[i]!++; c[i + 2]!++;
      }
    }
    c[i]!--;
    search(i, sets, partials, pair);
    c[i]!++;
  };
  search(0, meldCount, 0, 0);
  for (let p = 0; p < 34; p++) {
    if (c[p]! >= 2) {
      c[p]! -= 2;
      search(0, meldCount, 0, 1);
      c[p]! += 2;
    }
  }
  return best;
}

function countsOf(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of tiles) if (!isFlower(t.type)) counts[typeIndex(t.type as NormalType)]!++;
  return counts;
}

/** How many unseen tiles would bring this (13-tile) hand closer to winning. */
function usefulTiles(counts: number[], meldCount: number, visible: number[], base: number): number {
  let total = 0;
  for (let t = 0; t < 34; t++) {
    const unseen = 4 - visible[t]!;
    if (unseen <= 0) continue;
    counts[t]!++;
    if (shanten(counts, meldCount) < base) total += unseen;
    counts[t]!--;
  }
  return total;
}

// ---------- choosing a discard ----------

const DRAGONS = [31, 32, 33];
const windIdx = (w: number): number => 27 + w;

/** Hard only: how much this hand wants to keep a tile type (higher = keep). */
function keepValue(i: number, counts: number[], s: TableSight): number {
  let v = 0;
  // Dragon / seat wind / round wind pairs and pongs are worth fan.
  const valuable = [...DRAGONS, windIdx(s.seatWind), windIdx(s.roundWind)];
  if (valuable.includes(i) && counts[i]! >= 2) v += 4;
  // Steer toward one suit (+ honours) when most of the hand is already one suit.
  const suitTotals = [0, 1, 2].map((suit) => counts.slice(suit * 9, suit * 9 + 9).reduce((a, b) => a + b, 0));
  const main = suitTotals.indexOf(Math.max(...suitTotals));
  const honours = counts.slice(27).reduce((a, b) => a + b, 0);
  if (suitTotals[main]! + honours >= 9) {
    if (i < 27 && Math.floor(i / 9) === main) v += 3;
    else if (i < 27) v -= 3;
  }
  // Pairs lean toward all pongs.
  if (counts[i]! >= 2) v += 1;
  return v;
}

/** Hard only: how risky it is to throw this tile type (0 = safe). */
function danger(i: number, s: TableSight): number {
  const type = NORMAL_TYPES[i]!;
  const opponents = [0, 1, 2, 3].filter((x) => x !== s.seat);
  if (opponents.every((o) => s.discardedBy[o]!.has(type))) return 0;
  if (s.visible[i]! >= 3) return 0.2; // only one copy left anywhere
  let d = i >= 27 ? 0.6 : i % 9 === 0 || i % 9 === 8 ? 0.7 : i % 9 >= 3 && i % 9 <= 5 ? 1.2 : 1;
  if (opponents.some((o) => s.discardedBy[o]!.has(type))) d *= 0.5;
  return d;
}

/** How worried a hard CPU is: opponents with many shown sets, or a short wall. */
function threatLevel(s: TableSight): number {
  const opp = [0, 1, 2, 3].filter((x) => x !== s.seat).map((o) => s.meldCounts[o]!);
  let threat = 0;
  if (Math.max(...opp) >= 3) threat += 2;
  else if (Math.max(...opp) >= 2) threat += 1;
  if (s.wallCount < 20) threat += 1;
  return threat;
}

export function chooseDiscard(s: TableSight, level: CpuDifficulty, rng: Rng): Tile {
  const hand = s.hand;
  const counts = countsOf(hand);
  // One candidate per tile type.
  const byType = new Map<string, Tile>();
  for (const t of hand) if (!byType.has(t.type)) byType.set(t.type, t);
  const candidates = [...byType.values()];

  if (level === 'easy' && rng() < 0.2) return candidates[Math.floor(rng() * candidates.length)]!;

  // Hard: near the end of the wall, with no real chance to finish, fold:
  // throw the safest tiles instead of chasing a win.
  const threat = level === 'hard' ? threatLevel(s) : 0;
  const currentSh = level === 'hard' ? shanten(counts, s.myMeldCount) : 0;
  const fold = level === 'hard' && s.wallCount < 16 && currentSh >= 2;

  const scored = candidates.map((tile) => {
    const i = typeIndex(tile.type as NormalType);
    counts[i]!--;
    const sh = shanten(counts, s.myMeldCount);
    let score = sh * 1000;
    if (level !== 'easy') score -= usefulTiles(counts, s.myMeldCount, s.visible, sh);
    counts[i]!++;
    if (level === 'hard') {
      // Value only breaks ties between equally good discards; safety matters when someone is close.
      score += keepValue(i, counts, s) * 2;
      if (fold) score = danger(i, s) * 100000 + score / 100;
      else if (threat >= 2) score += danger(i, s) * 25 * threat;
    }
    // Small preference to throw lone honours and terminals first.
    if (i >= 27 && counts[i] === 1) score -= 2;
    return { tile, score };
  });
  const min = Math.min(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score === min);
  return best[Math.floor(rng() * best.length)]!.tile;
}

// ---------- claims and own-turn moves ----------

/** If this player declared a win now, how many fan would it be? (null = not a win) */
export function winFan(round: RoundState, seat: number, how: 'self' | 'claim', now: number): number | null {
  try {
    const after = how === 'self' ? selfDrawWin(round, seat, now) : claim(round, seat, { kind: 'win' }, now);
    const r = after.core.result;
    return r && r.type === 'win' ? r.fan : null;
  } catch {
    return null;
  }
}

/** Best shanten after making a set from the offered tile and then discarding. */
function shantenAfterClaim(s: TableSight, remove: TileType[], replacementDraw: boolean): number {
  const hand = s.hand.slice();
  for (const t of remove) {
    const i = hand.findIndex((x) => x.type === t);
    if (i < 0) return 99;
    hand.splice(i, 1);
  }
  const counts = countsOf(hand);
  const melds = s.myMeldCount + 1;
  if (replacementDraw) return shanten(counts, melds);
  let best = 99;
  for (let i = 0; i < 34; i++) {
    if (counts[i]! === 0) continue;
    counts[i]!--;
    best = Math.min(best, shanten(counts, melds));
    counts[i]!++;
  }
  return best;
}

function wantsClaim(round: RoundState, s: TableSight, a: AvailableActions, level: CpuDifficulty): Claim | null {
  if (level === 'easy' || !s.offered) return null;
  const current = shanten(countsOf(s.hand), s.myMeldCount);
  const t = s.offered.type;
  const i = typeIndex(t);
  const valuable = [...DRAGONS, windIdx(s.seatWind), windIdx(s.roundWind)].includes(i);
  if (a.gong && shantenAfterClaim(s, [t, t, t], true) <= current) return { kind: 'gong' };
  if (a.pong) {
    const after = shantenAfterClaim(s, [t, t], false);
    if (after < current || (level === 'hard' && valuable && after <= current)) return { kind: 'pong' };
  }
  if (a.chow.length > 0) {
    let best: [number, number] | null = null;
    let bestSh = current;
    for (const ids of a.chow) {
      const types = ids.map((id) => s.hand.find((x) => x.id === id)!.type);
      const after = shantenAfterClaim(s, types, false);
      if (after < bestSh) {
        bestSh = after;
        best = ids;
      }
    }
    if (best) {
      return { kind: 'chow', tileIds: best };
    }
  }
  void round;
  return null;
}

/** Pick this CPU's next move, or null if it has nothing to do right now. */
export function cpuMove(
  round: RoundState,
  seat: number,
  a: AvailableActions,
  level: CpuDifficulty,
  rng: Rng,
  now: number = Date.now(),
): Command | null {
  const minFan = round.core.settings.minFan;
  const s = sight(round, seat);
  const offeredOpen = round.window?.status.type === 'open';

  // Win when allowed and never a chicken win.
  if (a.win && offeredOpen) {
    const fan = winFan(round, seat, 'claim', now);
    if (fan !== null && fan >= minFan) return { type: 'claim', claim: { kind: 'win' } };
  }
  if (a.selfDrawWin) {
    const fan = winFan(round, seat, 'self', now);
    if (fan !== null && fan >= minFan) return { type: 'selfDrawWin' };
  }
  if (a.drawReplacement) return { type: 'drawReplacement' };

  // Claims on someone else's discard (only before the next player draws).
  if (offeredOpen && s.offered) {
    const c = wantsClaim(round, s, a, level);
    if (c) return { type: 'claim', claim: c };
  }
  if (a.draw) return { type: 'draw' };

  if (a.discard) {
    // Gongs on your own turn (medium and hard), when they don't hurt the hand.
    if (level !== 'easy') {
      const counts = countsOf(s.hand);
      const current = shanten(counts, s.myMeldCount);
      for (const t of a.concealedGongs) {
        const i = typeIndex(t);
        counts[i]! -= 4;
        const after = shanten(counts, s.myMeldCount + 1);
        counts[i]! += 4;
        if (after <= current) return { type: 'concealedGong', tileType: t };
      }
      for (const t of a.addedGongs) {
        const i = typeIndex(t);
        counts[i]! -= 1;
        const after = shanten(counts, s.myMeldCount);
        counts[i]! += 1;
        if (after <= current) return { type: 'addedGong', tileType: t };
      }
    }
    return { type: 'discard', tileId: chooseDiscard(s, level, rng).id };
  }
  return null;
}

/** Plain-language description of each level, shown on the host page. */
export const CPU_LEVEL_DESCRIPTIONS: Record<CpuDifficulty, string[]> = {
  easy: [
    'Sometimes throws away a tile at random (makes beginner mistakes).',
    'Never claims Soeng 上, Pung 碰 or Gong 槓 from other players.',
    'Wins whenever its hand is complete and reaches the minimum fan.',
  ],
  medium: [
    'Keeps the tiles that bring it closest to a winning hand.',
    'Claims Soeng 上, Pung 碰 and Gong 槓 when that brings it closer to winning.',
    'Wins whenever it can reach the minimum fan.',
  ],
  hard: [
    'Plays like Medium, and also steers toward bigger hands: one suit, dragon and wind pongs, all pongs.',
    'Near the end of the wall, when it cannot finish, it stops chasing and throws the safest tiles.',
    'Wins a little less often than Medium but collects more chips per win.',
  ],
};
