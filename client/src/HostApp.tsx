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
import { APP_VERSION } from './version';

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
  const [balance, setBalance] = useState(200);
  return (
    <div className="host">
      <h1 className="host-title">
        LAN Mahjong · Host <span className="version-badge">Version {APP_VERSION}</span>
      </h1>
      {!open && <p className="muted">Connecting to the server…</p>}
      <div className="host-top card">
        <img className="host-qr" src="/api/qr.svg" alt="QR code to join" />
        <div>
          <p>Players scan the code, or open this address on the same Wi-Fi:</p>
          {urls.length ? urls.map((u) => <div key={u} className="host-url">{u}</div>) : <div className="muted">No network address found</div>}
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            {/* Opens the player screen in a new tab, so this computer can play too. */}
            <a className="btn primary" href="/" target="_blank" rel="noopener">Play on this computer</a>
          </div>
          <p className="muted small">Opens the player screen in a new tab. Join a game there like everyone else.</p>
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

/** Name a CPU. "(CPU)" is always added after the name; an empty name goes back to the level (e.g. "Hard (CPU)"). */
function CpuNameRow({ name, onSet }: { name: string; onSet: (name: string) => void }): ReactElement {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const changed = value.trim() !== name;
  return (
    <form
      className="cpu-name-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) onSet(value.trim());
      }}
    >
      <span className="chip-name">Name</span>
      <input value={value} maxLength={20} placeholder="e.g. Auntie May" onChange={(e) => setValue(e.target.value)} aria-label="CPU name" />
      <span className="muted small">(CPU)</span>
      <button className="btn primary" type="submit" disabled={!changed}>Set</button>
    </form>
  );
}

/** Seconds every CPU waits before each move (all levels). Type a number and press Set. */
function CpuSecondsField({ seconds, onSet }: { seconds: number; onSet: (s: number) => void }): ReactElement {
  const [value, setValue] = useState(String(seconds));
  useEffect(() => setValue(String(seconds)), [seconds]);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0.2 && n <= 30;
  return (
    <form
      className="cpu-seconds"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && n !== seconds) onSet(n);
      }}
    >
      <input type="number" min={0.2} max={30} step={0.1} value={value} onChange={(e) => setValue(e.target.value)} aria-label="CPU seconds per move" />
      <span className="muted small">seconds per move (0.2–30, same for every level)</span>
      <button className="btn primary" type="submit" disabled={!valid || n === seconds}>Set</button>
    </form>
  );
}

/**
 * One person's chips on the host page: type a number and press Set, then tap
 * again to confirm (like ending the game).
 */
function ChipRow({ name, balance, onSet, label }: { name: string; balance: number; onSet: (b: number) => void; label?: string }): ReactElement {
  const [value, setValue] = useState(String(balance));
  const [armed, setArmed] = useState(false);
  useEffect(() => setValue(String(balance)), [balance]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(n);
  const changed = valid && n !== balance;
  return (
    <form
      className="chip-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        if (armed) {
          setArmed(false);
          onSet(n);
        } else setArmed(true);
      }}
    >
      <span className="chip-name">{label ?? name}</span>
      <input type="number" step={1} value={value} onChange={(e) => { setValue(e.target.value); setArmed(false); }} aria-label={`Chips for ${name}`} />
      <button className={`btn ${armed ? 'danger' : 'primary'}`} type="submit" disabled={!changed}>
        {armed ? 'Tap again to set' : 'Set'}
      </button>
    </form>
  );
}

/** A button that needs two taps: the first turns it into "Tap again to …". */
function TwoTapButton({ label, confirmLabel, onConfirm, className = '' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }): ReactElement {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`btn ${className}${armed ? ' danger' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Change the current game, and the list of finished games with "roll back". */
function PositionAndHistory({ game, cmd }: { game: HostGameView; cmd: (c: Extract<HostMessage, { type: 'hostCommand' }>['command']) => void }): ReactElement {
  const [wind, setWind] = useState(game.match.roundWind);
  const [num, setNum] = useState(game.match.dealerIndex + 1);
  useEffect(() => {
    setWind(game.match.roundWind);
    setNum(game.match.dealerIndex + 1);
  }, [game.match.roundWind, game.match.dealerIndex]);
  const inRound = game.phase === 'playing' || game.phase === 'rolling';
  return (
    <>
      <h3>Current game</h3>
      <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
        <span>Now: <b>{game.label.en}</b></span>
        <span className="muted">→ change to</span>
        <select value={wind} onChange={(e) => setWind(Number(e.target.value))} aria-label="Wind">
          {WIND_NAMES.en.map((w, i) => <option key={w} value={i}>{w}</option>)}
        </select>
        <select value={num} onChange={(e) => setNum(Number(e.target.value))} aria-label="Game number">
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>game {n}</option>)}
        </select>
        <TwoTapButton
          label="Go"
          confirmLabel={inRound ? 'Tap again (ends this round)' : 'Tap again to change'}
          onConfirm={() => cmd({ type: 'hostSetPosition', roundWind: wind, gameNumber: num })}
        />
      </div>
      <p className="muted small">Chips are not changed. Any round being played is cancelled.</p>

      <details className="collapsible history-section">
      <summary><h3>History ({game.history.length} {game.history.length === 1 ? 'game' : 'games'})</h3></summary>
      {game.history.length === 0 ? (
        <p className="muted small">No games finished yet.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>#</th><th>Game</th><th>Result</th>
              {game.seats.map((s) => <th key={s.seat} className="num">{s.name ?? `Seat ${s.seat + 1}`}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {[...game.history].reverse().map((h) => (
              <tr key={h.index}>
                <td className="num">{h.index + 1}</td>
                <td>{h.label.en}</td>
                <td>
                  {h.result.type === 'draw'
                    ? 'Draw'
                    : `${h.result.winner} won ${h.result.fan} fan ${h.result.discarder ? `on ${h.result.discarder}'s discard` : 'by self-draw'}${h.result.isChicken ? ' (chicken)' : ''}`}
                </td>
                {h.seatChanges.map((change, seat) => {
                  // Winner green; discarder red; on a self-draw every loser is red.
                  const cls =
                    h.result.type !== 'win' ? ''
                      : seat === h.winnerSeat ? 'cell-win'
                      : h.discarderSeat !== null ? (seat === h.discarderSeat ? 'cell-lose' : '')
                      : change < 0 ? 'cell-lose' : '';
                  const who = h.seatNames[seat];
                  const current = game.seats[seat]?.name;
                  return (
                    <td key={seat} className={`num ${cls}`}>
                      {change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : '0'}
                      {who && who !== current && <div className="muted small">{who}</div>}
                    </td>
                  );
                })}
                <td>
                  <TwoTapButton
                    label="Roll back to before this"
                    confirmLabel="Tap again to roll back"
                    onConfirm={() => cmd({ type: 'hostRollBack', toHand: h.index })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">Rolling back puts everyone's chips, the wind and the dealer back to just before that game, and removes the games after it.</p>
      </details>
    </>
  );
}

function GameCard({ game, send }: { game: HostGameView; send: (m: HostMessage) => void }): ReactElement {
  const cmd = (command: Extract<HostMessage, { type: 'hostCommand' }>['command']): void => send({ type: 'hostCommand', gameId: game.id, command });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(game.settings);
  const [startBal, setStartBal] = useState(game.startingBalance);
  useEffect(() => setSettings(game.settings), [JSON.stringify(game.settings)]);
  const between = game.phase === 'betweenRounds';
  // A hand being played (or its dice roll) can be stopped; a finished hand (win summary) can't.
  const inHand = game.phase === 'rolling' || (game.phase === 'playing' && !!game.round && game.round.phase !== 'ended');
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

              {s.name && !s.cpu && !s.connected ? <span className="offline"> · offline</span> : ''}
            </span>
            {s.cpu && (
              <CpuNameRow name={s.cpuName ?? ''} onSet={(name) => cmd({ type: 'hostNameCpu', seat: s.seat, name })} />
            )}
            {s.name && s.balance !== null && (
              <ChipRow label="Chips" name={s.name} balance={s.balance} onSet={(balance) => cmd({ type: 'hostSetBalance', name: s.name!, key: s.key ?? undefined, balance })} />
            )}
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              {(['easy', 'medium', 'hard'] as CpuDifficulty[]).map((d) => (
                <button key={d} className="btn" onClick={() => cmd({ type: 'hostSetSeat', seat: s.seat, cpu: d })}>
                  {s.name && !s.cpu ? `Replace: ${d}` : `CPU ${d}`}
                </button>
              ))}
              {s.name && (
                // Empty the seat so someone else can sit there (mid-round, the game waits for them).
                // A removed player becomes a spectator and keeps their chips.
                <button className="btn danger" onClick={() => cmd({ type: 'hostSetSeat', seat: s.seat, cpu: null })}>
                  {s.cpu ? 'Remove CPU' : 'Remove player'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {game.spectators.length > 0 && (
        <>
          <h3>Watching / not seated</h3>
          <div className="chips-editor">
            {game.spectators.map((p) => (
              <ChipRow
                key={p.name}
                name={p.name}
                label={`${p.name}${p.connected ? '' : ' (offline)'}`}
                balance={p.balance}
                onSet={(balance) => cmd({ type: 'hostSetBalance', name: p.name, key: p.key, balance })}
              />
            ))}
          </div>
        </>
      )}
      <p className="muted small">Chips: type the correct number, press Set, then tap again. It updates on every player's device straight away.</p>

      <PositionAndHistory game={game} cmd={cmd} />

      <h3>Settings {between ? '' : <span className="muted small">(can change between rounds{inHand ? ', or stop this hand first' : ''})</span>}</h3>
      {inHand && (
        <div className="stop-hand">
          <TwoTapButton label="Stop this hand" confirmLabel="Tap again to stop this hand" onConfirm={() => cmd({ type: 'hostStopRound' })} />
          <span className="muted small">
            Nobody pays and chips stay as they are. Then change the settings and press Save; when everyone presses Start, the same game is dealt again.
          </span>
        </div>
      )}
      <div className="form-grid">
        <label>Flower tiles</label>
        <select disabled={!between} value={settings.flowersOn ? 'on' : 'off'} onChange={(e) => setSettings({ ...settings, flowersOn: e.target.value === 'on' })}>
          <option value="on">On (144 tiles)</option>
          <option value="off">Off (136 tiles)</option>
        </select>
        <label>Minimum fan</label>
        <select disabled={!between} value={settings.minFan} onChange={(e) => setSettings({ ...settings, minFan: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} fan</option>)}
          {settings.minFan > 3 && <option value={settings.minFan}>{settings.minFan} fan (old setting, choose 0-3)</option>}
        </select>
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
        <label>Liability 包</label>
        <select disabled={!between} value={settings.liabilityOn ? 'on' : 'off'} onChange={(e) => setSettings({ ...settings, liabilityOn: e.target.value === 'on' })}>
          <option value="off">Off</option>
          <option value="on">On: feeding a one-suit hand pays for everyone</option>
        </select>
        <label>Starting balance</label>
        <input disabled={!between} type="number" min={0} value={startBal} onChange={(e) => setStartBal(Number(e.target.value))} />
        <label>CPU time per move</label>
        <CpuSecondsField seconds={game.cpuSeconds} onSet={(seconds) => cmd({ type: 'hostSetCpuSeconds', seconds })} />
        <label>Table colour</label>
        <select value={game.tableColour} onChange={(e) => cmd({ type: 'hostSetTableColour', colour: e.target.value as TableColour })}>
          {COLOURS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>
      {settings.liabilityOn && (
        <p className="muted small">
          Liability 包: once a player has 3 face-up sets all of one suit (9 tiles showing), the first player to discard a tile of that suit
          which they then use (for a set or the win) is liable. If that player then wins with a one-suit hand (清一色), the liable player pays
          the whole amount and the others pay nothing. Not for chicken wins.
        </p>
      )}
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
