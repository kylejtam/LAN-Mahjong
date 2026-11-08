import { describe, expect, it } from 'vitest';
import { CHIPS_TABLE, DEFAULT_SETTINGS, FAN_TABLE } from '../src/index.js';
import { readFileSync } from 'node:fs';

describe('help tables and defaults', () => {
  it('default minimum fan is 1', () => {
    expect(DEFAULT_SETTINGS.minFan).toBe(1);
  });

  it('chips table matches the approved table', () => {
    expect(CHIPS_TABLE.map((r) => r.base)).toEqual([1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128]);
    expect(CHIPS_TABLE.at(-1)!.label).toBe('10+');
  });

  it('every fan table entry is scored with the same fan by the scoring code', () => {
    const code = readFileSync(new URL('../src/scoring.ts', import.meta.url), 'utf8');
    for (const row of FAN_TABLE) {
      // The scoring code uses the same id (some with a suffix, e.g. dragon_31).
      const found = new RegExp(`item\\(\`?'?${row.id}[^,]*, (\\d+|MAX_FAN),`).exec(code);
      expect(found, `scoring code is missing ${row.id}`).not.toBeNull();
      const fan = found![1] === 'MAX_FAN' ? 10 : Number(found![1]);
      expect(fan, row.id).toBe(row.fan);
    }
  });
});
