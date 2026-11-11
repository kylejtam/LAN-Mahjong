/**
 * Start screen: type your display name, then join a game from the list.
 * (Games are created on the laptop's host page.) Language and theme can be
 * chosen here too.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Connection } from './net';
import { Prefs, t } from './i18n';
import { Logo } from './Logo';
import { APP_VERSION } from './version';

const NAME_KEY = 'lan-mahjong-name';

export function Lobby({ conn, prefs, setPrefs }: { conn: Connection; prefs: Prefs; setPrefs: (p: Prefs) => void }): ReactElement {
  const lang = prefs.lang;
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const join = (gameId: string): void => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* ignore */
    }
    conn.join(gameId, name);
  };
  return (
    <div className="lobby">
      <div className="lobby-head">
        <h1 className="title-with-logo">
          <Logo size="2.6rem" />
          {t(lang, 'appName')}
        </h1>
        <div className="segmented">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'en' })}>English</button>
          <button className={lang === 'zh' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, lang: 'zh' })}>中文</button>
        </div>
      </div>
      <label className="name-field">
        <span>{t(lang, 'yourName')}</span>
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={t(lang, 'displayName')} autoComplete="nickname" />
      </label>
      <h2>{t(lang, 'games')}</h2>
      {conn.status !== 'open' && <p className="muted">{t(lang, 'connecting')}</p>}
      {conn.status === 'open' && conn.games.length === 0 && <p className="muted">{t(lang, 'noGames')}</p>}
      <ul className="game-list">
        {/* Always here, even before the host has made a game: learn the controls. */}
        {conn.status === 'open' && (
          <li>
            <div>
              <b>{t(lang, 'tutorial')}</b>
              <div className="muted small">{t(lang, 'tutorialAbout')}</div>
            </div>
            <button className="btn primary" onClick={() => conn.startTutorial(name.trim())}>{t(lang, 'start')}</button>
          </li>
        )}
        {conn.games.map((g) => (
          <li key={g.id}>
            <div>
              <b>{g.name}</b>
              <span className="muted"> · {g.label[lang]}</span>
              <div className="muted small">
                {g.seats.map((s) => s ?? '—').join(' · ')}
                {g.spectators ? ` · ${t(lang, 'watchingCount', { n: g.spectators })}` : ''}
              </div>
            </div>
            <button className="btn primary" disabled={!name.trim()} onClick={() => join(g.id)}>{t(lang, 'join')}</button>
          </li>
        ))}
      </ul>
      <p className="muted small app-version">LAN Mahjong v{APP_VERSION}</p>
    </div>
  );
}
