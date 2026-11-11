import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useConnection } from './net';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { LangContext, Prefs, cleanPrefs, loadPrefs, savePrefs, t, translateServerMessage } from './i18n';

export function App(): ReactElement {
  const conn = useConnection();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [toast, setToast] = useState<string | null>(null);

  /** Change language: remembered on this device and under your name on the server. */
  const setPrefs = (p: Prefs): void => {
    setPrefsState(p);
    savePrefs(p);
    if (conn.view) conn.send({ type: 'command', command: { type: 'setPrefs', prefs: { lang: p.lang, celebration: p.celebration, callAll: p.callAll } } });
  };

  // When you join (or log in on another device), your saved choices follow your name.
  const who = conn.view ? `${conn.view.id}/${conn.view.you.name.toLowerCase()}` : null;
  useEffect(() => {
    if (!conn.view) return;
    const fromServer = cleanPrefs(conn.view.you.prefs);
    if (fromServer.lang || fromServer.celebration || fromServer.callAll !== undefined) {
      const merged = { ...prefs, ...fromServer };
      setPrefsState(merged);
      savePrefs(merged);
    } else {
      conn.send({ type: 'command', command: { type: 'setPrefs', prefs: { lang: prefs.lang, celebration: prefs.celebration, callAll: prefs.callAll } } });
    }
    // Only when you join or change name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  useEffect(() => {
    if (!conn.error) return;
    setToast(translateServerMessage(prefs.lang, conn.error.message));
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.error]);

  return (
    <LangContext.Provider value={prefs.lang}>
      {conn.view ? (
        <Table view={conn.view} send={conn.send} onLeave={conn.leave} prefs={prefs} setPrefs={setPrefs} />
      ) : (
        <Lobby conn={conn} prefs={prefs} setPrefs={setPrefs} />
      )}
      {conn.view && conn.status !== 'open' && <div className="banner">{t(prefs.lang, 'reconnecting')}</div>}
      {conn.ended && (
        <div className="overlay" onClick={conn.dismissEnded}>
          <div className="panel">
            <h3>{t(prefs.lang, 'gameEndedByHost')}</h3>
            <button className="btn" onClick={conn.dismissEnded}>{t(prefs.lang, 'ok')}</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </LangContext.Provider>
  );
}
