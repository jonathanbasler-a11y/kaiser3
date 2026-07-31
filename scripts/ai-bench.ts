// AI benchmark: measures the Phase 5 acceptance criteria and prints how each
// archetype actually plays. Run with `npm run ai-bench`.

import { getPersonalities } from '../src/ai/personalities.ts'
import { aiCompetitor, runMatch, runTournament, Competitor, materialScore } from '../src/ai/sim.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import { getRankName } from '../src/engine/ranks.ts'

const MAX_YEARS = 60

console.log('=== AI vs. random-legal bot (head to head) ===')
for (const personality of getPersonalities()) {
  const competitors: Competitor[] = [
    aiCompetitor('ai', personality.id),
    { id: 'bot', name: 'Random Bot', controller: { kind: 'random' } }
  ]
  const t0 = Date.now()
  const tournament = runTournament(competitors, 30, MAX_YEARS)
  const elapsed = Date.now() - t0
  console.log(
    `${personality.name.padEnd(18)} win rate ${(tournament.winRate('ai') * 100).toFixed(1).padStart(5)}%` +
    `  (${tournament.winsByPlayer['ai']}/${tournament.matches})  [${elapsed}ms]`
  )
}

console.log('\n=== AI vs. passive ruler ===')
for (const personality of getPersonalities()) {
  const competitors: Competitor[] = [
    aiCompetitor('ai', personality.id),
    { id: 'passive', name: 'Passive', controller: { kind: 'passive' } }
  ]
  const tournament = runTournament(competitors, 20, MAX_YEARS)
  console.log(`${personality.name.padEnd(18)} win rate ${(tournament.winRate('ai') * 100).toFixed(1).padStart(5)}%`)
}

console.log('\n=== Archetype end-state profiles (mean over 12 solo matches) ===')
console.log('Archetype          |    Taler | Peasants |   Land | Mkt+Mill | Palace | Mitig | Rank')
console.log('-------------------|----------|----------|--------|----------|--------|-------|-----')
for (const personality of getPersonalities()) {
  const totals = { taler: 0, peasants: 0, land: 0, production: 0, palace: 0, mitigation: 0, rank: 0 }
  const RUNS = 12
  for (let i = 0; i < RUNS; i++) {
    const result = runMatch([aiCompetitor('ai', personality.id)], 500 + i * 131, MAX_YEARS)
    const p = result.finalState.players['ai']
    totals.taler += p.taler
    totals.peasants += p.population.peasants
    totals.land += p.land.farmland + p.land.buildingLand
    totals.production += p.buildings.markets + p.buildings.mills
    totals.palace += p.buildings.palace
    totals.mitigation += p.buildings.hospital + p.buildings.well + p.buildings.granary + p.buildings.garrison
    totals.rank += p.rank
  }
  console.log(
    `${personality.name.padEnd(18)} | ${(totals.taler / RUNS).toFixed(0).padStart(8)} | ` +
    `${(totals.peasants / RUNS).toFixed(0).padStart(8)} | ${(totals.land / RUNS).toFixed(0).padStart(6)} | ` +
    `${(totals.production / RUNS).toFixed(1).padStart(8)} | ${(totals.palace / RUNS).toFixed(1).padStart(6)} | ` +
    `${(totals.mitigation / RUNS).toFixed(2).padStart(5)} | ${(totals.rank / RUNS).toFixed(2).padStart(4)}`
  )
}

console.log('\n=== Legality audit (every decision sheet emitted in 6 full matches) ===')
let sheets = 0
let illegal = 0
for (const personality of getPersonalities()) {
  for (let i = 0; i < 2; i++) {
    const result = runMatch(
      [aiCompetitor('ai', personality.id), { id: 'bot', name: 'Bot', controller: { kind: 'random' } }],
      900 + i * 17,
      MAX_YEARS
    )
    for (const entry of result.allDecisions) {
      if (entry.playerId !== 'ai') continue
      sheets++
      if (!validateDecisions(entry.decisions).valid) illegal++
    }
  }
}
console.log(`${sheets} AI decision sheets audited, ${illegal} illegal.`)

console.log('\n=== Sample match narrative (builder vs. expansionist vs. merchant) ===')
const threeWay = runMatch(
  [aiCompetitor('builder', 'builder'), aiCompetitor('expansionist', 'expansionist'), aiCompetitor('merchant', 'merchant')],
  4242,
  MAX_YEARS
)
console.log(`Winner: ${threeWay.winnerId} after ${threeWay.yearsPlayed} years (reached Kaiser: ${threeWay.reachedKaiser})`)
for (const id of threeWay.finalState.activePlayerIds) {
  const p = threeWay.finalState.players[id]
  console.log(
    `  ${id.padEnd(13)} ${getRankName(p.rank).padEnd(10)} taler=${p.taler.toFixed(0).padStart(8)} ` +
    `pop=${p.population.peasants.toFixed(0).padStart(6)} palace=${String(p.buildings.palace).padStart(2)} ` +
    `score=${materialScore(p).toFixed(0)}`
  )
}
