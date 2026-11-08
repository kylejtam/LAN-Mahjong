import { describe, expect, it } from 'vitest';
import { seededRng } from '@lan-mahjong/shared';
import { Command, Room, cpuTick, createRoom, disconnect, handleCommand, joinRoom } from '../src/game/room.js';
import { viewFor } from '../src/game/view.js';

const rng = seededRng(99);
let clock = 1000;
const tick = (): number => (clock += 100);

function newRoom(): Room {
  return createRoom({ id: 'r1', name: 'Friday game', hostName: 'Kyle', startingBalance: 1000, now: tick() });
}
const join = (room: Room, name: string): Room => joinRoom(room, name, tick()).room;
const cmd = (room: Room, who: string, c: Command): Room => handleCommand(room, who.toLowerCase(), c, tick(), rng);

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
  it('the creator is the host and gets the starting balance', () => {
    const r = newRoom();
    expect(r.hostKey).toBe('kyle');
    expect(r.people.kyle!.balance).toBe(1000);
    expect(r.name).toBe('Friday game');
  });

  it('needs a game name and a display name', () => {
    expect(() => createRoom({ id: 'x', name: ' ', hostName: 'Kyle', startingBalance: 0, now: 0 })).toThrow();
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

  it('spectators only see hands the player allows', () => {
    let r = join(startedTable(), 'Spec');
    expect(viewFor(r, 'spec', tick()).seats[2]!.hand).toBeNull();
    r = cmd(r, 'Ben', { type: 'setHandVisible', visible: true });
    expect(viewFor(r, 'spec', tick()).seats[2]!.hand).toHaveLength(13);
    expect(viewFor(r, 'spec', tick()).seats[1]!.hand).toBeNull();
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

describe('host controls', () => {
  it('only the host can use host controls', () => {
    const r = fullTable();
    expect(() => cmd(r, 'Amy', { type: 'hostResetBalances' })).toThrow(/Only the host/);
    expect(() => cmd(r, 'Amy', { type: 'hostSetTableColour', colour: 'red' })).toThrow(/Only the host/);
  });

  it('table colour and settings', () => {
    let r = fullTable();
    r = cmd(r, 'Kyle', { type: 'hostSetTableColour', colour: 'blue' });
    expect(r.tableColour).toBe('blue');
    r = cmd(r, 'Kyle', { type: 'hostUpdateSettings', settings: { minFan: 3, flowersOn: false } });
    expect(r.match.settings).toMatchObject({ minFan: 3, flowersOn: false });
    expect(() => cmd(startedTable(), 'Kyle', { type: 'hostUpdateSettings', settings: { minFan: 2 } })).toThrow(/between rounds/);
  });

  it('reset balances', () => {
    let r = fullTable();
    r.people.amy!.balance = 5;
    r = cmd(r, 'Kyle', { type: 'hostResetBalances' });
    expect(r.people.amy!.balance).toBe(1000);
  });

  it('host disconnecting keeps them as host; host leaving passes it to the first player who joined', () => {
    let r = fullTable();
    r = disconnect(r, 'kyle', tick());
    expect(r.hostKey).toBe('kyle');
    r = join(r, 'Kyle');
    r = cmd(r, 'Kyle', { type: 'leaveGame' });
    expect(r.hostKey).toBe('amy');
  });

  it('host can fill a disconnected player\'s seat with a CPU, which keeps playing their hand', () => {
    let r = disconnect(startedTable(), 'amy', tick());
    r = cmd(r, 'Kyle', { type: 'hostSetSeat', seat: 1, cpu: 'easy' });
    expect(r.people[r.seats[1]!]!.cpu).toBe('easy');
    expect(r.match.round!.core.hands[1]).toHaveLength(13);
    expect(r.people.amy!.balance).toBe(1000); // Amy keeps her balance
  });

  it('host cannot replace a player who is still connected', () => {
    expect(() => cmd(fullTable(), 'Kyle', { type: 'hostSetSeat', seat: 1, cpu: 'easy' })).toThrow(/still connected/);
  });

  it('ending the game stops all commands', () => {
    const r = cmd(fullTable(), 'Kyle', { type: 'hostEndGame' });
    expect(r.ended).toBe(true);
    expect(() => cmd(r, 'Amy', { type: 'leaveSeat' })).toThrow(/ended/);
  });
});

describe('changing name', () => {
  it('moves balance, seat and host to the new name', () => {
    let r = fullTable();
    r.people.kyle!.balance = 777;
    r = cmd(r, 'Kyle', { type: 'rename', newName: 'KJ' });
    expect(r.people.kyle).toBeUndefined();
    expect(r.people.kj).toMatchObject({ name: 'KJ', balance: 777 });
    expect(r.seats[0]).toBe('kj');
    expect(r.hostKey).toBe('kj');
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
    let r = newRoom();
    for (let seat = 0; seat < 4; seat++) r = cmd(r, 'Kyle', { type: 'hostSetSeat', seat, cpu: 'easy' });
    expect(r.hostKey).toBe('kyle'); // the host keeps host controls while spectating
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
    let r = newRoom();
    for (let seat = 0; seat < 4; seat++) r = cmd(r, 'Kyle', { type: 'hostSetSeat', seat, cpu: 'easy' });
    expect(cpuTick(r, r.lastChangeAt + 10, rng)).toBe(r);
  });
});
