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
import { DEAL_ANIM_MS, sortHand } from '@lan-mahjong/shared';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView, SeatView } from '../../server/src/game/view';
import type { Claim } from '../../server/src/game/round';
import { TileView } from './TileFace';
import { ACTION_LABELS, Prefs, WIND_CHARS, WIND_NAMES, WIND_SHORT, personName, t, useLang } from './i18n';
import type { StringKey } from './i18n';
import { DragSource, Drop, useDrag } from './drag';
import { HelpPanel } from './HelpPanel';
import { ChipIcon } from './ChipIcon';
import { DICE_MS, DiceRoll, DieFace } from './DiceRoll';
import { buildFromPile, countIntro, countMs, finishIntro, hidePile, introKeyIs, introStackPoint, pileShowing, pileUnits, setIntroStacks, showPile, startIntro, stopIntro } from './TableIntro';
import { latestPile, onPile } from './pileBus';
import { TutorialGuide } from './Tutorial';
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
/** A win: the Wu bubble and the winning hand show this long before the summary (matches the CSS). */
const WIN_MOMENT_MS = 10000;
/** A tie: the red seal shows this long before the summary (matches the CSS). */
const TIE_MOMENT_MS = 5000;

/** A pop-up in the middle of the table: a flower draw or a claim (Soeng / Pung / Gong). */
interface Pop {
  key: string;
  kind: 'flower' | 'chow' | 'pong' | 'gong' | 'win';
  seat: number;
  types: TileType[];
  /** A concealed gong shows two of its tiles face down. */
  concealed?: boolean;
  /** Claims: where the bubble goes (next to the player's name tag), in screen pixels. */
  bubble?: { x: number; y: number; anchor: 'left' | 'right' };
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
  /** After the last hand: this player has left the summary and sees the final scores. */
  const [showFinal, setShowFinal] = useState<string | null>(null);
  /** Spectators can close the seat picker and just watch. */
  const [chooser, setChooser] = useState<Chooser>(null);
  /**
   * Choosing which Soeng (when there is more than one): the tiles you could use glow
   * in your hand. `first` is a tile already tapped that is in two runs: then only
   * its partner tiles stay lit until you tap one of them.
   */
  const [chowPick, setChowPick] = useState<{ offerId: number; first: TileType | null } | null>(null);
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
  /** The tutorial needs to know when you rearrange your hand (normally only this device knows). */
  const tellTutorialReordered = (ids: number[]): void => {
    if (!view.tutorial || !serverHand) return;
    const rest = serverHand.map((t) => t.id).filter((id) => !ids.includes(id));
    command({ type: 'reorderHand', tileIds: [...ids, ...rest] });
  };
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
  // After the next player draws, others can still claim for a while (10 s, set by the
  // server, or until that player discards): keep the buttons until then.
  const [claimUntil, setClaimUntil] = useState<number | null>(null);
  const [, setClaimTick] = useState(0);
  const claimMsLeft = round?.claimMsLeft ?? null;
  useEffect(() => {
    if (claimMsLeft === null) {
      setClaimUntil(null);
      return;
    }
    setClaimUntil(Date.now() + claimMsLeft);
    const timer = setTimeout(() => setClaimTick((x) => x + 1), claimMsLeft + 50);
    return () => clearTimeout(timer);
  }, [claimMsLeft, round?.offered?.tile.id]);
  const claimable = claimOptions && (!round?.offeredDrawn || (claimUntil !== null && Date.now() < claimUntil));
  const ownGongs = a ? a.concealedGongs.length + a.addedGongs.length : 0;

  /** Your hand row, and where a dragged tile would land in it (updated while dragging). */
  const handRef = useRef<HTMLDivElement>(null);
  const reorderRef = useRef<HandGap | null>(null);

  /**
   * Discarding: a hand tile pushed up until the whole (dragged) tile is out of the
   * dark hand area at the bottom. The dragged tile is drawn centred a little above
   * the finger (see .drag-ghost), so its bottom edge is about 0.45 tile-heights below it.
   */
  const discardReadyAt = (y: number): boolean => {
    if (!a?.discard) return false;
    const me = document.querySelector('.me')?.getBoundingClientRect();
    const tileH = handRef.current?.querySelector<HTMLElement>('[data-hand-tile]')?.offsetHeight ?? 0;
    return !!me && y + tileH * 0.45 < me.top;
  };

  const onDrop = (src: DragSource, drop: Drop): void => {
    if (src.kind === 'hand') {
      const gap = reorderRef.current;
      if (a?.discard && (discardReadyAt(drop.y) || drop.zone === 'discard')) {
        command({ type: 'discard', tileId: src.tileId });
      } else if (gap?.over) {
        // Reorder (on this device only): drop it into the gap the other tiles made.
        const ids = [...gap.otherIds];
        ids.splice(gap.target, 0, src.tileId);
        setManual({ key: roundKey, ids });
        tellTutorialReordered(ids);
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
        tellTutorialReordered(ids);
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
    if (src.kind === 'hand' && chowPick) return pickChowTile(src.type);
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
    // Pushed out of the hand area to discard: no gap in the hand.
    const over = !discardReadyAt(drag.y) && drag.y > r.top - h * 0.9 && drag.y < r.bottom + h * 0.6 && drag.x > r.left - w * 1.5 && drag.x < r.right + w * 1.5;
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

  // ---------- the end of a hand: Wu moment / Tie stamp, then the summary ----------
  // A win: a "Wu!" bubble by the winner's name and their hand in the middle (the
  // confetti above plays at the same moment), for 10 s. A tie (the wall ran out):
  // the red Tie / 和 seal for 5 s. Then the summary opens. Only when it happens
  // live: reopening the page while a hand is over goes straight to the summary.
  const res = round?.phase === 'ended' ? round.result : null;
  const endSig = res
    ? `${roundKey}|${res.type}|${res.type === 'win' ? `${res.winner}:${res.winningTileId ?? ''}` : round!.wallCount}`
    : null;
  const [moment, setMoment] = useState<{ sig: string; kind: 'win' | 'tie'; bubble?: Pop['bubble'] } | null>(null);
  const seenEnd = useRef<string | null>(endSig);
  const momentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const before = seenEnd.current;
    seenEnd.current = endSig;
    if (!endSig || endSig === before || !res) return;
    const kind = res.type === 'win' ? 'win' : round!.wallCount === 0 ? 'tie' : null;
    if (!kind) return;
    setMoment({ sig: endSig, kind, bubble: res.type === 'win' ? bubbleBeside(res.winner) : undefined });
    if (momentTimer.current) clearTimeout(momentTimer.current);
    momentTimer.current = setTimeout(() => setMoment((m) => (m?.sig === endSig ? null : m)), kind === 'win' ? WIN_MOMENT_MS : TIE_MOMENT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSig]);
  const showMoment = !!moment && moment.sig === endSig;
  // Tap anywhere (not on a button) to skip straight to the summary. Only on this screen.
  useEffect(() => {
    if (!showMoment) return;
    const skip = (e: PointerEvent): void => {
      if ((e.target as Element | null)?.closest?.('button, a, input, select')) return;
      setMoment(null);
    };
    window.addEventListener('pointerdown', skip);
    return () => window.removeEventListener('pointerdown', skip);
  }, [showMoment]);

  // ---------- action buttons ----------
  // Claiming a discard is two taps: the first holds the tile (the next player has to wait,
  // and everyone sees your bubble), the second (Confirm) claims it. Cancel lets it go.
  const myHold = mySeat !== null ? round?.holds.find((h) => h.seat === mySeat) ?? null : null;
  const hold = (kind: 'chow' | 'pong' | 'gong' | 'win'): void => command({ type: 'hold', kind });
  const cancelHold = (): void => {
    setChowPick(null);
    setChosenChow(null);
    command({ type: 'releaseHold' });
  };
  const [chosenChow, setChosenChow] = useState<[number, number] | null>(null);
  const onConfirm = (): void => {
    if (!myHold?.kind) return;
    if (myHold.kind === 'chow') {
      const ids = a?.chow.length === 1 ? a.chow[0]! : chosenChow;
      if (!ids) return;
      setChosenChow(null);
      setChowPick(null);
      return doClaim({ kind: 'chow', tileIds: ids });
    }
    doClaim({ kind: myHold.kind } as Claim);
  };
  const onWin = (): void => (a?.selfDrawWin ? command({ type: 'selfDrawWin' }) : hold('win'));
  const onPong = (): void => hold('pong');
  const onGong = (): void => {
    if (a?.gong && claimable) return hold('gong');
    if (!a) return;
    if (ownGongs === 1) {
      const t = a.concealedGongs[0] ?? a.addedGongs[0]!;
      command(a.concealedGongs.length ? { type: 'concealedGong', tileType: t } : { type: 'addedGong', tileType: t });
    } else setChooser({ kind: 'ownGong', concealed: a.concealedGongs, added: a.addedGongs });
  };
  const onChow = (): void => {
    if (!a || !round?.offered) return;
    hold('chow');
    setChosenChow(null);
    // Several ways to Soeng: the possible tiles glow, and you tap the ones you want.
    if (a.chow.length > 1) setChowPick({ offerId: round.offered.tile.id, first: null });
  };
  /** Each Soeng you could make: the two tile ids and their types. */
  const chowOptions = (a?.chow ?? []).map((ids) => ({ ids, types: ids.map((id) => serverHand?.find((t) => t.id === id)?.type) as TileType[] }));
  /** While choosing a Soeng: the tile types that glow in your hand. */
  const chowLit = ((): Set<TileType> | null => {
    if (!chowPick) return null;
    const opts = chowPick.first ? chowOptions.filter((o) => o.types.includes(chowPick.first!)) : chowOptions;
    return new Set(opts.flatMap((o) => o.types));
  })();
  /** Tapping a tile in your hand while choosing a Soeng. */
  const pickChowTile = (type: TileType): void => {
    if (!chowPick || !chowLit) return;
    if (!chowLit.has(type) || type === chowPick.first) return setChowPick({ ...chowPick, first: null }); // start again
    const first = chowPick.first;
    const matches = chowOptions.filter((o) => o.types.includes(type) && (!first || o.types.includes(first)));
    if (matches.length === 1) {
      // Chosen: these two glow until you press Confirm.
      setChowPick(null);
      setChosenChow(matches[0]!.ids);
    } else setChowPick({ ...chowPick, first: type }); // in two runs: keep only its partners lit
  };
  // Stop choosing when the chance to claim has gone (or a different tile is offered).
  useEffect(() => {
    if (chowPick && (!claimable || !a?.chow.length || round?.offered?.tile.id !== chowPick.offerId)) setChowPick(null);
    if (chosenChow && myHold?.kind !== 'chow') setChosenChow(null);
  });
  // Tapping anywhere outside your hand starts the choice again.
  useEffect(() => {
    if (!chowPick?.first) return;
    const away = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest?.('[data-hand-tile], .act-chow')) setChowPick((p) => (p ? { ...p, first: null } : p));
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [chowPick?.first]);
  /** While holding a claim: the tiles in your hand it would use glow in its colour. */
  const holdGlow = ((): Set<number> => {
    const out = new Set<number>();
    if (!myHold?.kind || !serverHand || !round?.offered) return out;
    const type = round.offered.tile.type;
    if (myHold.kind === 'pong' || myHold.kind === 'gong') {
      serverHand.filter((t) => t.type === type).slice(0, myHold.kind === 'pong' ? 2 : 3).forEach((t) => out.add(t.id));
    } else if (myHold.kind === 'chow') {
      const ids = a?.chow.length === 1 ? a.chow[0]! : chosenChow;
      ids?.forEach((id) => out.add(id));
    } else serverHand.forEach((t) => out.add(t.id)); // Wu: your whole hand
    return out;
  })();
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
  // At the table between hands.
  const notReady = view.seats.filter((sv) => sv.name && !sv.cpu && !(view.phase === 'betweenRounds' ? sv.startPressed : sv.confirmed)).map((sv) => personName(sv.name, lang));
  const tableHint =
    view.phase === 'rolling' ? ''
    : mySeat === null ? (view.seats.some((sv) => !sv.name) && view.phase === 'betweenRounds' ? tr('hintSitHere') : tr('hintSeatsFull'))
    : (view.phase === 'betweenRounds' ? me?.startPressed : me?.confirmed) ? (notReady.length ? tr('waitingFor', { names: notReady.join(lang === 'zh' ? '、' : ', ') }) : '')
    : tr('hintShuffle');
  const turnName = round ? personName(view.seats[round.turn]?.name, lang) : '';
  const waitingOnEmptySeat = !!round && round.phase !== 'ended' && !turnName;
  let hint = '';
  if (view.phase === 'playing' && round && round.phase !== 'ended') {
    const otherHold = round.holds.find((h) => h.seat !== mySeat);
    if (chowPick) hint = tr('hintPickChow');
    else if (myHold?.kind) hint = tr('hintHolding');
    else if (otherHold && round.turn === mySeat) hint = tr('hintWaitClaim', { name: personName(view.seats[otherHold.seat]?.name, lang) });
    else if (a?.draw) hint = tr('hintDraw');
    else if (a?.drawReplacement) hint = tr('hintReplace');
    else if (a?.discard) hint = tr('hintDiscard');
    else if (a?.pass) hint = tr('hintLastTile');
    else if (claimable) hint = tr('hintClaim');
    else if (round.wallCount === 0 && (round.phase === 'mustDraw' || round.phase === 'mustReplace')) hint = tr('hintWaitLastTile');
    else if (waitingOnEmptySeat) hint = tr('hintWaitingSeat');
    else if (mySeat === null) hint = tr('hintWatching', { name: turnName });
    else hint = tr('hintTurn', { name: turnName });
  }

  // ---------- pieces ----------
  // Flowers come first: on that player's left (for the right player, whose row runs
  // bottom to top, that is the bottom; for the left player, the top).
  const renderMelds = (melds: Meld[], flowers: Tile[], size: string, wind: number, sideways?: 'left' | 'right'): ReactElement => (
    <div className={`melds${sideways ? ' melds-sideways' : ''}`}>
      {flowers.length > 0 && (
        <span className="meld flowers">
          {flowers.map((t) => (
            <TileView key={t.id} type={t.type} width={size} sideways={sideways} className={newFlowerIds.has(t.id) ? `flower-new ${flowerScores(t.type, wind) ? 'scores' : 'no-score'}` : undefined} />
          ))}
        </span>
      )}
      {melds.map((m, i) => (
        <span className="meld" key={i}>
          {m.tiles.map((t, j) => (
            <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width={size} sideways={sideways} />
          ))}
        </span>
      ))}
    </div>
  );

  // Discards slide in from the player who threw them (only tiles that are new on this screen).
  // A new tile keeps its slide-in for the length of the animation, so a quick second redraw
  // (which often follows straight away) can't cut the animation off.
  const SLIDE_MS = 400;
  const seenDiscards = useRef<{ key: string; ids: Set<number>; until: Map<number, number> }>({ key: '', ids: new Set(), until: new Map() });
  useEffect(() => {
    const ids = (round?.discards ?? []).map((d) => d.tile.id);
    const seen = seenDiscards.current;
    if (seen.key !== roundKey) {
      seenDiscards.current = { key: roundKey, ids: new Set(ids), until: new Map() };
      return;
    }
    const now = Date.now();
    for (const id of ids) {
      if (seen.ids.has(id)) continue;
      seen.ids.add(id);
      seen.until.set(id, now + SLIDE_MS);
    }
    for (const [id, t] of seen.until) if (t < now) seen.until.delete(id);
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
  const discardSize = useRef<{ key: string; screen: string; discards: number; d: number }>({ key: '', screen: '', discards: 0, d: 0 });
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
    // Safety net: within a hand the discards only get smaller. They may grow again only when the
    // screen changes size, a new hand starts, or discards are taken back (a claim or undo). This
    // stops any back-and-forth between the tile size and the layout (tiles flickering).
    const prev = discardSize.current;
    const total = round?.discards.length ?? 0;
    const sameSituation = prev.key === roundKey && prev.screen === `${screen.w}x${screen.h}` && total >= prev.discards;
    if (sameSituation && d > prev.d) d = prev.d;
    discardSize.current = { key: roundKey, screen: `${screen.w}x${screen.h}`, discards: total, d };
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, round?.discards.length, screen.w, screen.h, bottomSeat]);

  const renderDiscards = (side: Side): ReactElement => {
    const seat = seatAt(side);
    const tiles = round?.discards.filter((d) => d.by === seat) ?? [];
    const isNew = (id: number): boolean =>
      seenDiscards.current.key === roundKey && (!seenDiscards.current.ids.has(id) || (seenDiscards.current.until.get(id) ?? 0) > Date.now());
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
    <div className={`nametag${round && round.turn === sv.seat && round.phase !== 'ended' ? ' nametag-turn' : ''}${view.pausedSeats.includes(sv.seat) ? ' gone' : ''}`}>
      <span className="wind-badge">{WIND_SHORT[lang][sv.wind]}</span>
      <span className="nametag-name">{sv.name ? personName(sv.name, lang) : tr('empty')}</span>
      {/* CPU names already end in "(CPU)"; older names don't. */}
      {sv.cpu && !sv.name?.startsWith('CPU') && !sv.name?.endsWith('(CPU)') && <span className="cpu-badge">{tr('cpu')}</span>}
      {sv.name && !sv.connected && !sv.cpu && (view.pausedSeats.includes(sv.seat) ? <span className="lost-tag">{tr('disconnectedTag')}</span> : <span className="offline">{tr('offline')}</span>)}
      {sv.balance !== null && !hideChips && <span className="chips">{sv.balance}</span>}
      {round && sv.isDealer && (
        <span className="dice dice-small" title="dice">
          {round.dice.map((d, i) => <span key={i} className="die">{d}</span>)}
        </span>
      )}
      {/* Ready for the next hand (CPUs always are). */}
      {atTable && view.phase !== 'rolling' && sv.name && (sv.cpu || (view.phase === 'betweenRounds' ? sv.startPressed : sv.confirmed)) && (
        <span className="ready-tag">{tr('ready')}</span>
      )}
      {mySeat === null && !sv.name && (round || (atTable && view.phase === 'betweenRounds')) && (
        <button className="btn sit-here" onClick={(e) => { e.stopPropagation(); command({ type: 'takeSeat', seat: sv.seat }); }}>
          {tr('sitHere')}
        </button>
      )}
      {mySeat === null && sv.name && !atTable && (
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
          {renderMelds(sv.melds, dealAnim ? [] : sv.flowers, 'var(--public-w)', sv.wind, sideways)}
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
  // ---------- the start of each hand: mixing, building the wall (see TableIntro) ----------
  // One key per hand (the same while the dice are being rolled and while it is dealt).
  const introKey = `${view.id}|${view.match.handsPlayed}|${view.match.roundWind}|${view.match.dealer}`;
  const [introBuilt, setIntroBuilt] = useState<string | null>(null);
  const wallStanding = introBuilt === introKey;
  // At the table between hands: the shared pile is on show (and you can shuffle it).
  const roundOver = view.phase === 'playing' && round?.phase === 'ended';
  const atTable = view.phase === 'betweenRounds' || (view.phase === 'rolling' && !wallStanding) || (roundOver && showReady === roundKey);
  const tableRef = useRef({ atTable, phase: view.phase, introKey });
  tableRef.current = { atTable, phase: view.phase, introKey };
  const build = (): void => {
    const k = tableRef.current.introKey;
    buildFromPile(k, perWall, sideOf, () => setIntroBuilt(k));
  };
  // The pile arrives from the server about 15 times a second.
  useEffect(
    () =>
      onPile((m) => {
        const { atTable: shown, phase } = tableRef.current;
        if (phase === 'rolling' && m.done) return build();
        if (shown) showPile(m.id, m.perWall, m.tiles);
        else hidePile();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    // Back at the table between hands: the old wall goes, and the pile shows instead.
    if (view.phase === 'betweenRounds' || (atTable && view.phase !== 'rolling')) stopIntro();
    if (atTable) {
      const m = latestPile();
      if (m && !m.done) showPile(m.id, m.perWall, m.tiles);
    } else if (view.phase !== 'rolling') hidePile();
    if (view.phase === 'rolling') {
      const m = latestPile();
      if (m?.done && pileShowing()) build();
      // No pile on screen (the page was just opened): mix and build the wall by itself.
      const t = setTimeout(() => {
        if (!pileShowing() && !introKeyIs(introKey)) startIntro(introKey, perWall, sideOf, () => setIntroBuilt(introKey));
      }, 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, introKey, atTable]);
  useEffect(() => () => { stopIntro(); hidePile(); }, []);
  // Shuffling: where your mouse is (or your finger, while it's down) pushes the tiles.
  const canShuffle = atTable && mySeat !== null && view.phase !== 'rolling';
  useEffect(() => {
    if (!canShuffle) return;
    let last = 0;
    let down = false;
    let lastOn = false;
    const sendAt = (e: PointerEvent, on: boolean): void => {
      const t = performance.now();
      if (on === lastOn && t - last < 45) return;
      last = t;
      lastOn = on;
      const u = pileUnits(e.clientX, e.clientY, perWall);
      send({ type: 'shove', x: u.x, y: u.y, on });
    };
    const overTable = (e: PointerEvent): boolean => !(e.target as Element | null)?.closest?.('button, .panel, .topbar, .me, .overlay');
    const move = (e: PointerEvent): void => sendAt(e, overTable(e) && (e.pointerType === 'mouse' || down));
    const press = (e: PointerEvent): void => {
      down = true;
      sendAt(e, overTable(e));
    };
    const lift = (e: PointerEvent): void => {
      down = false;
      if (e.pointerType !== 'mouse') sendAt(e, false);
    };
    const leave = (): void => send({ type: 'shove', x: 0, y: 0, on: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', lift);
      document.removeEventListener('pointerleave', leave);
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShuffle]);
  const dealAnim = useDealAnimation(round, roundKey, perWall, sideOf, introKey);

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
  // Shown only while that tile is still on offer: once the next player draws, or someone
  // claims it, it disappears. (If you can claim it, the "Take" tile shows instead.)
  const showLastDiscard =
    !!round &&
    round.phase !== 'ended' &&
    !!lastDiscard &&
    round.offered?.tile.id === lastDiscard.id &&
    !round.offeredDrawn &&
    !claimable;
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

  // ---------- opening flowers: after the deal, each player's flowers pop up in front of them ----------
  const [openingFlowers, setOpeningFlowers] = useState<{ key: string; items: { seat: number; types: TileType[]; x: number; y: number }[] } | null>(null);
  const hadDealAnim = useRef(false);
  useEffect(() => {
    if (dealAnim) {
      hadDealAnim.current = true;
      return;
    }
    if (!hadDealAnim.current || !round || round.discards.length > 0) return;
    hadDealAnim.current = false;
    const mid = document.querySelector('.centre')?.getBoundingClientRect();
    if (!mid) return;
    const cx = mid.left + mid.width / 2;
    const cy = mid.top + mid.height / 2;
    const items = view.seats
      .filter((sv) => sv.flowers.length > 0)
      .map((sv) => {
        const side = sideOf(sv.seat);
        const tag = (side === 'bottom' ? document.querySelector('.me-row') : document.querySelector(`.opp-${side} .nametag`))?.getBoundingClientRect();
        const tx = tag ? tag.left + tag.width / 2 : cx;
        const ty = tag ? (side === 'bottom' ? tag.top : tag.top + tag.height / 2) : cy;
        // Halfway between that player and the middle of the table.
        return { seat: sv.seat, types: sv.flowers.map((f) => f.type), x: (tx + cx) / 2, y: (ty + cy) / 2 };
      });
    if (items.length === 0) return;
    const key = roundKey;
    setOpeningFlowers({ key, items });
    const t = setTimeout(() => setOpeningFlowers((o) => (o?.key === key ? null : o)), OPENING_FLOWERS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dealAnim, roundKey]);

  /** Where a claim bubble goes: just beside that player's name tag (left of it for the right player). */
  const bubbleBeside = (seat: number): Pop['bubble'] => {
    const side = sideOf(seat);
    const tag =
      side === 'bottom'
        ? document.querySelector('.topbar-left .nametag') ?? document.querySelector('.me-bottom .nametag')
        : document.querySelector(`.opp-${side} .nametag`);
    const r = tag?.getBoundingClientRect();
    if (!r) return undefined;
    const y = r.top + r.height / 2;
    return side === 'right' ? { x: r.left - 8, y, anchor: 'right' } : { x: r.right + 8, y, anchor: 'left' };
  };

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
        pops.push({ key: `${roundKey}-m-${sig}`, kind: m.kind, seat: sv.seat, types: m.tiles.map((t) => t.type), concealed: m.concealed, bubble: bubbleBeside(sv.seat) });
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
  // Room for a full hand (14 tiles, minus 3 for each shown set, plus the gap before a new
  // tile), so drawing, discarding and claiming never change the size. Worked out once per
  // hand; it only ever gets smaller (lots of flowers and Gongs) until the next hand.
  void handCount;
  const handSlots = 14 - 3 * bottom.melds.length + 0.35;
  const fitW = Math.max(14, Math.min(maxHand, rowW / (handSlots + publicCount * PUBLIC_RATIO + groups * 0.3 + 0.6)));
  const sizeRef = useRef<{ key: string; w: number } | null>(null);
  const sizeKey = `${roundKey}|${screen.w}x${screen.h}`;
  if (!sizeRef.current || sizeRef.current.key !== sizeKey || fitW < sizeRef.current.w) sizeRef.current = { key: sizeKey, w: fitW };
  const handW = sizeRef.current.w;
  // --hand-max: the biggest your tiles can be, so your row keeps the same height all hand.
  const rowSizes = {
    '--hand-w': `${handW.toFixed(1)}px`,
    '--mine-w': `${(handW * PUBLIC_RATIO).toFixed(1)}px`,
    '--hand-max': `${Math.max(14, maxHand).toFixed(1)}px`,
  } as CSSProperties;
  const showButtons = !!a && round?.phase !== 'ended';
  const dealerSeat = round ? view.seats.findIndex((s) => s.isDealer) : view.match.dealer;
  const iAmDealer = mySeat !== null && mySeat === view.match.dealer;
  const lastWin = round?.result?.type === 'win' && round.result.isChicken;
  const canUndo = !!a?.undo || (!!lastWin && mySeat !== null);

  return (
    <div className={`table-screen felt-${view.tableColour}${atTable ? ' at-table' : ''}`}>
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

            </>
          )}
        </div>
        <div className="topbar-centre">
          <span className="round-label">{view.tutorial ? `${tr('tutorial')} · ` : ''}{(showReady === roundKey && view.nextLabel ? view.nextLabel : view.label)[lang]}</span>
          {view.tutorial && <button className="btn leave-tutorial" onClick={onLeave}>{tr('leaveTutorial')}</button>}
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
          <FullscreenButton title={tr('fullscreen')} />
          <button className="btn icon help-btn" title={tr('help')} onClick={() => setPanel('help')}>?</button>
          <button className="btn icon settings-btn" title={tr('settings')} onClick={() => setPanel('settings')}>⚙</button>
        </div>
      </header>

      <main className="board">
        {/* Whose turn: the table edge in front of that player glows gold (their name tag pulses too). */}
        {round && round.phase !== 'ended' && !dealAnim && view.seats[round.turn]?.name && (
          <div className={`turn-edge turn-edge-${sideOf(round.turn)}`} aria-hidden="true" />
        )}
        {flowerPops.some((fp) => fp.kind !== 'flower') &&
          flowerPops
            .filter((fp) => fp.kind !== 'flower')
            .map((fp) => (
              // A claim: a bubble next to the player who claimed, and the set's tiles big in the
              // middle, glowing in the claim's colour (Soeng green, Pung blue, Gong purple).
              <div key={fp.key} aria-live="polite">
                {fp.bubble && (
                  <div
                    className="claim-bubble-at"
                    style={fp.bubble.anchor === 'left' ? { left: fp.bubble.x, top: fp.bubble.y } : { right: window.innerWidth - fp.bubble.x, top: fp.bubble.y }}
                  >
                    <span className={`claim-bubble act-${fp.kind}${fp.bubble.anchor === 'right' ? ' from-right' : ''}`}>{labels[fp.kind as 'chow' | 'pong' | 'gong']}!</span>
                  </div>
                )}
                <div className="claim-tiles-at">
                  <div className={`claim-tiles claim-${fp.kind}`}>
                    {fp.types.map((type, i) => (
                      <TileView key={i} type={type} back={!!fp.concealed && (i === 0 || i === 3)} width="clamp(40px, 6.5vw, 76px)" className="claim-glow" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
        {flowerPops.some((fp) => fp.kind === 'flower') && (
          <div className="flower-pops" aria-live="polite">
            {flowerPops.filter((fp) => fp.kind === 'flower').map((fp) => (
              <div key={fp.key} className={`flower-pop pop-${fp.kind}`}>
                <div className="flower-pop-tiles">
                  {fp.kind !== 'flower' && <span className={`act pop-badge act-${fp.kind}`}>{labels[fp.kind]}</span>}
                  {fp.types.map((type, i) => (
                    <TileView key={i} type={type} back={!!fp.concealed && (i === 0 || i === 3)} width="clamp(40px, 6vw, 72px)" className={fp.kind === 'flower' ? (flowerScores(type, view.seats[fp.seat]!.wind) ? 'ring-scores' : 'ring-no-score') : undefined} />
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
        {/* Someone is holding the offered tile: their bubble stays by their name until they
            confirm (then the usual claim pop-up) or cancel. Not chosen yet: no words, and it
            fades through all the claim colours. */}
        {round?.holds.map((h) => {
          const b = bubbleBeside(h.seat);
          if (!b) return null;
          return (
            <div key={`hold-${h.seat}`} className="claim-bubble-at hold-at" style={b.anchor === 'left' ? { left: b.x, top: b.y } : { right: window.innerWidth - b.x, top: b.y }}>
              <span className={`claim-bubble hold-bubble ${h.kind ? `act-${h.kind}` : 'hold-any'}${b.anchor === 'right' ? ' from-right' : ''}`}>
                {h.kind ? (h.kind === 'win' ? labels.win : labels[h.kind]) : ''}
              </span>
            </div>
          );
        })}
        <PausedCard view={view} lang={lang} />
        {view.tutorial && (
          <TutorialGuide
            view={view}
            lang={lang}
            panel={panel}
            dealing={!!dealAnim}
            openingFlowers={openingFlowers?.key === roundKey}
            winMoment={showMoment}
            finished={roundOver && showReady === roundKey}
            onDone={onLeave}
          />
        )}
        {openingFlowers?.key === roundKey &&
          openingFlowers.items.map((o) => (
            <div key={o.seat} className="opening-flowers" style={{ left: o.x, top: o.y }} aria-label={personName(view.seats[o.seat]?.name, lang)}>
              {o.types.map((type, i) => (
                <TileView key={i} type={type} width="clamp(30px, 4.4vw, 54px)" className={flowerScores(type, view.seats[o.seat]!.wind) ? 'ring-scores' : 'ring-no-score'} />
              ))}
            </div>
          ))}
        {renderOpponent('top')}
        {renderOpponent('left')}
        <section className="centre" data-drop="centre">
          <div className="pond" data-drop="discard" ref={pondRef} style={{ '--discard-w': `${discardW}px` } as CSSProperties}>
            {renderDiscards('top')}
            {renderDiscards('left')}
            <div className="hub">
              {round ? (
                // Three fixed slots so the wall never moves: the tile you can take (or the
                // last discard) on the left, the wall in the middle, Draw on the right.
                <span className="hub-row">
                  <span className="hub-slot hub-left">
                    {claimable && round.offered ? (
                      // The tile you can claim: tap it, or drag it into your hand.
                      <span className="claim-pile" onPointerDown={start({ kind: 'offered' })}>
                        <TileView type={round.offered.tile.type} width="var(--draw-w)" />
                        <span className="draw-label">{tr('take')}</span>
                      </span>
                    ) : (
                      !dealAnim && lastDiscardTile
                    )}
                  </span>
                  {/* While the big wall is drawn over the table (dealing), the small box waits for it to shrink in. */}
                  <span style={dealAnim ? { visibility: 'hidden' } : undefined}>
                    <WallBox round={round} sideOf={sideOf} perWall={perWall} label={tr('tilesLeft')} override={dealAnim?.wall} />
                  </span>
                  <span className="hub-slot hub-right">
                    {(a?.draw || a?.drawReplacement) && (
                      // Big glowing tile: pressing it draws straight away (no need to drag or let go).
                      <span
                        className="draw-pile"
                        onPointerDown={(e) => {
                          if (e.button !== 0 && e.pointerType === 'mouse') return;
                          e.preventDefault();
                          onTap(a.draw ? { kind: 'wallFront' } : { kind: 'wallBack' });
                        }}
                      >
                        <TileView back width="var(--draw-w)" />
                        <span className="draw-label">{a.draw ? tr('drawHere') : tr('replacementHere')}</span>
                      </span>
                    )}
                  </span>
                </span>
              ) : view.phase === 'rolling' ? (
                !wallStanding || iAmDealer ? null : (
                  <div className="hub-sub">{tr('waitingRoll', { name: personName(view.seats[view.match.dealer]?.name, lang) })}</div>
                )
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
      <footer className={`me${dealAnim?.rolling ? ' dealing' : ''}`} style={rowSizes}>
        <div className="me-row">
          {/* Your public tiles (shown sets and flowers) sit to the left of your hand. */}
          {renderMelds(bottom.melds, dealAnim ? [] : bottom.flowers, 'var(--mine-w)', bottom.wind)}
          <div className={`hand${handGap?.over ? ' reordering' : ''}`} data-drop="hand" ref={handRef}>
          {dealAnim && serverHand && bottomSeat !== null ? (
            // During the deal: your tiles arrive and are sorted as they come in (the dealer's
            // 14th tile is sorted in with the rest).
            sortHand(serverHand.slice(0, Math.min(serverHand.length, dealAnim.dealt[bottomSeat] ?? 0))).map((t) => (
              <span key={t.id} className="hand-tile dealt-tile">
                <TileView type={t.type} width="var(--hand-w)" />
              </span>
            ))
          ) : serverHand
            ? hand.map((t, i) => (
                <span
                  key={t.id}
                  data-hand-tile={t.id}
                  data-type={t.type}
                  className={`hand-tile${drag?.moved && drag.src.kind === 'hand' && drag.src.tileId === t.id ? (handGap?.over ? ' dragging gap' : ' dragging') : ''}${
                    chowLit ? (chowLit.has(t.type) ? (t.type === chowPick?.first ? ' chow-pick chow-first' : ' chow-pick') : ' chow-faded') : holdGlow.has(t.id) ? ` hold-glow hold-${myHold!.kind}` : ''
                  }`}
                  style={slideOf(t.id, i) ? { transform: `translateX(${slideOf(t.id, i)}px)` } : undefined}
                  onPointerDown={mySeat !== null ? start({ kind: 'hand', tileId: t.id, type: t.type }) : undefined}
                >
                  <TileView type={t.type} width="var(--hand-w)" />
                </span>
              ))
            : Array.from({ length: bottom.handCount }, (_, i) => <TileView key={i} back width="var(--hand-w)" />)}
          {drawnTile && !dealAnim && (
            // The tile you just drew, a little apart on the far right.
            <span
              key={drawnTile.id}
              ref={drawnRef}
              data-hand-tile={drawnTile.id}
              data-type={drawnTile.type}
              data-drawn="true"
              className={`hand-tile drawn-tile${drag?.moved && drag.src.kind === 'hand' && drag.src.tileId === drawnTile.id ? ' dragging' : ''}`}
              onPointerDown={start({ kind: 'hand', tileId: drawnTile.id, type: drawnTile.type })}
            >
              <TileView type={drawnTile.type} width="var(--hand-w)" />
            </span>
          )}
          </div>
        </div>
        <div className={`actions${claimable && !myHold ? ' actions-claim' : ''}`}>
          {/* At the table between hands: Ready (green), then a plain Unready if you change your mind. */}
          {atTable && view.phase !== 'rolling' && me && (
            (view.phase === 'betweenRounds' ? me.startPressed : me.confirmed) ? (
              <button className="btn unready-btn" onClick={() => command({ type: 'unready' })}>{tr('unready')}</button>
            ) : (
              <button className="btn ready-btn" onClick={() => command(view.phase === 'betweenRounds' ? { type: 'pressStart' } : { type: 'confirmRound' })}>{tr('ready')}</button>
            )
          )}
          {/* Holding a tile: Cancel (no colour) to its left, and Confirm in the claim's colour. */}
          {showButtons && myHold && <button className="act act-pass" onClick={cancelHold}>{tr('cancel')}</button>}
          {showButtons && myHold?.kind ? (
            <button className={`act act-${myHold.kind} act-confirm`} disabled={myHold.kind === 'chow' && (a.chow.length > 1 && !chosenChow)} onClick={onConfirm}>{tr('confirm')}</button>
          ) : (
            <>
              {showButtons && claimable && a.chow.length > 0 && <button className="act act-chow" onClick={onChow}>{labels.chow}</button>}
              {showButtons && claimable && a.pong && <button className="act act-pong" onClick={onPong}>{labels.pong}</button>}
              {showButtons && ((claimable && a.gong) || ownGongs > 0) && <button className="act act-gong" onClick={onGong}>{labels.gong}</button>}
              {a && (a.selfDrawWin || (a.win && (claimable || round?.phase === 'ended'))) && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
            </>
          )}
          {/* Wall empty: say no to the last tile. Plain (no colour) so it isn't pressed by mistake. */}
          {a?.pass && round?.phase !== 'ended' && <button className="act act-pass" onClick={() => command({ type: 'pass' })}>{tr('pass')}</button>}
        </div>
        <div className="me-bottom">
          {mySeat === null && nameTag(bottom)}
          <span className="hint">{dealAnim ? '' : atTable ? tableHint : hint}</span>
          {atTable && roundOver && (
            <button className="btn back-to-summary" onClick={() => setShowReady(null)}>{tr('returnToSummary')}</button>
          )}
        </div>
      </footer>

      {/* The dealer rolls once the wall is built: swipe the dice, or press the button. */}
      {view.phase === 'rolling' && iAmDealer && wallStanding && (
        <div className="dice-tray in-wall" onPointerDown={start({ kind: 'dice' })}>
          <span className="tray-dice">
            {[1, 3, 5].map((v) => <span key={v} className="tray-die"><DieFace value={v} /></span>)}
          </span>
          <div className="dice-hint">{tr('swipeDiceOut')}</div>
          <button className="roll-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => command({ type: 'rollDice' })}>
            {tr('rollDice')}
          </button>
        </div>
      )}


      {view.you.watchAll && mySeat === null && round && (
        <AllHands view={view} tr={tr} newFlowerIds={newFlowerIds} hideFlowers={!!dealAnim} onClose={() => command({ type: 'setWatchAll', visible: false })} />
      )}
      {showMoment && <div className="tap-to-continue">{tr('tapToContinue')}</div>}
      {showMoment && moment.kind === 'tie' && (
        <div className="tie-stamp-at" aria-live="polite">
          <div className="tie-stamp">
            <span className={lang === 'zh' ? 'zh' : 'en'}>{tr('tie')}</span>
          </div>
        </div>
      )}
      {showMoment && moment.kind === 'win' && res?.type === 'win' && (
        <div aria-live="polite">
          {moment.bubble && (
            <div
              className="claim-bubble-at"
              style={moment.bubble.anchor === 'left' ? { left: moment.bubble.x, top: moment.bubble.y } : { right: window.innerWidth - moment.bubble.x, top: moment.bubble.y }}
            >
              <span className={`win-bubble${moment.bubble.anchor === 'right' ? ' from-right' : ''}${lang === 'zh' ? ' zh' : ''}`}>{labels.win}!</span>
            </div>
          )}
          <WinningHand seat={view.seats[res.winner]!} winningTileId={res.winningTileId} name={res.winner === mySeat ? tr('you') : personName(view.seats[res.winner]?.name, lang)} />
        </div>
      )}
      {(round?.phase === 'ended' || view.phase === 'finished') && !showMoment && (
        showReady === roundKey && mySeat !== null && view.phase !== 'finished' ? null : (
          <ResultPanel
            view={view}
            lang={lang}
            command={command}
            canClaimWin={!!a?.win}
            onWin={onWin}
            winLabel={winLabel}
            onContinue={() => {
              if (view.lastHand) {
                // The last hand: leaving the summary counts as done, and the final scores show straight away.
                if (mySeat !== null || view.spectatorsConfirm) command({ type: 'confirmRound' });
                setShowFinal(roundKey);
              } else setShowReady(roundKey);
            }}
            finalPreview={showFinal === roundKey && view.lastHand}
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
        // A hand tile pushed far enough to discard glows red: letting go throws it.
        <div className={`drag-ghost${drag.src.kind === 'hand' && discardReadyAt(drag.y) ? ' discard-ready' : ''}`} style={{ left: drag.x, top: drag.y }}>
          {drag.src.kind === 'hand' ? (
            <TileView type={drag.src.type} width="var(--hand-w)" />
          ) : drag.src.kind === 'dice' ? (
            <span className="tray-die"><DieFace value={4} /></span>
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
function AllHands({ view, tr, newFlowerIds, hideFlowers, onClose }: { view: RoomView; tr: Tr; newFlowerIds: Set<number>; hideFlowers: boolean; onClose: () => void }): ReactElement {
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
              {!hideFlowers && s.flowers.length > 0 && (
                <span className="meld flowers">
                  {s.flowers.map((t) => <TileView key={t.id} type={t.type} width="var(--allhands-w)" className={newFlowerIds.has(t.id) ? `flower-new ${flowerScores(t.type, s.wind) ? 'scores' : 'no-score'}` : undefined} />)}
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
            data-tut="name"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameChanged) command({ type: 'rename', newName: name.trim() });
            }}
          >
            <input id="name-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!nameChanged}>{tr('save')}</button>
          </form>

          <span>{tr('language')}</span>
          <div className="segmented" data-tut="lang">
            <button className={prefs.lang === 'en' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'en' })}>English</button>
            <button className={prefs.lang === 'zh' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'zh' })}>中文</button>
          </div>

          <span>{tr('callAll')}</span>
          <div className="segmented" title={tr('callAllNote')} data-tut="callAll">
            <button className={!prefs.callAll ? 'on' : ''} onClick={() => setPrefs({ ...prefs, callAll: false })}>{tr('no')}</button>
            <button className={prefs.callAll ? 'on' : ''} onClick={() => setPrefs({ ...prefs, callAll: true })}>{tr('yes')}</button>
          </div>

          <span>{tr('celebration')}</span>
          <div className="segmented celebration-choice" data-tut="cele">
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

        <div className="row" data-tut="leave">
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
  /** How many tiles each seat has been dealt so far (4 at a time, then 1). */
  dealt: number[];
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

const DEAL_MS = DEAL_ANIM_MS;
/** How long the opening flowers stay in front of each player after the deal. */
const OPENING_FLOWERS_MS = 2500;

/** Does this flower score for a player with this seat wind (0 East ... 3 North)? Its number matches the seat. */
function flowerScores(type: TileType, wind: number): boolean {
  return Number(type[1]) === wind + 1;
}

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
  introKey: string,
): DealAnim | null {
  const done = useRef<string>('');
  const [plan, setPlan] = useState<null | {
    key: string;
    start: number;
    steps: { seat: number; n: number; from: 'front' | 'back'; jump?: boolean }[];
    order: { seat: number; position: number }[];
    total: number;
    from: { x: number; y: number };
    to: Record<Side, { x: number; y: number }>;
  }>(null);
  const [, setTick] = useState(0);
  const lastFlown = useRef('');

  useEffect(() => {
    if (!round || round.phase === 'ended' || round.discards.length > 0 || done.current === roundKey || round.wall.length === 0) return;
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
    const steps: { seat: number; n: number; from: 'front' | 'back'; jump?: boolean }[] = [];
    for (let r = 0; r < 3; r++) for (const s of seats) steps.push({ seat: s, n: 4, from: 'front' });
    // The dealer takes the next 1st and 5th tiles together, then the others take one each.
    steps.push({ seat: dealer, n: 2, from: 'front', jump: true });
    for (const s of seats.slice(1)) steps.push({ seat: s, n: 1, from: 'front' });
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
    // The dice roll first; then the wall is counted and broken (TableIntro); then the deal.
    const diceTotal = round.dice.reduce((x, y) => x + y, 0);
    countIntro(introKey, perWall, sideOf, dealer, diceTotal, DICE_MS);
    setPlan({ key: roundKey, start: performance.now() + DICE_MS + countMs(diceTotal), steps, order, total, from: centre(document.querySelector('.hub')), to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, !!round]);

  useEffect(() => {
    if (!plan) return;
    let raf = 0;
    const loop = (): void => {
      if (performance.now() - plan.start >= DEAL_MS) {
        setPlan(null);
        finishIntro(introKey); // the rest of the wall shrinks into the small box
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
    return { wall: { stacks: plan.order.map((st) => ({ ...st, count: 2 })), count: plan.total }, rolling: true, dealt: [0, 0, 0, 0] };
  }
  const stepMs = DEAL_MS / plan.steps.length;
  const index = Math.min(plan.steps.length - 1, Math.floor(elapsed / stepMs));
  let f = 0;
  let b = 0;
  const dealt = [0, 0, 0, 0];
  for (let i = 0; i <= index; i++) {
    const st = plan.steps[i]!;
    if (st.from === 'front') {
      f += st.n;
      dealt[st.seat]! += st.n; // a flower's replacement takes its place, so only these count
    } else b += st.n;
  }
  const N = plan.order.length;
  const clamp = (x: number): number => Math.max(0, Math.min(2, x));
  const stacks = plan.order.map((st, i) => ({ ...st, count: Math.max(0, 2 - clamp(f - 2 * i) - clamp(b - 2 * (N - 1 - i))) }));
  setIntroStacks(introKey, stacks); // the big wall over the table loses the same tiles
  // Each step of the deal sends its tiles gliding to that player (once per step), from the wall.
  if (lastFlown.current !== `${plan.key}-${index}`) {
    lastFlown.current = `${plan.key}-${index}`;
    const step = plan.steps[index]!;
    const taken = step.from === 'front' ? Math.floor((f - step.n) / 2) : N - 1 - Math.floor((b - step.n) / 2);
    const st = plan.order[Math.max(0, Math.min(N - 1, taken))]!;
    const from = introStackPoint(introKey, st.seat, st.position) ?? plan.from;
    if (step.jump) {
      // One tile from this stack and one from two stacks further on (the 1st and 5th tiles).
      const st5 = plan.order[Math.max(0, Math.min(N - 1, taken + 2))]!;
      const from5 = introStackPoint(introKey, st5.seat, st5.position) ?? plan.from;
      flyBacks(from, plan.to[sideOf(step.seat)], 1, Math.max(150, stepMs * 0.9));
      flyBacks(from5, plan.to[sideOf(step.seat)], 1, Math.max(150, stepMs * 0.9));
    } else flyBacks(from, plan.to[sideOf(step.seat)], step.n, Math.max(150, stepMs * 0.9));
  }
  return { wall: { stacks, count: plan.total - f - b }, dealt };
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


/** The winner's whole hand in the middle of the table: hidden tiles, then face-up sets, then the winning tile glowing. */
function WinningHand({ seat, winningTileId, name }: { seat: SeatView; winningTileId?: number; name: string }): ReactElement {
  const hand = seat.hand ?? [];
  const winTile = hand.find((t) => t.id === winningTileId);
  const rest = sortHand(hand.filter((t) => t.id !== winningTileId));
  // Up to 18 tiles (four gongs) must fit on one line.
  const w = 'min(48px, 4.2vw)';
  return (
    <div className="win-show-at">
      <div className="win-show">
        <div className="win-show-name">{name}</div>
        <div className="win-show-row">
          <div className="win-show-group">{rest.map((t) => <TileView key={t.id} type={t.type} width={w} />)}</div>
          {seat.melds.map((m, i) => (
            <div key={i} className="win-show-group win-show-meld">
              {m.tiles.map((t, j) => <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width={w} />)}
            </div>
          ))}
          {winTile && <div className="win-show-group win-show-tile"><TileView type={winTile.type} width={w} className="win-glow" /></div>}
        </div>
      </div>
    </div>
  );
}


/**
 * Fills the whole screen (hides the browser bar). Not shown where the browser can't do it
 * (iPhone Safari only allows videos to go fullscreen).
 */
function FullscreenButton({ title }: { title: string }): ReactElement | null {
  type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
  type El = HTMLElement & { webkitRequestFullscreen?: () => void };
  const doc = document as Doc;
  const supported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const [on, setOn] = useState(() => !!(doc.fullscreenElement || doc.webkitFullscreenElement));
  useEffect(() => {
    const update = (): void => setOn(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!supported) return null;
  const toggle = (): void => {
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined);
        else doc.webkitExitFullscreen?.();
      } else {
        const el = document.documentElement as El;
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
        else el.webkitRequestFullscreen?.();
      }
    } catch {
      /* not allowed here: nothing happens */
    }
  };
  return (
    <button className="btn icon fullscreen-btn" title={title} aria-pressed={on} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {on ? (
          <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
        ) : (
          <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
        )}
      </svg>
    </button>
  );
}

/**
 * Someone at the table lost their connection mid-hand: the game is paused, and a card in
 * the middle says who and how long ago. When they're back, a short "… is back" shows.
 */
function PausedCard({ view, lang }: { view: RoomView; lang: Prefs['lang'] }): ReactElement | null {
  const tr = (k: StringKey, v?: Record<string, string | number>): string => t(lang, k, v);
  const seat = view.pausedSeats.find((s) => s !== view.you.seat);
  const sv = seat !== undefined ? view.seats[seat] : undefined;
  const [, tick] = useState(0);
  const [back, setBack] = useState<string | null>(null);
  const was = useRef<string | null>(null);
  useEffect(() => {
    if (!sv) return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [sv?.seat]);
  useEffect(() => {
    const name = sv?.name ? personName(sv.name, lang) : null;
    if (!name && was.current) {
      setBack(was.current);
      const tm = setTimeout(() => setBack(null), 2600);
      was.current = null;
      return () => clearTimeout(tm);
    }
    was.current = name;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sv?.name]);
  if (!sv) return back ? <div className="back-toast">{tr('isBack', { name: back })}</div> : null;
  // How long ago, using the server's clock (devices' clocks may differ).
  const offset = view.serverNow - Date.now();
  const secs = sv.offlineSince ? Math.max(0, Math.floor((Date.now() + offset - sv.offlineSince) / 1000)) : 0;
  const ago = secs < 60 ? tr('secondsAgo', { n: secs }) : tr('minutesAgo', { m: Math.floor(secs / 60), s: secs % 60 });
  const name = personName(sv.name, lang);
  const [before, after] = tr('disconnectedTitle', { name: '\u0001' }).split('\u0001');
  return (
    <div className="paused-layer" role="status">
      <div className="paused-card">
        <div className="title">{before}<b>{name}</b>{after}</div>
        <div className="sub">{tr('pausedUntil')}</div>
        <div className="time">{ago}</div>
      </div>
    </div>
  );
}
