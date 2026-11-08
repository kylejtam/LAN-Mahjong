import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { WebSocket } from 'ws';
import { seededRng } from '@lan-mahjong/shared';
import { RunningServer, startServer } from '../src/server.js';
import type { ClientMessage, HostMessage, ServerHostMessage, ServerMessage } from '../src/protocol.js';
import type { RoomView } from '../src/game/view.js';

/** A pretend device: connects, sends messages, and remembers what it receives. */
class Device {
  ws: WebSocket;
  inbox: ServerMessage[] = [];
  /** The newest game state this device has received. */
  latest: RoomView | null = null;
  private waiters: (() => void)[] = [];
  constructor(port: number, path = '/ws') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    this.ws.on('message', (d) => {
      const msg = JSON.parse(String(d)) as ServerMessage;
      if (msg.type === 'state') this.latest = msg.view;
      this.inbox.push(msg);
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  open(): Promise<void> {
    return new Promise((res) => (this.ws.readyState === WebSocket.OPEN ? res() : this.ws.once('open', () => res())));
  }
  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  /** Wait for a message that matches. */
  async waitFor<T extends ServerMessage>(test: (m: ServerMessage) => m is T, timeoutMs = 3000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(test);
      if (i >= 0) return this.inbox.splice(0, i + 1).pop() as T;
      if (Date.now() > end) throw new Error(`Timed out. Inbox: ${JSON.stringify(this.inbox.map((m) => m.type))}`);
      await new Promise<void>((res) => {
        this.waiters.push(res);
        setTimeout(res, 50);
      });
    }
  }
  /** The newest state, waiting until it matches a condition. */
  async state(cond: (v: RoomView) => boolean = () => true, timeoutMs = 3000): Promise<RoomView> {
    if (this.latest && cond(this.latest)) return this.latest;
    const m = await this.waitFor((x): x is Extract<ServerMessage, { type: 'state' }> => x.type === 'state' && cond(x.view), timeoutMs);
    return m.view;
  }
  error(): Promise<Extract<ServerMessage, { type: 'error' }>> {
    return this.waitFor((x): x is Extract<ServerMessage, { type: 'error' }> => x.type === 'error');
  }
  close(): void {
    this.ws.close();
  }
}

let server: RunningServer | null = null;
let dir: string | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function boot(dataFile: string | null = null, extra: { isHostAddress?: (a: string | undefined) => boolean } = {}): Promise<RunningServer> {
  server = await startServer({ port: 0, host: '127.0.0.1', dataFile, rng: seededRng(7), tickMs: 20, ...extra });
  return server;
}

/** The host page on the laptop. */
class HostPage {
  ws: WebSocket;
  inbox: ServerHostMessage[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/host-ws`);
    this.ws.on('message', (d) => this.inbox.push(JSON.parse(String(d)) as ServerHostMessage));
  }
  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }
  send(msg: HostMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor<T extends ServerHostMessage>(test: (m: ServerHostMessage) => m is T): Promise<T> {
    const end = Date.now() + 3000;
    for (;;) {
      const i = this.inbox.findIndex(test);
      if (i >= 0) return this.inbox.splice(0, i + 1).pop() as T;
      if (Date.now() > end) throw new Error('Host page timed out.');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  async createGame(gameName: string, startingBalance = 500): Promise<string> {
    this.send({ type: 'hostCreateGame', gameName, startingBalance });
    const m = await this.waitFor((x): x is Extract<ServerHostMessage, { type: 'hostCreated' }> => x.type === 'hostCreated');
    return m.gameId;
  }
  close(): void {
    this.ws.close();
  }
}

async function hostPage(port: number): Promise<HostPage> {
  const h = new HostPage(port);
  await h.open();
  return h;
}

async function device(port: number): Promise<Device> {
  const d = new Device(port);
  await d.open();
  return d;
}

/** The host page creates a game; Kyle, Amy, Ben and Cat join; everyone sits and presses Start; Kyle rolls. */
async function fullGame(port: number): Promise<Device[]> {
  const host = await hostPage(port);
  const gameId = await host.createGame('Test table');
  host.close();
  const all = await Promise.all(['Kyle', 'Amy', 'Ben', 'Cat'].map(() => device(port)));
  ['Kyle', 'Amy', 'Ben', 'Cat'].forEach((name, i) => all[i]!.send({ type: 'joinGame', gameId, name }));
  for (const d of all) await d.waitFor((m): m is ServerMessage => m.type === 'joined');
  const kyle = all[0]!;
  for (let seat = 0; seat < 4; seat++) {
    all[seat]!.send({ type: 'command', command: { type: 'takeSeat', seat } });
    await all[seat]!.state((v) => v.you.seat === seat);
  }
  for (const d of all) d.send({ type: 'command', command: { type: 'pressStart' } });
  await kyle.state((v) => v.phase === 'rolling');
  kyle.send({ type: 'command', command: { type: 'rollDice' } });
  for (const d of all) await d.state((v) => v.phase === 'playing');
  return all;
}

describe('game server over the network', () => {
  it('serves the info page, game list and QR code', async () => {
    const s = await boot();
    const base = `http://127.0.0.1:${s.port}`;
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/info`)).json()).toMatchObject({ app: 'LAN Mahjong', port: s.port });
    expect(await (await fetch(`${base}/api/games`)).json()).toEqual([]);
    const qr = await fetch(`${base}/api/qr.svg`);
    expect(qr.headers.get('content-type')).toBe('image/svg+xml');
    expect(await qr.text()).toContain('<svg');
  });

  it('sends the built screens, but never files outside the screens folder', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mahjong-client-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<p>player screen</p>');
    writeFileSync(join(dir, 'host.html'), '<p>host screen</p>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    server = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: dir, tickMs: 20 });
    const base = `http://127.0.0.1:${server.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain('player screen');
    expect(await (await fetch(`${base}/host`)).text()).toContain('host screen');
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${base}/host.html`)).status).toBe(404); // only via /host (laptop check)
    expect((await fetch(`${base}/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/assets/..%2F..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('compresses screen files when the browser accepts it, and they unpack to exactly the same file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mahjong-client-'));
    mkdirSync(join(dir, 'assets'));
    const big = 'const tiles = ' + JSON.stringify(Array.from({ length: 400 }, (_, i) => `tile-${i % 34}`)) + ';\n';
    writeFileSync(join(dir, 'index.html'), '<p>player screen</p>' + '<!-- padding -->'.repeat(100));
    writeFileSync(join(dir, 'assets', 'app.js'), big);
    writeFileSync(join(dir, 'icon.png'), Buffer.alloc(2000, 7));
    server = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: dir, tickMs: 20 });
    const raw = (path: string, gzip: boolean): Promise<{ headers: IncomingHttpHeaders; body: Buffer }> =>
      new Promise((res, rej) => {
        httpGet({ host: '127.0.0.1', port: server!.port, path, headers: gzip ? { 'accept-encoding': 'gzip, deflate' } : {} }, (r) => {
          const parts: Buffer[] = [];
          r.on('data', (c: Buffer) => parts.push(c));
          r.on('end', () => res({ headers: r.headers, body: Buffer.concat(parts) }));
        }).on('error', rej);
      });
    const zipped = await raw('/assets/app.js', true);
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(zipped.body.length).toBeLessThan(big.length / 3);
    expect(gunzipSync(zipped.body).toString()).toBe(big);
    const plain = await raw('/assets/app.js', false);
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(big);
    const page = await raw('/', true);
    expect(page.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(page.body).toString()).toContain('player screen');
    // Pictures are already compressed: sent as they are.
    const png = await raw('/icon.png', true);
    expect(png.headers['content-encoding']).toBeUndefined();
    expect(png.body.length).toBe(2000);
    // A rebuilt file is picked up straight away (not stuck in memory).
    writeFileSync(join(dir, 'assets', 'app.js'), big + '// changed\n');
    expect(gunzipSync((await raw('/assets/app.js', true)).body).toString()).toContain('// changed');
  });

  it('lists games on the start screen', async () => {
    const s = await boot();
    const lobby = await device(s.port);
    await lobby.waitFor((m): m is ServerMessage => m.type === 'games');
    const host = await hostPage(s.port);
    await host.createGame('Friday', 100);
    const list = await lobby.waitFor(
      (m): m is Extract<ServerMessage, { type: 'games' }> => m.type === 'games' && m.games.length === 1,
    );
    expect(list.games[0]).toMatchObject({ name: 'Friday', label: { en: 'East, game 1' }, seats: [null, null, null, null] });
    lobby.close();
    host.close();
  });

  it('sends each device only its own hand', async () => {
    const s = await boot();
    const devices = await fullGame(s.port);
    const views = await Promise.all(devices.map((d) => d.state()));
    views.forEach((v, seat) => {
      v.seats.forEach((sv) => {
        if (sv.seat === seat) expect(sv.hand!.length).toBe(seat === 0 ? 14 : 13);
        else expect(sv.hand).toBeNull();
      });
    });
    devices.forEach((d) => d.close());
  });

  it('refuses illegal moves with a message, and plays legal ones for everyone', async () => {
    const s = await boot();
    const [kyle, amy, ben, cat] = await fullGame(s.port);
    const v = await kyle!.state();
    const tile = v.seats[0]!.hand![0]!;
    amy!.send({ type: 'command', command: { type: 'discard', tileId: tile.id } });
    expect((await amy!.error()).message).toMatch(/not your turn/);
    kyle!.send({ type: 'command', command: { type: 'discard', tileId: tile.id } });
    for (const d of [kyle!, amy!, ben!, cat!]) {
      const after = await d.state((x) => x.round!.discards.length === 1);
      expect(after.round!.discards[0]!.tile.id).toBe(tile.id);
    }
    [kyle, amy, ben, cat].forEach((d) => d!.close());
  });

  it('a player who disconnects and reconnects gets the same seat back', async () => {
    const s = await boot();
    const devices = await fullGame(s.port);
    const gameId = (await devices[1]!.state()).id;
    devices[1]!.close();
    await devices[0]!.state((v) => !v.seats[1]!.connected);
    const again = await device(s.port);
    again.send({ type: 'joinGame', gameId, name: 'AMY' });
    const v = await again.state();
    expect(v.you.seat).toBe(1);
    expect(v.seats[1]!.hand).toHaveLength(13);
    [...devices, again].forEach((d) => d.close());
  });

  it('refuses a name that is already connected', async () => {
    const s = await boot();
    const hp = await hostPage(s.port);
    const gameId = await hp.createGame('T', 0);
    hp.close();
    const host = await device(s.port);
    host.send({ type: 'joinGame', gameId, name: 'Kyle' });
    await host.state();
    const other = await device(s.port);
    other.send({ type: 'joinGame', gameId, name: 'kyle' });
    expect((await other.error()).message).toMatch(/already in use/);
    host.close();
    other.close();
  });

  it('ignores junk messages without crashing', async () => {
    const s = await boot();
    const d = await device(s.port);
    d.ws.send('not json');
    expect((await d.error()).message).toMatch(/Bad message/);
    d.send({ type: 'command', command: { type: 'discard', tileId: 1 } });
    expect((await d.error()).message).toMatch(/not in a game/);
    d.send({ type: 'nonsense' } as unknown as ClientMessage);
    expect((await d.error()).message).toMatch(/Unknown message/);
    d.close();
  });

  it('ending the game (host page) tells every device and removes it from the list', async () => {
    const s = await boot();
    const devices = await fullGame(s.port);
    const gameId = (await devices[0]!.state()).id;
    const host = await hostPage(s.port);
    host.send({ type: 'hostCommand', gameId, command: { type: 'hostEndGame' } });
    for (const d of devices) await d.waitFor((m): m is ServerMessage => m.type === 'gameEnded');
    expect(s.rooms.size).toBe(0);
    devices.forEach((d) => d.close());
    host.close();
  });

  it('players cannot create games or use host controls', async () => {
    const s = await boot();
    const devices = await fullGame(s.port);
    devices[0]!.send({ type: 'createGame', name: 'X', gameName: 'Y', startingBalance: 1 } as unknown as ClientMessage);
    expect((await devices[0]!.error()).message).toMatch(/Unknown message/);
    devices[0]!.send({ type: 'command', command: { type: 'hostEndGame' } } as unknown as ClientMessage);
    await devices[0]!.error();
    expect(s.rooms.size).toBe(1);
    devices.forEach((d) => d.close());
  });

  it('the host page refuses devices on the network', async () => {
    const s = await boot(null, { isHostAddress: () => false });
    const page = await fetch(`http://127.0.0.1:${s.port}/host`);
    expect(page.status).toBe(403);
    await expect(hostPage(s.port)).rejects.toThrow();
  });

  it('the host page opens on the laptop and gets an overview without hidden tiles', async () => {
    const s = await boot();
    expect((await fetch(`http://127.0.0.1:${s.port}/host`)).status).toBe(200);
    const devices = await fullGame(s.port);
    const host = await hostPage(s.port);
    const state = await host.waitFor((m): m is Extract<ServerHostMessage, { type: 'hostState' }> => m.type === 'hostState');
    expect(state.games).toHaveLength(1);
    expect(state.games[0]!.seats.map((x) => x.name)).toEqual(['Kyle', 'Amy', 'Ben', 'Cat']);
    expect(JSON.stringify(state)).not.toMatch(/"hand"/);
    devices.forEach((d) => d.close());
    host.close();
  });

  it('saves games and loads them again after a restart', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mahjong-'));
    const file = join(dir, 'games.json');
    let s = await boot(file);
    const devices = await fullGame(s.port);
    const before = await devices[2]!.state();
    devices.forEach((d) => d.close());
    await s.close();

    s = await boot(file);
    expect(s.rooms.size).toBe(1);
    const ben = await device(s.port);
    ben.send({ type: 'joinGame', gameId: before.id, name: 'Ben' });
    const after = await ben.state();
    expect(after.you.seat).toBe(2);
    expect(after.seats[2]!.hand!.map((t) => t.id)).toEqual(before.seats[2]!.hand!.map((t) => t.id));
    expect(after.seats.every((sv, i) => i === 2 || !sv.connected)).toBe(true);
    ben.close();
  });

  it('CPU players move by themselves', async () => {
    const s = await boot();
    const host = await hostPage(s.port);
    const gameId = await host.createGame('Bots', 100);
    for (let seat = 0; seat < 4; seat++) {
      host.send({ type: 'hostCommand', gameId, command: { type: 'hostSetSeat', seat, cpu: 'easy' } });
    }
    // A spectator watches the all-CPU table get going: dice rolled and tiles discarded.
    const watcher = await device(s.port);
    watcher.send({ type: 'joinGame', gameId, name: 'Kyle' });
    const v = await watcher.state((x) => (x.round?.discards.length ?? 0) >= 1, 15000);
    expect(v.you.seat).toBeNull();
    host.close();
    watcher.close();
  }, 25000);
});
