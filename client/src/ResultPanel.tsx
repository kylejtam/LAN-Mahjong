/**
 * End of a round (the win summary): who won, every winning condition with its
 * fan, every player's hand with flowers, each player's chips won (+) or lost
 * (−), and the total chips transferred. Everyone presses Confirm before the
 * next round. (Chips can only be changed by hand on the laptop's host page.)
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView } from '../../server/src/game/view';
import { TileView } from './TileFace';
import { NORMAL_TYPES, findWinShape, sortHand } from '@lan-mahjong/shared';
import type { Meld, Tile } from '@lan-mahjong/shared';

/**
 * Split the winner's hidden tiles into its sets (runs and pongs) and pair, so
 * each set is shown together. Other hands are just shown sorted.
 */
function groupWinningHand(hand: readonly Tile[], melds: readonly Meld[]): Tile[][] {
  const shape = findWinShape(hand, melds);
  const d = shape?.kind === 'standard' ? shape.decompositions[0] : undefined;
  if (!d) return [sortHand(hand)];
  const left = sortHand(hand);
  const take = (type: string): Tile => {
    const i = left.findIndex((t) => t.type === type);
    return left.splice(i, 1)[0]!;
  };
  const groups: Tile[][] = d.sets.map((set) =>
    set.kind === 'pong'
      ? [take(NORMAL_TYPES[set.start]!), take(NORMAL_TYPES[set.start]!), take(NORMAL_TYPES[set.start]!)]
      : [take(NORMAL_TYPES[set.start]!), take(NORMAL_TYPES[set.start + 1]!), take(NORMAL_TYPES[set.start + 2]!)],
  );
  groups.push([take(NORMAL_TYPES[d.pair]!), take(NORMAL_TYPES[d.pair]!)]);
  return groups;
}
import { Lang, personName, t } from './i18n';

interface Props {
  view: RoomView;
  lang: Lang;
  command: (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;
  canClaimWin: boolean;
  onWin: () => void;
  winLabel: string;
  /** Seated players go back to the table (or, after the last hand, to the final scores). */
  onContinue: () => void;
  /** After the last hand: show the final scores now (this hand's chips included). */
  finalPreview?: boolean;
  /** Someone who isn't sitting can close the summary to see the table. */
  onClose?: () => void;
}

export function ResultPanel({ view, lang, command, canClaimWin, onWin, winLabel, onContinue, finalPreview, onClose }: Props): ReactElement {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>): string => t(lang, k, v);
  const [showWall, setShowWall] = useState(false);
  if (view.phase === 'finished' || finalPreview) {
    // Before the server has paid out the last hand, add its chips here.
    const res = view.phase === 'finished' ? null : view.round?.result;
    const final = (seat: number, balance: number | null): number => (balance ?? 0) + (res?.type === 'win' ? res.changes[seat] ?? 0 : 0);
    const ranked = [...view.seats].map((s) => ({ ...s, balance: final(s.seat, s.balance) })).sort((a, b) => b.balance - a.balance);
    return (
      <div className="overlay">
        <div className="panel">
          <h3>{tr('gameFinished')}</h3>
          <table>
            <tbody>
              {ranked.map((s) => (
                <tr key={s.seat}><td>{personName(s.name, lang)}</td><td className="num">{s.balance}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const result = view.round?.result;
  /** The tile that completed the winning hand: highlighted. */
  const winningTileId = result?.type === 'win' ? result.winningTileId : undefined;
  if (!result) return <></>;
  const me = view.you.seat !== null ? view.seats[view.you.seat] : null;
  const waitingFor = view.seats.filter((s) => s.name && !s.cpu && !s.confirmed).map((s) => personName(s.name, lang));
  /** Chips with a clear sign: +48, −16 (a real minus sign), or 0. */
  const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const wall = view.round?.remainingWall ?? [];
  const wallCount = wall.reduce((n, st) => n + st.length, 0);
  return (
    <div className="overlay">
      <div className="panel result">
        {result.type === 'draw' ? (
          <h3>{tr('drawWallEmpty')}</h3>
        ) : (
          <>
            <h3>
              {/* The winner's name in green, the player who threw the winning tile in red. */}
              {(result.discarder === null ? tr('winsSelfDraw', { name: '\u0001name\u0001' }) : tr('winsOnDiscard', { name: '\u0001name\u0001', from: '\u0001from\u0001' }))
                .split('\u0001')
                .map((part, i) =>
                  part === 'name' ? (
                    <span key={i} className="name-winner">{personName(view.seats[result.winner]?.name, lang)}</span>
                  ) : part === 'from' && result.discarder !== null ? (
                    <span key={i} className="name-discarder">{personName(view.seats[result.discarder]?.name, lang)}</span>
                  ) : (
                    part
                  ),
                )}
              {result.isChicken ? tr('chickenWin') : ''}
            </h3>
            <h4 className="result-subhead">{tr('winningConditions')}</h4>
            <ul className="fan-items">
              {result.items.map((i) => (
                <li key={i.id}>
                  <span className={lang === 'zh' ? 'zh' : ''}>{lang === 'zh' ? i.zh : i.en}</span>
                  <span className="num">{tr('fan', { n: i.fan })}</span>
                </li>
              ))}
              {result.items.length === 0 && <li><span className="muted">{tr('noConditions')}</span></li>}
              <li className="fan-total-row">
                <span>{tr('totalFan')}</span>
                <span className="num">{tr('fan', { n: result.fan })}{result.capHand ? tr('maxFan') : ''}</span>
              </li>
            </ul>
            {result.liableSeat != null && (
              <p className="liable-note">{tr('liableNote', { name: personName(view.seats[result.liableSeat]?.name, lang) })}</p>
            )}
            {result.isChicken && (
              <p className="muted">{tr('chickenNote', { min: view.settings.minFan, name: personName(view.seats[result.winner]?.name, lang) })}</p>
            )}
          </>
        )}
        <div className="result-hands">
          {view.seats.map((s) => {
            const change = result.type === 'win' ? result.changes[s.seat]! : 0;
            const isWinner = result.type === 'win' && result.winner === s.seat;
            return (
              <div key={s.seat} className={`result-row${isWinner ? ' result-winner' : ''}`}>
                <span className="result-name">
                  <span className={isWinner ? 'name-winner' : result.type === 'win' && result.discarder === s.seat ? 'name-discarder' : undefined}>{personName(s.name, lang)}</span>
                  {/* Who is ready for the next round. */}
                  {s.name && !s.cpu && <span className={`ready-dot${s.confirmed ? ' on' : ''}`}>{s.confirmed ? tr('ready') : '…'}</span>}
                </span>
                <span className="result-tiles">
                  {(isWinner ? groupWinningHand(s.hand ?? [], s.melds) : [sortHand(s.hand ?? [])]).map((g, gi) => (
                    <span key={`g${gi}`} className="meld">
                      {g.map((t) => (
                        <TileView key={t.id} type={t.type} width="var(--result-w)" className={t.id === winningTileId ? 'winning-tile' : undefined} />
                      ))}
                    </span>
                  ))}
                  {s.melds.map((m, i) => (
                    <span key={i} className="meld">{m.tiles.map((t) => <TileView key={t.id} type={t.type} width="var(--result-w)" />)}</span>
                  ))}
                  {s.flowers.length > 0 && (
                    <span className="meld flowers">{s.flowers.map((t) => <TileView key={t.id} type={t.type} width="var(--result-w)" />)}</span>
                  )}
                </span>
                {result.type === 'win' && (
                  <span className={`num change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>{signed(change)}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="row">
          {canClaimWin && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
          {!me && onClose && (
            <button className="btn close-summary" onClick={onClose}>{tr('close')}</button>
          )}
          {wallCount > 0 && (
            <button className="btn remaining-btn" onClick={() => setShowWall(true)}>{tr('remainingTiles')}</button>
          )}
          {me && (
            // Next: back to the table (after the last hand: the final scores).
            <button className="btn primary big continue-btn" onClick={onContinue}>{tr('continue')}</button>
          )}
          {!me && view.spectatorsConfirm && (
            // All-CPU table: a spectator moves the game on to the next hand.
            <button className="btn primary big" onClick={() => (view.lastHand ? onContinue() : command({ type: 'confirmRound' }))}>
              {view.lastHand ? tr('continue') : tr('nextHand')}
            </button>
          )}
          {me && result.type === 'win' && result.isChicken && (
            <button className="btn" disabled={me.votedUndoWin} onClick={() => command({ type: 'undo' })}>
              {me.votedUndoWin ? tr('askedUndo') : tr('undoChickenWin')}
            </button>
          )}
        </div>
        {waitingFor.length > 0 && <p className="muted">{tr('waitingFor', { names: waitingFor.join(lang === 'zh' ? '、' : ', ') })}</p>}
      </div>
      {showWall && (
        // The tiles left in the wall, in the order they would have been drawn.
        <div className="overlay remaining-overlay" onClick={() => setShowWall(false)}>
          <div className="panel remaining-panel" role="dialog" aria-label={tr('remainingTiles')} onClick={(e) => e.stopPropagation()}>
            <div className="remaining-head">
              <h3>{tr('remainingTiles')}</h3>
              <span className="remaining-count">{wallCount}</span>
              <button className="panel-close" aria-label={tr('close')} onClick={() => setShowWall(false)}>×</button>
            </div>
            <div className="remaining-ends">
              <span className="remaining-start-label">▶ {tr('remainingStart')}</span>
              <span className="remaining-end-label">{tr('remainingEnd')} ◀</span>
            </div>
            <div className="remaining-tiles">
              {wall.map((st, i) => (
                <span
                  key={i}
                  className={`remaining-stack${i === 0 ? ' is-start' : ''}${i === wall.length - 1 ? ' is-end' : ''}`}
                >
                  {st.map((tile) => <TileView key={tile.id} type={tile.type} width="var(--result-w)" />)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
