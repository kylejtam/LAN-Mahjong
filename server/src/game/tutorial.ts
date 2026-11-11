/**
 * The tutorial: a private practice game with 3 computer players (Ming, Fong and Kei) that
 * walks one player through every control, for someone who already knows how to play.
 *
 * The hand is set up in advance (which tiles each player gets, and which tiles come off
 * the wall) and the computer players follow a script, so every control comes up in a
 * hand that makes sense from start to finish, ending with the player's win.
 *
 * Each step either waits for the player to make one particular move (any other move is
 * refused), or lets the computer players make their scripted moves.
 */
import { DEFAULT_SETTINGS, Rng, SEATS, Tile, TileType, buildTileSet, buildWall, drawBack, drawFront, isFlower, rollDice, shuffle } from '@lan-mahjong/shared';
import type { DealResult, Wall } from '@lan-mahjong/shared';
import { RoundState, roundFromDeal } from './round.js';

/** You (seat 0, East, the dealer), then Ming (South, on your right), Fong (West), Kei (North). */
export const TUTORIAL_CPUS = ['Ming', 'Fong', 'Kei'] as const;

// ---------- the prepared hand ----------

/** Your 14 tiles after the deal (two of them replace your opening flowers 梅 and 菊). */
const YOU = ['m1', 'm9', 'm9', 'm9', 'p2', 's4', 's5', 's7', 'wE', 'wE', 'wE', 'wN', 'dR', 'dR'];
const YOU_FLOWERS = ['f1', 'f3'];
/** Tiles each computer player must hold for its scripted moves (the rest are random). */
const NEEDS: Record<number, string[]> = { 1: ['s5', 's6', 'm3'], 2: ['m3', 'm3', 'm9'], 3: ['dW', 'dW', 'dW'] };
/** The tiles drawn from the front of the wall after the deal, in order. */
const FRONT = ['s9', 'n3', 's1', 'p8', 's6', 'dW', 'n2', 'p6', 'p2'];
/** The tiles drawn from the back of the wall (flower and Gong replacements), in order. */
const BACK = ['wN', 'm1', 'dR', 'p7', 'm5', 'wE', 'dR', 'm8'];

/** Deal the tutorial hand. Which tiles are where is fixed; only the dice are random. */
export function tutorialRound(roundWind: number, rng: Rng): RoundState {
  const pool = buildTileSet(true);
  const take = (type: string): Tile => {
    const i = pool.findIndex((t) => t.type === type);
    if (i < 0) throw new Error(`Tutorial: no ${type} left.`);
    return pool.splice(i, 1)[0]!;
  };
  // What each seat is dealt (13, the dealer 14), including your two flowers.
  const dealtYou = [...YOU.filter((t, i) => !(t === 'wN' && i === YOU.indexOf('wN')) && !(t === 'm1' && i === YOU.indexOf('m1'))), ...YOU_FLOWERS].map(take);
  const needs = [1, 2, 3].map((s) => NEEDS[s]!.map(take));
  const front = FRONT.map(take);
  const back = BACK.map(take);
  // The rest: random. Flowers never go to a hand (they'd need replacing) and are never drawn.
  const rest = shuffle(pool, rng);
  const flowers = rest.filter((t) => isFlower(t.type));
  const plain = rest.filter((t) => !isFlower(t.type));
  const hands: Tile[][] = [dealtYou, ...needs.map((n) => [...n, ...plain.splice(0, 13 - n.length)])];

  // Lay the wall out in drawing order: the deal, then the front draws, then filler,
  // with the replacement tiles at the very back.
  const order: Tile[] = new Array(144);
  const dealOrder: number[] = []; // which seat takes each of the first 53 tiles
  for (let r = 0; r < 3; r++) for (let s = 0; s < SEATS; s++) for (let i = 0; i < 4; i++) dealOrder.push(s);
  dealOrder.push(0, 1, 2, 3, 0); // the dealer takes the 1st and 5th of the last five
  const next = hands.map(() => 0);
  dealOrder.forEach((s, i) => (order[i] = hands[s]![next[s]!++]!));
  front.forEach((t, i) => (order[53 + i] = t));
  // Back draws take the last stack's top tile, then its bottom one, then the stack before.
  back.forEach((t, i) => {
    const stackFromEnd = Math.floor(i / 2);
    order[144 - 2 * (stackFromEnd + 1) + (i % 2)] = t;
  });
  const filler = [...plain, ...flowers];
  for (let i = 0; i < 144; i++) if (!order[i]) order[i] = filler.shift()!;

  // Build the wall (for the stacks' places round the table), then deal like a real hand.
  const dice = rollDice(rng);
  const flat = buildWall(order, 0, [0, 0, 0]);
  const shaped = buildWall(order, 0, dice);
  const wall: Wall = { stacks: flat.stacks.map((st, i) => ({ ...st, seat: shaped.stacks[i]!.seat, position: shaped.stacks[i]!.position })) };
  const dealt: Tile[][] = [[], [], [], []];
  const flowerSets: Tile[][] = [[], [], [], []];
  for (let r = 0; r < 3; r++) for (let s = 0; s < SEATS; s++) for (let i = 0; i < 4; i++) dealt[s]!.push(drawFront(wall));
  const five = [0, 1, 2, 3, 4].map(() => drawFront(wall));
  dealt[0]!.push(five[0]!, five[4]!);
  [1, 2, 3].forEach((s, k) => dealt[s]!.push(five[k + 1]!));
  for (let s = 0; s < SEATS; s++) {
    const hand = dealt[s]!;
    for (let i = 0; i < hand.length; i++) {
      if (isFlower(hand[i]!.type)) {
        flowerSets[s]!.push(hand[i]!);
        hand[i] = drawBack(wall);
      }
    }
  }
  const deal: DealResult = { dealer: 0, dice, hands: dealt, flowers: flowerSets, wall };
  const s = DEFAULT_SETTINGS;
  return roundFromDeal(deal, roundWind, { flowersOn: true, minFan: s.minFan, payoutMode: s.payoutMode, liabilityOn: !!s.liabilityOn });
}

// ---------- the script ----------

/** A command as the tutorial sees it (the same shapes as Room commands). */
export interface TutorialCmd {
  type: string;
  tileId?: number;
  tileType?: string;
  kind?: string | null;
  claim?: { kind: string; tileIds?: number[] };
  prefs?: Record<string, unknown>;
  tileIds?: number[];
}

/** One computer move: [seat, command]. Tile names are turned into the real tiles when played. */
export type CpuStep = [seat: number, cmd: { type: string; tile?: string; claim?: { kind: string; tiles?: string[] } }];

/**
 * A step either waits for one move of yours, or lets the computer players make their
 * moves and then waits for you to press Next (nothing moves on by itself).
 */
export type Stage =
  | { id: string; you: (cmd: TutorialCmd, tileType: (id: number) => TileType | undefined) => boolean }
  | { id: string; cpu: CpuStep[] };

const discardOf = (type: string) => (c: TutorialCmd, tt: (id: number) => TileType | undefined): boolean => c.type === 'discard' && tt(c.tileId!) === type;
const holdOf = (kind: string) => (c: TutorialCmd): boolean => c.type === 'hold' && c.kind === kind;
const claimOf = (kind: string) => (c: TutorialCmd): boolean => c.type === 'claim' && c.claim?.kind === kind;
const is = (type: string) => (c: TutorialCmd): boolean => c.type === type;

export const STAGES: Stage[] = [
  { id: 'rearrange', you: is('reorderHand') },
  { id: 'discard1', you: discardOf('m1') },
  { id: 'undo', you: is('undo') },
  { id: 'discard2', you: discardOf('m1') },
  { id: 'mingDiscards', cpu: [[1, { type: 'draw' }], [1, { type: 'discard', tile: 's9' }]] },
  { id: 'fongFlower', cpu: [[2, { type: 'draw' }], [2, { type: 'drawReplacement' }], [2, { type: 'discard', tile: 'dR' }]] },
  { id: 'holdPung', you: holdOf('pong') },
  { id: 'confirmPung', you: claimOf('pong') },
  { id: 'discardNorth', you: discardOf('wN') },
  { id: 'othersPlay', cpu: [[1, { type: 'draw' }], [1, { type: 'discard', tile: 's1' }], [2, { type: 'draw' }], [2, { type: 'discard', tile: 'p8' }], [3, { type: 'draw' }], [3, { type: 'discard', tile: 's6' }]] },
  { id: 'holdSeung', you: holdOf('chow') },
  {
    id: 'confirmSeung',
    you: (c, tt) => c.type === 'claim' && c.claim?.kind === 'chow' && [...(c.claim.tileIds ?? [])].map((id) => tt(id)).sort().join() === 's4,s5',
  },
  { id: 'discard7s', you: discardOf('s7') },
  { id: 'mingSeung', cpu: [[1, { type: 'claim', claim: { kind: 'chow', tiles: ['s5', 's6'] } }], [1, { type: 'discard', tile: 'm3' }]] },
  { id: 'fongPung', cpu: [[2, { type: 'claim', claim: { kind: 'pong' } }], [2, { type: 'discard', tile: 'm9' }]] },
  { id: 'holdPung9', you: holdOf('pong') },
  { id: 'cancel9', you: is('releaseHold') },
  { id: 'holdGong9', you: holdOf('gong') },
  { id: 'confirmGong9', you: claimOf('gong') },
  { id: 'replace1', you: is('drawReplacement') },
  { id: 'discard7p', you: discardOf('p7') },
  { id: 'keiGong', cpu: [[1, { type: 'draw' }], [1, { type: 'discard', tile: 'dW' }], [3, { type: 'claim', claim: { kind: 'gong' } }], [3, { type: 'drawReplacement' }], [3, { type: 'discard', tile: 'm5' }]] },
  { id: 'draw', you: is('draw') },
  { id: 'replaceFlower', you: is('drawReplacement') },
  { id: 'hiddenGong', you: is('concealedGong') },
  { id: 'replace2', you: is('drawReplacement') },
  { id: 'addedGong', you: is('addedGong') },
  { id: 'replace3', you: is('drawReplacement') },
  { id: 'discard8m', you: discardOf('m8') },
  { id: 'callAll', you: (c) => c.type === 'setPrefs' && c.prefs?.callAll === true },
  { id: 'fongTwoDots', cpu: [[1, { type: 'draw' }], [1, { type: 'discard', tile: 'p6' }], [2, { type: 'draw' }], [2, { type: 'discard', tile: 'p2' }]] },
  { id: 'holdWu', you: holdOf('win') },
  { id: 'confirmWu', you: claimOf('win') },
  { id: 'won', you: () => false },
];

/** Commands the player may always use in the tutorial (they don't change the hand). */
export const ALWAYS_OK = new Set(['tutorialNext', 'setPrefs', 'rename', 'setWatchedSeat', 'setWatchAll', 'reorderHand', 'leaveGame', 'confirmRound', 'unready', 'pressStart', 'takeSeat', 'rollDice']);

/** Time between one computer move and the next (ms). */
export const TUTORIAL_CPU_GAP_MS = 1100;
