import { describe, expect, it } from 'vitest';
import { seededRng } from '@lan-mahjong/shared';
import { Command, HostCommand, Room, cpuTick, createRoom, disconnect, handleCommand, handleHostCommand, joinRoom } from '../src/game/room.js';
import { hostViewOf, viewFor } from '../src/game/view.js';

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
    expect(r.phase).toBe('betweenRounds');
    expect(r.match.dealer).toBe(1); // someone other than the dealer won
  });
});

describe('host controls (laptop host page only)', () => {
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
    expect(() => handleCommand(full, 'amy', { type: 'takeSeat', seat: 1 }, now, rng)).toThrow(/between rounds/);
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
  it('drop out to a CPU', () => {
    const r = cmd(startedTable(), 'Ben', { type: 'dropOut', replacement: { cpu: 'hard' } });
    expect(r.people[r.seats[2]!]!.cpu).toBe('hard');
    expect(r.people.ben!.balance).toBe(1000);
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

  it('CPUs wait a moment before moving', () => {
    let r = emptyRoom();
    for (let seat = 0; seat < 4; seat++) r = host(r, { type: 'hostSetSeat', seat, cpu: 'easy' });
    expect(cpuTick(r, r.lastChangeAt + 10, rng)).toBe(r);
  });
});
