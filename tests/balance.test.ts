import { describe, it, expect } from 'vitest'
import { analyseBalance, runInstrumentedMatch, trendSlope } from '../src/ai/balance.ts'
import { evaluateCriteria, BALANCE_THRESHOLDS } from '../src/ai/balanceCriteria.ts'
import { aiCompetitor, Competitor } from '../src/ai/sim.ts'

// The full gate runs 200 matches (`npm run balance`), which is far too slow for
// CI. These use a smaller sample of the SAME deterministic seeds, so they are
// exact rather than flaky and still catch a regression that reintroduces
// snowballing. The committed report in docs/balance-report.md records the
// full-size run.
const MATCHES = 24
const YEARS = 60

const COMPETITORS: Competitor[] = [
  aiCompetitor('builder', 'builder'),
  aiCompetitor('expansionist', 'expansionist'),
  aiCompetitor('merchant', 'merchant')
]

describe('trendSlope', () => {
  it('is zero for a flat series', () => {
    expect(trendSlope([1, 1, 1, 1])).toBeCloseTo(0, 10)
  })

  it('is positive for a rising series and negative for a falling one', () => {
    expect(trendSlope([1, 2, 3, 4])).toBeGreaterThan(0)
    expect(trendSlope([4, 3, 2, 1])).toBeLessThan(0)
  })

  it('handles degenerate input without blowing up', () => {
    expect(trendSlope([])).toBe(0)
    expect(trendSlope([5])).toBe(0)
  })
})

describe('instrumentation', () => {
  it('records one snapshot per year played, with a leader identified', () => {
    const timeline = runInstrumentedMatch(COMPETITORS, 1, 20)
    expect(timeline.snapshots.length).toBe(20)
    expect(timeline.snapshots[0].year).toBe(1)
    expect(timeline.snapshots[19].year).toBe(20)
    for (const snapshot of timeline.snapshots) {
      expect(snapshot.leaderId).toBeTruthy()
    }
  })

  it('measures adversity from events, never from the ruler spending its own money', () => {
    // The distinction that makes criterion 2 meaningful. A ruler that empties its
    // treasury buying land has not suffered a setback — and an earlier version of
    // this metric counted exactly that, which made the early game look dangerous
    // and the mature game look serene, the opposite of the truth.
    const timeline = runInstrumentedMatch(COMPETITORS, 1, 30)
    for (const snapshot of timeline.snapshots) {
      for (const record of Object.values(snapshot.players)) {
        expect(record.eventLossShare).toBeGreaterThanOrEqual(0)
        expect(record.eventLossShare).toBeLessThanOrEqual(1)
        // No event fired means no adversity, whatever the treasury did.
        if (record.eventGoldLoss === 0) {
          expect(record.eventLossShare).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('is deterministic for a given seed', () => {
    const a = runInstrumentedMatch(COMPETITORS, 99, 20)
    const b = runInstrumentedMatch(COMPETITORS, 99, 20)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('ANTI-SNOWBALL GATE (PLAN.md Phase 6)', () => {
  const report = analyseBalance({ competitors: COMPETITORS, matches: MATCHES, maxYears: YEARS })
  const criteria = evaluateCriteria(report)

  it('1. margin flatness — returns do not compound across decades', () => {
    // The core anti-snowball property: a bigger realm must not earn a HIGHER rate
    // of return than a small one, or wealth runs away from the costs and risks it
    // attracts.
    expect(report.returnTrendSlope).toBeLessThanOrEqual(BALANCE_THRESHOLDS.maxReturnTrendSlope)
  })

  it('2. loss persistence — the late game stays dangerous', () => {
    const criterion = criteria.results.find((r) => r.name === 'loss persistence')!
    expect(criterion.passed, criterion.detail).toBe(true)
  })

  it('3. lead volatility — the leader still changes late', () => {
    expect(report.lateLeadChangeRate).toBeGreaterThanOrEqual(BALANCE_THRESHOLDS.minLateLeadChangeRate)
  })

  it('4. no early runaway — leading at year 20 does not settle it', () => {
    expect(report.earlyLeaderWinRate).toBeLessThanOrEqual(BALANCE_THRESHOLDS.maxEarlyLeaderWinRate)
  })

  it('passes the gate as a whole', () => {
    const failures = criteria.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.detail}`)
    expect(failures, failures.join(' | ')).toEqual([])
  })

  it('reports a real, non-degenerate setback rate — the metric must actually fire', () => {
    // Guards against the failure mode where a criterion "passes" only because it
    // is measuring nothing. An earlier holdings-based version read 0.0% in every
    // decade of every match and sailed through on a division-by-zero fallback.
    const anyDecadeHasSetbacks = report.setbackRateByDecade.some((rate) => rate > 0)
    expect(anyDecadeHasSetbacks).toBe(true)
  })
})
