/**
 * The pile of face-down tiles between hands, shared by everyone at the table.
 *
 * Players push the tiles around with their mouse or finger (and CPUs push them too while
 * they wait), and every screen shows the same pile: the server moves the tiles and sends
 * their places to everyone. When all four are ready, the pile gets 6 shoves from random
 * directions, then each screen builds the wall from where the tiles ended up.
 *
 * This is only for looks: the real order of the tiles is chosen at random when the hand
 * is dealt, as always.
 *
 * Units: the wall square is 1 wide, centred on (0, 0). Tiles never overlap.
 */

export interface PileTile {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
}

/** A hand pushing the tiles (a player's mouse or finger, or a CPU). */
export interface PileHand {
  x: number;
  y: number;
  /** Where it was last step (so a fast swipe doesn't jump over tiles). */
  px: number;
  py: number;
  on: boolean;
  /** When this was last heard from (a hand that goes quiet stops pushing). */
  at: number;
}

export interface Pile {
  perWall: number;
  tiles: PileTile[];
  hands: Map<string, PileHand>;
  /** The 6 shoves once everyone is ready: when they started (ms), or null. */
  shovesAt: number | null;
  shoves: { t0: number; ux: number; uy: number; band: number }[];
  /** Something moved since the last frame was sent. */
  moving: boolean;
}

/** How long the 6 shoves take (ms). The wall is built straight after. */
export const SHOVES_MS = 2400;
const FIELD = { l: -0.64, r: 0.64, t: -0.56, b: 0.56 };

const sizes = (perWall: number): { hw: number; hh: number; rad: number; hand: number } => {
  const tw = 1 / (perWall + 2);
  const th = tw * 1.32;
  const hw = tw / 2 + 0.002;
  const hh = th / 2 + 0.002;
  return { hw, hh, rad: Math.hypot(hw, hh), hand: tw * 1.7 };
};

const axesOf = (q: PileTile): [number, number][] => {
  const c = Math.cos(q.a);
  const s = Math.sin(q.a);
  return [[c, s], [-s, c]];
};

function extent(q: PileTile, ax: [number, number], hw: number, hh: number): number {
  const [u, v] = axesOf(q);
  return hw * Math.abs(u![0] * ax[0] + u![1] * ax[1]) + hh * Math.abs(v![0] * ax[0] + v![1] * ax[1]);
}

function overlap(A: PileTile, B: PileTile, hw: number, hh: number, rad: number): { o: number; x: number; y: number } | null {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  if (dx * dx + dy * dy > 4 * rad * rad) return null;
  let best: { o: number; x: number; y: number } | null = null;
  for (const ax of [...axesOf(A), ...axesOf(B)]) {
    const d = dx * ax[0] + dy * ax[1];
    const o = extent(A, ax, hw, hh) + extent(B, ax, hw, hh) - Math.abs(d);
    if (o <= 0) return null;
    if (!best || o < best.o) best = { o, x: ax[0] * Math.sign(d || 1), y: ax[1] * Math.sign(d || 1) };
  }
  return best;
}

/** A fresh messy pile: random places and angles, packed close, none on top of another. */
export function newPile(count: number, perWall: number, rand: () => number = Math.random): Pile {
  const { hw, hh, rad } = sizes(perWall);
  const tiles: PileTile[] = [];
  let R = rad * 2;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; ; tries++) {
      const ang = rand() * Math.PI * 2;
      const d = R * Math.sqrt(rand());
      const q = { x: Math.cos(ang) * d * 1.1, y: Math.sin(ang) * d * 0.9, a: rand() * Math.PI, vx: 0, vy: 0, va: 0 };
      if (!tiles.some((o) => overlap(o, q, hw, hh, rad))) {
        tiles.push(q);
        break;
      }
      if (tries % 25 === 24) R += rad * 0.25;
    }
  }
  return { perWall, tiles, hands: new Map(), shovesAt: null, shoves: [], moving: true };
}

/** Start the 6 shoves, each from a random direction. */
export function startShoves(pile: Pile, now: number, rand: () => number = Math.random): void {
  pile.shovesAt = now;
  pile.hands.clear();
  pile.shoves = [0, 350, 700, 1050, 1400, 1650].map((t0) => {
    const ang = rand() * Math.PI * 2;
    return { t0: now + t0, ux: Math.cos(ang), uy: Math.sin(ang), band: (rand() - 0.5) * 0.45 };
  });
}

export function shovesDone(pile: Pile, now: number): boolean {
  return pile.shovesAt !== null && now - pile.shovesAt >= SHOVES_MS;
}

/** Move the pile on by `dt` seconds. */
export function stepPile(pile: Pile, dt: number, now: number): void {
  const { hw, hh, rad, hand } = sizes(pile.perWall);
  const P = pile.tiles;
  let moved = false;
  // Hands push tiles out of their way (sampled along the path, so fast swipes work).
  for (const h of pile.hands.values()) {
    if (!h.on || now - h.at > 1500) {
      h.px = h.x;
      h.py = h.y;
      continue;
    }
    const dx = h.x - h.px;
    const dy = h.y - h.py;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (hand * 0.4)));
    for (let s = 1; s <= steps; s++) {
      const x = h.px + (dx * s) / steps;
      const y = h.py + (dy * s) / steps;
      for (const q of P) {
        const ex = q.x - x;
        const ey = q.y - y;
        const d = Math.hypot(ex, ey) || 1e-4;
        const want = hand + rad * 0.55;
        if (d >= want) continue;
        const nx = ex / d;
        const ny = ey / d;
        const move = want - d;
        q.x += nx * move;
        q.y += ny * move;
        q.vx += nx * move * 10;
        q.vy += ny * move * 10;
        // Pushed off-centre: it turns a little.
        q.va += ((dx * ny - dy * nx) / (rad * 4)) * 0.02;
        moved = true;
      }
    }
    h.px = h.x;
    h.py = h.y;
  }
  // The 6 shoves: a hand sweeps in from a direction and pulls back.
  for (const sh of pile.shoves) {
    const u = (now - sh.t0) / 550;
    if (u <= 0 || u >= 1) continue;
    const front = -0.66 + Math.sin(Math.PI * u) * 0.45;
    const nx = -sh.uy;
    const ny = sh.ux;
    for (const q of P) {
      const off = q.x * nx + q.y * ny - sh.band;
      if (Math.abs(off) > 0.2) continue;
      const along = q.x * sh.ux + q.y * sh.uy;
      const e = extent(q, [sh.ux, sh.uy], hw, hh);
      if (along - e < front) {
        const push = front + e - along;
        q.x += sh.ux * push;
        q.y += sh.uy * push;
        q.vx += sh.ux * push * 6;
        q.vy += sh.uy * push * 6;
        q.va += (off / 0.2) * (push / rad) * 0.05;
        moved = true;
      }
    }
  }
  for (const q of P) {
    if (Math.abs(q.vx) + Math.abs(q.vy) + Math.abs(q.va) > 1e-4) moved = true;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.va = Math.max(-0.03, Math.min(0.03, q.va));
    q.a += q.va;
    q.vx *= 0.86;
    q.vy *= 0.86;
    q.va *= 0.88;
    q.x = Math.max(FIELD.l + rad, Math.min(FIELD.r - rad, q.x));
    q.y = Math.max(FIELD.t + rad, Math.min(FIELD.b - rad, q.y));
  }
  if (!moved) return;
  pile.moving = true;
  // Never on top of each other: push touching tiles apart (only tiles near each other).
  const cell = rad * 2.6;
  const grid = new Map<number, number[]>();
  P.forEach((q, i) => {
    const k = Math.floor(q.x / cell) * 4096 + Math.floor(q.y / cell);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  for (let it = 0; it < 12; it++) {
    let again = false;
    P.forEach((A, i) => {
      const gx = Math.floor(A.x / cell);
      const gy = Math.floor(A.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const j of grid.get((gx + ox) * 4096 + gy + oy) ?? []) {
            if (j <= i) continue;
            const B = P[j]!;
            const m = overlap(A, B, hw, hh, rad);
            if (!m) continue;
            again = true;
            const push = m.o / 2 + 0.00002;
            A.x -= m.x * push;
            A.y -= m.y * push;
            B.x += m.x * push;
            B.y += m.y * push;
            const turn = (((B.x - A.x) * m.y - (B.y - A.y) * m.x) / rad) * (push / rad) * 0.08;
            A.va -= turn;
            B.va += turn;
          }
        }
      }
    });
    if (!again) break;
  }
}

/** A computer player's hand wandering over the pile while it waits (on for a while, then off). */
export function cpuHand(pile: Pile, id: string, seatIndex: number, now: number): void {
  const t = now / 1000 + seatIndex * 1.7;
  const on = t % 5.5 < 2.6;
  const x = Math.sin(t * 1.1 + seatIndex) * 0.4;
  const y = Math.sin(t * 0.8 + seatIndex * 2) * 0.32;
  const h = pile.hands.get(id);
  if (!h) pile.hands.set(id, { x, y, px: x, py: y, on, at: now });
  else Object.assign(h, { x, y, on, at: now });
}

/** The tiles' places, rounded, to send to every screen: [x, y, angle] × tiles (x, y × 10000; angle in 0.001 rad). */
export function pileFrame(pile: Pile): number[] {
  const out: number[] = [];
  for (const q of pile.tiles) out.push(Math.round(q.x * 10000), Math.round(q.y * 10000), Math.round(q.a * 1000));
  return out;
}
