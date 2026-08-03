import { describe, it, expect } from 'vitest'
import {
  warStrength, resolveWar, resolveAllianceRequests,
  warWinProbability, militaryMultiplier, applyMilitaryInvestment, militaryUpkeep
} from '../src/engine/war.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { runMatch, aiCompetitor } from '../src/ai/sim.ts'
import { PlayerState } from '../src/engine/state.ts'
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
})
