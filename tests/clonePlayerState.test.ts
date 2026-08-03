import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { clonePlayerState } from '../src/engine/state.ts'

describe('clonePlayerState', () => {
  it('coerces NaN optional military fields to 0', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const p = state.players.a
    ;(p as { trainingLevel?: number }).trainingLevel = NaN
    ;(p as { equipmentLevel?: number }).equipmentLevel = NaN
    p.buildings.dike = NaN as unknown as number
    const c = clonePlayerState(p)
    expect(Number.isFinite(c.trainingLevel ?? 0)).toBe(true)
    expect(c.trainingLevel ?? 0).toBe(0)
    expect(c.equipmentLevel ?? 0).toBe(0)
    expect(c.buildings.dike).toBe(0)
  })
})
