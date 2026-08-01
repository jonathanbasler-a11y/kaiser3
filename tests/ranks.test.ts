import { describe, it, expect } from 'vitest'
import { checkPromotion, getRankName, isFeatureUnlocked } from '../src/engine/ranks.ts'
import { PlayerState } from '../src/engine/state.ts'

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    name: 'Test',
    taler: 0,
    land: { farmland: 0, buildingLand: 0 },
    grainStock: 0,
    population: { peasants: 0, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0,
    guards: 0,
    saboteurs: 0,
    tradingHouses: 0,
    score: 0,
    reignYears: 0,
    dead: false,
    ...overrides
  }
}

describe('checkPromotion', () => {
  it('does not promote when any single requirement is unmet', () => {
    // Duke requires wealthMin 20000, populationMin 2000, palaceStages 4
    const player = makePlayer({
      rank: 0,
      taler: 25000,
      population: { peasants: 2500, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 3, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 } // palace one short
    })
    const result = checkPromotion(player)
    expect(result.promoted).toBe(false)
    expect(result.newRank).toBe(0)
  })

  it('promotes when wealth, population, and building thresholds are all met simultaneously', () => {
    const player = makePlayer({
      rank: 0,
      taler: 25000,
      population: { peasants: 2500, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 4, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })
    const result = checkPromotion(player)
    expect(result.promoted).toBe(true)
    expect(result.newRank).toBe(1) // Duke
  })

  it('can leapfrog multiple ranks in one check if it outright qualifies for a higher one', () => {
    const player = makePlayer({
      rank: 0,
      taler: 250000,
      population: { peasants: 25000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 16, cathedral: 1, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })
    const result = checkPromotion(player)
    expect(result.promoted).toBe(true)
    expect(result.newRank).toBe(7) // Kaiser — victory
  })

  it('never demotes even if wealth/population later drops below the current rank threshold', () => {
    const player = makePlayer({
      rank: 5, // Archbishop
      taler: 0,
      population: { peasants: 0, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })
    const result = checkPromotion(player)
    expect(result.promoted).toBe(false)
    expect(result.newRank).toBe(5)
  })

  it('reports the unlocked feature when crossing the Margrave (trading houses) threshold', () => {
    const player = makePlayer({
      rank: 3,
      taler: 80000,
      population: { peasants: 8000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 14, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })
    const result = checkPromotion(player)
    expect(result.promoted).toBe(true)
    expect(result.newRank).toBe(4)
    expect(result.unlockedFeatures).toContain('tradingHouses')
  })
})

describe('getRankName / isFeatureUnlocked', () => {
  it('resolves rank names', () => {
    expect(getRankName(0)).toBe('Baron')
    expect(getRankName(7)).toBe('Kaiser')
  })

  it('trading houses are unlocked at Margrave and above, not below', () => {
    expect(isFeatureUnlocked(3, 'tradingHouses')).toBe(false)
    expect(isFeatureUnlocked(4, 'tradingHouses')).toBe(true)
    expect(isFeatureUnlocked(7, 'tradingHouses')).toBe(true)
  })
})
