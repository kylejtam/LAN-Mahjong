import { describe, expect, it } from 'vitest';
import { seededRng, tilesLeft } from '@lan-mahjong/shared';
import { Command, Room, cpuTick, createTutorialRoom, handleCommand, joinRoom } from '../src/game/room.js';
import { viewFor } from '../src/game/view.js';
import { STAGES } from '../src/game/tutorial.js';

const rng = seededRng(7);
let clock = 1_000_000;

describe('the tutorial', () => {
  it('plays from the deal to your win, every step in order', () => {
    let r: Room = createTutorialRoom('tut-1', clock);
    r = joinRoom(r, 'Kyle', clock).room;
    const you = (c: Command): void => {
      r = handleCommand(r, 'kyle', c, (clock += 500), rng);
    };
    const hand = () => r.match.round!.core.hands[0]!;
    const id = (type: string) => hand().find((t) => t.type === type)!.id;
    const stageId = () => STAGES[r.tutorial!.stage]!.id;
    /** Let the computer players make their scripted moves. */
    const cpus = (): void => {
      for (let i = 0; i < 40 && 'cpu' in STAGES[r.tutorial!.stage]!; i++) {
        r = cpuTick(r, (clock += 4000), rng);
        // Nothing moves on by itself: after the computer players' moves, you press Next.
        if (viewFor(r, 'kyle', clock).tutorial?.waitingNext) you({ type: 'tutorialNext' });
      }
    };

    you({ type: 'takeSeat', seat: 0 });
    you({ type: 'pressStart' });
    expect(r.phase).toBe('betweenRounds'); // Ready, Unready, Ready
    you({ type: 'unready' });
    you({ type: 'pressStart' });
    expect(r.phase).toBe('rolling');
    you({ type: 'rollDice' });
    expect(r.phase).toBe('playing');
    // The prepared deal: your 14 tiles and your two flowers.
    expect(hand().map((t) => t.type).sort()).toEqual(['dR', 'dR', 'm1', 'm9', 'm9', 'm9', 'p2', 's4', 's5', 's7', 'wE', 'wE', 'wE', 'wN']);
    expect(r.match.round!.core.flowers[0]!.map((t) => t.type).sort()).toEqual(['f1', 'f3']);
    expect(viewFor(r, 'kyle', clock).justDrawnId).toBeNull();

    // Moves the step doesn't ask for are refused.
    expect(() => you({ type: 'discard', tileId: id('wN') })).toThrow(/tutorial/);

    you({ type: 'reorderHand', tileIds: hand().map((t) => t.id).reverse() });
    you({ type: 'discard', tileId: id('m1') });
    you({ type: 'undo' });
    you({ type: 'discard', tileId: id('m1') });
    cpus();
    expect(r.match.round!.core.flowers[2]!.map((t) => t.type)).toEqual(['n3']);
    you({ type: 'hold', kind: 'pong' });
    you({ type: 'claim', claim: { kind: 'pong' } });
    you({ type: 'discard', tileId: id('wN') });
    cpus();
    expect(stageId()).toBe('holdSeung');
    you({ type: 'hold', kind: 'chow' });
    you({ type: 'claim', claim: { kind: 'chow', tileIds: [id('s4'), id('s5')] } });
    you({ type: 'discard', tileId: id('s7') });
    cpus();
    expect(r.match.round!.core.melds[1]!.length).toBe(1); // Ming's Seung
    expect(r.match.round!.core.melds[2]!.length).toBe(1); // Fong's Pung
    you({ type: 'hold', kind: 'pong' });
    you({ type: 'releaseHold' });
    you({ type: 'hold', kind: 'gong' });
    you({ type: 'claim', claim: { kind: 'gong' } });
    you({ type: 'drawReplacement' });
    you({ type: 'discard', tileId: id('p7') });
    cpus();
    expect(r.match.round!.core.melds[3]!.length).toBe(1); // Kei's Gong
    you({ type: 'draw' });
    expect(r.match.round!.core.flowers[0]!.map((t) => t.type)).toContain('n2');
    you({ type: 'drawReplacement' });
    you({ type: 'concealedGong', tileType: 'wE' });
    you({ type: 'drawReplacement' });
    you({ type: 'addedGong', tileType: 'dR' });
    you({ type: 'drawReplacement' });
    you({ type: 'discard', tileId: id('m8') });
    expect(hand().map((t) => t.type)).toEqual(['p2']);
    you({ type: 'setPrefs', prefs: { callAll: true } });
    cpus();
    // Call all possible claims held Fong's 2 dots for you.
    expect(r.match.round!.window!.holds).toEqual([{ seat: 0, kind: null }]);
    you({ type: 'hold', kind: 'win' });
    you({ type: 'claim', claim: { kind: 'win' } });
    const result = r.match.round!.core.result!;
    expect(result.type).toBe('win');
    expect(stageId()).toBe('won');
    expect(tilesLeft(r.match.round!.core.wall)).toBeGreaterThan(50);
  });
});
