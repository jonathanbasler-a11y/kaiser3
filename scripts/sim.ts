// Headless simulation runner. Plays seeded games without UI — used for AI benchmarking
// (Phase 5+) and quick sanity checks during core-sim development (Phase 1+).

import { advanceYear } from '../src/engine/year.ts'
import { Decision } from '../src/engine/state.ts'
import { createStarterState } from '../src/engine/starter.ts'

function requiredFeedDecisions(): Record<string, Decision[]> {
  const forPlayer: Decision[] = [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
  ]
  return { player1: forPlayer, player2: forPlayer }
}

const YEARS = 20
let state = createStarterState([{ id: 'player1', name: 'P1' }, { id: 'player2', name: 'P2' }])
const decisions = requiredFeedDecisions()

console.log(`Kaiser 3 headless sim — ${YEARS} years, "required" feeding, no-op land trades\n`)
console.log('Year | Player  | Peasants | Unrest | Taler   | GrainStock | Harvest')
console.log('-----|---------|----------|--------|---------|------------|--------')

for (let year = 0; year < YEARS; year++) {
  const result = advanceYear(state, decisions, year * 1000 + 1)
  state = result.state

  for (const playerId of state.activePlayerIds) {
    const player = state.players[playerId]
    const report = result.chronicle.playerReports[playerId]
    console.log(
      `${String(state.year).padStart(4)} | ${player.name.padEnd(7)} | ` +
      `${player.population.peasants.toFixed(0).padStart(8)} | ` +
      `${player.population.unrest.toFixed(1).padStart(6)} | ` +
      `${player.taler.toFixed(0).padStart(7)} | ` +
      `${player.grainStock.toFixed(0).padStart(10)} | ` +
      `${report.harvestYield.toFixed(0)}`
    )
  }
}

console.log('\nDone.')
