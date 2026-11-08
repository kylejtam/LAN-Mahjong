import { describe, expect, it } from 'vitest';
import { FAN_TO_BASE, baseChips, calculatePayout } from '../src/index.js';

const total = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('fan to chips table', () => {
  it('matches the approved half-spicy table', () => {
    expect(FAN_TO_BASE).toEqual([1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128]);
  });

  it('caps at 10 fan', () => {
    expect(baseChips(10)).toBe(128);
    expect(baseChips(13)).toBe(128);
  });
});

describe('payouts', () => {
  it('normal mode, win on a discard: discarder pays double', () => {
    // Seat 0 wins 3 fan (base 8) off seat 2.
    const r = calculatePayout({ winner: 0, discarder: 2, fan: 3, minFan: 3, mode: 'everyonePays' });
    expect(r.changes).toEqual([32, -8, -16, -8]);
    expect(r.isChicken).toBe(false);
  });

  it('self-draw: everyone pays double', () => {
    const r = calculatePayout({ winner: 1, discarder: null, fan: 3, minFan: 3, mode: 'everyonePays' });
    expect(r.changes).toEqual([-16, 48, -16, -16]);
  });

  it('"only discarder pays" mode: 3 fan costs the discarder 32 (Kyle\'s example)', () => {
    const r = calculatePayout({ winner: 0, discarder: 3, fan: 3, minFan: 3, mode: 'discarderPays' });
    expect(r.changes).toEqual([32, 0, 0, -32]);
  });

  it('"only discarder pays" mode with self-draw: everyone pays double', () => {
    const r = calculatePayout({ winner: 2, discarder: null, fan: 5, minFan: 3, mode: 'discarderPays' });
    expect(r.changes).toEqual([-48, -48, 144, -48]);
  });

  it('chicken win: winner pays 32 to each other player (96 total)', () => {
    const r = calculatePayout({ winner: 0, discarder: 1, fan: 2, minFan: 3, mode: 'everyonePays' });
    expect(r.changes).toEqual([-96, 32, 32, 32]);
    expect(r.isChicken).toBe(true);
  });

  it('chicken win on a self-draw is the same penalty', () => {
    const r = calculatePayout({ winner: 3, discarder: null, fan: 0, minFan: 1, mode: 'discarderPays' });
    expect(r.changes).toEqual([32, 32, 32, -96]);
  });

  it('exactly the minimum fan is NOT a chicken win', () => {
    expect(calculatePayout({ winner: 0, discarder: 1, fan: 5, minFan: 5, mode: 'everyonePays' }).isChicken).toBe(false);
  });

  it('pays the cap for hands above 10 fan', () => {
    const r = calculatePayout({ winner: 0, discarder: 1, fan: 13, minFan: 3, mode: 'everyonePays' });
    expect(r.changes).toEqual([512, -256, -128, -128]);
  });

  it('always adds up to zero (no chips created or lost)', () => {
    for (let fan = 0; fan <= 13; fan++) {
      for (const discarder of [null, 1, 2, 3]) {
        for (const mode of ['everyonePays', 'discarderPays'] as const) {
          expect(total(calculatePayout({ winner: 0, discarder, fan, minFan: 3, mode }).changes)).toBe(0);
        }
      }
    }
  });

  it('rejects winning on your own discard', () => {
    expect(() => calculatePayout({ winner: 1, discarder: 1, fan: 3, minFan: 3, mode: 'everyonePays' })).toThrow();
  });
});
