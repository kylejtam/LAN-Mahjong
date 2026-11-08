/**
 * A full game 全局: 4 winds × 4 dealers = 16 rounds.
 *
 * - The first dealer is seat 0 (East), in the East wind.
 * - Dealer stays when the dealer wins. Those extra hands do not count toward the 16.
 * - Draw (no winner): the dealer stays, unless the host turned on
 *   "dealer advances on a draw".
 * - Anyone else wins: the next seat becomes dealer.
 * - After every seat has dealt once in a wind, the next wind starts.
 *   After the North wind, the game is finished.
 */
import { GameSettings, Rng, SEATS } from '@lan-mahjong/shared';
import { RoundResult, RoundState, startRound } from './round.js';

export const WIND_NAMES = {
  en: ['East', 'South', 'West', 'North'],
  zh: ['東', '南', '西', '北'],
} as const;

export interface MatchState {
  settings: GameSettings;
  /** 0 = East ... 3 = North. */
  roundWind: number;
  dealer: number;
  /** How many dealers have had their turn in this wind (0-3). "Game number" = this + 1. */
  dealerIndex: number;
  /** Hands played so far, including repeats. */
  handsPlayed: number;
  round: RoundState | null;
  finished: boolean;
  lastResult: RoundResult | null;
}

export function newMatch(settings: GameSettings): MatchState {
  return {
    settings: { ...settings },
    roundWind: 0,
    dealer: 0,
    dealerIndex: 0,
    handsPlayed: 0,
    round: null,
    finished: false,
    lastResult: null,
  };
}

/** Deal a new round. `dice` comes from the dealer's swipe. */
export function beginRound(match: MatchState, rng: Rng, dice?: [number, number, number]): MatchState {
  if (match.finished) throw new Error('The game is finished.');
  if (match.round && match.round.core.phase !== 'ended') throw new Error('A round is already being played.');
  const round = startRound({
    dealer: match.dealer,
    roundWind: match.roundWind,
    settings: {
      flowersOn: match.settings.flowersOn,
      minFan: match.settings.minFan,
      payoutMode: match.settings.payoutMode,
      liabilityOn: !!match.settings.liabilityOn,
    },
    rng,
    dice,
  });
  return { ...match, round };
}

/** Does the dealer move on after this result? */
export function dealerAdvances(match: MatchState, result: RoundResult): boolean {
  if (result.type === 'draw') return match.settings.dealerAdvancesOnDraw;
  return result.winner !== match.dealer;
}

/**
 * Close a finished round: move the dealer and wind on if needed.
 * Returns the new match state and the chip changes for each seat.
 */
export function closeRound(match: MatchState): { match: MatchState; changes: number[] } {
  const result = match.round?.core.result;
  if (!match.round || match.round.core.phase !== 'ended' || !result) {
    throw new Error('The round has not ended.');
  }
  const next: MatchState = { ...match, round: null, lastResult: result, handsPlayed: match.handsPlayed + 1 };
  if (dealerAdvances(match, result)) {
    next.dealer = (match.dealer + 1) % SEATS;
    next.dealerIndex = match.dealerIndex + 1;
    if (next.dealerIndex === SEATS) {
      next.dealerIndex = 0;
      next.roundWind = match.roundWind + 1;
      if (next.roundWind === SEATS) {
        next.roundWind = SEATS - 1;
        next.finished = true;
      }
    }
  }
  const changes = result.type === 'win' ? result.changes.slice() : [0, 0, 0, 0];
  return { match: next, changes };
}

/** For the game list, e.g. "East, game 2". */
export function matchLabel(match: MatchState, lang: 'en' | 'zh' = 'en'): string {
  const wind = WIND_NAMES[lang][match.roundWind];
  const n = match.dealerIndex + 1;
  return lang === 'en' ? `${wind}, game ${n}` : `${wind}風 第${n}局`;
}
