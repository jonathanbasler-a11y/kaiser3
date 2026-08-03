// D1 re-measurement (BACKLOG.md): "Duke ~60y, Count ~120y, Margrave ~300y"
// predates Phase 8's food-scarcity rework and Phase 12's ai-bench showing mean
// rank 3.27 (Count) at year 60 across a 5-ruler competitive match. Those two
// numbers cannot both be right. This script measures years-to-first-rank
// directly from solo play (one archetype, no rivals competing for the same
// land/titles) so D1's original "how hard is progression" framing is answered
// on its own terms, not conflated with competitive pressure.
//
// Run with `npx tsx scripts/rank-timing.ts`.

import { aiCompetitor, runMatch } from '../src/ai/sim.ts'
import { getPersonalities } from '../src/ai/personalities.ts'
import { playerIdSalt } from '../src/ai/planningSeed.ts'
import { getRankName, getTopRank } from '../src/engine/ranks.ts'

const MAX_YEARS = 300
const SEEDS_PER_ARCHETYPE = 20
const TOP_RANK = getTopRank()

console.log('D1 re-measurement: years to first reach each rank (solo play, no rivals)')
console.log(`${SEEDS_PER_ARCHETYPE} seeds x ${getPersonalities().length} archetypes, up to ${MAX_YEARS} years\n`)

// yearReached[rank] = array of years it took, across every seed/archetype
// that reached that rank at all (never reaching it within MAX_YEARS is
// recorded separately as a miss, not averaged in as MAX_YEARS).
const yearReached: number[][] = Array.from({ length: TOP_RANK + 1 }, () => [])
let totalRuns = 0

for (const personality of getPersonalities()) {
  for (let i = 0; i < SEEDS_PER_ARCHETYPE; i++) {
    totalRuns++
    const seenRanks = new Set<number>([0])
    runMatch(
      [aiCompetitor('solo', personality.id)],
      1000 + i * 7919 + playerIdSalt(personality.id),
      MAX_YEARS,
      (state) => {
        const rank = state.players['solo']?.rank
        if (rank !== undefined && !seenRanks.has(rank)) {
          for (let r = 1; r <= rank; r++) {
            if (!seenRanks.has(r)) {
              yearReached[r].push(state.year)
              seenRanks.add(r)
            }
          }
        }
      }
    )
  }
}

console.log('Rank            | Mean year (of runs that reached it) | Reached within 300y')
console.log('-----------------|--------------------------------------|--------------------')
for (let rank = 1; rank <= TOP_RANK; rank++) {
  const years = yearReached[rank]
  const meanYear = years.length > 0 ? (years.reduce((a, b) => a + b, 0) / years.length).toFixed(1) : 'never'
  const reachedPct = ((years.length / totalRuns) * 100).toFixed(1)
  console.log(`${getRankName(rank).padEnd(16)} | ${meanYear.toString().padStart(36)} | ${reachedPct.padStart(18)}%`)
}
