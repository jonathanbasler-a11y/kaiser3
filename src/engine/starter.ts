// Starter game state construction — shared by tests, the headless sim, and the
// playable CLI so all three start from the same known-good setup (per the
// original: 15,000 Taler, 10,000 hectares of land, per docs/kaiser-research.md).

import { GameState, PlayerState } from './state.ts'

export function createStarterPlayer(id: string, name: string): PlayerState {
  return {
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
    kaizerTradePrices: { corn: 40, farmland: 30, buildingLand: 50 }
  }
}
