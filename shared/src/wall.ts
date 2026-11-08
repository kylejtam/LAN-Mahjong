/**
 * The wall: the tiles stacked in front of each player before they are drawn.
 *
 * Layout (standard HK):
 * - Seats are numbered 0, 1, 2, 3 in turn order (anticlockwise round the table).
 * - Each seat has a wall of stacks in front of it. A stack is 2 tiles (top and
 *   bottom). With flowers on there are 18 stacks per wall (36 tiles), without
 *   flowers 17 stacks (34 tiles).
 * - Dice total S: count S seats starting with the dealer as 1, in turn order.
 *   That seat's wall is broken. From the right-hand end of that wall, count S
 *   stacks. Normal draws start just after those S stacks and go clockwise.
 *   The counted S stacks become the far end of the wall.
 * - Normal draws take from the front of the wall. Replacement draws (after a
 *   flower or a gong) take from the back end.
 *
 * `stacks` is kept in draw order: stacks[0] is the next normal draw and the
 * last stack is the next replacement draw. Tiles are taken top first.
 */
import { Tile, tileCount } from './tiles.js';

export const SEATS = 4;

export interface Stack {
  /** The seat whose wall this stack sits in front of (for drawing the table). */
  readonly seat: number;
  /** Position within that seat's wall, 0 = right-hand end from that player's view. */
  readonly position: number;
  /** Tiles still in this stack: [top, bottom], or just one tile. */
  tiles: Tile[];
}

export interface Wall {
  stacks: Stack[];
}

export function stacksPerWall(flowersOn: boolean): number {
  return tileCount(flowersOn) / SEATS / 2;
}

/** Which seat's wall is broken for a given dice total. */
export function breakSeat(dealer: number, diceTotal: number): number {
  return (dealer + diceTotal - 1) % SEATS;
}

/**
 * Build the wall from an already shuffled full set of tiles, then break it
 * according to the dice.
 */
export function buildWall(shuffled: readonly Tile[], dealer: number, dice: readonly number[]): Wall {
  if (shuffled.length % (SEATS * 2) !== 0) {
    throw new Error(`Cannot build a wall from ${shuffled.length} tiles.`);
  }
  const perWall = shuffled.length / SEATS / 2;
  const diceTotal = dice.reduce((a, b) => a + b, 0);

  // Walk clockwise round the table: seat w's stacks from its right end to
  // left end, then on to the previous seat (w - 1), and so on.
  const start = breakSeat(dealer, diceTotal);
  const ring: Stack[] = [];
  let next = 0;
  for (let i = 0; i < SEATS; i++) {
    const seat = (start - i + SEATS) % SEATS;
    for (let position = 0; position < perWall; position++) {
      ring.push({ seat, position, tiles: [shuffled[next]!, shuffled[next + 1]!] });
      next += 2;
    }
  }

  // Skip the first S stacks: they become the back end of the wall.
  const skip = diceTotal % ring.length;
  return { stacks: [...ring.slice(skip), ...ring.slice(0, skip)] };
}

export function tilesLeft(wall: Wall): number {
  return wall.stacks.reduce((n, s) => n + s.tiles.length, 0);
}

/** Every tile still in the wall, in draw order. */
export function wallTiles(wall: Wall): Tile[] {
  return wall.stacks.flatMap((s) => s.tiles);
}

function take(wall: Wall, fromBack: boolean): Tile {
  const index = fromBack ? wall.stacks.length - 1 : 0;
  const stack = wall.stacks[index];
  if (!stack) throw new Error('The wall is empty.');
  const tile = stack.tiles.shift()!;
  if (stack.tiles.length === 0) wall.stacks.splice(index, 1);
  return tile;
}

/** Normal draw from the front of the wall. Changes the wall. */
export function drawFront(wall: Wall): Tile {
  return take(wall, false);
}

/** Replacement draw (after a flower or a gong) from the back. Changes the wall. */
export function drawBack(wall: Wall): Tile {
  return take(wall, true);
}
