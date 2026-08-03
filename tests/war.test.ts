import { describe, it, expect } from 'vitest'
import {
  warStrength, resolveWar, resolveAllianceRequests,
  warWinProbability, militaryMultiplier, applyMilitaryInvestment, militaryUpkeep,
  landTransferAmount, trucePairKey, isTruceActive, registerTruce
} from '../src/engine/war.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { runMatch, aiCompetitor } from '../src/ai/sim.ts'
import { planMilitaryInvestment, planWar } from '../src/ai/warAggression.ts'
import { getPersonality } from '../src/ai/personalities.ts'
import { advanceYear } from '../src/engine/year.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { cloneGameState, GameState, PlayerState, WarDecision } from '../src/engine/state.ts'
import economyData from '../data/economy.json'

const WARFARE = economyData.warfare

function makePlayer(o: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p', name: 'P', taler: 15000, land: { farmland: 10000, buildingLand: 0 }, grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false,
    ...o
  }
}

class CountingRng extends SeededRng {
  calls = 0

  override next(): number {
    this.calls++
    return super.next()
  }
}

describe('warStrength', () => {
  it('scales with garrison, guards, and population', () => {
    const bare = makePlayer()
    const garrisoned = makePlayer({ buildings: { ...bare.buildings, garrison: 1 } })
    const guarded = makePlayer({ guards: 10 })
    const populous = makePlayer({ population: { peasants: 5000, unrest: 0 } })

    expect(warStrength(garrisoned)).toBeGreaterThan(warStrength(bare))
    expect(warStrength(guarded)).toBeGreaterThan(warStrength(bare))
    expect(warStrength(populous)).toBeGreaterThan(warStrength(bare))
  })
})

describe('resolveWar', () => {
  it('draws the garrison destruction roll even when the loser has no garrison', () => {
    const strong = makePlayer({ id: 'strong', buildings: { ...makePlayer().buildings, garrison: 5 }, guards: 25 })
    const weakWithoutGarrison = makePlayer({ id: 'weak' })
    const weakWithGarrison = makePlayer({ id: 'weak', buildings: { ...makePlayer().buildings, garrison: 1 } })
    const rngWithoutGarrison = new CountingRng(3)
    const rngWithGarrison = new CountingRng(3)

    resolveWar(JSON.parse(JSON.stringify(strong)), weakWithoutGarrison, [], rngWithoutGarrison)
    resolveWar(JSON.parse(JSON.stringify(strong)), weakWithGarrison, [], rngWithGarrison)

    expect(rngWithoutGarrison.calls).toBe(rngWithGarrison.calls)
  })

  it('the winner takes land, reparations, and inflicts a garrison-destruction chance on the loser', () => {
    const rng = new SeededRng(1)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 3 }, guards: 20 })
    const weak = makePlayer({ id: 'weak' })

    const outcome = resolveWar(strong, weak, [], rng)
    expect(outcome.attackerWon).toBe(true) // overwhelmingly favored — deterministic at this strength gap

    const weakLand = weak.land.farmland + weak.land.buildingLand
    expect(weakLand).toBeLessThan(10000) // land was taken
    expect(strong.land.farmland + strong.land.buildingLand).toBeGreaterThan(10000)
    expect(weak.taler).toBeLessThan(15000) // reparations paid
    expect(strong.taler).toBeGreaterThan(15000)
  })

  it('both sides take casualties regardless of outcome — war is never free even in victory', () => {
    const rng = new SeededRng(7)
    const a = makePlayer({ id: 'a', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 2 } })
    const b = makePlayer({ id: 'b' })

    const outcome = resolveWar(a, b, [], rng)

    // Asserted on the casualty figures rather than on net population, because the
    // winner ALSO annexes the loser's subjects and so can finish a war with more
    // peasants than it started with. The cost is still real and still paid.
    expect(outcome.attackerCasualties).toBeGreaterThan(0)
    expect(outcome.defenderCasualties).toBeGreaterThan(0)
  })

  it('the loser always takes a heavier casualty share than the winner', () => {
    const rng = new SeededRng(3)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 25 })
    const weak = makePlayer({ id: 'weak' })

    const outcome = resolveWar(strong, weak, [], rng)
    expect(outcome.attackerWon).toBe(true)
    expect(outcome.defenderCasualties).toBeGreaterThan(outcome.attackerCasualties)
  })

  it('population transfer is floored like casualties — both sides keep integer peasants', () => {
    const rng = new SeededRng(3)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 25 })
    const weak = makePlayer({ id: 'weak', population: { peasants: 1001, unrest: 0 } })

    resolveWar(strong, weak, [], rng)

    expect(Number.isInteger(strong.population.peasants)).toBe(true)
    expect(Number.isInteger(weak.population.peasants)).toBe(true)
  })

  it('conquered territory carries its people — the winner annexes subjects, the loser forfeits them', () => {
    const rng = new SeededRng(3)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 25 })
    const weak = makePlayer({ id: 'weak' })
    const startingStrong = strong.population.peasants
    const startingWeak = weak.population.peasants

    const outcome = resolveWar(strong, weak, [], rng)
    expect(outcome.attackerWon).toBe(true)
    expect(outcome.populationTransferred).toBeGreaterThan(0)

    // This is the point of the mechanic: population gates every senior rank, so a
    // war that only moved land would trade the binding resource for an inert one
    // (BACKLOG D3 — realms already hold ~2x the land they can work).
    expect(strong.population.peasants).toBeGreaterThan(startingStrong)
    expect(weak.population.peasants).toBeLessThan(startingWeak)
  })

  it('population is conserved across a war, net of casualties', () => {
    const rng = new SeededRng(3)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 25 })
    const weak = makePlayer({ id: 'weak' })
    const before = strong.population.peasants + weak.population.peasants

    const outcome = resolveWar(strong, weak, [], rng)
    const after = strong.population.peasants + weak.population.peasants

    // Annexation moves people; it must not create or destroy them. The only
    // legitimate shortfall is the casualties both sides actually took.
    const casualties = outcome.attackerCasualties + outcome.defenderCasualties
    expect(after).toBeCloseTo(before - casualties, 6)
  })

  it('land transfer never exceeds maxLandTransferShare of the loser\'s holdings', () => {
    const rng = new SeededRng(11)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 10 }, guards: 25 })
    const weak = makePlayer({ id: 'weak', land: { farmland: 1000, buildingLand: 0 } })

    resolveWar(strong, weak, [], rng)
    // Even fully favored, the loser should retain at least half their land in one war.
    expect(weak.land.farmland).toBeGreaterThanOrEqual(500 - 1e-6)
  })

  // Allies fight FOR the attacker: this is a coalition against a strong rival, not
  // a defensive pact. An earlier version of this test asserted the opposite and so
  // locked in a genuine bug — an AI requesting allies was arming its own target,
  // and measured attacker win rate sat at 38.9% against a 55% declaration floor.
  it('allied strength joins the attacker, improving the odds of a coalition war', () => {
    const attacker = makePlayer({ id: 'attacker', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 2 }, guards: 5 })
    const defender = makePlayer({ id: 'defender' })
    const ally = makePlayer({ id: 'ally', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 20 })

    const outcomeAlone = resolveWar(
      JSON.parse(JSON.stringify(attacker)), JSON.parse(JSON.stringify(defender)), [], new SeededRng(5)
    )
    const outcomeAllied = resolveWar(
      JSON.parse(JSON.stringify(attacker)), JSON.parse(JSON.stringify(defender)), [ally], new SeededRng(5)
    )
    expect(outcomeAllied.attackerStrength).toBeGreaterThan(outcomeAlone.attackerStrength)
    expect(outcomeAllied.defenderStrength).toBe(outcomeAlone.defenderStrength)
  })
})

describe('landTransferAmount', () => {
  it('uses the transfer fraction while it is below the safety ceiling', () => {
    expect(landTransferAmount(1000, 0.08, 0.5)).toBe(80)
  })

  it('caps the transfer when the fraction exceeds the safety ceiling', () => {
    expect(landTransferAmount(1000, 0.6, 0.5)).toBe(500)
  })
})

describe('resolveAllianceRequests', () => {
  it('never lets the attacker or defender join as an ally of themselves', () => {
    const attacker = makePlayer({ id: 'attacker' })
    const defender = makePlayer({ id: 'defender' })
    const rng = new SeededRng(1)

    const joined = resolveAllianceRequests([attacker, defender], attacker, defender, rng)
    expect(joined).toHaveLength(0)
  })

  it('an ally is more likely to join against a defender stronger than itself', () => {
    const attacker = makePlayer({ id: 'attacker' })
    const strongDefender = makePlayer({ id: 'defender', taler: 500000, population: { peasants: 50000, unrest: 0 } })
    const weakAlly = makePlayer({ id: 'ally', taler: 100 })

    let joinsAgainstStrong = 0
    let joinsAgainstWeak = 0
    const weakDefender = makePlayer({ id: 'defender', taler: 10 })
    for (let seed = 0; seed < 500; seed++) {
      if (resolveAllianceRequests([weakAlly], attacker, strongDefender, new SeededRng(seed)).length > 0) joinsAgainstStrong++
      if (resolveAllianceRequests([weakAlly], attacker, weakDefender, new SeededRng(seed)).length > 0) joinsAgainstWeak++
    }
    expect(joinsAgainstStrong).toBeGreaterThan(joinsAgainstWeak)
  })
})

// --- Phase 18C: training, equipment, and the defender's advantage ---

describe('militaryMultiplier and warStrength scaling', () => {
  it('training and equipment multiply the base strength rather than adding to it', () => {
    const bare = makePlayer({ buildings: { ...makePlayer().buildings, garrison: 1 }, guards: 10 })
    const trained = makePlayer({ ...bare, trainingLevel: 2 })

    const expected = 1 + 2 * WARFARE.trainingStrengthBonusPerLevel
    expect(militaryMultiplier(trained)).toBeCloseTo(expected, 10)
    expect(warStrength(trained)).toBeCloseTo(warStrength(bare) * expected, 10)
  })

  it('the multiplier is scale-invariant — the same investment is worth the same proportion at any realm size', () => {
    const smallBare = makePlayer({ population: { peasants: 1000, unrest: 0 } })
    const largeBare = makePlayer({ population: { peasants: 20000, unrest: 0 } })
    const smallInvested = makePlayer({ ...smallBare, trainingLevel: 3, equipmentLevel: 2 })
    const largeInvested = makePlayer({ ...largeBare, trainingLevel: 3, equipmentLevel: 2 })

    expect(warStrength(smallInvested) / warStrength(smallBare))
      .toBeCloseTo(warStrength(largeInvested) / warStrength(largeBare), 10)
  })

  it('an absent level is treated as zero, so pre-Phase-18C states keep working', () => {
    expect(militaryMultiplier(makePlayer())).toBe(1)
  })
})

describe('warWinProbability', () => {
  it('favours the defender at equal strength — holding ground is worth something', () => {
    expect(warWinProbability(20, 20)).toBeLessThan(0.5)
  })

  it('weights the defender by defenderAdvantageMultiplier, distinctly from the flat base constant', () => {
    // Written out longhand deliberately: if the formula in war.ts is edited,
    // this fails rather than silently agreeing with whatever it now says.
    const expected = 30 / (30 + 20 * WARFARE.defenderAdvantageMultiplier + WARFARE.baseDefenceConstant)
    expect(warWinProbability(30, 20)).toBeCloseTo(expected, 10)
  })

  it('resolveWar rolls against exactly this probability — the AI and UI cannot drift from the engine', () => {
    // p is computed independently here, then bracketed: a war is won at a seed
    // whose first roll is below p and lost at one above it.
    const attacker = makePlayer({ id: 'a', guards: 25, buildings: { ...makePlayer().buildings, garrison: 3 } })
    const defender = makePlayer({ id: 'd' })
    const p = warWinProbability(warStrength(attacker), warStrength(defender))

    let wins = 0
    const trials = 400
    for (let seed = 0; seed < trials; seed++) {
      const a = makePlayer({ id: 'a', guards: 25, buildings: { ...makePlayer().buildings, garrison: 3 } })
      const d = makePlayer({ id: 'd' })
      if (resolveWar(a, d, [], new SeededRng(seed)).attackerWon) wins++
    }
    expect(wins / trials).toBeCloseTo(p, 1)
  })

  it('a fully-invested attacker can overcome the defender advantage against an uninvested equal', () => {
    const base = makePlayer({ buildings: { ...makePlayer().buildings, garrison: 1 }, guards: 10 })
    const invested = makePlayer({
      ...base,
      trainingLevel: WARFARE.maxTrainingLevel,
      equipmentLevel: WARFARE.maxEquipmentLevel
    })

    expect(warWinProbability(warStrength(base), warStrength(base))).toBeLessThan(0.5)
    expect(warWinProbability(warStrength(invested), warStrength(base))).toBeGreaterThan(0.55)
  })

  it('mutual escalation converges back toward the defender — an arms race does not make war cheap', () => {
    const bare = makePlayer({ buildings: { ...makePlayer().buildings, garrison: 1 }, guards: 10 })
    const maxed = makePlayer({
      ...bare,
      trainingLevel: WARFARE.maxTrainingLevel,
      equipmentLevel: WARFARE.maxEquipmentLevel
    })

    const oneSided = warWinProbability(warStrength(maxed), warStrength(bare))
    const bothMaxed = warWinProbability(warStrength(maxed), warStrength(maxed))
    expect(bothMaxed).toBeLessThan(oneSided)
    expect(bothMaxed).toBeCloseTo(warWinProbability(warStrength(bare), warStrength(bare)), 1)
  })
})

describe('applyMilitaryInvestment', () => {
  it('buys the requested levels and deducts the cost', () => {
    const p = makePlayer({ taler: 20000 })
    const result = applyMilitaryInvestment(p, 2, 1)

    expect(result.trainingBought).toBe(2)
    expect(result.equipmentBought).toBe(1)
    expect(p.trainingLevel).toBe(2)
    expect(p.equipmentLevel).toBe(1)
    expect(result.spent).toBe(2 * WARFARE.trainingCostPerLevel + WARFARE.equipmentCostPerLevel)
    expect(p.taler).toBe(20000 - result.spent)
  })

  it('clamps to what the treasury can afford rather than going negative', () => {
    const p = makePlayer({ taler: WARFARE.trainingCostPerLevel })
    applyMilitaryInvestment(p, 5, 5)

    expect(p.trainingLevel).toBe(1)
    expect(p.equipmentLevel).toBe(0)
    expect(p.taler).toBe(0)
  })

  it('clamps to the per-track level cap', () => {
    const p = makePlayer({ taler: 1000000, trainingLevel: WARFARE.maxTrainingLevel - 1 })
    applyMilitaryInvestment(p, 99, 99)

    expect(p.trainingLevel).toBe(WARFARE.maxTrainingLevel)
    expect(p.equipmentLevel).toBe(WARFARE.maxEquipmentLevel)
  })

  it('degrades a NaN order to buying nothing instead of poisoning the running total', () => {
    const p = makePlayer({ taler: 20000 })
    applyMilitaryInvestment(p, NaN, NaN)

    expect(p.trainingLevel).toBe(0)
    expect(p.equipmentLevel).toBe(0)
    expect(p.taler).toBe(20000)
  })
})

describe('planMilitaryInvestment', () => {
  it('subtracts prior land spend before buying training levels', () => {
    const landSpend = 30
    const state: GameState = {
      year: 1500,
      players: {
        ai: makePlayer({
          id: 'ai',
          taler: 8000 + landSpend + WARFARE.trainingCostPerLevel - 1
        }),
        rival: makePlayer({ id: 'rival' })
      },
      activePlayerIds: ['ai', 'rival'],
      kaizerTradePrices: { corn: 3.2, farmland: 30, buildingLand: 50 }
    }

    const investment = planMilitaryInvestment(
      state,
      'ai',
      { aggression: 1, preferredMode: 'raid', leaderFocus: 0 },
      landSpend
    )

    expect(investment.trainingInvest).toBe(0)
  })
})

describe('militaryUpkeep', () => {
  it('charges per level on both tracks, so an unused army is a permanent drain', () => {
    const p = makePlayer({ trainingLevel: 2, equipmentLevel: 3 })
    expect(militaryUpkeep(p)).toBe(
      2 * WARFARE.trainingUpkeepPerLevelPerYear + 3 * WARFARE.equipmentUpkeepPerLevelPerYear
    )
  })

  it('costs nothing when nothing is invested', () => {
    expect(militaryUpkeep(makePlayer())).toBe(0)
  })
})

// Guards the failure the balance gate could NOT see. Phase 18C's first cut let
// only aggressive archetypes buy training/equipment, so the Schemer and Raider
// reached 5/5 while everyone else sat at 0/0 — a declaration was favourable
// every single year and war fired ~84 times per 60-year match, up from
// essentially zero. All five balance-gate criteria still PASSED through that,
// because the gate scores the shape of the economy rather than whether a
// mechanic has turned into spam. Both failure modes are real regressions, so
// both ends are asserted here.
describe('war frequency stays in a playable band (regression guard)', () => {
  it('fires often enough to be live content, but not every year', () => {
    const MATCHES = 6
    const MAX_YEARS = 60
    let wars = 0
    let matchesWithWar = 0

    for (let i = 0; i < MATCHES; i++) {
      const competitors = [
        aiCompetitor('builder', 'builder'),
        aiCompetitor('expansionist', 'expansionist'),
        aiCompetitor('merchant', 'merchant'),
        aiCompetitor('schemer', 'schemer'),
        aiCompetitor('raider', 'raider')
      ]
      let warsHere = 0
      runMatch(competitors, 4242 + i * 7717, MAX_YEARS, (_s, chronicle) => {
        warsHere += chronicle.wars.length
      })
      wars += warsHere
      if (warsHere > 0) matchesWithWar++
    }

    const perMatch = wars / MATCHES
    // Floor: war must not go back to being dead content, which is what
    // economy.json's _warfareTuningNote records as the original F4 failure.
    expect(matchesWithWar).toBeGreaterThan(0)
    expect(perMatch).toBeGreaterThan(1)
    // Ceiling: five rulers over sixty years should not fight a war a year
    // between them. Generous — the observed figure is ~6.5 — so this catches a
    // structural break, not ordinary tuning drift.
    expect(perMatch).toBeLessThan(30)
  })

  it('never re-fights the same pair inside the truce window', () => {
    const MATCHES = 6
    const MAX_YEARS = 60
    const truceYears = WARFARE.truceYears
    const violations: string[] = []

    for (let i = 0; i < MATCHES; i++) {
      const competitors = [
        aiCompetitor('builder', 'builder'),
        aiCompetitor('expansionist', 'expansionist'),
        aiCompetitor('merchant', 'merchant'),
        aiCompetitor('schemer', 'schemer'),
        aiCompetitor('raider', 'raider')
      ]
      const lastWarYear = new Map<string, number>()
      runMatch(competitors, 4242 + i * 7717, MAX_YEARS, (state, chronicle) => {
        // Chronicle.year is the year that just completed (state.year after advance).
        const warYear = state.year - 1
        for (const war of chronicle.wars) {
          const key = trucePairKey(war.attackerId, war.defenderId)
          const prev = lastWarYear.get(key)
          if (prev !== undefined && warYear - prev < truceYears) {
            violations.push(`${key} at ${warYear} after ${prev}`)
          }
          lastWarYear.set(key, warYear)
        }
      })
    }

    expect(violations).toEqual([])
  })
})

describe('truces and war weariness (Phase 19A)', () => {
  it('pair key is order-independent', () => {
    expect(trucePairKey('a', 'b')).toBe(trucePairKey('b', 'a'))
    expect(trucePairKey('a', 'b')).not.toBe(trucePairKey('a', 'c'))
  })

  it('registerTruce / isTruceActive honour the window', () => {
    const truces: Record<string, number> = {}
    registerTruce(truces, 'a', 'b', 10, 5)
    expect(isTruceActive(truces, 'a', 'b', 11)).toBe(true)
    expect(isTruceActive(truces, 'b', 'a', 14)).toBe(true)
    expect(isTruceActive(truces, 'a', 'b', 15)).toBe(false)
    expect(isTruceActive(truces, 'a', 'c', 11)).toBe(false)
  })

  it('blocks a repeat declaration while a truce is live', () => {
    let state = createStarterState([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' }
    ])
    // Make A overwhelmingly favoured so the war actually fires.
    state.players.a.buildings.garrison = 5
    state.players.a.guards = 40
    state.players.a.population.peasants = 8000
    state.players.b.population.peasants = 800

    const war: WarDecision = { type: 'war', declare: true, targetPlayerId: 'b' }
    const first = advanceYear(state, { a: [war], b: [] }, 7)
    expect(first.chronicle.wars).toHaveLength(1)
    state = first.state
    expect(isTruceActive(state.truces ?? {}, 'a', 'b', state.year)).toBe(true)

    const second = advanceYear(state, { a: [war], b: [] }, 8)
    expect(second.chronicle.wars).toHaveLength(0)
  })

  it('accumulates weariness on both sides and decays in peacetime', () => {
    let state = createStarterState([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' }
    ])
    state.players.a.buildings.garrison = 5
    state.players.a.guards = 40
    state.players.a.population.peasants = 8000
    state.players.b.population.peasants = 800

    const war: WarDecision = { type: 'war', declare: true, targetPlayerId: 'b' }
    state = advanceYear(state, { a: [war], b: [] }, 11).state
    expect(state.players.a.warWeariness ?? 0).toBe(WARFARE.wearinessPerWar)
    expect(state.players.b.warWeariness ?? 0).toBe(WARFARE.wearinessPerWar)

    const unrestBeforePeace = state.players.a.population.unrest
    state = advanceYear(state, { a: [], b: [] }, 12).state
    expect(state.players.a.warWeariness ?? 0).toBe(
      Math.max(0, WARFARE.wearinessPerWar - WARFARE.wearinessDecayPerYear)
    )
    // Weariness fed unrest during the peaceful year.
    expect(state.players.a.population.unrest).toBeGreaterThan(unrestBeforePeace)
  })

  it('cloneGameState deep-copies truces and keeps weariness', () => {
    const state = createStarterState([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' }
    ])
    state.truces = { [trucePairKey('a', 'b')]: 42 }
    state.players.a.warWeariness = 9
    const clone = cloneGameState(state)
    clone.truces![trucePairKey('a', 'b')] = 99
    clone.players.a.warWeariness = 1
    expect(state.truces![trucePairKey('a', 'b')]).toBe(42)
    expect(state.players.a.warWeariness).toBe(9)
  })

  it('planWar skips a truce-bound target', () => {
    const state = createStarterState([
      { id: 'self', name: 'Self' },
      { id: 'rival', name: 'Rival' }
    ])
    state.players.self.buildings.garrison = 8
    state.players.self.guards = 50
    state.players.self.population.peasants = 12000
    state.players.rival.population.peasants = 500
    state.truces = { [trucePairKey('self', 'rival')]: state.year + 5 }

    const raider = getPersonality('raider')
    const decision = planWar(state, 'self', raider.aggression, raider.weights)
    expect(decision.declare).toBe(false)
  })
})
