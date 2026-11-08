/**
 * End of a round: who won, the fan, the scoring items, the payments and every
 * hand. Everyone presses Confirm before the next round. (Phase 6 adds manual
 * adjustments and more detail.)
 */
import type { ReactElement } from 'react';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView } from '../../server/src/game/view';
import { TileView } from './TileFace';

interface Props {
  view: RoomView;
  command: (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;
  canClaimWin: boolean;
  onWin: () => void;
  winLabel: string;
}

export function ResultPanel({ view, command, canClaimWin, onWin, winLabel }: Props): ReactElement {
  if (view.phase === 'finished') {
    const ranked = [...view.seats].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
    return (
      <div className="overlay">
        <div className="panel">
          <h3>Game finished</h3>
          <table>
            <tbody>
              {ranked.map((s) => (
                <tr key={s.seat}><td>{s.name}</td><td className="num">{s.balance}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const result = view.round?.result;
  if (!result) return <></>;
  const me = view.you.seat !== null ? view.seats[view.you.seat] : null;
  const waitingFor = view.seats.filter((s) => s.name && !s.cpu && !s.confirmed).map((s) => s.name);
  return (
    <div className="overlay">
      <div className="panel result">
        {result.type === 'draw' ? (
          <h3>Draw – the wall is empty</h3>
        ) : (
          <>
            <h3>
              {view.seats[result.winner]?.name} wins {result.discarder === null ? 'by self-draw' : `on ${view.seats[result.discarder]?.name}'s discard`}
              {result.isChicken ? ' (chicken win)' : ''}
            </h3>
            <p className="fan-total">{result.fan} fan{result.capHand ? ' (max)' : ''}</p>
            <ul className="fan-items">
              {result.items.map((i) => (
                <li key={i.id}><span>{i.en}</span><span className="zh">{i.zh}</span><span className="num">{i.fan}</span></li>
              ))}
            </ul>
          </>
        )}
        <div className="result-hands">
          {view.seats.map((s) => (
            <div key={s.seat} className="result-row">
              <span className="result-name">{s.name}</span>
              <span className="result-tiles">
                {(s.hand ?? []).map((t) => <TileView key={t.id} type={t.type} width="1.6rem" />)}
                {s.melds.map((m, i) => (
                  <span key={i} className="meld">{m.tiles.map((t) => <TileView key={t.id} type={t.type} width="1.6rem" />)}</span>
                ))}
              </span>
              {result.type === 'win' && (
                <span className={`num change ${result.changes[s.seat]! > 0 ? 'up' : result.changes[s.seat]! < 0 ? 'down' : ''}`}>
                  {result.changes[s.seat]! > 0 ? '+' : ''}{result.changes[s.seat]}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          {canClaimWin && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
          {me && (
            <button className="btn primary big" disabled={me.confirmed} onClick={() => command({ type: 'confirmRound' })}>
              {me.confirmed ? 'Waiting…' : 'Confirm'}
            </button>
          )}
          {me && result.type === 'win' && (
            <button className="btn" disabled={me.votedUndoWin} onClick={() => command({ type: 'undo' })}>
              {me.votedUndoWin ? 'Asked to undo' : 'Undo win'}
            </button>
          )}
        </div>
        {waitingFor.length > 0 && <p className="muted">Waiting for: {waitingFor.join(', ')}</p>}
      </div>
    </div>
  );
}
