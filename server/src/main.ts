/**
 * Start the LAN Mahjong server. Run with:  npm start
 * (On Windows, the "LAN Mahjong" icon from the installer runs this for you.)
 *
 * Options (environment variables):
 *   PORT          which port to use (default 3000)
 *   DATA_FILE     where games are saved (default data/games.json)
 *   CLIENT_DIR    folder with the built screens (default client/dist)
 *   OPEN_BROWSER  "1" = open the host page in the browser once started
 */
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { startServer } from './server.js';
import { APP_VERSION, updateIfAvailable } from './update.js';

const port = Number(process.env.PORT ?? 3000);
const dataFile = resolve(process.env.DATA_FILE ?? 'data/games.json');
const clientDir = process.env.CLIENT_DIR ? resolve(process.env.CLIENT_DIR) : undefined;
const openBrowser = process.env.OPEN_BROWSER === '1';
const hostUrl = `http://localhost:${port}/host`;

/** Open a web address in the computer's normal browser. */
function open(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* no browser available: the address is printed below anyway */
  }
}

// The installed Windows app checks for a newer version before starting (never mid-game).
if (process.env.LAN_MAHJONG_UPDATES === '1') {
  console.log(`  LAN Mahjong ${APP_VERSION}: checking for updates...`);
  if (await updateIfAvailable({ stateDir: dirname(dataFile), log: (line) => console.log(line) })) {
    process.exit(0); // the installer takes over and starts the new version
  }
}

let server: Awaited<ReturnType<typeof startServer>>;
try {
  server = await startServer({ port, dataFile, clientDir, onShutdown: () => void stop() });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    // Most likely LAN Mahjong is already running (e.g. the icon was double-clicked twice).
    console.log('');
    console.log('  LAN Mahjong is already running on this computer.');
    console.log(`  Opening the host page: ${hostUrl}`);
    console.log('');
    if (openBrowser) open(hostUrl);
    setTimeout(() => process.exit(0), 4000);
    await new Promise(() => {});
  }
  throw err;
}

console.log('');
console.log(`  LAN Mahjong ${APP_VERSION} is running.`);
console.log('');
if (server.urls.length) {
  console.log('  On each phone or tablet (same Wi-Fi), scan the QR code on the host page, or open:');
  for (const u of server.urls) console.log(`    ${u}`);
} else {
  console.log(`  No network address found. On this computer, open http://localhost:${server.port}`);
}
console.log('');
console.log('  HOST PAGE (create games, host controls) - on THIS laptop only:');
console.log(`    ${hostUrl}`);
console.log('');
console.log(`  Games are saved to ${dataFile}`);
console.log('  Keep this window open while playing. Close it to stop the game.');
console.log('');
if (openBrowser) open(hostUrl);

async function stop(): Promise<void> {
  console.log('\n  Saving games and stopping...');
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
// Windows: closing the window or pressing Ctrl+Break.
process.on('SIGHUP', () => void stop());
process.on('SIGBREAK', () => void stop());
