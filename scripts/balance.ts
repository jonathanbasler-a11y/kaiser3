// The Phase 6 anti-snowball gate. Run with `npm run balance [matches] [years]`.
//
// Prints the four criteria (Phase 13 added #4, the death-spiral floor — see
// BACKLOG D5) and exits non-zero if any fails, so this can gate a build as
// well as inform tuning.
//
// Phase 13 (BACKLOG D4): matches are now generated in parallel across worker
// threads, one per available CPU core (minus one, so the machine stays
// responsive) — each match is an independent seeded simulation, so this is
// pure scheduling, not a determinism risk. Falls back to the original serial
// path (analyseBalance) if worker spawning fails for any reason, so the gate
// itself never depends on the parallelisation working.

import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'
import { analyseBalance, BalanceConfig, BalanceReport } from '../src/ai/balance.ts'
import { analyseBalanceParallel } from '../src/ai/balanceParallel.ts'
import { aiCompetitor, Competitor } from '../src/ai/sim.ts'
import { getPersonalities } from '../src/ai/personalities.ts'
import { BALANCE_THRESHOLDS, evaluateCriteria } from '../src/ai/balanceCriteria.ts'

const matches = Number(process.argv[2] ?? 200)
const maxYears = Number(process.argv[3] ?? 60)

const competitors: Competitor[] = getPersonalities().map((p) => aiCompetitor(p.id, p.id))

const WORKER_PATH = fileURLToPath(new URL('./balance-worker.ts', import.meta.url))

async function run(): Promise<BalanceReport> {
  const config: BalanceConfig = { competitors, matches, maxYears }
  const workerCount = Math.max(1, cpus().length - 1)

  if (workerCount <= 1 || matches < workerCount) {
    return analyseBalance(config)
  }

  try {
    return await analyseBalanceParallel(WORKER_PATH, config, workerCount)
  } catch (err) {
    console.error(`Worker parallelisation failed (${(err as Error).message}), falling back to serial.`)
    return analyseBalance(config)
  }
}

console.log(`Kaiser 3 — balance harness`)
console.log(`${matches} seeded matches x ${maxYears} years, ${competitors.length} AI rulers\n`)

const started = Date.now()
const report: BalanceReport = await run()
const elapsed = ((Date.now() - started) / 1000).toFixed(1)

const pct = (x: number) => (x * 100).toFixed(1).padStart(6) + '%'

console.log('--- 1. Margin flatness: leader return on holdings, by decade ---')
report.leaderReturnByDecade.forEach((value, i) => {
  console.log(`  decade ${i + 1} (yr ${i * 10 + 1}-${i * 10 + 10}): ${(value * 100).toFixed(3).padStart(7)}% return`)
})
console.log(`  trend slope: ${report.returnTrendSlope.toExponential(3)} (must be <= ${BALANCE_THRESHOLDS.maxReturnTrendSlope})`)

console.log('\n--- 2. Loss persistence: chance the leader takes a >=15% hit, by decade ---')
report.setbackRateByDecade.forEach((value, i) => {
  console.log(`  decade ${i + 1}: ${pct(value)}`)
})

console.log('\n--- 3. Lead volatility ---')
console.log(`  leader changes after yr 30: ${pct(report.lateLeadChangeRate)} of matches (must be >= ${BALANCE_THRESHOLDS.minLateLeadChangeRate * 100}%)`)
console.log(`  yr-20 leader goes on to win: ${pct(report.earlyLeaderWinRate)} of matches (must be <= ${BALANCE_THRESHOLDS.maxEarlyLeaderWinRate * 100}%)`)

// DIAGNOSTICS are still printed even though criterion 4 (below) now gates on
// the same fields — the raw per-decade numbers remain useful for reading
// *why* a FAIL happened, not just that one did.
console.log('\n--- 4. No death spiral (BACKLOG D5) ---')
console.log('  Leader vs non-leader return by decade. The design INTENDS the leader')
console.log('  to suffer; it does not intend everyone to. Leader negative while')
console.log('  non-leader is healthy = the anti-snowball lever working. Both')
console.log('  negative = a death spiral.')
report.leaderReturnByDecade.forEach((leaderValue, i) => {
  const others = report.nonLeaderReturnByDecade[i]
  console.log(
    `  decade ${i + 1}: leader ${(leaderValue * 100).toFixed(3).padStart(7)}%` +
    `   non-leader ${(others * 100).toFixed(3).padStart(7)}%`
  )
})

console.log('\n  Is the field growing or shrinking? (mean per ruler)')
report.fieldPopulationByDecade.forEach((pop, i) => {
  console.log(
    `  decade ${i + 1}: population ${pop.toFixed(0).padStart(6)}` +
    `   holdings ${report.fieldHoldingsByDecade[i].toFixed(0).padStart(9)}` +
    `   mean rank ${report.meanRankByDecade[i].toFixed(2)}`
  )
})
console.log(`\n  Matches where a ruler was wiped out entirely: ${pct(report.extinctionRate)}`)

const criteria = evaluateCriteria(report)
console.log('\n--- Verdict ---')
for (const result of criteria.results) {
  console.log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`)
}
console.log(`\n${criteria.passed ? 'BALANCE GATE PASSED' : 'BALANCE GATE FAILED'}  (${elapsed}s)`)

if (!criteria.passed) process.exit(1)
