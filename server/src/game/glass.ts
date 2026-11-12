/**
 * The window-breaking sound (see client/src/sounds.ts).
 *
 * Rule: in each hand, the first flower a player draws during play (not the flowers from
 * the deal) makes the sound, but only if that flower does not score for them. Any later
 * flower in that hand is silent, and so is a first flower that does score.
 *
 * The server decides this, so every device hears the same thing. Each change bumps `seq`
 * and sets `seat`; devices play the sound once for each new `seq`.
 */

export interface GlassState {
  /** Which hand `seen` is for (the match's handsPlayed count). */
  hand: number;
  /** Players who have already drawn a flower this hand (scoring or not). */
  seen: string[];
  /** Goes up by one each time the sound should play. */
  seq: number;
  /** The seat the sound is for (null before the first sound). */
  seat: number | null;
}

export const newGlass = (): GlassState => ({ hand: -1, seen: [], seq: 0, seat: null });

/** Does this flower score for a player with this seat wind (0 East ... 3 North)? Its number matches the seat. */
export function flowerScoresFor(type: string, wind: number): boolean {
  return Number(type[1]) === wind + 1;
}

/** A player drew a flower in play. Returns the new state. */
export function noteFlower(prev: GlassState, hand: number, key: string, seat: number, type: string, wind: number): GlassState {
  const g: GlassState = prev.hand === hand ? prev : { ...prev, hand, seen: [] };
  if (g.seen.includes(key)) return g;
  const seen = [...g.seen, key];
  if (flowerScoresFor(type, wind)) return { ...g, seen };
  return { ...g, seen, seq: g.seq + 1, seat };
}
