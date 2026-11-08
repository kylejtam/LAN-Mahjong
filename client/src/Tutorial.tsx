/**
 * Controls tutorial: a few short cards, each with a small moving picture.
 * Shown by itself the first time someone sits down on this device, and
 * again from the Help (?) panel.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { TileType } from '@lan-mahjong/shared';
import { ACTION_LABELS, t } from './i18n';
import type { Lang, StringKey } from './i18n';
import { TileView } from './TileFace';

const SEEN_KEY = 'lan-mahjong-tutorial-seen';

/** Has this device already seen the tutorial? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // can't remember: don't keep showing it
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

type Card = 'draw' | 'discard' | 'reorder' | 'claim' | 'win' | 'undo' | 'help';
const CARDS: Card[] = ['draw', 'discard', 'reorder', 'claim', 'win', 'undo', 'help'];

const HAND: TileType[] = ['m2', 'm3', 'p5', 'p6', 's7', 'wE', 'dR'];
const TW = '1.6em'; // tile width in the pictures

/** The little table picture for each card. */
function Scene({ card, lang }: { card: Card; lang: Lang }): ReactElement {
  const labels = ACTION_LABELS[lang];
  const hand = (
    <div className="tut-hand">
      {HAND.map((type, i) => (
        <TileView key={i} type={type} width={TW} className={card === 'discard' && i === 4 ? 'tut-move-discard' : card === 'reorder' && i === 1 ? 'tut-move-reorder' : undefined} />
      ))}
    </div>
  );
  return (
    <div className={`tut-scene tut-${card}`} aria-hidden="true">
      <div className="tut-pond" />
      {(card === 'draw' || card === 'discard' || card === 'reorder' || card === 'claim' || card === 'win') && hand}
      {card === 'draw' && <TileView type="p7" width={TW} className="tut-drawn" highlight />}
      {card === 'claim' && (
        <>
          <div className="tut-take"><TileView type="m4" width="2.2em" highlight /><span>{t(lang, 'take')}</span></div>
          <div className="tut-buttons">
            <span className="act act-chow">{labels.chow}</span>
            <span className="act act-pong">{labels.pong}</span>
            <span className="act act-gong">{labels.gong}</span>
          </div>
        </>
      )}
      {card === 'win' && (
        <div className="tut-buttons">
          <span className="act act-win">{labels.win}</span>
        </div>
      )}
      {card === 'undo' && (
        <div className="tut-topbar">
          <span className="btn tut-undo">↶ {t(lang, 'undo')}</span>
        </div>
      )}
      {card === 'help' && (
        <div className="tut-topbar tut-right">
          <span className="btn icon tut-help">?</span>
          <span className="btn icon tut-gear">⚙</span>
        </div>
      )}
      <div className="tut-finger" />
    </div>
  );
}

export function Tutorial({ lang, onClose }: { lang: Lang; onClose: () => void }): ReactElement {
  const [i, setI] = useState(0);
  const tr = (k: StringKey, v?: Record<string, string | number>): string => t(lang, k, v);
  const labels = ACTION_LABELS[lang];
  const card = CARDS[i]!;
  const close = (): void => {
    markSeen();
    onClose();
  };
  const last = i === CARDS.length - 1;
  return (
    <div className="overlay tut-overlay">
      <div className="panel tut-panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" aria-label={tr('close')} onClick={close}>×</button>
        <div className="tut-step">{tr('tutStep', { n: i + 1, of: CARDS.length })}</div>
        <Scene key={card} card={card} lang={lang} />
        <h3>{tr(`tut_${card}_title` as StringKey)}</h3>
        <p className="tut-text">{tr(`tut_${card}_text` as StringKey, labels)}</p>
        <div className="tut-dots">
          {CARDS.map((c, n) => (
            <button key={c} className={n === i ? 'on' : ''} aria-label={String(n + 1)} onClick={() => setI(n)} />
          ))}
        </div>
        <div className="tut-nav">
          {i > 0 ? <button className="btn" onClick={() => setI(i - 1)}>{tr('tutBack')}</button> : <button className="btn" onClick={close}>{tr('tutSkip')}</button>}
          <button className="btn primary" onClick={() => (last ? close() : setI(i + 1))}>{last ? tr('tutDone') : tr('tutNext')}</button>
        </div>
      </div>
    </div>
  );
}
