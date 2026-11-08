/**
 * End of a round (the win summary): who won, every winning condition with its
 * fan, every player's hand with flowers, each player's chips won (+) or lost
 * (−), and the total chips transferred. Everyone presses Confirm before the
 * next round. (Chips can only be changed by hand on the laptop's host page.)
 */
import type { ReactElement } from 'react';
import type { ClientMessage } from '../../server/src/protocol';
import type { RoomView } from '../../server/src/game/view';
import { TileView } from './TileFace';
import { Lang, personName, t } from './i18n';

interface Props {
  view: RoomView;
  lang: Lang;
  command: (c: Extract<ClientMessage, { type: 'command' }>['command']) => void;
  canClaimWin: boolean;
  onWin: () => void;
  winLabel: string;
}

export function ResultPanel({ view, lang, command, canClaimWin, onWin, winLabel }: Props): ReactElement {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>): string => t(lang, k, v);
  if (view.phase === 'finished') {
    const ranked = [...view.seats].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
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
  if (!result) return <></>;
  const me = view.you.seat !== null ? view.seats[view.you.seat] : null;
  const waitingFor = view.seats.filter((s) => s.name && !s.cpu && !s.confirmed).map((s) => personName(s.name, lang));
  /** Chips with a clear sign: +48, −16 (a real minus sign), or 0. */
  const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const transferred = result.type === 'win' ? result.changes.filter((c) => c > 0).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="overlay">
      <div className="panel result">
        {result.type === 'draw' ? (
          <h3>{tr('drawWallEmpty')}</h3>
        ) : (
          <>
            <h3>
              {result.discarder === null
                ? tr('winsSelfDraw', { name: personName(view.seats[result.winner]?.name, lang) })
                : tr('winsOnDiscard', { name: personName(view.seats[result.winner]?.name, lang), from: personName(view.seats[result.discarder]?.name, lang) })}
              {result.isChicken ? tr('chickenWin') : ''}
            </h3>
            <h4 className="result-subhead">{tr('winningConditions')}</h4>
            <ul className="fan-items">
              {result.items.map((i) => (
                <li key={i.id}>
                  <span className={lang === 'zh' ? 'zh' : ''}>{lang === 'zh' ? i.zh : i.en}</span>
                  {lang === 'en' && <span className="zh">{i.zh}</span>}
                  <span className="num">{tr('fan', { n: i.fan })}</span>
                </li>
              ))}
              {result.items.length === 0 && <li><span className="muted">{tr('noConditions')}</span></li>}
              <li className="fan-total-row">
                <span>{tr('totalFan')}</span>
                {lang === 'en' && <span />}
                <span className="num">{tr('fan', { n: result.fan })}{result.capHand ? tr('maxFan') : ''}</span>
              </li>
            </ul>
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
                <span className="result-name">{personName(s.name, lang)}</span>
                <span className="result-tiles">
                  {(s.hand ?? []).map((t) => <TileView key={t.id} type={t.type} width="1.6rem" />)}
                  {s.melds.map((m, i) => (
                    <span key={i} className="meld">{m.tiles.map((t) => <TileView key={t.id} type={t.type} width="1.6rem" />)}</span>
                  ))}
                  {s.flowers.length > 0 && (
                    <span className="meld flowers">{s.flowers.map((t) => <TileView key={t.id} type={t.type} width="1.6rem" />)}</span>
                  )}
                </span>
                {result.type === 'win' && (
                  <span className={`num change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>{signed(change)}</span>
                )}
              </div>
            );
          })}
        </div>
        {result.type === 'win' && <p className="transferred">{tr('totalTransferred', { n: transferred })}</p>}
        <div className="row">
          {canClaimWin && <button className="act act-win" onClick={onWin}>{winLabel}</button>}
          {me && (
            <button className="btn primary big" disabled={me.confirmed} onClick={() => command({ type: 'confirmRound' })}>
              {me.confirmed ? tr('waiting') : tr('confirm')}
            </button>
          )}
          {!me && view.spectatorsConfirm && (
            // All-CPU table: a spectator moves the game on to the next hand.
            <button className="btn primary big" onClick={() => command({ type: 'confirmRound' })}>
              {tr('nextHand')}
            </button>
          )}
          {me && result.type === 'win' && (
            <button className="btn" disabled={me.votedUndoWin} onClick={() => command({ type: 'undo' })}>
              {me.votedUndoWin ? tr('askedUndo') : tr('undoWin')}
            </button>
          )}
        </div>
        {waitingFor.length > 0 && <p className="muted">{tr('waitingFor', { names: waitingFor.join(lang === 'zh' ? '、' : ', ') })}</p>}
      </div>
    </div>
  );
}
