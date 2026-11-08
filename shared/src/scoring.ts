/**
 * Fan counting 計番. Works out how many fan a winning hand is worth and lists
 * every scoring item (in English and Traditional Chinese) for the win summary.
 *
 * The fan list was confirmed by Kyle (see PROJECT_NOTES.md). When a hand
 * can be split up in more than one way, the split worth the most fan is used.
 * "Cap" hands score MAX_FAN (10) and nothing else is added.
 */
import { Meld, findWinShape } from './hand.js';
import { MAX_FAN } from './payout.js';
import { FLOWERS, NORMAL_TYPES, NormalType, Tile, TileType, isFlower, typeIndex } from './tiles.js';

export interface WinContext {
  /** Hidden tiles INCLUDING the winning tile. */
  hidden: readonly Tile[];
  melds: readonly Meld[];
  /** Flowers the winner has set aside. */
  flowers: readonly Tile[];
  /** The tile that completed the hand. */
  winningTile: TileType;
  selfDraw: boolean;
  /** 0 = East, 1 = South, 2 = West, 3 = North. The dealer is always East. */
  seatWind: number;
  roundWind: number;
  flowersOn: boolean;
  /** Won on the very last tile of the wall 海底撈月. */
  lastTile?: boolean;
  /** Won by robbing a gong 搶槓. */
  robbingGong?: boolean;
  /** Won on the replacement tile after a gong 槓上開花. */
  gongReplacement?: boolean;
  /** Dealer won on the deal 天胡. */
  heavenly?: boolean;
  /** Won on the dealer's first discard 地胡. */
  earthly?: boolean;
}

export interface FanItem {
  id: string;
  fan: number;
  en: string;
  zh: string;
}

export interface FanResult {
  /** Total fan, capped at MAX_FAN. */
  fan: number;
  items: FanItem[];
  /** True if this is a cap (limit) hand. */
  capHand: boolean;
}

const item = (id: string, fan: number, en: string, zh: string): FanItem => ({ id, fan, en, zh });

// Indexes into NORMAL_TYPES: 0-8 m, 9-17 p, 18-26 s, 27-30 winds E S W N, 31-33 dragons.
const WIND_START = 27;
const DRAGON_START = 31;
const DRAGON_NAMES: Record<number, [string, string]> = {
  31: ['Red dragon pong', '中'],
  32: ['Green dragon pong', '發'],
  33: ['White dragon pong', '白'],
};

const isHonourIdx = (i: number): boolean => i >= WIND_START;
const isTerminalIdx = (i: number): boolean => i < WIND_START && (i % 9 === 0 || i % 9 === 8);
const suitOfIdx = (i: number): number => Math.floor(i / 9); // 0,1,2 suits; 3 = honours

interface SetInfo {
  kind: 'chow' | 'pong' | 'gong';
  /** Lowest tile index (the tile itself for pong/gong). */
  start: number;
  /** Concealed means it was never claimed from another player. */
  concealed: boolean;
}

/**
 * Score a winning hand. Throws an error if the hand is not a winning hand.
 */
export function countFan(ctx: WinContext): FanResult {
  const shape = findWinShape(ctx.hidden, ctx.melds);
  if (!shape) throw new Error('This hand is not a winning hand.');

  const meldSets: SetInfo[] = ctx.melds.map((m) => ({
    kind: m.kind,
    start: Math.min(...m.tiles.map((t) => typeIndex(t.type as NormalType))),
    concealed: m.concealed,
  }));
  const noClaimedMelds = ctx.melds.every((m) => m.concealed);

  // Cap hands that do not depend on how the hand is split.
  const flowerCount = ctx.flowers.length;
  if (ctx.flowersOn && flowerCount === FLOWERS.length) {
    return cap(item('allFlowers', MAX_FAN, 'All 8 flowers', '八仙過海'));
  }
  if (ctx.heavenly) return cap(item('heavenly', MAX_FAN, 'Heavenly hand', '天胡'));
  if (ctx.earthly) return cap(item('earthly', MAX_FAN, 'Earthly hand', '地胡'));
  if (shape.kind === 'thirteenOrphans') return cap(item('thirteenOrphans', MAX_FAN, 'Thirteen orphans', '十三么'));
  if (noClaimedMelds && ctx.melds.length === 0 && isNineGates(ctx.hidden)) {
    return cap(item('nineGates', MAX_FAN, 'Nine gates', '九子連環'));
  }

  let best: FanResult | null = null;
  for (const d of shape.decompositions) {
    const hiddenSets: SetInfo[] = d.sets.map((s) => ({ kind: s.kind, start: s.start, concealed: true }));
    const sets = [...meldSets, ...hiddenSets];
    const result = scoreSplit(ctx, sets, d.pair, noClaimedMelds);
    if (!best || result.fan > best.fan) best = result;
  }
  return best!;
}

function cap(it: FanItem): FanResult {
  return { fan: MAX_FAN, items: [it], capHand: true };
}

function scoreSplit(ctx: WinContext, sets: SetInfo[], pair: number, noClaimedMelds: boolean): FanResult {
  const pongs = sets.filter((s) => s.kind !== 'chow'); // pongs and gongs
  const allIdx = [...sets.map((s) => s.start), pair];
  const tileIdxs = [pair, ...sets.flatMap((s) => (s.kind === 'chow' ? [s.start, s.start + 1, s.start + 2] : [s.start]))];
  const suits = new Set(tileIdxs.filter((i) => !isHonourIdx(i)).map(suitOfIdx));
  const hasHonours = tileIdxs.some(isHonourIdx);
  const hasPongOf = (i: number): boolean => pongs.some((s) => s.start === i);

  // ----- Cap hands that depend on the split -----
  const windPongs = [0, 1, 2, 3].filter((w) => hasPongOf(WIND_START + w)).length;
  if (windPongs === 4) return cap(item('bigFourWinds', MAX_FAN, 'Big four winds', '大四喜'));
  if (suits.size === 0) return cap(item('allHonours', MAX_FAN, 'All honours', '字一色'));
  if (!hasHonours && tileIdxs.every(isTerminalIdx)) return cap(item('allTerminals', MAX_FAN, 'All terminals', '清么九'));
  if (pongs.length === 4 && sets.every((s) => s.kind === 'gong')) {
    return cap(item('fourGongs', MAX_FAN, 'Four gongs', '十八羅漢'));
  }
  if (pongs.length === 4 && noClaimedMelds && allConcealedPongs(ctx, sets, pair)) {
    return cap(item('allConcealedPongs', MAX_FAN, 'All concealed pongs', '坑坑胡'));
  }

  // ----- Normal scoring -----
  const items: FanItem[] = [];

  if (ctx.selfDraw) items.push(item('selfDraw', 1, 'Self-draw', '自摸'));
  if (noClaimedMelds) items.push(item('concealed', 1, 'Concealed hand', '門前清'));

  // Flowers
  if (ctx.flowersOn) {
    if (ctx.flowers.length === 0) items.push(item('noFlowers', 1, 'No flowers', '無花'));
    const have = new Set(ctx.flowers.map((f) => f.type));
    for (const [prefix, en, zh] of [['f', 'flowers', '梅蘭菊竹'], ['n', 'seasons', '春夏秋冬']] as const) {
      const set = [1, 2, 3, 4].map((n) => `${prefix}${n}`);
      if (set.every((t) => have.has(t as TileType))) {
        items.push(item(`fullSet_${prefix}`, 2, `All 4 ${en}`, `一台花 (${zh})`));
      } else if (have.has(`${prefix}${ctx.seatWind + 1}` as TileType)) {
        items.push(item(`seatFlower_${prefix}`, 1, 'Seat flower', '正花'));
      }
    }
  }

  if (sets.every((s) => s.kind === 'chow')) items.push(item('allChows', 1, 'All chows', '平胡'));
  if (pongs.length === 4) items.push(item('allPongs', 3, 'All pongs', '對對胡'));

  // Dragons
  const dragonPongs = [0, 1, 2].filter((d) => hasPongOf(DRAGON_START + d)).length;
  const dragonPair = pair >= DRAGON_START;
  if (dragonPongs === 3) {
    items.push(item('bigThreeDragons', 8, 'Big three dragons', '大三元'));
  } else if (dragonPongs === 2 && dragonPair) {
    items.push(item('smallThreeDragons', 5, 'Small three dragons', '小三元'));
  } else {
    for (let i = DRAGON_START; i < DRAGON_START + 3; i++) {
      if (hasPongOf(i)) {
        const [en, zh] = DRAGON_NAMES[i]!;
        items.push(item(`dragon_${i}`, 1, en, `番子 (${zh})`));
      }
    }
  }

  // Winds
  const windPair = pair >= WIND_START && pair < DRAGON_START;
  if (windPongs === 3 && windPair) {
    items.push(item('smallFourWinds', 6, 'Small four winds', '小四喜'));
  } else {
    if (hasPongOf(WIND_START + ctx.seatWind)) items.push(item('seatWind', 1, 'Seat wind pong', '門風'));
    if (hasPongOf(WIND_START + ctx.roundWind)) items.push(item('roundWind', 1, 'Round wind pong', '圈風'));
  }

  // Suits
  if (suits.size === 1 && !hasHonours) items.push(item('fullFlush', 7, 'One suit only', '清一色'));
  else if (suits.size === 1 && hasHonours) items.push(item('halfFlush', 3, 'One suit plus honours', '混一色'));

  if (hasHonours && allIdx.every((i) => isHonourIdx(i) || isTerminalIdx(i)) && sets.every((s) => s.kind !== 'chow')) {
    items.push(item('mixedTerminals', 1, 'Terminals and honours', '混么九'));
  }

  // Special timing
  if (ctx.lastTile) items.push(item('lastTile', 1, 'Win on the last tile', '海底撈月'));
  if (ctx.robbingGong) items.push(item('robbingGong', 1, 'Robbing a gong', '搶槓'));
  if (ctx.gongReplacement) items.push(item('gongReplacement', 2, 'Win on a gong replacement', '槓上開花'));

  const total = items.reduce((n, it) => n + it.fan, 0);
  return { fan: Math.min(total, MAX_FAN), items, capHand: false };
}

/**
 * All four sets are pongs/gongs that were never claimed. On a discard win the
 * winning tile must finish the pair, otherwise that pong was claimed.
 */
function allConcealedPongs(ctx: WinContext, sets: SetInfo[], pair: number): boolean {
  if (!sets.every((s) => s.kind !== 'chow' && s.concealed)) return false;
  if (ctx.selfDraw) return true;
  return NORMAL_TYPES[pair] === ctx.winningTile;
}

/** Nine gates: 1112345678999 of one suit plus any one more of that suit. */
function isNineGates(hidden: readonly Tile[]): boolean {
  if (hidden.length !== 14 || hidden.some((t) => isFlower(t.type))) return false;
  const suit = hidden[0]!.type[0];
  if (!hidden.every((t) => t.type[0] === suit && /^[mps][1-9]$/.test(t.type))) return false;
  const counts = new Array<number>(10).fill(0);
  for (const t of hidden) counts[Number(t.type[1])]!++;
  const need = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
  return need.every((n, rank) => counts[rank]! >= n);
}
