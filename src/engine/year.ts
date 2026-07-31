// THE REDUCER: advanceYear() is the single function that advances the game by one year.
// Pure deterministic function: same (state, decisions[], seed) → byte-identical result.
// This is the load-bearing contract for AI parity, testability, and future multiplayer.

import { SeededRng } from './rng.ts'
import { GameState, Decision, Chronicle, PlayerChronicle, GrainDecision, LandTradeDecision } from './state.ts'
import { calculateHarvest, resolveFeeding } from './economy.ts'
import { applyLandTrade } from './land.ts'
import { applyPopulationDynamics } from './population.ts'

function findDecision<T extends Decision>(decisions: Decision[], type: T['type']): T | undefined {
  return decisions.find((d) => d.type === type) as T | undefined
}

export function advanceYear(
  state: GameState,
  decisions: Record<string, Decision[]>,
  seed: number
): { state: GameState; chronicle: Chronicle } {
  const rng = new SeededRng(seed)
  const newState = JSON.parse(JSON.stringify(state)) as GameState
  const chronicle: Chronicle = {
    year: state.year + 1,
    playerReports: {},
    globalEvents: []
  }

  // Year-advance sequence (mirrors the research doc's core gameplay loop):
  // 1. Land trading            [Phase 1 — implemented]
  // 2. Harvest & grain calc    [Phase 1 — implemented]
  // 3. Grain distribution      [Phase 1 — implemented]
  // 4. Population dynamics     [Phase 1 — implemented]
  // 5. Taxation & income       [Phase 2]
  // 6. Construction & ranks    [Phase 2]
  // 7. Espionage / sabotage    [Phase 7]
  // 8. Event system            [Phase 4]
  // 9. Warfare                 [Phase 8]

  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    if (!player || player.dead) continue

    const playerDecisions = decisions[playerId] ?? []

    const report: PlayerChronicle = {
      births: 0,
      deaths: 0,
      emigration: 0,
      immigration: 0,
      harvestYield: 0,
      spoilage: 0,
      marketIncome: 0,
      millIncome: 0,
      tributeIncome: 0,
      taxIncome: 0,
      tariffIncome: 0,
      upkeepCost: 0,
      eventLosses: 0,
      unrestGain: 0,
      events: [],
      rankPromoted: false
    }

    // 1. Land trading (against the NPC Kaiser)
    const landDecision = findDecision<LandTradeDecision>(playerDecisions, 'land_trade')
    if (landDecision) {
      const tradeResult = applyLandTrade(player.land, player.taler, landDecision, newState.kaizerTradePrices)
      player.land = tradeResult.newLand
      player.taler = tradeResult.newTaler
    }

    // 2. Harvest (labor-gated productivity, weather variance, spoilage on carried-over stock)
    const harvest = calculateHarvest(player.land, player.population, player.grainStock, rng)
    player.grainStock = harvest.newGrainStock
    report.harvestYield = harvest.grossYield
    report.spoilage = harvest.spoiledFromStock

    // 3. Grain feeding decision
    const grainDecision = findDecision<GrainDecision>(playerDecisions, 'grain') ?? { type: 'grain', feedLevel: 'required' }
    const feeding = resolveFeeding(grainDecision, player.population, player.grainStock)
    player.grainStock = feeding.grainStockAfter

    // 4. Population dynamics (births/deaths/migration driven by feeding adequacy)
    const popResult = applyPopulationDynamics(player.population, feeding, rng)
    const unrestBefore = player.population.unrest
    player.population = popResult.newPopulation
    report.births = popResult.births
    report.deaths = popResult.deaths
    report.emigration = popResult.emigration
    report.immigration = popResult.immigration
    report.unrestGain = player.population.unrest - unrestBefore

    chronicle.playerReports[playerId] = report
  }

  newState.year += 1
  return { state: newState, chronicle }
}
