import { describe, expect, it } from 'vitest';
import { NormalType, sortHand } from '../src/index.js';

let id = 0;
const t = (s: string) => s.split(' ').map((type) => ({ id: id++, type: type as NormalType }));
const types = (s: string) => sortHand(t(s)).map((x) => x.type).join(' ');

describe('sorting a hand', () => {
  it('suits: fewest on the left, most on the right, each 1 to 9', () => {
    // 1 bamboo, 2 dots, 3 characters → bamboo, dots, characters
    expect(types('m5 p9 m1 s4 p2 m3')).toBe('s4 p2 p9 m1 m3 m5');
  });

  it('winds East South West North after the suits, dragons on the far right', () => {
    expect(types('wN dR m2 wE wW wS m1')).toBe('m1 m2 wE wS wW wN dR');
  });

  it('dragons: fewest of the same dragon first, most last', () => {
    // two 中, one 發, three 白 → 發, 中 中, 白 白 白
    expect(types('dW dR dG dW dR dW')).toBe('dG dR dR dW dW dW');
  });

  it('ties keep the usual order (characters, dots, bamboo; 中 發 白)', () => {
    expect(types('s1 p1 m1 dW dG dR')).toBe('m1 p1 s1 dR dG dW');
  });

  it('a full example', () => {
    // 2 characters, 3 dots, 4 bamboo; one 中 and two 白.
    expect(types('p3 dR m7 wS s2 s3 p1 m7 dW dW s8 wE p2 s9')).toBe(
      'm7 m7 p1 p2 p3 s2 s3 s8 s9 wE wS dR dW dW',
    );
  });

  it('never adds or loses a tile', () => {
    const hand = t('m1 m1 p5 dR wE s9 s8 m4 p6 dG');
    expect(sortHand(hand).map((x) => x.id).sort()).toEqual(hand.map((x) => x.id).sort());
  });
});
