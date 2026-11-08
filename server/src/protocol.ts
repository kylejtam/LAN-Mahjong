/**
 * The messages devices and the server send each other over the WebSocket.
 * Every message is JSON with a "type".
 */
import type { GameSettings } from '@lan-mahjong/shared';
import type { Command } from './game/room.js';
import type { RoomView } from './game/view.js';

export interface GameListEntry {
  id: string;
  name: string;
  /** e.g. { en: 'East, game 2', zh: '東風 第2局' } */
  label: { en: string; zh: string };
  hostName: string;
  /** Names in seats 0-3 (null = empty). */
  seats: (string | null)[];
  spectators: number;
  phase: RoomView['phase'];
}

/** Device → server. */
export type ClientMessage =
  | { type: 'listGames' }
  | {
      type: 'createGame';
      name: string;
      gameName: string;
      startingBalance: number;
      settings?: Partial<GameSettings>;
    }
  | { type: 'joinGame'; gameId: string; name: string }
  | { type: 'command'; command: Command }
  | { type: 'leaveGame' };

/** Server → device. */
export type ServerMessage =
  | { type: 'games'; games: GameListEntry[] }
  | { type: 'joined'; gameId: string; name: string }
  | { type: 'state'; view: RoomView }
  | { type: 'error'; message: string }
  | { type: 'gameEnded'; gameId: string };
