// Phase 21.8 — REDUCER WIRING. Petitions actually fire.
//
// 21.6 built the pure logic with no callers; 21.7 wired the economics but kept
// every player guild-less. This is the tranche where advanceYear itself gains
// two steps — 3.5 (resolve last year's petition) and 14 (queue next year's) —
// and the world visibly changes.
//
// The load-bearing property, and the reason this file exists: ZERO NEW RNG
// DRAWS. advanceYear shares one SeededRng across every activePlayerId, so a
// draw consumed by the guild steps — even conditionally — would silently shift
// every later roll for every OTHER player. Same-process determinism tests
// cannot see that (they replay the same shifted world twice and agree), and the
// golden fixtures would flag it only as an unexplained diff. The cross-player
// guard at the bottom is what actually pins it.

import { describe, it, expect } from 'vitest'
import { advanceYear } from '../src/engine/year.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { charterSlotsForRank } from '../src/engine/ranks.ts'
import { guildDefinition } from '../src/engine/guilds.ts'
import { Decision, GameState } from '../src/engine/state.ts'

const FEED: Decision = { type: 'grain', feedLevel: 'required' }
const sheet = (extra: Decision[] = []): Decision[] => [FEED, ...extra]

function withMarkets(ids: string[], markets: number): GameState {
  const state = createStarterState(ids.map((id) => ({ id, name: id.toUpperCase() })))
  for (const id of ids) state.players[id].buildings.markets = markets
  return state
}

describe('21.8: petitions fire and resolve across year boundaries', () => {
  it('queues at the END of the year, so the player can answer before the NEXT End Year', () => {
    // The timing model the design doc's open question #3 called a dichotomy:
    // this is next-year storage AND same-turn responsiveness at once.
    const after = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100)

    expect(after.state.players.a.pendingGuild).toBeDefined()
    expect(after.chronicle.playerReports.a.guildPetition).toEqual(after.state.players.a.pendingGuild)
    // Queued, not resolved, in the same year.
    expect(after.chronicle.playerReports.a.guildResolution).toBeUndefined()
  })

  it('never petitions the starter state — rank 0 with zero production buildings', () => {
    // Directly load-bearing: this is why golden.test.ts's YEAR-1 block survives
    // 21.8 unchanged while year20 legitimately moves.
    const after = advanceYear(createStarterState([{ id: 'a', name: 'A' }]), { a: sheet() }, 100)
    expect(after.state.players.a.pendingGuild).toBeUndefined()
    expect(after.chronicle.playerReports.a.guildPetition).toBeUndefined()
  })

  it('granting costs the fee, records the guild, and clears the petition', () => {
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    const pending = seeded.players.a.pendingGuild!

    const granted = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'grant' }]) }, 200)
    const res = granted.chronicle.playerReports.a.guildResolution!

    expect(res.granted).toBe(true)
    expect(res.specialization).toBe(pending.specialization)
    expect(res.charterFeePaid).toBe(guildDefinition(pending.specialization).charterFee)
    expect(res.unrestDelta).toBe(0)
    expect(granted.state.players.a.guilds).toHaveLength(1)
    expect(granted.state.players.a.pendingGuild).toBeUndefined()

    // The fee genuinely left the treasury. Compared against the SAME year run
    // with a refusal rather than against a raw delta, since income and upkeep
    // move taler too.
    const refused = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'refuse' }]) }, 200)
    expect(granted.state.players.a.taler).toBeLessThan(refused.state.players.a.taler)
  })

  it('an explicit refusal costs unrest and grants nothing', () => {
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    const after = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'refuse' }]) }, 200)
    const res = after.chronicle.playerReports.a.guildResolution!

    expect(res.granted).toBe(false)
    expect(res.lapsed).toBe(false)
    expect(res.unrestDelta).toBeGreaterThan(0)
    expect(after.state.players.a.guilds ?? []).toHaveLength(0)
  })

  it('an UNANSWERED petition lapses to a refusal rather than carrying over', () => {
    // Without this, "never respond" would strictly dominate answering.
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    const lapsedYear = advanceYear(seeded, { a: sheet() }, 200) // no guild decision
    const res = lapsedYear.chronicle.playerReports.a.guildResolution!

    expect(res.lapsed).toBe(true)
    expect(res.granted).toBe(false)
    expect(res.unrestDelta).toBeGreaterThan(0)
    // The lapsed petition is gone, not still sitting there unanswered.
    const stillPending = lapsedYear.state.players.a.pendingGuild
    expect(stillPending === undefined || stillPending.specialization !== res.specialization).toBe(true)
  })

  it('an unaffordable grant resolves as a refusal, not as a free pass', () => {
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    seeded.players.a.taler = 0 // cannot cover any charterFee

    const after = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'grant' }]) }, 200)
    const res = after.chronicle.playerReports.a.guildResolution!

    expect(res.granted).toBe(false)
    expect(res.refusedForUnaffordable).toBe(true)
    expect(res.charterFeePaid).toBe(0)
    expect(res.unrestDelta).toBeGreaterThan(0)
  })

  it('the charter cap stops petitions once every slot is filled', () => {
    expect(charterSlotsForRank(0)).toBe(1) // Baron
    let state = withMarkets(['a'], 8)
    state = advanceYear(state, { a: sheet() }, 100).state
    state = advanceYear(state, { a: sheet([{ type: 'guild', action: 'grant' }]) }, 200).state
    expect(state.players.a.guilds).toHaveLength(1)

    const after = advanceYear(state, { a: sheet() }, 300)
    expect(after.state.players.a.pendingGuild).toBeUndefined()
  })

  it('a granted guild actually earns its income bonus through the reducer', () => {
    // End-to-end: 21.7a wired buildings.ts, 21.8 makes a player able to hold one.
    const seeded = advanceYear(withMarkets(['a'], 4), { a: sheet() }, 100).state
    const granted = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'grant' }]) }, 200).state

    const withGuild = advanceYear(granted, { a: sheet() }, 300)
    const stripped = { ...granted, players: { a: { ...granted.players.a, guilds: [] } } }
    const withoutGuild = advanceYear(stripped, { a: sheet() }, 300)

    expect(withGuild.chronicle.playerReports.a.guildBonusIncome).toBeGreaterThan(0)
    expect(withoutGuild.chronicle.playerReports.a.guildBonusIncome).toBe(0)
  })
})

describe('21.8: the promotion moment (#49)', () => {
  function aboutToPromote(): GameState {
    // Over Duke's non-palace gate (wealth 28,000 / population 1,900), with
    // unrest to spare so the relief is observable.
    const state = createStarterState([{ id: 'a', name: 'A' }])
    state.players.a.taler = 60000
    state.players.a.population = { peasants: 2400, unrest: 30 }
    return state
  }

  it('records unlockedFeatures, charter slots, and unrest relief', () => {
    const after = advanceYear(aboutToPromote(), { a: sheet() }, 100)
    const report = after.chronicle.playerReports.a

    expect(report.rankPromoted).toBe(true)
    expect(report.charterSlotsAfterPromotion).toBe(charterSlotsForRank(after.state.players.a.rank))
    expect(report.promotionUnrestRelief).toBeGreaterThan(0)
    // checkPromotion has ALWAYS computed unlockedFeatures and nothing ever read
    // it before 21.8. It is consumed now.
    expect(Array.isArray(report.unlockedFeatures)).toBe(true)
  })

  it('actually carries a feature when the rank reached defines one', () => {
    // Non-vacuous coverage. The previous assertion is only Array.isArray, and
    // aboutToPromote() reaches Prince (rank 2) — which defines no
    // unlockedFeature, so it passes on an empty array and would still pass if
    // year.ts stopped recording the field at all. Count (rank 3) is the ONLY
    // rank in data/ranks.json with an unlockedFeature ("tradingHouses"), so
    // this is the one scenario that proves the wiring.
    const state = createStarterState([{ id: 'a', name: 'A' }])
    state.players.a.taler = 90000
    // Headroom on BOTH gates, deliberately. The promotion check is step 13, so
    // a ruler has to still qualify after feeding (step 5) and events (step 11)
    // have taken their cut: an earlier draft set 3,000 peasants exactly and a
    // plague dropped him to 2,434, under Count's 2,700 floor, reaching only
    // rank 2 and leaving this test passing vacuously on an empty array.
    state.players.a.population = { peasants: 3800, unrest: 20 }
    state.players.a.grainStock = 400000

    const after = advanceYear(state, { a: sheet() }, 100)
    const report = after.chronicle.playerReports.a

    expect(after.state.players.a.rank).toBeGreaterThanOrEqual(3)
    expect(report.unlockedFeatures).toContain('tradingHouses')
  })

  it('widens the guild charter cap, so promotion is what unlocks more guilds', () => {
    const after = advanceYear(aboutToPromote(), { a: sheet() }, 100)
    const newRank = after.state.players.a.rank
    expect(newRank).toBeGreaterThan(0)
    expect(charterSlotsForRank(newRank)).toBeGreaterThan(charterSlotsForRank(0))
  })

  it('grants NO Taler purse — the reward is unrest relief only', () => {
    // A cash grant would accelerate the next wealthMin gate: positive feedback
    // aimed straight at the balance gate's maxReturnTrendSlope.
    const promoting = aboutToPromote()
    const capped = aboutToPromote()
    capped.players.a.rank = 7 // already Kaiser — nothing left to win

    const a = advanceYear(promoting, { a: sheet() }, 100)
    const b = advanceYear(capped, { a: sheet() }, 100)

    expect(a.chronicle.playerReports.a.rankPromoted).toBe(true)
    expect(b.chronicle.playerReports.a.rankPromoted).toBe(false)
    // Identical treasury outcome: promotion paid nothing.
    expect(a.state.players.a.taler).toBeCloseTo(b.state.players.a.taler, 6)
  })

  it('unrest relief never drives unrest below zero', () => {
    const calm = aboutToPromote()
    calm.players.a.population.unrest = 1
    const after = advanceYear(calm, { a: sheet() }, 100)
    expect(after.state.players.a.population.unrest).toBeGreaterThanOrEqual(0)
  })
})

describe('21.8: ZERO new RNG draws — the cross-player guard', () => {
  // THE test for this tranche. If the guild steps ever consume a draw, one
  // ruler's guild activity shifts every other ruler's weather, events, and
  // positive-event rolls for the rest of the year — and determinism.test.ts
  // would stay green, because it replays the same shifted world twice.
  it('one ruler holding and resolving a guild leaves the others bit-for-bit untouched', () => {
    const build = (withGuildActivity: boolean): GameState => {
      const s = createStarterState([
        { id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }
      ])
      s.players.p1.buildings.markets = 6
      s.players.p1.taler = 50000
      if (withGuildActivity) {
        s.players.p1.guilds = [{ kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }]
        s.players.p1.pendingGuild = { kind: 'market', specialization: 'cloth', queuedYear: 0 }
      }
      return s
    }
    const decisions: Record<string, Decision[]> = {
      p1: sheet([{ type: 'guild', action: 'grant' }]),
      p2: sheet(),
      p3: sheet()
    }

    const without = advanceYear(build(false), decisions, 4242)
    const withGuilds = advanceYear(build(true), decisions, 4242)

    // p1 genuinely did something different...
    expect(withGuilds.chronicle.playerReports.p1.guildResolution).toBeDefined()
    expect(without.chronicle.playerReports.p1.guildResolution).toBeUndefined()

    // ...and p2/p3 cannot tell.
    for (const other of ['p2', 'p3']) {
      const a = without.chronicle.playerReports[other]
      const b = withGuilds.chronicle.playerReports[other]
      expect(b.weatherId, `${other} weather`).toBe(a.weatherId)
      expect(b.harvestYield, `${other} harvest`).toBe(a.harvestYield)
      expect(b.events.map((e) => e.type), `${other} events`).toEqual(a.events.map((e) => e.type))
      expect(b.positiveEvent?.id ?? null, `${other} positive event`).toBe(a.positiveEvent?.id ?? null)
      expect(b.births, `${other} births`).toBe(a.births)
      expect(b.deaths, `${other} deaths`).toBe(a.deaths)
    }
  })

  it('holds for every resolution branch — grant, refuse, and lapse alike', () => {
    // A conditional draw would most plausibly hide in one branch only.
    const mk = (): GameState => {
      const s = createStarterState([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }])
      s.players.p1.buildings.markets = 4
      s.players.p1.taler = 50000
      s.players.p1.pendingGuild = { kind: 'market', specialization: 'iron', queuedYear: 0 }
      return s
    }
    const branches: Array<[string, Decision[]]> = [
      ['grant', sheet([{ type: 'guild', action: 'grant' }])],
      ['refuse', sheet([{ type: 'guild', action: 'refuse' }])],
      ['lapse', sheet()]
    ]

    const baseline = advanceYear(
      createStarterState([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]),
      { p1: sheet(), p2: sheet() },
      777
    ).chronicle.playerReports.p2

    for (const [name, p1Sheet] of branches) {
      const result = advanceYear(mk(), { p1: p1Sheet, p2: sheet() }, 777).chronicle.playerReports.p2
      expect(result.weatherId, `p2 weather under ${name}`).toBe(baseline.weatherId)
      expect(result.harvestYield, `p2 harvest under ${name}`).toBe(baseline.harvestYield)
      expect(result.births, `p2 births under ${name}`).toBe(baseline.births)
    }
  })
})

describe('21.8: unrest accounting stays honest (regression, found by spec audit)', () => {
  // Two real bugs this tranche introduced, both caught by audit rather than by
  // any existing test — reportComponents.test.ts's scenarios happen never to
  // promote and never to hold a petition, so both slipped straight through.
  it('unrestGain still equals the true before/after delta in a PROMOTION year', () => {
    // The -5 celebration relief lands in step 13, AFTER step 12.5 has already
    // finalised unrestGain. Without re-closing the total there, unrestGain is
    // off by exactly the relief and state.ts's documented "components sum to
    // unrestGain" contract silently breaks in every promotion year.
    const state = createStarterState([{ id: 'a', name: 'A' }])
    state.players.a.taler = 60000
    state.players.a.population = { peasants: 2400, unrest: 30 }
    const before = state.players.a.population.unrest

    const result = advanceYear(state, { a: sheet() }, 100)
    const report = result.chronicle.playerReports.a
    const after = result.state.players.a.population.unrest

    expect(report.rankPromoted).toBe(true)
    expect(report.promotionUnrestRelief).toBeGreaterThan(0)
    expect(report.unrestGain).toBeCloseTo(after - before, 6)

    const components =
      report.unrestFromFeeding + report.unrestFromTax + report.unrestFromWarWeariness +
      (report.unrestFromGuild ?? 0) + (report.unrestFromPromotion ?? 0)
    expect(components).toBeCloseTo(report.unrestGain, 6)
  })

  it('a refused charter is attributed to GUILD, not misreported as a feeding shortfall', () => {
    // unrestAtYearStart is captured before step 3.5, so without re-baselining,
    // the +8 spike lands inside unrestFromFeeding — which app.ts renders as
    // "Feeding (shortfall/decay)". A player who refused a guild would be told
    // the unrest came from grain, squarely against Phase 20.4's "explain every
    // number".
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    // Well-fed and untaxed, so feeding/tax contribute nothing of their own.
    seeded.players.a.grainStock = 500000

    const refused = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'refuse' }]) }, 200)
    const report = refused.chronicle.playerReports.a

    expect(report.guildResolution!.granted).toBe(false)
    expect(report.unrestFromGuild).toBeGreaterThan(0)
    // The spike is NOT hiding in the feeding bucket.
    expect(report.unrestFromFeeding).toBeLessThanOrEqual(0)

    const components =
      report.unrestFromFeeding + report.unrestFromTax + report.unrestFromWarWeariness +
      (report.unrestFromGuild ?? 0) + (report.unrestFromPromotion ?? 0)
    expect(components).toBeCloseTo(report.unrestGain, 6)
  })

  it('a granted charter adds no unrest at all', () => {
    const seeded = advanceYear(withMarkets(['a'], 3), { a: sheet() }, 100).state
    seeded.players.a.taler = 50000
    const granted = advanceYear(seeded, { a: sheet([{ type: 'guild', action: 'grant' }]) }, 200)
    expect(granted.chronicle.playerReports.a.guildResolution!.granted).toBe(true)
    expect(granted.chronicle.playerReports.a.unrestFromGuild ?? 0).toBe(0)
  })
})
