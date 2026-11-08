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
import { DEFAULT_SETTINGS, GameSettings, NormalType, Rng, SEATS, Tile } from '@lan-mahjong/shared';
import { MatchState, beginRound, closeRound, newMatch } from './match.js';
import {
  Claim,
  GameError,
  RoundState,
  addedGong,
  availableActions,
  claim,
  concealedGong,
  currentPlayer,
  discard,
  draw,
  drawReplacement,
  selfDrawWin,
  undo,
} from './round.js';
import { cpuMove } from './cpu.js';

export type CpuDifficulty = 'easy' | 'medium' | 'hard';
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
  balance: number;
  cpu: CpuDifficulty | null;
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
  nextJoinOrder: number;
  /** Last time anything changed (used to pace CPU moves). */
  lastChangeAt: number;
  ended: boolean;
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
  | { type: 'concealedGong'; tileType: NormalType }
  | { type: 'addedGong'; tileType: NormalType }
  | { type: 'selfDrawWin' }
  | { type: 'reorderHand'; tileIds: number[] }
  | { type: 'undo' }
  | { type: 'confirmRound' }
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
  | { type: 'leaveGame' };

/** Host controls. These only come from the host page on the server laptop. */
export type HostCommand =
  /** Put a CPU in a seat (replacing whoever is there), or empty a CPU seat (cpu: null). */
  | { type: 'hostSetSeat'; seat: number; cpu: CpuDifficulty | null }
  | { type: 'hostResetBalances' }
  | { type: 'hostUpdateSettings'; settings: Partial<GameSettings>; startingBalance?: number }
  | { type: 'hostSetTableColour'; colour: TableColour }
  | { type: 'hostEndGame' };

/** How long CPUs wait after the last change before they move (milliseconds). */
export const CPU_DELAY_MS = 900;
export const MAX_NAME_LENGTH = 20;

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

const CPU_NAMES = ['CPU East', 'CPU South', 'CPU West', 'CPU North'];

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
  if (p) p.connected = false;
  room.lastChangeAt = now;
  return room;
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
  if (!Number.isInteger(s.minFan) || s.minFan < 0 || s.minFan > 10) fail('Minimum fan must be 0 to 10.');
  if (s.payoutMode !== 'everyonePays' && s.payoutMode !== 'discarderPays') fail('Unknown payout setting.');
}

function setRound(room: Room, round: RoundState): void {
  room.match = { ...room.match, round };
  // Any change to the round cancels confirmations and votes (the result may have changed).
  room.confirmed = [];
  room.undoWinVotes = [];
}

function makeCpu(room: Room, seat: number, difficulty: CpuDifficulty): string {
  let name = CPU_NAMES[seat]!;
  let n = 2;
  while (room.people[nameKey(name)] && !room.people[nameKey(name)]!.cpu) name = `${CPU_NAMES[seat]} ${n++}`;
  const key = nameKey(name);
  const existing = room.people[key];
  if (existing) {
    existing.cpu = difficulty;
    return key;
  }
  room.people[key] = {
    key,
    name,
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
  if (room.seats.some((s) => s === null)) return;
  if (seatedHumans(room).every((k) => room.startPressed.includes(k))) {
    room.phase = 'rolling';
    room.startPressed = [];
  }
}

/** If the round is over and everyone has confirmed, pay out and get ready for the next one. */
function maybeCloseRound(room: Room): void {
  const round = room.match.round;
  if (room.phase !== 'playing' || !round || round.core.phase !== 'ended') return;
  if (!seatedHumans(room).every((k) => room.confirmed.includes(k))) return;
  const { match, changes } = closeRound(room.match);
  changes.forEach((c, seat) => {
    const key = room.seats[seat];
    if (key) room.people[key]!.balance += c;
  });
  room.match = match;
  room.confirmed = [];
  room.undoWinVotes = [];
  room.phase = match.finished ? 'finished' : 'betweenRounds';
}

function maybeUndoWin(room: Room): void {
  const round = room.match.round;
  if (!round || round.core.result?.type !== 'win') return;
  if (!seatedHumans(room).every((k) => room.undoWinVotes.includes(k))) return;
  setRound(room, undo(round, round.core.turn, true));
}

// ---------- commands ----------

export function handleCommand(prev: Room, key: string, cmd: Command, now: number, rng: Rng): Room {
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
      if (room.phase !== 'betweenRounds') fail('You can only change seats between rounds.');
      if (!Number.isInteger(cmd.seat) || cmd.seat < 0 || cmd.seat >= SEATS) fail('There is no such seat.');
      const occupant = room.seats[cmd.seat];
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
    case 'selfDrawWin': {
      const round = requireRound(room);
      const s = requireSeated(room, key);
      setRound(room, applyRoundMove(round, s, cmd, now));
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
        // Undoing a win needs every seated human to agree.
        if (!room.undoWinVotes.includes(key)) room.undoWinVotes.push(key);
        maybeUndoWin(room);
      } else {
        if (currentPlayer(round) !== s) fail('Only the player whose turn it is can undo.');
        setRound(room, undo(round, s));
      }
      break;
    }
    case 'confirmRound': {
      const round = requireRound(room);
      if (round.core.phase !== 'ended') fail('The round is not over yet.');
      requireSeated(room, key);
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
      break;
    }
    case 'leaveGame': {
      // The person keeps their seat (shown as disconnected) so the host can
      // wait for them or fill the seat with a CPU.
      room.people[key]!.connected = false;
      break;
    }
    default:
      fail('Unknown command.');
  }
  room.lastChangeAt = now;
  return room;
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
        // Remove a CPU (only between rounds, so a hand is never left without a player).
        if (room.phase !== 'betweenRounds') fail('You can only empty a seat between rounds.');
        if (current && !room.people[current]!.cpu) fail('Only CPU seats can be emptied this way.');
        room.seats[cmd.seat] = null;
      } else {
        room.seats[cmd.seat] = makeCpu(room, cmd.seat, cmd.cpu);
        if (current) cleanupAfterSeatChange(room, current);
      }
      break;
    }
    case 'hostResetBalances':
      for (const p of Object.values(room.people)) p.balance = room.startingBalance;
      break;
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
    case 'hostEndGame':
      room.ended = true;
      break;
    default:
      fail('Unknown host command.');
  }
  room.lastChangeAt = now;
  return room;
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
  room.match = beginRound(room.match, rng);
  room.phase = 'playing';
  room.confirmed = [];
  room.undoWinVotes = [];
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
    default:
      return fail('Unknown move.');
  }
}

// ---------- CPU players ----------

/**
 * Let one CPU make one move, if a CPU needs to act and enough time has
 * passed since the last change. Returns the same room if nothing happened.
 * The server calls this regularly.
 */
export function cpuTick(prev: Room, now: number, rng: Rng): Room {
  if (prev.ended || now - prev.lastChangeAt < CPU_DELAY_MS) return prev;
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
  if (prev.phase === 'rolling') {
    const dealer = cpuSeats.find((c) => c.seat === prev.match.dealer);
    return dealer ? act(dealer.k, { type: 'rollDice' }) : prev;
  }
  if (prev.phase === 'playing' && prev.match.round) {
    const round = prev.match.round;
    if (round.core.phase === 'ended') {
      // CPUs never hold up the next round. With only CPUs, carry on by itself.
      if (seatedHumans(prev).length === 0) {
        const room = cloneRoom(prev);
        maybeCloseRound(room);
        room.lastChangeAt = now;
        return room;
      }
      return prev;
    }
    for (const { k, seat } of cpuSeats) {
      const move = cpuMove(round, seat, availableActions(round, seat, now), prev.people[k]!.cpu!, rng);
      if (move) {
        try {
          return act(k, move);
        } catch {
          // A CPU move that is no longer allowed is simply skipped.
        }
      }
    }
  }
  return prev;
}
