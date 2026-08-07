// Scoring one candidate decision sheet by simulating it through the REAL
// reducer. Extracted from planner.ts in 21.9 so that guildResponse.ts can score
// a grant against a refusal on exactly the same terms the main candidate sweep
// uses, without planner.ts and guildResponse.ts importing each other.
//
// The plan for 21.9 says to "export scoreCandidate from planner.ts". That is
// where it lived, and this is a deliberate deviation on location only — the
// substance (score a grant and a refusal through the real reducer, on the same
// terms the main candidate sweep uses) is unchanged. planner.ts already imports
// planGuildResponse, so having guildResponse.ts import back from planner.ts
// would close an import cycle. Node's ESM loader would tolerate it (nothing is
// called at module-eval time) but bundlers order cyclic modules by heuristics,
// and a mis-ordered cycle here fails as an undefined function at planning time
// rather than at build time. A third module both sides depend on costs one file
// and removes the question. Nothing outside src/ai imports either function, so
// no re-export shim is needed to keep existing callers working.

import { GameState, Decision, clonePlayerState } from '../engine/state.ts'
import { advanceYear } from '../engine/year.ts'
import { evaluateState, projectedFeedAdequacy, projectedHarvestShortfall, projectedHarvestExcess, PersonalityWeights } from './evaluator.ts'

// Builds a single-player game state so a candidate can be simulated in isolation,
// without other rulers' decisions perturbing the comparison.
export function isolate(state: GameState, playerId: string): GameState {
  const player = clonePlayerState(state.players[playerId])
  return {
    year: state.year,
    players: { [playerId]: player },
    activePlayerIds: [playerId],
    kaizerTradePrices: { ...state.kaizerTradePrices }
  }
}

// `isolated` is read-only from here down: advanceYear() takes its own deep
// copy of the state it's given (year.ts:54) and never mutates the object
// passed in, so the SAME isolated single-player state can be reused across
// every candidate and every evaluation seed for one planYear() call instead
// of being re-cloned per seed. Cloning it once per candidate (the previous
// shape) or once per seed (the shape before that) was pure waste: isolate()
// alone was ~14% of planYear's cost, almost none of which was doing useful
// work — the source player never changes during a single planning pass.
export function scoreCandidate(
  isolated: GameState,
  playerId: string,
  candidate: Decision[],
  weights: PersonalityWeights,
  evaluationSeeds: number[]
): number {
  let total = 0

  for (const seed of evaluationSeeds) {
    const result = advanceYear(isolated, { [playerId]: candidate }, seed)
    const outcome = result.state.players[playerId]
    total += evaluateState(
      outcome,
      {
        feedAdequacy: projectedFeedAdequacy(outcome),
        harvestShortfallExpectation: projectedHarvestShortfall(),
        harvestExcessExpectation: projectedHarvestExcess()
      },
      weights
    )
  }

  return total / evaluationSeeds.length
}
