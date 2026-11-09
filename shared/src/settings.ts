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
  /**
   * Liability 包 for one-suit hands: once a player has 3 face-up sets of one
   * suit, whoever discards a tile of that suit that they then use pays the
   * whole amount if they win with a one-suit hand. On by default.
   */
  liabilityOn: boolean;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  flowersOn: true,
  minFan: 1,
  payoutMode: 'everyonePays',
  dealerAdvancesOnDraw: false,
  liabilityOn: true,
};
