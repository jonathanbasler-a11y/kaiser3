import { describe, it, expect } from 'vitest'
import { calculateHarvest, resolveFeeding, laborGatedFarmland, storageCapacity, applyGrainTrade, annualGrainRequirement } from '../src/engine/economy.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { LandHolding, PopulationState, GrainDecision } from '../src/engine/state.ts'
import economyData from '../data/economy.json'

const SPOILAGE_RATE = economyData.storage.spoilagePercentage
const FEEDING = economyData.feeding

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
    const result = calculateHarvest(land, population, 0, 0, new SeededRng(1))
    expect(result.grossYield).toBe(0)
  })

  it('applies spoilage to carried-over stock before adding new yield', () => {
    // Rate read from the data, not hardcoded — retuning spoilage (as Phase 8 did,
    // twice) must not silently rot this.
    const land: LandHolding = { farmland: 0, buildingLand: 0 } // no new yield
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const carried = 1000
    const result = calculateHarvest(land, population, carried, 0, new SeededRng(1))

    expect(result.spoiledFromStock).toBeCloseTo(carried * SPOILAGE_RATE, 5)
    expect(result.newGrainStock).toBeCloseTo(carried * (1 - SPOILAGE_RATE), 5)
  })

  it('keeps grain for a couple of seasons — meaningfully perishable, not worthless', () => {
    // The product requirement: a reserve is worth carrying through a bad harvest
    // but cannot be hoarded indefinitely.
    const twoYearsRemaining = (1 - SPOILAGE_RATE) ** 2
    expect(twoYearsRemaining).toBeGreaterThan(0.4)  // still worth having after two years
    expect(twoYearsRemaining).toBeLessThan(0.9)     // but visibly decaying
  })

  it('never produces negative yield, whatever the weather', () => {
    const land: LandHolding = { farmland: 500, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    for (let seed = 0; seed < 50; seed++) {
      const result = calculateHarvest(land, population, 0, 0, new SeededRng(seed))
      expect(result.grossYield).toBeGreaterThanOrEqual(0)
    }
  })

  it('draws genuinely good and bad years, not just noise around the mean', () => {
    // The point of weather BANDS: a drought must be a disaster a player remembers,
    // not a 15% dip lost in the noise.
    const land: LandHolding = { farmland: 5000, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const seen = new Set<string>()
    let worst = Infinity
    let best = 0

    for (let seed = 1; seed <= 400; seed++) {
      const result = calculateHarvest(land, population, 0, 0, new SeededRng(seed))
      seen.add(result.weather.id)
      worst = Math.min(worst, result.grossYield)
      best = Math.max(best, result.grossYield)
    }

    expect(seen.has('drought')).toBe(true)
    expect(seen.has('glut')).toBe(true)
    expect(best / worst).toBeGreaterThan(4) // a great year is worth several bad ones
  })

  it('averages out near neutral over many years, so variance is drama and not a hidden tax', () => {
    const land: LandHolding = { farmland: 5000, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const expectedPerYear = 5000 * 2.5 // farmland x baseYieldPerHectare at multiplier 1.0

    let total = 0
    const YEARS = 2000
    for (let seed = 1; seed <= YEARS; seed++) {
      total += calculateHarvest(land, population, 0, 0, new SeededRng(seed)).grossYield
    }

    const meanMultiplier = total / YEARS / expectedPerYear
    expect(meanMultiplier).toBeGreaterThan(0.9)
    expect(meanMultiplier).toBeLessThan(1.15)
  })

  it('caps stores at what the realm can keep — hoarding is impossible', () => {
    const land: LandHolding = { farmland: 5000, buildingLand: 0 }
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    const result = calculateHarvest(land, population, 10_000_000, 0, new SeededRng(1))

    expect(result.newGrainStock).toBeLessThanOrEqual(storageCapacity(population, 0) + 1e-6)
    expect(result.overflowLost).toBeGreaterThan(0)
  })

  it('a granary raises the storage ceiling, so it earns its upkeep beyond famine cover', () => {
    const population: PopulationState = { peasants: 1000, unrest: 0 }
    expect(storageCapacity(population, 1)).toBeGreaterThan(storageCapacity(population, 0))
  })
})

describe('grain market', () => {
  const population: PopulationState = { peasants: 1000, unrest: 0 }
  const capacity = storageCapacity(population, 0)

  it('selling surplus earns Taler and removes the grain', () => {
    const result = applyGrainTrade(5000, 1000, 2000, 0, 3.2, capacity)
    expect(result.soldUnits).toBe(2000)
    expect(result.talerDelta).toBeCloseTo(2000 * 3.2, 5)
    expect(result.grainStockAfter).toBe(3000)
  })

  it('cannot sell grain the realm does not have', () => {
    const result = applyGrainTrade(500, 1000, 99999, 0, 3.2, capacity)
    expect(result.soldUnits).toBe(500)
    expect(result.grainStockAfter).toBe(0)
  })

  it('buying back costs more than selling earned — the spread is what makes storing a real choice', () => {
    const sold = applyGrainTrade(1000, 0, 1000, 0, 3.2, capacity)
    const boughtBack = applyGrainTrade(0, sold.talerDelta, 0, 1000, 3.2, capacity)
    expect(boughtBack.boughtUnits).toBeLessThan(1000)
  })

  it('cannot buy more than the treasury affords or the barns hold', () => {
    const poor = applyGrainTrade(0, 10, 0, 100000, 3.2, capacity)
    expect(poor.boughtUnits).toBeLessThanOrEqual(3)

    const full = applyGrainTrade(capacity, 10_000_000, 0, 100000, 3.2, capacity)
    expect(full.boughtUnits).toBe(0)
  })
})

describe('resolveFeeding', () => {
  const population: PopulationState = { peasants: 1000, unrest: 0 }
  // Derived from the data rather than hardcoded — recalibrating consumption (as
  // Phase 8 did, from 0.5 to 9.0 per peasant) must not silently rot these.
  const required = annualGrainRequirement(population)

  it('required feed level delivers exactly the population requirement when stock allows', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'required' }
    const result = resolveFeeding(decision, population, required * 10)
    expect(result.grainConsumed).toBeCloseTo(required, 5)
    expect(result.feedAdequacy).toBeCloseTo(1, 5)
    expect(result.isUnderfed).toBe(false)
    expect(result.isOverfed).toBe(false)
  })

  // 21.4 (#50a): modes name a share of DEMAND, not of barn stock. The key
  // property is that the same mode means the same thing regardless of barn size
  // — which is exactly what the old dial could not promise.
  it('min underfeeds regardless of how full the barn is', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'min' }
    for (const stock of [required * 1.4, required * 10, required * 100]) {
      const result = resolveFeeding(decision, population, stock)
      expect(result.isUnderfed).toBe(true)
      expect(result.isOverfed).toBe(false)
      expect(result.feedAdequacy).toBeCloseTo(FEEDING.minAdequacy, 6)
    }
  })

  it('growth feeds a surplus without tipping into disease', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'growth' }
    const result = resolveFeeding(decision, population, required * 10)
    expect(result.feedAdequacy).toBeCloseTo(FEEDING.growthAdequacy, 6)
    expect(result.isUnderfed).toBe(false)
    expect(result.isOverfed).toBe(false)
  })

  // The overfeed-to-disease lever must stay REACHABLE. economy.ts's own header
  // and CLAUDE.md both call it a real scarcity lever, and if no mode could cross
  // overfedAdequacy the mechanic would be dead code.
  it('custom can still be pushed past the overfeeding threshold', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'custom', customPercentage: FEEDING.customMaxAdequacy * 100 }
    const result = resolveFeeding(decision, population, required * 10)
    expect(result.isOverfed).toBe(true)
  })

  it('cannot consume more grain than is in stock', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'growth' }
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
    const result = resolveFeeding(malformed, population, required * 5)
    expect(Number.isNaN(result.grainConsumed)).toBe(false)
    expect(Number.isNaN(result.feedAdequacy)).toBe(false)
    expect(result.grainConsumed).toBeCloseTo(required, 5) // same as 'required'
  })

  it('starving population (zero stock) is severely underfed', () => {
    const decision: GrainDecision = { type: 'grain', feedLevel: 'required' }
    const result = resolveFeeding(decision, population, 0)
    expect(result.feedAdequacy).toBe(0)
    expect(result.isUnderfed).toBe(true)
  })
})
