import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, seededRng } from '@lan-mahjong/shared';
import { MatchState, beginRound, closeRound, matchLabel, newMatch } from '../src/game/match.js';
import { RoundResult } from '../src/game/round.js';

/** Pretend a round ended with this result. */
function endWith(match: MatchState, result: RoundResult): MatchState {
  const m = beginRound(match, seededRng(match.handsPlayed + 1));
  m.round!.core.phase = 'ended';
  m.round!.core.result = result;
  return closeRound(m).match;
}
const win = (winner: number): Extract<RoundResult, { type: 'win' }> => ({
  type: 'win', winner, discarder: null, fan: 3, items: [], capHand: false, isChicken: false, changes: [0, 0, 0, 0],
});
const draw: RoundResult = { type: 'draw' };

describe('full game', () => {
  it('starts in the East wind with seat 0 dealing', () => {
    const m = newMatch(DEFAULT_SETTINGS);
    expect(m).toMatchObject({ roundWind: 0, dealer: 0, dealerIndex: 0, finished: false });
    expect(matchLabel(m)).toBe('East, game 1');
    expect(matchLabel(m, 'zh')).toBe('東風 第1局');
  });

  it('dealer stays when the dealer wins, and it does not count toward the 16', () => {
    let m = newMatch(DEFAULT_SETTINGS);
    m = endWith(m, win(0));
    expect(m).toMatchObject({ dealer: 0, dealerIndex: 0, handsPlayed: 1 });
  });

  it('dealer moves on when someone else wins', () => {
    let m = newMatch(DEFAULT_SETTINGS);
    m = endWith(m, win(2));
    expect(m).toMatchObject({ dealer: 1, dealerIndex: 1 });
    expect(matchLabel(m)).toBe('East, game 2');
  });

  it('on a draw the dealer stays by default', () => {
    let m = newMatch(DEFAULT_SETTINGS);
    m = endWith(m, draw);
    expect(m.dealer).toBe(0);
  });

  it('on a draw the dealer moves on if the host setting is on', () => {
    let m = newMatch({ ...DEFAULT_SETTINGS, dealerAdvancesOnDraw: true });
    m = endWith(m, draw);
    expect(m.dealer).toBe(1);
  });

  it('moves to the South wind after all 4 have dealt', () => {
    let m = newMatch(DEFAULT_SETTINGS);
    for (let i = 0; i < 4; i++) m = endWith(m, win((m.dealer + 1) % 4));
    expect(m).toMatchObject({ roundWind: 1, dealer: 0, dealerIndex: 0 });
    expect(matchLabel(m)).toBe('South, game 1');
  });

  it('finishes after 16 rounds, however many repeats there were', () => {
    let m = newMatch(DEFAULT_SETTINGS);
    let advances = 0;
    let i = 0;
    while (!m.finished) {
      // Every third hand the dealer wins (a repeat).
      const before = m.dealer;
      m = endWith(m, i++ % 3 === 0 ? win(m.dealer) : win((m.dealer + 1) % 4));
      if (m.dealer !== before || m.finished) advances++;
      if (i > 100) throw new Error('never finished');
    }
    expect(advances).toBe(16);
    expect(m.handsPlayed).toBeGreaterThan(16);
    expect(() => beginRound(m, seededRng(1))).toThrow(/finished/);
  });

  it('passes on the chip changes of a win', () => {
    let m = beginRound(newMatch(DEFAULT_SETTINGS), seededRng(1));
    m.round!.core.phase = 'ended';
    m.round!.core.result = { ...win(1), changes: [-8, 32, -16, -8] };
    expect(closeRound(m).changes).toEqual([-8, 32, -16, -8]);
  });

  it('cannot close a round that is still being played', () => {
    const m = beginRound(newMatch(DEFAULT_SETTINGS), seededRng(1));
    expect(() => closeRound(m)).toThrow();
  });
});
