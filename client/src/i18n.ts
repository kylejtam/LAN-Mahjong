/**
 * Words shown on screen. English for now; Traditional Chinese is added in
 * phase 5 (each player chooses on their own device).
 */
export type Lang = 'en' | 'zh';

/** The 4 action buttons: pinyin in English, characters in Chinese. */
export const ACTION_LABELS: Record<Lang, { chow: string; pong: string; gong: string; win: string }> = {
  en: { chow: 'Shàng', pong: 'Pèng', gong: 'Gàng', win: 'Hú' },
  zh: { chow: '上', pong: '碰', gong: '槓', win: '胡' },
};

export const WIND_NAMES: Record<Lang, string[]> = {
  en: ['East', 'South', 'West', 'North'],
  zh: ['東', '南', '西', '北'],
};
export const WIND_CHARS = ['東', '南', '西', '北'];
