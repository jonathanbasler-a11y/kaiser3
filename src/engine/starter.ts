// Starter game state construction — shared by tests, the headless sim, and the
// playable CLI so all three start from the same known-good setup (per the
// original: 15,000 Taler, 10,000 hectares of land, per docs/kaiser-research.md).

import economyData from '../../data/economy.json'
import { GameState, PlayerState } from './state.ts'

const PRICES = economyData.prices
const STARTER = economyData.starter

export function createStarterPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    taler: STARTER.taler,
    land: { farmland: STARTER.farmland, buildingLand: STARTER.buildingLand },
    // A little over one year's food for the starter peasant count — enough to
    // survive a single bad harvest, not enough to ignore the weather.
    grainStock: STARTER.grainStock,
    population: { peasants: STARTER.peasants, unrest: STARTER.unrest },
    buildings: {
      markets: 0, mills: 0, palace: 0, cathedral: 0,
      hospital: 0, well: 0, granary: 0, garrison: 0
    },
    rank: STARTER.rank,
    guards: STARTER.guards,
    saboteurs: STARTER.saboteurs,
    tradingHouses: STARTER.tradingHouses,
    score: STARTER.score,
    reignYears: STARTER.reignYears,
    dead: false
  }
}

// Difficulty presets (Phase 13, src/ai/difficulty.ts) apply a head-start or
// handicap to RIVALS only, never the human — the research doc's baseline
// (economy.json starter) is the fixed human starting point every preset is
// measured relative to. Deliberately a separate step from createStarterPlayer
// rather than a parameter on it: every other caller (tests, ai-bench, the
// balance harness, the golden fixture) must keep constructing the exact same
// starter player with zero new arguments, or their committed baselines drift
// for reasons that have nothing to do with what they're testing.
//
// Population is part of the multiplier (D6): taler/farmland cuts alone that
// stay above laborGatedFarmland's capacity do not reduce early productive
// output and can scramble Builder plans into path-dependent outcomes that
// sometimes FAVOR the "handicapped" side. Scaling peasants (and grainStock
// with them, so the ~1-year food buffer stays proportional) is what actually
// moves harvest capacity on day one.
export function applyStartingMultiplier(
  player: PlayerState,
  multiplier: { taler: number; farmland: number; population: number }
): PlayerState {
  return {
    ...player,
    taler: player.taler * multiplier.taler,
    land: { ...player.land, farmland: player.land.farmland * multiplier.farmland },
    population: {
      ...player.population,
      peasants: player.population.peasants * multiplier.population
    },
    grainStock: player.grainStock * multiplier.population,
    buildings: { ...player.buildings }
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
