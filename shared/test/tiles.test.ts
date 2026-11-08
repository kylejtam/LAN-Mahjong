import { describe, expect, it } from 'vitest';
import {
  FLOWERS, NORMAL_TYPES, buildTileSet, checkTileSet, assertTileSet, tileCount, shuffle, seededRng,
} from '../src/index.js';

describe('tile set', () => {
  it('has 34 normal tile types', () => {
    expect(NORMAL_TYPES).toHaveLength(34);
    expect(new Set(NORMAL_TYPES).size).toBe(34);
  });

  it('has 144 tiles with flowers on', () => {
    expect(tileCount(true)).toBe(144);
    expect(buildTileSet(true)).toHaveLength(144);
  });

  it('has 136 tiles with flowers off', () => {
    expect(tileCount(false)).toBe(136);
    expect(buildTileSet(false)).toHaveLength(136);
  });

  for (const flowersOn of [true, false]) {
    it(`has exactly 4 copies of each of the 34 types (flowers ${flowersOn ? 'on' : 'off'})`, () => {
      const tiles = buildTileSet(flowersOn);
      for (const type of NORMAL_TYPES) {
        expect(tiles.filter((t) => t.type === type)).toHaveLength(4);
      }
    });

    it(`gives every tile a unique id (flowers ${flowersOn ? 'on' : 'off'})`, () => {
      const tiles = buildTileSet(flowersOn);
      expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
    });

    it(`passes the full-set check (flowers ${flowersOn ? 'on' : 'off'})`, () => {
      expect(checkTileSet(buildTileSet(flowersOn), flowersOn)).toEqual([]);
    });
  }

  it('has exactly one of each of the 8 flowers when on', () => {
    const tiles = buildTileSet(true);
    expect(FLOWERS).toHaveLength(8);
    for (const f of FLOWERS) expect(tiles.filter((t) => t.type === f)).toHaveLength(1);
  });

  it('has no flowers when off', () => {
    const tiles = buildTileSet(false);
    for (const f of FLOWERS) expect(tiles.filter((t) => t.type === f)).toHaveLength(0);
  });

  it('keeps every tile when shuffled', () => {
    const tiles = buildTileSet(true);
    const shuffled = shuffle(tiles, seededRng(42));
    expect(shuffled.map((t) => t.type)).not.toEqual(tiles.map((t) => t.type));
    expect(checkTileSet(shuffled, true)).toEqual([]);
  });
});

describe('full-set check catches mistakes', () => {
  it('catches a missing tile', () => {
    const tiles = buildTileSet(true).slice(1);
    expect(checkTileSet(tiles, true).length).toBeGreaterThan(0);
    expect(() => assertTileSet(tiles, true)).toThrow();
  });

  it('catches a duplicated tile (same id twice)', () => {
    const tiles = buildTileSet(false);
    tiles[1] = tiles[0]!;
    expect(checkTileSet(tiles, false).join(' ')).toMatch(/more than once/);
  });

  it('catches a fifth copy of a type', () => {
    const tiles = buildTileSet(false);
    tiles[tiles.length - 1] = { id: 999, type: 'm1' };
    expect(checkTileSet(tiles, false).join(' ')).toMatch(/Expected 4 of m1 but found 5/);
  });

  it('catches a duplicated flower', () => {
    const tiles = buildTileSet(true);
    tiles[tiles.length - 1] = { id: 999, type: 'f1' };
    expect(checkTileSet(tiles, true).join(' ')).toMatch(/Expected 1 of f1 but found 2/);
  });

  it('catches flowers in a game with flowers off', () => {
    expect(checkTileSet(buildTileSet(true), false).length).toBeGreaterThan(0);
  });
});
