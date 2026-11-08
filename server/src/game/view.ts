/**
 * What each device is allowed to see. The server sends every device ONLY its
 * own view, built here. Hidden information never leaves the server:
 * - other players' hidden tiles (only how many they hold),
 * - the faces of tiles in the wall,
 * - the undo history and claim-window snapshots.
 *
 * Spectators choose which players' hands they see (all hidden at first).
 * When a round ends, every hand is shown to everyone.
 *
 * The host page on the laptop gets a HostGameView: everything needed to run
 * the game, but no hidden tiles (the laptop owner may be playing too).
 */
import { GameSettings, Meld, SEATS, Tile, tilesLeft } from '@lan-mahjong/shared';
import { matchLabel } from './match.js';
import { AvailableActions, DiscardEntry, Phase, RoundResult, availableActions, currentPlayer } from './round.js';
import { CpuDifficulty, CpuSpeed, HandRecord, PendingSwap, Room, RoomPhase, TableColour, seatOf } from './room.js';

export interface SeatView {
  seat: number;
  name: string | null;
  cpu: CpuDifficulty | null;
  connected: boolean;
  balance: number | null;
  isDealer: boolean;
  /** This seat's wind for the current round: 0 East ... 3 North. */
  wind: number;
  handCount: number;
  /** Only filled in when the viewer may see this hand. */
  hand: Tile[] | null;
  melds: Meld[];
  flowers: Tile[];
  startPressed: boolean;
  confirmed: boolean;
  votedUndoWin: boolean;
  /** For a spectator: have they chosen to see this hand? */
  watched: boolean;
}

export interface RoomView {
  id: string;
  name: string;
  label: { en: string; zh: string };
  you: { name: string; seat: number | null; watchingSeats: number[]; watchAll: boolean; prefs: Record<string, unknown> };
  phase: RoomPhase;
  settings: GameSettings;
  startingBalance: number;
  tableColour: TableColour;
  match: { roundWind: number; dealer: number; dealerIndex: number; handsPlayed: number; finished: boolean };
  seats: SeatView[];
  spectators: { name: string; connected: boolean; balance: number }[];
  round: null | {
    phase: Phase;
    turn: number;
    currentPlayer: number | null;
    dice: [number, number, number];
    discards: DiscardEntry[];
    /** Tiles left in each stack, in draw order (no faces). */
    wall: { seat: number; position: number; count: number }[];
    wallCount: number;
    /** The tile that can currently be claimed, if any. */
    offered: { tile: Tile; by: number } | null;
    result: RoundResult | null;
  };
  /** Your buttons. Null if you are not seated or no round is on. */
  actions: AvailableActions | null;
  pendingSwap: (PendingSwap & { fromName: string; toName: string }) | null;
  ended: boolean;
}

export function viewFor(room: Room, viewerKey: string, now: number): RoomView {
  const viewer = room.people[viewerKey];
  if (!viewer) throw new Error('Unknown viewer.');
  const mySeat = seatOf(room, viewerKey);
  const round = room.phase === 'playing' ? room.match.round : null;
  const ended = round?.core.phase === 'ended';
  const dealer = round?.core.dealer ?? room.match.dealer;

  const seats: SeatView[] = room.seats.map((key, seat) => {
    const p = key ? room.people[key]! : null;
    const hand = round?.core.hands[seat] ?? [];
    const canSee =
      !!round && (seat === mySeat || ended || (mySeat === null && (!!viewer.watchAll || viewer.watchingSeats.includes(seat))));
    return {
      seat,
      name: p?.name ?? null,
      cpu: p?.cpu ?? null,
      connected: p?.connected ?? false,
      balance: p?.balance ?? null,
      isDealer: seat === dealer,
      wind: (seat - dealer + SEATS) % SEATS,
      handCount: hand.length,
      hand: canSee ? hand : null,
      melds: round?.core.melds[seat] ?? [],
      flowers: round?.core.flowers[seat] ?? [],
      startPressed: !!key && room.startPressed.includes(key),
      confirmed: !!key && room.confirmed.includes(key),
      votedUndoWin: !!key && room.undoWinVotes.includes(key),
      watched: mySeat === null && viewer.watchingSeats.includes(seat),
    };
  });

  const seatedKeys = new Set(room.seats.filter(Boolean));
  const spectators = Object.values(room.people)
    .filter((p) => !p.cpu && !seatedKeys.has(p.key))
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => ({ name: p.name, connected: p.connected, balance: p.balance }));

  const swap = room.pendingSwap;
  const visibleSwap =
    swap && (swap.fromKey === viewerKey || swap.toKey === viewerKey)
      ? { ...swap, fromName: room.people[swap.fromKey]?.name ?? '', toName: room.people[swap.toKey]?.name ?? '' }
      : null;

  return {
    id: room.id,
    name: room.name,
    label: { en: matchLabel(room.match, 'en'), zh: matchLabel(room.match, 'zh') },
    you: {
      name: viewer.name,
      seat: mySeat,
      watchingSeats: viewer.watchingSeats.slice().sort(),
      watchAll: mySeat === null && !!viewer.watchAll,
      prefs: viewer.prefs,
    },
    phase: room.phase,
    settings: room.match.settings,
    startingBalance: room.startingBalance,
    tableColour: room.tableColour,
    match: {
      roundWind: room.match.roundWind,
      dealer: room.match.dealer,
      dealerIndex: room.match.dealerIndex,
      handsPlayed: room.match.handsPlayed,
      finished: room.match.finished,
    },
    seats,
    spectators,
    round: round
      ? {
          phase: round.core.phase,
          turn: round.core.turn,
          currentPlayer: currentPlayer(round),
          dice: round.core.dice,
          discards: round.core.discards,
          wall: round.core.wall.stacks.map((s) => ({ seat: s.seat, position: s.position, count: s.tiles.length })),
          wallCount: tilesLeft(round.core.wall),
          offered: round.window ? { tile: round.window.tile, by: round.window.by } : null,
          result: round.core.result,
        }
      : null,
    actions: round && mySeat !== null ? availableActions(round, mySeat, now) : null,
    pendingSwap: visibleSwap,
    ended: room.ended,
  };
}

// ---------- the host page on the laptop ----------

export interface HostGameView {
  id: string;
  name: string;
  label: { en: string; zh: string };
  phase: RoomPhase;
  settings: GameSettings;
  startingBalance: number;
  tableColour: TableColour;
  cpuSpeed: CpuSpeed;
  match: RoomView['match'];
  seats: { seat: number; name: string | null; cpu: CpuDifficulty | null; connected: boolean; balance: number | null }[];
  /** Everyone in the game who is not seated (not CPUs). */
  spectators: { name: string; connected: boolean; balance: number }[];
  /** Short summary of the round, with no hidden tiles. */
  round: null | { phase: Phase; turn: number; wallCount: number; result: RoundResult | null };
  /** Finished hands, oldest first, with chip changes by name. */
  history: (Omit<HandRecord, 'changes' | 'balancesBefore'> & { changes: { name: string; change: number }[] })[];
}

export function hostViewOf(room: Room): HostGameView {
  const seatedKeys = new Set(room.seats.filter(Boolean));
  const round = room.phase === 'playing' ? room.match.round : null;
  return {
    id: room.id,
    name: room.name,
    label: { en: matchLabel(room.match, 'en'), zh: matchLabel(room.match, 'zh') },
    phase: room.phase,
    settings: room.match.settings,
    startingBalance: room.startingBalance,
    tableColour: room.tableColour,
    cpuSpeed: room.cpuSpeed ?? 'normal',
    match: {
      roundWind: room.match.roundWind,
      dealer: room.match.dealer,
      dealerIndex: room.match.dealerIndex,
      handsPlayed: room.match.handsPlayed,
      finished: room.match.finished,
    },
    seats: room.seats.map((key, seat) => {
      const p = key ? room.people[key]! : null;
      return { seat, name: p?.name ?? null, cpu: p?.cpu ?? null, connected: p?.connected ?? false, balance: p?.balance ?? null };
    }),
    spectators: Object.values(room.people)
      .filter((p) => !p.cpu && !seatedKeys.has(p.key))
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({ name: p.name, connected: p.connected, balance: p.balance })),
    round: round
      ? { phase: round.core.phase, turn: round.core.turn, wallCount: tilesLeft(round.core.wall), result: round.core.result }
      : null,
    history: (room.history ?? []).map((h) => ({
      index: h.index,
      roundWind: h.roundWind,
      dealer: h.dealer,
      dealerIndex: h.dealerIndex,
      label: h.label,
      seatNames: h.seatNames,
      result: h.result,
      changes: Object.entries(h.changes).map(([key, change]) => ({ name: room.people[key]?.name ?? key, change })),
    })),
  };
}
