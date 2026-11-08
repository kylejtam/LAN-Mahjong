/**
 * "Add to home screen" button for the join screen. It works out which
 * device and browser this is and shows only those steps. Hidden when the
 * game was already opened from the home screen.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from './i18n';
import type { Lang, StringKey } from './i18n';

type Kind = 'ios' | 'android' | 'samsung';

/** Was the game opened from a home-screen icon (full screen)? */
export function openedFromHomeScreen(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch {
    return false;
  }
}

function guessKind(): Kind | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Android/.test(ua)) return 'android';
  return null; // a laptop or desktop
}

const STEPS: Record<Kind, StringKey[]> = {
  ios: ['homeIos1', 'homeIos2', 'homeIos3'],
  android: ['homeAndroid1', 'homeAndroid2'],
  samsung: ['homeSamsung1', 'homeSamsung2'],
};
const KIND_LABEL: Record<Kind, StringKey> = { ios: 'homeKindIos', android: 'homeKindAndroid', samsung: 'homeKindSamsung' };

export function AddToHomeButton({ lang }: { lang: Lang }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(() => guessKind() ?? 'ios');
  if (openedFromHomeScreen()) return null;
  const tr = (k: StringKey): string => t(lang, k);
  return (
    <>
      <button className="btn add-home" onClick={() => setOpen(true)}>📲 {tr('addHome')}</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="panel add-home-panel" onClick={(e) => e.stopPropagation()}>
            <button className="panel-close" aria-label={tr('close')} onClick={() => setOpen(false)}>×</button>
            <h3>{tr('addHome')}</h3>
            <p className="muted">{tr('homeIntro')}</p>
            <div className="segmented">
              {(Object.keys(STEPS) as Kind[]).map((k) => (
                <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{tr(KIND_LABEL[k])}</button>
              ))}
            </div>
            <ol className="home-steps">
              {STEPS[kind].map((k) => <li key={k}>{tr(k)}</li>)}
              <li>{tr('homeAfter')}</li>
            </ol>
            {kind !== 'ios' && <p className="muted small">{tr('homeAndroidNote')}</p>}
            <button className="btn primary" onClick={() => setOpen(false)}>{tr('ok')}</button>
          </div>
        </div>
      )}
    </>
  );
}
