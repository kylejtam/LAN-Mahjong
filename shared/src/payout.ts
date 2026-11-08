/**
 * Payments after a win. All amounts are plain chips.
 *
 * Fan to chips ("half-spicy" 半辣 table, approved by Kyle). "Base" is what a
 * player who did not discard pays:
 *   fan:  0  1  2  3  4   5   6   7   8   9   10+
 *   base: 1  2  4  8  16  24  32  48  64  96  128
 *
 * Who pays:
 * - Win on a discard, normal mode: discarder pays 2 × base, the other two pay
 *   1 × base each.
 * - Win on a discard, "only discarder pays" mode: discarder pays 4 × base.
 * - Self-draw 自摸 (either mode): each of the other three pays 2 × base.
 * - Chicken win (valid hand but below the minimum fan): the WINNER pays 32 to
 *   each of the other three (96 total), however they won.
 */
import { SEATS } from './wall.js';

export const MAX_FAN = 10;
export const FAN_TO_BASE: readonly number[] = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];
export const CHICKEN_PENALTY_EACH = 32;

export type PayoutMode = 'everyonePays' | 'discarderPays';

export function baseChips(fan: number): number {
  if (!Number.isInteger(fan) || fan < 0) throw new Error(`Fan must be a whole number 0 or more, got ${fan}.`);
  return FAN_TO_BASE[Math.min(fan, MAX_FAN)]!;
}

export interface PayoutInput {
  winner: number;
  /** Seat that discarded the winning tile, or null for a self-draw. */
  discarder: number | null;
  fan: number;
  minFan: number;
  mode: PayoutMode;
}

export interface PayoutResult {
  /** Chip change for each seat (positive = receives, negative = pays). Always adds up to 0. */
  changes: number[];
  isChicken: boolean;
}

export function calculatePayout({ winner, discarder, fan, minFan, mode }: PayoutInput): PayoutResult {
  if (discarder === winner) throw new Error('A player cannot win on their own discard.');
  const changes = [0, 0, 0, 0];
  const pay = (from: number, amount: number): void => {
    changes[from]! -= amount;
    changes[winner]! += amount;
  };
  const others = [0, 1, 2, 3].filter((s) => s !== winner);

  if (fan < minFan) {
    // Chicken win: winner pays everyone else.
    for (const s of others) pay(s, -CHICKEN_PENALTY_EACH);
    return { changes, isChicken: true };
  }

  const base = baseChips(fan);
  if (discarder === null) {
    for (const s of others) pay(s, 2 * base);
  } else if (mode === 'discarderPays') {
    pay(discarder, 4 * base);
  } else {
    for (const s of others) pay(s, s === discarder ? 2 * base : base);
  }
  return { changes, isChicken: false };
}

