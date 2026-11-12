/**
 * The shuffling pile is shared by the whole table, in one fixed frame: the frame of seat 0
 * (seat 0 at the bottom, seat 1 on its right, seat 2 at the top, seat 3 on its left).
 * Each player sees the pile turned so that their own seat is at the bottom, and their
 * finger's movement is turned back into that frame.
 *
 * Example: the East player (seat 0) pushes up. For the South player (seat 1, on East's
 * right), the same tiles move from left to right.
 *
 * The pile numbers used with these: [x, y, angle] for each tile, where x and y are × 10000
 * and the angle is × 1000 radians (see server/src/pile.ts).
 */

/** Turn a point a quarter turn clockwise (the screen's y goes down), `k` times. */
export function turnToViewer(x: number, y: number, k: number): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [px, py] = [-py, px];
  return { x: px, y: py };
}

/** Undo `turnToViewer`: a point on the screen back into the table's frame. */
export function turnToTable(x: number, y: number, k: number): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [px, py] = [py, -px];
  return { x: px, y: py };
}

/** The pile numbers ([x, y, angle] per tile) turned for a viewer at seat `seat`. */
export function pileForViewer(tiles: readonly number[], seat: number): number[] {
  const k = ((seat % 4) + 4) % 4;
  const out: number[] = [];
  for (let i = 0; i + 2 < tiles.length; i += 3) {
    const p = turnToViewer(tiles[i]!, tiles[i + 1]!, k);
    out.push(Math.round(p.x), Math.round(p.y), tiles[i + 2]! + k * 1571);
  }
  return out;
}
