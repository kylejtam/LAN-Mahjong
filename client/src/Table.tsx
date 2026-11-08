/**
 * The game table: the screen you play on.
 *
 * Layout (landscape, the same for everyone):
 * - Top bar: undo (left), round and seat winds (centre), chips + lock, help,
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
import { ACTION_LABELS, WIND_CHARS, WIND_NAMES } from './i18n';
import { DragSource, Drop, useDrag } from './drag';
import { HelpPanel } from './HelpPanel';
import { ResultPanel } from './ResultPanel';

type Side = 'bottom' | 'right' | 'top' | 'left';
const SIDES: Side[] = ['bottom', 'right', 'top', 'left'];

interface Props {
  view: RoomView;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

type Chooser =
  | { kind: 'chow'; options: [number, number][] }
  | { kind: 'ownGong'; concealed: NormalType[]; added: NormalType[] }
  | { kind: 'claimTile'; options: string[] }
  | null;

export function Table({ view, send, onLeave }: Props): ReactElement {
  const lang = 'en' as const;
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
  const [locked, setLocked] = useState(true);
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
  const turnName = round ? view.seats[round.turn]?.name ?? '' : '';
  let hint = '';
  if (view.phase === 'playing' && round && round.phase !== 'ended') {
    if (a?.draw) hint = 'Your turn: drag the end tile of the wall into your hand.';
    else if (a?.drawReplacement) hint = 'Drag the replacement tile from the back of the wall into your hand.';
    else if (a?.discard) hint = 'Drag a tile to the middle of the table to discard it.';
    else if (claimable) hint = 'You can claim the last discard. Tap a button or the tile.';
    else if (mySeat === null) hint = `Watching. ${turnName}'s turn.`;
    else hint = `${turnName}'s turn.`;
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
      <span className="nametag-name">{sv.name ?? 'Empty'}</span>
      {sv.cpu && <span className="cpu-badge">CPU</span>}
      {sv.name && !sv.connected && !sv.cpu && <span className="offline">offline</span>}
      {sv.balance !== null && <span className="chips">{sv.balance}</span>}
      {mySeat === null && sv.name && (
        <button
          className={`eye${sv.watched ? ' eye-on' : ''}`}
          title={sv.watched ? 'Hide this hand' : 'Show this hand'}
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
              ↶ Undo{lastWin && view.seats.some((s) => s.votedUndoWin) ? ` (${view.seats.filter((s) => s.votedUndoWin).length} agreed)` : ''}
            </button>
          ) : (
            <>
              <span className="spectating-tag">Spectating</span>
              {round && (
                <button className="btn" onClick={() => command({ type: 'setWatchAll', visible: true })}>All hands</button>
              )}
              {view.phase === 'betweenRounds' && justWatching && (
                <button className="btn" onClick={() => setJustWatching(false)}>Take a seat</button>
              )}
            </>
          )}
        </div>
        <div className="topbar-centre">
          <span className="round-wind">{WIND_CHARS[view.match.roundWind]}</span>
          <span className="round-label">{view.label.en}</span>
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
            <span className="chip-total">
              {me.balance}
              <button className="lock" title={locked ? 'Unlock (manual calculating)' : 'Lock'} onClick={() => setLocked(!locked)}>
                {locked ? '🔒' : '🔓'}
              </button>
            </span>
          )}
          <button className="btn icon" title="Help" onClick={() => setPanel('help')}>?</button>
          <button className="btn icon" title="Settings" onClick={() => setPanel('settings')}>⚙</button>
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
                  <div className="hub-sub">tiles left</div>
                  <div className="dice">{round.dice.map((d, i) => <span key={i} className="die">{d}</span>)}</div>
                </>
              ) : view.phase === 'rolling' ? (
                iAmDealer ? <div className="hub-sub">Swipe the dice here</div> : <div className="hub-sub">Waiting for {view.seats[view.match.dealer]?.name} to roll</div>
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
          <div className="dice-hint">Swipe the dice to the middle</div>
        </div>
      )}

      {view.phase === 'betweenRounds' && !(mySeat === null && justWatching) && (
        <SeatPicker
          view={view}
          command={command}
          onSpectate={() => {
            if (mySeat !== null) command({ type: 'leaveSeat' });
            setJustWatching(true);
          }}
        />
      )}
      {view.you.watchAll && mySeat === null && round && (
        <AllHands view={view} onClose={() => command({ type: 'setWatchAll', visible: false })} />
      )}
      {(round?.phase === 'ended' || view.phase === 'finished') && (
        <ResultPanel view={view} command={command} canClaimWin={!!a?.win} onWin={onWin} winLabel={winLabel} />
      )}

      {chooser && (
        <div className="overlay" onClick={() => setChooser(null)}>
          <div className="panel chooser" onClick={(e) => e.stopPropagation()}>
            <h3>Choose</h3>
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
            <h3>Swap in?</h3>
            <p>{view.pendingSwap.fromName} would like you to take their seat.</p>
            <div className="row">
              <button className="btn primary" onClick={() => command({ type: 'answerSwap', accept: true })}>Swap in</button>
              <button className="btn" onClick={() => command({ type: 'answerSwap', accept: false })}>No thanks</button>
            </div>
          </div>
        </div>
      )}

      {panel === 'help' && <HelpPanel lang={lang} onClose={() => setPanel(null)} />}
      {panel === 'settings' && (
        <div className="overlay" onClick={() => setPanel(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <p className="muted">Playing as <b>{view.you.name}</b> in “{view.name}”. More settings arrive in phase 5.</p>
            {mySeat !== null && (
              <>
                <h4>Drop out</h4>
                <p className="muted">A CPU takes over your seat. You keep your chips.</p>
                <div className="row">
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <button key={d} className="btn" onClick={() => { command({ type: 'dropOut', replacement: { cpu: d } }); setPanel(null); }}>
                      {d[0]!.toUpperCase() + d.slice(1)} CPU
                    </button>
                  ))}
                </div>
                {view.spectators.filter((s) => s.connected).length > 0 && (
                  <div className="row">
                    {view.spectators.filter((s) => s.connected).map((s) => (
                      <button key={s.name} className="btn" onClick={() => { command({ type: 'dropOut', replacement: { spectator: s.name } }); setPanel(null); }}>
                        Swap with {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="row">
              <button className="btn danger" onClick={onLeave}>Leave game</button>
              <button className="btn" onClick={() => setPanel(null)}>Close</button>
            </div>
          </div>
        </div>
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
      <div className="rotate-hint">Please turn your device sideways.</div>
    </div>
  );
}

/** Spectators: every player's hand, flowers and shown sets, and nothing else. */
function AllHands({ view, onClose }: { view: RoomView; onClose: () => void }): ReactElement {
  return (
    <div className="overlay all-hands-overlay">
      <div className="panel all-hands">
        <h3>All hands</h3>
        {view.seats.map((s) => (
          <div key={s.seat} className={`all-hands-row${view.round?.turn === s.seat ? ' all-hands-turn' : ''}`}>
            <span className="all-hands-name">
              <span className="wind-badge">{WIND_CHARS[s.wind]}</span> {s.name ?? 'Empty'}
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
        <button className="btn" onClick={onClose}>Back to the table</button>
      </div>
    </div>
  );
}

/** Between rounds: choose a seat and press Start, or tap Spectate in the middle to just watch. */
function SeatPicker({
  view,
  command,
  onSpectate,
}: {
  view: RoomView;
  command: (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;
  onSpectate: () => void;
}): ReactElement {
  const mySeat = view.you.seat;
  const me = mySeat !== null ? view.seats[mySeat] : null;
  const filled = view.seats.filter((s) => s.name).length;
  return (
    <div className="overlay">
      <div className="panel seat-picker">
        <h3>{view.name} · {view.label.en}</h3>
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
                <span className="seat-wind">{WIND_NAMES.en[s.wind]}</span>
                <span className="seat-name">{s.name ?? 'Empty'}{s.cpu ? ' (CPU)' : ''}</span>
                {s.startPressed && <span className="seat-ready">Ready</span>}
              </button>
            );
          })}
          <button className="seat seat-spectate" onClick={onSpectate}>
            <span className="seat-name">Spectate</span>
            <span className="seat-wind">Just watch</span>
          </button>
        </div>
        {me ? (
          <div className="row">
            <button className="btn primary big" disabled={me.startPressed} onClick={() => command({ type: 'pressStart' })}>
              {me.startPressed ? 'Waiting for others…' : 'Start'}
            </button>
            <button className="btn" onClick={() => command({ type: 'leaveSeat' })}>Leave seat</button>
          </div>
        ) : (
          <p className="muted">Tap an empty seat to sit down, or Spectate to just watch.</p>
        )}
        {filled < 4 && <p className="muted">A round starts when all 4 seats are filled and everyone presses Start. The host can fill seats with CPUs.</p>}
      </div>
    </div>
  );
}
