import { describe, it, expect } from 'vitest'
import { strikeSuccessProbability, resolveStrike, applyRecruitment, espionageUpkeep } from '../src/engine/espionage.ts'
import { strikeExpectedValue, planAggression } from '../src/ai/aggression.ts'
import { getPersonality, getPersonalities } from '../src/ai/personalities.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState } from '../src/engine/state.ts'

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id, name: id, taler: 50000,
    land: { farmland: 10000, buildingLand: 0 },
    grainStock: 10000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 4, mills: 3, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0, guards: 0, saboteurs: 10, tradingHouses: 0, score: 0, reignYears: 0, dead: false,
    ...overrides
  }
}

describe('strikeSuccessProbability', () => {
  it('is zero when nothing is committed', () => {
    expect(strikeSuccessProbability(0, 5)).toBe(0)
  })

  it('rises with saboteurs and falls with guards', () => {
    expect(strikeSuccessProbability(10, 2)).toBeGreaterThan(strikeSuccessProbability(4, 2))
    expect(strikeSuccessProbability(6, 10)).toBeLessThan(strikeSuccessProbability(6, 2))
  })

  it('never reaches certainty, even against a completely undefended rival', () => {
    // baseDefence represents ordinary watchfulness. Without it an unguarded ruler
    // would be robbed with certainty every single year, which is punishing rather
    // than tense.
    expect(strikeSuccessProbability(1000, 0)).toBeLessThan(1)
    expect(strikeSuccessProbability(1000, 0)).toBeGreaterThan(0.99)
  })
})

describe('resolveStrike', () => {
  it('a raid moves treasury from victim to attacker, conserving the total', () => {
    const attacker = makePlayer('a', { taler: 1000 })
    const defender = makePlayer('d', { taler: 100000, guards: 0 })
    const before = attacker.taler + defender.taler

    // Seeded so the strike lands.
    const outcome = resolveStrike(attacker, defender, 10, 'raid', new SeededRng(1))
    expect(outcome.succeeded).toBe(true)
    expect(outcome.talerStolen).toBeGreaterThan(0)
    expect(attacker.taler + defender.taler).toBeCloseTo(before, 5)
  })

  it('sabotage destroys a workshop and carries off grain and coin', () => {
    const attacker = makePlayer('a', { grainStock: 0, taler: 0 })
    const defender = makePlayer('d', { guards: 0, grainStock: 20000, taler: 80000 })
    const buildingsBefore = defender.buildings.markets + defender.buildings.mills

    const outcome = resolveStrike(attacker, defender, 10, 'sabotage', new SeededRng(1))
    expect(outcome.succeeded).toBe(true)
    expect(outcome.buildingsDestroyed).toBe(1)
    expect(defender.buildings.markets + defender.buildings.mills).toBe(buildingsBefore - 1)
    expect(attacker.grainStock).toBeGreaterThan(0)
    // Per the original, sabotage takes currency as well as grain.
    expect(attacker.taler).toBeGreaterThan(0)
  })

  it('costs saboteurs whether it succeeds or fails, and more when it fails', () => {
    let successLosses = 0
    let failureLosses = 0
    let successes = 0
    let failures = 0

    for (let seed = 1; seed <= 200; seed++) {
      const attacker = makePlayer('a', { saboteurs: 10 })
      const defender = makePlayer('d', { guards: 8 })
      const outcome = resolveStrike(attacker, defender, 8, 'raid', new SeededRng(seed))
      expect(outcome.saboteursLost).toBeGreaterThan(0)
      if (outcome.succeeded) { successLosses += outcome.saboteursLost; successes++ }
      else { failureLosses += outcome.saboteursLost; failures++ }
    }

    expect(successes).toBeGreaterThan(0)
    expect(failures).toBeGreaterThan(0)
    expect(failureLosses / failures).toBeGreaterThan(successLosses / successes)
  })

  it('cannot commit more saboteurs than are actually available', () => {
    const attacker = makePlayer('a', { saboteurs: 3 })
    const defender = makePlayer('d')
    const outcome = resolveStrike(attacker, defender, 50, 'raid', new SeededRng(1))
    expect(outcome.saboteursCommitted).toBe(3)
    expect(attacker.saboteurs).toBeGreaterThanOrEqual(0)
  })

  it('never drives a victim below zero in any resource', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const attacker = makePlayer('a', { saboteurs: 20 })
      const defender = makePlayer('d', { taler: 10, grainStock: 5, guards: 0, buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 } })
      resolveStrike(attacker, defender, 20, seed % 2 === 0 ? 'raid' : 'sabotage', new SeededRng(seed))
      expect(defender.taler).toBeGreaterThanOrEqual(0)
      expect(defender.grainStock).toBeGreaterThanOrEqual(0)
      expect(defender.buildings.markets).toBeGreaterThanOrEqual(0)
      expect(defender.buildings.mills).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const a = makePlayer('a'), d = makePlayer('d', { guards: 4 })
      return JSON.stringify(resolveStrike(a, d, 6, 'raid', new SeededRng(77)))
    }
    expect(run()).toBe(run())
  })
})

describe('recruitment and upkeep', () => {
  it('clamps recruitment to what the treasury can afford', () => {
    const player = makePlayer('a', { taler: 1000, guards: 0, saboteurs: 0 })
    applyRecruitment(player, 50, 50)
    expect(player.taler).toBeGreaterThanOrEqual(0)
    expect(player.guards + player.saboteurs).toBeGreaterThan(0)
  })

  it('respects the standing-force cap', () => {
    const player = makePlayer('a', { taler: 10_000_000, guards: 0, saboteurs: 0 })
    applyRecruitment(player, 1000, 1000)
    expect(player.guards).toBeLessThanOrEqual(25)
    expect(player.saboteurs).toBeLessThanOrEqual(25)
  })

  it('charges upkeep for a standing secret service — safety is rent, not a purchase', () => {
    expect(espionageUpkeep(makePlayer('a', { guards: 0, saboteurs: 0 }))).toBe(0)
    expect(espionageUpkeep(makePlayer('a', { guards: 5, saboteurs: 5 })))
      .toBeGreaterThan(espionageUpkeep(makePlayer('a', { guards: 1, saboteurs: 1 })))
  })
})

describe('AI aggression', () => {
  const raider = getPersonality('raider')

  it('values a rich target above a poor one', () => {
    const rich = makePlayer('rich', { taler: 500000 })
    const poor = makePlayer('poor', { taler: 100 })
    expect(strikeExpectedValue(rich, 8, 'raid', raider.weights))
      .toBeGreaterThan(strikeExpectedValue(poor, 8, 'raid', raider.weights))
  })

  it('values a guarded target below an unguarded one', () => {
    const guarded = makePlayer('g', { taler: 200000, guards: 20 })
    const open = makePlayer('o', { taler: 200000, guards: 0 })
    expect(strikeExpectedValue(guarded, 8, 'raid', raider.weights))
      .toBeLessThan(strikeExpectedValue(open, 8, 'raid', raider.weights))
  })

  it('prefers the ruler who is ahead — the anti-snowball lever', () => {
    const state = createStarterState([
      { id: 'me', name: 'Me' }, { id: 'leader', name: 'Leader' }, { id: 'laggard', name: 'Laggard' }
    ])
    state.players['me'].saboteurs = 8
    state.players['leader'].taler = 300000
    state.players['leader'].population.peasants = 3000
    state.players['laggard'].taler = 20000
    state.players['laggard'].population.peasants = 400

    const decision = planAggression(state, 'me', raider.aggression, raider.weights)
    expect(decision.targetPlayerId).toBe('leader')
  })

  it('does not maintain a secret service when there is nobody to strike', () => {
    // A solo ruler paying saboteur upkeep for raids it can never make is simply
    // burning money — which is exactly what an earlier version did.
    const state = createStarterState([{ id: 'me', name: 'Me' }])
    const decision = planAggression(state, 'me', raider.aggression, raider.weights)
    expect(decision.saboteurHire).toBe(0)
    expect(decision.targetPlayerId).toBeUndefined()
  })

  it('recruits saboteurs from a standing start — no chicken-and-egg deadlock', () => {
    // Regression guard. Scoring targets by CURRENT force meant a ruler with zero
    // saboteurs valued every target at zero, so never recruited, so never had any:
    // espionage silently switched itself off across every match.
    const state = createStarterState([{ id: 'me', name: 'Me' }, { id: 'rival', name: 'Rival' }])
    state.players['me'].saboteurs = 0
    state.players['rival'].taler = 200000

    const decision = planAggression(state, 'me', raider.aggression, raider.weights)
    expect(decision.saboteurHire).toBeGreaterThan(0)
  })

  it('every archetype emits a legal espionage decision', () => {
    const state = createStarterState([
      { id: 'me', name: 'Me' }, { id: 'rival', name: 'Rival' }
    ])
    state.players['me'].saboteurs = 6
    for (const personality of getPersonalities()) {
      const decision = { type: 'espionage' as const, ...planAggression(state, 'me', personality.aggression, personality.weights) }
      expect(validateDecisions([decision]).errors).toEqual([])
    }
  })
})
