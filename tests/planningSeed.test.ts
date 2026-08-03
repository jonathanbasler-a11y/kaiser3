import { describe, expect, it } from 'vitest'
import { playerIdSalt, planningSeed } from '../src/ai/planningSeed.ts'

describe('planningSeed', () => {
  it('uses distinct per-player salts instead of id length collisions', () => {
    const rivalSalts = ['rival1', 'rival2', 'rival3', 'rival4', 'rival5'].map((id) => playerIdSalt(id))

    expect(new Set(rivalSalts).size).toBe(rivalSalts.length)
    expect(playerIdSalt('builder')).not.toBe(playerIdSalt('schemer'))
    expect(planningSeed(0, 0, 'a')).not.toBe(planningSeed(0, 0, 'b'))
  })
})
