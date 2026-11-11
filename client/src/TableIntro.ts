/**
 * The start of each hand, drawn over the table:
 *
 * 1. Mixing: the tiles lie face down in a messy pile and are shoved from one side after
 *    another. A small physics simulation moves them: a pushed tile pushes the tiles in its
 *    way and turns a little, and no two tiles ever overlap.
 * 2. Building: without stopping, each tile glides out to the nearest place in the wall;
 *    all four walls (two tiles high) grow at once.
 * 3. (The dealer rolls the dice; the dice roll is drawn by DiceRoll.)
 * 4. Counting: a quick wipe of light round the walls (one wall per point on the dice,
 *    starting with the dealer's), then along that wall's stacks from its right-hand end.
 *    A gold mark shows the break.
 * 5. Dealing: the deal animation (in Table) takes tiles off this wall as it deals.
 * 6. Shrinking: what is left of the wall shrinks into the small "tiles left" box.
 *
 * Everything is plain DOM with the Web Animations API (smooth on iPads), outside React.
 * The mixing simulation is worked out ahead of time, a little at a time, while nothing
 * else is happening (between hands), so it never makes the screen stutter.
 */

import { INTRO_FADE_MS, WALL_SHRINK_MS, wallCountMs } from '@lan-mahjong/shared';

export type Side = 'bottom' | 'right' | 'top' | 'left';
const SEATS = 4;
/** Seconds of mixing before the tiles start gliding into the wall. */
const MIX_S = 2.4;
const PULL_S = 0.55;

// ---------- the mixing simulation, in table units (the wall square is 1 wide, centred on 0, 0) ----------

interface SimTile { x: number; y: number; a: number; vx: number; vy: number; va: number }
type SimFrame = { x: number; y: number; a: number }[];

function* shoveSimulation(n: number, perWall: number): Generator<void, SimFrame[]> {
  const tw = 1 / (perWall + 2);
  const th = tw * 1.32;
  const hw = tw / 2 + 0.002;
  const hh = th / 2 + 0.002; // a hair of space so tiles never touch
  const rad = Math.hypot(hw, hh);
  const rand = (a: number, b: number): number => a + Math.random() * (b - a);
  const field = { l: -0.62, r: 0.62, t: -0.52, b: 0.52 };
  const axesOf = (q: SimTile): [number, number][] => {
    const c = Math.cos(q.a);
    const s = Math.sin(q.a);
    return [[c, s], [-s, c]];
  };
  const extent = (q: SimTile, ax: [number, number]): number => {
    const [u, v] = axesOf(q);
    return hw * Math.abs(u![0] * ax[0] + u![1] * ax[1]) + hh * Math.abs(v![0] * ax[0] + v![1] * ax[1]);
  };
  /** Do two tilted tiles overlap (separating-axis test)? The shortest way to push them apart, or null. */
  const overlap = (A: SimTile, B: SimTile): { o: number; x: number; y: number } | null => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    if (dx * dx + dy * dy > 4 * rad * rad) return null;
    let best: { o: number; x: number; y: number } | null = null;
    for (const ax of [...axesOf(A), ...axesOf(B)]) {
      const d = dx * ax[0] + dy * ax[1];
      const o = extent(A, ax) + extent(B, ax) - Math.abs(d);
      if (o <= 0) return null;
      if (!best || o < best.o) best = { o, x: ax[0] * Math.sign(d || 1), y: ax[1] * Math.sign(d || 1) };
    }
    return best;
  };

  // A messy face-down pile: random places and angles, packed close, none on top of another.
  const P: SimTile[] = [];
  let R = rad * 2;
  for (let i = 0; i < n; i++) {
    for (let tries = 0; ; tries++) {
      const ang = rand(0, Math.PI * 2);
      const d = R * Math.sqrt(Math.random());
      const q = { x: Math.cos(ang) * d, y: Math.sin(ang) * d * 0.85, a: rand(0, Math.PI), vx: 0, vy: 0, va: 0 };
      if (!P.some((o) => overlap(o, q))) {
        P.push(q);
        break;
      }
      if (tries % 25 === 24) R += rad * 0.25;
    }
  }
  yield;

  // Shoves: a hand sweeps in from one side and pulls back, one side after another.
  const shoves = (['left', 'top', 'right', 'bottom', 'left', 'top'] as const).map((from, i) => ({
    from,
    t0: [0, 0.35, 0.7, 1.05, 1.4, 1.65][i]!,
    band: rand(-0.2, 0.2),
  }));
  const DUR = 0.55;
  const dt = 1 / 60;
  const steps = Math.round(MIX_S / dt);
  const cell = rad * 2.6;
  const frames: SimFrame[] = [];
  for (let st = 0; st <= steps; st++) {
    const t = st * dt;
    for (const sh of shoves) {
      const u = (t - sh.t0) / DUR;
      if (u <= 0 || u >= 1) continue;
      const reach = Math.sin(Math.PI * u);
      const halfBand = 0.18;
      const horiz = sh.from === 'left' || sh.from === 'right';
      for (const q of P) {
        const off = (horiz ? q.y : q.x) - sh.band;
        if (Math.abs(off) > halfBand) continue;
        const ext = extent(q, horiz ? [1, 0] : [0, 1]);
        let push = 0;
        if (sh.from === 'left') { const e = field.l + reach * 0.42; if (q.x - ext < e) { push = e + ext - q.x; q.x += push; q.vx += push * 6; } }
        if (sh.from === 'right') { const e = field.r - reach * 0.42; if (q.x + ext > e) { push = q.x + ext - e; q.x -= push; q.vx -= push * 6; } }
        if (sh.from === 'top') { const e = field.t + reach * 0.36; if (q.y - ext < e) { push = e + ext - q.y; q.y += push; q.vy += push * 6; } }
        if (sh.from === 'bottom') { const e = field.b - reach * 0.36; if (q.y + ext > e) { push = q.y + ext - e; q.y -= push; q.vy -= push * 6; } }
        // A tile pushed off-centre turns, like a real tile nudged near one end.
        if (push) q.va += (off / halfBand) * (push / rad) * 0.05 * (sh.from === 'left' || sh.from === 'bottom' ? 1 : -1);
      }
    }
    for (const q of P) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.va = Math.max(-0.03, Math.min(0.03, q.va)); // a gentle turn, never a spin
      q.a += q.va;
      q.vx *= 0.86;
      q.vy *= 0.86;
      q.va *= 0.88;
      q.x = Math.max(field.l + rad, Math.min(field.r - rad, q.x));
      q.y = Math.max(field.t + rad, Math.min(field.b - rad, q.y));
    }
    // Never overlap: push touching tiles apart until none overlap (only tiles near each other).
    const grid = new Map<number, number[]>();
    P.forEach((q, i) => {
      const k = Math.floor(q.x / cell) * 4096 + Math.floor(q.y / cell);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    });
    const near = P.map((A, i) => {
      const gx = Math.floor(A.x / cell);
      const gy = Math.floor(A.y / cell);
      const out: number[] = [];
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const j of grid.get((gx + ox) * 4096 + gy + oy) ?? []) if (j > i) out.push(j);
      return out;
    });
    for (let it = 0; it < 80; it++) {
      let moved = false;
      P.forEach((A, i) => {
        for (const j of near[i]!) {
          const B = P[j]!;
          const m = overlap(A, B);
          if (!m) continue;
          moved = true;
          const push = m.o / 2 + 0.00002;
          A.x -= m.x * push;
          A.y -= m.y * push;
          B.x += m.x * push;
          B.y += m.y * push;
          // A bump off-centre turns both tiles a tiny bit (the same at any screen size).
          const turn = (((B.x - A.x) * m.y - (B.y - A.y) * m.x) / rad) * (push / rad) * 0.08;
          A.va -= turn;
          B.va += turn;
        }
      });
      if (!moved) break;
    }
    if (st % 2 === 0 || st === steps) frames.push(P.map((q) => ({ x: q.x, y: q.y, a: (q.a * 180) / Math.PI })));
    yield;
  }
  return frames;
}

/** The next hand's mixing, worked out a little at a time while nothing else is going on. */
let prepared: { n: number; perWall: number; frames: SimFrame[] | null; gen: Generator<void, SimFrame[]> } | null = null;
let preparing = false;

function runSome(budgetMs: number): void {
  if (!prepared || prepared.frames) return;
  const until = performance.now() + budgetMs;
  while (performance.now() < until) {
    const r = prepared.gen.next();
    if (r.done) {
      prepared.frames = r.value;
      return;
    }
  }
}

/** Start working out the next mixing in small pieces (call when the table is quiet). */
export function prepareMix(n: number, perWall: number): void {
  if (prepared && prepared.n === n && prepared.perWall === perWall) return;
  prepared = { n, perWall, frames: null, gen: shoveSimulation(n, perWall) };
  if (preparing) return;
  preparing = true;
  const tick = (): void => {
    runSome(10);
    if (prepared && !prepared.frames) setTimeout(tick, 20);
    else preparing = false;
  };
  setTimeout(tick, 30);
}

function takeMix(n: number, perWall: number): SimFrame[] {
  if (!prepared || prepared.n !== n || prepared.perWall !== perWall) prepared = { n, perWall, frames: null, gen: shoveSimulation(n, perWall) };
  while (!prepared.frames) runSome(1000);
  const frames = prepared.frames;
  prepared = null; // a fresh, different mixing next time
  return frames;
}

// ---------- the wall drawn over the table ----------

interface WallTile { el: HTMLElement; seat: number; position: number; layer: 0 | 1; x: number; y: number; r: number }

interface Geometry { cx: number; cy: number; S: number; tw: number; th: number; lift: number }

function geometry(perWall: number): Geometry {
  const board = document.querySelector('.board')?.getBoundingClientRect();
  const hub = document.querySelector('.hub')?.getBoundingClientRect() ?? board;
  const bw = board?.width ?? innerWidth;
  const bh = board?.height ?? innerHeight;
  const S = Math.min(bh * 0.8, bw * 0.62);
  const cx = hub ? hub.left + hub.width / 2 : innerWidth / 2;
  const cy = hub ? hub.top + hub.height / 2 : innerHeight / 2;
  const tw = S / (perWall + 2);
  const th = tw * 1.32;
  return { cx, cy, S, tw, th, lift: th * 0.16 };
}

/** Centre of stack `position` (0 = the right-hand end, as that player sees it) on a side of the table. */
function stackCentre(side: Side, position: number, perWall: number, g: Geometry): { x: number; y: number; r: number } {
  const half = g.S / 2;
  // Each wall stops short of the corners, so the ends of two walls never overlap.
  const span = g.S - g.th * 1.3;
  const off = -span / 2 + (span / perWall) * (position + 0.5);
  if (side === 'bottom') return { x: g.cx - off, y: g.cy + half, r: 0 }; // your right is the screen's right
  if (side === 'right') return { x: g.cx + half, y: g.cy + off, r: 90 }; // their right is the screen's top
  if (side === 'top') return { x: g.cx + off, y: g.cy - half, r: 0 }; // their right is the screen's left
  return { x: g.cx - half, y: g.cy - off, r: 90 }; // left side: their right is the screen's bottom
}

const T = (x: number, y: number, r = 0, s = 1): string => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let current: {
  key: string;
  box: HTMLElement;
  tiles: WallTile[];
  perWall: number;
  sideOf: (seat: number) => Side;
  g: Geometry;
  built: boolean;
  timers: ReturnType<typeof setTimeout>[];
} | null = null;

function clear(): void {
  document.body.classList.remove('intro-arriving', 'intro-fading');
  if (!current) return;
  current.timers.forEach(clearTimeout);
  current.box.remove();
  current = null;
}

function create(key: string, perWall: number, sideOf: (seat: number) => Side): NonNullable<typeof current> {
  clear();
  const g = geometry(perWall);
  const box = document.createElement('div');
  box.className = 'intro-layer';
  box.setAttribute('aria-hidden', 'true');
  document.body.appendChild(box);
  const tiles: WallTile[] = [];
  for (let seat = 0; seat < SEATS; seat++) {
    for (let position = 0; position < perWall; position++) {
      for (const layer of [0, 1] as const) {
        const c = stackCentre(sideOf(seat), position, perWall, g);
        const el = document.createElement('div');
        el.className = `intro-tile${layer ? ' intro-top' : ''}`;
        el.style.width = `${g.tw}px`;
        el.style.height = `${g.th}px`;
        box.appendChild(el);
        tiles.push({ el, seat, position, layer, x: c.x - g.tw / 2, y: c.y - g.th / 2 - layer * g.lift, r: c.r });
      }
    }
  }
  current = { key, box, tiles, perWall, sideOf, g, built: false, timers: [] };
  return current;
}

function showBuilt(c: NonNullable<typeof current>): void {
  for (const t of c.tiles) {
    t.el.getAnimations().forEach((a) => a.cancel());
    t.el.style.transform = T(t.x, t.y, t.r);
    t.el.style.opacity = '1';
  }
  c.built = true;
}

/**
 * Mix the tiles and build the wall for hand `key` (once per hand). Calls `onBuilt` when the
 * wall is standing (then the dealer may roll the dice).
 */
export function startIntro(key: string, perWall: number, sideOf: (seat: number) => Side, onBuilt: () => void): void {
  if (current?.key === key) {
    if (current.built) onBuilt();
    return;
  }
  const c = create(key, perWall, sideOf);
  if (reducedMotion()) {
    showBuilt(c);
    onBuilt();
    return;
  }
  const sim = takeMix(c.tiles.length, perWall);
  const g = c.g;
  const last = sim[sim.length - 1]!;
  // Each tile goes to the wall place nearest to where it ended up (both sorted round the
  // middle), so tiles glide straight outwards and don't cross each other.
  const angle = (x: number, y: number): number => Math.atan2(y, x);
  const simOrder = last.map((_, i) => i).sort((i, j) => angle(last[i]!.x, last[i]!.y) - angle(last[j]!.x, last[j]!.y));
  const wallOrder = c.tiles
    .map((_, i) => i)
    .sort((i, j) => angle(c.tiles[i]!.x + g.tw / 2 - g.cx, c.tiles[i]!.y + g.th / 2 - g.cy) - angle(c.tiles[j]!.x + g.tw / 2 - g.cx, c.tiles[j]!.y + g.th / 2 - g.cy));
  const simOf: number[] = [];
  wallOrder.forEach((ti, k) => {
    simOf[ti] = simOrder[k]!;
  });
  const frameDt = MIX_S / (sim.length - 1);
  let lastEnd = 0;
  const anims: Animation[] = [];
  c.tiles.forEach((t, ti) => {
    const si = simOf[ti]!;
    const pull = MIX_S - 0.3 + t.position * 0.02 + t.layer * 0.04; // all four walls at once, end to end
    const end = pull + PULL_S;
    lastEnd = Math.max(lastEnd, end);
    const frames: Keyframe[] = [];
    const N = Math.ceil(end / 0.06);
    for (let f = 0; f <= N; f++) {
      const time = (f / N) * end;
      const k = Math.min(sim.length - 1, time / frameDt);
      const k0 = Math.floor(k);
      const k1 = Math.min(sim.length - 1, k0 + 1);
      const fr = k - k0;
      const m0 = sim[k0]![si]!;
      const m1 = sim[k1]![si]!;
      const mx = g.cx + (m0.x + (m1.x - m0.x) * fr) * g.S - g.tw / 2;
      const my = g.cy + (m0.y + (m1.y - m0.y) * fr) * g.S - g.th / 2;
      const ma = m0.a + (m1.a - m0.a) * fr;
      const u = smooth((time - pull) / PULL_S);
      const target = t.r + 180 * Math.round((ma - t.r) / 180);
      frames.push({ offset: f / N, transform: T(mx + (t.x - mx) * u, my + (t.y - my) * u, ma + (target - ma) * u) });
    }
    anims.push(t.el.animate(frames, { duration: end * 1000, easing: 'linear', fill: 'forwards' }));
  });
  // The wall is standing once every tile has really arrived (an iPad can start the
  // animations late, so this waits for them rather than for a clock).
  Promise.all(anims.map((a) => a.finished)).then(
    () => {
      if (current !== c) return;
      showBuilt(c);
      onBuilt();
    },
    () => undefined, // stopped part-way (a new hand, or the page changed)
  );
}

/** How long the counting wipe takes for this dice total (ms). */
export function countMs(total: number): number {
  return reducedMotion() ? 300 : wallCountMs(total);
}

/**
 * After the dice: the counting wipe (after `delayMs`), then the gold break mark.
 * Builds the wall at once if it isn't standing (for example after reopening the page).
 */
export function countIntro(key: string, perWall: number, sideOf: (seat: number) => Side, dealer: number, total: number, delayMs: number): void {
  let c = current;
  if (!c || c.key !== key) c = create(key, perWall, sideOf);
  if (!c.built) showBuilt(c);
  const cc = c;
  if (reducedMotion()) return;
  const at = (seat: number, position: number): WallTile[] => cc.tiles.filter((t) => t.seat === seat && t.position === position);
  const flash = (list: WallTile[], hold: boolean): void =>
    list.forEach((t) =>
      t.el.animate([{ filter: 'brightness(2)' }, { filter: hold ? 'brightness(1.5)' : 'brightness(1)' }], { duration: hold ? 160 : 320, fill: hold ? 'forwards' : 'none' }),
    );
  // Round the walls: one wall per point on the dice, starting with the dealer's.
  for (let k = 1; k <= total; k++) {
    const seat = (dealer + k - 1) % SEATS;
    cc.timers.push(setTimeout(() => flash(cc.tiles.filter((t) => t.seat === seat), k === total), delayMs + (k - 1) * 120));
  }
  // Along the stacks of that wall, from its right-hand end.
  const breakSeat = (dealer + total - 1) % SEATS;
  const stacksStart = delayMs + total * 120 + 250;
  for (let k = 0; k < total; k++) cc.timers.push(setTimeout(() => flash(at(breakSeat, k), true), stacksStart + k * 35));
  // The gold mark at the break.
  cc.timers.push(
    setTimeout(() => {
      const g = cc.g;
      const a = stackCentre(cc.sideOf(breakSeat), total - 1, cc.perWall, g);
      const b = stackCentre(cc.sideOf(breakSeat), total, cc.perWall, g);
      const mark = document.createElement('div');
      mark.className = 'intro-break';
      const across = a.r === 90; // a wall down the side of the screen: the mark lies across it
      mark.style.left = `${(a.x + b.x) / 2 - (across ? g.th * 0.7 : 2)}px`;
      mark.style.top = `${(a.y + b.y) / 2 - (across ? 2 : g.th * 0.7)}px`;
      mark.style.width = across ? `${g.th * 1.4}px` : '4px';
      mark.style.height = across ? '4px' : `${g.th * 1.4}px`;
      cc.box.appendChild(mark);
    }, stacksStart + total * 35),
  );
  // The lights go out when dealing starts.
  cc.timers.push(
    setTimeout(() => {
      cc.box.querySelector('.intro-break')?.remove();
      cc.tiles.forEach((t) => t.el.getAnimations().forEach((an) => an.cancel()));
      cc.tiles.forEach((t) => (t.el.style.transform = T(t.x, t.y, t.r)));
    }, delayMs + countMs(total)),
  );
}

/** While dealing: show only the tiles still in the wall (stacks give their top tile first). */
export function setIntroStacks(key: string, stacks: { seat: number; position: number; count: number }[]): void {
  if (!current || current.key !== key) return;
  const count = new Map(stacks.map((s) => [`${s.seat}-${s.position}`, s.count]));
  for (const t of current.tiles) {
    const n = count.get(`${t.seat}-${t.position}`) ?? 0;
    t.el.style.visibility = (t.layer === 1 ? n >= 2 : n >= 1) ? 'visible' : 'hidden';
  }
}

/** Where a stack of the wall is on the screen (for tiles flying from it), or null. */
export function introStackPoint(key: string, seat: number, position: number): { x: number; y: number } | null {
  if (!current || current.key !== key) return null;
  const c = stackCentre(current.sideOf(seat), position, current.perWall, current.g);
  return { x: c.x, y: c.y };
}

/** The deal is over: what is left of the wall shrinks into the small "tiles left" box, then goes. */
export function finishIntro(key: string): void {
  const c = current;
  if (!c || c.key !== key) return;
  const boxEl = document.querySelector('.wall-box');
  const target = boxEl?.getBoundingClientRect();
  if (!boxEl || !target || reducedMotion()) {
    clear();
    return;
  }
  // Each stack still in the wall shrinks onto exactly the bar that stands for it in the small
  // box (WallBox in Table: a 100 × 100 square, wall lines 7 thick), in the box's colours.
  // Then the box fades in while the shrunk wall fades out, so nothing pops into view.
  const css = getComputedStyle(boxEl);
  const full = css.getPropertyValue('--tile-back').trim() || '#2f7d5b';
  const light = css.getPropertyValue('--tile-back-light').trim() || '#6aa88b';
  const B = 100;
  const W = 7;
  const seg = (B - 2 * W) / c.perWall;
  const kx = target.width / B;
  const ky = target.height / B;
  const stackCount = new Map<string, number>();
  for (const t of c.tiles) if (t.el.style.visibility !== 'hidden') stackCount.set(`${t.seat}-${t.position}`, (stackCount.get(`${t.seat}-${t.position}`) ?? 0) + 1);
  document.body.classList.add('intro-arriving');
  const SHRINK = WALL_SHRINK_MS - INTRO_FADE_MS;
  for (const t of c.tiles) {
    if (t.el.style.visibility === 'hidden') continue;
    const side = c.sideOf(t.seat);
    let x = 0, y = 0, w = seg, h = W;
    if (side === 'bottom') { x = W + (c.perWall - 1 - t.position) * seg; y = B - W; }
    else if (side === 'top') { x = W + t.position * seg; y = 0; }
    else if (side === 'right') { x = B - W; y = W + t.position * seg; w = W; h = seg; }
    else { x = 0; y = W + (c.perWall - 1 - t.position) * seg; w = W; h = seg; }
    const pw = w * kx;
    const ph = h * ky;
    const ncx = target.left + (x + w / 2) * kx;
    const ncy = target.top + (y + h / 2) * ky;
    const g = c.g;
    // Scale in the tile's own direction: a tile turned 90° has its width running up the screen.
    const turned = t.r === 90;
    const scX = turned ? ph / g.tw : pw / g.tw;
    const scY = turned ? pw / g.th : ph / g.th;
    const colour = (stackCount.get(`${t.seat}-${t.position}`) ?? 0) >= 2 ? full : light;
    t.el.getAnimations().forEach((a) => a.cancel());
    t.el.animate(
      [
        { transform: T(t.x, t.y, t.r), borderRadius: '3px' },
        { transform: `translate(${ncx - g.tw / 2}px, ${ncy - g.th / 2}px) rotate(${t.r}deg) scale(${scX}, ${scY})`, borderRadius: '0px', backgroundColor: colour, boxShadow: 'none', borderColor: 'transparent' },
      ],
      { duration: SHRINK, easing: 'ease-in-out', fill: 'forwards' },
    );
  }
  c.timers.push(
    setTimeout(() => {
      if (current !== c) return;
      // The small box fades in exactly where the shrunk wall is, as the wall fades out.
      document.body.classList.remove('intro-arriving');
      document.body.classList.add('intro-fading');
      c.box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: INTRO_FADE_MS, fill: 'forwards' });
    }, SHRINK),
    setTimeout(() => {
      document.body.classList.remove('intro-fading');
      if (current === c) clear();
    }, SHRINK + INTRO_FADE_MS + 30),
  );
}

// ---------- the shared pile between hands (shuffling) ----------
// The server moves the pile and sends where every tile is about 15 times a second;
// in between, each tile glides smoothly from where it was to where it is now.

interface PileView {
  id: number;
  perWall: number;
  layer: HTMLElement;
  els: HTMLElement[];
  from: number[];
  to: number[];
  at: number;
  raf: number;
}
let pileView: PileView | null = null;
const FRAME_MS = 66;

function drawPile(): void {
  const p = pileView;
  if (!p) return;
  const g = geometry(p.perWall);
  const k = Math.min(1, (performance.now() - p.at) / FRAME_MS);
  for (let i = 0; i < p.els.length; i++) {
    const lerp = (j: number): number => p.from[i * 3 + j]! + (p.to[i * 3 + j]! - p.from[i * 3 + j]!) * k;
    const x = g.cx + (lerp(0) / 10000) * g.S - g.tw / 2;
    const y = g.cy + (lerp(1) / 10000) * g.S - g.th / 2;
    p.els[i]!.style.transform = T(x, y, (lerp(2) / 1000) * (180 / Math.PI));
  }
  p.raf = k < 1 ? requestAnimationFrame(drawPile) : 0;
}

/** A new frame of the pile from the server. */
export function showPile(id: number, perWall: number, tiles: number[]): void {
  if (current) return; // the wall is being built or is standing: the pile is gone
  if (!pileView || pileView.id !== id || pileView.els.length * 3 !== tiles.length) {
    hidePile();
    const g = geometry(perWall);
    const layer = document.createElement('div');
    layer.className = 'intro-layer pile-layer';
    layer.setAttribute('aria-hidden', 'true');
    const els: HTMLElement[] = [];
    for (let i = 0; i < tiles.length / 3; i++) {
      const el = document.createElement('div');
      el.className = 'intro-tile';
      el.style.width = `${g.tw}px`;
      el.style.height = `${g.th}px`;
      layer.appendChild(el);
      els.push(el);
    }
    document.body.appendChild(layer);
    pileView = { id, perWall, layer, els, from: tiles.slice(), to: tiles.slice(), at: 0, raf: 0 };
  } else {
    // Glide on from wherever each tile is drawn right now.
    const k = Math.min(1, (performance.now() - pileView.at) / FRAME_MS);
    pileView.from = pileView.from.map((f, j) => f + (pileView!.to[j]! - f) * k);
    pileView.to = tiles.slice();
  }
  pileView.at = performance.now();
  if (!pileView.raf) pileView.raf = requestAnimationFrame(drawPile);
}

export function hidePile(): void {
  if (!pileView) return;
  cancelAnimationFrame(pileView.raf);
  pileView.layer.remove();
  pileView = null;
}

export function pileShowing(): boolean {
  return !!pileView;
}

/** Screen point → the pile's units (the wall square is 1 wide, centred on 0, 0). */
export function pileUnits(clientX: number, clientY: number, perWall: number): { x: number; y: number } {
  const g = geometry(perWall);
  return { x: (clientX - g.cx) / g.S, y: (clientY - g.cy) / g.S };
}

/**
 * The 6 shoves are over: each tile glides from where it lies in the pile to the nearest
 * place in the wall (all four walls at once). Calls `onBuilt` when the wall is standing.
 * Returns false if there is no pile on screen (then use startIntro instead).
 */
export function buildFromPile(key: string, perWall: number, sideOf: (seat: number) => Side, onBuilt: () => void): boolean {
  const p = pileView;
  if (current?.key === key) {
    if (current.built) onBuilt();
    return true;
  }
  if (!p || p.perWall !== perWall) return false;
  const g0 = geometry(perWall);
  const k = Math.min(1, (performance.now() - p.at) / FRAME_MS);
  const now = p.from.map((f, j) => f + (p.to[j]! - f) * k);
  const pos = p.els.map((_, i) => ({ x: g0.cx + (now[i * 3]! / 10000) * g0.S, y: g0.cy + (now[i * 3 + 1]! / 10000) * g0.S, a: (now[i * 3 + 2]! / 1000) * (180 / Math.PI) }));
  hidePile();
  const c = create(key, perWall, sideOf);
  const g = c.g;
  if (reducedMotion() || pos.length !== c.tiles.length) {
    showBuilt(c);
    onBuilt();
    return true;
  }
  // Each tile goes to the wall place nearest to where it lies (both sorted round the middle).
  const angle = (x: number, y: number): number => Math.atan2(y - g.cy, x - g.cx);
  const pileOrder = pos.map((_, i) => i).sort((i, j) => angle(pos[i]!.x, pos[i]!.y) - angle(pos[j]!.x, pos[j]!.y));
  const wallOrder = c.tiles.map((_, i) => i).sort((i, j) => angle(c.tiles[i]!.x + g.tw / 2, c.tiles[i]!.y + g.th / 2) - angle(c.tiles[j]!.x + g.tw / 2, c.tiles[j]!.y + g.th / 2));
  const anims: Animation[] = [];
  wallOrder.forEach((ti, n) => {
    const t = c.tiles[ti]!;
    const q = pos[pileOrder[n]!]!;
    const sx = q.x - g.tw / 2;
    const sy = q.y - g.th / 2;
    const target = t.r + 180 * Math.round((q.a - t.r) / 180);
    const delay = (t.position * 0.02 + t.layer * 0.04) * 1000;
    t.el.style.transform = T(sx, sy, q.a);
    anims.push(
      t.el.animate([{ transform: T(sx, sy, q.a) }, { transform: T(t.x, t.y, target) }], {
        duration: PULL_S * 1000,
        delay,
        easing: 'ease-in-out',
        fill: 'both',
      }),
    );
  });
  Promise.all(anims.map((a) => a.finished)).then(
    () => {
      if (current !== c) return;
      showBuilt(c);
      onBuilt();
    },
    () => undefined,
  );
  return true;
}

/** The space inside the big wall (screen pixels), for the dice to bounce in; null if no wall. */
export function introInnerBox(): { l: number; t: number; r: number; b: number } | null {
  if (!current) return null;
  const g = current.g;
  const half = g.S / 2;
  const pad = g.th / 2 + 4;
  return { l: g.cx - half + pad, t: g.cy - half + pad, r: g.cx + half - pad, b: g.cy + half - pad };
}

/** Remove the wall drawing (a hand was stopped, the page changes, ...). */
export function stopIntro(): void {
  clear();
}

export function introKeyIs(key: string): boolean {
  return current?.key === key;
}
