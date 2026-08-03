import { describe, it, expect } from 'vitest'
import economyData from '../data/economy.json'
import { createStarterState, applyStartingMultiplier } from '../src/engine/starter.ts'

describe('applyStartingMultiplier', () => {
  it('does not share buildings by reference with the source player', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const source = state.players.a
    const scaled = applyStartingMultiplier(source, { taler: 0.9, farmland: 0.9, population: 0.9 })
    scaled.buildings.markets += 1
    expect(source.buildings.markets).not.toBe(scaled.buildings.markets)
  })
})

describe('createStarterPlayer reads economy.json starter', () => {
  it('matches data/economy.json starter baseline', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const p = state.players.a
    expect(p.taler).toBe(economyData.starter.taler)
    expect(p.land.farmland).toBe(economyData.starter.farmland)
    expect(p.grainStock).toBe(economyData.starter.grainStock)
    expect(p.population.peasants).toBe(economyData.starter.peasants)
  })
})
