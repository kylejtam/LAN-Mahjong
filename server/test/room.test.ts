import { describe, expect, it } from 'vitest';
import { NORMAL_TYPES, seededRng, sortHand } from '@lan-mahjong/shared';
import { Command, HostCommand, Room, cpuTick, createRoom, disconnect, handleCommand, handleHostCommand, joinRoom, settleWall } from '../src/game/room.js';
import { hostViewOf, viewFor } from '../src/game/view.js';
import { discard, draw } from '../src/game/round.js';
import { idOf, setupRound } from './helpers.js';

const rng = seededRng(99);
let clock = 1000;
const tick = (): number => (clock += 100);

/** A game created on the host page (nobody in it yet). */
function emptyRoom(): Room {
  return createRoom({ id: 'r1', name: 'Friday game', startingBalance: 1000, now: tick() });
}
const join = (room: Room, name: string): Room => joinRoom(room, name, tick()).room;
/** A game with Kyle joined as an ordinary player. */
const newRoom = (): Room => join(emptyRoom(), 'Kyle');
const cmd = (room: Room, who: string, c: Command): Room => handleCommand(room, who.toLowerCase(), c, tick(), rng);
/** A host control from the laptop's host page. */
const host = (room: Room, c: HostCommand): Room => handleHostCommand(room, c, tick());

/** Kyle, Amy, Ben, Cat each in seats 0-3. */
function fullTable(): Room {
  let r = newRoom();
  for (const n of ['Amy', 'Ben', 'Cat']) r = join(r, n);
  ['Kyle', 'Amy', 'Ben', 'Cat'].forEach((n, seat) => (r = cmd(r, n, { type: 'takeSeat', seat })));
  return r;
}

function startedTable(): Room {
  let r = fullTable();
  for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'pressStart' });
  return cmd(r, 'Kyle', { type: 'rollDice' }); // Kyle is seat 0, the first dealer
}

describe('creating and joining', () => {
  it('a game is created empty (on the host page); people who join get the starting balance', () => {
    const empty = emptyRoom();
    expect(Object.keys(empty.people)).toHaveLength(0);
    expect(empty.name).toBe('Friday game');
    expect(newRoom().people.kyle!.balance).toBe(1000);
  });

  it('needs a game name and a display name', () => {
    expect(() => createRoom({ id: 'x', name: ' ', startingBalance: 0, now: 0 })).toThrow();
    expect(() => joinRoom(newRoom(), '   ', 0)).toThrow(/enter a name/);
  });

  it('names are not case sensitive: same name while connected is refused', () => {
    expect(() => join(newRoom(), 'KYLE')).toThrow(/already in use/);
  });

  it('same name after a disconnect = same person, same seat, same balance', () => {
    let r = fullTable();
    r.people.amy!.balance = 1234;
    r = disconnect(r, 'amy', tick());
    expect(r.people.amy!.connected).toBe(false);
    r = join(r, 'aMy');
    expect(r.people.amy!.connected).toBe(true);
    expect(r.seats[1]).toBe('amy');
    expect(r.people.amy!.balance).toBe(1234);
  });
});

describe('seats', () => {
  it('a taken seat cannot be chosen', () => {
    let r = join(newRoom(), 'Amy');
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 2 });
    expect(() => cmd(r, 'Amy', { type: 'takeSeat', seat: 2 })).toThrow(/taken/);
  });

  it('players can move to an empty seat between rounds, but not during a round', () => {
    let r = newRoom();
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 0 });
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 3 });
    expect(r.seats).toEqual([null, null, null, 'kyle']);
    const playing = startedTable();
    expect(() => cmd(playing, 'Kyle', { type: 'leaveSeat' })).toThrow(/between rounds/);
  });
});

describe('round start sequence', () => {
  it('waits for every seated player to press Start, then the dealer rolls', () => {
    let r = fullTable();
    for (const n of ['Kyle', 'Amy', 'Ben']) r = cmd(r, n, { type: 'pressStart' });
    expect(r.phase).toBe('betweenRounds');
    r = cmd(r, 'Cat', { type: 'pressStart' });
    expect(r.phase).toBe('rolling');
    expect(() => cmd(r, 'Amy', { type: 'rollDice' })).toThrow(/Only the dealer/);
    r = cmd(r, 'Kyle', { type: 'rollDice' });
    expect(r.phase).toBe('playing');
    expect(r.match.round!.core.hands[0]).toHaveLength(14);
    expect(r.match.round!.core.hands[1]).toHaveLength(13);
  });

  it('cannot start with an empty seat', () => {
    let r = join(newRoom(), 'Amy');
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 0 });
    r = cmd(r, 'Amy', { type: 'takeSeat', seat: 1 });
    r = cmd(r, 'Kyle', { type: 'pressStart' });
    r = cmd(r, 'Amy', { type: 'pressStart' });
    expect(r.phase).toBe('betweenRounds');
  });
});

describe('what each device can see', () => {
  it('a player sees only their own hand', () => {
    const r = startedTable();
    const v = viewFor(r, 'amy', tick());
    expect(v.seats[1]!.hand).toHaveLength(13);
    expect(v.seats[0]!.hand).toBeNull();
    expect(v.seats[0]!.handCount).toBe(14);
    expect(v.seats[2]!.hand).toBeNull();
  });

  it('never sends the faces of wall tiles', () => {
    const r = startedTable();
    const v = viewFor(r, 'amy', tick());
    expect(JSON.stringify(v.round!.wall)).not.toMatch(/type/);
    const flowersSetAside = r.match.round!.core.flowers.flat().length;
    expect(v.round!.wallCount).toBe(144 - 53 - flowersSetAside);
  });

  it('never sends another player\'s hidden tiles anywhere in the message', () => {
    const r = startedTable();
    const v = JSON.stringify(viewFor(r, 'amy', tick()));
    for (const t of r.match.round!.core.hands[0]!) expect(v).not.toContain(`"id":${t.id},`);
  });

  it('spectators see no hands at first, and choose which hands to see', () => {
    let r = join(startedTable(), 'Spec');
    expect(viewFor(r, 'spec', tick()).seats.every((s) => s.hand === null)).toBe(true);
    r = cmd(r, 'Spec', { type: 'setWatchedSeat', seat: 2, visible: true });
    let v = viewFor(r, 'spec', tick());
    expect(v.seats[2]!.hand).toHaveLength(13);
    expect(v.seats[2]!.watched).toBe(true);
    expect(v.seats[1]!.hand).toBeNull();
    r = cmd(r, 'Spec', { type: 'setWatchedSeat', seat: 2, visible: false });
    v = viewFor(r, 'spec', tick());
    expect(v.seats[2]!.hand).toBeNull();
  });

  it('"All hands" shows every hand to a spectator without changing their own choices', () => {
    let r = join(startedTable(), 'Spec');
    r = cmd(r, 'Spec', { type: 'setWatchedSeat', seat: 1, visible: true });
    r = cmd(r, 'Spec', { type: 'setWatchAll', visible: true });
    let v = viewFor(r, 'spec', tick());
    expect(v.you.watchAll).toBe(true);
    expect(v.seats.map((s) => s.hand?.length)).toEqual([14, 13, 13, 13]);
    r = cmd(r, 'Spec', { type: 'setWatchAll', visible: false });
    v = viewFor(r, 'spec', tick());
    expect(v.seats.map((s) => s.hand?.length ?? null)).toEqual([null, 13, null, null]);
  });

  it('a seated player cannot use "All hands" to see other hands', () => {
    const r = cmd(startedTable(), 'Amy', { type: 'setWatchAll', visible: true });
    expect(viewFor(r, 'amy', tick()).seats[2]!.hand).toBeNull();
    expect(viewFor(r, 'amy', tick()).you.watchAll).toBe(false);
  });

  it('a seated player cannot use spectator hand choices to see other hands', () => {
    const r = cmd(startedTable(), 'Amy', { type: 'setWatchedSeat', seat: 2, visible: true });
    expect(viewFor(r, 'amy', tick()).seats[2]!.hand).toBeNull();
  });

  it('only shows a player their own buttons', () => {
    const r = startedTable();
    expect(viewFor(r, 'kyle', tick()).actions!.discard).toBe(true);
    expect(viewFor(r, 'amy', tick()).actions!.discard).toBe(false);
    expect(viewFor(join(r, 'Spec'), 'spec', tick()).actions).toBeNull();
  });
});

describe('playing through the room', () => {
  it('moves go to the round engine and checks whose turn it is', () => {
    let r = startedTable();
    const tile = r.match.round!.core.hands[0]![0]!;
    expect(() => cmd(r, 'Amy', { type: 'discard', tileId: tile.id })).toThrow(/not your turn/);
    r = cmd(r, 'Kyle', { type: 'discard', tileId: tile.id });
    expect(r.match.round!.core.discards).toHaveLength(1);
  });

  it('a player can reorder their hand', () => {
    let r = startedTable();
    const ids = r.match.round!.core.hands[1]!.map((t) => t.id).reverse();
    r = cmd(r, 'Amy', { type: 'reorderHand', tileIds: ids });
    expect(r.match.round!.core.hands[1]!.map((t) => t.id)).toEqual(ids);
    expect(() => cmd(r, 'Amy', { type: 'reorderHand', tileIds: ids.slice(1) })).toThrow();
  });

  it('after a round ends, everyone must confirm before balances change and the next round', () => {
    let r = startedTable();
    // Force a finished round: seat 1 won, seat 0 paid.
    const round = r.match.round!;
    r = { ...r, match: { ...r.match, round: { ...round, core: { ...round.core, phase: 'ended', result: { type: 'win', winner: 1, discarder: 0, fan: 3, items: [], capHand: false, isChicken: false, changes: [-16, 32, -8, -8] } } } } };
    for (const n of ['Kyle', 'Amy', 'Ben']) r = cmd(r, n, { type: 'confirmRound' });
    expect(r.people.amy!.balance).toBe(1000);
    r = cmd(r, 'Cat', { type: 'confirmRound' });
    expect(r.people.amy!.balance).toBe(1032);
    expect(r.people.kyle!.balance).toBe(984);
    // Everyone pressed Ready, so the next round starts straight away (dealer rolls).
    expect(r.phase).toBe('rolling');
    expect(r.match.dealer).toBe(1); // someone other than the dealer won
  });
});

describe('end of a round', () => {
  function endWith(r: Room, isChicken: boolean): Room {
    const round = r.match.round!;
    // Record a real 'win' move so undo has something to undo.
    const before = round.core;
    return {
      ...r,
      match: {
        ...r.match,
        round: {
          ...round,
          history: [...round.history, { move: 'win', seat: 1, before, windowBefore: null }],
          core: { ...before, phase: 'ended', result: { type: 'win', winner: 1, discarder: 0, fan: 1, items: [], capHand: false, isChicken, changes: isChicken ? [32, -96, 32, 32] : [-4, 8, -2, -2] } },
        },
      },
    };
  }

  it('only a chicken win can be undone (everyone must agree)', () => {
    expect(() => cmd(endWith(startedTable(), false), 'Amy', { type: 'undo' })).toThrow(/Only a chicken win/);
    let r = endWith(startedTable(), true);
    for (const n of ['Kyle', 'Amy', 'Ben']) r = cmd(r, n, { type: 'undo' });
    expect(r.match.round!.core.phase).toBe('ended');
    r = cmd(r, 'Cat', { type: 'undo' });
    expect(r.match.round!.core.result).toBeNull();
  });

  it('Ready starts the next round once every seated player has pressed it', () => {
    let r = endWith(startedTable(), false);
    for (const n of ['Kyle', 'Amy', 'Ben']) r = cmd(r, n, { type: 'confirmRound' });
    expect(r.phase).toBe('playing');
    r = cmd(r, 'Cat', { type: 'confirmRound' });
    expect(r.phase).toBe('rolling');
  });

  it('Leave seat at the end of a round: the round still closes, and the next waits for a full table', () => {
    let r = endWith(startedTable(), false);
    r = cmd(r, 'Cat', { type: 'dropOut', replacement: { none: true } });
    for (const n of ['Kyle', 'Amy', 'Ben']) r = cmd(r, n, { type: 'confirmRound' });
    expect(r.phase).toBe('betweenRounds');
    expect(r.seats[3]).toBeNull();
  });
});

describe('host controls (laptop host page only)', () => {
  /** Kyle in seat 0 and three CPUs, round started. */
  const kyleCpus = (): Room => {
    let r = newRoom();
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 0 });
    for (let seat = 1; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    r = cmd(r, 'Kyle', { type: 'pressStart' });
    return cmd(r, 'Kyle', { type: 'rollDice' });
  };

  it('players have no host commands', () => {
    const r = fullTable();
    expect(() => cmd(r, 'Amy', { type: 'hostResetBalances' } as unknown as Command)).toThrow();
  });

  it('table colour and settings', () => {
    let r = fullTable();
    r = host(r, { type: 'hostSetTableColour', colour: 'blue' });
    expect(r.tableColour).toBe('blue');
    r = host(r, { type: 'hostUpdateSettings', settings: { minFan: 3, flowersOn: false } });
    expect(r.match.settings).toMatchObject({ minFan: 3, flowersOn: false });
    expect(() => host(startedTable(), { type: 'hostUpdateSettings', settings: { minFan: 2 } })).toThrow(/between rounds/);
  });

  it('CPUs are named by level with (CPU) (names may repeat) and each keeps its own chips', () => {
    let r = emptyRoom();
    r = host(r, { type: 'hostSetSeat', seat: 0, cpu: 'easy' });
    r = host(r, { type: 'hostSetSeat', seat: 1, cpu: 'easy' });
    r = host(r, { type: 'hostSetSeat', seat: 2, cpu: 'hard' });
    const names = hostViewOf(r).seats.map((s) => s.name);
    expect(names).toEqual(['Easy (CPU)', 'Easy (CPU)', 'Hard (CPU)', null]);
    const key1 = hostViewOf(r).seats[1]!.key!;
    r = host(r, { type: 'hostSetBalance', name: 'Easy (CPU)', key: key1, balance: 123 });
    expect(hostViewOf(r).seats.map((s) => s.balance)).toEqual([1000, 123, 1000, null]);
    r = host(r, { type: 'hostSetSeat', seat: 1, cpu: 'medium' }); // same seat, new level, same chips
    expect(hostViewOf(r).seats[1]).toMatchObject({ name: 'Medium (CPU)', balance: 123 });
  });

  it('the host can name each CPU; (CPU) is always added and the name stays when the level changes', () => {
    let r = emptyRoom();
    r = host(r, { type: 'hostSetSeat', seat: 0, cpu: 'easy' });
    r = host(r, { type: 'hostNameCpu', seat: 0, name: 'Auntie May' });
    expect(hostViewOf(r).seats[0]).toMatchObject({ name: 'Auntie May (CPU)', cpuName: 'Auntie May' });
    r = host(r, { type: 'hostNameCpu', seat: 0, name: '  Uncle Wing (cpu) ' }); // typed "(CPU)" is not doubled
    expect(hostViewOf(r).seats[0]!.name).toBe('Uncle Wing (CPU)');
    r = host(r, { type: 'hostSetSeat', seat: 0, cpu: 'hard' });
    expect(hostViewOf(r).seats[0]!.name).toBe('Uncle Wing (CPU)');
    r = host(r, { type: 'hostNameCpu', seat: 0, name: '' }); // empty: back to the level
    expect(hostViewOf(r).seats[0]).toMatchObject({ name: 'Hard (CPU)', cpuName: null });
    expect(() => host(r, { type: 'hostNameCpu', seat: 1, name: 'Nobody' })).toThrow(/no CPU/);
    expect(() => host(r, { type: 'hostNameCpu', seat: 0, name: 'x'.repeat(30) })).toThrow(/at most/);
  });

  it('minimum fan can only be 0 to 3', () => {
    const r = fullTable();
    expect(host(r, { type: 'hostUpdateSettings', settings: { minFan: 0 } }).match.settings.minFan).toBe(0);
    expect(() => host(r, { type: 'hostUpdateSettings', settings: { minFan: 4 } })).toThrow(/0 to 3/);
  });

  it('the host page can type in any person\'s chip count (players cannot)', () => {
    let r = join(startedTable(), 'Spec');
    r = host(r, { type: 'hostSetBalance', name: 'AMY', balance: 1450 });
    r = host(r, { type: 'hostSetBalance', name: 'Spec', balance: -20 });
    expect(r.people.amy!.balance).toBe(1450);
    expect(r.people.spec!.balance).toBe(-20);
    expect(viewFor(r, 'ben', tick()).seats[1]!.balance).toBe(1450); // everyone sees it
    expect(() => host(r, { type: 'hostSetBalance', name: 'Nobody', balance: 5 })).toThrow(/nobody/);
    expect(() => host(r, { type: 'hostSetBalance', name: 'Amy', balance: 1.5 })).toThrow(/whole number/);
    expect(() => cmd(r, 'Amy', { type: 'hostSetBalance', name: 'Amy', balance: 9999 } as unknown as Command)).toThrow();
  });

  it('reset balances', () => {
    let r = fullTable();
    r.people.amy!.balance = 5;
    r = host(r, { type: 'hostResetBalances' });
    expect(r.people.amy!.balance).toBe(1000);
  });

  it('can fill a disconnected player\'s seat with a CPU, which keeps playing their hand', () => {
    let r = disconnect(startedTable(), 'amy', tick());
    r = host(r, { type: 'hostSetSeat', seat: 1, cpu: 'easy' });
    expect(r.people[r.seats[1]!]!.cpu).toBe('easy');
    expect(r.match.round!.core.hands[1]).toHaveLength(13);
    expect(r.people.amy!.balance).toBe(1000); // Amy keeps her balance
  });

  it('can replace any player with a CPU; the player becomes a spectator', () => {
    const r = host(fullTable(), { type: 'hostSetSeat', seat: 1, cpu: 'medium' });
    expect(r.people[r.seats[1]!]!.cpu).toBe('medium');
    expect(viewFor(r, 'amy', tick()).you.seat).toBeNull();
  });

  it('a player can take over a CPU seat between rounds, but not during a round', () => {
    let r = host(newRoom(), { type: 'hostSetSeat', seat: 0, cpu: 'easy' });
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 0 });
    expect(r.seats[0]).toBe('kyle');
    let full = join(join(join(emptyRoom(), 'Amy'), 'Ben'), 'Cat');
    for (let seat = 0; seat < 4; seat++) full = host(full, { type: 'hostSetSeat', seat, cpu: 'easy' });
    let now = clock;
    while (full.phase !== 'playing') full = cpuTick(full, (now += 1000), rng);
    expect(() => handleCommand(full, 'amy', { type: 'takeSeat', seat: 1 }, now, rng)).toThrow(/taken/);
  });

  it('can remove a CPU at any time so a player can sit there (mid-round the game waits)', () => {
    let r = kyleCpus();
    r = host(r, { type: 'hostSetSeat', seat: 2, cpu: null });
    expect(r.seats[2]).toBeNull();
    expect(r.match.round!.core.hands[2]!.length).toBeGreaterThan(0); // its tiles wait at the seat
    r = join(r, 'Dan');
    r = cmd(r, 'Dan', { type: 'takeSeat', seat: 2 });
    expect(r.seats[2]).toBe('dan');
    // The host can also force a player out: they become a spectator and keep their chips.
    r = host(r, { type: 'hostSetSeat', seat: 2, cpu: null });
    expect(r.seats[2]).toBeNull();
    expect(viewFor(r, 'dan', tick()).you.seat).toBeNull();
    expect(r.people.dan!.balance).toBe(1000);
  });

  it('the host overview never includes hidden tiles', () => {
    const json = JSON.stringify(hostViewOf(startedTable()));
    expect(json).not.toMatch(/"hand"|"hands"|"type":"[mps]\d"/);
  });

  it('ending the game stops all commands', () => {
    const r = host(fullTable(), { type: 'hostEndGame' });
    expect(r.ended).toBe(true);
    expect(() => cmd(r, 'Amy', { type: 'leaveSeat' })).toThrow(/ended/);
  });
});

describe('history, roll back and changing the current game (host page)', () => {
  /** Finish the current round as a win and have everyone confirm. */
  function finishWith(r: Room, winner: number, discarder: number | null, changes: number[]): Room {
    const round = r.match.round!;
    r = {
      ...r,
      match: {
        ...r.match,
        round: { ...round, core: { ...round.core, phase: 'ended', result: { type: 'win', winner, discarder, fan: 3, items: [], capHand: false, isChicken: false, changes } } },
      },
    };
    for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'confirmRound' });
    return r;
  }
  function playAgain(r: Room): Room {
    // Ready at the end of the round already counted as Start.
    if (r.phase === 'betweenRounds') for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'pressStart' });
    const dealerName = r.people[r.seats[r.match.dealer]!]!.name;
    return cmd(r, dealerName, { type: 'rollDice' });
  }

  it('records every finished hand with its result and chip changes', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]);
    expect(r.history).toHaveLength(1);
    expect(hostViewOf(r).history[0]).toMatchObject({
      index: 0,
      label: { en: 'East, game 1' },
      result: { type: 'win', winner: 'Amy', discarder: 'Kyle', fan: 3 },
    });
    expect(hostViewOf(r).history[0]!.changes).toContainEqual({ name: 'Amy', change: 32 });
    expect(hostViewOf(r).history[0]).toMatchObject({ seatChanges: [-16, 32, -8, -8], winnerSeat: 1, discarderSeat: 0 });
    r = finishWith(playAgain(r), 2, null, [-16, -16, 48, -16]);
    expect(hostViewOf(r).history.map((h) => h.label.en)).toEqual(['East, game 1', 'East, game 2']);
  });

  it('rolls back to before any game: chips, wind and dealer as they were; later games removed', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]); // East 1 → Amy wins, dealer moves on
    r = host(r, { type: 'hostSetBalance', name: 'Ben', balance: 5000 }); // a manual change after game 1
    r = finishWith(playAgain(r), 2, null, [-16, -16, 48, -16]); // East 2
    r = playAgain(r); // East 3 in progress
    r = host(r, { type: 'hostRollBack', toHand: 1 }); // back to before East 2
    expect(r.match).toMatchObject({ roundWind: 0, dealer: 1, dealerIndex: 1, handsPlayed: 1, round: null });
    expect(r.phase).toBe('betweenRounds');
    expect([r.people.kyle, r.people.amy, r.people.ben, r.people.cat].map((p) => p!.balance)).toEqual([984, 1032, 5000, 992]);
    expect(r.history).toHaveLength(1);
    r = host(r, { type: 'hostRollBack', toHand: 0 }); // back to the very start
    expect([r.people.kyle, r.people.amy, r.people.ben, r.people.cat].map((p) => p!.balance)).toEqual([1000, 1000, 1000, 1000]);
    expect(r.history).toHaveLength(0);
    expect(() => host(r, { type: 'hostRollBack', toHand: 0 })).toThrow(/no such game/);
  });

  it('the host can edit a chip change in the history: only the difference is applied, and it is marked', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]); // game 1: Kyle 984, Amy 1032, Ben 992, Cat 992
    r = host(r, { type: 'hostSetBalance', name: 'Ben', balance: 5000 }); // a manual change: must be kept
    r = finishWith(playAgain(r), 2, null, [-16, -16, 48, -16]); // game 2: Ben 5048
    r = host(r, { type: 'hostEditHistory', hand: 0, seat: 2, change: -20 }); // Ben in game 1: -8 → -20
    expect(r.people.ben!.balance).toBe(5036); // 5048 - 12, not worked out again from the start
    expect(r.people.kyle!.balance).toBe(968); // nobody else changes
    const h = hostViewOf(r).history[0]!;
    expect(h).toMatchObject({ seatChanges: [-16, 32, -20, -8], originalSeatChanges: [-16, 32, -8, -8] });
    expect(hostViewOf(r).historyEdits[0]).toMatchObject({ hand: 0, seat: 2, name: 'Ben', from: -8, to: -20 });
    // Rolling back to before game 2 keeps the edit (and the manual 5000).
    r = host(r, { type: 'hostRollBack', toHand: 1 });
    expect(r.people.ben!.balance).toBe(4988);
    expect(() => host(r, { type: 'hostEditHistory', hand: 5, seat: 0, change: 1 })).toThrow(/no such game/);
    expect(() => host(r, { type: 'hostEditHistory', hand: 0, seat: 0, change: 1.5 })).toThrow(/whole number/);
  });

  it('roll back still works after someone changes their name', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]);
    r = cmd(r, 'Amy', { type: 'rename', newName: 'Amelia' });
    r = host(r, { type: 'hostRollBack', toHand: 0 });
    expect(r.people.amelia!.balance).toBe(1000);
  });

  it('the host can stop the hand being played: nobody pays, and the same game is dealt again', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]); // East 1 won by Amy: Amy deals East 2
    r = playAgain(r); // East 2 in progress
    const before = { match: { roundWind: r.match.roundWind, dealer: r.match.dealer, dealerIndex: r.match.dealerIndex, handsPlayed: r.match.handsPlayed } };
    const chips = Object.values(r.people).map((p) => p.balance);
    r = cmd(r, 'Amy', { type: 'discard', tileId: r.match.round!.core.hands[1]![0]!.id });
    r = host(r, { type: 'hostStopRound' });
    expect(r.phase).toBe('betweenRounds');
    expect(r.match.round).toBeNull();
    expect(r.match).toMatchObject(before.match);
    expect(Object.values(r.people).map((p) => p.balance)).toEqual(chips);
    expect(r.history).toHaveLength(1);
    expect(viewFor(r, 'kyle', tick()).roundStoppedAt).toBe(r.roundStoppedAt);
    // Settings can change now, then everyone presses Start and the same game is dealt.
    r = host(r, { type: 'hostUpdateSettings', settings: { minFan: 3 } });
    expect(r.match.settings.minFan).toBe(3);
    for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'pressStart' });
    expect(r.phase).toBe('rolling');
    r = cmd(r, 'Amy', { type: 'rollDice' });
    expect(r.phase).toBe('playing');
    expect(hostViewOf(r).label.en).toBe('East, game 2');
    expect(r.match.round!.core.hands[1]).toHaveLength(14); // Amy deals again
  });

  it('stopping also works during the dice roll, but not between hands or on the win summary', () => {
    let r = fullTable();
    expect(() => host(r, { type: 'hostStopRound' })).toThrow(/no hand/);
    for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'pressStart' });
    expect(r.phase).toBe('rolling');
    r = host(r, { type: 'hostStopRound' });
    expect(r.phase).toBe('betweenRounds');
    // A finished hand waiting on the win summary: the result must not be thrown away.
    const playing = startedTable();
    const round = playing.match.round!;
    const won: Room = {
      ...playing,
      match: { ...playing.match, round: { ...round, core: { ...round.core, phase: 'ended', result: { type: 'win', winner: 1, discarder: 0, fan: 3, items: [], capHand: false, isChicken: false, changes: [-16, 32, -8, -8] } } } },
    };
    expect(() => host(won, { type: 'hostStopRound' })).toThrow(/no hand/);
  });

  it('balances show the payout as soon as the win summary appears (paid once, when the hand closes)', () => {
    const playing = startedTable();
    const round = playing.match.round!;
    let r: Room = {
      ...playing,
      match: { ...playing.match, round: { ...round, core: { ...round.core, phase: 'ended', result: { type: 'win', winner: 1, discarder: 0, fan: 3, items: [], capHand: false, isChicken: false, changes: [-16, 32, -8, -8] } } } },
    };
    // Summary showing: every screen already shows the new balances; nothing is paid yet.
    expect(viewFor(r, 'kyle', tick()).seats.map((s) => s.balance)).toEqual([984, 1032, 992, 992]);
    expect(hostViewOf(r).seats.map((s) => s.balance)).toEqual([984, 1032, 992, 992]);
    expect(r.people.amy!.balance).toBe(1000);
    // The host corrects Amy to 1050 during the summary: she ends up with exactly 1050.
    r = host(r, { type: 'hostSetBalance', name: 'Amy', balance: 1050 });
    expect(viewFor(r, 'kyle', tick()).seats[1]!.balance).toBe(1050);
    // Everyone confirms: paid once, the numbers don't change again.
    for (const n of ['Kyle', 'Amy', 'Ben', 'Cat']) r = cmd(r, n, { type: 'confirmRound' });
    expect([r.people.kyle, r.people.amy, r.people.ben, r.people.cat].map((x) => x!.balance)).toEqual([984, 1050, 992, 992]);
    expect(viewFor(r, 'kyle', tick()).seats.map((s) => s.balance)).toEqual([984, 1050, 992, 992]);
  });

  it('after the next player draws, others still see their Pung for up to 10 seconds', () => {
    // Kyle (dealer) throws a red dragon; Ben (seat 2) holds two and could Pung it; Amy (next) draws.
    let round = setupRound({
      hands: ['m1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dR', 'p4 p5 p6 p7 p8 p9 s2 s3 s4 s5 s6 s7 wE', 'dR dR s8 s9 m1 m1 wS wS wS wW wW wW p2', 'm5 m6 m7 p1 p2 p3 s6 s7 s8 wN wN wN wE'],
      front: 'm9 p9 s9 m8',
    });
    round = discard(round, 0, idOf(round, 0, 'dR'), 0);
    round = draw(round, 1, 1000);
    const room: Room = { ...startedTable(), match: { ...startedTable().match, round } };
    const at6 = viewFor(room, 'ben', 6000);
    expect(at6.actions?.pong).toBe(true);
    expect(at6.round?.claimMsLeft).toBe(5000);
    const at12 = viewFor(room, 'ben', 12000);
    expect(at12.actions?.pong).toBe(false);
    expect(at12.round?.claimMsLeft).toBe(0);
    // As soon as Amy discards, the chance is gone.
    const afterDiscard: Room = { ...room, match: { ...room.match, round: discard(round, 1, idOf(round, 1, 'wE'), 2000) } };
    expect(viewFor(afterDiscard, 'ben', 2500).actions?.pong ?? false).toBe(false);
  });

  it('can jump to any wind and game number without touching chips', () => {
    let r = finishWith(startedTable(), 1, 0, [-16, 32, -8, -8]);
    r = playAgain(r);
    r = host(r, { type: 'hostSetPosition', roundWind: 2, gameNumber: 3 });
    expect(r.match).toMatchObject({ roundWind: 2, dealerIndex: 2, dealer: 2, round: null });
    expect(r.phase).toBe('betweenRounds');
    expect(hostViewOf(r).label.en).toBe('West, game 3');
    expect(r.people.amy!.balance).toBe(1032);
    expect(() => host(r, { type: 'hostSetPosition', roundWind: 4, gameNumber: 1 })).toThrow();
    expect(() => host(r, { type: 'hostSetPosition', roundWind: 0, gameNumber: 5 })).toThrow();
  });
});

describe('playing with CPUs', () => {
  /** Kyle in seat 0, CPUs in seats 1-3, round started (Kyle deals). */
  function kyleAndCpus(): Room {
    let r = newRoom();
    r = cmd(r, 'Kyle', { type: 'takeSeat', seat: 0 });
    for (let seat = 1; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'medium' });
    r = cmd(r, 'Kyle', { type: 'pressStart' });
    return cmd(r, 'Kyle', { type: 'rollDice' });
  }

  it('when it is a CPU\'s turn, any seated player can undo (and CPUs pause so you can undo again)', () => {
    let r = kyleAndCpus();
    r = cmd(r, 'Kyle', { type: 'discard', tileId: r.match.round!.core.hands[0]![0]!.id });
    // Now it is CPU South's turn. Kyle may undo for it.
    expect(viewFor(r, 'kyle', tick()).actions!.undo).toBe(true);
    r = cmd(r, 'Kyle', { type: 'undo' });
    expect(r.match.round!.core.turn).toBe(0);
    expect(r.match.round!.core.hands[0]).toHaveLength(14);
    // CPUs wait for a few seconds after an undo.
    expect(cpuTick(r, clock + 3000, rng)).toBe(r);
  });

  it('cannot undo for another human player', () => {
    let r = startedTable();
    r = cmd(r, 'Kyle', { type: 'discard', tileId: r.match.round!.core.hands[0]![0]!.id });
    expect(() => cmd(r, 'Ben', { type: 'undo' })).toThrow(/your own move/);
    expect(viewFor(r, 'ben', tick()).actions!.undo).toBe(false);
  });

  it('CPU hands are shown sorted (suits fewest→most, 1-9, then winds, then dragons)', () => {
    let r = join(kyleAndCpus(), 'Spec');
    r = cmd(r, 'Spec', { type: 'setWatchAll', visible: true });
    for (const seat of [1, 2, 3]) {
      const shown = viewFor(r, 'spec', tick()).seats[seat]!.hand!;
      expect(shown.map((t) => t.id)).toEqual(sortHand(shown).map((t) => t.id));
    }
  });

  it('tells your device which tile you just drew', () => {
    let r = kyleAndCpus();
    r = cmd(r, 'Kyle', { type: 'discard', tileId: r.match.round!.core.hands[0]![0]!.id });
    expect(viewFor(r, 'kyle', tick()).justDrawnId).toBeNull();
  });

  function allCpuRoundOver(withSpectator: boolean): Room {
    let r = emptyRoom();
    if (withSpectator) r = join(r, 'Spec');
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    let now = clock;
    while (!(r.phase === 'playing' && r.match.round?.core.phase === 'ended')) {
      r = cpuTick(r, (now += 1000), rng);
    }
    clock = now;
    return r;
  }

  it('all-CPU table: waits for a spectator to confirm before the next hand', () => {
    let r = allCpuRoundOver(true);
    expect(viewFor(r, 'spec', tick()).spectatorsConfirm).toBe(true);
    for (let i = 0; i < 20; i++) r = cpuTick(r, (clock += 1000), rng);
    expect(r.match.round?.core.phase).toBe('ended'); // still waiting
    r = cmd(r, 'Spec', { type: 'confirmRound' });
    expect(r.match.handsPlayed).toBe(1);
  });

  it('all-CPU table with nobody watching carries on by itself', () => {
    let r = allCpuRoundOver(false);
    r = cpuTick(r, (clock += 5000), rng);
    expect(r.match.handsPlayed).toBe(1);
  });

  it('a spectator who has left does not hold up an all-CPU table', () => {
    let r = allCpuRoundOver(true);
    r = disconnect(r, 'spec', tick());
    r = cpuTick(r, (clock += 5000), rng);
    expect(r.match.handsPlayed).toBe(1);
  });

  it('spectators cannot confirm for seated players', () => {
    let r = join(startedTable(), 'Spec');
    const round = r.match.round!;
    r = { ...r, match: { ...r.match, round: { ...round, core: { ...round.core, phase: 'ended', result: { type: 'draw' } } } } };
    expect(() => cmd(r, 'Spec', { type: 'confirmRound' })).toThrow(/not sitting/);
  });
});

describe('changing name', () => {
  it('moves balance and seat to the new name', () => {
    let r = fullTable();
    r.people.kyle!.balance = 777;
    r = cmd(r, 'Kyle', { type: 'rename', newName: 'KJ' });
    expect(r.people.kyle).toBeUndefined();
    expect(r.people.kj).toMatchObject({ name: 'KJ', balance: 777 });
    expect(r.seats[0]).toBe('kj');
  });

  it('logging in later with the new name is the same person', () => {
    let r = cmd(fullTable(), 'Kyle', { type: 'rename', newName: 'KJ' });
    r = disconnect(r, 'kj', tick());
    r = join(r, 'kj');
    expect(r.seats[0]).toBe('kj');
  });

  it('refuses a name already in use', () => {
    expect(() => cmd(fullTable(), 'Kyle', { type: 'rename', newName: 'amy' })).toThrow(/in use/);
  });
});

describe('swapping players', () => {
  it('dropping out leaves an empty seat; the round waits until the host page adds a CPU', () => {
    let r = startedTable();
    r = cmd(r, 'Kyle', { type: 'discard', tileId: r.match.round!.core.hands[0]![0]!.id });
    // Amy (seat 1, next to play) drops out.
    r = cmd(r, 'Amy', { type: 'dropOut', replacement: { none: true } });
    expect(r.seats[1]).toBeNull();
    expect(r.people.amy!.balance).toBe(1000);
    expect(r.match.round!.core.hands[1]).toHaveLength(13); // her tiles stay at the seat
    expect(viewFor(r, 'amy', tick()).you.seat).toBeNull();
    // Nobody moves for that seat by themselves.
    expect(cpuTick(r, r.lastChangeAt + 60_000, rng)).toBe(r);
    // The host page adds a CPU, which carries on with the hand.
    r = host(r, { type: 'hostSetSeat', seat: 1, cpu: 'easy' });
    const after = cpuTick(r, r.lastChangeAt + 60_000, rng);
    expect(after.match.round!.core.hands[1]).toHaveLength(14); // the CPU drew
  });

  it('players cannot bring in a CPU themselves', () => {
    expect(() =>
      cmd(startedTable(), 'Ben', { type: 'dropOut', replacement: { cpu: 'hard' } } as unknown as Command),
    ).toThrow(/Unknown replacement/);
  });

  it('a new game starts with all 4 seats empty', () => {
    expect(emptyRoom().seats).toEqual([null, null, null, null]);
  });

  it('a spectator can sit in an empty seat straight away, even mid-round', () => {
    let r = join(startedTable(), 'Dan');
    r = cmd(r, 'Ben', { type: 'dropOut', replacement: { none: true } }); // seat 2 is now empty
    r = cmd(r, 'Dan', { type: 'takeSeat', seat: 2 });
    expect(r.seats[2]).toBe('dan');
    expect(viewFor(r, 'dan', tick()).seats[2]!.hand).toHaveLength(13); // Dan plays Ben's tiles
    // Seated players still cannot move mid-round, and taken seats stay taken.
    expect(() => cmd(r, 'Amy', { type: 'takeSeat', seat: 2 })).toThrow(/between rounds/);
    r = join(r, 'Eve');
    expect(() => cmd(r, 'Eve', { type: 'takeSeat', seat: 1 })).toThrow(/taken/);
  });

  it('the player who asked to swap sees the request waiting, can cancel it, and is told if it is declined', () => {
    let r = join(startedTable(), 'Dan');
    r = cmd(r, 'Ben', { type: 'dropOut', replacement: { spectator: 'dan' } });
    expect(viewFor(r, 'ben', tick()).pendingSwap).toMatchObject({ toName: 'Dan' });
    r = cmd(r, 'Ben', { type: 'cancelSwap' });
    expect(viewFor(r, 'dan', tick()).pendingSwap).toBeNull();
    r = cmd(r, 'Ben', { type: 'dropOut', replacement: { spectator: 'dan' } });
    r = cmd(r, 'Dan', { type: 'answerSwap', accept: false });
    expect(viewFor(r, 'ben', tick()).swapResult).toMatchObject({ toName: 'Dan', accepted: false });
    expect(viewFor(r, 'amy', tick()).swapResult).toBeNull();
  });

  it('drop out to a spectator only happens after the spectator confirms', () => {
    let r = join(startedTable(), 'Dan');
    r = cmd(r, 'Ben', { type: 'dropOut', replacement: { spectator: 'dan' } });
    expect(r.seats[2]).toBe('ben');
    expect(viewFor(r, 'dan', tick()).pendingSwap).toMatchObject({ fromName: 'Ben', seat: 2 });
    expect(() => cmd(r, 'Amy', { type: 'answerSwap', accept: true })).toThrow();
    const declined = cmd(r, 'Dan', { type: 'answerSwap', accept: false });
    expect(declined.seats[2]).toBe('ben');
    r = cmd(r, 'Dan', { type: 'answerSwap', accept: true });
    expect(r.seats[2]).toBe('dan');
  });
});

describe('CPU players', () => {
  /** Four Hard CPUs; the dealer has just thrown dR, which completes seat 3's hand. */
  const cpuTable = (minFan: number, emptyWall: boolean): Room => {
    let r = emptyRoom();
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'hard' });
    let round = setupRound({
      hands: [
        'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 s1 dR',
        'p4 p5 p6 p7 p8 p9 s2 s3 s4 s5 s6 s8 wE',
        'p1 p4 p7 s1 s4 s9 m1 m4 m7 wE wS wW wN',
        'm2 m3 m4 p5 p6 p7 s3 s4 s5 s7 s7 s7 dR', // concealed hand: 1 fan (2 on the last discard)
      ],
      settings: { minFan },
    });
    if (emptyWall) {
      const core = structuredClone(round.core);
      for (const st of core.wall.stacks) for (const t of st.tiles) core.discards.push({ tile: t, by: 1 });
      for (const st of core.wall.stacks) st.tiles = [];
      core.discardCount = 60;
      round = { ...round, core };
    }
    round = discard(round, 0, idOf(round, 0, 'dR'), r.lastChangeAt);
    return { ...r, phase: 'playing', match: { ...r.match, round } };
  };

  it('a CPU that can win on a discard wins before the next CPU draws (whatever the seat order)', () => {
    const r = cpuTable(1, false);
    const after = cpuTick(r, r.lastChangeAt + 5000, rng);
    expect(after.match.round!.core.result).toMatchObject({ type: 'win', winner: 3 });
  });

  it('wall empty: CPUs that do not want the last tile pass, and the hand ends as a tie', () => {
    // Minimum fan 3: seat 3's hand is only 2 fan even on the last discard, so it cannot win.
    let r = cpuTable(3, true);
    let t = r.lastChangeAt;
    for (let i = 0; i < 10 && r.match.round!.core.phase !== 'ended'; i++) {
      t += 5000;
      const s = settleWall(r, t);
      r = s !== r ? s : cpuTick(r, t, rng);
    }
    expect(r.match.round!.core.result).toEqual({ type: 'draw' });
  });

  it('an all-CPU table plays the whole 16-round game by itself, and chips always add up', () => {
    let r = emptyRoom();
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    let now = clock;
    let steps = 0;
    while (r.phase !== 'finished') {
      now += 1000;
      r = cpuTick(r, now, rng);
      if (++steps > 200_000) throw new Error('The all-CPU game never finished.');
    }
    const cpus = Object.values(r.people).filter((p) => p.cpu);
    expect(cpus).toHaveLength(4);
    expect(cpus.reduce((n, p) => n + p.balance, 0)).toBe(4000);
    expect(r.match.handsPlayed).toBeGreaterThanOrEqual(16);
  });

  it('the host page sets how many seconds CPUs take per move', () => {
    let r = emptyRoom();
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    expect(hostViewOf(r).cpuSeconds).toBe(5);
    expect(cpuTick(r, r.lastChangeAt + 4900, rng)).toBe(r); // default 5 s: still waiting
    r = host(r, { type: 'hostSetCpuSeconds', seconds: 2.5 });
    expect(hostViewOf(r).cpuSeconds).toBe(2.5);
    expect(cpuTick(r, r.lastChangeAt + 2400, rng)).toBe(r);
    expect(cpuTick(r, r.lastChangeAt + 2500, rng)).not.toBe(r);
    expect(() => host(r, { type: 'hostSetCpuSeconds', seconds: 0.1 })).toThrow(/between/);
    expect(() => host(r, { type: 'hostSetCpuSeconds', seconds: 31 })).toThrow(/between/);
  });

  it('every CPU level takes the same time per move', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      let r = emptyRoom();
      for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: level });
      r = host(r, { type: 'hostSetCpuSeconds', seconds: 1.5 });
      expect(cpuTick(r, r.lastChangeAt + 1499, rng)).toBe(r);
      expect(cpuTick(r, r.lastChangeAt + 1500, rng)).not.toBe(r);
    }
  });

  it('CPUs wait a moment before moving', () => {
    let r = emptyRoom();
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    expect(cpuTick(r, r.lastChangeAt + 10, rng)).toBe(r);
  });
});
