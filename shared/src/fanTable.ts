/**
 * The fan table, as data, for the Help screen. The scoring code and this
 * list must agree; a test checks that.
 */
import { FAN_TO_BASE, MAX_FAN } from './payout.js';

export interface FanTableRow {
  id: string;
  /** Fan value. MAX_FAN means a cap hand. */
  fan: number;
  /** True if the fan is per item (e.g. 1 per dragon pong). */
  each?: boolean;
  en: string;
  zh: string;
}

export const FAN_TABLE: readonly FanTableRow[] = [
  { id: 'selfDraw', fan: 1, en: 'Self-draw', zh: '自摸' },
  { id: 'concealed', fan: 1, en: 'Concealed hand', zh: '門前清' },
  { id: 'noFlowers', fan: 1, en: 'No flowers', zh: '無花' },
  { id: 'seatFlower', fan: 1, each: true, en: 'Seat flower', zh: '正花' },
  { id: 'fullSet', fan: 2, en: 'All 4 flowers of one kind', zh: '一台花' },
  { id: 'allChows', fan: 1, en: 'All chows', zh: '平胡' },
  { id: 'dragon', fan: 1, each: true, en: 'Dragon pong', zh: '番子' },
  { id: 'seatWind', fan: 1, en: 'Seat wind pong', zh: '門風' },
  { id: 'roundWind', fan: 1, en: 'Round wind pong', zh: '圈風' },
  { id: 'mixedTerminals', fan: 1, en: 'Terminals and honours', zh: '混么九' },
  { id: 'lastTile', fan: 1, en: 'Win on the last tile', zh: '海底撈月' },
  { id: 'lastDiscard', fan: 1, en: 'Win on the last discard', zh: '河底撈魚' },
  { id: 'robbingGong', fan: 1, en: 'Robbing a gong', zh: '搶槓' },
  { id: 'gongReplacement', fan: 2, en: 'Win on a gong replacement', zh: '槓上開花' },
  { id: 'allPongs', fan: 3, en: 'All pongs', zh: '對對胡' },
  { id: 'halfFlush', fan: 3, en: 'One suit plus honours', zh: '混一色' },
  { id: 'smallThreeDragons', fan: 5, en: 'Small three dragons', zh: '小三元' },
  { id: 'smallFourWinds', fan: 6, en: 'Small four winds', zh: '小四喜' },
  { id: 'fullFlush', fan: 7, en: 'One suit only', zh: '清一色' },
  { id: 'bigThreeDragons', fan: 8, en: 'Big three dragons', zh: '大三元' },
  { id: 'thirteenOrphans', fan: MAX_FAN, en: 'Thirteen orphans', zh: '十三么' },
  { id: 'bigFourWinds', fan: MAX_FAN, en: 'Big four winds', zh: '大四喜' },
  { id: 'allHonours', fan: MAX_FAN, en: 'All honours', zh: '字一色' },
  { id: 'allTerminals', fan: MAX_FAN, en: 'All terminals', zh: '清么九' },
  { id: 'nineGates', fan: MAX_FAN, en: 'Nine gates', zh: '九子連環' },
  { id: 'allConcealedPongs', fan: MAX_FAN, en: 'All concealed pongs', zh: '坑坑胡' },
  { id: 'fourGongs', fan: MAX_FAN, en: 'Four gongs', zh: '十八羅漢' },
  { id: 'heavenly', fan: MAX_FAN, en: 'Heavenly hand', zh: '天胡' },
  { id: 'earthly', fan: MAX_FAN, en: 'Earthly hand', zh: '地胡' },
  { id: 'allFlowers', fan: MAX_FAN, en: 'All 8 flowers', zh: '八仙過海' },
];

/** Fan → chips rows for the Help screen. */
export const CHIPS_TABLE: readonly { fan: number; base: number; label: string }[] = FAN_TO_BASE.map((base, fan) => ({
  fan,
  base,
  label: fan === MAX_FAN ? `${fan}+` : `${fan}`,
}));
