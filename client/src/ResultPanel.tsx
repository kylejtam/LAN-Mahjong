/**
 * End of a round: who won, the fan, the scoring items, the payments and every
 * hand. Everyone presses Confirm before the next round. (Phase 6 adds manual
 * adjustments and more detail.)
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
  const waitingFor = view.seats.filter((s) => s.name && !s.cpu && !s.confirmed).map((s) => s.name);
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
            <p className="fan-total">{tr('fan', { n: result.fan })}{result.capHand ? tr('maxFan') : ''}</p>
            <ul className="fan-items">
              {result.items.map((i) => (
                <li key={i.id}>
                  <span className={lang === 'zh' ? 'zh' : ''}>{lang === 'zh' ? i.zh : i.en}</span>
                  {lang === 'en' && <span className="zh">{i.zh}</span>}
                  <span className="num">{i.fan}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="result-hands">
          {view.seats.map((s) => (
            <div key={s.seat} className="result-row">
              <span className="result-name">{personName(s.name, lang)}</span>
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
              {me.confirmed ? tr('waiting') : tr('confirm')}
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
