import { describe, it, expect } from 'vitest'
import { warStrength, resolveWar, resolveAllianceRequests } from '../src/engine/war.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState } from '../src/engine/state.ts'

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
    const startingA = a.population.peasants
    const startingB = b.population.peasants

    resolveWar(a, b, [], rng)

    expect(a.population.peasants).toBeLessThan(startingA)
    expect(b.population.peasants).toBeLessThan(startingB)
  })

  it('the loser always takes a heavier casualty share than the winner', () => {
    const rng = new SeededRng(3)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 25 })
    const weak = makePlayer({ id: 'weak' })
    const startingWeak = weak.population.peasants
    const startingStrong = strong.population.peasants

    const outcome = resolveWar(strong, weak, [], rng)
    expect(outcome.attackerWon).toBe(true)

    const strongLossFraction = (startingStrong - strong.population.peasants) / startingStrong
    const weakLossFraction = (startingWeak - weak.population.peasants) / startingWeak
    expect(weakLossFraction).toBeGreaterThan(strongLossFraction)
  })

  it('land transfer never exceeds maxLandTransferShare of the loser\'s holdings', () => {
    const rng = new SeededRng(11)
    const strong = makePlayer({ id: 'strong', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 10 }, guards: 25 })
    const weak = makePlayer({ id: 'weak', land: { farmland: 1000, buildingLand: 0 } })

    resolveWar(strong, weak, [], rng)
    // Even fully favored, the loser should retain at least half their land in one war.
    expect(weak.land.farmland).toBeGreaterThanOrEqual(500 - 1e-6)
  })

  it('allied strength contributes to the defender\'s side, making an alliance harder to beat', () => {
    const attacker = makePlayer({ id: 'attacker', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 2 }, guards: 5 })
    const defender = makePlayer({ id: 'defender' })
    const ally = makePlayer({ id: 'ally', buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 5 }, guards: 20 })

    const outcomeAlone = resolveWar(
      { ...JSON.parse(JSON.stringify(attacker)) }, { ...JSON.parse(JSON.stringify(defender)) }, [], new SeededRng(5)
    )
    const outcomeAllied = resolveWar(
      { ...JSON.parse(JSON.stringify(attacker)) }, { ...JSON.parse(JSON.stringify(defender)) }, [ally], new SeededRng(5)
    )
    expect(outcomeAllied.defenderStrength).toBeGreaterThan(outcomeAlone.defenderStrength)
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
