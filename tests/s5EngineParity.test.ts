import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import {
  requirementGroupStatus,
  meetsRequirementGroup,
  getNextRank,
  checkPromotion
} from '../src/engine/ranks.ts'
import { yearsOfFoodHeld, annualGrainRequirement } from '../src/engine/economy.ts'
import { remainingLandBuyBudget, affordableHectares, applyLandTrade } from '../src/engine/land.ts'
import { meetsPalaceLandGate, meetsCathedralGates, applyConstruction } from '../src/engine/buildings.ts'
import { getEventCatalog } from '../src/engine/events/events.ts'
import { yearsOfFoodLabel } from '../src/ui/decisions.ts'

describe('S5 engine/UI parity helpers', () => {
  it('requirementGroupStatus.met matches meetsRequirementGroup and checkPromotion path', () => {
    const state = createStarterState([{ id: 'human', name: 'Human' }])
    const human = state.players.human
    const next = getNextRank(human.rank)
    expect(next).toBeDefined()
    for (const req of next!.requirements) {
      const status = requirementGroupStatus(human, req)
      expect(status.met).toBe(meetsRequirementGroup(human, req))
    }
    // Starter does not leapfrog — status.met false for every next-rank path.
    expect(next!.requirements.some((r) => meetsRequirementGroup(human, r))).toBe(false)
    expect(checkPromotion(human).promoted).toBe(false)
  })

  it('yearsOfFoodLabel uses yearsOfFoodHeld', () => {
    const state = createStarterState([{ id: 'human', name: 'Human' }])
    const p = state.players.human
    const years = yearsOfFoodHeld(p.grainStock, p.population)
    expect(yearsOfFoodLabel(p)).toBe(years.toFixed(1))
    expect(years).toBeCloseTo(p.grainStock / annualGrainRequirement(p.population), 5)
  })

  it('remainingLandBuyBudget matches applyLandTrade combined clamp', () => {
    const taler = 10_000
    const prices = { farmland: 10, buildingLand: 20 }
    // Max each alone
    expect(affordableHectares(taler, prices.farmland)).toBe(1000)
    expect(affordableHectares(taler, prices.buildingLand)).toBe(500)
    // After committing 400 ha farmland (4000 Taler), building max is 300
    const afterFarm = remainingLandBuyBudget(taler, 400, prices.farmland)
    expect(afterFarm).toBe(6000)
    expect(affordableHectares(afterFarm, prices.buildingLand)).toBe(300)

    const result = applyLandTrade(
      { farmland: 0, buildingLand: 0 },
      taler,
      { type: 'land_trade', farmlanbuy: 400, buildingLandBuy: 500, partnerPlayerId: 'kaiser' },
      prices
    )
    // Combined unaffordable — scaled; not both maxima
    expect(result.farmlandDelta + result.buildingLandDelta).toBeLessThan(400 + 500)
    expect(result.newTaler).toBeGreaterThanOrEqual(0)
  })

  it('palace/cathedral gate helpers match applyConstruction silence', () => {
    const state = createStarterState([{ id: 'human', name: 'Human' }])
    const p = state.players.human
    const landHeld = p.land.farmland + p.land.buildingLand
    const beforePalace = p.buildings.palace
    const built = applyConstruction(
      p.land,
      p.population,
      p.buildings,
      p.taler,
      p.rank,
      p.tradingHouses,
      {
        type: 'construction',
        marketBuild: 0,
        millBuild: 0,
        wellBuild: 0,
        hospitalBuild: 0,
        granaryBuild: 0,
        garrisonBuild: 0,
        dikeBuild: 0,
        palaceStages: 1,
        cathedralBuild: true,
        tradingHouseBuild: 0
      }
    )
    if (!meetsPalaceLandGate(landHeld)) {
      expect(built.newBuildings.palace).toBe(beforePalace)
    }
    if (!meetsCathedralGates(landHeld, p.population.peasants)) {
      expect(built.newBuildings.cathedral).toBe(p.buildings.cathedral)
    }
  })

  it('getEventCatalog exposes mitigation buildings used by UI tooltips', () => {
    const buildings = new Set(getEventCatalog().map((e) => e.mitigation.building))
    for (const id of ['well', 'hospital', 'granary', 'garrison', 'dike']) {
      expect(buildings.has(id)).toBe(true)
    }
  })
})
