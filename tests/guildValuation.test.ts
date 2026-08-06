// Phase 21.7b — the AI evaluator's valuation of a held guild charter (D2, #49/#51).
//
// This is the piece the phase plan singled out as "the subtle part": a charter's
// payoff is a perpetual income stream, but planYear looks exactly ONE year ahead.
// Priced at one year of income a charter is worth ~50-108 Taler against a
// charterFee of 1,200-2,500, so an unprojected planner refuses every petition
// forever and the whole feature is dead on arrival. The fix is to capitalise it
// into the existing `production` term as market-equivalents, inheriting that
// term's already-calibrated horizon rather than inventing a second one.
//
// What these tests pin down:
//   1. The term is EXACTLY inert with no guilds (the 21.6/21.7 byte-identity
//      guarantee, which planner-golden also checks end-to-end).
//   2. The market-equivalents arithmetic is what it claims to be.
//   3. It inherits a retuned `production` weight instead of hardcoding a horizon.
//   4. The risk term prices losing a guild to fire, via the engine's own pruning
//      rule rather than a second copy of it.

import { describe, it, expect } from 'vitest'
import buildingsData from '../data/buildings.json'
import { intrinsicUtility, evaluateState } from '../src/ai/evaluator.ts'
import { getPersonality } from '../src/ai/personalities.ts'
import { guildNetAnnualGain, netGuildBonus } from '../src/engine/guilds.ts'
import { PlayerState, SpecializedBuilding } from '../src/engine/state.ts'

const PRODUCTION = buildingsData.production
const MARKET_NET = PRODUCTION.market.incomePerYear - PRODUCTION.market.upkeepPerYear

const BUILDER = getPersonality('builder')
const FED = { feedAdequacy: 1 }

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1', name: 'Test', taler: 15000,
    land: { farmland: 10000, buildingLand: 0 },
    grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false,
    ...overrides
  }
}

const IRON_MARKET: SpecializedBuilding = { kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }
const WINE_MILL: SpecializedBuilding = { kind: 'mill', specialization: 'wine', incomeMultiplier: 1.5 }

describe('the guild term is exactly inert without guilds', () => {
  // The byte-identity guarantee for 21.6/21.7 at the unit level. planner-golden
  // proves the same thing end-to-end, but this localises a break to this term.
  it('an absent, undefined, or empty guilds array all value identically', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 5, mills: 3 } })
    const undef = { ...base, guilds: undefined }
    const empty = { ...base, guilds: [] }

    const baseline = intrinsicUtility(base, BUILDER.weights)
    expect(intrinsicUtility(undef, BUILDER.weights)).toBe(baseline)
    expect(intrinsicUtility(empty, BUILDER.weights)).toBe(baseline)
  })

  it('evaluateState is likewise unchanged, so risk pricing is untouched too', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 5, mills: 3 }, taler: 80000 })
    const empty = { ...base, guilds: [] }
    expect(evaluateState(empty, FED, BUILDER.weights)).toBe(evaluateState(base, FED, BUILDER.weights))
  })
})

describe('market-equivalents arithmetic', () => {
  it('a held guild is worth exactly (its net gain / a market net gain) production units', () => {
    const withoutGuild = makePlayer({ buildings: { ...makePlayer().buildings, markets: 4 } })
    const withGuild = { ...withoutGuild, guilds: [IRON_MARKET] }

    const delta = intrinsicUtility(withGuild, BUILDER.weights) - intrinsicUtility(withoutGuild, BUILDER.weights)
    const expectedEquivalents = guildNetAnnualGain(IRON_MARKET) / MARKET_NET

    expect(delta).toBeCloseTo(expectedEquivalents * BUILDER.weights.production, 6)
  })

  it('is worth strictly less than a whole additional market — a charter is an upgrade, not a building', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 4 } })
    const withGuild = { ...base, guilds: [IRON_MARKET] }
    const withExtraMarket = { ...base, buildings: { ...base.buildings, markets: 5 } }

    const guildGain = intrinsicUtility(withGuild, BUILDER.weights) - intrinsicUtility(base, BUILDER.weights)
    const marketGain = intrinsicUtility(withExtraMarket, BUILDER.weights) - intrinsicUtility(base, BUILDER.weights)

    expect(guildGain).toBeGreaterThan(0)
    expect(guildGain).toBeLessThan(marketGain)
  })

  it('a richer guild type is valued above a poorer one', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 4, mills: 4 } })
    const iron = intrinsicUtility({ ...base, guilds: [IRON_MARKET] }, BUILDER.weights)
    const wine = intrinsicUtility({ ...base, guilds: [WINE_MILL] }, BUILDER.weights)

    // wine on a mill nets more than iron on a market — both by the raw data and
    // therefore in the valuation, without the evaluator restating the ranking.
    expect(guildNetAnnualGain(WINE_MILL)).toBeGreaterThan(guildNetAnnualGain(IRON_MARKET))
    expect(wine).toBeGreaterThan(iron)
  })

  it('multiple guilds sum', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 4, mills: 4 } })
    const one = intrinsicUtility({ ...base, guilds: [IRON_MARKET] }, BUILDER.weights)
    const two = intrinsicUtility({ ...base, guilds: [IRON_MARKET, WINE_MILL] }, BUILDER.weights)
    const baseline = intrinsicUtility(base, BUILDER.weights)

    expect(two - baseline).toBeCloseTo((one - baseline) + (
      guildNetAnnualGain(WINE_MILL) / MARKET_NET * BUILDER.weights.production
    ), 6)
  })
})

describe('the term inherits the production weight rather than hardcoding a horizon', () => {
  // The whole reason for expressing this as market-equivalents instead of giving
  // guilds their own weight: retuning `production` must move guild value with it,
  // automatically and proportionally. A standalone weight would silently drift.
  it('doubling the production weight doubles the guild contribution', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, markets: 4 } })
    const withGuild = { ...base, guilds: [IRON_MARKET] }

    const normal = BUILDER.weights
    const doubled = { ...normal, production: normal.production * 2 }

    const gainNormal = intrinsicUtility(withGuild, normal) - intrinsicUtility(base, normal)
    const gainDoubled = intrinsicUtility(withGuild, doubled) - intrinsicUtility(base, doubled)

    expect(gainDoubled).toBeCloseTo(gainNormal * 2, 6)
  })

  it('the equivalents ratio itself is independent of any weight', () => {
    // netGuildBonus is pure data arithmetic — no weight enters it. This is what
    // makes the inheritance above hold for every archetype at once.
    for (const type of ['cloth', 'iron', 'salt', 'wine'] as const) {
      const ratio = netGuildBonus(type, PRODUCTION.market.incomePerYear) / MARKET_NET
      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThan(1)
    }
  })
})

describe('risk pricing sees guild loss, via the engine\'s own pruning rule', () => {
  // The reason guildProductionEquivalents runs pruneGuildsToFit rather than
  // counting player.guilds directly: on the hypothetical damaged state that
  // applyExpectedLosses builds, building counts are reduced, so pruning fires
  // there exactly as it would after a real fire. A second, hand-written "which
  // guild burns" rule could disagree with events.ts; this cannot.
  it('a guild with no surviving backing building contributes nothing', () => {
    // 1 market recorded as specialized, but zero markets standing — the shape
    // applyExpectedLosses produces once expected fire losses exceed a building.
    const noBuildings = makePlayer({
      buildings: { ...makePlayer().buildings, markets: 0 },
      guilds: [IRON_MARKET]
    })
    const bare = makePlayer({ buildings: { ...makePlayer().buildings, markets: 0 } })

    expect(intrinsicUtility(noBuildings, BUILDER.weights)).toBe(intrinsicUtility(bare, BUILDER.weights))
  })

  it('guild value survives while its backing buildings do', () => {
    const supported = makePlayer({
      buildings: { ...makePlayer().buildings, markets: 3 },
      guilds: [IRON_MARKET]
    })
    const bare = makePlayer({ buildings: { ...makePlayer().buildings, markets: 3 } })
    expect(intrinsicUtility(supported, BUILDER.weights)).toBeGreaterThan(intrinsicUtility(bare, BUILDER.weights))
  })

  it('valuation stays finite and sane for a guild-holding player under real risk', () => {
    const exposed = makePlayer({
      taler: 200000,
      population: { peasants: 5000, unrest: 40 },
      buildings: { ...makePlayer().buildings, markets: 10, mills: 8 },
      guilds: [IRON_MARKET, WINE_MILL]
    })
    const value = evaluateState(exposed, FED, BUILDER.weights)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeLessThan(intrinsicUtility(exposed, BUILDER.weights))
  })
})
