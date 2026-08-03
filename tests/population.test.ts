import { describe, it, expect } from 'vitest'
import { applyPopulationDynamics } from '../src/engine/population.ts'
import { resolveFeeding } from '../src/engine/economy.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PopulationState, GrainDecision } from '../src/engine/state.ts'

class CountingRng extends SeededRng {
  draws = 0

  next(): number {
    this.draws += 1
    return super.next()
  }
}

describe('applyPopulationDynamics', () => {
  it('sustained under-feeding drives unrest up and eventually triggers emigration', () => {
    let population: PopulationState = { peasants: 1000, unrest: 0 }
    const decision: GrainDecision = { type: 'grain', feedLevel: 'min' }
    const rng = new SeededRng(7)

    let sawEmigration = false
    for (let year = 0; year < 5; year++) {
      const feeding = resolveFeeding(decision, population, 200) // consistently starved
      const result = applyPopulationDynamics(population, feeding, rng)
      population = result.newPopulation
      if (result.emigration > 0) sawEmigration = true
    }

    expect(population.unrest).toBeGreaterThan(0)
    expect(sawEmigration).toBe(true)
  })

  it('adequate feeding keeps unrest low and does not trigger emigration', () => {
    let population: PopulationState = { peasants: 1000, unrest: 0 }
    const decision: GrainDecision = { type: 'grain', feedLevel: 'required' }
    const rng = new SeededRng(7)

    for (let year = 0; year < 5; year++) {
      const feeding = resolveFeeding(decision, population, 100000) // ample stock, exact requirement offered
      const result = applyPopulationDynamics(population, feeding, rng)
      population = result.newPopulation
      expect(result.emigration).toBe(0)
    }

    expect(population.unrest).toBe(0)
  })

  it('severe overfeeding (disease) increases deaths beyond the base death rate', () => {
    const population: PopulationState = { peasants: 1000, unrest: 0 }

    const normalFeeding = resolveFeeding({ type: 'grain', feedLevel: 'required' }, population, 100000)
    const overFeeding = resolveFeeding({ type: 'grain', feedLevel: 'max' }, population, 100000)

    const normalResult = applyPopulationDynamics(population, normalFeeding, new SeededRng(1))
    const overResult = applyPopulationDynamics(population, overFeeding, new SeededRng(1))

    expect(overResult.deaths).toBeGreaterThan(normalResult.deaths)
  })

  it('population never goes negative even under compounding starvation', () => {
    let population: PopulationState = { peasants: 50, unrest: 0 }
    const rng = new SeededRng(3)
    for (let year = 0; year < 20; year++) {
      const feeding = resolveFeeding({ type: 'grain', feedLevel: 'min' }, population, 0)
      const result = applyPopulationDynamics(population, feeding, rng)
      population = result.newPopulation
      expect(population.peasants).toBeGreaterThanOrEqual(0)
    }
  })

  it('draws immigration RNG even when unrest blocks immigration', () => {
    const thrivingPopulation: PopulationState = { peasants: 1000, unrest: 0 }
    const highUnrestPopulation: PopulationState = { peasants: 1000, unrest: 20 }
    const thrivingRng = new CountingRng(11)
    const highUnrestRng = new CountingRng(11)

    const thrivingFeeding = resolveFeeding({ type: 'grain', feedLevel: 'required' }, thrivingPopulation, 100000)
    const highUnrestFeeding = resolveFeeding({ type: 'grain', feedLevel: 'required' }, highUnrestPopulation, 100000)

    const thrivingResult = applyPopulationDynamics(thrivingPopulation, thrivingFeeding, thrivingRng)
    const highUnrestResult = applyPopulationDynamics(highUnrestPopulation, highUnrestFeeding, highUnrestRng)

    expect(thrivingResult.immigration).toBeGreaterThan(0)
    expect(highUnrestResult.immigration).toBe(0)
    expect(highUnrestRng.draws).toBe(thrivingRng.draws)
    expect(highUnrestRng.draws).toBe(1)
  })
})
