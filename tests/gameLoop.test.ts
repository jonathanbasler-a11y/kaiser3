import { describe, it, expect } from 'vitest'
import { runGame, scriptedOpponentDecisions } from '../src/engine/gameLoop.ts'
import { GameState, Decision } from '../src/engine/state.ts'

// A "sensible" human strategy: feed adequately, tax moderately, never trades or builds.
// Used to verify a full game completes without crashing (Phase 3's core gate).
function sensibleHumanDecisions(): Decision[] {
  return [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
    { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 }
  ]
}

// A reckless human strategy: sell off the entire productive land base immediately
// (so no future harvest is possible), then feed at the minimum from a stock that
// can only ever shrink. This is a deliberately catastrophic choice — proving the
// population-collapse loss condition actually fires, not a claim that ordinary
// under-feeding alone collapses a population (grain stock can outgrow modest
// under-feeding once harvests are large — that's a Phase 6 balance question, not
// a Phase 3 loop-wiring question).
function recklessHumanDecisions(state: GameState): Decision[] {
  const player = state.players['human']
  return [
    { type: 'grain', feedLevel: 'min' },
    { type: 'land_trade', farmlanbuy: -player.land.farmland, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 0, incomeTax: 0, tariff: 0, justiceGraft: 0 },
    { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 }
  ]
}

// A construction-focused human strategy: reinvests tax and building income into
// markets and mills every year rather than leaving cash idle. Used to prove that
// decisions have real, divergent consequences through the full playable loop —
// not to hit a specific rank (organic land-buying toward the palace's 13,000 ha
// threshold from the 10,000 ha start is intentionally slow, matching the
// original's pacing; Phase 2's dedicated rank test already covers the promotion
// mechanic itself with a bespoke land-rich starting fixture).
function investorHumanDecisions(state: GameState): Decision[] {
  const player = state.players['human']
  return [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: Math.min(500, Math.floor(player.taler * 0.2 / state.kaizerTradePrices.buildingLand)), partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 20, incomeTax: 20, tariff: 5, justiceGraft: 0 },
    { type: 'construction', marketBuild: 2, millBuild: 2, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 }
  ]
}

describe('runGame', () => {
  it('completes a full game against scripted opponents without crashing (sensible play)', async () => {
    const result = await runGame({
      humanId: 'human',
      humanName: 'Test Human',
      opponentCount: 2,
      maxYears: 30,
      getHumanDecisions: () => sensibleHumanDecisions()
    })

    expect(['victory', 'population_collapse', 'timeout']).toContain(result.outcome)
    expect(result.yearsPlayed).toBeGreaterThan(0)
    expect(Number.isNaN(result.finalState.players['human'].taler)).toBe(false)
  })

  it('selling off all farmland then under-feeding eventually collapses the human population', async () => {
    // Mortality/emigration are percentage-based (asymptotic decay), so this takes
    // a while even with zero future harvest — traced empirically at ~75 years.
    const result = await runGame({
      humanId: 'human',
      humanName: 'Reckless Human',
      opponentCount: 1,
      maxYears: 100,
      getHumanDecisions: (state) => recklessHumanDecisions(state)
    })

    expect(result.outcome).toBe('population_collapse')
    expect(result.finalState.players['human'].population.peasants).toBeLessThan(1)
  })

  it('reinvesting in construction produces a meaningfully different outcome than passive play', async () => {
    const YEARS = 20

    const passiveResult = await runGame({
      humanId: 'human',
      humanName: 'Passive Human',
      opponentCount: 1,
      maxYears: YEARS,
      getHumanDecisions: () => sensibleHumanDecisions(),
      seedBase: 7
    })

    const investorResult = await runGame({
      humanId: 'human',
      humanName: 'Investor Human',
      opponentCount: 1,
      maxYears: YEARS,
      getHumanDecisions: (state) => investorHumanDecisions(state),
      seedBase: 7
    })

    const passivePlayer = passiveResult.finalState.players['human']
    const investorPlayer = investorResult.finalState.players['human']

    // The investor should end up with meaningfully more productive capacity —
    // proving decisions actually propagate through the full playable loop.
    expect(investorPlayer.buildings.markets + investorPlayer.buildings.mills).toBeGreaterThan(0)
    expect(investorPlayer.buildings.markets + investorPlayer.buildings.mills)
      .toBeGreaterThan(passivePlayer.buildings.markets + passivePlayer.buildings.mills)
  })

  it('calls onYearComplete once per year played, with a matching chronicle', async () => {
    let callCount = 0
    const result = await runGame({
      humanId: 'human',
      humanName: 'Test Human',
      opponentCount: 1,
      maxYears: 5,
      getHumanDecisions: () => sensibleHumanDecisions(),
      onYearComplete: (state, chronicle) => {
        callCount++
        expect(chronicle.year).toBe(state.year)
        expect(chronicle.playerReports['human']).toBeDefined()
      }
    })

    expect(callCount).toBe(result.yearsPlayed)
  })

  it('supports an async human decision provider (for real interactive input)', async () => {
    const result = await runGame({
      humanId: 'human',
      humanName: 'Async Human',
      opponentCount: 1,
      maxYears: 3,
      getHumanDecisions: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        return sensibleHumanDecisions()
      }
    })

    expect(result.yearsPlayed).toBe(3)
    expect(result.outcome).toBe('timeout')
  })
})

describe('scriptedOpponentDecisions', () => {
  it('always includes a grain decision so opponents never go unfed', () => {
    const state = { kaizerTradePrices: { corn: 40, farmland: 30, buildingLand: 50 } }
    const player = {
      id: 'x', name: 'X', taler: 10000, land: { farmland: 5000, buildingLand: 0 }, grainStock: 1000,
      population: { peasants: 500, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
      rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false
    }
    const decisions = scriptedOpponentDecisions(player, state.kaizerTradePrices)
    expect(decisions.some((d) => d.type === 'grain')).toBe(true)
  })

  it('does not request land purchases beyond what is affordable', () => {
    const prices = { corn: 40, farmland: 30, buildingLand: 50 }
    const poorPlayer = {
      id: 'x', name: 'X', taler: 50, land: { farmland: 100, buildingLand: 0 }, grainStock: 100,
      population: { peasants: 100, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
      rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false
    }
    const decisions = scriptedOpponentDecisions(poorPlayer, prices)
    const landDecision = decisions.find((d) => d.type === 'land_trade') as { farmlanbuy: number }
    expect(landDecision.farmlanbuy * prices.farmland).toBeLessThanOrEqual(poorPlayer.taler)
  })
})
