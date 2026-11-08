/**
 * The live connection to the game server (a WebSocket).
 *
 * - Shows the game list on the start screen.
 * - Remembers which game and name you joined, so if the connection drops or
 *   the page reloads, it joins again automatically (same name = same seat).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameListEntry, ServerMessage } from '../../server/src/protocol';
import type { RoomView } from '../../server/src/game/view';

const SESSION_KEY = 'lan-mahjong-session';

interface Session {
  gameId: string;
  name: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage may be blocked; auto-rejoin just won't work */
  }
}

export interface Connection {
  status: 'connecting' | 'open' | 'closed';
  games: GameListEntry[];
  view: RoomView | null;
  error: { message: string; at: number } | null;
  /** Shown after the game was ended from the host page. */
  ended: boolean;
  send: (msg: ClientMessage) => void;
  join: (gameId: string, name: string) => void;
  leave: () => void;
  dismissEnded: () => void;
}

export function useConnection(): Connection {
  const [status, setStatus] = useState<Connection['status']>('connecting');
  const [games, setGames] = useState<GameListEntry[]>([]);
  const [view, setViewState] = useState<RoomView | null>(null);
  // The message handler needs the latest view, so keep it in a ref too.
  const viewRef = useRef<RoomView | null>(null);
  const setView = useCallback((v: RoomView | null) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const [error, setError] = useState<Connection['error']>(null);
  const [ended, setEnded] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const session = useRef<Session | null>(loadSession());
  const rejoinTries = useRef(0);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    let lastMessageAt = Date.now();
    const connect = (): void => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      lastMessageAt = Date.now();
      setStatus('connecting');
      ws.onopen = () => {
        setStatus('open');
        const s = session.current;
        if (s) ws.send(JSON.stringify({ type: 'joinGame', gameId: s.gameId, name: s.name }));
      };
      ws.onmessage = (e) => {
        lastMessageAt = Date.now();
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        switch (msg.type) {
          case 'games':
            setGames(msg.games);
            break;
          case 'joined':
            session.current = { gameId: msg.gameId, name: msg.name };
            saveSession(session.current);
            rejoinTries.current = 0;
            break;
          case 'state':
            setView(msg.view);
            // After a name change, rejoin later with the new name.
            if (session.current && session.current.name !== msg.view.you.name) {
              session.current = { gameId: msg.view.id, name: msg.view.you.name };
              saveSession(session.current);
            }
            break;
          case 'gameEnded':
            session.current = null;
            saveSession(null);
            setView(null);
            setEnded(true);
            break;
          case 'error':
            if (!viewRef.current && session.current && /already in use/.test(msg.message) && rejoinTries.current < 5) {
              // The old connection may not have closed yet: try again shortly.
              rejoinTries.current++;
              const s = session.current;
              setTimeout(() => send({ type: 'joinGame', gameId: s.gameId, name: s.name }), 1500);
              break;
            }
            if (/no longer exists/.test(msg.message)) {
              session.current = null;
              saveSession(null);
              setView(null);
            }
            setError({ message: msg.message, at: Date.now() });
            break;
        }
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!stopped) retry = setTimeout(connect, 1500);
      };
    };
    /** Throw away a connection that has gone quiet and open a fresh one. */
    const reconnectNow = (): void => {
      const old = wsRef.current;
      if (old) {
        old.onclose = null;
        old.close();
      }
      if (retry) clearTimeout(retry);
      connect();
    };
    /**
     * Phones (especially iPhones) can freeze a page's connection while it is in
     * the background (e.g. while scanning the QR code with the camera) without
     * telling the page. So: every 10 s ask for the game list (keeps it fresh and
     * proves the connection works), and if nothing arrives for 25 s, reconnect.
     */
    const heartbeat = setInterval(() => {
      const ws = wsRef.current;
      if (Date.now() - lastMessageAt > 25000) reconnectNow();
      else if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'listGames' }));
    }, 10000);
    /** When the page comes back into view, check the connection straight away. */
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || Date.now() - lastMessageAt > 12000) reconnectNow();
      else ws.send(JSON.stringify({ type: 'listGames' }));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onVisible);
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onVisible);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback(
    (gameId: string, name: string) => {
      session.current = null;
      send({ type: 'joinGame', gameId, name });
    },
    [send],
  );

  const leave = useCallback(() => {
    send({ type: 'leaveGame' });
    session.current = null;
    saveSession(null);
    setView(null);
  }, [send, setView]);

  return { status, games, view, error, ended, send, join, leave, dismissEnded: () => setEnded(false) };
}
