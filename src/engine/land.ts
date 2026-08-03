// Land market: buying/selling farmland and building-land against the NPC Kaiser.
// Player-to-player trading (with per-ruler pricing) is a Phase 7 extension (TradeDecision).

import { LandHolding, LandTradeDecision } from './state.ts'
import { finiteOr } from './sanitize.ts'

export interface LandTradeResult {
  newLand: LandHolding
  newTaler: number
  farmlandDelta: number     // Actual hectares bought(+)/sold(-) — may be clamped from the requested amount
  buildingLandDelta: number
  talerDelta: number        // Negative = spent, positive = earned
}

export function totalLand(land: { farmland: number; buildingLand: number }): number {
  return land.farmland + land.buildingLand
}

export function applyLandTrade(
  land: LandHolding,
  taler: number,
  decision: LandTradeDecision,
  kaizerPrices: { farmland: number; buildingLand: number }
): LandTradeResult {
  // Sanitized at the boundary (sanitize.ts): a NaN order must degrade to "do
  // nothing" (0), not silently poison land.farmland/buildingLand — both are
  // running totals mutated year over year, so one bad write never recovers.
  let farmlandDelta = finiteOr(decision.farmlanbuy, 0)
  if (farmlandDelta < 0) {
    farmlandDelta = -Math.min(-farmlandDelta, land.farmland)
  }
  let buildingLandDelta = finiteOr(decision.buildingLandBuy, 0)
  if (buildingLandDelta < 0) {
    buildingLandDelta = -Math.min(-buildingLandDelta, land.buildingLand)
  }

  let farmlandCost = farmlandDelta * kaizerPrices.farmland
  let buildingLandCost = buildingLandDelta * kaizerPrices.buildingLand
  let totalCost = farmlandCost + buildingLandCost

  // Clamp buys to what the player can afford — sells (negative cost) always proceed,
  // but we cannot let a combined buy+sell order run the treasury negative.
  if (totalCost > taler) {
    // Scale down only the buy portions (positive deltas) proportionally until affordable.
    const buyCost = Math.max(0, farmlandCost) + Math.max(0, buildingLandCost)
    const sellCredit = Math.max(0, -farmlandCost) + Math.max(0, -buildingLandCost)
    const affordableBuyBudget = Math.max(0, taler + sellCredit)
    const scale = buyCost > 0 ? Math.min(1, affordableBuyBudget / buyCost) : 1

    if (farmlandDelta > 0) farmlandDelta *= scale
    if (buildingLandDelta > 0) buildingLandDelta *= scale

    farmlandCost = farmlandDelta * kaizerPrices.farmland
    buildingLandCost = buildingLandDelta * kaizerPrices.buildingLand
    totalCost = farmlandCost + buildingLandCost
  }

  return {
    newLand: {
      farmland: land.farmland + farmlandDelta,
      buildingLand: land.buildingLand + buildingLandDelta
    },
    newTaler: taler - totalCost,
    farmlandDelta,
    buildingLandDelta,
    talerDelta: -totalCost
  }
}
