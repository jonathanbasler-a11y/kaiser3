import { describe, it, expect } from 'vitest'
import { intrinsicUtility, expectedAnnualEventCost, evaluateState, projectedFeedAdequacy } from '../src/ai/evaluator.ts'
import { getPersonality, getPersonalities, validatePersonalities, Personality } from '../src/ai/personalities.ts'
import { planYear, generateCandidates } from '../src/ai/planner.ts'
import { aiCompetitor, runMatch, runTournament, compareStanding, Competitor } from '../src/ai/sim.ts'
import { rankProgress, getNextRank, getTopRank } from '../src/engine/ranks.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { PlayerState, GameState } from '../src/engine/state.ts'

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1', name: 'Test', taler: 15000,
    land: { farmland: 10000, buildingLand: 0 },
    grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, dead: false,
    ...overrides
  }
}

const BUILDER = getPersonality('builder')
const FED = { feedAdequacy: 1 }

describe('personalities', () => {
  it('the shipped catalog validates', () => {
    expect(() => validatePersonalities()).not.toThrow()
  })

  it('rejects a personality missing a weight', () => {
    const bad = [{ ...BUILDER, weights: { ...BUILDER.weights, risk: undefined } }] as unknown as Personality[]
    expect(() => validatePersonalities(bad)).toThrow(/missing a finite weight/)
  })

  it('rejects a riskHorizonYears below 1, which would blind the AI to insurance', () => {
    const bad = [{ ...BUILDER, weights: { ...BUILDER.weights, riskHorizonYears: 0 } }]
    expect(() => validatePersonalities(bad)).toThrow(/riskHorizonYears/)
  })

  it('weights rank far above raw treasury, matching the actual victory condition', () => {
    // Regression guard. An early build valued a whole rank at 25,000 while a
    // typical late-game treasury reached 431,000 — so the AI hoarded cash and
    // never left rank 0. Rank must dominate.
    for (const personality of getPersonalities()) {
      expect(personality.weights.rank).toBeGreaterThan(personality.weights.wealth * 500_000)
    }
  })
})

describe('rankProgress', () => {
  // Derived from data/ranks.json rather than hardcoded, so retuning the ladder
  // (as Phase 6 did) cannot silently rot these expectations into nonsense.
  const duke = getNextRank(0)!.requirements

  it('is the MINIMUM across requirements, so the binding constraint governs', () => {
    // Enormous wealth cannot compensate for a missing palace.
    const rich = makePlayer({
      taler: 10_000_000,
      population: { peasants: duke.populationMin, unrest: 0 }
    })
    expect(rankProgress(rich)).toBe(0)

    // Wealth and palace fully met, population at half its requirement — so the
    // binding constraint is population, and progress must equal exactly that.
    const halfPopulation = duke.populationMin / 2
    const balanced = makePlayer({
      taler: duke.wealthMin,
      population: { peasants: halfPopulation, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: duke.palaceStages ?? 0 }
    })
    expect(rankProgress(balanced)).toBeCloseTo(0.5, 5)
  })

  it('reaches 1 when every requirement is met, and stays 1 at the top rank', () => {
    const ready = makePlayer({
      taler: duke.wealthMin * 1.25,
      population: { peasants: duke.populationMin * 1.25, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: duke.palaceStages ?? 0 }
    })
    expect(rankProgress(ready)).toBe(1)
    expect(rankProgress(makePlayer({ rank: getTopRank() }))).toBe(1)
  })
})

describe('evaluator', () => {
  it('prefers more of a good thing, all else equal', () => {
    const poor = makePlayer({ taler: 10000 })
    const rich = makePlayer({ taler: 50000 })
    expect(intrinsicUtility(rich, BUILDER.weights)).toBeGreaterThan(intrinsicUtility(poor, BUILDER.weights))
  })

  it('penalises unrest', () => {
    const calm = makePlayer({ population: { peasants: 1000, unrest: 0 } })
    const angry = makePlayer({ population: { peasants: 1000, unrest: 80 } })
    expect(intrinsicUtility(angry, BUILDER.weights)).toBeLessThan(intrinsicUtility(calm, BUILDER.weights))
  })

  it('prices event risk above zero for an exposed ruler', () => {
    const exposed = makePlayer({ population: { peasants: 8000, unrest: 0 }, taler: 100000 })
    expect(expectedAnnualEventCost(exposed, FED, BUILDER.weights)).toBeGreaterThan(0)
  })

  it('values a hospital: it lowers expected risk for an exposed population', () => {
    // The decisive test for the risk model. Unmitigated plague costs more peasants
    // per year than natural growth adds, so an AI that cannot see this value never
    // insures, shrinks forever, and never reaches the higher ranks' thresholds.
    const exposed = makePlayer({ population: { peasants: 8000, unrest: 0 } })
    const insured = makePlayer({
      population: { peasants: 8000, unrest: 0 },
      buildings: { ...makePlayer().buildings, hospital: 1 }
    })

    expect(expectedAnnualEventCost(insured, FED, BUILDER.weights))
      .toBeLessThan(expectedAnnualEventCost(exposed, FED, BUILDER.weights))
  })

  it('prices a lost peasant far above the raw population weight when population is the binding rank constraint', () => {
    // This is what perturbation-based pricing buys us. Valuing losses with the raw
    // `population` weight alone understates them by orders of magnitude whenever
    // population gates the next rank.
    const player = makePlayer({
      taler: 100000,
      population: { peasants: 1000, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: 16 }
    })
    const oneFewer = makePlayer({
      taler: 100000,
      population: { peasants: 999, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: 16 }
    })

    const marginalValue = intrinsicUtility(player, BUILDER.weights) - intrinsicUtility(oneFewer, BUILDER.weights)
    expect(marginalValue).toBeGreaterThan(BUILDER.weights.population * 10)
  })

  it('projectedFeedAdequacy reports full security only when stores cover the population', () => {
    const stocked = makePlayer({ grainStock: 100000 })
    const empty = makePlayer({ grainStock: 0 })
    expect(projectedFeedAdequacy(stocked)).toBe(1)
    expect(projectedFeedAdequacy(empty)).toBe(0)
  })

  it('evaluateState subtracts risk from intrinsic value', () => {
    const exposed = makePlayer({ population: { peasants: 8000, unrest: 0 }, taler: 100000 })
    expect(evaluateState(exposed, FED, BUILDER.weights))
      .toBeLessThan(intrinsicUtility(exposed, BUILDER.weights))
  })
})

describe('planner', () => {
  function starterGame(): GameState {
    return createStarterState([{ id: 'ai', name: 'AI' }])
  }

  it('always emits a legal decision sheet', () => {
    const state = starterGame()
    const decisions = planYear(state, 'ai', BUILDER, 42)
    const result = validateDecisions(decisions)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('emits one decision per domain, espionage included', () => {
    const decisions = planYear(starterGame(), 'ai', BUILDER, 42)
    const types = decisions.map((d) => d.type).sort()
    expect(types).toEqual(['construction', 'espionage', 'grain', 'land_trade', 'tax'])
  })

  it('is deterministic for a given seed', () => {
    const a = planYear(starterGame(), 'ai', BUILDER, 7)
    const b = planYear(starterGame(), 'ai', BUILDER, 7)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('generates candidates that pair buying land with starting the palace', () => {
    // The palace needs 13,000 ha and a ruler starts with 10,000, so gating
    // construction on CURRENT land would make the rank path unreachable. Land
    // bought this year must be buildable on this year — as the engine allows.
    const state = starterGame()
    state.players['ai'].taler = 500000
    const candidates = generateCandidates(state.players['ai'], state.kaizerTradePrices)

    const buysLandAndBuildsPalace = candidates.some((sheet) => {
      const land = sheet.find((d) => d.type === 'land_trade')
      const construction = sheet.find((d) => d.type === 'construction')
      if (land?.type !== 'land_trade' || construction?.type !== 'construction') return false
      return land.farmlanbuy + land.buildingLandBuy > 0 && construction.palaceStages > 0
    })

    expect(buysLandAndBuildsPalace).toBe(true)
  })

  it('every generated candidate is legal', () => {
    const state = starterGame()
    state.players['ai'].taler = 300000
    for (const candidate of generateCandidates(state.players['ai'], state.kaizerTradePrices)) {
      expect(validateDecisions(candidate).valid).toBe(true)
    }
  })
})

describe('compareStanding', () => {
  it('ranks a Duke above a far richer Baron', () => {
    // Regression guard for the win condition itself. A weighted-sum version let a
    // random bot with 2.4M Taler, rank 0 and a collapsing population of 229 beat
    // an actual Duke — the wrong answer for a game about being crowned Kaiser.
    const duke = makePlayer({ rank: 1, taler: 20000, population: { peasants: 2000, unrest: 0 } })
    const richBaron = makePlayer({ rank: 0, taler: 5_000_000, population: { peasants: 229, unrest: 0 } })
    expect(compareStanding(duke, richBaron)).toBeGreaterThan(0)
  })

  it('breaks ties on progress toward the next rank before material wealth', () => {
    const closer = makePlayer({
      rank: 0, taler: 20000, population: { peasants: 2000, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: 3 }
    })
    const richerButBehind = makePlayer({
      rank: 0, taler: 900000, population: { peasants: 2000, unrest: 0 },
      buildings: { ...makePlayer().buildings, palace: 1 }
    })
    expect(compareStanding(closer, richerButBehind)).toBeGreaterThan(0)
  })

  it('falls back to material wealth when rank and progress match', () => {
    const poorer = makePlayer({ taler: 10000 })
    const richer = makePlayer({ taler: 19000 })
    expect(compareStanding(richer, poorer)).toBeGreaterThan(0)
  })
})

describe('AI benchmarks (PLAN.md Phase 5 acceptance criteria)', () => {
  // Everything here is seeded and deterministic, so these are exact, not flaky.
  const MATCHES = 12
  const YEARS = 40

  for (const personality of getPersonalities()) {
    it(`${personality.name} beats a random-legal bot in at least 90% of matches`, () => {
      const competitors: Competitor[] = [
        aiCompetitor('ai', personality.id),
        { id: 'bot', name: 'Random Bot', controller: { kind: 'random' } }
      ]
      const tournament = runTournament(competitors, MATCHES, YEARS)
      expect(tournament.winRate('ai')).toBeGreaterThanOrEqual(0.9)
    })
  }

  it('never emits an illegal decision across full matches', () => {
    let audited = 0
    for (const personality of getPersonalities()) {
      const result = runMatch(
        [aiCompetitor('ai', personality.id), { id: 'bot', name: 'Bot', controller: { kind: 'random' } }],
        900,
        YEARS
      )
      for (const entry of result.allDecisions) {
        if (entry.playerId !== 'ai') continue
        audited++
        expect(validateDecisions(entry.decisions).errors).toEqual([])
      }
    }
    expect(audited).toBeGreaterThan(50)
  })

  it('produces measurably distinct archetype profiles', () => {
    const profile = (id: string) => {
      const result = runMatch([aiCompetitor('ai', id)], 500, YEARS)
      const p = result.finalState.players['ai']
      return {
        taler: p.taler,
        population: p.population.peasants,
        palace: p.buildings.palace
      }
    }

    const builder = profile('builder')
    const expansionist = profile('expansionist')
    const merchant = profile('merchant')

    // The Merchant converts everything into liquidity and skips the monuments.
    expect(merchant.taler).toBeGreaterThan(builder.taler)
    expect(merchant.taler).toBeGreaterThan(expansionist.taler)
    expect(merchant.palace).toBeLessThan(builder.palace)
    expect(merchant.palace).toBeLessThan(expansionist.palace)

    // The Expansionist grows the largest population — its defining trait.
    expect(expansionist.population).toBeGreaterThan(builder.population)
    expect(expansionist.population).toBeGreaterThan(merchant.population)
  })

  it('grows its population rather than letting it collapse — the hospital is bought and works', () => {
    const result = runMatch([aiCompetitor('ai', 'builder')], 500, 60)
    const player = result.finalState.players['ai']
    expect(player.buildings.hospital).toBeGreaterThanOrEqual(1)
    expect(player.population.peasants).toBeGreaterThan(1000) // started at 1000
  })

  it('climbs the rank ladder over a long game', () => {
    // Proves the win condition is reachable and the AI actually pursues it.
    // How FAST it should climb is a balance question, deferred to Phase 6.
    const result = runMatch([aiCompetitor('ai', 'builder')], 500, 120)
    expect(result.finalState.players['ai'].rank).toBeGreaterThanOrEqual(2)
  })
})
