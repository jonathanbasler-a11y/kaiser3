// Headless simulation runner. Plays seeded games without UI — used for AI benchmarking
// (Phase 5+) and quick sanity checks during core-sim development (Phase 1+).

import { advanceYear } from '../src/engine/year.ts'
import { GameState, Decision } from '../src/engine/state.ts'

function createStarterState(): GameState {
  const makePlayer = (id: string, name: string) => ({
    id,
    name,
    taler: 15000,
    land: { farmland: 10000, buildingLand: 0 },
    grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: {
      markets: 0, mills: 0, palace: 0, cathedral: 0,
      hospital: 0, well: 0, granary: 0, garrison: 0
    },
    rank: 0,
    guards: 0,
    saboteurs: 0,
    tradingHouses: 0,
    score: 0,
    dead: false
  })

  return {
    year: 0,
    players: { player1: makePlayer('player1', 'P1'), player2: makePlayer('player2', 'P2') },
    activePlayerIds: ['player1', 'player2'],
    kaizerTradePrices: { corn: 40, farmland: 30, buildingLand: 50 }
  }
}

function requiredFeedDecisions(): Record<string, Decision[]> {
  const forPlayer: Decision[] = [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
  ]
  return { player1: forPlayer, player2: forPlayer }
}

const YEARS = 20
let state = createStarterState()
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
