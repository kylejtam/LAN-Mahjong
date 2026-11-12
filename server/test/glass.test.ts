import { describe, expect, it } from 'vitest';
import { flowerScoresFor, newGlass, noteFlower } from '../src/game/glass.js';

describe('the window-breaking sound rule', () => {
  it('a flower that does not score plays it, once', () => {
    let g = newGlass();
    // East (seat 1 here, wind 0 is East's seat number 1 only for seat 0): f2 does not score.
    g = noteFlower(g, 0, 'kyle', 1, 'f2', 0); // not East's number
    expect(g.seq).toBe(1);
    expect(g.seat).toBe(1);
    g = noteFlower(g, 0, 'kyle', 1, 'f3', 0); // second one this hand: silent
    expect(g.seq).toBe(1);
  });

  it('a scoring first flower is silent, and so is a later non-scoring one', () => {
    let g = newGlass();
    g = noteFlower(g, 0, 'kyle', 0, 'f1', 0); // scores for East
    expect(g.seq).toBe(0);
    g = noteFlower(g, 0, 'kyle', 0, 'f2', 0); // non-scoring, but not the first flower
    expect(g.seq).toBe(0);
  });

  it('each player has their own first flower', () => {
    let g = newGlass();
    g = noteFlower(g, 0, 'kyle', 1, 'n2', 0);
    g = noteFlower(g, 0, 'amy', 2, 'f1', 1); // Amy (West? wind 1) with f1: not her number (2): plays
    expect(g.seq).toBe(2);
  });

  it('a new hand starts again', () => {
    let g = newGlass();
    g = noteFlower(g, 0, 'kyle', 1, 'f2', 0);
    g = noteFlower(g, 1, 'kyle', 1, 'f2', 0);
    expect(g.seq).toBe(2);
  });

  it('scoring is by number matching the seat wind', () => {
    expect(flowerScoresFor('f1', 0)).toBe(true);
    expect(flowerScoresFor('n4', 3)).toBe(true);
    expect(flowerScoresFor('f2', 0)).toBe(false);
  });
});
