/**
 * Saving games to a file on the server's computer, so they survive a restart.
 * The file is written to a temporary name first and then renamed, so a crash
 * half-way through never leaves a broken save file.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Room } from './game/room.js';

interface SaveFile {
  version: 1;
  rooms: Room[];
}

export function loadRooms(file: string): Room[] {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as SaveFile;
    if (data.version !== 1 || !Array.isArray(data.rooms)) return [];
    // Nobody is connected straight after a restart (CPUs always are).
    for (const room of data.rooms) {
      for (const p of Object.values(room.people)) p.connected = !!p.cpu;
    }
    return data.rooms.filter((r) => !r.ended);
  } catch (err) {
    console.error(`Could not read saved games from ${file}:`, err);
    return [];
  }
}

export function saveRooms(file: string, rooms: Iterable<Room>): void {
  mkdirSync(dirname(file), { recursive: true });
  const data: SaveFile = { version: 1, rooms: [...rooms].filter((r) => !r.ended) };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}
