/**
 * The host page. Only opens on the laptop running the server.
 * Create games, and run them: CPU seats, settings, table colour, balances,
 * ending a game. It never shows anyone's hidden tiles.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { GameSettings } from '@lan-mahjong/shared';
import { DEFAULT_SETTINGS } from '@lan-mahjong/shared';
import type { HostMessage, ServerHostMessage } from '../../server/src/protocol';
import type { HostGameView } from '../../server/src/game/view';
import type { CpuDifficulty, TableColour } from '../../server/src/game/room';
import { WIND_NAMES } from './i18n';

const COLOURS: TableColour[] = ['green', 'black', 'white', 'red', 'blue'];

function useHostConnection() {
  const [games, setGames] = useState<HostGameView[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    let stopped = false;
    const connect = (): void => {
      const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/host-ws`);
      ws.current = s;
      s.onopen = () => setOpen(true);
      s.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerHostMessage;
        if (msg.type === 'hostState') {
          setGames(msg.games);
          setUrls(msg.urls);
        } else if (msg.type === 'error') {
          setError(msg.message);
          setTimeout(() => setError(null), 4000);
        }
      };
      s.onclose = () => {
        setOpen(false);
        if (!stopped) setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stopped = true;
      ws.current?.close();
    };
  }, []);
  const send = (m: HostMessage): void => ws.current?.send(JSON.stringify(m));
  return { games, urls, open, error, send };
}

export function HostApp(): ReactElement {
  const { games, urls, open, error, send } = useHostConnection();
  const [gameName, setGameName] = useState('');
  const [balance, setBalance] = useState(1000);
  return (
    <div className="host">
      <h1>LAN Mahjong · Host</h1>
      {!open && <p className="muted">Connecting to the server…</p>}
      <div className="host-top card">
        <img className="host-qr" src="/api/qr.svg" alt="QR code to join" />
        <div>
          <p>Players scan the code, or open this address on the same Wi-Fi:</p>
          {urls.length ? urls.map((u) => <div key={u} className="host-url">{u}</div>) : <div className="muted">No network address found</div>}
          <p className="muted small">To play on this laptop too, open that address in another tab and join like everyone else.</p>
        </div>
      </div>

      <div className="card">
        <h2>Create a game</h2>
        <div className="form-grid">
          <label htmlFor="gn">Game name</label>
          <input id="gn" value={gameName} maxLength={30} onChange={(e) => setGameName(e.target.value)} placeholder="e.g. Friday night" />
          <label htmlFor="sb">Starting balance</label>
          <input id="sb" type="number" min={0} value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn primary"
            disabled={!gameName.trim()}
            onClick={() => {
              send({ type: 'hostCreateGame', gameName, startingBalance: balance });
              setGameName('');
            }}
          >
            Create game
          </button>
        </div>
      </div>

      {games.map((g) => (
        <GameCard key={g.id} game={g} send={send} />
      ))}
      {error && <div className="toast">{error}</div>}
    </div>
  );
}

/** One person's chip count on the host page: type a number and press Set. */
function ChipRow({ name, balance, onSet }: { name: string; balance: number; onSet: (b: number) => void }): ReactElement {
  const [value, setValue] = useState(String(balance));
  useEffect(() => setValue(String(balance)), [balance]);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(n);
  const changed = valid && n !== balance;
  return (
    <form
      className="chip-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) onSet(n);
      }}
    >
      <span className="chip-name">{name}</span>
      <input type="number" step={1} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Chips for ${name}`} />
      <button className="btn primary" type="submit" disabled={!changed}>Set</button>
    </form>
  );
}

function GameCard({ game, send }: { game: HostGameView; send: (m: HostMessage) => void }): ReactElement {
  const cmd = (command: Extract<HostMessage, { type: 'hostCommand' }>['command']): void => send({ type: 'hostCommand', gameId: game.id, command });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(game.settings);
  const [startBal, setStartBal] = useState(game.startingBalance);
  useEffect(() => setSettings(game.settings), [JSON.stringify(game.settings)]);
  const between = game.phase === 'betweenRounds';
  const dealer = game.match.dealer;
  const phaseText = { betweenRounds: 'Between rounds', rolling: 'Rolling dice', playing: 'Playing', finished: 'Finished' }[game.phase];

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>
        {game.name} <span className="muted small">· {game.label.en} · {phaseText}{game.round ? ` · ${game.round.wallCount} tiles left` : ''}</span>
      </h2>
      <div className="host-seats">
        {game.seats.map((s) => (
          <div key={s.seat} className="host-seat">
            <b>
              {WIND_NAMES.en[(s.seat - dealer + 4) % 4]} seat{s.seat === dealer ? ' (dealer)' : ''}
            </b>
            <span>
              {s.name ?? (game.round && game.round.phase !== 'ended' ? <span className="offline">Empty – the game is waiting for this seat</span> : <span className="muted">Empty</span>)}
              {s.cpu ? ` · CPU (${s.cpu})` : ''}
              {s.name && !s.cpu && !s.connected ? <span className="offline"> · offline</span> : ''}
            </span>
            {s.balance !== null && <span className="chips">{s.balance} chips</span>}
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              {(['easy', 'medium', 'hard'] as CpuDifficulty[]).map((d) => (
                <button key={d} className="btn" onClick={() => cmd({ type: 'hostSetSeat', seat: s.seat, cpu: d })}>
                  {s.name && !s.cpu ? `Replace: ${d}` : `CPU ${d}`}
                </button>
              ))}
              {s.cpu && between && (
                <button className="btn" onClick={() => cmd({ type: 'hostSetSeat', seat: s.seat, cpu: null })}>Empty</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {game.spectators.length > 0 && (
        <p className="small">
          Watching / not seated: {game.spectators.map((p) => `${p.name}${p.connected ? '' : ' (offline)'}`).join(', ')}
        </p>
      )}

      <h3>Chips</h3>
      <p className="muted small">Type the correct number and press Set. It updates on every player's device straight away.</p>
      <div className="chips-editor">
        {[
          ...game.seats.filter((s) => s.name !== null).map((s) => ({ name: s.name!, balance: s.balance ?? 0, cpu: !!s.cpu })),
          ...game.spectators.map((p) => ({ name: p.name, balance: p.balance, cpu: false })),
        ].map((p) => (
          <ChipRow key={p.name} name={p.name} balance={p.balance} onSet={(balance) => cmd({ type: 'hostSetBalance', name: p.name, balance })} />
        ))}
      </div>

      <h3>Settings {between ? '' : <span className="muted small">(can change between rounds)</span>}</h3>
      <div className="form-grid">
        <label>Flower tiles</label>
        <select disabled={!between} value={settings.flowersOn ? 'on' : 'off'} onChange={(e) => setSettings({ ...settings, flowersOn: e.target.value === 'on' })}>
          <option value="on">On (144 tiles)</option>
          <option value="off">Off (136 tiles)</option>
        </select>
        <label>Minimum fan</label>
        <input disabled={!between} type="number" min={0} max={10} value={settings.minFan} onChange={(e) => setSettings({ ...settings, minFan: Number(e.target.value) })} />
        <label>Payout</label>
        <select disabled={!between} value={settings.payoutMode} onChange={(e) => setSettings({ ...settings, payoutMode: e.target.value as GameSettings['payoutMode'] })}>
          <option value="everyonePays">Everyone pays, discarder pays double</option>
          <option value="discarderPays">Only the discarder pays</option>
        </select>
        <label>After a draw</label>
        <select disabled={!between} value={settings.dealerAdvancesOnDraw ? 'advance' : 'stay'} onChange={(e) => setSettings({ ...settings, dealerAdvancesOnDraw: e.target.value === 'advance' })}>
          <option value="stay">Dealer stays</option>
          <option value="advance">Dealer moves on</option>
        </select>
        <label>Starting balance</label>
        <input disabled={!between} type="number" min={0} value={startBal} onChange={(e) => setStartBal(Number(e.target.value))} />
        <label>Table colour</label>
        <select value={game.tableColour} onChange={(e) => cmd({ type: 'hostSetTableColour', colour: e.target.value as TableColour })}>
          {COLOURS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!between} onClick={() => cmd({ type: 'hostUpdateSettings', settings, startingBalance: startBal })}>
          Save settings
        </button>
        <button className="btn" onClick={() => cmd({ type: 'hostResetBalances' })}>Reset all balances</button>
        <button
          className={`btn danger${confirmEnd ? ' primary' : ''}`}
          onClick={() => {
            if (confirmEnd) cmd({ type: 'hostEndGame' });
            else {
              setConfirmEnd(true);
              setTimeout(() => setConfirmEnd(false), 4000);
            }
          }}
        >
          {confirmEnd ? 'Tap again to end the game' : 'End game'}
        </button>
      </div>
    </div>
  );
}
