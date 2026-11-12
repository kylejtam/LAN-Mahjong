/**
 * A room: one game table with its people (players and spectators), seats,
 * settings and the full game.
 *
 * Everything a player's device asks for comes in as a Command;
 * handleCommand() checks it is allowed and returns the new room (or throws a
 * GameError). Host controls come ONLY from the host page on the laptop that
 * runs the server, as a HostCommand handled by handleHostCommand().
 *
 * Decisions (see PROJECT_NOTES.md):
 * - The display name is the login. Names are matched ignoring capitals.
 * - Same name again while that person is disconnected = reconnect to the same
 *   seat and balance. Same name while they are still connected = "name in use".
 * - Balances belong to the person (the name), not the seat.
 * - Games are created on the laptop's host page. Players only join.
 * - Spectators choose which players' hands they see (all hidden at first).
 * - Seat changes only between rounds (a player may take over a CPU's seat
 *   between rounds). Swaps (drop out) can happen any time.
 * - Only the host page can add CPU players. A player who drops out leaves an
 *   empty seat; during a round the game waits on it until the host adds a CPU.
 *   (To hand over to a spectator, use a swap instead of dropping out.)
 */
import { DEFAULT_SETTINGS, GameSettings, INTRO_BUILD_MS, NormalType, Rng, SEATS, Tile, TileType, introAfterRollMs } from '@lan-mahjong/shared';
import { MatchState, beginRound, closeRound, matchLabel, newMatch } from './match.js';
import {
  Claim,
  ClaimKind,
  GameError,
  canClaimOffered,
  holdClaim,
  lastMover,
  releaseHold,
  RoundState,
  addedGong,
  availableActions,
  claim,
  concealedGong,
  currentPlayer,
  discard,
  draw,
  drawReplacement,
  pass,
  selfDrawWin,
  settleEmptyWall,
  undo,
} from './round.js';
import { cpuMove } from './cpu.js';
import { GlassState, newGlass, noteFlower } from './glass.js';
import { ALWAYS_OK, STAGES, TUTORIAL_CPUS, TUTORIAL_CPU_GAP_MS, TutorialCmd, tutorialRound } from './tutorial.js';

export type CpuDifficulty = 'easy' | 'medium' | 'hard';
/** How long CPUs wait before each move (seconds), set on the host page. Same for every level. */
export const DEFAULT_CPU_SECONDS = 5;
export const MIN_CPU_SECONDS = 0.2;
export const MAX_CPU_SECONDS = 30;
export type TableColour = 'green' | 'black' | 'white' | 'red' | 'blue';
export const TABLE_COLOURS: readonly TableColour[] = ['green', 'black', 'white', 'red', 'blue'];

export interface Person {
  /** Lower-case name, used to recognise the person. */
  key: string;
  /** Name as typed. */
  name: string;
  /** 1 for the first person to join, 2 for the next, ... */
  joinOrder: number;
  connected: boolean;
  /** When this person's connection dropped (while disconnected). */
  offlineSince?: number;
  balance: number;
  cpu: CpuDifficulty | null;
  /** A CPU's name typed on the host page (shown with " (CPU)" after it). Missing = named by its level. */
  cpuName?: string;
  /** As a spectator: the seats whose hands this person has chosen to see. */
  watchingSeats: number[];
  /** As a spectator: the "All hands" screen is open (every hand is sent). */
  watchAll?: boolean;
  /** Per-person preferences (language, theme ...), copied on rename. */
  prefs: Record<string, unknown>;
}

/**
 * - betweenRounds: seats can change; seated humans press Start.
 * - rolling: waiting for the dealer to roll the dice.
 * - playing: a round is in progress (also while its result can still change).
 * - finished: the game is over.
 */
export type RoomPhase = 'betweenRounds' | 'rolling' | 'playing' | 'finished';

/** One finished hand, kept so the host page can show it and roll back to before it. */
export interface HandRecord {
  /** 0 for the first hand of the game, 1 for the next, ... */
  index: number;
  roundWind: number;
  dealer: number;
  dealerIndex: number;
  label: { en: string; zh: string };
  /** Names in seats 0-3 when it was played. */
  seatNames: (string | null)[];
  result: { type: 'draw' } | { type: 'win'; winner: string; discarder: string | null; fan: number; isChicken: boolean };
  /** Chip change per person key. */
  changes: Record<string, number>;
  /** Chip change per seat 0-3, and who won / discarded (seat numbers). Missing in old saves. */
  seatChanges?: number[];
  /** Who sat in seats 0-3 (person keys). Missing in old saves. */
  seatKeys?: (string | null)[];
  /** The chip changes as first played, once the host has edited any of them. */
  originalSeatChanges?: number[];
  winnerSeat?: number | null;
  discarderSeat?: number | null;
  /** Everyone's chips just before this hand was paid out (used to roll back). */
  balancesBefore: Record<string, number>;
}

export interface PendingSwap {
  fromKey: string;
  toKey: string;
  seat: number;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  startingBalance: number;
  tableColour: TableColour;
  people: Record<string, Person>;
  /** seats[i] = key of the person sitting there, or null. */
  seats: (string | null)[];
  phase: RoomPhase;
  match: MatchState;
  startPressed: string[];
  /** People who confirmed the finished round. */
  confirmed: string[];
  /** People who agreed to undo a win. */
  undoWinVotes: string[];
  pendingSwap: PendingSwap | null;
  /** The answer to the last swap request (shown to the player who asked). */
  swapResult?: { fromKey: string; toName: string; accepted: boolean; at: number } | null;
  nextJoinOrder: number;
  /** Last time anything changed (used to pace CPU moves). */
  lastChangeAt: number;
  ended: boolean;
  /**
   * The tutorial (a private practice game): which step it's on, the next computer move
   * in that step, when it may happen, and how many times Ready was pressed.
   */
  tutorial?: { stage: number; step: number; nextAt: number; readyPresses: number };
  /** The window-breaking sound for flowers drawn in play (see glass.ts). */
  glass?: GlassState;
  /** Finished hands, oldest first (may be missing in old save files). */
  history?: HandRecord[];
  /** Seconds each CPU waits before a move (missing in old save files = default). */
  cpuSeconds?: number;
  /** CPUs wait until this time (after an undo, so players can undo again). */
  cpuPauseUntil?: number;
  /** When the host last stopped a hand (players are told). */
  roundStoppedAt?: number | null;
  /** Chip changes the host edited in the history, newest last. */
  historyEdits?: HistoryEdit[];
}

export interface HistoryEdit {
  at: number;
  /** History index of the hand (0 = first). */
  hand: number;
  seat: number;
  name: string;
  from: number;
  to: number;
}

export type Command =
  | { type: 'takeSeat'; seat: number }
  | { type: 'leaveSeat' }
  | { type: 'pressStart' }
  | { type: 'rollDice' }
  | { type: 'draw' }
  | { type: 'drawReplacement' }
  | { type: 'discard'; tileId: number }
  | { type: 'claim'; claim: Claim }
  /** Hold the offered tile while deciding (kind null = not chosen yet). */
  | { type: 'hold'; kind: ClaimKind | null }
  /** Let go of a held tile. */
  | { type: 'releaseHold' }
  | { type: 'concealedGong'; tileType: NormalType }
  | { type: 'addedGong'; tileType: NormalType }
  | { type: 'selfDrawWin' }
  /** Wall empty: say no to the last tile. */
  | { type: 'pass' }
  | { type: 'reorderHand'; tileIds: number[] }
  | { type: 'undo' }
  | { type: 'confirmRound' }
  /** Tutorial: the player has read the note and pressed Next. */
  | { type: 'tutorialNext' }
  /** Changed your mind: not ready after all (between hands). */
  | { type: 'unready' }
  | { type: 'setWatchedSeat'; seat: number; visible: boolean }
  | { type: 'setWatchAll'; visible: boolean }
  | { type: 'setPrefs'; prefs: Record<string, unknown> }
  | { type: 'rename'; newName: string }
  /**
   * Leave your seat. With no replacement the seat becomes empty (during a
   * round its tiles wait there until the host page adds a CPU). Players can
   * never add CPUs themselves.
   */
  | { type: 'dropOut'; replacement: { none: true } | { spectator: string } }
  | { type: 'answerSwap'; accept: boolean }
  | { type: 'cancelSwap' }
  | { type: 'leaveGame' };

/** Host controls. These only come from the host page on the server laptop. */
export type HostCommand =
  /** Put a CPU in a seat (replacing whoever is there), or empty the seat (cpu: null): removes a CPU or forces a player out. */
  | { type: 'hostSetSeat'; seat: number; cpu: CpuDifficulty | null }
  /** Give the CPU in this seat a name (empty = name it by its level again). */
  | { type: 'hostNameCpu'; seat: number; name: string }
  | { type: 'hostResetBalances' }
  /** Type in a person's chip count (the only way to change chips by hand). */
  | { type: 'hostSetBalance'; name: string; key?: string; balance: number }
  /** Go back to just before hand `toHand` was played: chips, wind and dealer as they were then. */
  | { type: 'hostRollBack'; toHand: number }
  /** Change one player's chip win / loss in a finished hand. Only the difference is applied to their chips now. */
  | { type: 'hostEditHistory'; hand: number; seat: number; change: number }
  /** Seconds every CPU waits before each move (the same for all levels). */
  | { type: 'hostSetCpuSeconds'; seconds: number }
  /** Jump to a wind (0 East ... 3 North) and game number (1-4). Chips are not changed. */
  | { type: 'hostSetPosition'; roundWind: number; gameNumber: number }
  | { type: 'hostUpdateSettings'; settings: Partial<GameSettings>; startingBalance?: number }
  | { type: 'hostSetTableColour'; colour: TableColour }
  | { type: 'hostStopRound' }
  | { type: 'hostEndGame' };

/** How long CPUs wait after the last change before they move (milliseconds). */
export function cpuDelay(room: Room): number {
  return Math.round((room.cpuSeconds ?? DEFAULT_CPU_SECONDS) * 1000);
}
export const MAX_NAME_LENGTH = 20;
/** After an undo, CPUs wait this long so players can undo again. */
export const UNDO_PAUSE_MS = 5000;

const fail = (message: string): never => {
  throw new GameError(message);
};

export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length === 0) fail('Please enter a name.');
  if (n.length > MAX_NAME_LENGTH) fail(`Names can be at most ${MAX_NAME_LENGTH} characters.`);
  return n;
}

/** CPU players are named by their level unless the host names them; " (CPU)" is always added. Two CPUs may share a name. */
const CPU_LEVEL_NAMES: Record<CpuDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export function cpuDisplayName(person: Pick<Person, 'cpu' | 'cpuName'>): string {
  return `${person.cpuName ?? CPU_LEVEL_NAMES[person.cpu ?? 'easy']} (CPU)`;
}

/**
 * Copy a room so it can be changed. The round itself is never changed in
 * place (the round engine always makes a new one), so it is shared, which
 * keeps every command fast.
 */
function cloneRoom(prev: Room): Room {
  return {
    ...prev,
    people: structuredClone(prev.people),
    seats: prev.seats.slice(),
    startPressed: prev.startPressed.slice(),
    confirmed: prev.confirmed.slice(),
    undoWinVotes: prev.undoWinVotes.slice(),
    pendingSwap: prev.pendingSwap ? { ...prev.pendingSwap } : null,
    match: { ...prev.match, settings: { ...prev.match.settings } },
    tutorial: prev.tutorial ? { ...prev.tutorial } : undefined,
  };
}

// ---------- creating and joining ----------

export function createRoom(opts: {
  id: string;
  name: string;
  startingBalance: number;
  settings?: Partial<GameSettings>;
  now: number;
}): Room {
  const gameName = opts.name.trim();
  if (!gameName) fail('Please enter a game name.');
  if (!Number.isFinite(opts.startingBalance) || opts.startingBalance < 0) fail('Starting balance must be 0 or more.');
  const settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  checkSettings(settings);
  const room: Room = {
    id: opts.id,
    name: gameName,
    createdAt: opts.now,
    startingBalance: Math.floor(opts.startingBalance),
    tableColour: 'green',
    people: {},
    seats: [null, null, null, null],
    phase: 'betweenRounds',
    match: newMatch(settings),
    startPressed: [],
    confirmed: [],
    undoWinVotes: [],
    pendingSwap: null,
    nextJoinOrder: 1,
    lastChangeAt: opts.now,
    ended: false,
    history: [],
    cpuSeconds: DEFAULT_CPU_SECONDS,
  };
  return room;
}

/**
 * Join (or re-join) a room with a display name. Returns the person.
 * New people start as spectators until they take a seat.
 */
export function joinRoom(prev: Room, rawName: string, now: number): { room: Room; person: Person } {
  if (prev.ended) fail('This game has ended.');
  const name = cleanName(rawName);
  const key = nameKey(name);
  const room = cloneRoom(prev);
  const existing = room.people[key];
  if (existing) {
    if (existing.cpu) fail('That name is used by a CPU player. Please choose another name.');
    if (existing.connected) fail('That name is already in use in this game. Please choose another name.');
    existing.connected = true;
    delete existing.offlineSince;
    room.lastChangeAt = now;
    return { room, person: existing };
  }
  const person: Person = {
    key,
    name,
    joinOrder: room.nextJoinOrder++,
    connected: true,
    balance: room.startingBalance,
    cpu: null,
    watchingSeats: [],
    prefs: {},
  };
  room.people[key] = person;
  room.lastChangeAt = now;
  return { room, person };
}

/** A device lost its connection. The person keeps their seat and balance. */
export function disconnect(prev: Room, key: string, now: number): Room {
  const room = cloneRoom(prev);
  const p = room.people[key];
  if (p) {
    p.connected = false;
    p.offlineSince = now;
  }
  room.lastChangeAt = now;
  return room;
}

/**
 * Seated players (not CPUs) who have lost their connection while a hand is on: the game
 * pauses for everyone until they are back (or the host gives their seat to a CPU).
 */
export function pausedBy(room: Room): string[] {
  const round = room.match.round;
  const handOn = room.phase === 'rolling' || (room.phase === 'playing' && !!round && round.core.phase !== 'ended');
  if (!handOn) return [];
  return room.seats.filter((k): k is string => !!k && !room.people[k]!.cpu && !room.people[k]!.connected);
}

// ---------- helpers ----------

export function seatOf(room: Room, key: string): number | null {
  const i = room.seats.indexOf(key);
  return i < 0 ? null : i;
}

function seatedHumans(room: Room): string[] {
  return room.seats.filter((k): k is string => k !== null && !room.people[k]!.cpu);
}

function requireSeated(room: Room, key: string): number {
  const seat = seatOf(room, key);
  if (seat === null) fail('You are not sitting at the table.');
  return seat!;
}

function requireRound(room: Room): RoundState {
  if (room.phase !== 'playing' || !room.match.round) fail('No round is being played.');
  return room.match.round!;
}

function checkSettings(s: GameSettings): void {
  if (!Number.isInteger(s.minFan) || s.minFan < 0 || s.minFan > 3) fail('Minimum fan must be 0 to 3.');
  if (s.payoutMode !== 'everyonePays' && s.payoutMode !== 'discarderPays') fail('Unknown payout setting.');
  if (s.liabilityOn !== undefined && typeof s.liabilityOn !== 'boolean') fail('Liability must be on or off.');
}

function setRound(room: Room, round: RoundState): void {
  room.match = { ...room.match, round };
  // Any change to the round cancels confirmations and votes (the result may have changed).
  room.confirmed = [];
  room.undoWinVotes = [];
}

function makeCpu(room: Room, seat: number, difficulty: CpuDifficulty): string {
  // Each seat has its own CPU record (so names can repeat and the CPU keeps its chips).
  const key = `cpu#${seat}`;
  const existing = room.people[key];
  if (existing) {
    existing.cpu = difficulty;
    existing.name = cpuDisplayName(existing);
    return key;
  }
  room.people[key] = {
    key,
    name: cpuDisplayName({ cpu: difficulty }),
    joinOrder: room.nextJoinOrder++,
    connected: true,
    balance: room.startingBalance,
    cpu: difficulty,
    watchingSeats: [],
    prefs: {},
  };
  return key;
}

/** If everyone needed has pressed Start, move on to the dice roll. */
function maybeBeginRolling(room: Room): void {
  if (room.phase !== 'betweenRounds') return;
  // The tutorial asks for Ready, Unready, then Ready again before the hand starts.
  if (room.tutorial && room.tutorial.readyPresses < 2) return;
  if (room.seats.some((s) => s === null)) return;
  if (seatedHumans(room).every((k) => room.startPressed.includes(k))) {
    room.phase = 'rolling';
    room.startPressed = [];
  }
}

/** Moves wait while someone else at the table has lost their connection. */
function failIfPaused(room: Room, key: string): void {
  const away = pausedBy(room).filter((k) => k !== key);
  if (away.length) fail(`The game is paused until ${room.people[away[0]!]!.name} reconnects.`);
}

/** If the round is over and everyone has confirmed, pay out and get ready for the next one. */
/** Is the seat's turn played by a CPU or nobody (so any player may undo for it)? */
export function undoableForSeat(room: Room, seat: number): boolean {
  const key = room.seats[seat];
  return !key || !!room.people[key]?.cpu;
}

/** Spectators watching right now (connected, not seated, not CPUs). */
function watchers(room: Room): string[] {
  const seated = new Set(room.seats.filter(Boolean));
  return Object.values(room.people)
    .filter((p) => !p.cpu && p.connected && !seated.has(p.key))
    .map((p) => p.key);
}

/**
 * Can a finished round be paid out and closed?
 * - Seated players: every one of them has confirmed.
 * - All-CPU table: at least one spectator has confirmed; with nobody
 *   watching, it carries on by itself.
 */
export function roundCanClose(room: Room): boolean {
  const humans = seatedHumans(room);
  if (humans.length > 0) return humans.every((k) => room.confirmed.includes(k));
  const watching = watchers(room);
  if (watching.length === 0) return true;
  return room.confirmed.some((k) => watching.includes(k));
}

function maybeCloseRound(room: Room): void {
  const round = room.match.round;
  if (room.phase !== 'playing' || !round || round.core.phase !== 'ended') return;
  if (!roundCanClose(room)) return;
  const before = room.match;
  const { match, changes } = closeRound(room.match);
  const result = round.core.result!;
  const nameAt = (seat: number | null): string | null =>
    seat === null ? null : room.seats[seat] ? room.people[room.seats[seat]!]!.name : null;
  const changesByKey: Record<string, number> = {};
  changes.forEach((c, seat) => {
    const key = room.seats[seat];
    if (key) changesByKey[key] = c;
  });
  room.history = [
    ...(room.history ?? []),
    {
      index: (room.history ?? []).length,
      roundWind: before.roundWind,
      dealer: before.dealer,
      dealerIndex: before.dealerIndex,
      label: { en: matchLabel(before, 'en'), zh: matchLabel(before, 'zh') },
      seatNames: room.seats.map((k) => (k ? room.people[k]!.name : null)),
      result:
        result.type === 'draw'
          ? { type: 'draw' }
          : { type: 'win', winner: nameAt(result.winner) ?? '', discarder: nameAt(result.discarder), fan: result.fan, isChicken: result.isChicken },
      changes: changesByKey,
      seatChanges: changes.slice(),
      seatKeys: room.seats.slice(),
      winnerSeat: result.type === 'win' ? result.winner : null,
      discarderSeat: result.type === 'win' ? result.discarder : null,
      balancesBefore: Object.fromEntries(Object.values(room.people).map((p) => [p.key, p.balance])),
    },
  ];
  changes.forEach((c, seat) => {
    const key = room.seats[seat];
    if (key) room.people[key]!.balance += c;
  });
  // Pressing Ready at the end of a round also counts as Start for the next one.
  const ready = room.confirmed.filter((k) => room.seats.includes(k));
  room.match = match;
  room.confirmed = [];
  room.undoWinVotes = [];
  room.phase = match.finished ? 'finished' : 'betweenRounds';
  room.startPressed = ready;
  maybeBeginRolling(room);
}

function maybeUndoWin(room: Room): void {
  const round = room.match.round;
  if (!round || round.core.result?.type !== 'win') return;
  if (!seatedHumans(room).every((k) => room.undoWinVotes.includes(k))) return;
  setRound(room, undo(round, round.core.turn, true));
}

// ---------- commands ----------

export function handleCommand(prev: Room, key: string, cmd: Command, now: number, rng: Rng): Room {
  const t = prev.tutorial;
  if (!t || prev.people[key]?.cpu) return handleCommandInner(prev, key, cmd, now, rng);
  // The tutorial: during the hand, only the move the current step asks for is allowed.
  const round = prev.phase === 'playing' ? prev.match.round : null;
  const stage = STAGES[t.stage];
  const tileType = (id: number): TileType | undefined => round?.core.hands.flat().find((x) => x.id === id)?.type;
  const matches = !!round && !!stage && 'you' in stage && stage.you(cmd as TutorialCmd, tileType);
  if (round && round.core.phase !== 'ended' && !matches && !ALWAYS_OK.has(cmd.type)) fail('Follow the tutorial: see the note on the table.');
  if (round && cmd.type === 'reorderHand' && !matches && stage && !('you' in stage && stage.id === 'rearrange')) {
    // Rearranging your hand is always fine.
  }
  if (cmd.type === 'tutorialNext') {
    // After the computer players' moves, the tutorial waits for Next.
    const room = cloneRoom(prev);
    const tt = room.tutorial!;
    if (stage && 'cpu' in stage && tt.step >= stage.cpu.length) {
      tt.stage++;
      tt.step = 0;
      tt.nextAt = now;
    }
    return room;
  }
  const room = handleCommandInner(prev, key, cmd, now, rng);
  if (room.tutorial) {
    if (cmd.type === 'pressStart') {
      room.tutorial.readyPresses++;
      maybeBeginRolling(room);
    }
    if (matches) {
      room.tutorial.stage++;
      room.tutorial.step = 0;
      room.tutorial.nextAt = now + 900;
    }
  }
  return room;
}

function handleCommandInner(prev: Room, key: string, cmd: Command, now: number, rng: Rng): Room {
  if (prev.ended) fail('This game has ended.');
  const actor = prev.people[key];
  if (!actor) fail('You are not in this game.');
  if (prev.phase === 'finished' && !['setPrefs', 'rename', 'leaveGame', 'setWatchedSeat', 'setWatchAll'].includes(cmd.type)) {
    fail('The game is finished.');
  }

  const room = cloneRoom(prev);
  const seat = seatOf(room, key);

  switch (cmd.type) {
    case 'takeSeat': {
      if (!Number.isInteger(cmd.seat) || cmd.seat < 0 || cmd.seat >= SEATS) fail('There is no such seat.');
      const occupant = room.seats[cmd.seat];
      if (room.phase !== 'betweenRounds') {
        // Mid-round, a spectator may sit in an empty seat straight away (and plays its tiles).
        // Seated players still only change seats between rounds.
        if (seat !== null) fail('You can only change seats between rounds.');
        if (occupant) fail('That seat is taken.');
      }
      // A free seat, or a CPU's seat (the CPU leaves), can be taken.
      if (occupant !== null && occupant !== undefined && !room.people[occupant]!.cpu) fail('That seat is taken.');
      if (seat !== null) room.seats[seat] = null;
      room.seats[cmd.seat] = key;
      room.startPressed = room.startPressed.filter((k) => k !== key);
      break;
    }
    case 'leaveSeat': {
      if (room.phase !== 'betweenRounds') fail('You can only leave your seat between rounds.');
      if (seat === null) fail('You are not sitting at the table.');
      room.seats[seat!] = null;
      room.startPressed = room.startPressed.filter((k) => k !== key);
      break;
    }
    case 'pressStart': {
      if (room.phase !== 'betweenRounds') fail('The round has already started.');
      requireSeated(room, key);
      if (!room.startPressed.includes(key)) room.startPressed.push(key);
      maybeBeginRolling(room);
      break;
    }
    case 'rollDice': {
      if (room.phase !== 'rolling') fail('It is not time to roll the dice.');
      failIfPaused(room, key);
      if (seat !== room.match.dealer) fail('Only the dealer rolls the dice.');
      startDealing(room, rng);
      break;
    }
    case 'draw':
    case 'drawReplacement':
    case 'discard':
    case 'claim':
    case 'concealedGong':
    case 'addedGong':
    case 'pass':
    case 'selfDrawWin': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      failIfPaused(room, key);
      const next = applyRoundMove(round, s, cmd, now);
      if (cmd.type === 'draw' || cmd.type === 'drawReplacement') noteNewFlowers(room, round, next);
      setRound(room, autoHolds(room, next, now));
      break;
    }
    case 'hold': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      failIfPaused(room, key);
      const kind = cmd.kind;
      if (kind !== null && !['chow', 'pong', 'gong', 'win'].includes(kind)) fail('Unknown claim.');
      setRound(room, holdClaim(round, s, kind, now));
      break;
    }
    case 'releaseHold': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      setRound(room, releaseHold(round, s));
      break;
    }
    case 'reorderHand': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      const hand = round.core.hands[s]!;
      const ids = cmd.tileIds;
      if (ids.length !== hand.length || new Set(ids).size !== ids.length || !ids.every((id) => hand.some((t) => t.id === id))) {
        fail('That is not your hand.');
      }
      const core = structuredClone(round.core);
      core.hands[s] = ids.map((id) => hand.find((t) => t.id === id)!) as Tile[];
      room.match = { ...room.match, round: { ...round, core } };
      break;
    }
    case 'undo': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      const last = round.history[round.history.length - 1];
      if (last?.move === 'win') {
        // Only a chicken win can be undone, and every seated human must agree.
        if (round.core.result?.type !== 'win' || !round.core.result.isChicken) fail('Only a chicken win can be undone.');
        if (!room.undoWinVotes.includes(key)) room.undoWinVotes.push(key);
        maybeUndoWin(room);
      } else {
        // You undo your own last move. A CPU's (or an empty seat's) last move can be
        // undone by any seated player.
        const mover = lastMover(round);
        if (mover === null) return fail('There is nothing to undo.');
        if (mover !== s && !undoableForSeat(room, mover)) fail('You can only undo your own move.');
        setRound(room, undo(round, mover));
        // Give players time to press undo again before the CPUs move.
        room.cpuPauseUntil = now + UNDO_PAUSE_MS;
      }
      break;
    }
    case 'unready': {
      // Take back Ready: before the first hand (Start) or after a hand (the summary's Ready).
      if (room.phase === 'betweenRounds') room.startPressed = room.startPressed.filter((k) => k !== key);
      else if (room.phase === 'playing' && room.match.round?.core.phase === 'ended') room.confirmed = room.confirmed.filter((k) => k !== key);
      else fail('Too late: the hand has started.');
      break;
    }
    case 'confirmRound': {
      const round = requireRound(room);
      if (round.core.phase !== 'ended') fail('The round is not over yet.');
      // Seated players confirm. At an all-CPU table, spectators confirm instead.
      if (seatOf(room, key) === null && seatedHumans(room).length > 0) fail('You are not sitting at the table.');
      if (!room.confirmed.includes(key)) room.confirmed.push(key);
      maybeCloseRound(room);
      break;
    }
    case 'setWatchedSeat':
      if (!Number.isInteger(cmd.seat) || cmd.seat < 0 || cmd.seat >= SEATS) fail('There is no such seat.');
      room.people[key]!.watchingSeats = room.people[key]!.watchingSeats.filter((x) => x !== cmd.seat);
      if (cmd.visible) room.people[key]!.watchingSeats.push(cmd.seat);
      break;
    case 'setWatchAll':
      room.people[key]!.watchAll = !!cmd.visible;
      break;
    case 'setPrefs':
      room.people[key]!.prefs = { ...room.people[key]!.prefs, ...cmd.prefs };
      break;
    case 'rename': {
      const name = cleanName(cmd.newName);
      const newKey = nameKey(name);
      if (newKey !== key && room.people[newKey]) fail('That name is already in use in this game.');
      const person = room.people[key]!;
      delete room.people[key];
      room.people[newKey] = { ...person, key: newKey, name };
      const rekey = (k: string): string => (k === key ? newKey : k);
      room.seats = room.seats.map((k) => (k === null ? null : rekey(k)));
      room.startPressed = room.startPressed.map(rekey);
      room.confirmed = room.confirmed.map(rekey);
      room.undoWinVotes = room.undoWinVotes.map(rekey);
      if (room.pendingSwap) room.pendingSwap = { ...room.pendingSwap, fromKey: rekey(room.pendingSwap.fromKey), toKey: rekey(room.pendingSwap.toKey) };
      // Keep the hand history pointing at the same person.
      const rekeyRecord = (r: Record<string, number>): Record<string, number> =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [rekey(k), v]));
      room.history = (room.history ?? []).map((h) => ({
        ...h,
        changes: rekeyRecord(h.changes),
        balancesBefore: rekeyRecord(h.balancesBefore),
        seatKeys: h.seatKeys?.map((k) => (k === null ? null : rekey(k))),
      }));
      break;
    }
    case 'dropOut': {
      const s = requireSeated(room, key);
      if ('none' in cmd.replacement) {
        room.seats[s] = null;
        room.pendingSwap = room.pendingSwap?.fromKey === key ? null : room.pendingSwap;
        cleanupAfterSeatChange(room, key);
      } else if ('spectator' in cmd.replacement) {
        const toKey = nameKey(cmd.replacement.spectator);
        const to = room.people[toKey];
        if (!to || to.cpu || seatOf(room, toKey) !== null) fail('That spectator is not available.');
        room.pendingSwap = { fromKey: key, toKey, seat: s };
      } else {
        fail('Unknown replacement.');
      }
      break;
    }
    case 'answerSwap': {
      const swap = room.pendingSwap;
      if (!swap || swap.toKey !== key) fail('Nobody has asked you to swap in.');
      room.pendingSwap = null;
      if (cmd.accept) {
        if (room.seats[swap!.seat] !== swap!.fromKey) fail('That seat has changed.');
        room.seats[swap!.seat] = key;
        cleanupAfterSeatChange(room, swap!.fromKey);
      }
      // Tell the player who asked how it went.
      room.swapResult = { fromKey: swap!.fromKey, toName: room.people[key]!.name, accepted: cmd.accept, at: now };
      break;
    }
    case 'cancelSwap': {
      if (room.pendingSwap?.fromKey !== key) fail('You have not asked anyone to swap.');
      room.pendingSwap = null;
      break;
    }
    case 'leaveGame': {
      // The person keeps their seat (shown as disconnected) so the host can
      // wait for them or fill the seat with a CPU.
      room.people[key]!.connected = false;
      room.people[key]!.offlineSince = now;
      break;
    }
    default:
      fail('Unknown command.');
  }
  room.lastChangeAt = now;
  return room;
}

/**
 * Chips a seat is about to win or lose: while the win summary is showing, the
 * payout is shown straight away, though it is only paid when the hand closes
 * (so undoing a chicken win simply takes it back).
 */
export function pendingChange(room: Room, seat: number): number {
  const round = room.phase === 'playing' ? room.match.round : null;
  const result = round?.core.phase === 'ended' ? round.core.result : null;
  return result?.type === 'win' ? result.changes[seat] ?? 0 : 0;
}

/** Host controls from the laptop's host page. */
export function handleHostCommand(prev: Room, cmd: HostCommand, now: number): Room {
  if (prev.ended) fail('This game has ended.');
  const room = cloneRoom(prev);
  switch (cmd.type) {
    case 'hostSetSeat': {
      if (!Number.isInteger(cmd.seat) || cmd.seat < 0 || cmd.seat >= SEATS) fail('There is no such seat.');
      const current = room.seats[cmd.seat] ?? null;
      if (cmd.cpu === null) {
        // Empty the seat: remove a CPU, or force a player out (they become a
        // spectator and keep their chips). Mid-round, the empty seat keeps its
        // tiles and the game waits until someone sits down (or a CPU is added).
        room.seats[cmd.seat] = null;
        if (room.pendingSwap?.seat === cmd.seat) room.pendingSwap = null;
        if (current) cleanupAfterSeatChange(room, current);
      } else {
        room.seats[cmd.seat] = makeCpu(room, cmd.seat, cmd.cpu);
        if (current) cleanupAfterSeatChange(room, current);
      }
      break;
    }
    case 'hostNameCpu': {
      const key = room.seats[cmd.seat];
      const person = key ? room.people[key] : undefined;
      if (!person?.cpu) fail('There is no CPU in that seat.');
      // People sometimes type the "(CPU)" too; it is always added for them.
      const typed = String(cmd.name ?? '').replace(/\(\s*cpu\s*\)\s*$/i, '').trim();
      if (typed) person!.cpuName = cleanName(typed);
      else delete person!.cpuName;
      person!.name = cpuDisplayName(person!);
      break;
    }
    case 'hostResetBalances':
      for (const p of Object.values(room.people)) p.balance = room.startingBalance;
      break;
    case 'hostSetBalance': {
      const person = (cmd.key ? room.people[cmd.key] : undefined) ?? room.people[nameKey(String(cmd.name ?? ''))];
      if (!person) fail('There is nobody with that name in this game.');
      if (!Number.isInteger(cmd.balance) || Math.abs(cmd.balance) > 1_000_000_000) fail('Chips must be a whole number.');
      // During a win summary the shown balance already includes the payout;
      // set it so the player ends up with exactly the number typed.
      const seat = room.seats.indexOf(person!.key);
      person!.balance = cmd.balance - (seat >= 0 ? pendingChange(room, seat) : 0);
      break;
    }
    case 'hostSetCpuSeconds': {
      const sec = Number(cmd.seconds);
      if (!Number.isFinite(sec) || sec < MIN_CPU_SECONDS || sec > MAX_CPU_SECONDS) {
        fail(`CPU time must be between ${MIN_CPU_SECONDS} and ${MAX_CPU_SECONDS} seconds.`);
      }
      room.cpuSeconds = Math.round(sec * 10) / 10;
      break;
    }
    case 'hostRollBack': {
      const history = room.history ?? [];
      const target = history[cmd.toHand];
      if (!Number.isInteger(cmd.toHand) || !target) fail('There is no such game in the history.');
      for (const p of Object.values(room.people)) p.balance = target!.balancesBefore[p.key] ?? room.startingBalance;
      room.history = history.slice(0, cmd.toHand);
      room.historyEdits = (room.historyEdits ?? []).filter((e) => e.hand < cmd.toHand);
      room.match = {
        ...room.match,
        roundWind: target!.roundWind,
        dealer: target!.dealer,
        dealerIndex: target!.dealerIndex,
        handsPlayed: cmd.toHand,
        finished: false,
        lastResult: null,
      };
      cancelRound(room);
      break;
    }
    case 'hostEditHistory': {
      const history = room.history ?? [];
      const h = history[cmd.hand];
      if (!Number.isInteger(cmd.hand) || !h) fail('There is no such game in the history.');
      if (!Number.isInteger(cmd.seat) || cmd.seat < 0 || cmd.seat >= SEATS || !h!.seatNames[cmd.seat]) fail('Nobody sat there in that game.');
      if (!Number.isInteger(cmd.change) || Math.abs(cmd.change) > 1_000_000_000) fail('Chips must be a whole number.');
      const seatChanges = (h!.seatChanges ?? [0, 0, 0, 0]).slice();
      const diff = cmd.change - seatChanges[cmd.seat]!;
      if (diff === 0) break;
      // Who was it? The recorded key, or (old saves) the CPU in that seat / the person with that name.
      const name = h!.seatNames[cmd.seat]!;
      const key =
        h!.seatKeys?.[cmd.seat] ??
        (room.people[`cpu#${cmd.seat}`]?.name === name ? `cpu#${cmd.seat}` : Object.values(room.people).find((p) => p.name === name)?.key ?? null);
      const person = key ? room.people[key] : undefined;
      if (!person) fail('That player is no longer in this game.');
      const updated: HandRecord = {
        ...h!,
        originalSeatChanges: h!.originalSeatChanges ?? seatChanges.slice(),
        seatChanges: seatChanges.map((c, i) => (i === cmd.seat ? cmd.change : c)),
        changes: { ...h!.changes, [person!.key]: cmd.change },
      };
      // Only the difference: nothing else is worked out again, so chips typed in by hand are kept.
      person!.balance += diff;
      // Rolling back to a later hand must keep this edit too.
      room.history = history.map((x, i) =>
        i === cmd.hand ? updated : i > cmd.hand ? { ...x, balancesBefore: { ...x.balancesBefore, [person!.key]: (x.balancesBefore[person!.key] ?? room.startingBalance) + diff } } : x,
      );
      room.historyEdits = [...(room.historyEdits ?? []), { at: now, hand: cmd.hand, seat: cmd.seat, name, from: seatChanges[cmd.seat]!, to: cmd.change }];
      break;
    }
    case 'hostSetPosition': {
      if (!Number.isInteger(cmd.roundWind) || cmd.roundWind < 0 || cmd.roundWind > 3) fail('Choose East, South, West or North.');
      if (!Number.isInteger(cmd.gameNumber) || cmd.gameNumber < 1 || cmd.gameNumber > 4) fail('The game number must be 1 to 4.');
      // The first dealer is seat 0, so game n of every wind is dealt by seat n - 1.
      room.match = {
        ...room.match,
        roundWind: cmd.roundWind,
        dealerIndex: cmd.gameNumber - 1,
        dealer: cmd.gameNumber - 1,
        finished: false,
      };
      cancelRound(room);
      break;
    }
    case 'hostUpdateSettings': {
      if (room.phase !== 'betweenRounds') fail('Game settings can only change between rounds.');
      const settings = { ...room.match.settings, ...cmd.settings };
      checkSettings(settings);
      room.match = { ...room.match, settings };
      if (cmd.startingBalance !== undefined) {
        if (!Number.isFinite(cmd.startingBalance) || cmd.startingBalance < 0) fail('Starting balance must be 0 or more.');
        room.startingBalance = Math.floor(cmd.startingBalance);
      }
      break;
    }
    case 'hostSetTableColour':
      if (!TABLE_COLOURS.includes(cmd.colour)) fail('Unknown table colour.');
      room.tableColour = cmd.colour;
      break;
    case 'hostStopRound': {
      // Throw away the hand being played (or the dice roll before it): nobody
      // pays, chips stay as they were, and the same game is dealt again once
      // everyone presses Start. A finished hand (win summary) can't be stopped.
      const round = room.match.round;
      const inHand = room.phase === 'rolling' || (room.phase === 'playing' && !!round && round.core.phase !== 'ended');
      if (!inHand) fail('There is no hand being played to stop.');
      cancelRound(room);
      room.roundStoppedAt = now;
      break;
    }
    case 'hostEndGame':
      room.ended = true;
      break;
    default:
      fail('Unknown host command.');
  }
  room.lastChangeAt = now;
  return room;
}

/** Stop any round in progress and go back to choosing seats / pressing Start. */
function cancelRound(room: Room): void {
  room.match = { ...room.match, round: null };
  room.phase = 'betweenRounds';
  room.startPressed = [];
  room.confirmed = [];
  room.undoWinVotes = [];
}

function cleanupAfterSeatChange(room: Room, oldKey: string): void {
  room.startPressed = room.startPressed.filter((k) => k !== oldKey);
  room.confirmed = room.confirmed.filter((k) => k !== oldKey);
  room.undoWinVotes = room.undoWinVotes.filter((k) => k !== oldKey);
  maybeBeginRolling(room);
  maybeCloseRound(room);
  maybeUndoWin(room);
}

function startDealing(room: Room, rng: Rng): void {
  // The tutorial deals its prepared hand.
  room.match = room.tutorial && !room.match.round ? { ...room.match, round: tutorialRound(room.match.roundWind, rng) } : beginRound(room.match, rng);
  room.phase = 'playing';
  room.confirmed = [];
  room.undoWinVotes = [];
}

/**
 * "Call all possible claims": when a new tile is offered, hold it straight away for every
 * seated player who turned that on and could claim it.
 */
function autoHolds(room: Room, round: RoundState, now: number): RoundState {
  const w = round.window;
  if (!w || w.status.type !== 'open' || w.holds?.length || round.core.phase === 'ended') return round;
  let out = round;
  room.seats.forEach((k, seat) => {
    const p = k ? room.people[k] : null;
    if (!p || p.cpu || !p.connected || p.prefs.callAll !== true || seat === w.by) return;
    if (!canClaimOffered(out, seat, now)) return;
    try {
      out = holdClaim(out, seat, null, now);
    } catch {
      /* can't hold after all */
    }
  });
  return out;
}

/** A draw may have put flowers in front of a player: work out whether the sound should play. */
function noteNewFlowers(room: Room, before: RoundState, after: RoundState): void {
  const hand = room.match.handsPlayed;
  let glass = room.glass ?? newGlass();
  for (let seat = 0; seat < SEATS; seat++) {
    const added = after.core.flowers[seat]!.slice(before.core.flowers[seat]!.length);
    const key = room.seats[seat];
    if (!key) continue;
    const wind = (seat - after.core.dealer + SEATS) % SEATS;
    for (const f of added) glass = noteFlower(glass, hand, key, seat, f.type, wind);
  }
  room.glass = glass;
}

function applyRoundMove(round: RoundState, seat: number, cmd: Command, now: number): RoundState {
  switch (cmd.type) {
    case 'draw':
      return draw(round, seat, now);
    case 'drawReplacement':
      return drawReplacement(round, seat, now);
    case 'discard':
      return discard(round, seat, cmd.tileId, now);
    case 'claim':
      return claim(round, seat, cmd.claim, now);
    case 'concealedGong':
      return concealedGong(round, seat, cmd.tileType, now);
    case 'addedGong':
      return addedGong(round, seat, cmd.tileType, now);
    case 'selfDrawWin':
      return selfDrawWin(round, seat, now);
    case 'pass':
      return pass(round, seat, now);
    default:
      return fail('Unknown move.');
  }
}

// ---------- the end of the wall ----------

/**
 * Wall empty and nobody can take the last tile any more: end the hand as a tie.
 * The server calls this regularly. Returns the same room if nothing happened.
 */
export function settleWall(prev: Room, now: number): Room {
  const round = prev.match.round;
  if (prev.phase !== 'playing' || !round || round.core.phase === 'ended' || pausedBy(prev).length > 0) return prev;
  const done = settleEmptyWall(round, now);
  if (!done) return prev;
  const room = cloneRoom(prev);
  setRound(room, done);
  room.lastChangeAt = now;
  return room;
}

// ---------- CPU players ----------

/**
 * Let one CPU make one move, if a CPU needs to act and enough time has
 * passed since the last change. Returns the same room if nothing happened.
 * The server calls this regularly.
 */
export function cpuTick(prev: Room, now: number, rng: Rng): Room {
  if (prev.tutorial) return tutorialTick(prev, now, rng);
  if (pausedBy(prev).length > 0) return prev; // someone lost their connection: everyone waits
  if (prev.ended || now - prev.lastChangeAt < cpuDelay(prev) || now < (prev.cpuPauseUntil ?? 0)) return prev;
  const cpuSeats = prev.seats
    .map((k, seat) => ({ k, seat }))
    .filter((x): x is { k: string; seat: number } => x.k !== null && !!prev.people[x.k]!.cpu);
  if (cpuSeats.length === 0) return prev;

  const act = (key: string, cmd: Command): Room => handleCommand(prev, key, cmd, now, rng);

  if (prev.phase === 'betweenRounds') {
    const waiting = cpuSeats.find((c) => !prev.startPressed.includes(c.k));
    // CPUs press Start once every seat is filled.
    if (waiting && prev.seats.every((s) => s !== null)) return act(waiting.k, { type: 'pressStart' });
    if (prev.seats.every((s) => s !== null) && cpuSeats.length === SEATS) {
      // All-CPU table: nobody to wait for.
      const room = cloneRoom(prev);
      maybeBeginRolling(room);
      room.lastChangeAt = now;
      return room;
    }
    return prev;
  }
  // Someone is watching the start-of-hand animation: a CPU waits for it.
  const watched = Object.values(prev.people).some((p) => !p.cpu && p.connected);
  if (prev.phase === 'rolling') {
    // Don't roll before the tiles have been mixed and the wall is built.
    if (watched && now - prev.lastChangeAt < INTRO_BUILD_MS) return prev;
    const dealer = cpuSeats.find((c) => c.seat === prev.match.dealer);
    return dealer ? act(dealer.k, { type: 'rollDice' }) : prev;
  }
  if (prev.phase === 'playing' && prev.match.round) {
    const round = prev.match.round;
    // Nobody has discarded or claimed yet: the tiles may still be flying out of the
    // wall on screen, so wait for the dice, the counting and the dealing first.
    const firstTurn = round.core.discards.length === 0 && round.core.melds.every((m) => m.every((x) => x.kind !== 'pong' && x.kind !== 'chow'));
    const total = round.core.dice[0] + round.core.dice[1] + round.core.dice[2];
    if (watched && firstTurn && round.core.phase !== 'ended' && now - prev.lastChangeAt < introAfterRollMs(total)) return prev;
    if (round.core.phase === 'ended') {
      // CPUs never hold up the next round. At an all-CPU table with nobody
      // watching, carry on by itself (spectators confirm with their button).
      if (seatedHumans(prev).length === 0 && roundCanClose(prev)) {
        const room = cloneRoom(prev);
        maybeCloseRound(room);
        room.lastChangeAt = now;
        return room;
      }
      return prev;
    }
    // Every CPU decides; a win goes first, then other claims (a claim beats the next
    // player's draw, whatever the seat order), then passes, then everything else.
    const choices: { k: string; move: Command; rank: number }[] = [];
    for (const { k, seat } of cpuSeats) {
      // The CPU keeps its plan for this hand (the key names the seat and the hand).
      const memoryKey = `${prev.id}|${prev.match.handsPlayed}|${round.core.dice.join('')}|${seat}`;
      const a = availableActions(round, seat, now);
      const move = cpuMove(round, seat, a, prev.people[k]!.cpu!, rng, now, memoryKey);
      if (move?.type === 'claim') choices.push({ k, move, rank: move.claim.kind === 'win' ? 0 : 1 });
      else if (a.pass) choices.push({ k, move: { type: 'pass' }, rank: 2 }); // wall empty: doesn't want the tile
      else if (move) choices.push({ k, move, rank: 3 });
    }
    choices.sort((x, y) => x.rank - y.rank);
    for (const c of choices) {
      try {
        return act(c.k, c.move);
      } catch {
        // A CPU move that is no longer allowed is simply skipped.
      }
    }
  }
  return prev;
}

// ---------- the tutorial ----------

/** A private tutorial game for one player, with Ming, Fong and Kei (CPUs). */
export function createTutorialRoom(id: string, now: number): Room {
  const room = createRoom({ id, name: 'Tutorial', startingBalance: 200, now });
  room.tutorial = { stage: 0, step: 0, nextAt: 0, readyPresses: 0 };
  TUTORIAL_CPUS.forEach((name, i) => {
    const key = `cpu-${name.toLowerCase()}`;
    room.people[key] = {
      key,
      name: `${name} (CPU)`,
      joinOrder: room.nextJoinOrder++,
      connected: true,
      balance: 200,
      cpu: 'easy',
      cpuName: name,
      watchingSeats: [],
      prefs: {},
    };
    room.seats[i + 1] = key;
  });
  return room;
}

/** The tutorial's computer players make their scripted moves, one at a time. */
function tutorialTick(prev: Room, now: number, rng: Rng): Room {
  const t = prev.tutorial!;
  const round = prev.match.round;
  const stage = STAGES[t.stage];
  if (prev.phase !== 'playing' || !round || round.core.phase === 'ended' || !stage || !('cpu' in stage) || now < t.nextAt) return prev;
  if (t.step >= stage.cpu.length) return prev; // done: waiting for the player's Next
  const [seat, step] = stage.cpu[t.step]!;
  const key = prev.seats[seat]!;
  const hand = round.core.hands[seat]!;
  const id = (type: string, from: Tile[] = hand): number => from.find((x) => x.type === type)!.id;
  let cmd: Command;
  if (step.type === 'discard') cmd = { type: 'discard', tileId: id(step.tile!) };
  else if (step.type === 'claim') {
    const base = round.window?.base.hands[seat] ?? hand;
    const c = step.claim!;
    cmd = c.kind === 'chow' ? { type: 'claim', claim: { kind: 'chow', tileIds: [id(c.tiles![0]!, base), id(c.tiles![1]!, base)] } } : { type: 'claim', claim: { kind: c.kind as 'pong' | 'gong' | 'win' } };
  } else cmd = { type: step.type } as Command;
  let room: Room;
  try {
    room = handleCommandInner(prev, key, cmd, now, rng);
  } catch (err) {
    // Shouldn't happen; skip the move rather than stop the tutorial.
    console.error('Tutorial move failed', step, err);
    room = cloneRoom(prev);
  }
  const tt = room.tutorial!;
  tt.step++;
  tt.nextAt = now + TUTORIAL_CPU_GAP_MS;
  return room;
}
