/**
 * The game server program. It runs on the laptop and:
 * - holds every game (the single source of truth),
 * - talks to each device over a WebSocket and sends each one only its own view,
 * - lets CPU players move,
 * - saves games to a file so they survive a restart,
 * - serves a small web page with the join address and a QR code.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, getRandomValues } from 'node:crypto';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import { Rng } from '@lan-mahjong/shared';
import { GRACE_MS, GameError, WIN_OVERRIDE_MS } from './game/round.js';
import { Room, cpuTick, createRoom, disconnect, handleCommand, joinRoom, nameKey } from './game/room.js';
import { matchLabel } from './game/match.js';
import { viewFor } from './game/view.js';
import { ClientMessage, GameListEntry, ServerMessage } from './protocol.js';
import { loadRooms, saveRooms } from './storage.js';
import { lanAddresses } from './addresses.js';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Where games are saved. null = do not save (used by tests). */
  dataFile: string | null;
  clock?: () => number;
  rng?: Rng;
  /** How often CPUs and timers are checked (milliseconds). */
  tickMs?: number;
}

export interface RunningServer {
  port: number;
  urls: string[];
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

/** Fair random numbers from the operating system, for real games. */
export const cryptoRng: Rng = () => getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

interface Client {
  roomId: string | null;
  key: string | null;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const now = opts.clock ?? Date.now;
  const rng = opts.rng ?? cryptoRng;
  const rooms = new Map<string, Room>();
  for (const r of opts.dataFile ? loadRooms(opts.dataFile) : []) rooms.set(r.id, r);

  const clients = new Map<WebSocket, Client>();
  const lastSent = new Map<string, number>(); // roomId → last broadcast time
  let lastGameList = '';

  // ---------- saving ----------
  let saveTimer: NodeJS.Timeout | null = null;
  const saveNow = (): void => {
    if (!opts.dataFile) return;
    try {
      saveRooms(opts.dataFile, rooms.values());
    } catch (err) {
      console.error('Could not save games:', err);
    }
  };
  const scheduleSave = (): void => {
    if (!opts.dataFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 500);
  };

  // ---------- sending ----------
  const send = (ws: WebSocket, msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const gameList = (): GameListEntry[] =>
    [...rooms.values()]
      .filter((r) => !r.ended)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        id: r.id,
        name: r.name,
        label: { en: matchLabel(r.match, 'en'), zh: matchLabel(r.match, 'zh') },
        hostName: r.people[r.hostKey]?.name ?? '',
        seats: r.seats.map((k) => (k ? r.people[k]!.name : null)),
        spectators: Object.values(r.people).filter((p) => !p.cpu && !r.seats.includes(p.key) && p.connected).length,
        phase: r.phase,
      }));

  /** Send the game list to devices on the start screen, if it changed. */
  const sendGameListIfChanged = (): void => {
    const games = gameList();
    const json = JSON.stringify(games);
    if (json === lastGameList) return;
    lastGameList = json;
    for (const [ws, c] of clients) if (!c.roomId) send(ws, { type: 'games', games });
  };

  /** Send every device in a room its own view. */
  const broadcast = (roomId: string): void => {
    const room = rooms.get(roomId);
    if (!room) return;
    const t = now();
    lastSent.set(roomId, t);
    for (const [ws, c] of clients) {
      if (c.roomId === roomId && c.key && room.people[c.key]) send(ws, { type: 'state', view: viewFor(room, c.key, t) });
    }
    sendGameListIfChanged();
    scheduleSave();
  };

  const setRoom = (room: Room): void => {
    if (room.ended) {
      rooms.delete(room.id);
      for (const [ws, c] of clients) {
        if (c.roomId === room.id) {
          send(ws, { type: 'gameEnded', gameId: room.id });
          c.roomId = null;
          c.key = null;
        }
      }
      sendGameListIfChanged();
      scheduleSave();
      return;
    }
    rooms.set(room.id, room);
    broadcast(room.id);
  };

  // ---------- handling a message from a device ----------
  const handleMessage = (ws: WebSocket, c: Client, msg: ClientMessage): void => {
    switch (msg.type) {
      case 'listGames':
        send(ws, { type: 'games', games: gameList() });
        return;
      case 'createGame': {
        disconnectClient(c);
        const room = createRoom({
          id: randomUUID().slice(0, 8),
          name: String(msg.gameName ?? ''),
          hostName: String(msg.name ?? ''),
          startingBalance: Number(msg.startingBalance),
          settings: msg.settings,
          now: now(),
        });
        c.roomId = room.id;
        c.key = room.hostKey;
        send(ws, { type: 'joined', gameId: room.id, name: room.people[room.hostKey]!.name });
        setRoom(room);
        return;
      }
      case 'joinGame': {
        const room = rooms.get(String(msg.gameId));
        if (!room) throw new GameError('That game no longer exists.');
        const { room: joined, person } = joinRoom(room, String(msg.name ?? ''), now());
        disconnectClient(c);
        c.roomId = joined.id;
        c.key = person.key;
        send(ws, { type: 'joined', gameId: joined.id, name: person.name });
        setRoom(joined);
        return;
      }
      case 'command': {
        const room = c.roomId ? rooms.get(c.roomId) : undefined;
        if (!room || !c.key) throw new GameError('You are not in a game.');
        const cmd = msg.command;
        if (!cmd || typeof cmd !== 'object') throw new GameError('Bad command.');
        const updated = handleCommand(room, c.key, cmd, now(), rng);
        // A rename changes the person's key.
        if (cmd.type === 'rename') c.key = nameKey(String(cmd.newName));
        if (cmd.type === 'leaveGame') {
          c.roomId = null;
          c.key = null;
          send(ws, { type: 'games', games: gameList() });
        }
        setRoom(updated);
        return;
      }
      case 'leaveGame': {
        const room = c.roomId ? rooms.get(c.roomId) : undefined;
        if (room && c.key) {
          const updated = handleCommand(room, c.key, { type: 'leaveGame' }, now(), rng);
          c.roomId = null;
          c.key = null;
          setRoom(updated);
        }
        send(ws, { type: 'games', games: gameList() });
        return;
      }
      default:
        throw new GameError('Unknown message.');
    }
  };

  /** Mark this device's person as disconnected (they keep their seat). */
  const disconnectClient = (c: Client): void => {
    if (!c.roomId || !c.key) return;
    const room = rooms.get(c.roomId);
    const key = c.key;
    c.roomId = null;
    c.key = null;
    if (room?.people[key]) setRoom(disconnect(room, key, now()));
  };

  // ---------- web pages ----------
  const port = opts.port;
  const urlsFor = (p: number): string[] => lanAddresses().map((ip) => `http://${ip}:${p}`);

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleHttp(req, res).catch((err) => {
      console.error(err);
      res.writeHead(500).end('Server error');
    });
  });

  const handleHttp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const actualPort = (http.address() as { port: number }).port;
    const urls = urlsFor(actualPort);
    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: 'LAN Mahjong', port: actualPort, urls }));
      return;
    }
    if (url.pathname === '/api/games') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(gameList()));
      return;
    }
    if (url.pathname === '/api/qr.svg') {
      const target = urls[0] ?? `http://localhost:${actualPort}`;
      const svg = await QRCode.toString(target, { type: 'svg', margin: 1 });
      res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(svg);
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(placeholderPage(urls, gameList()));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  };

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    const c: Client = { roomId: null, key: null };
    clients.set(ws, c);
    send(ws, { type: 'games', games: gameList() });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data)) as ClientMessage;
      } catch {
        send(ws, { type: 'error', message: 'Bad message.' });
        return;
      }
      try {
        handleMessage(ws, c, msg);
      } catch (err) {
        if (err instanceof GameError) {
          send(ws, { type: 'error', message: err.message });
        } else {
          console.error('Unexpected error handling', msg, err);
          send(ws, { type: 'error', message: 'Something went wrong. Please try again.' });
        }
        // Make sure the device shows the real current state after a refused move.
        if (c.roomId) {
          const room = rooms.get(c.roomId);
          if (room && c.key && room.people[c.key]) send(ws, { type: 'state', view: viewFor(room, c.key, now()) });
        }
      }
    });
    ws.on('close', () => {
      disconnectClient(c);
      clients.delete(ws);
    });
  });

  // ---------- CPU moves and hidden timers ----------
  const tick = (): void => {
    const t = now();
    for (const room of [...rooms.values()]) {
      const updated = cpuTick(room, t, rng);
      if (updated !== room) {
        setRoom(updated);
        continue;
      }
      // When a hidden claim window runs out, buttons must disappear: resend views.
      const w = room.match.round?.window;
      if (w && w.status.type !== 'open') {
        const sent = lastSent.get(room.id) ?? 0;
        const deadlines = [w.status.at + GRACE_MS, w.status.at + WIN_OVERRIDE_MS];
        if (deadlines.some((d) => d > sent && d <= t)) broadcast(room.id);
      }
    }
  };
  const interval = setInterval(tick, opts.tickMs ?? 250);

  await new Promise<void>((resolve) => http.listen(port, opts.host ?? '0.0.0.0', resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    urls: urlsFor(actualPort),
    rooms,
    close: async () => {
      clearInterval(interval);
      if (saveTimer) clearTimeout(saveTimer);
      saveNow();
      for (const ws of clients.keys()) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Temporary start page until the real screens are built in phase 3. */
function placeholderPage(urls: string[], games: GameListEntry[]): string {
  const list = games.length
    ? games.map((g) => `<li>${escapeHtml(g.name)} (${escapeHtml(g.label.en)}) – ${g.seats.filter(Boolean).length}/4 seated</li>`).join('')
    : '<li>No games yet</li>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LAN Mahjong server</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px;text-align:center}
img{background:#fff;padding:8px;width:220px;height:220px;border-radius:8px}code{font-size:1.3em}</style></head>
<body><h1>LAN Mahjong server is running</h1>
<p>Scan to join, or type this address on each device:</p>
<p><img src="/api/qr.svg" alt="QR code"></p>
<p>${urls.map((u) => `<code>${escapeHtml(u)}</code>`).join('<br>') || 'No network address found'}</p>
<h2>Games</h2><ul style="list-style:none;padding:0">${list}</ul>
<p style="opacity:.6">The game screens are added in phase 3.</p></body></html>`;
}
