import { describe, it, expect } from 'vitest'
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
