/**
 * Start the LAN Mahjong server. Run with:  npm start
 *
 * Options (environment variables):
 *   PORT       which port to use (default 3000)
 *   DATA_FILE  where games are saved (default data/games.json)
 */
import { resolve } from 'node:path';
import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const dataFile = resolve(process.env.DATA_FILE ?? 'data/games.json');

const server = await startServer({ port, dataFile });

console.log('');
console.log('  LAN Mahjong server is running.');
console.log('');
if (server.urls.length) {
  console.log('  On each device (same Wi-Fi), open:');
  for (const u of server.urls) console.log(`    ${u}`);
} else {
  console.log(`  No network address found. On this computer, open http://localhost:${server.port}`);
}
console.log('');
console.log(`  Games are saved to ${dataFile}`);
console.log('  Keep this window open while playing. Press Ctrl+C to stop.');
console.log('');

const stop = async (): Promise<void> => {
  console.log('\n  Saving games and stopping...');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
