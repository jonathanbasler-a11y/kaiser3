import { describe, it, expect } from 'vitest'
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

function noOpDecisions(): Record<string, Decision[]> {
  const forOnePlayer: Decision[] = [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
  ]
  return { player1: forOnePlayer, player2: forOnePlayer }
}

describe('20-year integration run', () => {
  it('stays in sane numeric ranges over 20 years with required feeding (no NaN, no negative population/taler)', () => {
    let state = createStarterState()
    const decisions = noOpDecisions()

    for (let year = 0; year < 20; year++) {
      const result = advanceYear(state, decisions, year * 1000 + 1)
      state = result.state

      for (const playerId of state.activePlayerIds) {
        const player = state.players[playerId]
        expect(Number.isNaN(player.taler)).toBe(false)
        expect(Number.isNaN(player.population.peasants)).toBe(false)
        expect(Number.isNaN(player.grainStock)).toBe(false)
        expect(player.population.peasants).toBeGreaterThanOrEqual(0)
        expect(player.grainStock).toBeGreaterThanOrEqual(0)
        expect(player.population.unrest).toBeGreaterThanOrEqual(0)
        expect(player.population.unrest).toBeLessThanOrEqual(100)
      }
    }

    expect(state.year).toBe(20)
  })

  it('sustained min-feeding over 20 years drives population down or unrest up (scarcity is real)', () => {
    let state = createStarterState()
    const starveDecisions: Record<string, Decision[]> = {
      player1: [{ type: 'grain', feedLevel: 'min' }, { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }],
      player2: [{ type: 'grain', feedLevel: 'min' }, { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }]
    }

    const startingPeasants = state.players.player1.population.peasants

    for (let year = 0; year < 20; year++) {
      const result = advanceYear(state, starveDecisions, year * 1000 + 1)
      state = result.state
    }

    const finalPlayer = state.players.player1
    const populationDropped = finalPlayer.population.peasants < startingPeasants
    const unrestIsHigh = finalPlayer.population.unrest > 50
    expect(populationDropped || unrestIsHigh).toBe(true)
  })
})
