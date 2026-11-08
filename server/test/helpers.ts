/** Test helper: build a round with chosen hands and a chosen wall order. */
import { DEFAULT_SETTINGS, Tile, TileType, buildTileSet } from '@lan-mahjong/shared';
import { RoundSettings, RoundState, roundFromDeal } from '../src/game/round.js';

export interface Setup {
  dealer?: number;
  roundWind?: number;
  /** Hidden tiles for each seat, e.g. 'm1 m2 m3 ...'. Dealer normally has 14. */
  hands: [string, string, string, string];
  /** Tiles drawn from the front of the wall, in order. */
  front?: string;
  /** Replacement tiles drawn from the back, in order. */
  back?: string;
  settings?: Partial<RoundSettings>;
}

const split = (s: string | undefined): string[] => (s ?? '').split(/\s+/).filter(Boolean);

export function setupRound(s: Setup): RoundState {
  const settings: RoundSettings = {
    flowersOn: false,
    minFan: 0,
    payoutMode: DEFAULT_SETTINGS.payoutMode,
    ...s.settings,
  };
  const pool = buildTileSet(settings.flowersOn);
  const take = (type: string): Tile => {
    const i = pool.findIndex((t) => t.type === type);
    if (i < 0) throw new Error(`No ${type} left for the test setup.`);
    return pool.splice(i, 1)[0]!;
  };
  const hands = s.hands.map((h) => split(h).map(take));
  const front = split(s.front).map(take);
  const back = split(s.back).map(take);
  // Remaining tiles go in the middle. Any unused flowers go deep in the
  // middle so tests do not draw them by accident.
  const isF = (t: Tile): boolean => /^[fn]\d$/.test(t.type);
  const middle = [...pool.filter((t) => !isF(t)), ...pool.filter(isF)];
  const wallOrder = [...front, ...middle, ...back.reverse()];
  const wall = { stacks: wallOrder.map((t, i) => ({ seat: 0, position: i, tiles: [t] })) };
  return roundFromDeal(
    {
      dealer: s.dealer ?? 0,
      dice: [1, 1, 1],
      hands,
      flowers: [[], [], [], []],
      wall,
    },
    s.roundWind ?? 0,
    settings,
  );
}

/** Find the id of a tile of this type in a seat's hand. */
export function idOf(state: RoundState, seat: number, type: TileType | string): number {
  const t = state.core.hands[seat]!.find((x) => x.type === type);
  if (!t) throw new Error(`Seat ${seat} has no ${type}.`);
  return t.id;
}
