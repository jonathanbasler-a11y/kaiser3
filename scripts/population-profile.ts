// Diagnostic: attributes population change to natural increase vs event/war
// channels per decade — balance gate alone cannot see whether the plague
// ceiling was retuned (Phase 20.2).

import { runMatch, aiCompetitor } from '../src/ai/sim.ts'

const MATCHES = 8
const MAX_YEARS = 60

type Bucket = {
  natural: number
  eventPop: number
  warPop: number
  endPop: number
  samples: number
}

function emptyBucket(): Bucket {
  return { natural: 0, eventPop: 0, warPop: 0, endPop: 0, samples: 0 }
}

const decades: Bucket[] = Array.from({ length: 6 }, () => emptyBucket())

for (let m = 0; m < MATCHES; m++) {
  const competitors = [
    aiCompetitor('builder', 'builder'),
    aiCompetitor('expansionist', 'expansionist'),
    aiCompetitor('merchant', 'merchant'),
    aiCompetitor('schemer', 'schemer'),
    aiCompetitor('raider', 'raider')
  ]
  runMatch(competitors, 9001 + m * 7919, MAX_YEARS, (state, chronicle) => {
    const yearJustEnded = state.year - 1
    const decade = Math.min(5, Math.floor(yearJustEnded / 10))
    const bucket = decades[decade]
    for (const id of state.activePlayerIds) {
      const report = chronicle.playerReports[id]
      if (!report) continue
      const natural = report.births - report.deaths + report.immigration - report.emigration
      bucket.natural += natural
      bucket.eventPop += report.eventPopulationLoss
      bucket.endPop += state.players[id].population.peasants
      bucket.samples++
    }
    for (const war of chronicle.wars) {
      bucket.warPop += war.attackerCasualties + war.defenderCasualties
    }
  })
}

// runMatch (src/ai/sim.ts) stops a match the moment any competitor reaches
// Kaiser, so late decades can end up with zero samples across all MATCHES —
// dividing by Math.max(1, samples) would then print a misleading "0.0" that
// looks like measured data instead of "no match survived this long."
console.log('Population profile (mean per ruler-year within decade)\n')
console.log('decade | natural Δ | event loss | war cas. | mean pop | samples')
console.log('-------+-----------+------------+----------+----------+--------')
for (let d = 0; d < decades.length; d++) {
  const b = decades[d]
  const label = `${d * 10 + 1}-${(d + 1) * 10}`.padStart(5)
  if (b.samples === 0) {
    console.log(`${label} |       n/a |        n/a |      n/a |      n/a | 0 (no match reached this decade)`)
    continue
  }
  const n = b.samples
  console.log(
    `${label} | ${(b.natural / n).toFixed(1).padStart(9)} | ${(b.eventPop / n).toFixed(1).padStart(10)} | ${(b.warPop / n).toFixed(1).padStart(8)} | ${(b.endPop / n).toFixed(0).padStart(8)} | ${n}`
  )
}
