/**
 * CPU players. TEMPORARY simple version so tables with CPUs (and all-CPU
 * tables) can already play. Phase 7 replaces this with easy / medium / hard.
 *
 * What it does now: always wins when it can, draws when it must, and
 * discards the tile that fits worst with the rest of its hand. It never
 * claims 上 碰 槓.
 */
import { Rng, Tile, isHonour, isSuited, rankOf } from '@lan-mahjong/shared';
import { AvailableActions, RoundState } from './round.js';
import type { Command, CpuDifficulty } from './room.js';

export function cpuMove(
  round: RoundState,
  seat: number,
  actions: AvailableActions,
  difficulty: CpuDifficulty,
  rng: Rng,
): Command | null {
  void difficulty;
  if (actions.win && round.window?.status.type === 'open') return { type: 'claim', claim: { kind: 'win' } };
  if (actions.selfDrawWin) return { type: 'selfDrawWin' };
  if (actions.drawReplacement) return { type: 'drawReplacement' };
  if (actions.draw) return { type: 'draw' };
  if (actions.discard) return { type: 'discard', tileId: worstTile(round.core.hands[seat]!, rng).id };
  return null;
}

/** Score how well a tile fits: pairs and neighbours make it more useful. */
function usefulness(tile: Tile, hand: readonly Tile[]): number {
  const same = hand.filter((t) => t.type === tile.type).length - 1;
  let score = same * 3;
  if (isSuited(tile.type)) {
    const suit = tile.type[0];
    const r = rankOf(tile.type);
    for (const d of [-2, -1, 1, 2]) {
      if (hand.some((t) => t.type === `${suit}${r + d}`)) score += Math.abs(d) === 1 ? 2 : 1;
    }
    if (r === 1 || r === 9) score -= 0.5;
  } else if (isHonour(tile.type)) {
    score -= 0.25;
  }
  return score;
}

function worstTile(hand: readonly Tile[], rng: Rng): Tile {
  let best: Tile[] = [];
  let bestScore = Infinity;
  for (const t of hand) {
    const s = usefulness(t, hand);
    if (s < bestScore) {
      bestScore = s;
      best = [t];
    } else if (s === bestScore) best.push(t);
  }
  return best[Math.floor(rng() * best.length)]!;
}
