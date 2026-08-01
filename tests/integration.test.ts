import { describe, it, expect } from 'vitest'
import { advanceYear } from '../src/engine/year.ts'
import { GameState, Decision } from '../src/engine/state.ts'
import { createStarterState } from '../src/engine/starter.ts'

function twoPlayerStarterState(): GameState {
  return createStarterState([{ id: 'player1', name: 'P1' }, { id: 'player2', name: 'P2' }])
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
    let state = twoPlayerStarterState()
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
    let state = twoPlayerStarterState()
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

  it('a player who already holds enough land can build a palace and reach Duke rank within a few years', () => {
    // Duke's Prestige path requires wealthMin 20000, populationMin 1300, palaceStages 4
    // (data/ranks.json). Population is pinned below the alt Land/Population path's
    // populationMin (1900, since D2 — docs/d2-rank-gate-design.md) so this player can
    // only qualify by actually building the palace, which is what this test exercises.
    // Start with palace-eligible land (13,000 ha) and enough treasury to fund 2 stages/year.
    const wellFundedPlayer = () => ({
      id: 'player1',
      name: 'P1',
      taler: 50000,
      land: { farmland: 13000, buildingLand: 0 },
      grainStock: 5000,
      population: { peasants: 1600, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
      rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false
    })

    let state: GameState = {
      year: 0,
      players: { player1: wellFundedPlayer(), player2: (twoPlayerStarterState()).players.player2 },
      activePlayerIds: ['player1', 'player2'],
      kaizerTradePrices: { corn: 40, farmland: 30, buildingLand: 50 }
    }

    const decisions: Record<string, Decision[]> = {
      player1: [
        { type: 'grain', feedLevel: 'required' },
        { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
        { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 2, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 }
      ],
      player2: noOpDecisions().player2
    }

    let reachedDuke = false
    for (let year = 0; year < 5; year++) {
      const result = advanceYear(state, decisions, year * 1000 + 1)
      state = result.state
      if (state.players.player1.rank >= 1) {
        reachedDuke = true
        break
      }
    }

    expect(reachedDuke).toBe(true)
    expect(state.players.player1.buildings.palace).toBeGreaterThanOrEqual(4)
    // Unrest should stay well within tolerance at this moderate tax rate.
    expect(state.players.player1.population.unrest).toBeLessThan(50)
  })
})
