/**
 * Draws one tile as a picture (SVG), in a clean flat style with the
 * conventional colours. No image files are needed.
 *
 * The drawing area is 60 wide by 80 tall.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { TileType } from '@lan-mahjong/shared';

const BLUE = '#1f5fae';
const GREEN = '#1d8a4a';
const RED = '#c8322b';
const DARK = '#1b2733';
const NAVY = '#1b3f8b';
const IVORY = '#fbf8ef';

const CJK_FONT = "'Noto Serif TC','Songti TC','PMingLiU','Noto Serif CJK TC','Noto Sans CJK TC','PingFang TC',serif";

const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CHARS: Record<string, string> = { wE: '東', wS: '南', wW: '西', wN: '北' };
const FLOWER_CHARS: Record<string, string> = { f1: '梅', f2: '蘭', f3: '菊', f4: '竹', n1: '春', n2: '夏', n3: '秋', n4: '冬' };

type Dot = [x: number, y: number, r: number, colour: string];

const DOTS: Record<number, Dot[]> = {
  2: [[30, 22, 11, GREEN], [30, 58, 11, BLUE]],
  3: [[16, 18, 9, BLUE], [30, 40, 9, RED], [44, 62, 9, GREEN]],
  4: [[17, 22, 10, BLUE], [43, 22, 10, GREEN], [17, 58, 10, GREEN], [43, 58, 10, BLUE]],
  5: [[15, 17, 9, BLUE], [45, 17, 9, GREEN], [30, 40, 9, RED], [15, 63, 9, GREEN], [45, 63, 9, BLUE]],
  6: [[18, 15, 8, GREEN], [42, 15, 8, GREEN], [18, 42, 8, RED], [42, 42, 8, RED], [18, 65, 8, RED], [42, 65, 8, RED]],
  7: [
    [13, 11, 6.5, GREEN], [30, 19, 6.5, GREEN], [47, 27, 6.5, GREEN],
    [18, 48, 7.5, RED], [42, 48, 7.5, RED], [18, 67, 7.5, RED], [42, 67, 7.5, RED],
  ],
  8: [18, 42].flatMap((x) => [12, 30, 49, 68].map((y): Dot => [x, y, 7.5, BLUE])),
  9: [16, 40, 64].flatMap((y, row) => [13, 30, 47].map((x): Dot => [x, y, 7.5, [BLUE, RED, GREEN][row]!])),
};

/** A stick: [x, y, height, colour, tilt in degrees]. */
type Stick = [x: number, y: number, h: number, colour: string, tilt?: number];

const STICKS: Record<number, Stick[]> = {
  2: [[30, 22, 22, GREEN], [30, 58, 22, BLUE]],
  3: [[30, 22, 22, GREEN], [19, 58, 22, BLUE], [41, 58, 22, GREEN]],
  4: [[19, 22, 22, BLUE], [41, 22, 22, GREEN], [19, 58, 22, GREEN], [41, 58, 22, BLUE]],
  5: [[16, 22, 22, GREEN], [44, 22, 22, BLUE], [30, 40, 22, RED], [16, 58, 22, BLUE], [44, 58, 22, GREEN]],
  6: [14, 30, 46].flatMap((x) => [[x, 22, 22, GREEN], [x, 58, 22, BLUE]] as Stick[]),
  7: [[30, 14, 18, RED], ...[14, 30, 46].flatMap((x) => [[x, 41, 18, GREEN], [x, 65, 18, GREEN]] as Stick[])],
  8: [12, 24, 36, 48].flatMap((x, i) => [
    [x, 22, 22, GREEN, i % 2 ? -14 : 14],
    [x, 58, 22, GREEN, i % 2 ? 14 : -14],
  ] as Stick[]),
  9: [14, 30, 46].flatMap((x, col) => [15, 40, 65].map((y): Stick => [x, y, 19, [BLUE, RED, GREEN][col]!])),
};

function DotShape([x, y, r, c]: Dot, key: number): ReactElement {
  return (
    <g key={key}>
      <circle cx={x} cy={y} r={r} fill={c} />
      <circle cx={x} cy={y} r={r * 0.66} fill={IVORY} />
      <circle cx={x} cy={y} r={r * 0.4} fill={c} />
    </g>
  );
}

function StickShape([x, y, h, c, tilt = 0]: Stick, key: number): ReactElement {
  const w = 7;
  return (
    <g key={key} transform={`rotate(${tilt} ${x} ${y})`}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} fill={c} />
      <rect x={x - w / 2} y={y - 1} width={w} height={2} fill={IVORY} opacity={0.75} />
      <rect x={x - 1} y={y - h / 2 + 3} width={2} height={h - 6} fill={IVORY} opacity={0.35} />
    </g>
  );
}

/** One of bamboo: a simple bird. */
function Bird(): ReactElement {
  return (
    <g>
      <path d="M14 58 Q8 70 20 70 L28 60 Z" fill={BLUE} />
      <path d="M18 60 Q12 74 26 72 L30 62 Z" fill={RED} />
      <ellipse cx={32} cy={48} rx={14} ry={11} fill={GREEN} />
      <circle cx={42} cy={30} r={7} fill={GREEN} />
      <path d="M48 29 L56 31 L48 33 Z" fill={RED} />
      <circle cx={44} cy={29} r={1.6} fill={IVORY} />
      <path d="M38 23 Q40 14 46 18 Q42 20 42 24 Z" fill={RED} />
      <path d="M30 59 L28 70 M34 59 L36 70" stroke={DARK} strokeWidth={2} />
    </g>
  );
}

function Face({ type }: { type: TileType }): ReactElement {
  const suit = type[0];
  const n = Number(type[1]);
  const text = (ch: string, y: number, size: number, colour: string, x = 30): ReactElement => (
    <text x={x} y={y} fontSize={size} fill={colour} fontFamily={CJK_FONT} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {ch}
    </text>
  );

  if (type.length === 2 && (suit === 'p' || suit === 's' || suit === 'm') && n >= 1 && n <= 9) {
    if (suit === 'p') {
      if (n === 1) {
        return (
          <g>
            <circle cx={30} cy={40} r={20} fill={GREEN} />
            <circle cx={30} cy={40} r={16} fill={IVORY} />
            <circle cx={30} cy={40} r={13} fill={BLUE} />
            <circle cx={30} cy={40} r={8} fill={IVORY} />
            <circle cx={30} cy={40} r={5} fill={RED} />
          </g>
        );
      }
      return <g>{DOTS[n]!.map(DotShape)}</g>;
    }
    if (suit === 's') return n === 1 ? <Bird /> : <g>{STICKS[n]!.map(StickShape)}</g>;
    return (
      <g>
        {text(NUMERALS[n]!, 24, 26, NAVY)}
        {text('萬', 58, 30, RED)}
      </g>
    );
  }
  if (WIND_CHARS[type]) return text(WIND_CHARS[type]!, 41, 40, DARK);
  if (type === 'dR') return text('中', 41, 42, RED);
  if (type === 'dG') return text('發', 41, 40, GREEN);
  if (type === 'dW') {
    return (
      <g fill="none" stroke={BLUE}>
        <rect x={11} y={13} width={38} height={54} rx={3} strokeWidth={3.5} />
        <rect x={17} y={19} width={26} height={42} rx={2} strokeWidth={1.5} />
      </g>
    );
  }
  if (FLOWER_CHARS[type]) {
    const isFlower = type[0] === 'f';
    return (
      <g>
        {text(FLOWER_CHARS[type]!, 44, 34, isFlower ? RED : BLUE)}
        {text(String(n), 11, 13, isFlower ? BLUE : RED, 50)}
      </g>
    );
  }
  return text('?', 40, 30, DARK);
}

export interface TileProps {
  type?: TileType | null;
  /** Show the back of the tile (hidden). */
  back?: boolean;
  /** Width in CSS (height is 4/3 of it). */
  width?: string;
  highlight?: boolean;
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A whole tile: ivory face with a coloured edge, or a plain back. */
export function TileView({ type, back, width = '2.2rem', highlight, dim, className, style }: TileProps): ReactElement {
  return (
    <span
      className={`tile${highlight ? ' tile-highlight' : ''}${dim ? ' tile-dim' : ''}${className ? ` ${className}` : ''}`}
      style={{
        width,
        height: `calc(${width} * 4 / 3)`,
        ...style,
      }}
      aria-label={back || !type ? 'hidden tile' : type}
    >
      <svg viewBox="0 0 64 84" preserveAspectRatio="none">
        {back || !type ? (
          <>
            <rect x={0} y={0} width={64} height={84} rx={7} fill="var(--tile-back-edge)" />
            <rect x={2} y={2} width={60} height={78} rx={6} fill="var(--tile-back)" />
          </>
        ) : (
          <>
            <rect x={0} y={0} width={64} height={84} rx={7} fill="var(--tile-edge)" />
            <rect x={2} y={2} width={60} height={78} rx={6} fill={IVORY} />
            <g transform="translate(2 2)">
              <Face type={type} />
            </g>
          </>
        )}
      </svg>
    </span>
  );
}
