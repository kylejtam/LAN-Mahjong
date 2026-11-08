import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, seededRng, tilesLeft } from '@lan-mahjong/shared';
import {
  RoundState,
  addedGong,
  availableActions,
  claim,
  concealedGong,
  discard,
  draw,
  drawReplacement,
  selfDrawWin,
  startRound,
  undo,
} from '../src/game/round.js';
import { Setup, idOf, setupRound } from './helpers.js';

// A standard table. Dealer is seat 0 and must discard first.
// - Seat 2 can 碰 a red dragon (dR).
// - Seat 3 is waiting to win on dR.
// - Seat 1 can 上 s1 (has s2 s3).
const S: Setup['hands'] = [
  'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dR',
  'p4 p5 p6 p7 p8 p9 s2 s3 s4 s5 s6 s7 wE',
  'dR dR s8 s9 m1 m1 wS wS wS wW wW wW p2',
  'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN dR',
];
const table = (extra: Partial<Setup> = {}): RoundState => setupRound({ hands: S, front: 'm9 p9 s9 m8', ...extra });
const dealerDiscards = (state: RoundState, type: string, at = 0): RoundState => discard(state, 0, idOf(state, 0, type), at);

describe('a real round start', () => {
  it('deals and waits for the dealer to discard', () => {
    const r = startRound({ dealer: 2, roundWind: 0, settings: { ...DEFAULT_SETTINGS }, rng: seededRng(5) });
    expect(r.core.turn).toBe(2);
    expect(r.core.phase).toBe('mustDiscard');
    expect(availableActions(r, 2, 0).discard).toBe(true);
    expect(availableActions(r, 3, 0).draw).toBe(false);
  });
});

describe('turns', () => {
  it('goes discard → next player draws → next player discards', () => {
    let r = dealerDiscards(table(), 's1');
    expect(r.core.turn).toBe(1);
    expect(r.core.phase).toBe('mustDraw');
    r = draw(r, 1, 100);
    expect(r.core.hands[1]).toHaveLength(14);
    expect(r.core.phase).toBe('mustDiscard');
    r = discard(r, 1, idOf(r, 1, 'wE'), 200);
    expect(r.core.turn).toBe(2);
  });

  it('refuses moves out of turn or in the wrong order', () => {
    const r = table();
    expect(() => draw(r, 0, 0)).toThrow(/discard/);
    expect(() => discard(r, 1, idOf(r, 1, 'wE'), 0)).toThrow(/not your turn/);
    const r2 = dealerDiscards(r, 's1');
    expect(() => discard(r2, 1, idOf(r2, 1, 'wE'), 0)).toThrow(/draw a tile first/);
  });
});

describe('claims', () => {
  it('碰: takes the discard, shows the pong, and it becomes their turn to discard', () => {
    let r = dealerDiscards(table(), 'dR');
    expect(availableActions(r, 2, 0).pong).toBe(true);
    r = claim(r, 2, { kind: 'pong' }, 500);
    expect(r.core.turn).toBe(2);
    expect(r.core.phase).toBe('mustDiscard');
    expect(r.core.melds[2]![0]!.kind).toBe('pong');
    expect(r.core.discards).toHaveLength(0);
    expect(r.core.hands[2]).toHaveLength(11);
  });

  it('上: only the next player can chow', () => {
    let r = dealerDiscards(table(), 's1');
    const ids: [number, number] = [idOf(r, 1, 's2'), idOf(r, 1, 's3')];
    expect(availableActions(r, 1, 0).chow).toHaveLength(1);
    expect(() => claim(r, 2, { kind: 'chow', tileIds: ids }, 0)).toThrow();
    r = claim(r, 1, { kind: 'chow', tileIds: ids }, 0);
    expect(r.core.melds[1]![0]!.tiles.map((t) => t.type).sort()).toEqual(['s1', 's2', 's3']);
  });

  it('refuses a claim the hand cannot make', () => {
    const r = dealerDiscards(table(), 'm5');
    expect(() => claim(r, 2, { kind: 'pong' }, 0)).toThrow(/two matching/);
    expect(() => claim(r, 3, { kind: 'win' }, 0)).toThrow(/does not complete/);
    expect(() => claim(r, 0, { kind: 'pong' }, 0)).toThrow(/own tile/);
  });
});

describe('3-second grace period after the next player draws', () => {
  it('lets a claim undo the draw within 3 seconds', () => {
    let r = dealerDiscards(table(), 'dR', 0);
    const wallBefore = tilesLeft(r.core.wall);
    r = draw(r, 1, 1000);
    expect(tilesLeft(r.core.wall)).toBe(wallBefore - 1);
    r = claim(r, 2, { kind: 'pong' }, 3900);
    expect(tilesLeft(r.core.wall)).toBe(wallBefore); // tile went back
    expect(r.core.hands[1]).toHaveLength(13);
    expect(r.core.turn).toBe(2);
  });

  it('the player who drew can no longer claim the tile (others still can for 3 s)', () => {
    // Dealer throws s1; seat 1 could Shàng it but draws instead.
    let r = dealerDiscards(table(), 's1', 0);
    expect(availableActions(r, 1, 0).chow).toHaveLength(1);
    r = draw(r, 1, 1000);
    expect(availableActions(r, 1, 1500).chow).toHaveLength(0);
    expect(() => claim(r, 1, { kind: 'chow', tileIds: [idOf(r, 1, 's2'), idOf(r, 1, 's3')] }, 1500)).toThrow(/already drawn/);
  });

  it('refuses after 3 seconds', () => {
    let r = dealerDiscards(table(), 'dR', 0);
    r = draw(r, 1, 1000);
    expect(() => claim(r, 2, { kind: 'pong' }, 4001)).toThrow(/Too late/);
  });

  it('ends as soon as the next tile is discarded', () => {
    let r = dealerDiscards(table(), 'dR', 0);
    r = draw(r, 1, 1000);
    r = discard(r, 1, idOf(r, 1, 'wE'), 1500);
    expect(() => claim(r, 2, { kind: 'pong' }, 1600)).toThrow();
  });

  it('claims stay open for as long as nobody draws', () => {
    const r = dealerDiscards(table(), 'dR', 0);
    expect(() => claim(r, 2, { kind: 'pong' }, 999_999)).not.toThrow();
  });
});

describe('stronger claims taking over', () => {
  // Dealer discards s4: seat 1 can 上 it, seat 2 can 碰 it.
  const hands: Setup['hands'] = [
    'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 s4',
    'p4 p5 p6 p7 p8 p9 s2 s3 s5 s6 s7 wE wE',
    'dR dR s4 s4 m1 m1 wS wS wS wW wW wW p2',
    'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN dR',
  ];

  it('碰 takes over a 上 within 3 seconds, even after the 上 player acted', () => {
    let r = setupRound({ hands });
    r = dealerDiscards(r, 's4', 0);
    r = claim(r, 1, { kind: 'chow', tileIds: [idOf(r, 1, 's2'), idOf(r, 1, 's3')] }, 100);
    expect(r.core.melds[1]).toHaveLength(1);
    r = claim(r, 2, { kind: 'pong' }, 3000);
    expect(r.core.melds[1]).toHaveLength(0); // the 上 was reversed
    expect(r.core.hands[1]).toHaveLength(13);
    expect(r.core.melds[2]![0]!.kind).toBe('pong');
    expect(r.core.turn).toBe(2);
  });

  it('碰 cannot take over a 上 after 3 seconds', () => {
    let r = dealerDiscards(setupRound({ hands }), 's4', 0);
    r = claim(r, 1, { kind: 'chow', tileIds: [idOf(r, 1, 's2'), idOf(r, 1, 's3')] }, 100);
    expect(() => claim(r, 2, { kind: 'pong' }, 3101)).toThrow(/Too late/);
  });

  it('上 cannot take over a 碰', () => {
    let r = dealerDiscards(setupRound({ hands }), 's4', 0);
    r = claim(r, 2, { kind: 'pong' }, 100);
    expect(() => claim(r, 1, { kind: 'chow', tileIds: [idOf(r, 1, 's2'), idOf(r, 1, 's3')] }, 200)).toThrow();
  });

  it('胡 takes over a 碰 within 10 seconds, but not after', () => {
    let r = dealerDiscards(table(), 'dR', 0);
    r = claim(r, 2, { kind: 'pong' }, 100);
    expect(() => claim(r, 3, { kind: 'win' }, 10_101)).toThrow(/Too late/);
    r = claim(r, 3, { kind: 'win' }, 9_000);
    expect(r.core.result).toMatchObject({ type: 'win', winner: 3, discarder: 0 });
    expect(r.core.melds[2]).toHaveLength(0);
  });
});

describe('two winners on one discard (截糊)', () => {
  // Dealer discards dR. Seat 1 and seat 3 can both win on it. Seat 1 is next
  // in turn order after the dealer, so seat 1 has priority.
  const hands: Setup['hands'] = [
    'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dR',
    'm2 m3 m4 p5 p6 p7 s3 s4 s5 wE wE wE dR',
    'm1 m1 s8 s9 wS wS wS wW wW wW p2 p8 p9',
    'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN dR',
  ];

  it('the priority player can take the win within 10 seconds', () => {
    let r = dealerDiscards(setupRound({ hands }), 'dR', 0);
    r = claim(r, 3, { kind: 'win' }, 1000);
    expect(r.core.result).toMatchObject({ winner: 3 });
    r = claim(r, 1, { kind: 'win' }, 5000);
    expect(r.core.result).toMatchObject({ winner: 1, discarder: 0 });
    expect(() => claim(r, 3, { kind: 'win' }, 6000)).toThrow();
  });

  it('the priority player is too late after 10 seconds', () => {
    let r = dealerDiscards(setupRound({ hands }), 'dR', 0);
    r = claim(r, 3, { kind: 'win' }, 1000);
    expect(() => claim(r, 1, { kind: 'win' }, 11_001)).toThrow(/Too late/);
  });

  it('a lower-priority player cannot take the win from the priority player', () => {
    let r = dealerDiscards(setupRound({ hands }), 'dR', 0);
    r = claim(r, 1, { kind: 'win' }, 1000);
    expect(() => claim(r, 3, { kind: 'win' }, 1500)).toThrow();
  });
});

describe('gongs and replacement tiles', () => {
  it('槓 on a discard: must draw a replacement from the back before discarding', () => {
    const hands: Setup['hands'] = [
      S[0],
      S[1],
      'dR dR dR m1 m1 wS wS wS wW wW wW p2 s9',
      'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN s9',
    ];
    let r = dealerDiscards(setupRound({ hands, back: 'm9' }), 'dR');
    r = claim(r, 2, { kind: 'gong' }, 0);
    expect(r.core.phase).toBe('mustReplace');
    expect(() => discard(r, 2, idOf(r, 2, 'p2'), 0)).toThrow(/replacement/);
    r = drawReplacement(r, 2, 10);
    expect(r.core.hands[2]!.at(-1)!.type).toBe('m9');
    expect(r.core.phase).toBe('mustDiscard');
  });

  it('concealed 槓 on your own turn', () => {
    const hands: Setup['hands'] = ['dG dG dG dG m5 m6 m7 m8 m9 p1 p2 p3 s1 dR', S[1], S[2], S[3]];
    let r = setupRound({ hands, back: 'm2' });
    expect(availableActions(r, 0, 0).concealedGongs).toEqual(['dG']);
    r = concealedGong(r, 0, 'dG', 0);
    expect(r.core.melds[0]![0]).toMatchObject({ kind: 'gong', concealed: true });
    r = drawReplacement(r, 0, 0);
    expect(r.core.hands[0]).toHaveLength(11);
  });

  it('a win on the gong replacement tile scores 槓上開花', () => {
    const hands: Setup['hands'] = [
      S[0],
      S[1],
      'dR dR dR m1 m1 m1 s7 s8 wS wS wS wW wW',
      'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN p9',
    ];
    let r = dealerDiscards(setupRound({ hands, back: 's9' }), 'dR');
    r = claim(r, 2, { kind: 'gong' }, 0);
    r = drawReplacement(r, 2, 0);
    expect(availableActions(r, 2, 0).selfDrawWin).toBe(true);
    r = selfDrawWin(r, 2, 0);
    expect(r.core.result!.type === 'win' && r.core.result!.items.map((i) => i.id)).toContain('gongReplacement');
  });

  it('robbing a gong 搶槓', () => {
    const hands: Setup['hands'] = [
      'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 s5',
      'p4 p5 p6 p7 p8 p9 s2 s3 s4 wE wE wE dG',
      's5 s5 s5 m1 m1 wS wS wS wW wW wW p2 dR',
      'm5 m6 m7 p1 p2 p3 s6 s7 wN wN wN dW dW', // waiting on s5 or s8
    ];
    let r = dealerDiscards(setupRound({ hands }), 's5', 0);
    r = claim(r, 2, { kind: 'pong' }, 100);
    r = addedGong(r, 2, 's5', 200);
    expect(() => claim(r, 1, { kind: 'pong' }, 300)).toThrow(/only 胡/);
    r = claim(r, 3, { kind: 'win' }, 300);
    const result = r.core.result!;
    expect(result).toMatchObject({ type: 'win', winner: 3, discarder: 2 });
    expect(result.type === 'win' && result.items.map((i) => i.id)).toContain('robbingGong');
    expect(r.core.melds[2]![0]).toMatchObject({ kind: 'pong' });
    expect(r.core.melds[2]![0]!.tiles).toHaveLength(3);
  });
});

describe('flowers during play', () => {
  it('a drawn flower goes to the flower area and a replacement must be drawn', () => {
    let r = setupRound({ hands: S, front: 'f2', back: 'm9', settings: { flowersOn: true } });
    r = dealerDiscards(r, 's1');
    r = draw(r, 1, 0);
    expect(r.core.flowers[1]!.map((t) => t.type)).toEqual(['f2']);
    expect(r.core.phase).toBe('mustReplace');
    expect(() => discard(r, 1, idOf(r, 1, 'wE'), 0)).toThrow(/replacement/);
    r = drawReplacement(r, 1, 0);
    expect(r.core.hands[1]!.at(-1)!.type).toBe('m9');
    expect(r.core.phase).toBe('mustDiscard');
  });
});

describe('winning', () => {
  it('self-draw 自摸: everyone pays double', () => {
    const hands: Setup['hands'] = [S[0], 'm2 m3 m4 p5 p6 p7 s3 s4 s5 wE wE wE dG', S[2], S[3]];
    let r = dealerDiscards(setupRound({ hands, front: 'dG' }), 's1');
    r = draw(r, 1, 0);
    r = selfDrawWin(r, 1, 0);
    const res = r.core.result!;
    expect(res).toMatchObject({ type: 'win', winner: 1, discarder: null });
    if (res.type !== 'win') throw new Error();
    expect(res.items.map((i) => i.id)).toContain('selfDraw');
    expect(res.changes[0]).toBe(res.changes[2]);
    expect(res.changes[2]).toBe(res.changes[3]);
    expect(res.changes.reduce((a, b) => a + b)).toBe(0);
  });

  it('cannot self-draw win without having just drawn', () => {
    const r = claim(dealerDiscards(table(), 'dR'), 2, { kind: 'pong' }, 0);
    expect(() => selfDrawWin(r, 2, 0)).toThrow();
  });

  it('heavenly hand 天胡: dealer wins on the deal', () => {
    const r = setupRound({ hands: ['m1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 s1', S[1], S[2], S[3]] });
    const res = selfDrawWin(r, 0, 0).core.result!;
    expect(res.type === 'win' && res.items.map((i) => i.id)).toEqual(['heavenly']);
  });

  it('earthly hand 地胡: winning on the dealer\'s first discard', () => {
    const r = claim(dealerDiscards(table(), 'dR'), 3, { kind: 'win' }, 0);
    const res = r.core.result!;
    expect(res.type === 'win' && res.items.map((i) => i.id)).toEqual(['earthly']);
  });

  it('chicken win (below minimum fan): winner pays 32 to each', () => {
    // Seat 1 wins with a plain hand worth only a little, minimum fan 9.
    const hands: Setup['hands'] = [S[0], 'm2 m3 m4 p5 p6 p7 s3 s4 s5 s7 s8 wE wE', S[2], 'm5 m6 m7 p1 p2 p3 s6 s7 wN wN wN dW dW'];
    let r = setupRound({ hands, front: 's9', settings: { minFan: 9 } });
    r = dealerDiscards(r, 's1');
    r = draw(r, 1, 0);
    r = selfDrawWin(r, 1, 0);
    expect(r.core.result).toMatchObject({ isChicken: true, changes: [32, -96, 32, 32] });
  });
});

describe('the wall running out', () => {
  it('is a draw when the next player tries to draw from an empty wall', () => {
    let r = startRound({ dealer: 0, roundWind: 0, settings: { ...DEFAULT_SETTINGS, flowersOn: false }, rng: seededRng(3) });
    let t = 0;
    while (r.core.phase !== 'ended') {
      const seat = r.core.turn;
      if (r.core.phase === 'mustDiscard') r = discard(r, seat, r.core.hands[seat]!.at(-1)!.id, (t += 10));
      else if (r.core.phase === 'mustDraw') r = draw(r, seat, (t += 10));
      else r = drawReplacement(r, seat, (t += 10));
    }
    expect(r.core.result).toEqual({ type: 'draw' });
    expect(tilesLeft(r.core.wall)).toBe(0);
  });
});

describe('undo', () => {
  it('the next player can undo a discard: the tile goes back and it is the discarder\'s turn', () => {
    let r = dealerDiscards(table(), 'dR');
    expect(availableActions(r, 1, 0).undo).toBe(true);
    expect(availableActions(r, 0, 0).undo).toBe(false);
    r = undo(r, 1);
    expect(r.core.turn).toBe(0);
    expect(r.core.phase).toBe('mustDiscard');
    expect(r.core.hands[0]).toHaveLength(14);
    expect(r.core.discards).toHaveLength(0);
  });

  it('only the current player can undo', () => {
    const r = dealerDiscards(table(), 'dR');
    expect(() => undo(r, 0)).toThrow(/Only the player whose turn/);
    expect(() => undo(r, 2)).toThrow(/Only the player whose turn/);
  });

  it('multiple undos go most recent first (example from the notes)', () => {
    // Seat 0 moves, then seat 1 moves; now it is seat 2's turn.
    let r = dealerDiscards(table(), 's1');
    const wallAfterFirst = tilesLeft(r.core.wall);
    r = draw(r, 1, 0);
    r = discard(r, 1, idOf(r, 1, 'wE'), 0);
    expect(r.core.turn).toBe(2);
    // Seat 2 undoes seat 1's move: seat 1 holds 14 tiles again.
    r = undo(r, 2);
    expect(r.core.turn).toBe(1);
    expect(r.core.hands[1]).toHaveLength(14);
    // Now seat 1 undoes seat 0's move: seat 1's draw goes back to the wall.
    r = undo(r, 1);
    expect(r.core.turn).toBe(0);
    expect(tilesLeft(r.core.wall)).toBe(wallAfterFirst);
    expect(r.core.hands[0]).toHaveLength(14);
    expect(r.history).toHaveLength(0);
    expect(() => undo(r, 0)).toThrow(/nothing to undo/);
  });

  it('undoing a 碰 puts the tile back on the table', () => {
    let r = claim(dealerDiscards(table(), 'dR'), 2, { kind: 'pong' }, 0);
    r = undo(r, 2);
    expect(r.core.melds[2]).toHaveLength(0);
    expect(r.core.discards).toHaveLength(1);
    expect(r.core.turn).toBe(1);
  });

  it('undoing a win needs everyone to agree', () => {
    let r = claim(dealerDiscards(table(), 'dR'), 3, { kind: 'win' }, 0);
    expect(() => undo(r, 1)).toThrow(/agree/);
    r = undo(r, 1, true);
    expect(r.core.result).toBeNull();
    expect(r.core.phase).toBe('mustDraw');
  });
});

describe('random play never loses or creates a tile', () => {
  it('survives 60 random rounds of legal moves, claims and undos', () => {
    const rng = seededRng(2024);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]!;
    for (let game = 0; game < 60; game++) {
      let r = startRound({
        dealer: game % 4,
        roundWind: 0,
        settings: { ...DEFAULT_SETTINGS, flowersOn: game % 2 === 0 },
        rng,
      });
      let now = 0;
      for (let step = 0; step < 400 && r.core.phase !== 'ended'; step++) {
        now += Math.floor(rng() * 4000);
        const options: (() => RoundState)[] = [];
        for (let seat = 0; seat < 4; seat++) {
          const a = availableActions(r, seat, now);
          if (a.draw) options.push(() => draw(r, seat, now));
          if (a.drawReplacement) options.push(() => drawReplacement(r, seat, now));
          if (a.discard) {
            const hand = r.core.hands[seat]!;
            options.push(() => discard(r, seat, pick(hand).id, now), () => discard(r, seat, pick(hand).id, now));
          }
          if (a.selfDrawWin) options.push(() => selfDrawWin(r, seat, now));
          for (const g of a.concealedGongs) options.push(() => concealedGong(r, seat, g, now));
          for (const g of a.addedGongs) options.push(() => addedGong(r, seat, g, now));
          for (const ids of a.chow) options.push(() => claim(r, seat, { kind: 'chow', tileIds: ids }, now));
          if (a.pong) options.push(() => claim(r, seat, { kind: 'pong' }, now));
          if (a.gong) options.push(() => claim(r, seat, { kind: 'gong' }, now));
          if (a.win) options.push(() => claim(r, seat, { kind: 'win' }, now));
          if (a.undo && rng() < 0.2) options.push(() => undo(r, seat));
        }
        expect(options.length).toBeGreaterThan(0);
        r = pick(options)(); // every move re-checks the full tile set
      }
    }
  });
});
