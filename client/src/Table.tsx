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
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Meld, NormalType, Tile } from '@lan-mahjong/shared';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView, SeatView } from '../../server/src/game/view';
import type { Claim } from '../../server/src/game/round';
import { TileView } from './TileFace';
import { ACTION_LABELS, Prefs, WIND_CHARS, WIND_NAMES, personName, t, useLang } from './i18n';
import type { StringKey } from './i18n';
import { DragSource, Drop, useDrag } from './drag';
import { HelpPanel } from './HelpPanel';
import { ResultPanel } from './ResultPanel';

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
  /** Spectators can close the seat picker and just watch. */
  const [justWatching, setJustWatching] = useState(false);
  const [chooser, setChooser] = useState<Chooser>(null);
  const command = (c: Extract<ClientMessage, { type: 'command' }>['command']): void => send({ type: 'command', command: c });
  const doClaim = (claim: Claim): void => command({ type: 'claim', claim });

  // My hand in the order I arranged it (updated straight away while the server confirms).
  const serverHand = view.seats[bottomSeat]?.hand ?? null;
  const [handOrder, setHandOrder] = useState<number[]>([]);
  useEffect(() => setHandOrder(serverHand?.map((t) => t.id) ?? []), [JSON.stringify(serverHand?.map((t) => t.id))]);
  const hand: Tile[] = useMemo(() => {
    if (!serverHand) return [];
    const byId = new Map(serverHand.map((t) => [t.id, t]));
    const ordered = handOrder.map((id) => byId.get(id)).filter((t): t is Tile => !!t);
    return ordered.length === serverHand.length ? ordered : serverHand;
  }, [serverHand, handOrder]);

  // Claim options on the offered tile (anything except your own turn moves).
  const claimable = !!a && (a.win || a.pong || a.gong || a.chow.length > 0) && !!round?.offered && round.offered.by !== mySeat;
  const ownGongs = a ? a.concealedGongs.length + a.addedGongs.length : 0;

  const onDrop = (src: DragSource, drop: Drop): void => {
    if (src.kind === 'hand') {
      if (drop.zone === 'discard' && a?.discard) {
        command({ type: 'discard', tileId: src.tileId });
      } else if (drop.zone === 'hand') {
        // Reorder: put the tile where it was dropped.
        const els = [...document.querySelectorAll<HTMLElement>('[data-hand-tile]')];
        const others = els.filter((el) => Number(el.dataset.handTile) !== src.tileId);
        let index = others.findIndex((el) => {
          const r = el.getBoundingClientRect();
          return drop.x < r.left + r.width / 2;
        });
        if (index < 0) index = others.length;
        const ids = others.map((el) => Number(el.dataset.handTile));
        ids.splice(index, 0, src.tileId);
        setHandOrder(ids);
        command({ type: 'reorderHand', tileIds: ids });
      }
    } else if (src.kind === 'wallFront' && drop.zone === 'hand' && a?.draw) {
      command({ type: 'draw' });
    } else if (src.kind === 'wallBack' && drop.zone === 'hand' && a?.drawReplacement) {
      command({ type: 'drawReplacement' });
    } else if (src.kind === 'dice' && (drop.zone === 'discard' || drop.zone === 'centre')) {
      command({ type: 'rollDice' });
    }
  };
  const { drag, start } = useDrag(onDrop);

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
    if (!a || !claimable) return;
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
  const wallBySeat = (seat: number) =>
    round ? round.wall.filter((s) => s.seat === seat).sort((x, y) => x.position - y.position) : [];
  const frontStack = round?.wall[0];
  const backStack = round?.wall[round.wall.length - 1];

  const renderWall = (side: Side): ReactElement => {
    const seat = seatAt(side);
    const stacks = wallBySeat(seat);
    return (
      <div className={`wall wall-${side}`}>
        {stacks.map((s) => {
          const isFront = s === frontStack || (frontStack && s.seat === frontStack.seat && s.position === frontStack.position);
          const isBack = backStack && s.seat === backStack.seat && s.position === backStack.position;
          const canFront = isFront && a?.draw;
          const canBack = isBack && a?.drawReplacement;
          return (
            <span
              key={`${s.seat}-${s.position}`}
              className={`stack stack-${s.count}${canFront || canBack ? ' stack-ready' : ''}`}
              onPointerDown={canFront ? start({ kind: 'wallFront' }) : canBack ? start({ kind: 'wallBack' }) : undefined}
            />
          );
        })}
      </div>
    );
  };

  const renderMelds = (melds: Meld[], flowers: Tile[], size: string): ReactElement => (
    <div className="melds">
      {melds.map((m, i) => (
        <span className="meld" key={i}>
          {m.tiles.map((t, j) => (
            <TileView key={t.id} type={t.type} back={m.concealed && (j === 0 || j === 3)} width={size} />
          ))}
        </span>
      ))}
      {flowers.length > 0 && (
        <span className="meld flowers">
          {flowers.map((t) => (
            <TileView key={t.id} type={t.type} width={size} />
          ))}
        </span>
      )}
    </div>
  );

  const renderDiscards = (side: Side): ReactElement => {
    const seat = seatAt(side);
    const tiles = round?.discards.filter((d) => d.by === seat) ?? [];
    return (
      <div className={`discards discards-${side}`}>
        {tiles.map((d) => {
          const offered = round?.offered?.tile.id === d.tile.id;
          return (
            <span key={d.tile.id} onClick={offered ? onTapOffered : undefined} className={offered && claimable ? 'claimable' : ''}>
              <TileView type={d.tile.type} width="var(--discard-w)" highlight={offered} />
            </span>
          );
        })}
      </div>
    );
  };

  const nameTag = (sv: SeatView): ReactElement => (
    <div className={`nametag${round && round.turn === sv.seat && round.phase !== 'ended' ? ' nametag-turn' : ''}`}>
      <span className="wind-badge">{WIND_CHARS[sv.wind]}</span>
      <span className="nametag-name">{sv.name ? personName(sv.name, lang) : tr('empty')}</span>
      {sv.cpu && !sv.name?.startsWith('CPU') && <span className="cpu-badge">{tr('cpu')}</span>}
      {sv.name && !sv.connected && !sv.cpu && <span className="offline">{tr('offline')}</span>}
      {sv.balance !== null && <span className="chips">{sv.balance}</span>}
      {mySeat === null && sv.name && (
        <button
          className={`eye${sv.watched ? ' eye-on' : ''}`}
          title={sv.watched ? tr('hideHand') : tr('showHand')}
          onClick={() => command({ type: 'setWatchedSeat', seat: sv.seat, visible: !sv.watched })}
        >
          {sv.watched ? '👁' : '◌'}
        </button>
      )}
    </div>
  );

  const renderOpponent = (side: Side): ReactElement => {
    const sv = view.seats[seatAt(side)]!;
    return (
      <section className={`opp opp-${side}`} onClick={mySeat === null ? () => setSpectatorSeat(sv.seat) : undefined}>
        {nameTag(sv)}
        <div className="opp-hand">
          {sv.hand
            ? sv.hand.map((t) => <TileView key={t.id} type={t.type} width="var(--opp-w)" />)
            : Array.from({ length: sv.handCount }, (_, i) => <TileView key={i} back width="var(--opp-w)" />)}
        </div>
        {renderMelds(sv.melds, sv.flowers, 'var(--opp-w)')}
      </section>
    );
  };

  const bottom = view.seats[bottomSeat]!;
  const winLabel = labels.win;
  const showButtons = !!a && round?.phase !== 'ended';
  const dealerSeat = round ? view.seats.findIndex((s) => s.isDealer) : view.match.dealer;
  const iAmDealer = mySeat !== null && mySeat === view.match.dealer;
  const lastWin = round?.result?.type === 'win';
  const canUndo = !!a?.undo || (!!lastWin && mySeat !== null);

  return (
    <div className={`table-screen felt-${view.tableColour}`}>
      <header className="topbar">
        <div className="topbar-left">
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
          <span className="round-wind">{WIND_CHARS[view.match.roundWind]}</span>
          <span className="round-label">{view.label[lang]}</span>
          <span className="compass">
            {SIDES.map((side) => {
              const sv = view.seats[seatAt(side)]!;
              return (
                <span key={side} className={`compass-${side}${sv.seat === dealerSeat ? ' compass-dealer' : ''}`} title={sv.name ?? ''}>
                  {WIND_CHARS[sv.wind]}
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
          {renderWall('top')}
          {renderWall('left')}
          <div className="pond" data-drop="discard">
            {renderDiscards('top')}
            {renderDiscards('left')}
            <div className="hub">
              {round ? (
                <>
                  <div className="hub-count">{round.wallCount}</div>
                  <div className="hub-sub">{tr('tilesLeft')}</div>
                  <div className="dice">{round.dice.map((d, i) => <span key={i} className="die">{d}</span>)}</div>
                </>
              ) : view.phase === 'rolling' ? (
                iAmDealer ? <div className="hub-sub">{tr('swipeDiceHere')}</div> : <div className="hub-sub">{tr('waitingRoll', { name: personName(view.seats[view.match.dealer]?.name, lang) })}</div>
              ) : null}
            </div>
            {renderDiscards('right')}
            {renderDiscards('bottom')}
          </div>
          {renderWall('right')}
          {renderWall('bottom')}
        </section>
        {renderOpponent('right')}
      </main>

      <footer className="me">
        <div className="me-info">
          {nameTag(bottom)}
          {renderMelds(bottom.melds, bottom.flowers, 'var(--meld-w)')}
        </div>
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
        </div>
        <div className={`actions${claimable ? ' actions-claim' : ''}`}>
          {showButtons && a.chow.length > 0 && <button className="act act-chow" onClick={onChow}>{labels.chow}</button>}
          {showButtons && a.pong && <button className="act act-pong" onClick={onPong}>{labels.pong}</button>}
          {showButtons && (a.gong || ownGongs > 0) && <button className="act act-gong" onClick={onGong}>{labels.gong}</button>}
          {a && (a.win || a.selfDrawWin) && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
        </div>
        <div className="hint">{hint}</div>
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
              {(s.hand ?? []).map((t) => <TileView key={t.id} type={t.type} width="var(--allhands-w)" />)}
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
  const themes: Prefs['theme'][] = ['light', 'dark', 'system'];
  const themeLabel: Record<Prefs['theme'], StringKey> = { light: 'themeLight', dark: 'themeDark', system: 'themeSystem' };
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
