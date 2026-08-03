import { describe, it, expect } from 'vitest'
import { applyConstruction, calculateBuildingIncome, calculateUpkeep } from '../src/engine/buildings.ts'
import { BuildingState, ConstructionDecision, LandHolding, PopulationState } from '../src/engine/state.ts'

const emptyBuildings: BuildingState = {
  markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0
}

const noOpDecision: ConstructionDecision = {
  type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
  wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
}

describe('applyConstruction', () => {
  it('builds markets up to the land ratio cap and no further', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 1500 } // 1 market per 1000 ha -> cap of 1
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, marketBuild: 5 }
    const result = applyConstruction(land, population, emptyBuildings, 100000, 0, 0, decision)
    expect(result.newBuildings.markets).toBe(1)
  })

  it('cannot build beyond what the treasury can afford', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 10000 } // ratio cap not binding
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, marketBuild: 100 }
    const result = applyConstruction(land, population, emptyBuildings, 3000, 0, 0, decision) // buildCost 2000/market
    expect(result.newBuildings.markets).toBe(1)
    expect(result.newTaler).toBeGreaterThanOrEqual(0)
  })

  it('cannot build a hospital without the minimum population', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 10000 }
    const population: PopulationState = { peasants: 500, unrest: 0 } // below requiresMinPopulation
    const decision: ConstructionDecision = { ...noOpDecision, hospitalBuild: 1 }
    const result = applyConstruction(land, population, emptyBuildings, 100000, 0, 0, decision)
    expect(result.newBuildings.hospital).toBe(0)
  })

  it('cannot start the palace without enough land, but can once the threshold is met', () => {
    const population: PopulationState = { peasants: 5000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, palaceStages: 2 }

    const smallLand: LandHolding = { farmland: 5000, buildingLand: 0 } // below 13,000 requirement
    const smallResult = applyConstruction(smallLand, population, emptyBuildings, 100000, 0, 0, decision)
    expect(smallResult.newBuildings.palace).toBe(0)

    const bigLand: LandHolding = { farmland: 13000, buildingLand: 0 }
    const bigResult = applyConstruction(bigLand, population, emptyBuildings, 100000, 0, 0, decision)
    expect(bigResult.newBuildings.palace).toBe(2)
  })

  it('cathedral requires both land and population thresholds simultaneously', () => {
    const decision: ConstructionDecision = { ...noOpDecision, cathedralBuild: true }

    const landOnly = applyConstruction(
      { farmland: 5000, buildingLand: 0 }, { peasants: 100, unrest: 0 }, emptyBuildings, 100000, 0, 0, decision
    )
    expect(landOnly.newBuildings.cathedral).toBe(0)

    const both = applyConstruction(
      { farmland: 5000, buildingLand: 0 }, { peasants: 5000, unrest: 0 }, emptyBuildings, 100000, 0, 0, decision
    )
    expect(both.newBuildings.cathedral).toBe(1)
  })

  it('cannot build a trading house below Count rank (3)', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 10000 }
    const population: PopulationState = { peasants: 5000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, tradingHouseBuild: 1 }
    const result = applyConstruction(land, population, emptyBuildings, 100000, 2, 0, decision)
    expect(result.newTradingHouses).toBe(0)
  })

  it('can build a trading house at Count rank and beyond, capped at maxCount', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 10000 }
    const population: PopulationState = { peasants: 5000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, tradingHouseBuild: 10 }
    const result = applyConstruction(land, population, emptyBuildings, 1000000, 3, 0, decision)
    expect(result.newTradingHouses).toBe(3) // data/buildings.json commerce.tradingHouse.maxCount
  })

  it('trading house count persists and only grows by the amount affordable/capped this year', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 10000 }
    const population: PopulationState = { peasants: 5000, unrest: 0 }
    const decision: ConstructionDecision = { ...noOpDecision, tradingHouseBuild: 1 }
    const result = applyConstruction(land, population, emptyBuildings, 100000, 4, 2, decision)
    expect(result.newTradingHouses).toBe(3)
  })
})

describe('calculateBuildingIncome', () => {
  it('scales linearly with building count', () => {
    const oneMarket = calculateBuildingIncome({ ...emptyBuildings, markets: 1 }, 0)
    const twoMarkets = calculateBuildingIncome({ ...emptyBuildings, markets: 2 }, 0)
    expect(twoMarkets.marketIncome).toBe(oneMarket.marketIncome * 2)
  })

  it('trading houses generate income proportional to count', () => {
    const oneHouse = calculateBuildingIncome(emptyBuildings, 1)
    const twoHouses = calculateBuildingIncome(emptyBuildings, 2)
    expect(oneHouse.tradingHouseIncome).toBeGreaterThan(0)
    expect(twoHouses.tradingHouseIncome).toBe(oneHouse.tradingHouseIncome * 2)
  })
})

describe('calculateUpkeep', () => {
  it('scales with holdings — more buildings means more upkeep (anti-snowball lever)', () => {
    const fewBuildings: BuildingState = { ...emptyBuildings, markets: 1, mills: 1 }
    const manyBuildings: BuildingState = { ...emptyBuildings, markets: 10, mills: 10 }
    const smallUpkeep = calculateUpkeep(fewBuildings, 0, 50000)
    const bigUpkeep = calculateUpkeep(manyBuildings, 0, 50000)
    expect(bigUpkeep).toBeGreaterThan(smallUpkeep)
  })

  it('trading house tribute scales with wealth, not a flat fee', () => {
    const poorUpkeep = calculateUpkeep(emptyBuildings, 1, 10000)
    const richUpkeep = calculateUpkeep(emptyBuildings, 1, 100000)
    expect(richUpkeep).toBeGreaterThan(poorUpkeep)
  })
})
