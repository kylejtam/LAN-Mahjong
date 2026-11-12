import { describe, expect, it } from 'vitest';
import { pileForViewer, turnToTable, turnToViewer } from '../src/pileFrame.js';

describe('the shared shuffling pile', () => {
  it('East pushes up: South sees the tiles move left to right', () => {
    // Up on the table is (0, -1) (the screen's y goes down).
    const southSees = turnToViewer(0, -1, 1);
    expect(southSees.x).toBeGreaterThan(0.5); // to the right
    expect(Math.abs(southSees.y)).toBeLessThan(1e-9); // no up or down movement
  });

  it('a finger movement turned into the table frame and back is the same', () => {
    for (const seat of [0, 1, 2, 3]) {
      const v = turnToViewer(0.3, -0.7, seat);
      const back = turnToTable(v.x, v.y, seat);
      expect(back.x).toBeCloseTo(0.3);
      expect(back.y).toBeCloseTo(-0.7);
    }
  });

  it("a viewer's own seat is always at the bottom of their screen", () => {
    // Seat 1 sits on the table's right: after a clockwise turn it is at the bottom.
    const seat1 = turnToViewer(1, 0, 1);
    expect(seat1.x).toBeCloseTo(0);
    expect(seat1.y).toBeCloseTo(1);
  });

  it('turns each tile’s angle along with its place', () => {
    const p = pileForViewer([10000, 0, 0], 1);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(10000);
    expect(p[2]).toBe(1571);
  });
});
