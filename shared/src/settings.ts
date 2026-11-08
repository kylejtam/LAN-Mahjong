/**
 * Game settings the host can change, and their starting (default) values.
 */
import { PayoutMode } from './payout.js';

export interface GameSettings {
  /** Include the 8 flower tiles (144 tiles) or not (136 tiles). */
  flowersOn: boolean;
  /** Winning hands below this many fan are chicken wins. */
  minFan: number;
  payoutMode: PayoutMode;
  /** After a round with no winner: does the dealer move on? */
  dealerAdvancesOnDraw: boolean;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  flowersOn: true,
  minFan: 1,
  payoutMode: 'everyonePays',
  dealerAdvancesOnDraw: false,
};
