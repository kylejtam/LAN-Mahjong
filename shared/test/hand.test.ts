import { describe, expect, it } from 'vitest';
import {
  Meld, NormalType, Tile, addedGongOptions, canGongDiscard, canPong, canWinSelfDraw, canWinWith,
  chowOptions, concealedGongOptions, findWinShape, mayChowFrom, resolveWinClaims,
} from '../src/index.js';

let nextId = 1000;
/** Turn "m1 m2 m3" into tiles (test helper). */
const t = (s: string): Tile[] => s.split(/\s+/).filter(Boolean).map((type) => ({ id: nextId++, type: type as NormalType }));
const pong = (type: string): Meld => ({ kind: 'pong', tiles: t(`${type} ${type} ${type}`), concealed: false, claimedFrom: 1 });

describe('winning hands', () => {
  it('recognises 4 sets + a pair', () => {
    expect(canWinSelfDraw(t('m1 m2 m3 p4 p5 p6 s7 s8 s9 wE wE wE dR dR'), [])).toBe(true);
  });

  it('recognises all pongs', () => {
    expect(canWinSelfDraw(t('m1 m1 m1 p9 p9 p9 s5 s5 s5 dG dG dG wN wN'), [])).toBe(true);
  });

  it('rejects a hand that is not complete', () => {
    expect(canWinSelfDraw(t('m1 m2 m4 p4 p5 p6 s7 s8 s9 wE wE wE dR dR'), [])).toBe(false);
  });

  it('does not let a chow wrap around (8-9-1) or use honours', () => {
    expect(canWinSelfDraw(t('m8 m9 p1 p4 p5 p6 s7 s8 s9 wE wE wE dR dR'), [])).toBe(false);
    expect(canWinSelfDraw(t('wE wS wW p4 p5 p6 s7 s8 s9 m1 m1 m1 dR dR'), [])).toBe(false);
  });

  it('works with melds on the table', () => {
    const melds = [pong('dR'), pong('m5')];
    expect(canWinWith(t('p1 p2 p3 s4 s4 s4 wW'), melds, 'wW')).toBe(true);
    expect(canWinWith(t('p1 p2 p3 s4 s4 s4 wW'), melds, 'wE')).toBe(false);
  });

  it('works with a gong on the table (a gong counts as one set)', () => {
    const gong: Meld = { kind: 'gong', tiles: t('s1 s1 s1 s1'), concealed: true };
    expect(canWinSelfDraw(t('m2 m3 m4 p5 p6 p7 m8 m8 m8 dW dW'), [gong])).toBe(true);
  });

  it('recognises Thirteen Orphans 十三么', () => {
    const shape = findWinShape(t('m1 m9 p1 p9 s1 s9 wE wS wW wN dR dG dW dW'), []);
    expect(shape?.kind).toBe('thirteenOrphans');
  });

  it('does not accept seven pairs (not standard HK)', () => {
    expect(canWinSelfDraw(t('m1 m1 m3 m3 p5 p5 p7 p7 s2 s2 wE wE dR dR'), [])).toBe(false);
  });

  it('finds every way to split an ambiguous hand', () => {
    // 111 222 333 can be three pongs OR three 1-2-3 chows.
    const shape = findWinShape(t('m1 m1 m1 m2 m2 m2 m3 m3 m3 p5 p6 p7 s9 s9'), []);
    expect(shape!.decompositions.length).toBeGreaterThanOrEqual(2);
  });

  it('never accepts a flower as the winning tile', () => {
    expect(canWinWith(t('m1 m2 m3 p4 p5 p6 s7 s8 s9 wE wE wE dR'), [], 'f1')).toBe(false);
  });
});

describe('legal claims', () => {
  it('only lets the next player chow 上', () => {
    expect(mayChowFrom(0, 1)).toBe(true);
    expect(mayChowFrom(3, 0)).toBe(true);
    expect(mayChowFrom(0, 2)).toBe(false);
    expect(mayChowFrom(0, 3)).toBe(false);
  });

  it('lists every chow option', () => {
    expect(chowOptions(t('p3 p4 p6 p7'), 'p5')).toEqual([['p3', 'p4'], ['p4', 'p6'], ['p6', 'p7']]);
    expect(chowOptions(t('p3 p4 p6 p7'), 'm5')).toEqual([]);
    expect(chowOptions(t('m8 m9'), 'm7')).toEqual([['m8', 'm9']]);
    expect(chowOptions(t('wE wS'), 'wW')).toEqual([]);
  });

  it('allows pong 碰 with two matching tiles', () => {
    expect(canPong(t('dR dR m1'), 'dR')).toBe(true);
    expect(canPong(t('dR m1 m2'), 'dR')).toBe(false);
  });

  it('allows gong 槓 on a discard with three matching tiles', () => {
    expect(canGongDiscard(t('s5 s5 s5'), 's5')).toBe(true);
    expect(canGongDiscard(t('s5 s5'), 's5')).toBe(false);
  });

  it('finds concealed gongs and added gongs', () => {
    expect(concealedGongOptions(t('wN wN wN wN m1'))).toEqual(['wN']);
    expect(addedGongOptions(t('m5 p2'), [pong('m5'), pong('dG')])).toEqual(['m5']);
  });
});

describe('two players win on one discard (截糊 stealing the win)', () => {
  it('gives the win to the player next in turn after the discarder', () => {
    expect(resolveWinClaims(0, [2, 3])).toBe(2);
    expect(resolveWinClaims(0, [3, 1])).toBe(1);
    expect(resolveWinClaims(2, [1, 3])).toBe(3);
    expect(resolveWinClaims(3, [2, 1])).toBe(1);
  });

  it('works with one claimer or none', () => {
    expect(resolveWinClaims(1, [0])).toBe(0);
    expect(resolveWinClaims(1, [])).toBe(null);
  });
});
