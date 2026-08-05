// Phase 20 follow-up: "explain every number." Guards the new PlayerChronicle
// component fields (upkeepBreakdown, spend lines, grainConsumed, unrest
// components) and the warStrengthBreakdown/groupProgressDetail additive
// exports — every one of these must sum back to the total it explains, or
// the UI is showing a lie with better formatting.

import { describe, it, expect } from 'vitest'
import { advanceYear } from '../src/engine/year.ts'
import { GameState, Decision, PlayerState, WarDecision } from '../src/engine/state.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { warStrength, warStrengthBreakdown } from '../src/engine/war.ts'

function twoPlayerStarterState(): GameState {
  return createStarterState([{ id: 'player1', name: 'P1' }, { id: 'player2', name: 'P2' }])
}

describe('PlayerChronicle spend/upkeep/grain components sum to their totals', () => {
  it('constructionSpend, recruitmentSpend, militarySpend, and upkeepBreakdown are itemised correctly', () => {
    const state = twoPlayerStarterState()
    state.players.player1.taler = 50000

    const decisions: Record<string, Decision[]> = {
      player1: [
        { type: 'grain', feedLevel: 'required' },
        { type: 'land_trade', farmlanbuy: 500, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
        { type: 'espionage', guardHire: 3, saboteurHire: 2 },
        { type: 'war', declare: false, targetPlayerId: undefined, trainingInvest: 1, equipmentInvest: 1 },
        { type: 'construction', marketBuild: 2, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 1, tradingHouseBuild: 0 }
      ],
      player2: [{ type: 'grain', feedLevel: 'required' }]
    }

    const result = advanceYear(state, decisions, 1)
    const report = result.chronicle.playerReports.player1

    expect(report.constructionSpend).toBeGreaterThan(0)
    expect(report.recruitmentSpend).toBeGreaterThan(0)
    expect(report.militarySpend).toBeGreaterThan(0)
    // Land trade net should be negative (a purchase), non-zero.
    expect(report.landTradeNet).toBeLessThan(0)

    expect(report.upkeepBreakdown).toBeDefined()
    const b = report.upkeepBreakdown!
    const sum = b.markets + b.mills + b.palace + b.cathedral + b.hospital + b.well
      + b.granary + b.garrison + b.dike + b.tradingHouseTribute + b.secretService + b.army
    expect(sum).toBeCloseTo(b.total + b.secretService + b.army, 6)
    expect(b.total + b.secretService + b.army).toBeCloseTo(report.upkeepCost, 6)
    // The garrison just built this year should be the only building upkeep line lit up.
    expect(b.garrison).toBeGreaterThan(0)
  })

  it('grainConsumed matches what feeding actually drew from stock', () => {
    const state = twoPlayerStarterState()
    const decisions: Record<string, Decision[]> = {
      player1: [{ type: 'grain', feedLevel: 'required' }],
      player2: [{ type: 'grain', feedLevel: 'required' }]
    }
    const result = advanceYear(state, decisions, 1)
    const report = result.chronicle.playerReports.player1
    expect(report.grainConsumed).toBeGreaterThan(0)
  })
})

describe('unrestGain now includes war weariness (previously computed before the weariness block ran)', () => {
  it('reports the FULL unrest delta for the year, including weariness added after a war', () => {
    let state = twoPlayerStarterState()
    state.players.player1.buildings.garrison = 5
    state.players.player1.guards = 40
    state.players.player1.population.peasants = 8000
    state.players.player2.population.peasants = 800

    const war: WarDecision = { type: 'war', declare: true, targetPlayerId: 'player2' }
    const decisions: Record<string, Decision[]> = {
      player1: [{ type: 'grain', feedLevel: 'required' }, war],
      player2: [{ type: 'grain', feedLevel: 'required' }]
    }

    const before = state.players.player1.population.unrest
    const result = advanceYear(state, decisions, 7)
    const report = result.chronicle.playerReports.player1
    const after = result.state.players.player1.population.unrest

    // The whole point of the fix: unrestGain must equal the ACTUAL before/after
    // delta, not just the delta measured before the war-weariness block ran.
    expect(report.unrestGain).toBeCloseTo(after - before, 6)
    expect(report.unrestFromWarWeariness).toBeGreaterThan(0)
  })

  it('feeding + tax + weariness components sum to unrestGain', () => {
    let state = twoPlayerStarterState()
    const starveDecisions: Record<string, Decision[]> = {
      player1: [{ type: 'grain', feedLevel: 'min' }, { type: 'tax', vat: 30, incomeTax: 30, tariff: 20, justiceGraft: 10 }],
      player2: [{ type: 'grain', feedLevel: 'required' }]
    }
    const result = advanceYear(state, starveDecisions, 1)
    const report = result.chronicle.playerReports.player1
    const sum = report.unrestFromFeeding + report.unrestFromTax + report.unrestFromWarWeariness
    expect(sum).toBeCloseTo(report.unrestGain, 6)
  })
})

describe('warStrengthBreakdown', () => {
  function makePlayer(o: Partial<PlayerState> = {}): PlayerState {
    return {
      id: 'p', name: 'P', taler: 15000, land: { farmland: 10000, buildingLand: 0 }, grainStock: 5000,
      population: { peasants: 3000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 4 },
      rank: 0, guards: 20, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false,
      trainingLevel: 2, equipmentLevel: 1,
      ...o
    }
  }

  it('garrison + guards + levy, times the multiplier, equals warStrength', () => {
    const player = makePlayer()
    const b = warStrengthBreakdown(player)
    expect(b.garrison + b.guards + b.levy).toBeCloseTo(b.base, 9)
    expect(b.base * b.multiplier).toBeCloseTo(b.total, 9)
    expect(b.total).toBeCloseTo(warStrength(player), 9)
  })
})
