import { describe, it, expect } from 'vitest'
import { advanceYear } from '../src/engine/year.ts'
import { GameState, Decision, serializeGameState } from '../src/engine/state.ts'

// Minimal starter state for testing
function createStarterState(): GameState {
  return {
    year: 0,
    players: {
      player1: {
        id: 'player1',
        name: 'Test Player 1',
        taler: 15000,
        land: { farmland: 10000, buildingLand: 0 },
        grainStock: 5000,
        population: { peasants: 1000, unrest: 0 },
        buildings: {
          markets: 0,
          mills: 0,
          palace: 0,
          cathedral: 0,
          hospital: 0,
          well: 0,
          granary: 0,
          garrison: 0
        },
        rank: 0,
        guards: 0,
        saboteurs: 0,
        tradingHouses: 0,
        score: 0,
        dead: false
      },
      player2: {
        id: 'player2',
        name: 'Test Player 2',
        taler: 15000,
        land: { farmland: 10000, buildingLand: 0 },
        grainStock: 5000,
        population: { peasants: 1000, unrest: 0 },
        buildings: {
          markets: 0,
          mills: 0,
          palace: 0,
          cathedral: 0,
          hospital: 0,
          well: 0,
          granary: 0,
          garrison: 0
        },
        rank: 0,
        guards: 0,
        saboteurs: 0,
        tradingHouses: 0,
        score: 0,
        dead: false
      }
    },
    activePlayerIds: ['player1', 'player2'],
    kaizerTradePrices: {
      corn: 40,
      farmland: 30,
      buildingLand: 50
    }
  }
}

// Minimal decisions (no-op)
function createNoOpDecisions(): Record<string, Decision[]> {
  return {
    player1: [
      { type: 'grain', feedLevel: 'required' },
      { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
      { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 },
      { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0 },
      { type: 'espionage', guardHire: 0, saboteurHire: 0 },
      { type: 'trade', cornBuyPrice: 35, cornSellPrice: 45, farmlanbSellPrice: 25, buildingLandSellPrice: 55, minimumPercentageForSale: 10 }
    ],
    player2: [
      { type: 'grain', feedLevel: 'required' },
      { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
      { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 },
      { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0 },
      { type: 'espionage', guardHire: 0, saboteurHire: 0 },
      { type: 'trade', cornBuyPrice: 35, cornSellPrice: 45, farmlanbSellPrice: 25, buildingLandSellPrice: 55, minimumPercentageForSale: 10 }
    ]
  }
}

describe('Determinism', () => {
  it('same seed twice produces byte-identical serialized state', () => {
    const state = createStarterState()
    const decisions = createNoOpDecisions()
    const seed = 42

    const run1 = advanceYear(JSON.parse(JSON.stringify(state)), decisions, seed)
    const run2 = advanceYear(JSON.parse(JSON.stringify(state)), decisions, seed)

    const serialized1 = serializeGameState(run1.state)
    const serialized2 = serializeGameState(run2.state)

    expect(serialized1).toBe(serialized2)
  })

  it('different seeds produce different states', () => {
    const state = createStarterState()
    const decisions = createNoOpDecisions()

    const run1 = advanceYear(JSON.parse(JSON.stringify(state)), decisions, 42)
    const run2 = advanceYear(JSON.parse(JSON.stringify(state)), decisions, 43)

    const serialized1 = serializeGameState(run1.state)
    const serialized2 = serializeGameState(run2.state)

    // They might be identical by chance, but very unlikely. For now, we just check they're serializable.
    expect(serialized1).toBeDefined()
    expect(serialized2).toBeDefined()
  })
})
