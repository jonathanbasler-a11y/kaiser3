// Phase 13 hardening sweep. resolveFeeding()'s default-branch story
// (src/engine/economy.ts) established the rule: malformed input degrades to
// the safe choice, never poisons the simulation. It turned out to be applied
// at only ONE of the several places a raw Decision number reaches the engine
// without validateDecisions() (src/engine/decisions.ts) necessarily having
// run first — that check happens at the UI/AI boundary, by convention, not
// inside advanceYear() itself. This file proves the other entry points now
// hold the same rule: a NaN anywhere in a Decision sheet must not turn a
// PlayerState field into NaN forever (every field here is a running total
// mutated year over year — see cloneGameState's comment in state.ts).
//
// `Math.max`/`Math.min`/`Math.floor` do NOT self-heal NaN
// (`Math.max(0, NaN)` is `NaN`, not `0`), which is exactly why the existing
// clamps in these functions were silently unable to bound illegal input even
// though they correctly bound out-of-range legal input.

import { describe, it, expect } from 'vitest'
import { advanceYear } from '../src/engine/year.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { Decision } from '../src/engine/state.ts'

function isFiniteState(taler: number, farmland: number, buildingLand: number, guards: number, saboteurs: number): boolean {
  return [taler, farmland, buildingLand, guards, saboteurs].every((v) => Number.isFinite(v))
}

function decisionsWith(overrides: Partial<Record<Decision['type'], Partial<Decision>>>): Record<string, Decision[]> {
  const base: Decision[] = [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
    { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 },
    { type: 'espionage', guardHire: 0, saboteurHire: 0 },
    { type: 'war', declare: false }
  ]
  const merged = base.map((d) => (overrides[d.type] ? { ...d, ...overrides[d.type] } as Decision : d))
  return { player1: merged }
}

describe('malformed-input hardening: NaN in a Decision degrades safely, never poisons state', () => {
  it('NaN tax rates do not poison taler or unrest', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({ tax: { vat: NaN, incomeTax: NaN, tariff: NaN, justiceGraft: NaN } })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.taler)).toBe(true)
    expect(Number.isFinite(p.population.unrest)).toBe(true)
  })

  it('NaN land trade order does not poison land or taler', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({ land_trade: { farmlanbuy: NaN, buildingLandBuy: NaN } })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.land.farmland)).toBe(true)
    expect(Number.isFinite(p.land.buildingLand)).toBe(true)
    expect(Number.isFinite(p.taler)).toBe(true)
  })

  it('NaN construction counts do not poison buildings or taler', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({
      construction: {
        marketBuild: NaN, millBuild: NaN, palaceStages: NaN,
        wellBuild: NaN, hospitalBuild: NaN, granaryBuild: NaN, garrisonBuild: NaN,
        tradingHouseBuild: NaN, dikeBuild: NaN
      }
    })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.taler)).toBe(true)
    for (const value of Object.values(p.buildings)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('NaN espionage hire/strike counts do not poison guards, saboteurs, or taler', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }, { id: 'player2', name: 'P2' }])
    state.players.player1.saboteurs = 5 // so a NaN saboteursCommitted has something to clamp against
    const decisions: Record<string, Decision[]> = {
      player1: [
        { type: 'grain', feedLevel: 'required' },
        { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
        { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
        { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 },
        { type: 'espionage', guardHire: NaN, saboteurHire: NaN, targetPlayerId: 'player2', saboteursCommitted: NaN, mode: 'raid' },
        { type: 'war', declare: false }
      ],
      player2: [
        { type: 'grain', feedLevel: 'required' },
        { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
        { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
        { type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false, wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0 }
      ]
    }
    const result = advanceYear(state, decisions, 1)
    const attacker = result.state.players.player1
    const defender = result.state.players.player2
    expect(isFiniteState(attacker.taler, 0, 0, attacker.guards, attacker.saboteurs)).toBe(true)
    expect(Number.isFinite(defender.taler)).toBe(true)
    expect(Number.isFinite(defender.grainStock)).toBe(true)
  })

  it('a NaN custom feed percentage does not poison grain stock or population', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({ grain: { feedLevel: 'custom', customPercentage: NaN } })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.grainStock)).toBe(true)
    expect(Number.isFinite(p.population.peasants)).toBe(true)
  })

  it('NaN grain sell/buy orders do not poison grain stock or taler', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({ grain: { feedLevel: 'required', sellGrain: NaN, buyGrain: NaN } })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.grainStock)).toBe(true)
    expect(Number.isFinite(p.taler)).toBe(true)
  })

  it('a fully malformed sheet (every numeric field NaN) still produces a finite, playable state', () => {
    const state = createStarterState([{ id: 'player1', name: 'P1' }])
    const decisions = decisionsWith({
      grain: { feedLevel: 'custom', customPercentage: NaN, sellGrain: NaN, buyGrain: NaN },
      land_trade: { farmlanbuy: NaN, buildingLandBuy: NaN },
      tax: { vat: NaN, incomeTax: NaN, tariff: NaN, justiceGraft: NaN },
      construction: { marketBuild: NaN, millBuild: NaN, palaceStages: NaN, wellBuild: NaN, hospitalBuild: NaN, granaryBuild: NaN, garrisonBuild: NaN, tradingHouseBuild: NaN },
      espionage: { guardHire: NaN, saboteurHire: NaN }
    })
    const result = advanceYear(state, decisions, 1)
    const p = result.state.players.player1
    expect(Number.isFinite(p.taler)).toBe(true)
    expect(Number.isFinite(p.grainStock)).toBe(true)
    expect(Number.isFinite(p.population.peasants)).toBe(true)
    expect(Number.isFinite(p.population.unrest)).toBe(true)
    expect(Number.isFinite(p.land.farmland)).toBe(true)
    expect(Number.isFinite(p.land.buildingLand)).toBe(true)
    // And a SECOND year on this same (now-clean) state must also stay finite —
    // proving the year that absorbed the malformed sheet didn't leave a
    // latent NaN for the next year's math to trip over.
    const secondYear = advanceYear(result.state, decisionsWith({}), 2)
    const p2 = secondYear.state.players.player1
    expect(Number.isFinite(p2.taler)).toBe(true)
    expect(Number.isFinite(p2.population.peasants)).toBe(true)
  })
})
