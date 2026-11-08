/**
 * Start screen: type your display name, then join a game from the list.
 * (Games are created on the laptop's host page.)
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Connection } from './net';

const NAME_KEY = 'lan-mahjong-name';

export function Lobby({ conn }: { conn: Connection }): ReactElement {
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
      <h1>LAN Mahjong</h1>
      <label className="name-field">
        <span>Your name</span>
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Display name" autoComplete="nickname" />
      </label>
      <h2>Games</h2>
      {conn.status !== 'open' && <p className="muted">Connecting to the server…</p>}
      {conn.status === 'open' && conn.games.length === 0 && <p className="muted">No games yet. Create one on the host laptop.</p>}
      <ul className="game-list">
        {conn.games.map((g) => (
          <li key={g.id}>
            <div>
              <b>{g.name}</b>
              <span className="muted"> · {g.label.en}</span>
              <div className="muted small">{g.seats.map((s) => s ?? '—').join(' · ')}{g.spectators ? ` · ${g.spectators} watching` : ''}</div>
            </div>
            <button className="btn primary" disabled={!name.trim()} onClick={() => join(g.id)}>Join</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
