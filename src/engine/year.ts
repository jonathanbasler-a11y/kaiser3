// THE REDUCER: advanceYear() is the single function that advances the game by one year.
// Pure deterministic function: same (state, decisions[], seed) → byte-identical result.
// This is the load-bearing contract for AI parity, testability, and future multiplayer.

import { SeededRng } from './rng.ts'
import { GameState, Decision, Chronicle, PlayerChronicle, PlayerEvent } from './state.ts'

export function advanceYear(
  state: GameState,
  decisions: Record<string, Decision[]>,  // Map player ID → their yearly decisions
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
  // 1. Harvest & grain calculation
  // 2. Grain distribution outcome
  // 3. Land trading
  // 4. Taxation & income
  // 5. Construction
  // 6. Population dynamics
  // 7. Espionage / sabotage
  // 8. Event system (plague, fire, famine, revolt, banditry)
  // 9. Warfare (optional)
  // 10. Chronicle/rank check

  // For each active player:
  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    if (!player || player.dead) continue

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

    // TODO: Implement each phase (Phases 1–2 will fill these in)
    // - Harvest (economy.ts)
    // - Grain feeding (population.ts)
    // - Land trading (land.ts)
    // - Tax/tariff (tax.ts)
    // - Construction (buildings.ts)
    // - Population births/deaths/migration (population.ts)
    // - Espionage (espionage.ts)
    // - Events (events/events.ts)
    // - Warfare (war.ts)
    // - Rank check (ranks.ts)

    chronicle.playerReports[playerId] = report
  }

  newState.year += 1
  return { state: newState, chronicle }
}
