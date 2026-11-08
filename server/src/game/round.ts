/**
 * The round engine: one hand of mahjong, from the deal to a win or a draw.
 *
 * It only knows the rules. It does not know about networks, names or screens.
 * Every function takes the current state and returns a NEW state (the old one
 * is never changed), or throws a GameError if the move is not allowed.
 *
 * Time ("now", in milliseconds) is passed in rather than read from the clock,
 * so tests can control it exactly.
 *
 * Rules decided with Kyle (see PROJECT_NOTES.md):
 * - Drawing is manual: the player whose turn it is calls draw().
 * - After a flower or a gong, the player must call drawReplacement() before
 *   they can discard.
 * - Claims (上 碰 槓 胡) on a discard happen straight away and play continues.
 *   A claim can still be made later, and the game jumps back to the moment of
 *   the discard to give it to them:
 *     - any claim, up to 3 s after the next player draws;
 *     - 碰/槓 taking over a 上, up to 3 s after the 上;
 *     - 胡 taking over any other claim (including a lower-priority 胡), up to 10 s.
 *   All of these end as soon as the next tile is discarded.
 * - Two players can win on one discard: the next one in turn order after
 *   the discarder has priority (截糊).
 * - Undo: only the current player can press it. Moves are discard, 上, 碰,
 *   槓 and 胡. Undoing a 胡 needs everyone to agree.
 */
import {
  DealResult,
  FanItem,
  Meld,
  NormalType,
  PayoutMode,
  Rng,
  SEATS,
  Tile,
  Wall,
  assertAllTilesAccountedFor,
  calculatePayout,
  canGongDiscard,
  canPong,
  canWinSelfDraw,
  canWinWith,
  countFan,
  dealRound,
  drawBack,
  drawFront,
  isFlower,
  isSuited,
  mayChowFrom,
  tilesLeft,
} from '@lan-mahjong/shared';

export const GRACE_MS = 3000;
export const WIN_OVERRIDE_MS = 10000;

export class GameError extends Error {}

export interface RoundSettings {
  flowersOn: boolean;
  minFan: number;
  payoutMode: PayoutMode;
}

/**
 * - mustDraw: the turn player must draw from the front of the wall.
 * - mustReplace: the turn player must draw a replacement from the back.
 * - mustDiscard: the turn player has a full hand and must discard (or gong / win).
 * - ended: someone won, or the wall ran out (a draw).
 */
export type Phase = 'mustDraw' | 'mustReplace' | 'mustDiscard' | 'ended';

export type ClaimKind = 'chow' | 'pong' | 'gong' | 'win';
export type MoveKind = 'discard' | 'chow' | 'pong' | 'gong' | 'win';

export interface DiscardEntry {
  tile: Tile;
  by: number;
}

export type RoundResult =
  | {
      type: 'win';
      winner: number;
      discarder: number | null;
      fan: number;
      items: FanItem[];
      capHand: boolean;
      isChicken: boolean;
      changes: number[];
    }
  | { type: 'draw' };

/** All the game data for a round (everything except history and claim windows). */
export interface RoundCore {
  settings: RoundSettings;
  dealer: number;
  /** 0 = East, 1 = South, 2 = West, 3 = North. */
  roundWind: number;
  dice: [number, number, number];
  wall: Wall;
  hands: Tile[][];
  melds: Meld[][];
  flowers: Tile[][];
  discards: DiscardEntry[];
  turn: number;
  phase: Phase;
  /** What the turn player last drew (needed for self-draw wins). */
  lastDraw: 'wall' | 'gongReplacement' | 'flowerReplacement' | null;
  /** Why a replacement draw is needed. */
  replacementFor: 'gong' | 'flower' | null;
  discardCount: number;
  result: RoundResult | null;
}

export type WindowStatus =
  | { type: 'open' }
  | { type: 'drawn'; at: number }
  | { type: 'claimed'; seat: number; kind: ClaimKind; at: number };

/** A tile that can still be claimed (a discard, or a tile added to a pong). */
export interface ClaimWindow {
  tile: Tile;
  by: number;
  source: 'discard' | 'addedGong';
  /** The state right after the tile was offered. Claims are applied to this. */
  base: RoundCore;
  baseHistory: number;
  status: WindowStatus;
}

export interface HistoryEntry {
  move: MoveKind;
  seat: number;
  before: RoundCore;
  windowBefore: ClaimWindow | null;
}

export interface RoundState {
  core: RoundCore;
  window: ClaimWindow | null;
  history: HistoryEntry[];
}

export type Claim =
  | { kind: 'chow'; tileIds: [number, number] }
  | { kind: 'pong' }
  | { kind: 'gong' }
  | { kind: 'win' };

// ---------- helpers ----------

const clone = <T>(x: T): T => structuredClone(x);
const next = (seat: number): number => (seat + 1) % SEATS;
const seatWind = (core: RoundCore, seat: number): number => (seat - core.dealer + SEATS) % SEATS;
const strength = (k: ClaimKind): number => (k === 'win' ? 3 : k === 'chow' ? 1 : 2);
/** 1 = first in turn order after `from`, 3 = last. */
const priority = (from: number, seat: number): number => (seat - from + SEATS) % SEATS;

function fail(message: string): never {
  throw new GameError(message);
}

function requireSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS) fail(`Bad seat ${seat}.`);
}

function requireTurn(core: RoundCore, seat: number, phase: Phase): void {
  requireSeat(seat);
  if (core.phase === 'ended') fail('The round has ended.');
  if (core.turn !== seat) fail('It is not your turn.');
  if (core.phase !== phase) {
    const why: Record<Phase, string> = {
      mustDraw: 'You must draw a tile first.',
      mustReplace: 'You must draw a replacement tile first.',
      mustDiscard: 'You must discard a tile first.',
      ended: 'The round has ended.',
    };
    fail(why[core.phase]);
  }
}

function removeTiles(hand: Tile[], ids: readonly number[]): Tile[] {
  const removed: Tile[] = [];
  for (const id of ids) {
    const i = hand.findIndex((t) => t.id === id);
    if (i < 0) fail('That tile is not in your hand.');
    removed.push(hand.splice(i, 1)[0]!);
  }
  return removed;
}

function removeTypes(hand: Tile[], type: string, count: number): Tile[] {
  const ids = hand.filter((t) => t.type === type).slice(0, count).map((t) => t.id);
  if (ids.length < count) fail(`You need ${count} of that tile.`);
  return removeTiles(hand, ids);
}

/** Every tile must still be accounted for after every move. */
export function checkTiles(core: RoundCore): void {
  assertAllTilesAccountedFor(
    {
      hands: core.hands,
      flowers: core.flowers,
      wall: core.wall,
      discards: core.discards.map((d) => d.tile),
      melds: core.melds.flat().map((m) => m.tiles),
    },
    core.settings.flowersOn,
  );
}

function finish(state: RoundState): RoundState {
  checkTiles(state.core);
  return state;
}

/**
 * Copy a state so it can be changed. Only the core game data is deep-copied:
 * history entries and claim-window snapshots are never changed once made, so
 * they can safely be shared (this keeps every move fast).
 */
function startEdit(state: RoundState): RoundState {
  return {
    core: clone(state.core),
    window: state.window ? { ...state.window } : null,
    history: state.history.slice(),
  };
}

function pushHistory(state: RoundState, move: MoveKind, seat: number): void {
  state.history.push({
    move,
    seat,
    before: clone(state.core),
    windowBefore: state.window ? { ...state.window } : null,
  });
}

// ---------- starting a round ----------

export interface StartRoundOptions {
  dealer: number;
  roundWind: number;
  settings: RoundSettings;
  rng: Rng;
  dice?: [number, number, number];
}

export function startRound({ dealer, roundWind, settings, rng, dice }: StartRoundOptions): RoundState {
  const deal: DealResult = dealRound({ dealer, flowersOn: settings.flowersOn, rng, dice });
  return roundFromDeal(deal, roundWind, settings);
}

/** Build the round state from a finished deal (the dealer starts by discarding). */
export function roundFromDeal(deal: DealResult, roundWind: number, settings: RoundSettings): RoundState {
  const core: RoundCore = {
    settings: { ...settings },
    dealer: deal.dealer,
    roundWind,
    dice: deal.dice,
    wall: deal.wall,
    hands: deal.hands,
    melds: [[], [], [], []],
    flowers: deal.flowers,
    discards: [],
    turn: deal.dealer,
    phase: 'mustDiscard',
    lastDraw: 'wall',
    replacementFor: null,
    discardCount: 0,
    result: null,
  };
  return finish({ core, window: null, history: [] });
}

// ---------- drawing ----------

/** Normal draw: drag a tile from the front of the wall into your hand. */
export function draw(prev: RoundState, seat: number, now: number): RoundState {
  requireTurn(prev.core, seat, 'mustDraw');
  const state = startEdit(prev);
  const { core } = state;
  if (state.window?.status.type === 'open') state.window.status = { type: 'drawn', at: now };

  if (tilesLeft(core.wall) === 0) {
    core.phase = 'ended';
    core.result = { type: 'draw' };
    return finish(state);
  }
  const tile = drawFront(core.wall);
  takeDrawnTile(core, seat, tile, 'wall');
  return finish(state);
}

/** Replacement draw after a flower or a gong: from the back of the wall. */
export function drawReplacement(prev: RoundState, seat: number, now: number): RoundState {
  requireTurn(prev.core, seat, 'mustReplace');
  const state = startEdit(prev);
  const { core } = state;
  const w = state.window;
  if (w && w.source === 'addedGong' && w.by === seat && w.status.type === 'open') {
    w.status = { type: 'drawn', at: now };
  }

  if (tilesLeft(core.wall) === 0) {
    core.phase = 'ended';
    core.result = { type: 'draw' };
    return finish(state);
  }
  const tile = drawBack(core.wall);
  takeDrawnTile(core, seat, tile, core.replacementFor === 'gong' ? 'gongReplacement' : 'flowerReplacement');
  return finish(state);
}

function takeDrawnTile(core: RoundCore, seat: number, tile: Tile, how: NonNullable<RoundCore['lastDraw']>): void {
  if (isFlower(tile.type)) {
    // Flowers go straight to the flower area; another replacement is needed.
    core.flowers[seat]!.push(tile);
    core.phase = 'mustReplace';
    core.replacementFor = 'flower';
    core.lastDraw = null;
    return;
  }
  core.hands[seat]!.push(tile);
  core.phase = 'mustDiscard';
  core.replacementFor = null;
  core.lastDraw = how;
}

// ---------- discarding ----------

export function discard(prev: RoundState, seat: number, tileId: number, now: number): RoundState {
  void now;
  requireTurn(prev.core, seat, 'mustDiscard');
  const state = startEdit(prev);
  pushHistory(state, 'discard', seat);
  const { core } = state;
  const [tile] = removeTiles(core.hands[seat]!, [tileId]);
  core.discards.push({ tile: tile!, by: seat });
  core.discardCount++;
  core.turn = next(seat);
  core.phase = 'mustDraw';
  core.lastDraw = null;
  core.replacementFor = null;

  // A new discard ends every earlier claim window and opens a new one.
  state.window = {
    tile: tile!,
    by: seat,
    source: 'discard',
    base: clone(core),
    baseHistory: state.history.length,
    status: { type: 'open' },
  };
  return finish(state);
}

// ---------- gongs on your own turn ----------

/** Concealed gong: four of the same from your own hand. */
export function concealedGong(prev: RoundState, seat: number, type: NormalType, now: number): RoundState {
  void now;
  requireTurn(prev.core, seat, 'mustDiscard');
  const state = startEdit(prev);
  pushHistory(state, 'gong', seat);
  const { core } = state;
  const tiles = removeTypes(core.hands[seat]!, type, 4);
  core.melds[seat]!.push({ kind: 'gong', tiles, concealed: true });
  core.phase = 'mustReplace';
  core.replacementFor = 'gong';
  core.lastDraw = null;
  return finish(state);
}

/** Added gong: add the fourth tile to a pong already on the table. Others may rob it 搶槓. */
export function addedGong(prev: RoundState, seat: number, type: NormalType, now: number): RoundState {
  void now;
  requireTurn(prev.core, seat, 'mustDiscard');
  const meld = prev.core.melds[seat]!.find((m) => m.kind === 'pong' && m.tiles[0]!.type === type);
  if (!meld) fail('You do not have a pong of that tile.');
  const state = startEdit(prev);
  pushHistory(state, 'gong', seat);
  const { core } = state;
  const [tile] = removeTypes(core.hands[seat]!, type, 1);
  const m = core.melds[seat]!.find((x) => x.kind === 'pong' && x.tiles[0]!.type === type)!;
  m.kind = 'gong';
  m.tiles.push(tile!);
  core.phase = 'mustReplace';
  core.replacementFor = 'gong';
  core.lastDraw = null;
  state.window = {
    tile: tile!,
    by: seat,
    source: 'addedGong',
    base: clone(core),
    baseHistory: state.history.length,
    status: { type: 'open' },
  };
  return finish(state);
}

// ---------- claiming a discard (上 碰 槓 胡) ----------

/** Can this claim be made right now? Returns a reason if not, or null if it can. */
export function claimProblem(state: RoundState, seat: number, claim: Claim, now: number): string | null {
  const w = state.window;
  if (!w) return 'There is no tile to claim.';
  if (seat === w.by) return 'You cannot claim your own tile.';
  if (w.source === 'addedGong' && claim.kind !== 'win') return 'You can only 胡 on a gong tile.';

  // Timing.
  const s = w.status;
  // The player who drew has chosen to draw: they can no longer claim that tile.
  if (s.type === 'drawn' && w.source === 'discard' && seat === next(w.by)) return 'You have already drawn.';
  if (s.type === 'drawn' && now - s.at > GRACE_MS) return 'Too late to claim that tile.';
  if (s.type === 'claimed') {
    if (s.seat === seat) return 'You already claimed that tile.';
    const stronger =
      strength(claim.kind) > strength(s.kind) ||
      (claim.kind === 'win' && s.kind === 'win' && priority(w.by, seat) < priority(w.by, s.seat));
    if (!stronger) return 'Someone else has claimed that tile.';
    const limit = claim.kind === 'win' ? WIN_OVERRIDE_MS : GRACE_MS;
    if (now - s.at > limit) return 'Too late to claim that tile.';
  }

  // Is the claim legal with the hand the player had when the tile was offered?
  const hand = w.base.hands[seat]!;
  const melds = w.base.melds[seat]!;
  const type = w.tile.type;
  switch (claim.kind) {
    case 'win':
      return canWinWith(hand, melds, type) ? null : 'That tile does not complete your hand.';
    case 'pong':
      return canPong(hand, type) ? null : 'You need two matching tiles to 碰.';
    case 'gong':
      return canGongDiscard(hand, type) ? null : 'You need three matching tiles to 槓.';
    case 'chow': {
      if (!mayChowFrom(w.by, seat)) return 'You can only 上 from the player before you.';
      if (!isSuited(type)) return 'You can only 上 number tiles.';
      const tiles = claim.tileIds.map((id) => hand.find((t) => t.id === id));
      if (tiles.some((t) => !t) || claim.tileIds[0] === claim.tileIds[1]) return 'Those tiles are not in your hand.';
      const all = [type, tiles[0]!.type, tiles[1]!.type];
      if (!all.every((t) => isSuited(t) && t[0] === type[0])) return 'Those tiles do not make a 上.';
      const ranks = all.map((t) => Number(t[1])).sort((a, b) => a - b);
      return ranks[1] === ranks[0]! + 1 && ranks[2] === ranks[0]! + 2 ? null : 'Those tiles do not make a 上.';
    }
  }
}

export function claim(prev: RoundState, seat: number, c: Claim, now: number): RoundState {
  requireSeat(seat);
  const problem = claimProblem(prev, seat, c, now);
  if (problem) fail(problem);
  const w = prev.window!;

  // Jump back to the moment the tile was offered, then apply the claim.
  const state: RoundState = {
    core: clone(w.base),
    history: prev.history.slice(0, w.baseHistory),
    window: { ...w, status: { type: 'open' } },
  };
  pushHistory(state, c.kind, seat);
  state.window = { ...w, status: { type: 'claimed', seat, kind: c.kind, at: now } };

  const { core } = state;
  const hand = core.hands[seat]!;
  const takeOffered = (): Tile => {
    if (w.source === 'discard') return core.discards.pop()!.tile;
    // Robbing a gong: the gong goes back to being a pong.
    const m = core.melds[w.by]!.find((x) => x.kind === 'gong' && x.tiles.some((t) => t.id === w.tile.id))!;
    m.kind = 'pong';
    m.tiles = m.tiles.filter((t) => t.id !== w.tile.id);
    return w.tile;
  };

  if (c.kind === 'win') {
    const tile = takeOffered();
    hand.push(tile);
    const noMeldsYet = w.base.melds.every((ms) => ms.length === 0);
    const earthly =
      w.source === 'discard' && w.by === core.dealer && w.base.discardCount === 1 && noMeldsYet;
    endWithWin(core, seat, w.by, {
      winningTile: tile.type,
      selfDraw: false,
      robbingGong: w.source === 'addedGong',
      lastTile: tilesLeft(core.wall) === 0,
      earthly,
    });
    return finish(state);
  }

  const tile = takeOffered();
  const own =
    c.kind === 'chow' ? removeTiles(hand, c.tileIds) : removeTypes(hand, tile.type, c.kind === 'pong' ? 2 : 3);
  // A Shàng (run) is shown in order, lowest number first.
  const meldTiles = c.kind === 'chow' ? [...own, tile].sort((a, b) => a.type.localeCompare(b.type)) : [...own, tile];
  core.melds[seat]!.push({ kind: c.kind, tiles: meldTiles, concealed: false, claimedFrom: w.by });
  core.turn = seat;
  core.lastDraw = null;
  if (c.kind === 'gong') {
    core.phase = 'mustReplace';
    core.replacementFor = 'gong';
  } else {
    core.phase = 'mustDiscard';
    core.replacementFor = null;
  }
  return finish(state);
}

// ---------- self-draw win ----------

export function selfDrawWin(prev: RoundState, seat: number, now: number): RoundState {
  void now;
  requireTurn(prev.core, seat, 'mustDiscard');
  const c = prev.core;
  if (c.lastDraw === null) fail('You can only win by self-draw straight after drawing.');
  if (!canWinSelfDraw(c.hands[seat]!, c.melds[seat]!)) fail('Your hand is not complete.');
  const state = startEdit(prev);
  pushHistory(state, 'win', seat);
  const { core } = state;
  const hand = core.hands[seat]!;
  const heavenly =
    seat === core.dealer && core.discardCount === 0 && core.melds.every((m) => m.length === 0);
  endWithWin(core, seat, null, {
    winningTile: hand[hand.length - 1]!.type,
    selfDraw: true,
    gongReplacement: core.lastDraw === 'gongReplacement',
    lastTile: core.lastDraw === 'wall' && tilesLeft(core.wall) === 0,
    heavenly,
  });
  return finish(state);
}

function endWithWin(
  core: RoundCore,
  winner: number,
  discarder: number | null,
  extra: {
    winningTile: Tile['type'];
    selfDraw: boolean;
    robbingGong?: boolean;
    gongReplacement?: boolean;
    lastTile?: boolean;
    heavenly?: boolean;
    earthly?: boolean;
  },
): void {
  const fan = countFan({
    hidden: core.hands[winner]!,
    melds: core.melds[winner]!,
    flowers: core.flowers[winner]!,
    seatWind: seatWind(core, winner),
    roundWind: core.roundWind,
    flowersOn: core.settings.flowersOn,
    ...extra,
  });
  const pay = calculatePayout({
    winner,
    discarder,
    fan: fan.fan,
    minFan: core.settings.minFan,
    mode: core.settings.payoutMode,
  });
  core.phase = 'ended';
  core.turn = winner;
  core.result = {
    type: 'win',
    winner,
    discarder,
    fan: fan.fan,
    items: fan.items,
    capHand: fan.capHand,
    isChicken: pay.isChicken,
    changes: pay.changes,
  };
}

// ---------- undo ----------

/** The player who has to make the next move (the only one who may press undo). */
export function currentPlayer(state: RoundState): number | null {
  return state.core.phase === 'ended' && state.core.result?.type === 'win' ? null : state.core.turn;
}

/** Can `seat` press undo right now? Returns a reason if not. */
export function undoProblem(state: RoundState, seat: number, allAgreed: boolean): string | null {
  const last = state.history[state.history.length - 1];
  if (!last) return 'There is nothing to undo.';
  if (last.move === 'win') return allAgreed ? null : 'Undoing a win needs every player to agree.';
  if (currentPlayer(state) !== seat) return 'Only the player whose turn it is can undo.';
  return null;
}

/** Undo the most recent move. */
export function undo(prev: RoundState, seat: number, allAgreed = false): RoundState {
  const problem = undoProblem(prev, seat, allAgreed);
  if (problem) fail(problem);
  const state = startEdit(prev);
  const last = state.history.pop()!;
  state.core = last.before;
  state.window = last.windowBefore;
  return finish(state);
}

// ---------- what can a player do right now? ----------

export interface AvailableActions {
  draw: boolean;
  drawReplacement: boolean;
  discard: boolean;
  selfDrawWin: boolean;
  concealedGongs: NormalType[];
  addedGongs: NormalType[];
  /** Claims on the offered tile. Each chow option is a pair of tile ids. */
  chow: [number, number][];
  pong: boolean;
  gong: boolean;
  win: boolean;
  undo: boolean;
}

export function availableActions(state: RoundState, seat: number, now: number): AvailableActions {
  const { core } = state;
  const myTurn = core.phase !== 'ended' && core.turn === seat;
  const hand = core.hands[seat]!;
  const melds = core.melds[seat]!;
  const mustDiscard = myTurn && core.phase === 'mustDiscard';

  const can = (c: Claim): boolean => claimProblem(state, seat, c, now) === null;
  const chow: [number, number][] = [];
  const w = state.window;
  if (w && w.source === 'discard' && isSuited(w.tile.type)) {
    const base = w.base.hands[seat]!;
    const seen = new Set<string>();
    for (const a of base) {
      for (const b of base) {
        if (a.id >= b.id) continue;
        const key = [a.type, b.type].sort().join();
        if (seen.has(key)) continue;
        if (can({ kind: 'chow', tileIds: [a.id, b.id] })) {
          seen.add(key);
          chow.push([a.id, b.id]);
        }
      }
    }
  }

  return {
    draw: myTurn && core.phase === 'mustDraw',
    drawReplacement: myTurn && core.phase === 'mustReplace',
    discard: mustDiscard,
    selfDrawWin: mustDiscard && core.lastDraw !== null && canWinSelfDraw(hand, melds),
    concealedGongs: mustDiscard
      ? [...new Set(hand.map((t) => t.type))].filter((t) => hand.filter((x) => x.type === t).length === 4) as NormalType[]
      : [],
    addedGongs: mustDiscard
      ? melds.filter((m) => m.kind === 'pong' && hand.some((t) => t.type === m.tiles[0]!.type)).map((m) => m.tiles[0]!.type as NormalType)
      : [],
    chow,
    pong: can({ kind: 'pong' }),
    gong: can({ kind: 'gong' }),
    win: can({ kind: 'win' }),
    undo: undoProblem(state, seat, false) === null,
  };
}
