import { describe, it, expect } from 'vitest'
import { applyLandTrade } from '../src/engine/land.ts'
import { LandHolding, LandTradeDecision } from '../src/engine/state.ts'

const prices = { farmland: 30, buildingLand: 50 }

describe('applyLandTrade', () => {
  it('buys farmland at the going price when affordable', () => {
    const land: LandHolding = { farmland: 1000, buildingLand: 0 }
    const decision: LandTradeDecision = { type: 'land_trade', farmlanbuy: 100, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    const result = applyLandTrade(land, 10000, decision, prices)
    expect(result.newLand.farmland).toBe(1100)
    expect(result.newTaler).toBe(10000 - 100 * 30)
  })

  it('sells farmland and credits the treasury', () => {
    const land: LandHolding = { farmland: 1000, buildingLand: 0 }
    const decision: LandTradeDecision = { type: 'land_trade', farmlanbuy: -200, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    const result = applyLandTrade(land, 1000, decision, prices)
    expect(result.newLand.farmland).toBe(800)
    expect(result.newTaler).toBe(1000 + 200 * 30)
  })

  it('cannot sell more land than is owned', () => {
    const land: LandHolding = { farmland: 100, buildingLand: 0 }
    const decision: LandTradeDecision = { type: 'land_trade', farmlanbuy: -500, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    const result = applyLandTrade(land, 1000, decision, prices)
    expect(result.newLand.farmland).toBe(0)
    expect(result.farmlandDelta).toBe(-100)
  })

  it('cannot buy more land than the treasury can afford, and never goes into debt', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 0 }
    const decision: LandTradeDecision = { type: 'land_trade', farmlanbuy: 10000, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    const result = applyLandTrade(land, 1000, decision, prices) // can afford at most 33 ha at 30/ha
    expect(result.newTaler).toBeGreaterThan(-1e-6) // floating-point scaling may leave a negligible epsilon
    expect(result.newLand.farmland * prices.farmland).toBeLessThanOrEqual(1000 + 0.001)
  })

  it('handles simultaneous buy-farmland/sell-building-land orders using sell proceeds to fund the buy', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 100 }
    const decision: LandTradeDecision = { type: 'land_trade', farmlanbuy: 40, buildingLandBuy: -50, partnerPlayerId: 'kaiser' }
    // Sell 50 building land @ 50 = +2500; buy 40 farmland @ 30 = -1200. Net should be affordable from 0 taler.
    const result = applyLandTrade(land, 0, decision, prices)
    expect(result.newTaler).toBeGreaterThanOrEqual(0)
    expect(result.newLand.farmland).toBeCloseTo(40, 5)
    expect(result.newLand.buildingLand).toBe(50)
  })
})
