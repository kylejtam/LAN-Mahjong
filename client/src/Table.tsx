/**
 * The game table: the screen you play on.
 *
 * Layout (landscape, the same for everyone):
 * - Top bar: undo (left), round and seat winds (centre), your chips, help,
 *   settings (right).
 * - Middle: the other three players, the wall around the table and every
 *   discarded tile.
 * - Bottom: your shown sets and flowers, your hand, and the action buttons.
 *
 * Your own seat is always at the bottom. The next player in turn order is on
 * your right, the opposite player at the top, the previous player on your left.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Meld, NormalType, Tile, TileType } from '@lan-mahjong/shared';
import { sortHand } from '@lan-mahjong/shared';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView, SeatView } from '../../server/src/game/view';
import type { Claim } from '../../server/src/game/round';
import { TileView } from './TileFace';
import { ACTION_LABELS, Prefs, WIND_CHARS, WIND_NAMES, WIND_SHORT, personName, t, useLang } from './i18n';
import type { StringKey } from './i18n';
import { DragSource, Drop, useDrag } from './drag';
import { HelpPanel } from './HelpPanel';
import { ChipIcon } from './ChipIcon';
import { DICE_MS, DiceRoll } from './DiceRoll';
import { APP_VERSION } from './version';
import { CELEBRATION_STYLES, celebrate } from './celebrate';
import { ResultPanel } from './ResultPanel';

/**
 * The iPhone's safe-area strips (the camera island and the home bar), in
 * pixels. Read from the --safe-* CSS values, which come from the phone.
 */
function safeInsets(): { l: number; r: number; t: number; b: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string): number => Number.parseFloat(v) || 0;
  const out = { l: px(cs.paddingLeft), r: px(cs.paddingRight), t: px(cs.paddingTop), b: px(cs.paddingBottom) };
  probe.remove();
  return out;
}

/**
 * The usable window size (minus the iPhone's camera-island and home-bar
 * strips), kept up to date when the device turns or the window changes.
 */
function useScreenSize(): { w: number; h: number } {
  const measure = (): { w: number; h: number } => {
    const s = safeInsets();
    return { w: window.innerWidth - s.l - s.r, h: window.innerHeight - s.t - s.b };
  };
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const update = (): void => setSize(measure());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return size;
}

type Side = 'bottom' | 'right' | 'top' | 'left';

/** While dragging a tile over your hand: where it would land. */
interface HandGap {
  /** Is the finger over the hand row? */
  over: boolean;
  /** The dragged tile's place in the row (-1 for the drawn tile, which sits apart). */
  from: number;
  /** Where it would go among the other tiles (0 = far left). */
  target: number;
  /** Distance from one tile to the next, in pixels. */
  slot: number;
  /** The other tiles, left to right. */
  otherIds: number[];
}

/** How long the middle pop-ups (flowers, Soeng / Pung / Gong) stay on screen. Matches the CSS animation. */
const POP_MS = 3000;

/** A pop-up in the middle of the table: a flower draw or a claim (Soeng / Pung / Gong). */
interface Pop {
  key: string;
  kind: 'flower' | 'chow' | 'pong' | 'gong' | 'win';
  seat: number;
  types: TileType[];
  /** A concealed gong shows two of its tiles face down. */
  concealed?: boolean;
}
const SIDES: Side[] = ['bottom', 'right', 'top', 'left'];

interface Props {
  view: RoomView;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
}

type Chooser =
  | { kind: 'chow'; options: [number, number][] }
  | { kind: 'ownGong'; concealed: NormalType[]; added: NormalType[] }
  | { kind: 'claimTile'; options: string[] }
  | null;

export function Table({ view, send, onLeave, prefs, setPrefs }: Props): ReactElement {
  const lang = prefs.lang;
  const tr = (key: StringKey, vars?: Record<string, string | number>): string => t(lang, key, vars);
  const labels = ACTION_LABELS[lang];
  const mySeat = view.you.seat;
  const [spectatorSeat, setSpectatorSeat] = useState(0);
  const bottomSeat = mySeat ?? spectatorSeat;
  const sideOf = (seat: number): Side => SIDES[(seat - bottomSeat + 4) % 4]!;
  const seatAt = (side: Side): number => (bottomSeat + SIDES.indexOf(side)) % 4;

  const round = view.round;
  const a = view.actions;
  const me = mySeat !== null ? view.seats[mySeat]! : null;

  const [panel, setPanel] = useState<'help' | 'settings' | null>(null);
  const screen = useScreenSize();
  /** After the win summary, players continue to the "Ready / Leave seat" popup. */
  const [showReady, setShowReady] = useState<string | null>(null);
  /** Spectators can close the seat picker and just watch. */
  const [justWatching, setJustWatching] = useState(false);
  const [chooser, setChooser] = useState<Chooser>(null);
  const command = (c: Extract<ClientMessage, { type: 'command' }>['command']): void => send({ type: 'command', command: c });
  const doClaim = (claim: Claim): void => command({ type: 'claim', claim });

  // Your hand: sorted automatically (suits fewest→most, 1-9, winds, dragons), unless
  // you drag tiles into your own order. The tile you just drew sits apart on the far right.
  const serverHand = view.seats[bottomSeat]?.hand ?? null;
  const drawnId = mySeat !== null ? view.justDrawnId : null;
  const roundKey = `${view.match.handsPlayed}-${round?.dice.join('') ?? ''}`;
  // Your hand is sorted once, when it is dealt; after that it keeps the order
  // you leave it in (new tiles go on the right). The order is remembered on
  // this device, so locking the phone or reloading doesn't shuffle it.
  const orderKey = `lan-mahjong-order:${view.id}:${view.you.name.toLowerCase()}`;
  const [manual, setManualState] = useState<{ key: string; ids: number[] } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(orderKey) ?? 'null') as { key: string; ids: number[] } | null;
      return saved && typeof saved.key === 'string' && Array.isArray(saved.ids) ? saved : null;
    } catch {
      return null;
    }
  });
  const setManual = (m: { key: string; ids: number[] }): void => {
    setManualState(m);
    try {
      localStorage.setItem(orderKey, JSON.stringify(m));
    } catch {
      /* storage may be blocked: the order still holds until the page reloads */
    }
  };
  // The new tile stays apart until you drag it into your hand.
  const drawnApart = drawnId !== null && !(manual?.key === roundKey && manual.ids.includes(drawnId));
  const hand: Tile[] = useMemo(() => {
    if (!serverHand) return [];
    const rest = serverHand.filter((t) => !(drawnApart && t.id === drawnId));
    if (!manual || manual.key !== roundKey) return sortHand(rest);
    const byId = new Map(rest.map((t) => [t.id, t]));
    const ordered = manual.ids.map((id) => byId.get(id)).filter((t): t is Tile => !!t);
    const extra = rest.filter((t) => !manual.ids.includes(t.id)); // new tiles go on the right
    return [...ordered, ...extra];
  }, [serverHand, manual, roundKey, drawnId, drawnApart]);
  const drawnTile = drawnApart ? serverHand?.find((t) => t.id === drawnId) ?? null : null;
  // Sort once at the start of each hand (the tile you just drew stays apart on the right).
  useEffect(() => {
    if (!serverHand || !round || manual?.key === roundKey) return;
    setManual({ key: roundKey, ids: sortHand(serverHand.filter((t) => t.id !== drawnId)).map((t) => t.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, !!serverHand, !!round]);

  // Claim options on the offered tile (anything except your own turn moves).
  const claimOptions = !!a && (a.win || a.pong || a.gong || a.chow.length > 0) && !!round?.offered && round.offered.by !== mySeat;
  // Buttons, flashing and the big claim tile stop once the next player has drawn.
  const claimable = claimOptions && !round?.offeredDrawn;
  const ownGongs = a ? a.concealedGongs.length + a.addedGongs.length : 0;

  /** Your hand row, and where a dragged tile would land in it (updated while dragging). */
  const handRef = useRef<HTMLDivElement>(null);
  const reorderRef = useRef<HandGap | null>(null);

  const onDrop = (src: DragSource, drop: Drop): void => {
    if (src.kind === 'hand') {
      const gap = reorderRef.current;
      if (drop.zone === 'discard' && a?.discard) {
        command({ type: 'discard', tileId: src.tileId });
      } else if (gap?.over) {
        // Reorder (on this device only): drop it into the gap the other tiles made.
        const ids = [...gap.otherIds];
        ids.splice(gap.target, 0, src.tileId);
        setManual({ key: roundKey, ids });
      } else if (drop.zone === 'hand') {
        // Reorder (on this device only): put the tile where it was dropped.
        const els = [...document.querySelectorAll<HTMLElement>('[data-hand-tile]')].filter(
          (el) => el.dataset.drawn !== 'true',
        );
        const others = els.filter((el) => Number(el.dataset.handTile) !== src.tileId);
        let index = others.findIndex((el) => {
          const r = el.getBoundingClientRect();
          return drop.x < r.left + r.width / 2;
        });
        if (index < 0) index = others.length;
        const ids = others.map((el) => Number(el.dataset.handTile));
        ids.splice(index, 0, src.tileId);
        setManual({ key: roundKey, ids });
      }
    } else if (src.kind === 'wallFront' && drop.zone === 'hand' && a?.draw) {
      command({ type: 'draw' });
    } else if (src.kind === 'wallBack' && drop.zone === 'hand' && a?.drawReplacement) {
      command({ type: 'drawReplacement' });
    } else if (src.kind === 'offered' && drop.zone === 'hand') {
      onTapOffered();
    } else if (src.kind === 'dice' && (drop.zone === 'discard' || drop.zone === 'centre')) {
      command({ type: 'rollDice' });
    }
  };
  /** Tapping the Draw / Replacement tile draws it too (dragging also works). */
  const onTap = (src: DragSource): void => {
    if ((src.kind === 'wallFront' && a?.draw) || (src.kind === 'wallBack' && a?.drawReplacement)) {
      // Remember where the tile starts, so it can glide into your hand.
      const r = document.querySelector('.draw-pile')?.getBoundingClientRect();
      if (r) drawFlyFrom.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, at: Date.now() };
    }
    if (src.kind === 'wallFront' && a?.draw) command({ type: 'draw' });
    else if (src.kind === 'wallBack' && a?.drawReplacement) command({ type: 'drawReplacement' });
    else if (src.kind === 'offered') onTapOffered();
  };
  const { drag, start } = useDrag(onDrop, onTap);

  // ---------- rearranging your hand: tiles slide apart to show where it will land ----------
  // Natural positions (offsetLeft) are not affected by the sliding, so they stay steady.
  const handGap: HandGap | null = (() => {
    if (!drag?.moved || drag.src.kind !== 'hand' || mySeat === null) return null;
    const box = handRef.current;
    if (!box) return null;
    const els = [...box.querySelectorAll<HTMLElement>('[data-hand-tile]')].filter((el) => el.dataset.drawn !== 'true');
    if (els.length === 0) return null;
    const ids = els.map((el) => Number(el.dataset.handTile));
    const draggedId = drag.src.tileId;
    const from = ids.indexOf(draggedId); // -1 = the drawn tile, from outside the row
    const otherIds = ids.filter((id) => id !== draggedId);
    const first = els[0]!;
    const w = first.offsetWidth;
    const h = first.offsetHeight;
    const slot = els.length > 1 ? els[1]!.offsetLeft - first.offsetLeft : w + 2;
    const r = box.getBoundingClientRect();
    const over = drag.y > r.top - h * 0.9 && drag.y < r.bottom + h * 0.6 && drag.x > r.left - w * 1.5 && drag.x < r.right + w * 1.5;
    const rel = drag.x - (r.left + first.offsetLeft);
    // The gap opens at the place nearest the finger (the tile's middle follows the finger).
    const target = Math.max(0, Math.min(otherIds.length, Math.round((rel - w / 2) / slot)));
    return { over, from, target, slot, otherIds };
  })();
  reorderRef.current = handGap;
  /** How far a hand tile slides sideways to open the gap (0 = stays put). */
  const slideOf = (tileId: number, index: number): number => {
    if (!handGap?.over || tileId === (drag?.src.kind === 'hand' ? drag.src.tileId : -1)) return 0;
    const o = handGap.from >= 0 && index > handGap.from ? index - 1 : index; // its place without the dragged tile
    const wanted = o < handGap.target ? o : o + 1;
    return (wanted - index) * handGap.slot;
  };

  // A tapped draw glides from the middle into its place on the right of your hand.
  const drawFlyFrom = useRef<{ x: number; y: number; at: number } | null>(null);
  const drawnRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const from = drawFlyFrom.current;
    const el = drawnRef.current;
    if (!from || !el || Date.now() - from.at > 3000) return;
    drawFlyFrom.current = null;
    const r = el.getBoundingClientRect();
    glide(el, from.x - (r.left + r.width / 2), from.y - (r.top + r.height / 2));
  }, [drawnId]);

  // When other players draw, a tile glides from the middle to them.
  const prevCounts = useRef<{ key: string; counts: number[] }>({ key: '', counts: [] });

  // Swap answers: tell the player who asked.
  const [swapToast, setSwapToast] = useState<string | null>(null);
  useEffect(() => {
    const r = view.swapResult;
    if (!r || Date.now() - r.at > 15000) return;
    setSwapToast(r.accepted ? tr('swapAccepted', { name: r.toName }) : tr('swapDeclined', { name: r.toName }));
    const timer = setTimeout(() => setSwapToast(null), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.swapResult?.at]);

  // The host stopped the hand: tell everyone for a few seconds.
  const [stopToast, setStopToast] = useState(false);
  useEffect(() => {
    const at = view.roundStoppedAt;
    if (!at || Date.now() - at > 15000) return;
    setStopToast(true);
    const timer = setTimeout(() => setStopToast(false), 6000);
    return () => clearTimeout(timer);
  }, [view.roundStoppedAt]);

  // ---------- win celebration ----------
  // When a win summary appears (not a draw), throw confetti in this player's
  // chosen style and play the fanfare. Only when it happens live: reopening the
  // page while a summary is already showing doesn't replay it.
  const winNow = !!round && round.phase === 'ended' && round.result?.type === 'win';
  const celebrated = useRef<{ key: string; win: boolean }>({ key: roundKey, win: winNow });
  useEffect(() => {
    const before = celebrated.current;
    celebrated.current = { key: roundKey, win: winNow };
    if (winNow && before.key === roundKey && !before.win && round?.result?.type === 'win') {
      celebrate(prefs.celebration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winNow, roundKey]);

  // ---------- action buttons ----------
  const onWin = (): void => (a?.selfDrawWin ? command({ type: 'selfDrawWin' }) : doClaim({ kind: 'win' }));
  const onPong = (): void => doClaim({ kind: 'pong' });
  const onGong = (): void => {
    if (a?.gong) return doClaim({ kind: 'gong' });
    if (!a) return;
    if (ownGongs === 1) {
      const t = a.concealedGongs[0] ?? a.addedGongs[0]!;
      command(a.concealedGongs.length ? { type: 'concealedGong', tileType: t } : { type: 'addedGong', tileType: t });
    } else setChooser({ kind: 'ownGong', concealed: a.concealedGongs, added: a.addedGongs });
  };
  const onChow = (): void => {
    if (!a) return;
    if (a.chow.length === 1) doClaim({ kind: 'chow', tileIds: a.chow[0]! });
    else setChooser({ kind: 'chow', options: a.chow });
  };
  /** Tapping the offered discard claims it (or shows the choices). */
  const onTapOffered = (): void => {
    if (!a || !claimOptions) return;
    const opts: string[] = [];
    if (a.win) opts.push('win');
    if (a.gong) opts.push('gong');
    if (a.pong) opts.push('pong');
    if (a.chow.length) opts.push('chow');
    if (opts.length === 1) {
      ({ win: onWin, gong: onGong, pong: onPong, chow: onChow } as Record<string, () => void>)[opts[0]!]!();
    } else setChooser({ kind: 'claimTile', options: opts });
  };

  // ---------- hints ----------
  const turnName = round ? personName(view.seats[round.turn]?.name, lang) : '';
  const waitingOnEmptySeat = !!round && round.phase !== 'ended' && !turnName;
  let hint = '';
  if (view.phase === 'playing' && round && round.phase !== 'ended') {
    if (a?.draw) hint = tr('hintDraw');
    else if (a?.drawReplacement) hint = tr('hintReplace');
    else if (a?.discard) hint = tr('hintDiscard');
    else if (claimable) hint = tr('hintClaim');
    else if (waitingOnEmptySeat) hint = tr('hintWaitingSeat');
    else if (mySeat === null) hint = tr('hintWatching', { name: turnName });
    else hint = tr('hintTurn', { name: turnName });
  }

  // ---------- pieces ----------
  const renderMelds = (melds: Meld[], flowers: Tile[], size: string, sideways?: 'left' | 'right'): ReactElement => (
    <div className={`melds${sideways ? ' melds-sideways' : ''}`}>
      {melds.map((m, i) => (
        <span className="meld" key={i}>
          {m.tiles.map((t, j) => (
            <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width={size} sideways={sideways} className={newFlowerIds.has(t.id) ? 'flower-new' : undefined} />
          ))}
        </span>
      ))}
      {flowers.length > 0 && (
        <span className="meld flowers">
          {flowers.map((t) => (
            <TileView key={t.id} type={t.type} width={size} sideways={sideways} className={newFlowerIds.has(t.id) ? 'flower-new' : undefined} />
          ))}
        </span>
      )}
    </div>
  );

  // Discards slide in from the player who threw them (only tiles that are new on this screen).
  const seenDiscards = useRef<{ key: string; ids: Set<number> }>({ key: '', ids: new Set() });
  useEffect(() => {
    const ids = new Set((round?.discards ?? []).map((d) => d.tile.id));
    if (seenDiscards.current.key !== roundKey) seenDiscards.current = { key: roundKey, ids };
    else ids.forEach((id) => seenDiscards.current.ids.add(id));
  });

  // Discard size: as big as possible while every player's discards still fit in their area.
  const pondRef = useRef<HTMLDivElement | null>(null);
  const [zones, setZones] = useState<Record<Side, { w: number; h: number }> | null>(null);
  useEffect(() => {
    const pond = pondRef.current;
    if (!pond) return;
    const measure = (): void => {
      const out = {} as Record<Side, { w: number; h: number }>;
      for (const side of SIDES) {
        const el = pond.querySelector<HTMLElement>(`.discards-${side}`);
        out[side] = { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
      }
      setZones(out);
    };
    measure();
    // Re-measure whenever the middle area or any player's discard area changes size.
    const ro = new ResizeObserver(measure);
    ro.observe(pond);
    pond.querySelectorAll('.discards').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [!!round]);
  const discardCount = (side: Side): number => round?.discards.filter((d) => d.by === seatAt(side)).length ?? 0;
  const discardW = useMemo(() => {
    const maxW = Math.min(screen.w * 0.028, screen.h * 0.055);
    if (!zones) return maxW;
    const fits = (n: number, w: number, h: number, d: number, sideways = false): boolean => {
      if (n === 0) return true;
      if (sideways) {
        // Tiles lie on their side and fill columns from top to bottom.
        const perCol = Math.max(1, Math.floor((h + 1) / (d + 2)));
        return Math.ceil(n / perCol) * (d * (4 / 3) + 2) <= w;
      }
      const perRow = Math.max(1, Math.floor((w + 1) / (d + 1)));
      // +2 px per row leaves room for rounding and the 1 px gaps.
      return Math.ceil(n / perRow) * (d * (4 / 3) + 2) <= h;
    };
    let d = Math.floor(maxW);
    while (d > 8 && !SIDES.every((side) => fits(discardCount(side), zones[side].w - 1, zones[side].h - 1, d, side === 'left' || side === 'right'))) d -= 0.5;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, round?.discards.length, screen.w, screen.h, bottomSeat]);

  const renderDiscards = (side: Side): ReactElement => {
    const seat = seatAt(side);
    const tiles = round?.discards.filter((d) => d.by === seat) ?? [];
    const isNew = (id: number): boolean => seenDiscards.current.key === roundKey && !seenDiscards.current.ids.has(id);
    return (
      <div className={`discards discards-${side}`}>
        {tiles.map((d) => {
          const offered = round?.offered?.tile.id === d.tile.id;
          return (
            <span
              key={d.tile.id}
              onClick={offered ? onTapOffered : undefined}
              className={`${offered && claimable ? 'claimable' : ''}${isNew(d.tile.id) ? ` slide-in slide-from-${side}` : ''}`}
            >
              <TileView
                type={d.tile.type}
                width="var(--discard-w)"
                highlight={offered}
                sideways={side === 'left' ? 'left' : side === 'right' ? 'right' : undefined}
              />
            </span>
          );
        })}
      </div>
    );
  };

  const nameTag = (sv: SeatView, hideChips = false): ReactElement => (
    <div className={`nametag${round && round.turn === sv.seat && round.phase !== 'ended' ? ' nametag-turn' : ''}`}>
      <span className="wind-badge">{WIND_SHORT[lang][sv.wind]}</span>
      <span className="nametag-name">{sv.name ? personName(sv.name, lang) : tr('empty')}</span>
      {sv.cpu && !sv.name?.startsWith('CPU') && <span className="cpu-badge">{tr('cpu')}</span>}
      {sv.name && !sv.connected && !sv.cpu && <span className="offline">{tr('offline')}</span>}
      {sv.balance !== null && !hideChips && <span className="chips">{sv.balance}</span>}
      {round && sv.isDealer && (
        <span className="dice dice-small" title="dice">
          {round.dice.map((d, i) => <span key={i} className="die">{d}</span>)}
        </span>
      )}
      {mySeat === null && !sv.name && round && (
        <button className="btn sit-here" onClick={(e) => { e.stopPropagation(); command({ type: 'takeSeat', seat: sv.seat }); }}>
          {tr('sitHere')}
        </button>
      )}
      {mySeat === null && sv.name && (
        <button
          className={`btn show-hide${sv.watched ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); command({ type: 'setWatchedSeat', seat: sv.seat, visible: !sv.watched }); }}
        >
          {sv.watched ? tr('hide') : tr('show')}
        </button>
      )}
    </div>
  );

  const renderOpponent = (side: Side): ReactElement => {
    const sv = view.seats[seatAt(side)]!;
    const sideways = side === 'left' ? 'left' : side === 'right' ? 'right' : undefined;
    return (
      <section className={`opp opp-${side}`} onClick={mySeat === null ? () => setSpectatorSeat(sv.seat) : undefined}>
        {nameTag(sv)}
        {/* Public tiles (shown sets and flowers); hidden tiles only when a spectator chose "Show". */}
        <div className="opp-tiles">
          {renderMelds(sv.melds, sv.flowers, 'var(--public-w)', sideways)}
          {sv.hand && (
            <div className={`opp-hand${sideways ? ' melds-sideways' : ''}`}>
              {sortHand(sv.hand).map((t) => <TileView key={t.id} type={t.type} width="var(--opp-w)" sideways={sideways} />)}
            </div>
          )}
        </div>
      </section>
    );
  };

  // ---------- deal animation (about 5 seconds at the start of each hand) ----------
  const perWall = view.settings.flowersOn ? 18 : 17;
  const dealAnim = useDealAnimation(round, roundKey, perWall, sideOf);

  // ---------- the last discard, shown big in the middle ----------
  // Set when a tile is discarded; cleared when it is claimed (it leaves the
  // discards). Undoing a claim puts it back, so it shows again.
  const [lastDiscard, setLastDiscard] = useState<{ id: number; type: TileType; by: number } | null>(null);
  const discardsSeen = useRef<{ key: string; count: number }>({ key: '', count: 0 });
  const discardList = round?.discards ?? [];
  useEffect(() => {
    const before = discardsSeen.current;
    const last = discardList[discardList.length - 1];
    discardsSeen.current = { key: roundKey, count: discardList.length };
    const latest = last ? { id: last.tile.id, type: last.tile.type, by: last.by } : null;
    if (before.key !== roundKey || discardList.length > before.count) setLastDiscard(latest);
    else if (discardList.length < before.count) setLastDiscard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, discardList.length]);
  const showLastDiscard =
    !!round && round.phase !== 'ended' && !!lastDiscard && !(claimable && round.offered?.tile.id === lastDiscard.id);
  const lastDiscardTile = showLastDiscard ? (
    <span className="last-discard" title={tr('lastDiscard')}>
      <TileView type={lastDiscard!.type} width="var(--draw-w)" />
      <span className="last-discard-label">
        {lastDiscard!.by === mySeat ? tr('you') : `${WIND_SHORT[lang][view.seats[lastDiscard!.by]!.wind]} ${personName(view.seats[lastDiscard!.by]?.name, lang)}`}
      </span>
    </span>
  ) : null;

  // ---------- side players: shrink their tiles if they don't all fit ----------
  // On small screens (iPhone) the side columns are narrow; when a player's
  // tiles would need more columns than fit, make them smaller instead of
  // cutting them off.
  const sideTilesSig = (['left', 'right'] as const)
    .map((side) => {
      const sv = view.seats[seatAt(side)]!;
      return `${sv.melds.reduce((n, m) => n + m.tiles.length, 0)}/${sv.flowers.length}/${sv.hand?.length ?? 0}`;
    })
    .join('|');
  useLayoutEffect(() => {
    for (const side of ['left', 'right'] as const) {
      const section = document.querySelector<HTMLElement>(`.opp-${side}`);
      const box = section?.querySelector<HTMLElement>('.opp-tiles');
      if (!section || !box) continue;
      let fit = 1;
      section.style.setProperty('--fit', '1');
      for (let i = 0; i < 12 && box.scrollWidth > box.clientWidth + 1 && fit > 0.35; i++) {
        fit = Math.max(0.35, fit * Math.max(0.6, Math.min(0.95, box.clientWidth / box.scrollWidth)));
        section.style.setProperty('--fit', fit.toFixed(3));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTilesSig, screen.w, screen.h, roundKey]);

  // ---------- flowers: make a newly drawn flower obvious to everyone ----------
  // A pop-up in the middle ("Kyle drew a flower") and a gold glow where it lands.
  // Flowers handed out during the deal don't pop up.
  // The same pop-up is used for claims (Soeng / Pung / Gong) and wins (Wu): see below.
  const [flowerPops, setFlowerPops] = useState<Pop[]>([]);
  /** Show pop-ups for a few seconds (each one always finishes, even if more arrive). */
  const showPops = (pops: Pop[], ids: number[]): void => {
    if (pops.length === 0) return;
    setFlowerPops((list) => [...list, ...pops].slice(-3));
    if (ids.length) setNewFlowerIds((old) => new Set([...old, ...ids]));
    setTimeout(() => setFlowerPops((list) => list.filter((x) => !pops.some((n) => n.key === x.key))), POP_MS);
    if (ids.length) setTimeout(() => setNewFlowerIds((old) => new Set([...old].filter((id) => !ids.includes(id)))), POP_MS + 1500);
  };
  const [newFlowerIds, setNewFlowerIds] = useState<Set<number>>(() => new Set());
  const seenFlowers = useRef<{ key: string; ids: Set<number> }>({ key: '', ids: new Set() });
  const flowerSig = view.seats.map((sv) => sv.flowers.map((f) => f.id).join(',')).join('|');
  useEffect(() => {
    const seen = seenFlowers.current;
    const all = view.seats.flatMap((sv) => sv.flowers.map((f) => f.id));
    const sameRound = seen.key === roundKey;
    seenFlowers.current = { key: roundKey, ids: new Set(all) };
    if (!sameRound || dealAnim || !round || round.phase === 'ended') return;
    const pops = view.seats
      .map((sv) => ({ seat: sv.seat, tiles: sv.flowers.filter((f) => !seen.ids.has(f.id)) }))
      .filter((x) => x.tiles.length > 0)
      .map((x): Pop => ({ key: `${roundKey}-f-${x.tiles.map((t) => t.id).join('-')}`, kind: 'flower', seat: x.seat, types: x.tiles.map((t) => t.type) }));
    const ids = pops.length ? view.seats.flatMap((sv) => sv.flowers.filter((f) => !seen.ids.has(f.id)).map((f) => f.id)) : [];
    showPops(pops, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowerSig, roundKey, !!dealAnim]);

  // ---------- claims: Soeng / Pung / Gong are just as obvious ----------
  // When a new set appears in front of a player (claimed from a discard, or a
  // gong from their own tiles), show it big in the middle and make it glow.
  const seenMelds = useRef<{ key: string; sigs: string[][]; counts: number[] }>({ key: '', sigs: [], counts: [] });
  const meldSigs = view.seats.map((sv) => sv.melds.map((m) => `${m.kind}:${m.tiles.map((t) => t.id).join('.')}`));
  useEffect(() => {
    const before = seenMelds.current;
    seenMelds.current = { key: roundKey, sigs: meldSigs, counts: view.seats.map((sv) => sv.melds.length) };
    if (before.key !== roundKey || !round || round.phase === 'ended') return;
    const pops: Pop[] = [];
    const ids: number[] = [];
    view.seats.forEach((sv) => {
      sv.melds.forEach((m, i) => {
        const sig = meldSigs[sv.seat]![i]!;
        if (before.sigs[sv.seat]?.includes(sig)) return;
        // A brand-new set, or a pong that became a gong (robbing a gong turns
        // a gong back into a pong: that is not a claim, so it is skipped).
        if (sv.melds.length <= (before.counts[sv.seat] ?? 0) && m.kind !== 'gong') return;
        pops.push({ key: `${roundKey}-m-${sig}`, kind: m.kind, seat: sv.seat, types: m.tiles.map((t) => t.type), concealed: m.concealed });
        ids.push(...m.tiles.map((t) => t.id));
      });
    });
    showPops(pops, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meldSigs), roundKey]);

  useEffect(() => {
    const counts = view.seats.map((sv) => sv.handCount);
    const prev = prevCounts.current;
    prevCounts.current = { key: roundKey, counts };
    if (prev.key !== roundKey || dealAnim || !round || round.phase === 'ended') return;
    const hub = document.querySelector('.hub')?.getBoundingClientRect();
    if (!hub) return;
    const from = { x: hub.left + hub.width / 2, y: hub.top + hub.height / 2 };
    for (const sv of view.seats) {
      if (sv.seat === mySeat || counts[sv.seat]! !== (prev.counts[sv.seat] ?? 0) + 1) continue;
      const side = sideOf(sv.seat);
      const target = side === 'bottom' ? document.querySelector('.me-row') : document.querySelector(`.opp-${side} .nametag`);
      const t = target?.getBoundingClientRect();
      if (t) flyBacks(from, { x: t.left + t.width / 2, y: t.top + t.height / 2 }, 1, 750);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(view.seats.map((sv) => sv.handCount)), roundKey]);

  const bottom = view.seats[bottomSeat]!;
  const winLabel = labels.win;

  // Size your row so public tiles + hand always fit on one line.
  const publicCount = bottom.melds.reduce((n, m) => n + m.tiles.length, 0) + bottom.flowers.length;
  const groups = bottom.melds.length + (bottom.flowers.length ? 1 : 0);
  const handCount = serverHand ? serverHand.length : bottom.handCount;
  const rowW = screen.w * 0.76 - 16;
  const maxHand = Math.min(screen.w * 0.059, screen.h * 0.11);
  const PUBLIC_RATIO = 0.72;
  const handW = Math.max(14, Math.min(maxHand, rowW / (handCount + publicCount * PUBLIC_RATIO + groups * 0.3 + 0.6)));
  const rowSizes = { '--hand-w': `${handW.toFixed(1)}px`, '--mine-w': `${(handW * PUBLIC_RATIO).toFixed(1)}px` } as CSSProperties;
  const showButtons = !!a && round?.phase !== 'ended';
  const dealerSeat = round ? view.seats.findIndex((s) => s.isDealer) : view.match.dealer;
  const iAmDealer = mySeat !== null && mySeat === view.match.dealer;
  const lastWin = round?.result?.type === 'win' && round.result.isChicken;
  const canUndo = !!a?.undo || (!!lastWin && mySeat !== null);

  return (
    <div className={`table-screen felt-${view.tableColour}`}>
      <header className="topbar">
        <div className="topbar-left">
          {me && nameTag(me, true)}
          {mySeat === null && <span className="nametag"><span className="nametag-name">{view.you.name}</span></span>}
          {mySeat !== null ? (
            <button className="btn undo" disabled={!canUndo} onClick={() => command({ type: 'undo' })}>
              ↶ {tr('undo')}{lastWin && view.seats.some((s) => s.votedUndoWin) ? ` ${tr('undoAgreed', { n: view.seats.filter((s) => s.votedUndoWin).length })}` : ''}
            </button>
          ) : (
            <>
              <span className="spectating-tag">{tr('spectating')}</span>
              {round && (
                <button className="btn" onClick={() => command({ type: 'setWatchAll', visible: true })}>{tr('allHands')}</button>
              )}
              {view.phase === 'betweenRounds' && justWatching && (
                <button className="btn" onClick={() => setJustWatching(false)}>{tr('takeSeat')}</button>
              )}
            </>
          )}
        </div>
        <div className="topbar-centre">
          <span className="round-label">{view.label[lang]}</span>
          <span className="min-fan" title={tr('minFanTitle')}>{tr('minFanShort', { n: view.settings.minFan })}</span>
          <span className="compass">
            {SIDES.map((side) => {
              const sv = view.seats[seatAt(side)]!;
              return (
                <span key={side} className={`compass-${side}${sv.seat === dealerSeat ? ' compass-dealer' : ''}`} title={sv.name ?? ''}>
                  {WIND_SHORT[lang][sv.wind]}
                </span>
              );
            })}
          </span>
        </div>
        <div className="topbar-right">
          {me && (
            <span className="chip-total"><ChipIcon size="1.05em" />{me.balance}</span>
          )}
          <button className="btn icon" title={tr('help')} onClick={() => setPanel('help')}>?</button>
          <button className="btn icon" title={tr('settings')} onClick={() => setPanel('settings')}>⚙</button>
        </div>
      </header>

      <main className="board">
        {flowerPops.length > 0 && (
          <div className="flower-pops" aria-live="polite">
            {flowerPops.map((fp) => (
              <div key={fp.key} className={`flower-pop pop-${fp.kind}`}>
                <div className="flower-pop-tiles">
                  {fp.kind !== 'flower' && <span className={`act pop-badge act-${fp.kind}`}>{labels[fp.kind]}</span>}
                  {fp.types.map((type, i) => (
                    <TileView key={i} type={type} back={!!fp.concealed && (i === 0 || i === 3)} width="clamp(40px, 6vw, 72px)" />
                  ))}
                </div>
                <div className="flower-pop-text">
                  {fp.seat !== mySeat && <span className="flower-pop-wind">{WIND_SHORT[lang][view.seats[fp.seat]!.wind]}</span>}
                  {fp.kind === 'flower'
                    ? fp.seat === mySeat
                      ? tr('youDrewFlower')
                      : tr('drewFlower', { name: personName(view.seats[fp.seat]?.name, lang) })
                    : fp.seat === mySeat
                      ? tr('youClaimed', { action: labels[fp.kind] })
                      : tr('playerClaimed', { name: personName(view.seats[fp.seat]?.name, lang), action: labels[fp.kind] })}
                </div>
              </div>
            ))}
          </div>
        )}
        {renderOpponent('top')}
        {renderOpponent('left')}
        <section className="centre" data-drop="centre">
          <div className="pond" data-drop="discard" ref={pondRef} style={{ '--discard-w': `${discardW}px` } as CSSProperties}>
            {renderDiscards('top')}
            {renderDiscards('left')}
            <div className="hub">
              {round && claimable && round.offered && (
                // The tile you can claim: tap it, or drag it into your hand.
                <span className="claim-pile" onPointerDown={start({ kind: 'offered' })}>
                  <TileView type={round.offered.tile.type} width="var(--draw-w)" />
                  <span className="draw-label">{tr('take')}</span>
                </span>
              )}
              {round ? (
                a?.draw || a?.drawReplacement ? (
                  // Big glowing tile to tap or drag into your hand, next to the wall picture.
                  <span className="hub-row">
                  {lastDiscardTile}
                  <WallBox round={round} sideOf={sideOf} perWall={view.settings.flowersOn ? 18 : 17} label={tr('tilesLeft')} />
                  <span
                    className="draw-pile"
                    onPointerDown={start(a.draw ? { kind: 'wallFront' } : { kind: 'wallBack' })}
                  >
                    <TileView back width="var(--draw-w)" />
                    <span className="draw-label">{a.draw ? tr('drawHere') : tr('replacementHere')}</span>
                  </span>
                  </span>
                ) : (
                  <span className="hub-row">
                    {!dealAnim && lastDiscardTile}
                    <WallBox round={round} sideOf={sideOf} perWall={perWall} label={tr('tilesLeft')} override={dealAnim?.wall} />
                  </span>
                )
              ) : view.phase === 'rolling' ? (
                iAmDealer ? <div className="hub-sub">{tr('swipeDiceHere')}</div> : <div className="hub-sub">{tr('waitingRoll', { name: personName(view.seats[view.match.dealer]?.name, lang) })}</div>
              ) : null}
            </div>
            {renderDiscards('right')}
            {renderDiscards('bottom')}
          </div>
        </section>
        {renderOpponent('right')}
      </main>

      {dealAnim?.rolling && round && (
        <DiceRoll key={roundKey} values={round.dice as [number, number, number]} from={sideOf(view.match.dealer)} />
      )}
      <footer className={`me${dealAnim ? ' dealing' : ''}`} style={rowSizes}>
        <div className="me-row">
          {/* Your public tiles (shown sets and flowers) sit to the left of your hand. */}
          {renderMelds(bottom.melds, bottom.flowers, 'var(--mine-w)')}
          <div className={`hand${handGap?.over ? ' reordering' : ''}`} data-drop="hand" ref={handRef}>
          {serverHand
            ? hand.map((t, i) => (
                <span
                  key={t.id}
                  data-hand-tile={t.id}
                  className={`hand-tile${drag?.moved && drag.src.kind === 'hand' && drag.src.tileId === t.id ? (handGap?.over ? ' dragging gap' : ' dragging') : ''}`}
                  style={slideOf(t.id, i) ? { transform: `translateX(${slideOf(t.id, i)}px)` } : undefined}
                  onPointerDown={mySeat !== null ? start({ kind: 'hand', tileId: t.id, type: t.type }) : undefined}
                >
                  <TileView type={t.type} width="var(--hand-w)" />
                </span>
              ))
            : Array.from({ length: bottom.handCount }, (_, i) => <TileView key={i} back width="var(--hand-w)" />)}
          {drawnTile && (
            // The tile you just drew, a little apart on the far right.
            <span
              key={drawnTile.id}
              ref={drawnRef}
              data-hand-tile={drawnTile.id}
              data-drawn="true"
              className={`hand-tile drawn-tile${drag?.moved && drag.src.kind === 'hand' && drag.src.tileId === drawnTile.id ? ' dragging' : ''}`}
              onPointerDown={start({ kind: 'hand', tileId: drawnTile.id, type: drawnTile.type })}
            >
              <TileView type={drawnTile.type} width="var(--hand-w)" />
            </span>
          )}
          </div>
        </div>
        <div className={`actions${claimable ? ' actions-claim' : ''}`}>
          {showButtons && claimable && a.chow.length > 0 && <button className="act act-chow" onClick={onChow}>{labels.chow}</button>}
          {showButtons && claimable && a.pong && <button className="act act-pong" onClick={onPong}>{labels.pong}</button>}
          {showButtons && ((claimable && a.gong) || ownGongs > 0) && <button className="act act-gong" onClick={onGong}>{labels.gong}</button>}
          {a && (a.selfDrawWin || (a.win && (claimable || round?.phase === 'ended'))) && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
        </div>
        <div className="me-bottom">
          {mySeat === null && nameTag(bottom)}
          <span className="hint">{hint}</span>
        </div>
      </footer>

      {view.phase === 'rolling' && iAmDealer && (
        <div className="dice-tray" onPointerDown={start({ kind: 'dice' })}>
          <span className="die">⚀</span>
          <span className="die">⚂</span>
          <span className="die">⚄</span>
          <div className="dice-hint">{tr('swipeDice')}</div>
        </div>
      )}

      {view.phase === 'betweenRounds' && !(mySeat === null && justWatching) && (
        <SeatPicker
          view={view}
          tr={tr}
          lang={lang}
          command={command}
          onSpectate={() => {
            if (mySeat !== null) command({ type: 'leaveSeat' });
            setJustWatching(true);
          }}
        />
      )}
      {view.you.watchAll && mySeat === null && round && (
        <AllHands view={view} tr={tr} newFlowerIds={newFlowerIds} onClose={() => command({ type: 'setWatchAll', visible: false })} />
      )}
      {(round?.phase === 'ended' || view.phase === 'finished') && (
        showReady === roundKey && mySeat !== null && view.phase !== 'finished' ? (
          <ReadyPanel view={view} tr={tr} lang={lang} command={command} onBack={() => setShowReady(null)} />
        ) : (
          <ResultPanel
            view={view}
            lang={lang}
            command={command}
            canClaimWin={!!a?.win}
            onWin={onWin}
            winLabel={winLabel}
            onContinue={() => setShowReady(roundKey)}
          />
        )
      )}

      {chooser && (
        <div className="overlay" onClick={() => setChooser(null)}>
          <div className="panel chooser" onClick={(e) => e.stopPropagation()}>
            <h3>{tr('choose')}</h3>
            {chooser.kind === 'chow' &&
              chooser.options.map((ids) => {
                const tiles = ids.map((id) => serverHand?.find((t) => t.id === id)).filter((t): t is Tile => !!t);
                return (
                  <button key={ids.join()} className="choice" onClick={() => { doClaim({ kind: 'chow', tileIds: ids }); setChooser(null); }}>
                    {round?.offered && <TileView type={round.offered.tile.type} width="2.4rem" />}
                    {tiles.map((t) => <TileView key={t.id} type={t.type} width="2.4rem" />)}
                  </button>
                );
              })}
            {chooser.kind === 'ownGong' &&
              [...chooser.concealed.map((t) => ({ t, concealed: true })), ...chooser.added.map((t) => ({ t, concealed: false }))].map(({ t, concealed }) => (
                <button key={t} className="choice" onClick={() => { command(concealed ? { type: 'concealedGong', tileType: t } : { type: 'addedGong', tileType: t }); setChooser(null); }}>
                  <TileView type={t} width="2.4rem" /> {labels.gong}
                </button>
              ))}
            {chooser.kind === 'claimTile' &&
              chooser.options.map((o) => (
                <button key={o} className={`act act-${o}`} onClick={() => { setChooser(null); ({ win: onWin, gong: onGong, pong: onPong, chow: onChow } as Record<string, () => void>)[o]!(); }}>
                  {labels[o as keyof typeof labels]}
                </button>
              ))}
          </div>
        </div>
      )}

      {view.pendingSwap && view.pendingSwap.fromName === view.you.name && (
        // You asked a spectator to take your seat: waiting for their answer.
        <div className="swap-banner">
          {tr('swapWaiting', { name: view.pendingSwap.toName })}
          <button className="btn" onClick={() => command({ type: 'cancelSwap' })}>{tr('cancel')}</button>
        </div>
      )}
      {swapToast && <div className="toast">{swapToast}</div>}
      {stopToast && !swapToast && <div className="toast">{tr('handStopped')}</div>}
      {view.pendingSwap && view.pendingSwap.toName === view.you.name && (
        <div className="overlay">
          <div className="panel">
            <h3>{tr('swapInTitle')}</h3>
            <p>{tr('swapInText', { name: view.pendingSwap.fromName })}</p>
            <div className="row">
              <button className="btn primary" onClick={() => command({ type: 'answerSwap', accept: true })}>{tr('swapIn')}</button>
              <button className="btn" onClick={() => command({ type: 'answerSwap', accept: false })}>{tr('noThanks')}</button>
            </div>
          </div>
        </div>
      )}

      {panel === 'help' && <HelpPanel lang={lang} onClose={() => setPanel(null)} />}
      {panel === 'settings' && (
        <SettingsPanel
          view={view}
          tr={tr}
          prefs={prefs}
          setPrefs={setPrefs}
          command={command}
          onLeave={onLeave}
          onClose={() => setPanel(null)}
        />
      )}

      {drag?.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.src.kind === 'hand' ? (
            <TileView type={drag.src.type} width="var(--hand-w)" />
          ) : drag.src.kind === 'dice' ? (
            <span className="die">⚃</span>
          ) : (
            <TileView back width="var(--hand-w)" />
          )}
        </div>
      )}
      <div className="rotate-hint">{tr('rotate')}</div>
    </div>
  );
}

/** Spectators: every player's hand, flowers and shown sets, and nothing else. */
function AllHands({ view, tr, newFlowerIds, onClose }: { view: RoomView; tr: Tr; newFlowerIds: Set<number>; onClose: () => void }): ReactElement {
  const lang = useLang();
  return (
    <div className="overlay all-hands-overlay">
      <div className="panel all-hands">
        <h3>{tr('allHands')}</h3>
        {view.seats.map((s) => (
          <div key={s.seat} className={`all-hands-row${view.round?.turn === s.seat ? ' all-hands-turn' : ''}`}>
            <span className="all-hands-name">
              <span className="wind-badge">{WIND_CHARS[s.wind]}</span> {s.name ? personName(s.name, lang) : tr('empty')}
            </span>
            <span className="all-hands-tiles">
              {sortHand(s.hand ?? []).map((t) => <TileView key={t.id} type={t.type} width="var(--allhands-w)" />)}
              {s.melds.map((m, i) => (
                <span key={i} className="meld">
                  {m.tiles.map((t, j) => <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width="var(--allhands-w)" />)}
                </span>
              ))}
              {s.flowers.length > 0 && (
                <span className="meld flowers">
                  {s.flowers.map((t) => <TileView key={t.id} type={t.type} width="var(--allhands-w)" className={newFlowerIds.has(t.id) ? 'flower-new' : undefined} />)}
                </span>
              )}
            </span>
          </div>
        ))}
        <button className="btn" onClick={onClose}>{tr('backToTable')}</button>
      </div>
    </div>
  );
}

/** Between rounds: choose a seat and press Start, or tap Spectate in the middle to just watch. */
function SeatPicker({
  view,
  tr,
  lang,
  command,
  onSpectate,
}: {
  view: RoomView;
  tr: Tr;
  lang: Prefs['lang'];
  command: (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;
  onSpectate: () => void;
}): ReactElement {
  const mySeat = view.you.seat;
  const me = mySeat !== null ? view.seats[mySeat] : null;
  const filled = view.seats.filter((s) => s.name).length;
  return (
    <div className="overlay">
      <div className="panel seat-picker">
        <h3>{view.name} · {view.label[lang]}</h3>
        <div className="seat-square">
          {view.seats.map((s) => {
            const mine = s.seat === mySeat;
            const canTake = !mine && (!s.name || !!s.cpu);
            return (
              <button
                key={s.seat}
                className={`seat seat-${s.seat}${mine ? ' seat-mine' : ''}${s.name && !s.cpu ? ' seat-taken' : ''}`}
                disabled={!canTake}
                onClick={() => command({ type: 'takeSeat', seat: s.seat })}
              >
                <span className="seat-wind">{WIND_NAMES[lang][s.wind]}</span>
                <span className="seat-name">{s.name ? personName(s.name, lang) : tr('empty')}</span>
                {s.startPressed && <span className="seat-ready">{tr('ready')}</span>}
              </button>
            );
          })}
          <button className="seat seat-spectate" onClick={onSpectate}>
            <span className="seat-name">{tr('spectate')}</span>
            <span className="seat-wind">{tr('justWatch')}</span>
          </button>
        </div>
        {me ? (
          <div className="row">
            <button className="btn primary big" disabled={me.startPressed} onClick={() => command({ type: 'pressStart' })}>
              {me.startPressed ? tr('waitingOthers') : tr('start')}
            </button>
            <button className="btn" onClick={() => command({ type: 'leaveSeat' })}>{tr('leaveSeat')}</button>
          </div>
        ) : (
          <p className="muted">{tr('tapSeat')}</p>
        )}
        {filled < 4 && <p className="muted">{tr('startRule')}</p>}
      </div>
    </div>
  );
}

type Tr = (key: StringKey, vars?: Record<string, string | number>) => string;
type Cmd = (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;

/** Each player's own settings: name, language, leave seat, swap, leave game. */
function SettingsPanel({
  view,
  tr,
  prefs,
  setPrefs,
  command,
  onLeave,
  onClose,
}: {
  view: RoomView;
  tr: Tr;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  command: Cmd;
  onLeave: () => void;
  onClose: () => void;
}): ReactElement {
  const [name, setName] = useState(view.you.name);
  const mySeat = view.you.seat;
  const nameChanged = name.trim() !== '' && name.trim() !== view.you.name;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel settings" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" aria-label={tr('close')} onClick={onClose}>×</button>
        <h3>{tr('settings')}</h3>
        <p className="muted">{tr('playingIn', { name: view.name })}</p>

        <div className="settings-grid">
          <label htmlFor="name-input">{tr('yourName')}</label>
          <form
            className="name-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameChanged) command({ type: 'rename', newName: name.trim() });
            }}
          >
            <input id="name-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!nameChanged}>{tr('save')}</button>
          </form>

          <span>{tr('language')}</span>
          <div className="segmented">
            <button className={prefs.lang === 'en' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'en' })}>English</button>
            <button className={prefs.lang === 'zh' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'zh' })}>中文</button>
          </div>

          <span>{tr('celebration')}</span>
          <div className="segmented celebration-choice">
            {CELEBRATION_STYLES.map((style) => (
              <button
                key={style}
                className={prefs.celebration === style ? 'on' : ''}
                onClick={() => {
                  setPrefs({ ...prefs, celebration: style });
                  celebrate(style); // a quick preview
                }}
              >
                {tr(`celebration_${style}` as StringKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          {mySeat !== null && (
            <button className="btn" onClick={() => { command({ type: 'dropOut', replacement: { none: true } }); onClose(); }}>
              {tr('leaveMySeat')}
            </button>
          )}
          {mySeat !== null &&
            view.spectators.filter((s) => s.connected).map((s) => (
              <button key={s.name} className="btn" onClick={() => { command({ type: 'dropOut', replacement: { spectator: s.name } }); onClose(); }}>
                {tr('swapWith', { name: s.name })}
              </button>
            ))}
          <button className="btn danger" onClick={onLeave}>{tr('leaveGame')}</button>
        </div>
        <div className="settings-version">LAN Mahjong v{APP_VERSION}</div>
      </div>
    </div>
  );
}

/**
 * A small picture of the wall around the "tiles left" count: a square that is
 * solid when the wall is full. Stacks disappear in the real order: normal draws
 * from the front, replacement tiles from the back.
 */
function WallBox({
  round,
  sideOf,
  perWall,
  label,
  override,
}: {
  round: NonNullable<RoomView['round']>;
  sideOf: (seat: number) => Side;
  perWall: number;
  label: string;
  /** During the deal animation: the wall as it was part-way through dealing. */
  override?: { stacks: WallStack[]; count: number };
}): ReactElement {
  const stacks = override?.stacks ?? round.wall;
  const count = override?.count ?? round.wallCount;
  const S = 100;
  const T = 7; // thickness of the wall line
  const seg = (S - 2 * T) / perWall;
  const rects = stacks.filter((st) => st.count > 0).map((st) => {
    const side = sideOf(st.seat);
    // Position 0 is the right-hand end of that player's wall (as they see it).
    let x = 0, y = 0, w = seg, h = T;
    if (side === 'bottom') { x = T + (perWall - 1 - st.position) * seg; y = S - T; }
    else if (side === 'top') { x = T + st.position * seg; y = 0; }
    else if (side === 'right') { x = S - T; y = T + st.position * seg; w = T; h = seg; }
    else { x = 0; y = T + (perWall - 1 - st.position) * seg; w = T; h = seg; }
    return { key: `${st.seat}-${st.position}`, x, y, w, h, full: st.count === 2 };
  });
  return (
    <span className="wall-box">
      <svg viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="none" aria-hidden>
        {rects.map((r) => (
          <rect key={r.key} x={r.x} y={r.y} width={r.w + 0.4} height={r.h + 0.4} fill={r.full ? 'var(--tile-back)' : 'var(--tile-back-light)'} />
        ))}
      </svg>
      <span className="wall-box-text">
        <span className="hub-count">{count}</span>
        <span className="hub-sub">{label}</span>
      </span>
    </span>
  );
}

type WallStack = { seat: number; position: number; count: number };

interface DealAnim {
  wall: { stacks: WallStack[]; count: number };
  /** True while the dice are still rolling (the deal starts when they land). */
  rolling?: boolean;
}

/**
 * Make `n` tile backs glide from one point to another, then disappear.
 * Uses the browser's built-in animation feature (works on iPhones too).
 */
export function flyBacks(from: { x: number; y: number }, to: { x: number; y: number }, n: number, ms: number): void {
  const group = document.createElement('div');
  group.className = 'fly-group';
  group.style.left = `${from.x}px`;
  group.style.top = `${from.y}px`;
  for (let i = 0; i < n; i++) {
    const back = document.createElement('span');
    back.className = 'fly-back';
    group.appendChild(back);
  }
  document.body.appendChild(group);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const anim = group.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9)`, opacity: 0 },
    ],
    { duration: ms, easing: 'ease-in-out', fill: 'forwards' },
  );
  const done = (): void => group.remove();
  anim.onfinish = done;
  anim.oncancel = done;
  setTimeout(done, ms + 500); // safety net
}

const DEAL_MS = 5000;

/**
 * At the start of each hand, replay the deal in about 5 seconds: tiles slide from
 * the wall to each player (4 at a time, then 1 each, then the dealer's extra
 * tile, then flower replacements), and the wall picture empties in the real order.
 * Purely visual: the real tiles were dealt by the server.
 */
function useDealAnimation(
  round: RoomView['round'],
  roundKey: string,
  perWall: number,
  sideOf: (seat: number) => Side,
): DealAnim | null {
  const done = useRef<string>('');
  const [plan, setPlan] = useState<null | {
    key: string;
    start: number;
    steps: { seat: number; n: number; from: 'front' | 'back' }[];
    order: { seat: number; position: number }[];
    total: number;
    from: { x: number; y: number };
    to: Record<Side, { x: number; y: number }>;
  }>(null);
  const [, setTick] = useState(0);
  const lastFlown = useRef('');

  useEffect(() => {
    if (!round || round.discards.length > 0 || done.current === roundKey || round.wall.length === 0) return;
    done.current = roundKey;
    // Rebuild the wall's full draw order from the stacks that are left.
    const N = 4 * perWall;
    const next = (st: { seat: number; position: number }) =>
      st.position < perWall - 1 ? { seat: st.seat, position: st.position + 1 } : { seat: (st.seat + 3) % 4, position: 0 };
    const F: { seat: number; position: number }[] = [];
    let cur = { seat: round.wall[0]!.seat, position: round.wall[0]!.position };
    for (let i = 0; i < N; i++) {
      F.push(cur);
      cur = next(cur);
    }
    const frontFull = 26; // 53 tiles dealt from the front = 26 whole stacks + 1 tile
    const order = [...F.slice(N - frontFull), ...F.slice(0, N - frontFull)];
    const dealer = round.turn; // the dealer is to move at the start of a hand
    const seats = [0, 1, 2, 3].map((i) => (dealer + i) % 4);
    const steps: { seat: number; n: number; from: 'front' | 'back' }[] = [];
    for (let r = 0; r < 3; r++) for (const s of seats) steps.push({ seat: s, n: 4, from: 'front' });
    for (const s of seats) steps.push({ seat: s, n: 1, from: 'front' });
    steps.push({ seat: dealer, n: 1, from: 'front' });
    // Flower replacements came from the back of the wall.
    const total = round.wallCount + 53 + round.flowersDealt.reduce((a, b) => a + b, 0);
    for (const s of seats) for (let i = 0; i < round.flowersDealt[s]!; i++) steps.push({ seat: s, n: 1, from: 'back' });
    // Where tiles fly from (the wall picture) and to (each player).
    const centre = (el: Element | null): { x: number; y: number } => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    };
    const to = {
      bottom: centre(document.querySelector('.me-row')),
      top: centre(document.querySelector('.opp-top .nametag')),
      left: centre(document.querySelector('.opp-left .nametag')),
      right: centre(document.querySelector('.opp-right .nametag')),
    };
    // The dice roll first; the deal starts when they land.
    setPlan({ key: roundKey, start: performance.now() + DICE_MS, steps, order, total, from: centre(document.querySelector('.hub')), to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, !!round]);

  useEffect(() => {
    if (!plan) return;
    let raf = 0;
    const loop = (): void => {
      if (performance.now() - plan.start >= DEAL_MS) {
        setPlan(null);
        return;
      }
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [plan]);

  if (!plan || plan.key !== roundKey) return null;
  const elapsed = performance.now() - plan.start;
  if (elapsed < 0) {
    // Dice still rolling: the wall is still full.
    return { wall: { stacks: plan.order.map((st) => ({ ...st, count: 2 })), count: plan.total }, rolling: true };
  }
  const stepMs = DEAL_MS / plan.steps.length;
  const index = Math.min(plan.steps.length - 1, Math.floor(elapsed / stepMs));
  let f = 0;
  let b = 0;
  for (let i = 0; i <= index; i++) {
    const st = plan.steps[i]!;
    if (st.from === 'front') f += st.n;
    else b += st.n;
  }
  const N = plan.order.length;
  const clamp = (x: number): number => Math.max(0, Math.min(2, x));
  const stacks = plan.order.map((st, i) => ({ ...st, count: Math.max(0, 2 - clamp(f - 2 * i) - clamp(b - 2 * (N - 1 - i))) }));
  // Each step of the deal sends its tiles gliding to that player (once per step).
  if (lastFlown.current !== `${plan.key}-${index}`) {
    lastFlown.current = `${plan.key}-${index}`;
    const step = plan.steps[index]!;
    flyBacks(plan.from, plan.to[sideOf(step.seat)], step.n, Math.max(150, stepMs * 0.9));
  }
  return { wall: { stacks, count: plan.total - f - b } };
}

/** Make an element glide from (dx, dy) away back to where it belongs. */
function glide(el: HTMLElement, dx: number, dy: number): void {
  el.style.transition = 'none';
  el.style.transform = `translate(${dx}px, ${dy}px)`;
  void el.offsetWidth; // apply the starting position before animating
  el.style.transition = 'transform 0.35s ease-out';
  el.style.transform = '';
  setTimeout(() => {
    el.style.transition = '';
  }, 400);
}

/**
 * After the win summary: press Ready for the next round, or Leave seat to watch.
 * The same square of seats as the seat picker shows who is ready.
 */
function ReadyPanel({
  view,
  tr,
  lang,
  command,
  onBack,
}: {
  view: RoomView;
  tr: Tr;
  lang: Prefs['lang'];
  command: Cmd;
  onBack: () => void;
}): ReactElement {
  const me = view.you.seat !== null ? view.seats[view.you.seat]! : null;
  return (
    <div className="overlay">
      <div className="panel seat-picker">
        <h3>{view.name} · {view.label[lang]}</h3>
        <div className="seat-square">
          {view.seats.map((s) => (
            <div key={s.seat} className={`seat seat-${s.seat}${s.seat === view.you.seat ? ' seat-mine' : ''}`}>
              <span className="seat-wind">{WIND_NAMES[lang][s.wind]}</span>
              <span className="seat-name">{s.name ? personName(s.name, lang) : tr('empty')}</span>
              {s.cpu ? <span className="seat-ready">{tr('ready')}</span> : s.name && (s.confirmed ? <span className="seat-ready">{tr('ready')}</span> : <span className="seat-wind">…</span>)}
            </div>
          ))}
        </div>
        <div className="row">
          {me && (
            <button className="btn primary big" disabled={me.confirmed} onClick={() => command({ type: 'confirmRound' })}>
              {me.confirmed ? `${tr('ready')} ✓` : tr('ready')}
            </button>
          )}
          {me && (
            <button className="btn" onClick={() => command({ type: 'dropOut', replacement: { none: true } })}>{tr('leaveSeat')}</button>
          )}
          <button className="btn" onClick={onBack}>{tr('backToSummary')}</button>
        </div>
      </div>
    </div>
  );
}
