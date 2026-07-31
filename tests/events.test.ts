import { describe, it, expect } from 'vitest'
import {
  resolveEvents, calculateEventProbability, validateEventCatalog, getEventCatalog,
  EventDefinition
} from '../src/engine/events/events.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState, EventId } from '../src/engine/state.ts'
import { ExposureContext } from '../src/engine/scarcity.ts'

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
    dead: false,
    ...overrides
  }
}

const FED: ExposureContext = { feedAdequacy: 1 }

// Runs many independent trials, each on a fresh copy of the player (resolveEvents
// mutates), and reports how often each event fired plus the total loss inflicted.
function monteCarlo(player: PlayerState, context: ExposureContext, trials: number) {
  const counts: Record<string, number> = {}
  let totalPopulationLoss = 0
  let totalGoldLoss = 0
  let totalBuildingsDestroyed = 0

  for (let i = 0; i < trials; i++) {
    const subject = JSON.parse(JSON.stringify(player)) as PlayerState
    const result = resolveEvents(subject, context, new SeededRng(i + 1))
    for (const event of result.events) {
      counts[event.type] = (counts[event.type] ?? 0) + 1
    }
    totalPopulationLoss += result.totalPopulationLoss
    totalGoldLoss += result.totalGoldLoss
    totalBuildingsDestroyed += result.totalBuildingsDestroyed
  }

  return {
    counts,
    rate: (id: EventId) => (counts[id] ?? 0) / trials,
    totalPopulationLoss,
    totalGoldLoss,
    totalBuildingsDestroyed
  }
}

function findEvent(id: EventId): EventDefinition {
  const event = getEventCatalog().find((e) => e.id === id)
  if (!event) throw new Error(`Event ${id} missing from catalog`)
  return event
}

describe('validateEventCatalog', () => {
  it('accepts the shipped catalog', () => {
    expect(() => validateEventCatalog()).not.toThrow()
  })

  it('rejects an event with no mitigation hook (every event must be mitigable)', () => {
    const bad = [{ ...findEvent('plague'), mitigation: undefined }] as unknown as EventDefinition[]
    expect(() => validateEventCatalog(bad)).toThrow(/no mitigation hook/)
  })

  it('rejects a mitigation building that does not exist in buildings.json', () => {
    const bad = [{
      ...findEvent('plague'),
      mitigation: { building: 'wizard_tower', probabilityReduction: 0.5, severityReduction: 0.5 }
    }] as EventDefinition[]
    expect(() => validateEventCatalog(bad)).toThrow(/does not exist in data\/buildings.json/)
  })

  it('rejects mitigation that would eliminate risk entirely', () => {
    const bad = [{
      ...findEvent('plague'),
      mitigation: { building: 'hospital', probabilityReduction: 1, severityReduction: 0.5 }
    }] as EventDefinition[]
    expect(() => validateEventCatalog(bad)).toThrow(/never eliminate it/)
  })

  it('rejects duplicate event ids', () => {
    const bad = [findEvent('plague'), findEvent('plague')]
    expect(() => validateEventCatalog(bad)).toThrow(/duplicate event id/)
  })
})

describe('prosperity scaling (the anti-snowball lever)', () => {
  it('plague risk rises monotonically with population', () => {
    const plague = findEvent('plague')
    const populations = [500, 1000, 3000, 8000, 20000]
    const probabilities = populations.map((peasants) =>
      calculateEventProbability(plague, makePlayer({ population: { peasants, unrest: 0 } }), FED)
    )

    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeGreaterThanOrEqual(probabilities[i - 1])
    }
    expect(probabilities[probabilities.length - 1]).toBeGreaterThan(probabilities[0])
  })

  it('banditry risk rises monotonically with wealth', () => {
    const banditry = findEvent('banditry')
    const wealths = [5000, 15000, 50000, 200000]
    const probabilities = wealths.map((taler) => calculateEventProbability(banditry, makePlayer({ taler }), FED))

    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeGreaterThanOrEqual(probabilities[i - 1])
    }
    expect(probabilities[probabilities.length - 1]).toBeGreaterThan(probabilities[0])
  })

  it('fire risk rises monotonically with building count', () => {
    const fire = findEvent('fire')
    const buildingCounts = [0, 2, 6, 15]
    const probabilities = buildingCounts.map((n) =>
      calculateEventProbability(fire, makePlayer({
        buildings: { markets: n, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
      }), FED)
    )

    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeGreaterThanOrEqual(probabilities[i - 1])
    }
    expect(probabilities[probabilities.length - 1]).toBeGreaterThan(probabilities[0])
  })

  it('a thriving principality faces measurably more total disaster than a modest one', () => {
    const modest = makePlayer({ taler: 15000, population: { peasants: 1000, unrest: 0 } })
    const thriving = makePlayer({
      taler: 200000,
      population: { peasants: 20000, unrest: 0 },
      buildings: { markets: 10, mills: 8, palace: 8, cathedral: 1, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    const modestRuns = monteCarlo(modest, FED, 400)
    const thrivingRuns = monteCarlo(thriving, FED, 400)

    const modestTotal = Object.values(modestRuns.counts).reduce((a, b) => a + b, 0)
    const thrivingTotal = Object.values(thrivingRuns.counts).reduce((a, b) => a + b, 0)
    expect(thrivingTotal).toBeGreaterThan(modestTotal)
  })

  it('exposure is capped, so even an enormous empire does not face certain annual ruin', () => {
    const plague = findEvent('plague')
    const colossal = makePlayer({ population: { peasants: 10_000_000, unrest: 0 } })
    const probability = calculateEventProbability(plague, colossal, FED)
    expect(probability).toBeLessThanOrEqual(plague.maxProbability)
  })
})

describe('mitigation', () => {
  it('a hospital measurably reduces plague frequency', () => {
    const exposed = makePlayer({ population: { peasants: 8000, unrest: 0 } })
    const protectedPlayer = makePlayer({
      population: { peasants: 8000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 1, well: 0, granary: 0, garrison: 0 }
    })

    const withoutHospital = monteCarlo(exposed, FED, 500).rate('plague')
    const withHospital = monteCarlo(protectedPlayer, FED, 500).rate('plague')

    expect(withHospital).toBeLessThan(withoutHospital)
  })

  it('a garrison measurably reduces banditry frequency', () => {
    const rich = makePlayer({ taler: 150000 })
    const guarded = makePlayer({
      taler: 150000,
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 1 }
    })

    expect(monteCarlo(guarded, FED, 500).rate('banditry'))
      .toBeLessThan(monteCarlo(rich, FED, 500).rate('banditry'))
  })

  it('a granary measurably reduces famine frequency during a shortage', () => {
    const starving: ExposureContext = { feedAdequacy: 0.4 }
    const unprepared = makePlayer()
    const prepared = makePlayer({
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 1, garrison: 0 }
    })

    expect(monteCarlo(prepared, starving, 500).rate('famine'))
      .toBeLessThan(monteCarlo(unprepared, starving, 500).rate('famine'))
  })

  it('mitigation blunts severity as well as frequency — expected population loss drops sharply', () => {
    const exposed = makePlayer({ population: { peasants: 8000, unrest: 0 } })
    const protectedPlayer = makePlayer({
      population: { peasants: 8000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 1, well: 0, granary: 0, garrison: 0 }
    })

    expect(monteCarlo(protectedPlayer, FED, 500).totalPopulationLoss)
      .toBeLessThan(monteCarlo(exposed, FED, 500).totalPopulationLoss)
  })

  it('mitigation NEVER eliminates risk — a fully protected, thriving ruler still suffers events', () => {
    const fortified = makePlayer({
      taler: 200000,
      population: { peasants: 20000, unrest: 0 },
      buildings: { markets: 10, mills: 8, palace: 0, cathedral: 0, hospital: 1, well: 1, granary: 1, garrison: 1 }
    })

    const runs = monteCarlo(fortified, FED, 800)
    const totalEvents = Object.values(runs.counts).reduce((a, b) => a + b, 0)
    expect(totalEvents).toBeGreaterThan(0)
  })

  it('every event in the catalog keeps a nonzero floor once exposed, even fully mitigated', () => {
    for (const event of getEventCatalog()) {
      if (event.category !== 'prosperity') continue // condition events legitimately reach zero when well-governed
      const fortified = makePlayer({
        taler: 200000,
        population: { peasants: 20000, unrest: 0 },
        buildings: { markets: 10, mills: 8, palace: 0, cathedral: 0, hospital: 1, well: 1, granary: 1, garrison: 1 }
      })
      expect(calculateEventProbability(event, fortified, FED)).toBeGreaterThan(0)
    }
  })
})

describe('condition-driven events', () => {
  it('famine compounds an existing shortage rather than rolling independently', () => {
    const player = makePlayer()

    const wellFed = monteCarlo(player, { feedAdequacy: 1.0 }, 400).rate('famine')
    const slightlyShort = monteCarlo(player, { feedAdequacy: 0.8 }, 400).rate('famine')
    const severelyShort = monteCarlo(player, { feedAdequacy: 0.3 }, 400).rate('famine')

    expect(wellFed).toBe(0)
    expect(slightlyShort).toBeGreaterThan(0)
    expect(severelyShort).toBeGreaterThan(slightlyShort)
  })

  it('a well-governed principality never suffers a peasant revolt', () => {
    const content = makePlayer({ population: { peasants: 5000, unrest: 0 } })
    expect(monteCarlo(content, FED, 400).rate('revolt')).toBe(0)
  })

  it('revolt risk rises with unrest', () => {
    const revolt = findEvent('revolt')
    const unrestLevels = [0, 25, 50, 75, 100]
    const probabilities = unrestLevels.map((unrest) =>
      calculateEventProbability(revolt, makePlayer({ population: { peasants: 5000, unrest } }), FED)
    )

    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeGreaterThanOrEqual(probabilities[i - 1])
    }
    expect(probabilities[0]).toBe(0)
    expect(probabilities[probabilities.length - 1]).toBeGreaterThan(0)
  })
})

describe('event resolution mechanics', () => {
  it('no event fires twice for the same player in one year', () => {
    // Maximum exposure across every driver simultaneously.
    const doomed = makePlayer({
      taler: 500000,
      population: { peasants: 50000, unrest: 100 },
      buildings: { markets: 20, mills: 20, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    for (let seed = 1; seed <= 300; seed++) {
      const subject = JSON.parse(JSON.stringify(doomed)) as PlayerState
      const result = resolveEvents(subject, { feedAdequacy: 0 }, new SeededRng(seed))
      const seen = new Set<string>()
      for (const event of result.events) {
        expect(seen.has(event.type)).toBe(false)
        seen.add(event.type)
      }
    }
  })

  it('every fired event carries telegraph text explaining why it happened', () => {
    const doomed = makePlayer({
      taler: 500000,
      population: { peasants: 50000, unrest: 100 },
      buildings: { markets: 20, mills: 20, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    let sawAnyEvent = false
    for (let seed = 1; seed <= 100; seed++) {
      const subject = JSON.parse(JSON.stringify(doomed)) as PlayerState
      const result = resolveEvents(subject, { feedAdequacy: 0 }, new SeededRng(seed))
      for (const event of result.events) {
        sawAnyEvent = true
        expect(event.telegraphText.length).toBeGreaterThan(0)
        expect(event.lossType).toBeTruthy()
      }
    }
    expect(sawAnyEvent).toBe(true)
  })

  it('losses never drive a player below zero in any resource', () => {
    const fragile = makePlayer({
      taler: 100,
      population: { peasants: 20, unrest: 100 },
      buildings: { markets: 1, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    for (let seed = 1; seed <= 300; seed++) {
      const subject = JSON.parse(JSON.stringify(fragile)) as PlayerState
      resolveEvents(subject, { feedAdequacy: 0 }, new SeededRng(seed))
      expect(subject.taler).toBeGreaterThanOrEqual(0)
      expect(subject.population.peasants).toBeGreaterThanOrEqual(0)
      expect(subject.buildings.markets).toBeGreaterThanOrEqual(0)
      expect(subject.buildings.mills).toBeGreaterThanOrEqual(0)
    }
  })

  it('fire destroys production buildings but never the palace or cathedral', () => {
    const built = makePlayer({
      buildings: { markets: 10, mills: 10, palace: 12, cathedral: 1, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    for (let seed = 1; seed <= 300; seed++) {
      const subject = JSON.parse(JSON.stringify(built)) as PlayerState
      resolveEvents(subject, FED, new SeededRng(seed))
      expect(subject.buildings.palace).toBe(12)
      expect(subject.buildings.cathedral).toBe(1)
    }
  })

  it('is deterministic — the same seed and state produce identical results', () => {
    const player = makePlayer({
      taler: 100000,
      population: { peasants: 12000, unrest: 60 },
      buildings: { markets: 5, mills: 5, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 }
    })

    const runA = resolveEvents(JSON.parse(JSON.stringify(player)), { feedAdequacy: 0.5 }, new SeededRng(99))
    const runB = resolveEvents(JSON.parse(JSON.stringify(player)), { feedAdequacy: 0.5 }, new SeededRng(99))
    expect(JSON.stringify(runA)).toBe(JSON.stringify(runB))
  })

  it('consumes a fixed number of RNG draws regardless of outcome, so A/B comparisons stay aligned', () => {
    // Two players differing ONLY in hospital ownership should leave the RNG at the
    // same stream position — this is what lets Phase 6 attribute a balance change
    // to the knob it actually moved rather than to stream desync.
    const base = makePlayer({ population: { peasants: 8000, unrest: 0 } })
    const withHospital = makePlayer({
      population: { peasants: 8000, unrest: 0 },
      buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 1, well: 0, granary: 0, garrison: 0 }
    })

    const rngA = new SeededRng(123)
    const rngB = new SeededRng(123)
    resolveEvents(base, FED, rngA)
    resolveEvents(withHospital, FED, rngB)

    expect(rngA.getSeed()).toBe(rngB.getSeed())
  })
})
