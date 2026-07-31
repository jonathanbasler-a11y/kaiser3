// Starter game state construction — shared by tests, the headless sim, and the
// playable CLI so all three start from the same known-good setup (per the
// original: 15,000 Taler, 10,000 hectares of land, per docs/kaiser-research.md).

import economyData from '../../data/economy.json'
import { GameState, PlayerState } from './state.ts'

const PRICES = economyData.prices

export function createStarterPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    taler: 15000,
    land: { farmland: 10000, buildingLand: 0 },
    // A little over one year's food for 1,000 peasants — enough to survive a
    // single bad harvest, not enough to ignore the weather.
    grainStock: 11000,
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
  }
}

export function createStarterState(playerIds: Array<{ id: string; name: string }>): GameState {
  const players: Record<string, PlayerState> = {}
  for (const { id, name } of playerIds) {
    players[id] = createStarterPlayer(id, name)
  }
  return {
    year: 0,
    players,
    activePlayerIds: playerIds.map((p) => p.id),
    // Read from data, never hardcoded. These were literals until Phase 8, which
    // meant retuning the corn price in economy.json changed nothing — the game
    // kept selling grain at the old 40/unit and a single bountiful harvest paid
    // 440,000 Taler, wrecking the economy while the data file looked correct.
    kaizerTradePrices: {
      corn: PRICES.cornBasePrice,
      farmland: PRICES.farmlandBasePrice,
      buildingLand: PRICES.buildingLandBasePrice
    }
  }
}
