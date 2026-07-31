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
  maxEarlyLeaderWinRate: 0.85
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

  return { passed: results.every((r) => r.passed), results }
}
