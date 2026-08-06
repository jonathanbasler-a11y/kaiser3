// Phase 21.7 — economics wiring for guilds (D2, #49/#51).
//
// 21.6 built pure, uncalled logic. This tranche wires it in: calculateBuildingIncome
// / calculateUpkeepBreakdown (buildings.ts) now accept player.guilds, and
// destroyProductionBuildings (events.ts) / removeOneProductionBuilding (espionage.ts)
// prune player.guilds so it can never drift out of sync with what still stands.
//
// STILL byte-identical in every real game: nextGuildPetition/resolveGuildPetition
// have no caller in year.ts yet (that's 21.8), so player.guilds is empty for every
// player in every real match, and every function here degrades to its pre-21.7
// behaviour when guilds is absent/empty. tests/yearGolden.test.ts, golden.test.ts,
// and determinism.test.ts all pass unchanged with this file's changes in place —
// that is the actual proof; the tests below prove the WIRING is correct for the
// day guilds stop being empty, which the golden fixtures structurally cannot do
// since none of their fixtures currently hold one.

import { describe, it, expect } from 'vitest'
import buildingsData from '../data/buildings.json'
import { calculateBuildingIncome, calculateUpkeepBreakdown, calculateUpkeep } from '../src/engine/buildings.ts'
import { guildGrossBonusIncome, guildUpkeepSurcharge, pruneGuildsToFit } from '../src/engine/guilds.ts'
import { BuildingState, SpecializedBuilding, PlayerState } from '../src/engine/state.ts'
import { createStarterPlayer } from '../src/engine/starter.ts'
import { resolveEvents } from '../src/engine/events/events.ts'
import { resolveStrike } from '../src/engine/espionage.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { countBuildings } from '../src/engine/scarcity.ts'

const FED = { feedAdequacy: 1 }

const PRODUCTION = buildingsData.production

const emptyBuildings: BuildingState = {
  markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0
}

function starter(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...createStarterPlayer('p1', 'Test'), ...overrides }
}

describe('calculateBuildingIncome — guild bonus wiring', () => {
  it('is byte-identical to the pre-21.7 call when guilds is omitted entirely', () => {
    const buildings = { ...emptyBuildings, markets: 3, mills: 2 }
    const withGuildsOmitted = calculateBuildingIncome(buildings, 0)
    const withGuildsUndefined = calculateBuildingIncome(buildings, 0, undefined)
    const withGuildsEmpty = calculateBuildingIncome(buildings, 0, [])
    expect(withGuildsOmitted).toEqual(withGuildsUndefined)
    expect(withGuildsOmitted).toEqual(withGuildsEmpty)
    expect(withGuildsOmitted.guildBonusIncome).toBe(0)
  })

  it('a specialized market still earns its BASE income via marketIncome, plus the bonus separately', () => {
    const buildings = { ...emptyBuildings, markets: 3 }
    const guilds: SpecializedBuilding[] = [{ kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }]
    const income = calculateBuildingIncome(buildings, 0, guilds)

    // Base income counts ALL 3 markets, including the specialized one — it is
    // not removed from BuildingState's plain count (see SpecializedBuilding's
    // comment in state.ts).
    expect(income.marketIncome).toBe(3 * PRODUCTION.market.incomePerYear)
    expect(income.guildBonusIncome).toBeCloseTo(guildGrossBonusIncome('iron', PRODUCTION.market.incomePerYear), 6)
    expect(income.guildBonusIncome).toBeGreaterThan(0)
  })

  it('sums correctly across multiple guilds of different kinds and types', () => {
    const buildings = { ...emptyBuildings, markets: 3, mills: 2 }
    const guilds: SpecializedBuilding[] = [
      { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
      { kind: 'mill', specialization: 'iron', incomeMultiplier: 1.35 }
    ]
    const income = calculateBuildingIncome(buildings, 0, guilds)
    const expected =
      guildGrossBonusIncome('cloth', PRODUCTION.market.incomePerYear) +
      guildGrossBonusIncome('iron', PRODUCTION.mill.incomePerYear)
    expect(income.guildBonusIncome).toBeCloseTo(expected, 6)
  })
})

describe('calculateUpkeepBreakdown — guild surcharge wiring', () => {
  it('is byte-identical to the pre-21.7 call when guilds is omitted entirely', () => {
    const buildings = { ...emptyBuildings, markets: 3, mills: 2 }
    const withGuildsOmitted = calculateUpkeepBreakdown(buildings, 0, 10000)
    const withGuildsEmpty = calculateUpkeepBreakdown(buildings, 0, 10000, [])
    expect(withGuildsOmitted).toEqual(withGuildsEmpty)
    expect(withGuildsOmitted.guildSurcharge).toBe(0)
  })

  it('guildSurcharge is included in the total', () => {
    const buildings = { ...emptyBuildings, markets: 3 }
    const guilds: SpecializedBuilding[] = [{ kind: 'market', specialization: 'wine', incomeMultiplier: 1.5 }]
    const breakdown = calculateUpkeepBreakdown(buildings, 0, 10000, guilds)
    const expectedSurcharge = guildUpkeepSurcharge('wine', PRODUCTION.market.incomePerYear)

    expect(breakdown.guildSurcharge).toBeCloseTo(expectedSurcharge, 6)
    expect(breakdown.guildSurcharge).toBeGreaterThan(0)

    const withoutGuild = calculateUpkeepBreakdown(buildings, 0, 10000)
    expect(breakdown.total).toBeCloseTo(withoutGuild.total + expectedSurcharge, 6)
  })

  it('calculateUpkeep (the scalar wrapper) reflects the same guild surcharge', () => {
    const buildings = { ...emptyBuildings, markets: 3 }
    const guilds: SpecializedBuilding[] = [{ kind: 'market', specialization: 'salt', incomeMultiplier: 1.45 }]
    const withGuild = calculateUpkeep(buildings, 0, 10000, guilds)
    const withoutGuild = calculateUpkeep(buildings, 0, 10000)
    expect(withGuild).toBeGreaterThan(withoutGuild)
  })
})

describe('the net effect on taler matches netGuildBonus (income minus upkeep, together)', () => {
  it('a specialized building nets a strictly positive gain relative to an identical unspecialized one', () => {
    const specialized = { ...emptyBuildings, markets: 3 }
    const guilds: SpecializedBuilding[] = [{ kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }]

    const incomeWith = calculateBuildingIncome(specialized, 0, guilds)
    const upkeepWith = calculateUpkeepBreakdown(specialized, 0, 10000, guilds)
    const incomeWithout = calculateBuildingIncome(specialized, 0)
    const upkeepWithout = calculateUpkeepBreakdown(specialized, 0, 10000)

    const netWithGuild = incomeWith.marketIncome + incomeWith.guildBonusIncome - upkeepWith.total
    const netWithoutGuild = incomeWithout.marketIncome - upkeepWithout.total
    expect(netWithGuild).toBeGreaterThan(netWithoutGuild)
  })
})

describe('pruneGuildsToFit — the pure pruning rule', () => {
  it('a guild survives when enough OTHER buildings absorb the destruction', () => {
    // 3 markets, 1 specialized. Destroying 1 of the 3 still leaves 2 markets
    // standing >= the 1 guild recorded, so nothing needs pruning.
    const player = starter({
      buildings: { ...starter().buildings, markets: 3 },
      guilds: [{ kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }]
    })
    player.buildings.markets -= 1 // simulate what destroyProductionBuildings just did
    player.guilds = pruneGuildsToFit(player)
    expect(player.guilds).toHaveLength(1)
  })

  it('removes the CHEAPEST guild of the kind that now exceeds capacity', () => {
    // Only 1 market standing, but 2 guild entries recorded for market — the
    // scenario destroyProductionBuildings creates right after decrementing.
    const player = starter({
      buildings: { ...starter().buildings, markets: 1 },
      guilds: [
        { kind: 'market', specialization: 'wine', incomeMultiplier: 1.5 },  // more valuable
        { kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 } // cheaper — pruned first
      ]
    })
    const pruned = pruneGuildsToFit(player)
    expect(pruned).toHaveLength(1)
    expect(pruned[0].specialization).toBe('wine')
  })

  it('does not touch guilds of a kind that was not destroyed', () => {
    const player = starter({
      buildings: { ...starter().buildings, markets: 0, mills: 5 },
      guilds: [{ kind: 'mill', specialization: 'salt', incomeMultiplier: 1.45 }]
    })
    // Even with zero markets, the mill guild is unaffected — pruning is per-kind.
    expect(pruneGuildsToFit(player)).toEqual(player.guilds)
  })

  it('is a true no-op when player.guilds is absent or empty (the state of every real game before 21.8)', () => {
    const withoutField = starter({ buildings: { ...starter().buildings, markets: 0 } })
    expect(pruneGuildsToFit(withoutField)).toEqual([])

    const withEmpty = starter({ buildings: { ...starter().buildings, markets: 0 }, guilds: [] })
    expect(pruneGuildsToFit(withEmpty)).toEqual([])
  })
})

describe('prune-on-destruction wired into resolveEvents (fire, events.ts)', () => {
  it('fire never leaves player.guilds recording more specialized buildings than actually stand', () => {
    // High building count + jitter over many seeds so fire fires and destroys
    // a variable number of buildings across the run, exercising the prune path
    // at multiple excess sizes rather than just one hand-picked scenario.
    const player = starter({
      buildings: { ...starter().buildings, markets: 3, mills: 3 },
      guilds: [
        { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
        { kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 },
        { kind: 'market', specialization: 'salt', incomeMultiplier: 1.45 },
        { kind: 'mill', specialization: 'wine', incomeMultiplier: 1.5 }
      ]
    })

    for (let seed = 1; seed <= 300; seed++) {
      const subject: PlayerState = {
        ...player,
        buildings: { ...player.buildings },
        guilds: player.guilds!.map((g) => ({ ...g }))
      }
      resolveEvents(subject, FED, new SeededRng(seed))
      const marketGuilds = subject.guilds!.filter((g) => g.kind === 'market').length
      const millGuilds = subject.guilds!.filter((g) => g.kind === 'mill').length
      expect(marketGuilds, `seed ${seed}`).toBeLessThanOrEqual(subject.buildings.markets)
      expect(millGuilds, `seed ${seed}`).toBeLessThanOrEqual(subject.buildings.mills)
    }
  })

  it('is a no-op when the player holds no guilds (every real game before 21.8)', () => {
    const player = starter({ buildings: { ...starter().buildings, markets: 5, mills: 5 } })
    expect(() => resolveEvents(player, FED, new SeededRng(1))).not.toThrow()
    expect(player.guilds).toBeUndefined()
  })
})

describe('prune-on-destruction — sabotage (espionage.ts)', () => {
  it('resolveStrike prunes the defender\'s guilds when a specialized building could be the one burned', () => {
    const attacker = starter({ id: 'attacker', saboteurs: 5 })
    // 2 markets standing, 2 guild entries recorded — destroying ONE market
    // drops the count to 1, which is an excess of exactly 1 against 2 guild
    // entries, so pruneGuildsToFit removes exactly the cheapest.
    const defender = starter({
      id: 'defender',
      buildings: { ...starter().buildings, markets: 2 },
      guilds: [
        { kind: 'market', specialization: 'wine', incomeMultiplier: 1.5 },
        { kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }
      ]
    })

    // Search a small seed range for one that lands a successful sabotage hit —
    // resolveStrike's success roll is probabilistic, and this test cares about
    // what happens on a HIT, not about forcing one specific seed to stay valid
    // forever if sabotageSuccessChance is retuned.
    let hit = false
    for (let seed = 1; seed < 200 && !hit; seed++) {
      const d = { ...defender, buildings: { ...defender.buildings }, guilds: defender.guilds!.map((g) => ({ ...g })) }
      const outcome = resolveStrike(attacker, d, 3, 'sabotage', new SeededRng(seed))
      if (outcome.succeeded && outcome.buildingsDestroyed > 0) {
        hit = true
        expect(d.buildings.markets).toBe(1)
        expect(d.guilds).toHaveLength(1) // one of the two was pruned
        expect(d.guilds![0].specialization).toBe('wine') // the cheaper one (iron) is pruned first
      }
    }
    expect(hit, 'no seed in range produced a successful sabotage hit — widen the search').toBe(true)
  })

  it('is a no-op when the defender holds no guilds (every real game before 21.8)', () => {
    const attacker = starter({ id: 'attacker', saboteurs: 5 })
    const defender = starter({ id: 'defender', buildings: { ...starter().buildings, markets: 1 } })
    expect(() => resolveStrike(attacker, defender, 3, 'sabotage', new SeededRng(1))).not.toThrow()
  })
})

describe('scarcity.ts exposure — verified unaffected, not modified', () => {
  // The 21.6-21.11 sequencing table lists "scarcity.ts exposure term" under
  // 21.7's economics wiring. It needs NO code change: countBuildings() sums
  // buildings.markets + mills + ... , and specialization does not remove a
  // building from those counts (see SpecializedBuilding's comment in
  // state.ts) — a specialized market is still one of the markets fire
  // exposure counts. This test is the verification that claim is actually
  // true, not an assumption resting on a comment.
  it('fire/event exposure is identical whether or not a market is specialized', () => {
    const unspecialized = starter({ buildings: { ...starter().buildings, markets: 3, mills: 2 } })
    const specialized = starter({
      buildings: { ...starter().buildings, markets: 3, mills: 2 },
      guilds: [{ kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }]
    })

    // Specialization changes NOTHING about the raw building count — the guild
    // entry is an overlay, not a subtraction from buildings.markets.
    expect(countBuildings(specialized)).toBe(countBuildings(unspecialized))
  })
})
