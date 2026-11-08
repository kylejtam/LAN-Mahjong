/** The Help button: the fan table and the fan → chips table. */
import type { ReactElement } from 'react';
import { CHIPS_TABLE, FAN_TABLE, MAX_FAN } from '@lan-mahjong/shared';
import { t } from './i18n';
import type { Lang } from './i18n';

export function HelpPanel({ lang, onClose, onTutorial }: { lang: Lang; onClose: () => void; onTutorial?: () => void }): ReactElement {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>): string => t(lang, k, v);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel help" onClick={(e) => e.stopPropagation()}>
        <div className="help-cols">
          <div>
            <h3>{tr('fanTable')}</h3>
            <table>
              <tbody>
                {FAN_TABLE.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.fan === MAX_FAN ? tr('max') : r.fan}{r.each ? tr('each') : ''}</td>
                    <td className={lang === 'zh' ? 'zh' : ''}>{lang === 'en' ? r.en : r.zh}</td>
                    {lang === 'en' && <td className="zh">{r.zh}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>{tr('fanToChips')}</h3>
            <table>
              <thead>
                <tr><th>{tr('colFan')}</th><th>{tr('colEachPays')}</th><th>{tr('colDiscarder')}</th><th>{tr('colSelfDraw')}</th></tr>
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
            <p className="muted">{tr('helpNote', { n: MAX_FAN })}</p>
          </div>
        </div>
        <div className="help-buttons">
          {onTutorial && <button className="btn" onClick={onTutorial}>{tr('tutorial')}</button>}
          <button className="btn" onClick={onClose}>{tr('close')}</button>
        </div>
      </div>
    </div>
  );
}
