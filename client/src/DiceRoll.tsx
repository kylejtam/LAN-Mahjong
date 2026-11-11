/**
 * The dice roll at the start of each hand: three dice are thrown from the
 * dealer's side, bounce around the screen while their faces flicker, then
 * settle side by side in the middle showing the real roll. The deal starts
 * once they have landed (see DICE_MS in Table.tsx).
 *
 * Each device plays it by itself from the moment the hand appears, so it
 * needs nothing extra from the server. Moves are done directly on the dice
 * (no React re-render each frame) to keep it smooth on phones.
 */
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

/** How long the whole roll lasts, landing included. */
import { DICE_ROLL_MS } from '@lan-mahjong/shared';
export const DICE_MS = DICE_ROLL_MS;
const BOUNCE_MS = 1650; // bouncing around
const SETTLE_MS = 450; // gliding into place

/** Pip positions on a 3 × 3 grid (0-8, row by row) for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** One die face. Chinese dice have a big red 1 and red pips on the 4. */
export function DieFace({ value }: { value: number }): ReactElement {
  const red = value === 1 || value === 4;
  return (
    <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="6" fill="#fbf8ef" stroke="#cfc6ad" strokeWidth="1.2" />
      {(PIPS[value] ?? []).map((p) => (
        <circle
          key={p}
          cx={7.5 + (p % 3) * 7.5}
          cy={7.5 + Math.floor(p / 3) * 7.5}
          r={value === 1 ? 4.6 : 2.6}
          fill={red ? '#c8322b' : '#1d2a24'}
        />
      ))}
    </svg>
  );
}

type Side = 'bottom' | 'right' | 'top' | 'left';

export function DiceRoll({ values, from }: { values: [number, number, number]; from: Side }): ReactElement {
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useEffect(() => {
    const els = refs.map((r) => r.current!);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const size = els[0]!.offsetWidth || 48;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Where they land: side by side in the middle.
    const land = [-1, 0, 1].map((k) => ({ x: W / 2 + k * size * 1.25 - size / 2, y: H * 0.45 - size / 2 }));
    // Thrown from the dealer's edge of the screen, towards the middle.
    const start = (i: number): { x: number; y: number; vx: number; vy: number } => {
      const spread = (i - 1) * size * 1.1;
      const speed = Math.max(W, H) * (1.1 + Math.random() * 0.5); // pixels per second
      const wobble = (Math.random() - 0.5) * 0.9;
      if (from === 'bottom') return { x: W / 2 + spread, y: H - size, vx: speed * wobble, vy: -speed };
      if (from === 'top') return { x: W / 2 + spread, y: 0, vx: speed * wobble, vy: speed };
      if (from === 'left') return { x: 0, y: H / 2 + spread, vx: speed, vy: speed * wobble };
      return { x: W - size, y: H / 2 + spread, vx: -speed, vy: speed * wobble };
    };
    const dice = els.map((_, i) => ({ ...start(i), rot: Math.random() * 360, vr: (Math.random() - 0.5) * 1400, face: 1 + ((i * 2) % 6) }));
    // Which face shows is chosen in the CSS from data-value.
    const showFace = (i: number, v: number): void => {
      els[i]!.dataset.value = String(v);
    };
    const t0 = performance.now();
    let last = t0;
    let lastFlick = 0;
    let settledFrom: { x: number; y: number; rot: number }[] | null = null;
    let raf = 0;

    const frame = (now: number): void => {
      const t = now - t0;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (reduce || t >= BOUNCE_MS + SETTLE_MS) {
        // Landed: the real numbers, side by side.
        els.forEach((el, i) => {
          el.style.transform = `translate(${land[i]!.x}px, ${land[i]!.y}px) rotate(0deg)`;
          showFace(i, values[i]!);
        });
        if (t < DICE_MS) raf = requestAnimationFrame(frame);
        return;
      }
      if (t < BOUNCE_MS) {
        // Bouncing: slide with friction, bounce off the screen edges, spin.
        const friction = Math.pow(0.18, dt); // loses most of its speed over about a second
        dice.forEach((d) => {
          d.vx *= friction;
          d.vy *= friction;
          d.vr *= friction;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.rot += d.vr * dt;
          if (d.x < 0) { d.x = 0; d.vx = Math.abs(d.vx) * 0.75; }
          if (d.x > W - size) { d.x = W - size; d.vx = -Math.abs(d.vx) * 0.75; }
          if (d.y < 0) { d.y = 0; d.vy = Math.abs(d.vy) * 0.75; }
          if (d.y > H - size) { d.y = H - size; d.vy = -Math.abs(d.vy) * 0.75; }
        });
        // Faces flicker while they tumble (slower as they slow down).
        if (now - lastFlick > 70 + (t / BOUNCE_MS) * 120) {
          lastFlick = now;
          dice.forEach((d, i) => { d.face = 1 + Math.floor(Math.random() * 6); showFace(i, d.face); });
        }
        els.forEach((el, i) => { el.style.transform = `translate(${dice[i]!.x}px, ${dice[i]!.y}px) rotate(${dice[i]!.rot}deg)`; });
      } else {
        // Settling: glide into place and show the real numbers.
        if (!settledFrom) {
          settledFrom = dice.map((d) => ({ x: d.x, y: d.y, rot: d.rot % 360 }));
          dice.forEach((_, i) => showFace(i, values[i]!));
        }
        const k = Math.min(1, (t - BOUNCE_MS) / SETTLE_MS);
        const ease = 1 - Math.pow(1 - k, 3);
        els.forEach((el, i) => {
          const s = settledFrom![i]!;
          const x = s.x + (land[i]!.x - s.x) * ease;
          const y = s.y + (land[i]!.y - s.y) * ease;
          el.style.transform = `translate(${x}px, ${y}px) rotate(${s.rot * (1 - ease)}deg)`;
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dice-roll" aria-label={`Dice: ${values.join(', ')}`}>
      {refs.map((r, i) => (
        <div key={i} ref={r} className="dice-roll-die" data-value={1 + ((i * 2) % 6)}>
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <span key={v} className={`face face-${v}`}>
              <DieFace value={v} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
