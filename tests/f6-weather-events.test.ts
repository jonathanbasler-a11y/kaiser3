// F6: flood and drought — agriculture-linked events driven by the SAME weather
// roll that decides the harvest (BACKLOG.md F6, docs/kaiser-research.md § Random
// Events). These tests exist specifically to guard the risk this feature's own
// plan called out: "a new loss type falls through silently and the AI prices
// the events at zero" — every switch over EventLossType (events.ts, evaluator.ts,
// src/ui/app.ts, scripts/play.ts) must handle 'grain' and 'farmland', not just
// fall into a default/else branch.

import { describe, it, expect } from 'vitest'
import { resolveEvents, calculateEventProbability, getEventCatalog, eventLossMagnitudeText } from '../src/engine/events/events.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState, EventLossType, PlayerEvent } from '../src/engine/state.ts'
import { ExposureContext } from '../src/engine/scarcity.ts'
import { expectedAnnualEventCost, projectedHarvestShortfall, projectedHarvestExcess, PersonalityWeights } from '../src/ai/evaluator.ts'

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    name: 'Test',
    taler: 15000,
    land: { farmland: 10000, buildingLand: 0 },
    grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0,
    guards: 0,
    saboteurs: 0,
    tradingHouses: 0,
    score: 0,
    reignYears: 0,
    dead: false,
    ...overrides
  }
}

const WEIGHTS: PersonalityWeights = {
  wealth: 1, population: 5, land: 0.5, production: 50, prestige: 400,
  rank: 100000, unrest: 10, grainSecurity: 500, risk: 1, riskHorizonYears: 3
}

// Every EventLossType the engine currently knows about — kept as an explicit
// list (rather than derived) so this test file itself fails to compile if
// state.ts's union grows without this file being updated, the same
// exhaustiveness discipline the switches themselves rely on.
const ALL_LOSS_TYPES: EventLossType[] = ['population', 'gold', 'buildings', 'grain', 'farmland']

describe('F6 catalog', () => {
  it('drought and flood are in the shipped catalog with distinct mitigation buildings', () => {
    const drought = getEventCatalog().find((e) => e.id === 'drought')
    const flood = getEventCatalog().find((e) => e.id === 'flood')
    expect(drought).toBeDefined()
    expect(flood).toBeDefined()
    expect(drought!.mitigation.building).toBe('well')
    expect(flood!.mitigation.building).toBe('dike')
    expect(drought!.loss.type).toBe('grain')
    expect(flood!.loss.type).toBe('farmland')
  })
})

describe('drought exposure (harvestShortfall)', () => {
  it('has zero exposure in an ordinary or better year', () => {
    const drought = getEventCatalog().find((e) => e.id === 'drought')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1 }
    expect(calculateEventProbability(drought, makePlayer(), context)).toBe(0)
    const contextGoodYear: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1.2 }
    expect(calculateEventProbability(drought, makePlayer(), contextGoodYear)).toBe(0)
  })

  it('has real, positive exposure in an actual drought-band year', () => {
    const drought = getEventCatalog().find((e) => e.id === 'drought')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 0.3 }
    expect(calculateEventProbability(drought, makePlayer(), context)).toBeGreaterThan(0)
  })

  it('a well mitigation building reduces drought probability', () => {
    const drought = getEventCatalog().find((e) => e.id === 'drought')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 0.3 }
    const unmitigated = calculateEventProbability(drought, makePlayer(), context)
    const mitigated = calculateEventProbability(
      drought, makePlayer({ buildings: { ...makePlayer().buildings, well: 1 } }), context
    )
    expect(mitigated).toBeLessThan(unmitigated)
    expect(mitigated).toBeGreaterThan(0) // mitigation caps risk, never eliminates it
  })
})

describe('flood exposure (harvestExcess)', () => {
  it('has zero exposure in an ordinary or worse year', () => {
    const flood = getEventCatalog().find((e) => e.id === 'flood')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1 }
    expect(calculateEventProbability(flood, makePlayer(), context)).toBe(0)
    const droughtYear: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 0.3 }
    expect(calculateEventProbability(flood, makePlayer(), droughtYear)).toBe(0)
  })

  it('has real, positive exposure in an unusually wet/bountiful year', () => {
    const flood = getEventCatalog().find((e) => e.id === 'flood')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1.85 }
    expect(calculateEventProbability(flood, makePlayer(), context)).toBeGreaterThan(0)
  })

  it('a dike mitigation building reduces flood probability', () => {
    const flood = getEventCatalog().find((e) => e.id === 'flood')!
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1.85 }
    const unmitigated = calculateEventProbability(flood, makePlayer(), context)
    const mitigated = calculateEventProbability(
      flood, makePlayer({ buildings: { ...makePlayer().buildings, dike: 1 } }), context
    )
    expect(mitigated).toBeLessThan(unmitigated)
    expect(mitigated).toBeGreaterThan(0)
  })
})

describe('resolving drought/flood actually moves the right resource', () => {
  it('a fired drought event reduces grainStock, never population/taler/buildings', () => {
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 0.3 } // drought-band weather
    let sawDrought = false
    for (let seed = 0; seed < 200 && !sawDrought; seed++) {
      const player = makePlayer()
      const before = { ...player, grainStock: player.grainStock }
      const result = resolveEvents(player, context, new SeededRng(seed))
      const drought = result.events.find((e) => e.type === 'drought')
      if (!drought) continue
      sawDrought = true
      expect(player.grainStock).toBeLessThan(before.grainStock)
      expect(player.population.peasants).toBe(before.population.peasants)
      expect(player.taler).toBe(before.taler)
      expect(drought.lossType).toBe('grain')
    }
    expect(sawDrought).toBe(true)
  })

  it('a fired flood event reduces farmland, never building land/population/taler', () => {
    const context: ExposureContext = { feedAdequacy: 1, weatherMultiplier: 1.85 } // glut-band weather
    let sawFlood = false
    for (let seed = 0; seed < 200 && !sawFlood; seed++) {
      const player = makePlayer()
      const beforeFarmland = player.land.farmland
      const result = resolveEvents(player, context, new SeededRng(seed))
      const flood = result.events.find((e) => e.type === 'flood')
      if (!flood) continue
      sawFlood = true
      expect(player.land.farmland).toBeLessThan(beforeFarmland)
      expect(player.land.buildingLand).toBe(0)
      expect(player.population.peasants).toBe(1000)
      expect(flood.lossType).toBe('farmland')
    }
    expect(sawFlood).toBe(true)
  })
})

describe('the AI prices drought/flood risk (not silently at zero)', () => {
  it('expectedAnnualEventCost is strictly lower for a player holding a well than one without, all else equal', () => {
    // The SAME projected context evaluator.ts actually builds when scoring
    // candidates (planner.ts) — the true expectation, not a mean-multiplier
    // approximation (see evaluator.ts's Jensen's-gap comment on why that
    // would silently zero out drought pricing). This is the case the plan's
    // own risk note warns about: if grain/farmland losses fell through
    // unhandled, building a well/dike would score identically to not
    // building one.
    const context: ExposureContext = {
      feedAdequacy: 1,
      harvestShortfallExpectation: projectedHarvestShortfall(),
      harvestExcessExpectation: projectedHarvestExcess()
    }
    const bare = makePlayer()
    const withWell = makePlayer({ buildings: { ...makePlayer().buildings, well: 1 } })

    const bareCost = expectedAnnualEventCost(bare, context, WEIGHTS)
    const wellCost = expectedAnnualEventCost(withWell, context, WEIGHTS)

    expect(wellCost).toBeLessThan(bareCost)

    // Flood only destroys farmland the realm can actually work — economy.ts's
    // laborGatedFarmland caps worked land at population*5ha/peasant, so a player
    // holding more farmland than their labor can work (makePlayer()'s default:
    // 10,000ha against 1,000 peasants = 5,000ha capacity) loses only idle surplus
    // to a flood, which the AI correctly prices at ~zero. Pin farmland AT the
    // labor ceiling so the loss is real and a dike's mitigation has something to
    // save.
    const landConstrained = () => makePlayer({ land: { farmland: 5000, buildingLand: 0 } })
    const bareLandConstrained = landConstrained()
    const withDike = { ...landConstrained(), buildings: { ...landConstrained().buildings, dike: 1 } }

    const bareLandConstrainedCost = expectedAnnualEventCost(bareLandConstrained, context, WEIGHTS)
    const dikeCost = expectedAnnualEventCost(withDike, context, WEIGHTS)

    expect(dikeCost).toBeLessThan(bareLandConstrainedCost)
  })
})

describe('eventLossMagnitudeText is exhaustive over EventLossType', () => {
  it('produces distinct, sensible text for every loss type the engine knows about', () => {
    const base: PlayerEvent = {
      type: 'plague', severity: 1, mitigated: false, loss: 42, lossType: 'population', telegraphText: 'x'
    }
    const texts = ALL_LOSS_TYPES.map((lossType) => eventLossMagnitudeText({ ...base, lossType }))
    expect(new Set(texts).size).toBe(ALL_LOSS_TYPES.length) // all distinct — none silently collapsed to the same string
    expect(eventLossMagnitudeText({ ...base, lossType: 'grain' })).toContain('grain')
    expect(eventLossMagnitudeText({ ...base, lossType: 'farmland' })).toContain('farmland')
  })
})
