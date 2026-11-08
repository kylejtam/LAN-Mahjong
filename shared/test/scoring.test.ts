import { describe, expect, it } from 'vitest';
import { Meld, NormalType, Tile, TileType, WinContext, countFan } from '../src/index.js';

let nextId = 5000;
const t = (s: string): Tile[] => s.split(/\s+/).filter(Boolean).map((type) => ({ id: nextId++, type: type as NormalType }));
const meld = (kind: 'chow' | 'pong' | 'gong', s: string, concealed = false): Meld => ({ kind, tiles: t(s), concealed });

/** Score a hand. Default: discard win, East seat, East round, flowers off. */
function score(hidden: string, extra: Partial<WinContext> = {}) {
  const tiles = t(hidden);
  return countFan({
    hidden: tiles,
    melds: [],
    flowers: [],
    winningTile: tiles.at(-1)!.type as TileType,
    selfDraw: false,
    seatWind: 0,
    roundWind: 0,
    flowersOn: false,
    ...extra,
  });
}
const ids = (r: ReturnType<typeof countFan>) => r.items.map((i) => i.id).sort();

describe('fan counting: small items', () => {
  it('all chows + concealed', () => {
    const r = score('m1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9');
    expect(ids(r)).toEqual(['allChows', 'concealed']);
    expect(r.fan).toBe(2);
  });

  it('self-draw adds 1', () => {
    expect(score('m1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { selfDraw: true }).fan).toBe(3);
  });

  it('claimed melds remove concealed', () => {
    const r = score('m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { melds: [meld('chow', 'm1 m2 m3')] });
    expect(ids(r)).toEqual(['allChows']);
  });

  it('a concealed gong still counts as concealed', () => {
    const r = score('m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { melds: [meld('gong', 'm1 m1 m1 m1', true)] });
    expect(ids(r)).toContain('concealed');
  });

  it('dragon pong 1 each, seat wind and round wind', () => {
    // South seat in a South round: South pong scores both seat and round wind.
    const r = score('m1 m2 m3 p4 p5 p6 s9 s9', {
      melds: [meld('pong', 'dR dR dR'), meld('pong', 'wS wS wS')],
      seatWind: 1,
      roundWind: 1,
    });
    expect(ids(r)).toEqual(['dragon_31', 'roundWind', 'seatWind']);
    expect(r.fan).toBe(3);
  });

  it('a wind that is neither seat nor round wind scores nothing', () => {
    const r = score('m1 m2 m3 p4 p5 p6 s9 s9', { melds: [meld('pong', 'wN wN wN'), meld('chow', 's1 s2 s3')] });
    expect(r.fan).toBe(0);
  });

  it('flowers: no flowers, seat flower, full set', () => {
    const hand = 'm1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9';
    expect(ids(score(hand, { flowersOn: true }))).toContain('noFlowers');
    // East seat: plum f1 and spring n1 are seat flowers.
    const seat = score(hand, { flowersOn: true, flowers: t('f1 n1 f3') as Tile[] });
    expect(seat.items.filter((i) => i.id.startsWith('seatFlower'))).toHaveLength(2);
    expect(ids(seat)).not.toContain('noFlowers');
    const set = score(hand, { flowersOn: true, flowers: t('f1 f2 f3 f4') as Tile[] });
    expect(ids(set)).toContain('fullSet_f');
    expect(ids(set)).not.toContain('seatFlower_f');
  });

  it('no flowers fan only when flowers are on', () => {
    expect(ids(score('m1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9'))).not.toContain('noFlowers');
  });

  it('last tile, robbing a gong, gong replacement', () => {
    const hand = 'm1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9';
    expect(ids(score(hand, { lastTile: true }))).toContain('lastTile');
    expect(ids(score(hand, { robbingGong: true }))).toContain('robbingGong');
    const r = score(hand, { gongReplacement: true, selfDraw: true });
    expect(r.items.find((i) => i.id === 'gongReplacement')!.fan).toBe(2);
  });
});

describe('fan counting: bigger hands', () => {
  it('all pongs = 3', () => {
    const r = score('p2 p2 p2 s8 s8', { melds: [meld('pong', 'm3 m3 m3'), meld('pong', 'm7 m7 m7'), meld('pong', 's5 s5 s5')] });
    expect(ids(r)).toEqual(['allPongs']);
    expect(r.fan).toBe(3);
  });

  it('half flush = 3', () => {
    const r = score('m1 m2 m3 m4 m5 m6 m7 m8 m9 wN wN', { melds: [meld('pong', 'wW wW wW')] });
    expect(ids(r)).toEqual(['halfFlush']);
  });

  it('full flush = 7 (and not half flush too)', () => {
    const r = score('s1 s2 s3 s4 s5 s6 s7 s8 s9 s2 s2', { melds: [meld('chow', 's3 s4 s5')] });
    expect(ids(r)).toEqual(['allChows', 'fullFlush']);
    expect(r.fan).toBe(8);
  });

  it('picks the split worth the most fan', () => {
    // 111 222 333 of characters: three pongs (all pongs 3 + winds 2 = 5)
    // or three chows (winds 2 only). The pongs split must be chosen.
    const r = score('m1 m1 m1 m2 m2 m2 m3 m3 m3 p5 p5', { melds: [meld('pong', 'wE wE wE')] });
    expect(ids(r)).toEqual(['allPongs', 'roundWind', 'seatWind']);
    expect(r.fan).toBe(5);
  });

  it('small three dragons = 5 (dragon pongs not added again)', () => {
    const r = score('m1 m2 m3 dW dW', { melds: [meld('pong', 'dR dR dR'), meld('pong', 'dG dG dG'), meld('chow', 'p1 p2 p3')] });
    expect(ids(r)).toEqual(['smallThreeDragons']);
    expect(r.fan).toBe(5);
  });

  it('big three dragons = 8', () => {
    const r = score('m1 m2 m3 p9 p9', { melds: [meld('pong', 'dR dR dR'), meld('pong', 'dG dG dG'), meld('pong', 'dW dW dW')] });
    expect(ids(r)).toEqual(['bigThreeDragons']);
  });

  it('small four winds = 6', () => {
    const r = score('m1 m2 m3 wN wN', { melds: [meld('pong', 'wE wE wE'), meld('pong', 'wS wS wS'), meld('pong', 'wW wW wW')], seatWind: 2, roundWind: 0 });
    expect(ids(r)).toContain('smallFourWinds');
    expect(ids(r)).not.toContain('seatWind');
  });

  it('mixed terminals and honours = 1, plus all pongs', () => {
    const r = score('m1 m1 m1 p9 p9 p9 wN wN', { melds: [meld('pong', 's1 s1 s1'), meld('pong', 'wW wW wW')] });
    expect(ids(r)).toEqual(['allPongs', 'mixedTerminals']);
    expect(r.fan).toBe(4);
  });
});

describe('fan counting: cap hands (10 fan)', () => {
  const capCase = (name: string, id: string, hidden: string, extra: Partial<WinContext> = {}) =>
    it(`${name} is a cap hand`, () => {
      const r = score(hidden, extra);
      expect(r.fan).toBe(10);
      expect(r.capHand).toBe(true);
      expect(ids(r)).toEqual([id]);
    });

  capCase('Thirteen orphans', 'thirteenOrphans', 'm1 m9 p1 p9 s1 s9 wE wS wW wN dR dG dW m1');
  capCase('Big four winds', 'bigFourWinds', 'wE wE wE wS wS wS wW wW wW wN wN wN m5 m5');
  capCase('All honours', 'allHonours', 'wE wE wE dR dR dR dG dG dG wN wN', { melds: [meld('pong', 'dW dW dW')] });
  capCase('All terminals', 'allTerminals', 'm1 m1 m1 m9 m9 m9 p1 p1', { melds: [meld('pong', 's9 s9 s9'), meld('pong', 'p9 p9 p9')] });
  capCase('Nine gates', 'nineGates', 'p1 p1 p1 p2 p3 p4 p5 p6 p7 p8 p9 p9 p9 p5');
  capCase('All concealed pongs (self-draw)', 'allConcealedPongs', 'm2 m2 m2 p4 p4 p4 s6 s6 s6 m8 m8 m8 p1 p1', { selfDraw: true });
  capCase('All concealed pongs (discard finishes the pair)', 'allConcealedPongs', 'm2 m2 m2 p4 p4 p4 s6 s6 s6 m8 m8 m8 p1 p1');
  capCase('Heavenly hand', 'heavenly', 'm1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { heavenly: true, selfDraw: true });
  capCase('Earthly hand', 'earthly', 'm1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { earthly: true });

  it('Four gongs is a cap hand', () => {
    const r = score('p5 p5', {
      melds: [meld('gong', 'm1 m1 m1 m1'), meld('gong', 'm2 m2 m2 m2', true), meld('gong', 's3 s3 s3 s3'), meld('gong', 'dR dR dR dR')],
    });
    expect(ids(r)).toEqual(['fourGongs']);
  });

  it('All 8 flowers is a cap hand', () => {
    const r = score('m1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9', { flowersOn: true, flowers: t('f1 f2 f3 f4 n1 n2 n3 n4') as Tile[] });
    expect(ids(r)).toEqual(['allFlowers']);
  });

  it('a pong finished by a discard is NOT all concealed pongs', () => {
    const r = score('m2 m2 m2 p4 p4 p4 s6 s6 s6 p1 p1 m8 m8 m8');
    expect(r.capHand).toBe(false);
    expect(ids(r)).toContain('allPongs');
  });

  it('caps a big normal hand at 10', () => {
    // Full flush 7 + all pongs 3 + self-draw 1 = 11 → 10.
    const r = score('s1 s1 s1 s3 s3 s3 s5 s5 s5 s2 s2', { selfDraw: true, melds: [meld('pong', 's7 s7 s7')] });
    expect(r.fan).toBe(10);
    expect(r.capHand).toBe(false);
  });
});

it('refuses to score a hand that is not a win', () => {
  expect(() => score('m1 m2 m4 m4 m5 m6 p2 p3 p4 s6 s7 s8 p9 p9')).toThrow();
});

it('every item has an English and a Chinese label', () => {
  const r = score('m1 m1 m1 p9 p9 p9 wN wN', { melds: [meld('pong', 's1 s1 s1'), meld('pong', 'wW wW wW')] });
  for (const i of r.items) {
    expect(i.en.length).toBeGreaterThan(0);
    expect(i.zh).toMatch(/[一-鿿]/);
  }
});
