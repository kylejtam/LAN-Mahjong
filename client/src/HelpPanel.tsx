/** The Help button: the fan table and the fan → chips table. */
import type { ReactElement } from 'react';
import { CHIPS_TABLE, FAN_TABLE, MAX_FAN } from '@lan-mahjong/shared';
import type { Lang } from './i18n';

export function HelpPanel({ lang, onClose }: { lang: Lang; onClose: () => void }): ReactElement {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel help" onClick={(e) => e.stopPropagation()}>
        <div className="help-cols">
          <div>
            <h3>Fan table</h3>
            <table>
              <tbody>
                {FAN_TABLE.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.fan === MAX_FAN ? 'Max' : r.fan}{r.each ? ' each' : ''}</td>
                    <td>{lang === 'en' ? r.en : r.zh}</td>
                    <td className="zh">{r.zh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Fan → chips</h3>
            <table>
              <thead>
                <tr><th>Fan</th><th>Each pays</th><th>Discarder</th><th>Self-draw (each)</th></tr>
              </thead>
              <tbody>
                {CHIPS_TABLE.map((r) => (
                  <tr key={r.fan}>
                    <td className="num">{r.label}</td>
                    <td className="num">{r.base}</td>
                    <td className="num">{r.base * 2}</td>
                    <td className="num">{r.base * 2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Max = {MAX_FAN} fan. Below the minimum fan is a chicken win: the winner pays 32 to each other player.</p>
          </div>
        </div>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
