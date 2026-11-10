/**
 * The messages devices and the server send each other over the WebSocket.
 * Every message is JSON with a "type".
 */
import type { GameSettings } from '@lan-mahjong/shared';
import type { Command, HostCommand } from './game/room.js';
import type { HostGameView, RoomView } from './game/view.js';

export interface GameListEntry {
  id: string;
  name: string;
  /** e.g. { en: 'East, game 2', zh: '東風 第2局' } */
  label: { en: string; zh: string };
  /** Names in seats 0-3 (null = empty). */
  seats: (string | null)[];
  spectators: number;
  phase: RoomView['phase'];
}

/** Player's device → server (WebSocket at /ws). Players can only join games. */
export type ClientMessage =
  | { type: 'listGames' }
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

/**
 * Host page → server (WebSocket at /host-ws). Only accepted from the laptop
 * running the server itself; devices on the network are refused.
 */
export type HostMessage =
  | { type: 'hostCreateGame'; gameName: string; startingBalance: number; settings?: Partial<GameSettings> }
  | { type: 'hostCommand'; gameId: string; command: HostCommand };

/** Server → host page. */
export type ServerHostMessage =
  | { type: 'hostState'; games: HostGameView[]; urls: string[] }
  | { type: 'hostCreated'; gameId: string }
  | { type: 'error'; message: string };
