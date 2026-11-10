/**
 * CPU players: easy, medium and hard.
 *
 * FAIR PLAY: a CPU only uses what a real player in its seat could see — its
 * own tiles, and everything face up on the table (discards, shown sets,
 * flowers, how many tiles are left). It never looks at anyone else's hidden
 * tiles or at the wall. All decisions are made from a TableSight built by
 * `sight()` below, plus face-up sets and discards. The only other thing it
 * does is ask "if I declared a win now, how many fan would it be?", which
 * depends only on its own tiles and public facts.
 *
 * NO CHICKEN WINS: a CPU only declares a win when the hand reaches the
 * minimum fan.
 *
 * Levels (chosen from many thousands of simulated hands, see PROJECT_NOTES.md):
 * - Easy: a natural beginner. Never claims 上 碰 槓 (only wins). Throws its
 *   loneliest tile first (honours first). Leans towards one suit once it holds
 *   9 or more of it. Wins whenever it can.
 * - Medium: picks a simple plan from its starting hand (one suit + honours
 *   with 8+ fitting tiles, otherwise a concealed hand) and switches to one suit
 *   late (10 fitting tiles). Only claims tiles that fit its plan, and misses
 *   about 2 in 3 of those claims. At minimum fan 0-1, a hand that starts close
 *   to ready and does not lean to one suit is just finished quickly.
 * - Hard: the full plan (one suit + honours, all pongs, or concealed), switches
 *   early, always pongs dragons and its own winds, collects dragons, upgrades
 *   to pure one suit, avoids feeding players who show a big hand when it is
 *   far from ready, and uses the same quick finish at minimum fan 0-1.
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

/** The quick-finish style: build any winning hand as fast as possible (also used inside Medium and Hard). */
function legacyMove(
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


// ---------- the new levels: plans ----------

type Plan = 'halfFlush' | 'allPongs' | 'concealed';

/** What a CPU remembers during one hand (its plan). Kept per seat, per hand. */
export interface CpuMemory {
  plan: Plan | null;
  /** The suit (0-2) a one-suit plan collects. */
  suit: number;
  /** One suit only, no honours (清一色). */
  pure: boolean;
  /** Medium / Hard at minimum fan 0-1: finish this hand quickly instead of following a plan. */
  fast: boolean | null;
}
const newMemory = (): CpuMemory => ({ plan: null, suit: 0, pure: false, fast: null });
const memories = new Map<string, CpuMemory>();
function memoryFor(key: string | undefined): CpuMemory {
  if (!key) return newMemory();
  let m = memories.get(key);
  if (!m) {
    m = newMemory();
    memories.set(key, m);
    // Keep only recent hands.
    if (memories.size > 400) memories.delete(memories.keys().next().value!);
  }
  return m;
}

const suitOf = (i: number): number => (i < 27 ? Math.floor(i / 9) : 3); // 3 = honours

/** All-pongs distance: like shanten, but only pongs (and one pair) count. */
function pongShanten(c: number[], melds: number): number {
  let sets = melds;
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (c[i]! >= 3) sets++;
    else if (c[i] === 2) pairs++;
  }
  sets = Math.min(sets, 4);
  return 8 - 2 * sets - Math.min(pairs, 5 - sets);
}

/** Unseen copies of tiles that would lower a distance measure. */
function usefulFor(c: number[], melds: number, visible: number[], base: number, measure: (c: number[], m: number) => number, allowed: (i: number) => boolean): number {
  let n = 0;
  for (let t = 0; t < 34; t++) {
    if (!allowed(t)) continue;
    const unseen = 4 - visible[t]!;
    if (unseen <= 0) continue;
    c[t]!++;
    if (measure(c, melds) < base) n += unseen;
    c[t]!--;
  }
  return n;
}

function handFacts(hand: readonly Tile[], round: RoundState, seat: number) {
  const c = countsOf(hand);
  const suits = [0, 1, 2].map((x) => c.slice(x * 9, x * 9 + 9).reduce((p, q) => p + q, 0));
  const suit = suits.indexOf(Math.max(...suits));
  const honours = c.slice(27).reduce((p, q) => p + q, 0);
  const fit = suits[suit]! + honours;
  const pairs = c.filter((n) => n >= 2).length;
  const seatWind = (seat - round.core.dealer + SEATS) % SEATS;
  const value = new Set([...DRAGONS, windIdx(seatWind), windIdx(round.core.roundWind)]);
  return { c, suits, suit, honours, fit, pairs, value };
}

/** Pick a plan at the start of the hand, then switch when the hand changes. */
function choosePlan(round: RoundState, seat: number, mem: CpuMemory, hard: boolean): void {
  const f = handFacts(round.core.hands[seat]!, round, seat);
  if (mem.plan === null) {
    if (f.fit >= 8) mem.plan = 'halfFlush';
    else if (hard && f.pairs >= 4) mem.plan = 'allPongs'; // Medium has no all-pongs plan
    else mem.plan = 'concealed';
    mem.suit = f.suit;
    return;
  }
  if (hard && mem.plan === 'halfFlush' && !mem.pure) {
    // Upgrade to one suit only when no honours are left and 11+ tiles are in the suit.
    const meldTypes = round.core.melds[seat]!.flatMap((m) => m.tiles.map((x) => typeIndex(x.type as NormalType)));
    const honours = f.honours + meldTypes.filter((i) => i >= 27).length;
    const inSuit = f.c.slice(mem.suit * 9, mem.suit * 9 + 9).reduce((p, q) => p + q, 0) + meldTypes.filter((i) => suitOf(i) === mem.suit).length;
    if (honours === 0 && inSuit >= 11) mem.pure = true;
  }
  if (mem.plan === 'concealed') {
    if (f.fit >= (hard ? 8 : 10)) {
      mem.plan = 'halfFlush';
      mem.suit = f.suit;
    } else if (hard && f.pairs >= 3 && shanten(f.c, round.core.melds[seat]!.length) >= 2) mem.plan = 'allPongs';
  }
}

/** Medium misses about 2 in 3 of the claims it wants. The same answer every time for the same tile. */
function missesClaim(round: RoundState, seat: number): boolean {
  const d = round.core.dice;
  return (round.core.discardCount * 7919 + seat * 13 + (d[0] + d[1] * 7 + d[2] * 49) * 31) % 100 < 67;
}

function planMove(round: RoundState, seat: number, a: AvailableActions, level: 'medium' | 'hard', mem: CpuMemory, rng: Rng, now: number): Command | null {
  const hard = level === 'hard';
  const minFan = round.core.settings.minFan;
  const s = sight(round, seat);
  choosePlan(round, seat, mem, hard);
  const plan = mem.plan!;
  const status = round.window?.status.type;
  if (a.win) {
    const f = winFan(round, seat, 'claim', now);
    if (f !== null && f >= minFan) return { type: 'claim', claim: { kind: 'win' } };
  }
  if (a.selfDrawWin) {
    const f = winFan(round, seat, 'self', now);
    if (f !== null && f >= minFan) return { type: 'selfDrawWin' };
  }
  if (a.drawReplacement) return { type: 'drawReplacement' };

  const inPlan = (i: number): boolean => (plan === 'halfFlush' ? suitOf(i) === mem.suit || (i >= 27 && !mem.pure) : true);
  const measure = plan === 'allPongs' ? pongShanten : shanten;
  const planCounts = (c: number[]): number[] => c.map((n, i) => (inPlan(i) ? n : 0));
  const facts = handFacts(s.hand, round, seat);

  if (status === 'open' && s.offered && !(level === 'medium' && missesClaim(round, seat))) {
    const t = s.offered.type;
    const i = typeIndex(t);
    const c = countsOf(s.hand);
    const cur = measure(planCounts(c), s.myMeldCount);
    const after = (remove: NormalType[]): number => {
      const cc = c.slice();
      for (const r of remove) cc[typeIndex(r)]!--;
      return measure(planCounts(cc), s.myMeldCount + 1);
    };
    // Hard always pongs dragons and its own winds (a sure fan).
    if (hard && a.pong && facts.value.has(i) && inPlan(i)) return { type: 'claim', claim: { kind: 'pong' } };
    if (plan !== 'concealed' && inPlan(i)) {
      if (a.gong && after([t, t, t]) <= cur) return { type: 'claim', claim: { kind: 'gong' } };
      if (a.pong && after([t, t]) < cur) return { type: 'claim', claim: { kind: 'pong' } };
      if (plan === 'halfFlush') {
        for (const ids of a.chow) {
          const types = ids.map((id) => s.hand.find((x) => x.id === id)!.type as NormalType);
          if (after(types) < cur) return { type: 'claim', claim: { kind: 'chow', tileIds: ids } };
        }
      }
    }
  }
  if (a.draw) return { type: 'draw' };
  if (!a.discard) return null;
  for (const t of a.concealedGongs) if (inPlan(typeIndex(t))) return { type: 'concealedGong', tileType: t };
  for (const t of a.addedGongs) if (inPlan(typeIndex(t))) return { type: 'addedGong', tileType: t };

  // Hard: who shows a big hand? (2+ face-up sets all in one suit, or a dragon pong.)
  const myShanten = shanten(countsOf(s.hand), s.myMeldCount);
  const bigSuits = new Set<number>();
  let dragonDanger = false;
  if (hard) {
    for (let o = 0; o < SEATS; o++) {
      if (o === seat) continue;
      const shown = round.core.melds[o]!.filter((m) => !m.concealed).map((m) => m.tiles.map((x) => typeIndex(x.type as NormalType)));
      const suited = shown.filter((m) => m[0]! < 27).map((m) => suitOf(m[0]!));
      if (suited.length >= 2 && new Set(suited).size === 1) bigSuits.add(suited[0]!);
      if (shown.some((m) => m[0]! >= 31)) {
        dragonDanger = true;
        for (const x of suited) bigSuits.add(x);
      }
    }
  }
  const mine = [...s.hand, ...round.core.melds[seat]!.flatMap((m) => m.tiles)].filter((t) => !isFlower(t.type)).map((t) => typeIndex(t.type as NormalType));
  const dragonSets = DRAGONS.filter((i) => mine.filter((x) => x === i).length >= 2).length;
  const thrown = new Set<number>(round.core.discards.filter((e) => e.by !== seat).map((e) => typeIndex(e.tile.type as NormalType)));

  const c = countsOf(s.hand);
  const seen = new Set<string>();
  let best: Tile | null = null;
  let bestScore = Infinity;
  for (const tile of s.hand) {
    if (isFlower(tile.type) || seen.has(tile.type)) continue;
    seen.add(tile.type);
    const i = typeIndex(tile.type as NormalType);
    let score: number;
    if (!inPlan(i)) {
      // Tiles outside the plan go first, the least connected one first.
      const nb = i < 27 ? [i - 2, i - 1, i + 1, i + 2].filter((j) => j >= 0 && j < 27 && suitOf(j) === suitOf(i)).reduce((n, j) => n + c[j]!, 0) : 0;
      score = -100000 + nb * 10 + c[i]! * 30;
    } else {
      c[i]!--;
      const pc = planCounts(c);
      const sh = measure(pc, s.myMeldCount);
      score = sh * 1000 - usefulFor(pc, s.myMeldCount, s.visible, sh, measure, inPlan);
      c[i]!++;
      if (hard && facts.value.has(i) && c[i]! >= 2) score += 300; // hold dragon / own-wind pairs
      if (hard && i >= 31 && dragonSets >= 1) score += c[i]! >= 2 ? 700 : 250; // collect dragons
    }
    // Hard, far from ready: don't feed a player who shows a big hand.
    if (hard && myShanten >= 2 && !thrown.has(i) && (bigSuits.has(suitOf(i)) || (i >= 31 && dragonDanger))) score += 1500;
    if (score < bestScore || (score === bestScore && rng() < 0.5)) {
      bestScore = score;
      best = tile;
    }
  }
  return { type: 'discard', tileId: best!.id };
}

/** Easy: a natural beginner. Never claims (only wins); throws its loneliest tile first. */
function easyMove(round: RoundState, seat: number, a: AvailableActions, rng: Rng, now: number): Command | null {
  const minFan = round.core.settings.minFan;
  const s = sight(round, seat);
  if (a.win) {
    const f = winFan(round, seat, 'claim', now);
    if (f !== null && f >= minFan) return { type: 'claim', claim: { kind: 'win' } };
  }
  if (a.selfDrawWin) {
    const f = winFan(round, seat, 'self', now);
    if (f !== null && f >= minFan) return { type: 'selfDrawWin' };
  }
  if (a.drawReplacement) return { type: 'drawReplacement' };
  if (a.draw) return { type: 'draw' };
  if (!a.discard) return null;
  if (a.concealedGongs.length) return { type: 'concealedGong', tileType: a.concealedGongs[0]! };
  if (a.addedGongs.length) return { type: 'addedGong', tileType: a.addedGongs[0]! };
  const hand = s.hand.filter((t) => !isFlower(t.type));
  const c = countsOf(hand);
  const suits = [0, 1, 2].map((x) => c.slice(x * 9, x * 9 + 9).reduce((p, q) => p + q, 0));
  const main = suits.indexOf(Math.max(...suits));
  const leaning = suits[main]! >= 9;
  const lonely = (i: number): boolean =>
    c[i] === 1 && (i >= 27 || ![i - 2, i - 1, i + 1, i + 2].some((j) => j >= 0 && j < 27 && suitOf(j) === suitOf(i) && c[j]! > 0));
  let best: Tile | null = null;
  let bestScore = Infinity;
  for (const tile of hand) {
    const i = typeIndex(tile.type as NormalType);
    let score: number;
    if (leaning && i < 27 && suitOf(i) !== main) score = -100000 + c[i]! * 30;
    else {
      c[i]!--;
      score = shanten(c, s.myMeldCount) * 1000;
      c[i]!++;
      if (i >= 27 && c[i] === 1) score -= 2;
      if (lonely(i)) score -= i >= 27 ? 60 : 50; // the tile with no partner goes first, honours first
    }
    if (score < bestScore || (score === bestScore && rng() < 0.5)) {
      bestScore = score;
      best = tile;
    }
  }
  return { type: 'discard', tileId: best!.id };
}

/**
 * Pick this CPU's next move, or null if it has nothing to do right now.
 * `memoryKey` names this seat in this hand so the CPU can keep its plan; without it the
 * plan is worked out again from the current hand.
 */
export function cpuMove(
  round: RoundState,
  seat: number,
  a: AvailableActions,
  level: CpuDifficulty,
  rng: Rng,
  now: number = Date.now(),
  memoryKey?: string,
): Command | null {
  if (level === 'easy') return easyMove(round, seat, a, rng, now);
  const mem = memoryFor(memoryKey);
  if (mem.fast === null) {
    // At minimum fan 0-1, a hand that starts close to ready and doesn't lean to one suit is finished quickly.
    const f = handFacts(round.core.hands[seat]!, round, seat);
    mem.fast = round.core.settings.minFan <= 1 && shanten(f.c, round.core.melds[seat]!.length) <= 3 && f.fit <= 6;
  }
  if (mem.fast) return legacyMove(round, seat, a, level, rng, now);
  return planMove(round, seat, a, level, mem, rng, now);
}
