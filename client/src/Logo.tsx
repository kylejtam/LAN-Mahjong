/** The game's logo: the original 1 bamboo bird (no tile background). */
import type { ReactElement } from 'react';

export function Logo({ size = '3rem' }: { size?: string }): ReactElement {
  return (
    // Just the bird, no tile behind it (cropped to the bird's own shape).
    <svg className="logo" viewBox="6 12 54 64" style={{ width: size, height: `calc(${size} * 64 / 54)` }} aria-label="LAN Mahjong logo">
      <g>
        <path d="M14 58 Q8 70 20 70 L28 60 Z" fill="#1f5fae" />
        <path d="M18 60 Q12 74 26 72 L30 62 Z" fill="#c8322b" />
        <ellipse cx={32} cy={48} rx={14} ry={11} fill="#1d8a4a" />
        <circle cx={42} cy={30} r={7} fill="#1d8a4a" />
        <path d="M48 29 L56 31 L48 33 Z" fill="#c8322b" />
        <circle cx={44} cy={29} r={1.6} fill="#fbf8ef" />
        <path d="M38 23 Q40 14 46 18 Q42 20 42 24 Z" fill="#c8322b" />
        <path d="M30 59 L28 70 M34 59 L36 70" stroke="#9aa3ad" strokeWidth={2} />
      </g>
    </svg>
  );
}
