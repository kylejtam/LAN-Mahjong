/**
 * Dealing a new round.
 *
 * Steps:
 * 1. Make a brand new full set and shuffle it.
 * 2. Check the set is exactly right (stops with an error if not).
 * 3. Build the wall and break it using the dice.
 * 4. Deal from the front: 3 rounds of 4 tiles each to every player (dealer
 *    first, then in turn order), then 1 more each, then 1 extra for the dealer.
 *    Result: dealer 14 tiles, everyone else 13.
 * 5. Flowers on: starting with the dealer, each player sets their flowers aside
 *    and draws replacements from the back of the wall. Repeat until no hand
 *    has a flower (a replacement can itself be a flower).
 * 6. Check again that hands + flowers + wall is exactly one full set.
 */
import { Rng, rollDice, shuffle } from './random.js';
import { Tile, assertTileSet, buildTileSet, isFlower } from './tiles.js';
import { SEATS, Wall, buildWall, drawBack, drawFront, wallTiles } from './wall.js';

export interface DealResult {
  dealer: number;
  dice: [number, number, number];
  /** hands[seat] = that player's hidden tiles. */
  hands: Tile[][];
  /** flowers[seat] = flowers that player has set aside (face up). */
  flowers: Tile[][];
  wall: Wall;
}

export interface DealOptions {
  dealer: number;
  flowersOn: boolean;
  rng: Rng;
  /** Use these dice instead of rolling (the dealer's swipe gives the roll). */
  dice?: [number, number, number];
}

export function dealRound({ dealer, flowersOn, rng, dice }: DealOptions): DealResult {
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= SEATS) {
    throw new Error(`Dealer seat must be 0 to 3, got ${dealer}.`);
  }
  const tiles = shuffle(buildTileSet(flowersOn), rng);
  assertTileSet(tiles, flowersOn);

  const roll = dice ?? rollDice(rng);
  const wall = buildWall(tiles, dealer, roll);
  const hands: Tile[][] = [[], [], [], []];
  const flowers: Tile[][] = [[], [], [], []];
  const seatOrder = [0, 1, 2, 3].map((i) => (dealer + i) % SEATS);

  for (let round = 0; round < 3; round++) {
    for (const seat of seatOrder) {
      for (let i = 0; i < 4; i++) hands[seat]!.push(drawFront(wall));
    }
  }
  for (const seat of seatOrder) hands[seat]!.push(drawFront(wall));
  hands[dealer]!.push(drawFront(wall));

  if (flowersOn) {
    let anyFlower = true;
    while (anyFlower) {
      anyFlower = false;
      for (const seat of seatOrder) {
        const hand = hands[seat]!;
        for (let i = 0; i < hand.length; i++) {
          if (isFlower(hand[i]!.type)) {
            flowers[seat]!.push(hand[i]!);
            hand[i] = drawBack(wall);
            anyFlower = true;
          }
        }
      }
    }
  }

  const result: DealResult = { dealer, dice: roll, hands, flowers, wall };
  assertAllTilesAccountedFor(result, flowersOn);
  return result;
}

/** Hands + flowers + wall must be exactly one full set. */
export function assertAllTilesAccountedFor(
  state: { hands: Tile[][]; flowers: Tile[][]; wall: Wall; discards?: Tile[]; melds?: Tile[][] },
  flowersOn: boolean,
): void {
  const all = [
    ...state.hands.flat(),
    ...state.flowers.flat(),
    ...wallTiles(state.wall),
    ...(state.discards ?? []),
    ...(state.melds ?? []).flat(),
  ];
  assertTileSet(all, flowersOn);
}
