import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useConnection } from './net';
import { Lobby } from './Lobby';
import { Table } from './Table';

export function App(): ReactElement {
  const conn = useConnection();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!conn.error) return;
    setToast(conn.error.message);
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [conn.error]);

  return (
    <>
      {conn.view ? <Table view={conn.view} send={conn.send} onLeave={conn.leave} /> : <Lobby conn={conn} />}
      {conn.view && conn.status !== 'open' && <div className="banner">Reconnecting…</div>}
      {conn.ended && (
        <div className="overlay" onClick={conn.dismissEnded}>
          <div className="panel"><h3>The game was ended by the host.</h3><button className="btn" onClick={conn.dismissEnded}>OK</button></div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
