import { describe, it, expect } from 'vitest'
import { calculateHarvest, resolveFeeding, laborGatedFarmland } from '../src/engine/economy.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { LandHolding, PopulationState, GrainDecision } from '../src/engine/state.ts'

describe('laborGatedFarmland', () => {
  it('caps productive farmland at labor capacity when land exceeds available peasants', () => {
    const land: LandHolding = { farmland: 100000, buildingLand: 0 }
    const population: PopulationState = { peasants: 100, unrest: 0 } // labor cap = 100 * 5 = 500 ha
    const productive = laborGatedFarmland(land, population)
    expect(productive).toBe(500)
  })

  it('uses full farmland when labor capacity exceeds it', () => {
    const land: LandHolding = { farmland: 400, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 } // labor cap = 5000
    const productive = laborGatedFarmland(land, population)
    expect(productive).toBe(400)
  })
})

describe('calculateHarvest', () => {
  it('produces zero yield from farmland with no labor', () => {
    const land: LandHolding = { farmland: 1000, buildingLand: 0 }
    const population: PopulationState = { peasants: 0, unrest: 0 }
    const rng = new SeededRng(1)
    const result = calculateHarvest(land, population, 0, rng)
    expect(result.grossYield).toBe(0)
  })

  it('applies spoilage to carried-over stock before adding new yield', () => {
    const land: LandHolding = { farmland: 0, buildingLand: 0 } // no new yield
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const rng = new SeededRng(1)
    const previousStock = 1000
    const result = calculateHarvest(land, population, previousStock, rng)
    expect(result.spoiledFromStock).toBeCloseTo(50, 5) // 5% of 1000
    expect(result.newGrainStock).toBeCloseTo(950, 5)
  })

  it('never produces negative yield even with adverse weather rolls', () => {
    const land: LandHolding = { farmland: 500, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    for (let seed = 0; seed < 50; seed++) {
      const rng = new SeededRng(seed)
      const result = calculateHarvest(land, population, 0, rng)
      expect(result.grossYield).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('resolveFeeding', () => {
  const population: PopulationState = { peasants: 1000, unrest: 0 } // requires 500 grain

  it('required feed level delivers exactly the population requirement when stock allows', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'required' }
    const result = resolveFeeding(decision, population, 10000)
    expect(result.grainConsumed).toBeCloseTo(500, 5)
    expect(result.feedAdequacy).toBeCloseTo(1, 5)
    expect(result.isUnderfed).toBe(false)
    expect(result.isOverfed).toBe(false)
  })

  it('feeding at min (20% of a modest stock) underfeeds the population', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'min' }
    const result = resolveFeeding(decision, population, 700) // 20% of 700 = 140, far below the 500 requirement
    expect(result.isUnderfed).toBe(true)
    expect(result.isOverfed).toBe(false)
  })

  it('feeding at max (80% of a large stock) overfeeds the population', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'max' }
    const result = resolveFeeding(decision, population, 1000) // 80% of 1000 = 800, 1.6x the requirement
    expect(result.isOverfed).toBe(true)
  })

  it('cannot consume more grain than is in stock', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'max' }
    const result = resolveFeeding(decision, population, 100)
    expect(result.grainConsumed).toBeLessThanOrEqual(100)
    expect(result.grainStockAfter).toBeGreaterThanOrEqual(0)
  })

  it('degrades an unrecognised feed level to "required" instead of poisoning the simulation with NaN', () => {
    // Regression guard. The switch had no default branch, so a malformed feedLevel
    // left grainOffered undefined and NaN spread through feeding, population,
    // events and the treasury — surfacing in the CLI as "NaN peasants lost" and a
    // realm that collapsed in two years.
    const malformed = { type: 'grain', feedLevel: 'nonsense' } as unknown as GrainDecision
    const result = resolveFeeding(malformed, population, 5000)
    expect(Number.isNaN(result.grainConsumed)).toBe(false)
    expect(Number.isNaN(result.feedAdequacy)).toBe(false)
    expect(result.grainConsumed).toBeCloseTo(500, 5) // same as 'required'
  })

  it('starving population (zero stock) is severely underfed', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'required' }
    const result = resolveFeeding(decision, population, 0)
    expect(result.feedAdequacy).toBe(0)
    expect(result.isUnderfed).toBe(true)
  })
})
