// The pass/fail thresholds for the anti-snowball gate, in ONE place so the
// balance script and the committed acceptance tests can never disagree about
// what "balanced" means.

import { BalanceReport } from './balance.ts'

export const BALANCE_THRESHOLDS = {
  // 1. MARGIN FLATNESS. Return on holdings must not trend upward across decades.
  // A small positive tolerance absorbs sampling noise; anything genuinely
  // compounding shows up far above it.
  maxReturnTrendSlope: 0.002,

  // 2. LOSS PERSISTENCE. The late game must stay dangerous. Expressed as a ratio
  // against the early game rather than an absolute rate, because what matters is
  // that danger does not FADE — a game that is uniformly risky at 40% or
  // uniformly risky at 70% both satisfy "stays hard", but one that starts at 60%
  // and decays to 5% does not.
  minLateToEarlySetbackRatio: 0.6,

  // ...but a ratio alone can be satisfied vacuously by a game with no setbacks at
  // all (0/0). So the late game must ALSO clear an absolute floor. A leader who
  // can go a whole decade with no serious chance of a reverse is precisely the
  // soft late game this gate exists to catch.
  minLateSetbackRate: 0.25,

  // 3. LEAD VOLATILITY. The game must not be decided early.
  minLateLeadChangeRate: 0.2,
  maxEarlyLeaderWinRate: 0.85,

  // 4. NO DEATH SPIRAL (Phase 13, BACKLOG D5). Criteria 1-3 are one-sided: a
  // strongly negative return trend satisfies "margin flatness" even better
  // than a flat one, and universal misery satisfies "loss persistence"
  // perfectly. The Phase 11.5 DIAGNOSTICS block made a spiral visible to a
  // reader; these floors make one FAIL the gate instead. Thresholds are
  // deliberately loose relative to every measured healthy run (Phase 12's
  // two re-runs: field holdings 404k->1.05M, population 1069->2097, mean
  // rank 0.03->3.27, non-leader return -0.6% at its very worst decade,
  // extinction 0.0%) — the floor exists to catch something qualitatively
  // different from that, not to add noise-sensitivity to a passing gate.

  // Field holdings must show NET growth across the match (late-game mean
  // above early-game mean) — the field as a whole getting poorer over time,
  // not just the leader, is the spiral signature.
  minFieldHoldingsGrowthRatio: 1.0,
  // Field population must not have collapsed on average — some shrinkage
  // from a bad decade is normal, halving is not.
  minFieldPopulationRetentionRatio: 0.5,
  // The discriminator D5 itself names: the design INTENDS the leader to
  // suffer (that's criteria 1-2 working). It does not intend the FIELD to.
  // A non-leader late-game return below this floor means adversity is
  // grinding down rulers who are not even the one being targeted.
  minNonLeaderLateReturn: -0.03,
  // Share of matches ending in at least one ruler's total population
  // collapse. However balanced the survivors look, an anti-snowball design
  // is not supposed to be an extinction event for whoever falls behind.
  maxExtinctionRate: 0.15
} as const

export interface CriterionResult {
  name: string
  passed: boolean
  detail: string
}

// Mean of the first and last thirds of the decade series, used to compare "early
// game" against "late game" without being at the mercy of a single decade.
function firstThirdMean(values: number[]): number {
  const n = Math.max(1, Math.floor(values.length / 3))
  const slice = values.slice(0, n)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

function lastThirdMean(values: number[]): number {
  const n = Math.max(1, Math.floor(values.length / 3))
  const slice = values.slice(-n)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

export function evaluateCriteria(report: BalanceReport): { passed: boolean; results: CriterionResult[] } {
  const results: CriterionResult[] = []

  // 1. Margin flatness
  const slope = report.returnTrendSlope
  results.push({
    name: 'margin flatness',
    passed: slope <= BALANCE_THRESHOLDS.maxReturnTrendSlope,
    detail: `return trend slope ${slope.toExponential(3)} (limit ${BALANCE_THRESHOLDS.maxReturnTrendSlope})`
  })

  // 2. Loss persistence — both a relative and an absolute test, so the criterion
  // cannot be satisfied by a game in which nothing bad ever happens.
  const earlySetback = firstThirdMean(report.setbackRateByDecade)
  const lateSetback = lastThirdMean(report.setbackRateByDecade)
  const ratio = earlySetback > 0 ? lateSetback / earlySetback : 0
  const ratioHolds = ratio >= BALANCE_THRESHOLDS.minLateToEarlySetbackRatio
  const floorHolds = lateSetback >= BALANCE_THRESHOLDS.minLateSetbackRate
  results.push({
    name: 'loss persistence',
    passed: ratioHolds && floorHolds,
    detail: `late setback rate ${(lateSetback * 100).toFixed(1)}% (floor ${BALANCE_THRESHOLDS.minLateSetbackRate * 100}%), ` +
      `late/early ratio ${ratio.toFixed(2)} (floor ${BALANCE_THRESHOLDS.minLateToEarlySetbackRatio}); early was ${(earlySetback * 100).toFixed(1)}%`
  })

  // 3. Lead volatility
  results.push({
    name: 'late lead volatility',
    passed: report.lateLeadChangeRate >= BALANCE_THRESHOLDS.minLateLeadChangeRate,
    detail: `leader changes late in ${(report.lateLeadChangeRate * 100).toFixed(1)}% of matches (floor ${BALANCE_THRESHOLDS.minLateLeadChangeRate * 100}%)`
  })
  results.push({
    name: 'no early runaway',
    passed: report.earlyLeaderWinRate <= BALANCE_THRESHOLDS.maxEarlyLeaderWinRate,
    detail: `yr-20 leader wins ${(report.earlyLeaderWinRate * 100).toFixed(1)}% of the time (ceiling ${BALANCE_THRESHOLDS.maxEarlyLeaderWinRate * 100}%)`
  })

  // 4. No death spiral (BACKLOG D5) — see BALANCE_THRESHOLDS' comment. Uses
  // the same DIAGNOSTICS fields the Phase 11.5 report block already prints;
  // this is the first time they gate rather than merely inform.
  const holdingsGrowthRatio = firstThirdMean(report.fieldHoldingsByDecade) > 0
    ? lastThirdMean(report.fieldHoldingsByDecade) / firstThirdMean(report.fieldHoldingsByDecade)
    : 0
  const populationRetentionRatio = firstThirdMean(report.fieldPopulationByDecade) > 0
    ? lastThirdMean(report.fieldPopulationByDecade) / firstThirdMean(report.fieldPopulationByDecade)
    : 0
  const lateNonLeaderReturn = lastThirdMean(report.nonLeaderReturnByDecade)

  const holdingsGrew = holdingsGrowthRatio >= BALANCE_THRESHOLDS.minFieldHoldingsGrowthRatio
  const populationHeld = populationRetentionRatio >= BALANCE_THRESHOLDS.minFieldPopulationRetentionRatio
  const nonLeaderHealthy = lateNonLeaderReturn >= BALANCE_THRESHOLDS.minNonLeaderLateReturn
  const extinctionAcceptable = report.extinctionRate <= BALANCE_THRESHOLDS.maxExtinctionRate

  results.push({
    name: 'no death spiral',
    passed: holdingsGrew && populationHeld && nonLeaderHealthy && extinctionAcceptable,
    detail: `field holdings growth ratio ${holdingsGrowthRatio.toFixed(2)} (floor ${BALANCE_THRESHOLDS.minFieldHoldingsGrowthRatio}), ` +
      `population retention ${populationRetentionRatio.toFixed(2)} (floor ${BALANCE_THRESHOLDS.minFieldPopulationRetentionRatio}), ` +
      `late non-leader return ${(lateNonLeaderReturn * 100).toFixed(2)}% (floor ${BALANCE_THRESHOLDS.minNonLeaderLateReturn * 100}%), ` +
      `extinction rate ${(report.extinctionRate * 100).toFixed(1)}% (ceiling ${BALANCE_THRESHOLDS.maxExtinctionRate * 100}%)`
  })

  return { passed: results.every((r) => r.passed), results }
}
