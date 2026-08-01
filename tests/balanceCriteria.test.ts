// Criterion 4 — "no death spiral" (Phase 13, BACKLOG D5). Unlike criteria 1-3,
// this is tested against HAND-CONSTRUCTED BalanceReport objects rather than a
// real match: the point is to prove the floor actually fails a spiral-shaped
// report and passes a healthy one, and a real match can't be reliably steered
// into producing either shape on demand. evaluateCriteria() takes a plain
// BalanceReport, so this is a legitimate, deterministic way to exercise it.

import { describe, it, expect } from 'vitest'
import { evaluateCriteria, BALANCE_THRESHOLDS } from '../src/ai/balanceCriteria.ts'
import { BalanceReport } from '../src/ai/balance.ts'

// A report shaped like Phase 12's actual measured healthy runs: leader return
// decaying but staying near-flat/positive (criteria 1-3 already cover that),
// field holdings/population/rank growing every decade, non-leader return
// dipping only slightly negative at the very end, zero extinctions.
function healthyReport(): BalanceReport {
  return {
    matches: 200,
    decades: 6,
    leaderReturnByDecade: [0.0547, 0.0288, 0.0148, 0.0062, 0.0033, -0.0027],
    returnTrendSlope: -1.05e-2,
    setbackRateByDecade: [0.825, 0.82, 0.93, 0.99, 0.934, 0.908],
    lateLeadChangeRate: 0.75,
    earlyLeaderWinRate: 0.39,
    nonLeaderReturnByDecade: [0.0452, 0.0314, 0.0174, 0.0069, -0.0006, -0.0061],
    fieldPopulationByDecade: [1069, 1235, 1492, 1774, 1990, 2097],
    fieldHoldingsByDecade: [404462, 577929, 744701, 882350, 987562, 1049261],
    meanRankByDecade: [0.03, 0.5, 1.15, 1.93, 2.71, 3.27],
    extinctionRate: 0.0
  }
}

// A report shaped like an actual death spiral: holdings and population
// shrinking every decade, non-leader return deeply negative (not just the
// leader), a real extinction rate. This is exactly the shape criteria 1-3
// alone would NOT catch — margin flatness is satisfied by a falling return
// (arguably better than flat), and loss persistence is satisfied by high
// setback rates regardless of who they're happening to.
function spiralReport(): BalanceReport {
  return {
    matches: 200,
    decades: 6,
    leaderReturnByDecade: [0.02, -0.01, -0.03, -0.05, -0.07, -0.09],
    returnTrendSlope: -0.02, // satisfies criterion 1 easily — a falling trend "passes" margin flatness
    setbackRateByDecade: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], // satisfies criterion 2 easily too
    lateLeadChangeRate: 0.25,
    earlyLeaderWinRate: 0.5,
    nonLeaderReturnByDecade: [0.01, -0.02, -0.05, -0.08, -0.11, -0.14],
    fieldPopulationByDecade: [1000, 850, 700, 550, 400, 250],
    fieldHoldingsByDecade: [400000, 350000, 300000, 250000, 200000, 150000],
    meanRankByDecade: [0.0, 0.2, 0.3, 0.3, 0.2, 0.1],
    extinctionRate: 0.4
  }
}

describe('criterion 4: no death spiral', () => {
  it('a healthy, measured-shape report passes the whole gate', () => {
    const result = evaluateCriteria(healthyReport())
    const spiralCriterion = result.results.find((r) => r.name === 'no death spiral')!
    expect(spiralCriterion.passed, spiralCriterion.detail).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('a genuine death spiral FAILS the gate even though it would satisfy criteria 1-3', () => {
    const result = evaluateCriteria(spiralReport())

    // Prove the premise: criteria 1-3 alone are fooled by this shape (this is
    // exactly the D5 finding — a falling return trend and high setback rate
    // read as "working as intended" without the field-wide view).
    const marginFlatness = result.results.find((r) => r.name === 'margin flatness')!
    const lossPersistence = result.results.find((r) => r.name === 'loss persistence')!
    expect(marginFlatness.passed).toBe(true)
    expect(lossPersistence.passed).toBe(true)

    // The new criterion catches what they miss.
    const spiralCriterion = result.results.find((r) => r.name === 'no death spiral')!
    expect(spiralCriterion.passed, spiralCriterion.detail).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('fails specifically on shrinking field holdings', () => {
    const report = healthyReport()
    report.fieldHoldingsByDecade = [500000, 450000, 400000, 350000, 300000, 250000]
    const result = evaluateCriteria(report)
    expect(result.results.find((r) => r.name === 'no death spiral')!.passed).toBe(false)
  })

  it('fails specifically on population collapse, holding everything else healthy', () => {
    const report = healthyReport()
    report.fieldPopulationByDecade = [1069, 900, 700, 500, 300, 150]
    const result = evaluateCriteria(report)
    expect(result.results.find((r) => r.name === 'no death spiral')!.passed).toBe(false)
  })

  it('fails specifically on non-leader return going deeply negative late', () => {
    const report = healthyReport()
    report.nonLeaderReturnByDecade = [0.04, 0.02, -0.02, -0.05, -0.08, -0.12]
    const result = evaluateCriteria(report)
    expect(result.results.find((r) => r.name === 'no death spiral')!.passed).toBe(false)
  })

  it('fails specifically on a high extinction rate, holding everything else healthy', () => {
    const report = healthyReport()
    report.extinctionRate = 0.5
    const result = evaluateCriteria(report)
    expect(result.results.find((r) => r.name === 'no death spiral')!.passed).toBe(false)
  })

  it('tolerates the actual noise level measured in Phase 12 (small late non-leader dip)', () => {
    // Non-leader return dipped to -0.61% in Phase 12's worst measured decade.
    // The floor must not be so tight that ordinary noise fails the gate.
    const report = healthyReport()
    report.nonLeaderReturnByDecade[5] = -0.0061
    const result = evaluateCriteria(report)
    expect(result.results.find((r) => r.name === 'no death spiral')!.passed).toBe(true)
  })

  it('thresholds are internally consistent (floors are not accidentally impossible)', () => {
    expect(BALANCE_THRESHOLDS.minFieldHoldingsGrowthRatio).toBeGreaterThan(0)
    expect(BALANCE_THRESHOLDS.minFieldPopulationRetentionRatio).toBeGreaterThan(0)
    expect(BALANCE_THRESHOLDS.minFieldPopulationRetentionRatio).toBeLessThanOrEqual(1)
    expect(BALANCE_THRESHOLDS.maxExtinctionRate).toBeGreaterThan(0)
    expect(BALANCE_THRESHOLDS.maxExtinctionRate).toBeLessThan(1)
  })
})
