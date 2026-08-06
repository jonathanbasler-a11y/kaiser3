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

  it('round-trips standingOrders on PlayerState (phase 21.5)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    state.players.human.standingOrders = { autoFeedMode: 'growth', autoSellGrainPercent: 40 }
    const restored = deserializeGameState(serializeGameState(state))
    expect(restored.players.human.standingOrders).toEqual({
      autoFeedMode: 'growth',
      autoSellGrainPercent: 40
    })
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

  // Phase 18C warfare depth — training/equipment must survive save → load →
  // continue → save, including omission on legacy saves (default 0).
  it('round-trips trainingLevel and equipmentLevel through SavePayload', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'The Builder' }
    ])
    state.players.human.trainingLevel = 2
    state.players.human.equipmentLevel = 3
    state.players.rival1.trainingLevel = 1
    state.players.rival1.equipmentLevel = 0

    const payload = buildSavePayload({
      game: state,
      maxYears: 60,
      difficultyId: 'hard',
      rivals: [{ playerId: 'rival1', personalityId: 'builder' }],
      name: 'Trained host'
    })
    const mid = parseSavePayload(stringifySavePayload(payload))
    expect(mid.game.players.human.trainingLevel).toBe(2)
    expect(mid.game.players.human.equipmentLevel).toBe(3)
    expect(mid.game.players.rival1.trainingLevel).toBe(1)
    expect(mid.game.players.rival1.equipmentLevel).toBe(0)

    // Continue → save again (the browser cycle the UI actually does).
    mid.game.players.human.trainingLevel = 4
    mid.game.year = 12
    const again = parseSavePayload(stringifySavePayload(buildSavePayload({
      game: mid.game,
      maxYears: mid.maxYears,
      difficultyId: mid.difficultyId,
      rivals: mid.rivals,
      name: mid.name
    })))
    expect(again.game.year).toBe(12)
    expect(again.game.players.human.trainingLevel).toBe(4)
    expect(again.game.players.human.equipmentLevel).toBe(3)
    expect(again.difficultyId).toBe('hard')
  })

  it('defaults missing trainingLevel/equipmentLevel to 0 (pre-18C saves)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const raw = JSON.parse(serializeGameState(state)) as {
      players: { human: Record<string, unknown> }
    }
    delete raw.players.human.trainingLevel
    delete raw.players.human.equipmentLevel
    const restored = deserializeGameState(JSON.stringify(raw))
    expect(restored.players.human.trainingLevel).toBe(0)
    expect(restored.players.human.equipmentLevel).toBe(0)
  })

  // Phase F5 succession — score/reignYears must survive save → load and default
  // on legacy saves written before those fields existed (R8).
  it('defaults missing score/reignYears to 0 (pre-F5 saves)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const raw = JSON.parse(serializeGameState(state)) as {
      players: { human: Record<string, unknown> }
    }
    delete raw.players.human.score
    delete raw.players.human.reignYears
    const restored = deserializeGameState(JSON.stringify(raw))
    expect(restored.players.human.score).toBe(0)
    expect(restored.players.human.reignYears).toBe(0)
  })

  it('rejects present non-finite score/reignYears on load', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const rawScore = JSON.parse(serializeGameState(state)) as {
      players: { human: { score: number } }
    }
    rawScore.players.human.score = Number.NaN
    expect(() => deserializeGameState(JSON.stringify(rawScore))).toThrow(/score/)

    const rawReign = JSON.parse(serializeGameState(state)) as {
      players: { human: { reignYears: number } }
    }
    rawReign.players.human.reignYears = Number.NaN
    expect(() => deserializeGameState(JSON.stringify(rawReign))).toThrow(/reignYears/)
  })

  it('round-trips truces and warWeariness; defaults when absent', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'The Builder' }
    ])
    state.truces = { 'human|rival1': 40 }
    state.players.human.warWeariness = 12
    state.players.rival1.warWeariness = 3

    const mid = parseSavePayload(stringifySavePayload(buildSavePayload({
      game: state,
      maxYears: 60,
      difficultyId: 'standard',
      rivals: [{ playerId: 'rival1', personalityId: 'builder' }],
      name: 'Truce save'
    })))
    expect(mid.game.truces?.['human|rival1']).toBe(40)
    expect(mid.game.players.human.warWeariness).toBe(12)
    expect(mid.game.players.rival1.warWeariness).toBe(3)

    const legacy = createStarterState([{ id: 'human', name: 'You' }])
    const raw = JSON.parse(serializeGameState(legacy)) as {
      players: { human: Record<string, unknown> }
      truces?: unknown
    }
    delete raw.players.human.warWeariness
    delete raw.truces
    const restored = deserializeGameState(JSON.stringify(raw))
    expect(restored.players.human.warWeariness).toBe(0)
    expect(restored.truces).toEqual({})
  })
})
