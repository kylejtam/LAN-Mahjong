import { describe, expect, it } from 'vitest';
import { NORMAL_TYPES, seededRng } from '@lan-mahjong/shared';
import { availableActions, discard, draw } from '../src/game/round.js';
import { cpuMove, shanten, sight } from '../src/game/cpu.js';
import { CpuDifficulty } from '../src/game/room.js';
import { Setup, idOf, setupRound } from './helpers.js';

const LEVELS: CpuDifficulty[] = ['easy', 'medium', 'hard'];
const counts = (s: string): number[] => {
  const c = new Array<number>(34).fill(0);
  for (const t of s.split(' ')) c[NORMAL_TYPES.indexOf(t as never)]!++;
  return c;
};
const move = (r: ReturnType<typeof setupRound>, seat: number, level: CpuDifficulty, now = 0) =>
  cpuMove(r, seat, availableActions(r, seat, now), level, seededRng(1), now);

describe('how close a hand is to winning (shanten)', () => {
  it('a complete hand is -1, one tile away is 0', () => {
    expect(shanten(counts('m1 m2 m3 p4 p5 p6 s7 s8 s9 wE wE wE dR dR'), 0)).toBe(-1);
    expect(shanten(counts('m1 m2 m3 p4 p5 p6 s7 s8 s9 wE wE wE dR'), 0)).toBe(0);
  });
  it('counts shown sets', () => {
    expect(shanten(counts('p4 p5 p6 dR dR'), 3)).toBe(-1);
    expect(shanten(counts('p4 p5 dR dR'), 3)).toBe(0);
  });
  it('a scattered hand is far away', () => {
    expect(shanten(counts('m1 m5 m9 p2 p6 s1 s5 s9 wE wS wW wN dR'), 0)).toBeGreaterThanOrEqual(5);
  });
});

// Seat 1 (South) is waiting for s9 with a plain hand: self-draw + concealed + all chows = 3 fan.
const waitingHands: Setup['hands'] = [
  'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dR',
  'm2 m3 m4 p5 p6 p7 s3 s4 s5 s7 s8 wE wE',
  'p1 p4 p7 s1 s4 s6 m1 m4 m7 wS wS wW wN',
  'p2 p5 p8 s2 s5 s6 m2 m5 m8 wS wW wW wN',
];
/** Dealer throws dR, seat 1 draws the s9 it needs. (Not the first turn, so no Heavenly/Earthly hand.) */
const seat1Drew = (minFan: number) => {
  let r = setupRound({ hands: waitingHands, front: 's9', settings: { minFan } });
  r = discard(r, 0, idOf(r, 0, 'dR'), 0);
  return draw(r, 1, 10);
};

describe('CPUs never take a chicken win', () => {
  for (const level of LEVELS) {
    it(`${level}: wins when the hand reaches the minimum fan`, () => {
      expect(move(seat1Drew(3), 1, level, 20)).toEqual({ type: 'selfDrawWin' });
    });
    it(`${level}: does not win below the minimum fan, discards instead`, () => {
      expect(move(seat1Drew(4), 1, level, 20)?.type).toBe('discard');
    });
  }

  it('does not claim a discard win below the minimum fan', () => {
    // Seat 3 waits on dR (plain hand, 2 fan: concealed + all chows). Seat 2 throws dR on the 3rd discard.
    const hands: Setup['hands'] = [
      'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 wN',
      'p4 p5 p6 p7 p8 p9 s2 s3 s4 s5 s6 s7 wE',
      'p1 p4 p7 s1 s4 s7 m1 m4 m7 wE wS wW dR',
      'm2 m3 m4 p5 p6 p7 s3 s4 s5 s7 s8 s9 dR',
    ];
    for (const [minFan, expected] of [[2, 'claim'], [3, 'draw']] as const) {
      let r = setupRound({ hands, front: 'm9 p9', settings: { minFan } });
      r = discard(r, 0, idOf(r, 0, 'wN'), 0);
      r = draw(r, 1, 10);
      r = discard(r, 1, idOf(r, 1, 'm9'), 20);
      r = draw(r, 2, 30);
      r = discard(r, 2, idOf(r, 2, 'dR'), 40);
      expect(move(r, 3, 'medium', 50)?.type).toBe(expected);
    }
  });
});

describe('claims', () => {
  // Dealer discards dG; seat 2 holds dG dG.
  const hands: Setup['hands'] = [
    'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dG',
    'p4 p5 p6 p7 p8 p9 s2 s3 s4 s5 s6 s7 wE',
    'dG dG s1 s2 s3 m5 m6 m7 p5 p6 wN wS m1',
    'm2 m5 m8 p1 p4 p7 s4 s7 wE wS wW wN dR',
  ];
  it('easy never claims Pung', () => {
    let r = setupRound({ hands });
    r = discard(r, 0, idOf(r, 0, 'dG'), 0);
    expect(move(r, 2, 'easy')).toBeNull();
  });
  it('medium and hard claim Pung when it brings them closer to winning', () => {
    for (const level of ['medium', 'hard'] as const) {
      let r = setupRound({ hands });
      r = discard(r, 0, idOf(r, 0, 'dG'), 0);
      expect(move(r, 2, level)).toEqual({ type: 'claim', claim: { kind: 'pong' } });
    }
  });
  it('the next player can claim Soeng', () => {
    // Dealer discards p6; seat 1 has p4 p5 and nothing else connected.
    const h: Setup['hands'] = [
      'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 p6',
      'p4 p5 s2 s3 s4 m5 m6 m7 dW dW wN wS s9',
      'p7 p8 s5 s6 m1 m2 wE wE dR dR dG s8 m9',
      'm2 m5 m8 p1 p9 s1 s7 wE wS wW wN dR dG',
    ];
    let r = setupRound({ hands: h });
    r = discard(r, 0, idOf(r, 0, 'p6'), 0);
    expect(move(r, 1, 'medium')).toMatchObject({ type: 'claim', claim: { kind: 'chow' } });
  });
});

describe('discards', () => {
  it('medium throws a lone honour before tiles that work together', () => {
    const hands: Setup['hands'] = [
      'm1 m2 m3 m4 m5 m6 p2 p3 p4 s6 s7 p8 p9 wN',
      'p5 p6 p7 s2 s3 s4 m7 m8 m9 wE wS wW dR',
      'm9 s9 s1 s1 dR dR dG dG dW dW wS wW p1',
      'm1 m4 p1 p5 s1 s4 s7 wE wS wW wN dR dG',
    ];
    const r = setupRound({ hands });
    const m = move(r, 0, 'medium');
    expect(m?.type).toBe('discard');
    const id = m && m.type === 'discard' ? m.tileId : -1;
    expect(r.core.hands[0]!.find((t) => t.id === id)?.type).toBe('wN');
  });

  it('hard plays safe when the wall is short and an opponent has 3 shown sets', async () => {
    const { chooseDiscard } = await import('../src/game/cpu.js');
    // Three lone tiles: s5, wN, dW. Normally the lone honours go first.
    const hands: Setup['hands'] = [
      'm1 m2 m3 m4 m5 m6 p2 p3 p4 p9 p9 s5 wN dW',
      'p5 p6 p7 s2 s3 s4 m7 m8 m9 wE wS wW dR',
      'm9 s9 s1 s1 dR dR dG dG s7 s8 wS wW p1',
      'm1 m4 p1 p5 s1 s4 s7 wE wS wW wN dR dG',
    ];
    const r = setupRound({ hands });
    const calm = sight(r, 0);
    expect(['wN', 'dW']).toContain(chooseDiscard(calm, 'medium', seededRng(1)).type);
    // Late in the hand, with an opponent close to winning and every opponent having thrown s5:
    const tense = sight(r, 0);
    tense.meldCounts[1] = 3;
    tense.wallCount = 10;
    for (const o of [1, 2, 3]) tense.discardedBy[o]!.add('s5');
    expect(chooseDiscard(tense, 'hard', seededRng(1)).type).toBe('s5');
  });
});

describe('fair play: CPUs never look at hidden tiles', () => {
  it('makes exactly the same move whatever the other hands and the wall contain', () => {
    // Same CPU hand and same table; other players' hidden tiles and the wall differ.
    const mine = 'm1 m2 m3 m4 m5 p2 p3 p4 s6 s7 wN wN dW';
    const a = setupRound({
      dealer: 3,
      hands: ['p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 s4', mine, 'm6 m7 m8 m9 s5 s8 s9 wE wE wS wS wW wW', 'dR dR dR dG dG dG m6 m7 m8 s1 s2 s3 s4 p1'],
      front: 'm9 p9 s9 dR',
    });
    const b = setupRound({
      dealer: 3,
      hands: ['dR dR dG dG s1 s2 s3 s4 m6 m6 m7 m7 m8', mine, 'p1 p2 p3 p4 p5 p6 p7 p8 p9 s5 s8 s9 m9', 'wE wE wS wS wW wW dR dG s1 s2 s3 s4 m8 p1'],
      front: 'm9 p9 s9 dR',
    });
    // Let seat 3 (dealer) throw the same tile in both, then seat 0 draws the same tile... we only
    // compare seat 1's own-turn decision after an identical public history.
    const play = (r: ReturnType<typeof setupRound>) => {
      r = discard(r, 3, idOf(r, 3, 'p1'), 0);
      r = draw(r, 0, 10);
      r = discard(r, 0, r.core.hands[0]!.at(-1)!.id, 20); // throws the drawn m9 in both
      r = draw(r, 1, 30);
      return r;
    };
    const ra = play(a);
    const rb = play(b);
    for (const level of LEVELS) {
      const ma = move(ra, 1, level, 40);
      const mb = move(rb, 1, level, 40);
      const typeOf = (r: typeof ra, m: typeof ma) => (m && m.type === 'discard' ? r.core.hands[1]!.find((t) => t.id === m.tileId)!.type : m?.type);
      expect(typeOf(ra, ma)).toEqual(typeOf(rb, mb));
    }
  });

  it('what a CPU can see contains only its own hand', () => {
    const r = setupRound({ hands: waitingHands });
    const s = sight(r, 2);
    expect(s.hand.map((t) => t.id).sort()).toEqual(r.core.hands[2]!.map((t) => t.id).sort());
    expect(Object.keys(s)).not.toContain('hands');
    expect(Object.keys(s)).not.toContain('wall');
  });
});
