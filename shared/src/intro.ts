/**
 * How long the start-of-hand animation lasts on the players' screens, so the
 * server can make CPUs wait for it (a CPU must not roll before the wall is
 * built, or discard before the tiles have been dealt).
 */

/** Mixing and building the wall, from the moment the dice stage starts (with a little spare time). */
export const INTRO_BUILD_MS = 4500;
/** The dice roll. */
export const DICE_ROLL_MS = 2600;
/** Dealing the tiles from the wall. */
export const DEAL_ANIM_MS = 5000;
/** The rest of the wall shrinking into the small box, then fading into it. */
export const WALL_SHRINK_MS = 1300;
/** The last part of that: the shrunk wall fades out as the small box fades in. */
export const INTRO_FADE_MS = 450;

/** The counting wipe after the dice: round the walls, then along the stacks, then the break. */
export function wallCountMs(diceTotal: number): number {
  return diceTotal * 120 + 250 + diceTotal * 35 + 700;
}

/** From the dice roll until the hand can start (dice, counting, dealing, shrinking, a little spare). */
export function introAfterRollMs(diceTotal: number): number {
  return DICE_ROLL_MS + wallCountMs(diceTotal) + DEAL_ANIM_MS + WALL_SHRINK_MS + 300;
}
