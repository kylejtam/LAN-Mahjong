import { describe, expect, it } from 'vitest';
import {
  breakSeat, buildTileSet, buildWall, dealRound, drawBack, drawFront, isFlower, seededRng,
  stacksPerWall, tilesLeft, wallTiles, checkTileSet,
} from '../src/index.js';

describe('wall', () => {
  it('has 36 tiles (18 stacks) per player with flowers, 34 (17 stacks) without', () => {
    expect(stacksPerWall(true) * 2).toBe(36);
    expect(stacksPerWall(false) * 2).toBe(34);
  });

  it('breaks the correct seat for the dice total (dealer counts as 1)', () => {
    expect(breakSeat(0, 5)).toBe(0); // 5, 9, 13, 17 → dealer's own wall
    expect(breakSeat(0, 6)).toBe(1); // next player
    expect(breakSeat(0, 7)).toBe(2); // opposite
    expect(breakSeat(0, 8)).toBe(3); // previous player
    expect(breakSeat(2, 3)).toBe(0);
  });

  it('starts drawing S stacks in from the right end of the broken wall', () => {
    const wall = buildWall(buildTileSet(true), 0, [2, 3, 4]); // total 9 → dealer's wall
    expect(wall.stacks[0]).toMatchObject({ seat: 0, position: 9 });
    expect(wall.stacks.at(-1)).toMatchObject({ seat: 0, position: 8 });
  });

  it('draws from the front and replacements from the back', () => {
    const tiles = buildTileSet(false);
    const wall = buildWall(tiles, 0, [1, 1, 1]);
    const first = wall.stacks[0]!.tiles[0]!;
    const last = wall.stacks.at(-1)!.tiles[0]!;
    expect(drawFront(wall)).toBe(first);
    expect(drawBack(wall)).toBe(last);
    expect(tilesLeft(wall)).toBe(134);
  });
});

describe('dealing', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);

  for (const flowersOn of [true, false]) {
    const label = flowersOn ? 'flowers on' : 'flowers off';

    it(`gives the dealer 14 and everyone else 13 (${label}, every dealer seat, 200 shuffles)`, () => {
      for (const seed of seeds) {
        const dealer = seed % 4;
        const r = dealRound({ dealer, flowersOn, rng: seededRng(seed) });
        for (let seat = 0; seat < 4; seat++) {
          expect(r.hands[seat]).toHaveLength(seat === dealer ? 14 : 13);
        }
      }
    });

    it(`never loses or duplicates a tile (${label}, 200 shuffles)`, () => {
      for (const seed of seeds) {
        const r = dealRound({ dealer: 0, flowersOn, rng: seededRng(seed) });
        const all = [...r.hands.flat(), ...r.flowers.flat(), ...wallTiles(r.wall)];
        expect(checkTileSet(all, flowersOn)).toEqual([]);
      }
    });
  }

  it('sets aside every flower and replaces it (flowers on)', () => {
    let flowersSeen = 0;
    for (const seed of seeds) {
      const r = dealRound({ dealer: 1, flowersOn: true, rng: seededRng(seed) });
      for (let seat = 0; seat < 4; seat++) {
        expect(r.hands[seat]!.some((t) => isFlower(t.type))).toBe(false);
        expect(r.flowers[seat]!.every((t) => isFlower(t.type))).toBe(true);
        flowersSeen += r.flowers[seat]!.length;
      }
      const totalFlowers = r.flowers.flat().length;
      expect(tilesLeft(r.wall)).toBe(144 - 53 - totalFlowers);
    }
    expect(flowersSeen).toBeGreaterThan(0); // the test really did see flowers
  });

  it('has no flowers at all with flowers off', () => {
    const r = dealRound({ dealer: 0, flowersOn: false, rng: seededRng(7) });
    expect(r.flowers.flat()).toHaveLength(0);
    expect(tilesLeft(r.wall)).toBe(136 - 53);
  });

  it('uses the dice it is given', () => {
    const r = dealRound({ dealer: 0, flowersOn: true, rng: seededRng(1), dice: [6, 6, 6] });
    expect(r.dice).toEqual([6, 6, 6]);
  });

  it('rejects a bad dealer seat', () => {
    expect(() => dealRound({ dealer: 4, flowersOn: true, rng: seededRng(1) })).toThrow();
  });
});
