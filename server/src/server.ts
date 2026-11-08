/**
 * The game server program. It runs on the laptop and:
 * - holds every game (the single source of truth),
 * - talks to each device over a WebSocket and sends each one only its own view,
 * - lets CPU players move,
 * - saves games to a file so they survive a restart,
 * - serves a small web page with the join address and a QR code,
 * - runs the HOST PAGE (/host): creating games and all host controls. The
 *   host page only works on the laptop itself; devices on the network are
 *   refused, so players can only join games.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { randomUUID, getRandomValues } from 'node:crypto';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import { Rng } from '@lan-mahjong/shared';
import { GRACE_MS, GameError, WIN_OVERRIDE_MS } from './game/round.js';
import { Room, cpuTick, createRoom, disconnect, handleCommand, handleHostCommand, joinRoom, nameKey } from './game/room.js';
import { matchLabel } from './game/match.js';
import { hostViewOf, viewFor } from './game/view.js';
import { CPU_LEVEL_DESCRIPTIONS } from './game/cpu.js';
import { ClientMessage, GameListEntry, HostMessage, ServerHostMessage, ServerMessage } from './protocol.js';
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
  /** Folder with the built screens (client/dist). */
  clientDir?: string;
  /** Which connections may use the host page. Default: only this computer. */
  isHostAddress?: (address: string | undefined) => boolean;
}

const DEFAULT_CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

interface ClientFile {
  body: Buffer;
  /** The same file squeezed with gzip, if that makes it smaller (text files only). */
  gzipped: Buffer | null;
  type: string;
}

/** Built screen files kept in memory, so the disk is read once (re-read if the file changes). */
const fileCache = new Map<string, { mtimeMs: number; size: number; file: ClientFile }>();
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);

/** Read a file from the built screens folder, refusing anything outside it. */
function readClientFile(dir: string, urlPath: string): ClientFile | null {
  const full = normalize(join(dir, decodeURIComponent(urlPath)));
  if (!full.startsWith(dir + sep)) return null;
  if (!existsSync(full)) return null;
  const stat = statSync(full);
  if (!stat.isFile()) return null;
  const cached = fileCache.get(full);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.file;
  const body = readFileSync(full);
  const ext = extname(full);
  let gzipped: Buffer | null = null;
  if (COMPRESSIBLE.has(ext) && body.length > 512) {
    const gz = gzipSync(body, { level: 9 });
    if (gz.length < body.length) gzipped = gz;
  }
  const file = { body, gzipped, type: CONTENT_TYPES[ext] ?? 'application/octet-stream' };
  fileCache.set(full, { mtimeMs: stat.mtimeMs, size: stat.size, file });
  return file;
}

/** Send a screen file, compressed when the browser accepts it (every modern browser does). */
function sendClientFile(req: IncomingMessage, res: ServerResponse, file: ClientFile, cacheControl: string): void {
  const headers: Record<string, string> = { 'content-type': file.type, 'cache-control': cacheControl };
  if (file.gzipped) {
    headers.vary = 'accept-encoding';
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      headers['content-encoding'] = 'gzip';
      res.writeHead(200, headers).end(file.gzipped);
      return;
    }
  }
  res.writeHead(200, headers).end(file.body);
}

/** Is this connection from the server's own computer? */
export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
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
  const hostSockets = new Set<WebSocket>();
  const isHostAddress = opts.isHostAddress ?? isLoopback;
  const clientDir = resolve(opts.clientDir ?? DEFAULT_CLIENT_DIR);
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
  const send = (ws: WebSocket, msg: ServerMessage | ServerHostMessage): void => {
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

  /** Send the host page(s) on the laptop the latest overview of every game. */
  const sendHostState = (): void => {
    if (hostSockets.size === 0) return;
    const msg: ServerHostMessage = {
      type: 'hostState',
      games: [...rooms.values()].sort((a, b) => a.createdAt - b.createdAt).map(hostViewOf),
      urls: urlsFor(actualPortOf()),
      cpuLevels: CPU_LEVEL_DESCRIPTIONS,
    };
    for (const ws of hostSockets) send(ws, msg);
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
    sendHostState();
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
      sendHostState();
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

  // ---------- handling a message from the host page ----------
  const handleHostMessage = (ws: WebSocket, msg: HostMessage): void => {
    switch (msg.type) {
      case 'hostCreateGame': {
        const room = createRoom({
          id: randomUUID().slice(0, 8),
          name: String(msg.gameName ?? ''),
          startingBalance: Number(msg.startingBalance),
          settings: msg.settings,
          now: now(),
        });
        setRoom(room);
        send(ws, { type: 'hostCreated', gameId: room.id });
        return;
      }
      case 'hostCommand': {
        const room = rooms.get(String(msg.gameId));
        if (!room) throw new GameError('That game no longer exists.');
        if (!msg.command || typeof msg.command !== 'object') throw new GameError('Bad command.');
        setRoom(handleHostCommand(room, msg.command, now()));
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

  const actualPortOf = (): number => (http.address() as { port: number } | null)?.port ?? port;

  const handleHttp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const urls = urlsFor(actualPortOf());
    const actualPort = actualPortOf();
    if (url.pathname === '/host') {
      if (!isHostAddress(req.socket.remoteAddress)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('The host page only opens on the laptop running the server.');
        return;
      }
      const page = readClientFile(clientDir, '/host.html');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page ? page.body : hostPlaceholderPage(urls));
      return;
    }
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
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const page = readClientFile(clientDir, '/index.html');
      if (page) sendClientFile(req, res, page, 'no-cache');
      else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(placeholderPage(urls, gameList()));
      return;
    }
    if (url.pathname === '/info') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(placeholderPage(urls, gameList()));
      return;
    }
    if (url.pathname !== '/host.html') {
      const file = readClientFile(clientDir, url.pathname);
      if (file) {
        const cache = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
        sendClientFile(req, res, file, cache);
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  };

  // ---------- WebSocket ----------
  // Two WebSocket doors: /ws for players, /host-ws for the host page (laptop only).
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const hostWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else if (path === '/host-ws' && isHostAddress(req.socket.remoteAddress)) {
      hostWss.handleUpgrade(req, socket, head, (ws) => hostWss.emit('connection', ws, req));
    } else {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
    }
  });

  hostWss.on('connection', (ws) => {
    watch(ws);
    hostSockets.add(ws);
    sendHostState();
    ws.on('message', (data) => {
      try {
        handleHostMessage(ws, JSON.parse(String(data)) as HostMessage);
      } catch (err) {
        if (!(err instanceof GameError)) console.error('Unexpected host page error:', err);
        send(ws, { type: 'error', message: err instanceof GameError ? err.message : 'Something went wrong. Please try again.' });
      }
    });
    ws.on('close', () => hostSockets.delete(ws));
  });

  // Every 15 s check each phone is still there; drop connections that died
  // silently (so the person shows as disconnected and can rejoin with their name).
  const alive = new WeakMap<WebSocket, boolean>();
  const pingTimer = setInterval(() => {
    for (const ws of [...clients.keys(), ...hostSockets]) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 15000);
  const watch = (ws: WebSocket): void => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', () => alive.set(ws, true));
  };

  wss.on('connection', (ws) => {
    watch(ws);
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

  await new Promise<void>((resolve, reject) => {
    // Report problems such as "port already in use" instead of waiting forever.
    const onError = (err: Error): void => {
      clearInterval(interval);
      clearInterval(pingTimer);
      reject(err);
    };
    http.once('error', onError);
    http.listen(port, opts.host ?? '0.0.0.0', () => {
      http.off('error', onError);
      resolve();
    });
  });
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    urls: urlsFor(actualPort),
    rooms,
    close: async () => {
      clearInterval(interval);
      clearInterval(pingTimer);
      if (saveTimer) clearTimeout(saveTimer);
      saveNow();
      for (const ws of [...clients.keys(), ...hostSockets]) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => hostWss.close(() => resolve()));
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

/** Temporary host page until the real one is built. */
function hostPlaceholderPage(urls: string[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LAN Mahjong host</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;padding:24px;text-align:center}</style></head>
<body><h1>LAN Mahjong host</h1><p>Players join at: ${urls.map(escapeHtml).join(', ') || 'no network address found'}</p>
<p style="opacity:.6">Creating games and host controls appear here in a later phase.</p></body></html>`;
}
