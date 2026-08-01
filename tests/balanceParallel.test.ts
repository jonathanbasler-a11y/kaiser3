// Phase 13, BACKLOG D4: worker-thread parallelisation of the balance harness.
// The one property that matters is that it changes NOTHING about the result —
// only how fast it's computed. This asserts the parallel path (real worker
// threads, not a mock) produces byte-identical output to the serial path for
// the same config, and that planSlices() itself preserves total match count
// and produces contiguous, non-overlapping, ascending ranges.

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { analyseBalance, BalanceConfig } from '../src/ai/balance.ts'
import { analyseBalanceParallel, planSlices } from '../src/ai/balanceParallel.ts'
import { aiCompetitor, Competitor } from '../src/ai/sim.ts'

const WORKER_PATH = fileURLToPath(new URL('../scripts/balance-worker.ts', import.meta.url))

const COMPETITORS: Competitor[] = [
  aiCompetitor('builder', 'builder'),
  aiCompetitor('merchant', 'merchant')
]

describe('planSlices', () => {
  it('covers every match index exactly once, contiguously and in order', () => {
    for (const [total, workers] of [[17, 4], [10, 3], [1, 5], [200, 7]] as const) {
      const slices = planSlices(total, workers)
      let expectedStart = 0
      let covered = 0
      for (const slice of slices) {
        expect(slice.startIndex).toBe(expectedStart)
        expect(slice.count).toBeGreaterThan(0)
        expectedStart += slice.count
        covered += slice.count
      }
      expect(covered).toBe(total)
    }
  })

  it('never produces more slices than requested workers', () => {
    expect(planSlices(2, 8).length).toBeLessThanOrEqual(8)
  })
})

describe('analyseBalanceParallel produces identical output to the serial path', () => {
  it('matches analyseBalance() byte-for-byte on the same config', async () => {
    const config: BalanceConfig = { competitors: COMPETITORS, matches: 12, maxYears: 30 }

    const serial = analyseBalance(config)
    const parallel = await analyseBalanceParallel(WORKER_PATH, config, 4)

    expect(JSON.stringify(parallel)).toBe(JSON.stringify(serial))
  })

  it('still matches when the match count does not divide evenly across workers', async () => {
    const config: BalanceConfig = { competitors: COMPETITORS, matches: 11, maxYears: 20 }

    const serial = analyseBalance(config)
    const parallel = await analyseBalanceParallel(WORKER_PATH, config, 3)

    expect(JSON.stringify(parallel)).toBe(JSON.stringify(serial))
  })
}, 30000)
