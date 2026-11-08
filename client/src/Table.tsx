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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Meld, NormalType, Tile } from '@lan-mahjong/shared';
import { sortHand } from '@lan-mahjong/shared';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView, SeatView } from '../../server/src/game/view';
import type { Claim } from '../../server/src/game/round';
import { TileView } from './TileFace';
import { ACTION_LABELS, Prefs, WIND_CHARS, WIND_NAMES, WIND_SHORT, personName, t, useLang } from './i18n';
import type { StringKey } from './i18n';
import { DragSource, Drop, useDrag } from './drag';
import { HelpPanel } from './HelpPanel';
import { ResultPanel } from './ResultPanel';

/** The window size, kept up to date when the device turns or the window changes. */
function useScreenSize(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const update = (): void => setSize({ w: window.innerWidth, h: window.innerHeight });
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
  const [manual, setManual] = useState<{ key: string; ids: number[] } | null>(null);
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

  // Claim options on the offered tile (anything except your own turn moves).
  const claimOptions = !!a && (a.win || a.pong || a.gong || a.chow.length > 0) && !!round?.offered && round.offered.by !== mySeat;
  // Buttons, flashing and the big claim tile stop once the next player has drawn.
  const claimable = claimOptions && !round?.offeredDrawn;
  const ownGongs = a ? a.concealedGongs.length + a.addedGongs.length : 0;

  const onDrop = (src: DragSource, drop: Drop): void => {
    if (src.kind === 'hand') {
      if (drop.zone === 'discard' && a?.discard) {
        command({ type: 'discard', tileId: src.tileId });
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
    if (src.kind === 'wallFront' && a?.draw) command({ type: 'draw' });
    else if (src.kind === 'wallBack' && a?.drawReplacement) command({ type: 'drawReplacement' });
    else if (src.kind === 'offered') onTapOffered();
  };
  const { drag, start } = useDrag(onDrop, onTap);

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
            <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width={size} sideways={sideways} />
          ))}
        </span>
      ))}
      {flowers.length > 0 && (
        <span className="meld flowers">
          {flowers.map((t) => (
            <TileView key={t.id} type={t.type} width={size} sideways={sideways} />
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

  const nameTag = (sv: SeatView): ReactElement => (
    <div className={`nametag${round && round.turn === sv.seat && round.phase !== 'ended' ? ' nametag-turn' : ''}`}>
      <span className="wind-badge">{WIND_SHORT[lang][sv.wind]}</span>
      <span className="nametag-name">{sv.name ? personName(sv.name, lang) : tr('empty')}</span>
      {sv.cpu && !sv.name?.startsWith('CPU') && <span className="cpu-badge">{tr('cpu')}</span>}
      {sv.name && !sv.connected && !sv.cpu && <span className="offline">{tr('offline')}</span>}
      {sv.balance !== null && <span className="chips">{sv.balance}</span>}
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
          {me && nameTag(me)}
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
            <span className="chip-total">{me.balance}</span>
          )}
          <button className="btn icon" title={tr('help')} onClick={() => setPanel('help')}>?</button>
          <button className="btn icon" title={tr('settings')} onClick={() => setPanel('settings')}>⚙</button>
        </div>
      </header>

      <main className="board">
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
                  <WallBox round={round} sideOf={sideOf} perWall={perWall} label={tr('tilesLeft')} override={dealAnim?.wall} />
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

      {dealAnim?.flight && (
        <div
          key={dealAnim.flight.key}
          className="deal-flight"
          style={{ left: dealAnim.flight.from.x, top: dealAnim.flight.from.y, '--dx': `${dealAnim.flight.dx}px`, '--dy': `${dealAnim.flight.dy}px`, animationDuration: `${dealAnim.flight.ms}ms` } as CSSProperties}
        >
          {Array.from({ length: dealAnim.flight.n }, (_, i) => <TileView key={i} back width="var(--opp-w)" />)}
        </div>
      )}
      <footer className={`me${dealAnim ? ' dealing' : ''}`} style={rowSizes}>
        <div className="me-row">
          {/* Your public tiles (shown sets and flowers) sit to the left of your hand. */}
          {renderMelds(bottom.melds, bottom.flowers, 'var(--mine-w)')}
          <div className="hand" data-drop="hand">
          {serverHand
            ? hand.map((t) => (
                <span
                  key={t.id}
                  data-hand-tile={t.id}
                  className={`hand-tile${drag?.moved && drag.src.kind === 'hand' && drag.src.tileId === t.id ? ' dragging' : ''}`}
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
        <AllHands view={view} tr={tr} onClose={() => command({ type: 'setWatchAll', visible: false })} />
      )}
      {(round?.phase === 'ended' || view.phase === 'finished') && (
        <ResultPanel view={view} lang={lang} command={command} canClaimWin={!!a?.win} onWin={onWin} winLabel={winLabel} />
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
function AllHands({ view, tr, onClose }: { view: RoomView; tr: Tr; onClose: () => void }): ReactElement {
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
                  {s.flowers.map((t) => <TileView key={t.id} type={t.type} width="var(--allhands-w)" />)}
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

/** Each player's own settings: name, language, theme, drop out, leave. */
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
  const themes: Prefs['theme'][] = ['dark', 'light'];
  const themeLabel: Record<Prefs['theme'], StringKey> = { light: 'themeLight', dark: 'themeDark' };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel settings" onClick={(e) => e.stopPropagation()}>
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

          <span>{tr('theme')}</span>
          <div className="segmented">
            {themes.map((th) => (
              <button key={th} className={prefs.theme === th ? 'on' : ''} onClick={() => setPrefs({ ...prefs, theme: th })}>
                {tr(themeLabel[th])}
              </button>
            ))}
          </div>
        </div>

        {mySeat !== null && (
          <>
            <h4>{tr('dropOut')}</h4>
            <p className="muted">{tr('dropOutText')}</p>
            <div className="row">
              <button className="btn" onClick={() => { command({ type: 'dropOut', replacement: { none: true } }); onClose(); }}>
                {tr('leaveMySeat')}
              </button>
              {view.spectators.filter((s) => s.connected).map((s) => (
                <button key={s.name} className="btn" onClick={() => { command({ type: 'dropOut', replacement: { spectator: s.name } }); onClose(); }}>
                  {tr('swapWith', { name: s.name })}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button className="btn danger" onClick={onLeave}>{tr('leaveGame')}</button>
          <button className="btn" onClick={onClose}>{tr('close')}</button>
        </div>
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
  flight: { key: string; n: number; from: { x: number; y: number }; dx: number; dy: number; ms: number } | null;
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
    setPlan({ key: roundKey, start: performance.now(), steps, order, total, from: centre(document.querySelector('.hub')), to });
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
  const step = plan.steps[index]!;
  const target = plan.to[sideOf(step.seat)];
  return {
    wall: { stacks, count: plan.total - f - b },
    flight: { key: `${plan.key}-${index}`, n: step.n, from: plan.from, dx: target.x - plan.from.x, dy: target.y - plan.from.y, ms: Math.max(120, stepMs * 0.9) },
  };
}
