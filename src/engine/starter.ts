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
    reignYears: 0,
    dead: false
  }
}

// Difficulty presets (Phase 13, src/ai/difficulty.ts) apply a head-start or
// handicap to RIVALS only, never the human — the research doc's baseline
// (15,000 Taler, 10,000 ha) is the fixed human starting point every preset is
// measured relative to. Deliberately a separate step from createStarterPlayer
// rather than a parameter on it: every other caller (tests, ai-bench, the
// balance harness, the golden fixture) must keep constructing the exact same
// starter player with zero new arguments, or their committed baselines drift
// for reasons that have nothing to do with what they're testing.
export function applyStartingMultiplier(player: PlayerState, multiplier: { taler: number; farmland: number }): PlayerState {
  return {
    ...player,
    taler: player.taler * multiplier.taler,
    land: { ...player.land, farmland: player.land.farmland * multiplier.farmland }
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
