import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { clonePlayerState, cloneGameState } from '../src/engine/state.ts'

describe('clonePlayerState', () => {
  it('round-trips optional PlayerState fields unchanged', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const p = state.players.a
    p.trainingLevel = 2
    p.equipmentLevel = 3
    p.heir = 'a'
    p.buildings.dike = 1

    const clonedPlayer = clonePlayerState(p)
    expect(clonedPlayer.trainingLevel).toBe(2)
    expect(clonedPlayer.equipmentLevel).toBe(3)
    expect(clonedPlayer.heir).toBe('a')
    expect(clonedPlayer.buildings.dike).toBe(1)

    const clonedGame = cloneGameState(state)
    const gp = clonedGame.players.a
    expect(gp.trainingLevel).toBe(2)
    expect(gp.equipmentLevel).toBe(3)
    expect(gp.heir).toBe('a')
    expect(gp.buildings.dike).toBe(1)
  })

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
