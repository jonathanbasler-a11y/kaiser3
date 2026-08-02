import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import {
  SAVE_FORMAT_VERSION,
  buildSavePayload,
  deserializeGameState,
  parseSavePayload,
  stringifySavePayload
} from '../src/engine/persist.ts'
import { serializeGameState } from '../src/engine/state.ts'

describe('persist / save-load', () => {
  it('round-trips a starter GameState through deserializeGameState', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'The Builder' }
    ])
    const restored = deserializeGameState(serializeGameState(state))
    // deserialize normalizes optional dike → 0 (pre-F6 saves omit it).
    expect(restored.year).toBe(state.year)
    expect(restored.activePlayerIds).toEqual(state.activePlayerIds)
    expect(restored.kaizerTradePrices).toEqual(state.kaizerTradePrices)
    expect(restored.players.human.taler).toBe(state.players.human.taler)
    expect(restored.players.human.buildings.dike).toBe(0)
  })

  it('rejects NaN / non-finite fields instead of loading them', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const broken = JSON.parse(serializeGameState(state)) as { players: { human: { taler: number } } }
    broken.players.human.taler = Number.NaN
    expect(() => deserializeGameState(JSON.stringify(broken))).toThrow(/taler/)
  })

  it('round-trips a full SavePayload', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'The Builder' }
    ])
    const payload = buildSavePayload({
      game: state,
      maxYears: 60,
      difficultyId: 'standard',
      rivals: [{ playerId: 'rival1', personalityId: 'builder' }],
      name: 'Border march',
      savedAt: '2026-08-02T12:00:00.000Z'
    })
    const restored = parseSavePayload(stringifySavePayload(payload))
    expect(restored.version).toBe(SAVE_FORMAT_VERSION)
    expect(restored.name).toBe('Border march')
    expect(restored.difficultyId).toBe('standard')
    expect(restored.maxYears).toBe(60)
    expect(restored.rivals).toEqual([{ playerId: 'rival1', personalityId: 'builder' }])
    expect(restored.game.players.rival1.name).toBe('The Builder')
    expect(restored.game.players.human.buildings.dike).toBe(0)
  })

  it('accepts unnamed legacy payloads (no name field)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const payload = buildSavePayload({
      game: state,
      maxYears: 40,
      difficultyId: 'easy',
      rivals: []
    })
    const raw = JSON.parse(stringifySavePayload(payload)) as { name?: string }
    delete raw.name
    const restored = parseSavePayload(JSON.stringify(raw))
    expect(restored.name).toBe('')
  })

  it('rejects unsupported save versions', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const payload = buildSavePayload({
      game: state,
      maxYears: 40,
      difficultyId: 'easy',
      rivals: []
    })
    const raw = JSON.parse(stringifySavePayload(payload)) as { version: number }
    raw.version = 99
    expect(() => parseSavePayload(JSON.stringify(raw))).toThrow(/version/)
  })

  it('defaults missing dike to 0 on load (pre-F6 saves)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const raw = JSON.parse(serializeGameState(state)) as {
      players: { human: { buildings: Record<string, number> } }
    }
    delete raw.players.human.buildings.dike
    const restored = deserializeGameState(JSON.stringify(raw))
    expect(restored.players.human.buildings.dike).toBe(0)
  })
})
