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
const BRANCH = '#6b4a2b';
const PINK = '#e05a7a';
const YELLOW = '#f2c230';
const LEAF = '#3c9a4e';

/** A five-petal blossom (plum, peach). */
function Blossom({ x, y, r, colour = PINK }: { x: number; y: number; r: number; colour?: string }): ReactElement {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((k) => {
        const a = ((k * 72 - 90) * Math.PI) / 180;
        return <circle key={k} cx={x + r * Math.cos(a)} cy={y + r * Math.sin(a)} r={r * 0.78} fill={colour} />;
      })}
      <circle cx={x} cy={y} r={r * 0.5} fill={YELLOW} />
    </g>
  );
}

/** A long pointed leaf, starting at (x, y) and pointing at `angle` degrees. */
function Leaf({ x, y, angle, len = 16, colour = LEAF }: { x: number; y: number; angle: number; len?: number; colour?: string }): ReactElement {
  return <path d={`M0 0 Q${len * 0.45} ${-len * 0.22} ${len} 0 Q${len * 0.45} ${len * 0.22} 0 0 Z`} fill={colour} transform={`translate(${x} ${y}) rotate(${angle})`} />;
}

/** Flowers 梅蘭菊竹 and seasons 春夏秋冬: simple flat pictures, no words. */
const FLOWER_PICTURES: Record<string, () => ReactElement> = {
  // Plum blossom 梅: a branch with blossoms.
  f1: () => (
    <g>
      <path d="M8 72 Q22 56 28 42 T43 18" stroke={BRANCH} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <path d="M28 44 Q38 42 46 50" stroke={BRANCH} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Blossom x={20} y={56} r={5.5} />
      <Blossom x={38} y={26} r={6} />
      <Blossom x={46} y={50} r={4.5} />
      <circle cx={43} cy={18} r={2.5} fill={PINK} />
      <circle cx={13} cy={67} r={2.2} fill={PINK} />
    </g>
  ),
  // Orchid 蘭: long curved leaves and a purple flower.
  f2: () => (
    <g fill="none" strokeLinecap="round">
      <path d="M30 74 Q14 54 7 30" stroke={LEAF} strokeWidth={3} />
      <path d="M30 74 Q44 52 55 42" stroke={LEAF} strokeWidth={3} />
      <path d="M30 74 Q24 58 18 50" stroke={LEAF} strokeWidth={2.4} />
      <path d="M30 74 Q32 50 34 32" stroke={LEAF} strokeWidth={1.8} />
      <g fill="#8e5bb5" stroke="none">
        <ellipse cx={34} cy={18} rx={4} ry={9} />
        <ellipse cx={34} cy={18} rx={4} ry={9} transform="rotate(-70 34 24)" />
        <ellipse cx={34} cy={18} rx={4} ry={9} transform="rotate(70 34 24)" />
        <ellipse cx={34} cy={30} rx={5} ry={3.5} fill="#b07ad6" />
      </g>
      <circle cx={34} cy={24} r={2.6} fill={YELLOW} stroke="none" />
    </g>
  ),
  // Chrysanthemum 菊: a round flower of many petals on a stem.
  f3: () => (
    <g>
      <path d="M30 44 Q27 60 30 76" stroke={LEAF} strokeWidth={2.6} fill="none" />
      <Leaf x={29} y={60} angle={200} len={15} />
      <Leaf x={30} y={66} angle={-20} len={14} />
      {Array.from({ length: 16 }, (_, k) => (
        <ellipse key={k} cx={30} cy={20} rx={3.2} ry={10} fill="#e89a1a" transform={`rotate(${k * 22.5} 30 30)`} />
      ))}
      {Array.from({ length: 12 }, (_, k) => (
        <ellipse key={`i${k}`} cx={30} cy={24} rx={2.4} ry={6} fill={YELLOW} transform={`rotate(${k * 30 + 15} 30 30)`} />
      ))}
      <circle cx={30} cy={30} r={4} fill="#c9781a" />
    </g>
  ),
  // Bamboo plant 竹: two stalks with leaves.
  f4: () => (
    <g>
      <rect x={20} y={10} width={5} height={66} rx={2} fill={GREEN} />
      <rect x={34} y={26} width={4} height={50} rx={2} fill={GREEN} />
      {[24, 40, 58].map((y) => <rect key={y} x={19} y={y} width={7} height={2} fill="#14612f" />)}
      {[40, 58].map((y) => <rect key={y} x={33} y={y} width={6} height={2} fill="#14612f" />)}
      <Leaf x={25} y={24} angle={-25} len={18} />
      <Leaf x={25} y={25} angle={10} len={15} />
      <Leaf x={20} y={40} angle={200} len={16} />
      <Leaf x={38} y={40} angle={-30} len={16} />
      <Leaf x={38} y={41} angle={15} len={13} />
      <Leaf x={20} y={58} angle={160} len={14} />
    </g>
  ),
  // Spring 春: peach blossom.
  n1: () => (
    <g>
      <path d="M10 70 Q24 60 30 40" stroke={BRANCH} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Leaf x={22} y={58} angle={200} len={14} />
      <Leaf x={27} y={50} angle={-15} len={13} />
      <Blossom x={31} y={32} r={10} colour="#f28aa8" />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = ((k * 72 - 54) * Math.PI) / 180;
        return <line key={k} x1={31} y1={32} x2={31 + 7 * Math.cos(a)} y2={32 + 7 * Math.sin(a)} stroke="#c94f73" strokeWidth={1} />;
      })}
      <circle cx={31} cy={32} r={3} fill={YELLOW} />
    </g>
  ),
  // Summer 夏: lotus above a lily pad.
  n2: () => (
    <g>
      <ellipse cx={30} cy={66} rx={22} ry={6} fill={LEAF} />
      <path d="M30 66 L30 52" stroke="#2f7a3d" strokeWidth={2.4} />
      {[-56, -28, 0, 28, 56].map((r) => (
        <path key={r} d="M0 0 Q-7 -12 0 -26 Q7 -12 0 0 Z" fill={r === 0 ? '#f07fa0' : '#f4a3bb'} transform={`translate(30 52) rotate(${r})`} />
      ))}
      <circle cx={30} cy={50} r={3} fill={YELLOW} />
    </g>
  ),
  // Autumn 秋: maple leaf.
  n3: () => (
    <g>
      <polygon
        points="30,10 34,23 44,17 41,30 53,29 44,38 49,48 35,44 32,56 30,58 28,56 25,44 11,48 16,38 7,29 19,30 16,17 26,23"
        fill="#d2452b"
      />
      <path d="M30 26 L30 72" stroke={BRANCH} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M30 40 L42 30 M30 40 L18 30 M30 48 L40 46 M30 48 L20 46" stroke="#a8321c" strokeWidth={1.2} />
    </g>
  ),
  // Winter 冬: snowflake.
  n4: () => (
    <g stroke="#3a7bd5" strokeWidth={2.6} strokeLinecap="round" fill="none">
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <g key={r} transform={`rotate(${r} 30 40)`}>
          <line x1={30} y1={40} x2={30} y2={18} />
          <path d="M24 25 L30 30 L36 25" />
          <path d="M26 19 L30 22 L34 19" />
        </g>
      ))}
      <circle cx={30} cy={40} r={3} fill="#3a7bd5" />
    </g>
  ),
};

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
  // Outer sticks stand straight; the middle four lean to make an M over a W.
  8: [
    [11, 22, 22, GREEN], [24, 22, 22, GREEN, -22], [36, 22, 22, GREEN, 22], [49, 22, 22, GREEN],
    [11, 58, 22, GREEN], [24, 58, 22, GREEN, 22], [36, 58, 22, GREEN, -22], [49, 58, 22, GREEN],
  ],
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
  const Picture = FLOWER_PICTURES[type];
  if (Picture) {
    // Picture plus the small number (1-4) that says which seat it belongs to.
    const isFlower = type[0] === 'f';
    return (
      <g>
        <Picture />
        {text(String(n), 10, 12, isFlower ? RED : BLUE, 52)}
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
