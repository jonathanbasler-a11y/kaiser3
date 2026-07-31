// The Phase 6 anti-snowball gate. Run with `npm run balance [matches] [years]`.
//
// Prints the three flatness criteria and exits non-zero if any fails, so this can
// gate a build as well as inform tuning.

import { analyseBalance, BalanceReport } from '../src/ai/balance.ts'
import { aiCompetitor, Competitor } from '../src/ai/sim.ts'
import { BALANCE_THRESHOLDS, evaluateCriteria } from '../src/ai/balanceCriteria.ts'

const matches = Number(process.argv[2] ?? 200)
const maxYears = Number(process.argv[3] ?? 60)

const competitors: Competitor[] = [
  aiCompetitor('builder', 'builder'),
  aiCompetitor('expansionist', 'expansionist'),
  aiCompetitor('merchant', 'merchant')
]

console.log(`Kaiser 3 — balance harness`)
console.log(`${matches} seeded matches x ${maxYears} years, ${competitors.length} AI rulers\n`)

const started = Date.now()
const report: BalanceReport = analyseBalance({ competitors, matches, maxYears })
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

const criteria = evaluateCriteria(report)
console.log('\n--- Verdict ---')
for (const result of criteria.results) {
  console.log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`)
}
console.log(`\n${criteria.passed ? 'BALANCE GATE PASSED' : 'BALANCE GATE FAILED'}  (${elapsed}s)`)

if (!criteria.passed) process.exit(1)
