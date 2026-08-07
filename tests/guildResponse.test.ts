// Phase 21.9 — the AI's answer to a guild petition (D2, #51).
//
// 21.8 answered with a closed-form screen: capitalise the charter, subtract the
// fee, compare against the refusal spike, pick the larger. 21.9 replaced it with
// real-reducer scoring. The measured difference is the whole point of the
// tranche, so it is worth recording here rather than only in a phase report —
// `npx tsx scripts/guild-bench.ts 10 60`, three-way field:
//
//   field grant rate    98% (218/223)  ->  55% (200/365)
//   Builder             97%            ->  72%
//   Expansionist       100%            ->  64%
//   Merchant            94%            ->  49%
//   Schemer             98%            ->  42%
//   Raider             100%            ->  58%
//
// Under the closed form the charter was not a decision — every archetype said
// yes to everything. Under scoring there is a 30-point spread and two
// archetypes below a coin flip, which is what "the split is measured, not
// predicted" was supposed to deliver.
//
// It also settles BACKLOG S10 finding 2, which predicted from closed-form
// margins that Merchant and Raider would refuse EVERYTHING (0/8). They refuse
// 51% and 42%. S10 flagged its own method as a first-order screen whose
// omissions "all push toward granting"; that was right, and the size of the
// error is why this file tests behaviour through the planner rather than
// re-deriving a margin.
//
// KEEP THESE NUMBERS IN STEP WITH PLAN.md §21.9. They were already allowed to
// drift once, during 21.9's own review: the docs were regenerated after a fix
// and this header was not, leaving two committed artifacts disagreeing about
// the same measurement.

import { describe, it, expect } from 'vitest'
import { planGuildResponse } from '../src/ai/guildResponse.ts'
import { isolate, scoreCandidate } from '../src/ai/candidateScore.ts'
import { getPersonality, getPersonalities } from '../src/ai/personalities.ts'
import { aiCompetitor, runMatch, Competitor } from '../src/ai/sim.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { Chronicle, Decision, GameState, PlayerState } from '../src/engine/state.ts'
import buildingsData from '../data/buildings.json'

const MERCHANT = getPersonality('merchant')
const IRON_FEE = buildingsData.guilds.types.iron.charterFee

// A minimal sheet for the guild answer to ride on. planYear passes the sheet its
// candidate sweep chose; these tests pass a do-nothing one so the only thing
// separating the grant branch from the refuse branch is the charter itself.
const IDLE_SHEET: Decision[] = [
  { type: 'grain', feedLevel: 'required' },
  { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
  { type: 'tax', vat: 25, incomeTax: 25, tariff: 10, justiceGraft: 0 },
  {
    type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
    wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
  }
]

const SEEDS = [1, 7920]

function stateWith(overrides: Partial<PlayerState>): GameState {
  const state = createStarterState([{ id: 'p1', name: 'Test' }])
  Object.assign(state.players['p1'], overrides)
  return isolate(state, 'p1')
}

const PENDING_IRON = { kind: 'market' as const, specialization: 'iron' as const, queuedYear: 0 }
const STARTER_BUILDINGS = createStarterState([{ id: 'p1', name: 'T' }]).players['p1'].buildings

describe('planGuildResponse emits a decision only when one is called for', () => {
  it('returns undefined with no pending petition, so the sheet stays unchanged', () => {
    const state = stateWith({ taler: 50_000 })
    expect(planGuildResponse(state, 'p1', IDLE_SHEET, MERCHANT.weights, SEEDS)).toBeUndefined()
  })

  // Asserting `type === 'guild'` here would prove nothing — TypeScript's return
  // type already guarantees it. What is worth pinning is that the two callers
  // cannot alias one another: planYear splices the result into a live sheet for
  // every ruler in every year, so a shared module-level object would turn one
  // stray mutation into a cross-ruler bug.
  // Both return paths, not just one: a singleton reintroduced on only the
  // refuse factory would slip past a grant-only fixture.
  it.each([
    ['grant', { taler: 400_000, buildings: { ...STARTER_BUILDINGS, markets: 8, mills: 6 } }],
    ['refuse', { taler: IRON_FEE - 1 }]
  ])('returns a fresh decision object per call on the %s path, never a shared singleton', (expected, overrides) => {
    const state = stateWith({ ...overrides, pendingGuild: PENDING_IRON })
    const first = planGuildResponse(state, 'p1', IDLE_SHEET, MERCHANT.weights, SEEDS)
    const second = planGuildResponse(state, 'p1', IDLE_SHEET, MERCHANT.weights, SEEDS)

    expect(first?.action, 'fixture no longer exercises the path it names').toBe(expected)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })
})

describe('the answer responds to whether the charter is actually payable', () => {
  // 21.8 short-circuited this case in arithmetic before scoring. 21.9 removed the
  // short-circuit on the argument that the scorer reaches the same conclusion
  // unaided, because resolveGuildPetition makes an unaffordable 'grant' produce
  // the same STATE as an explicit refusal.
  //
  // The outcome assertion alone cannot check that argument — a Merchant this
  // poor might refuse on merit whatever the equivalence rule did. So this
  // asserts the mechanism directly: the two branches must score EXACTLY equal,
  // which is only true if the reducer really cannot tell them apart. The
  // outcome then follows from the tie rule. A boundary case at exactly the fee
  // sits alongside it, since `canAfford` is `>=` and an off-by-one there would
  // otherwise pass unnoticed.
  it('scores grant and refuse identically when the fee is unaffordable, and refuses on the tie', () => {
    const state = stateWith({ taler: IRON_FEE - 1, pendingGuild: PENDING_IRON })
    const grantScore = scoreCandidate(state, 'p1', [...IDLE_SHEET, { type: 'guild', action: 'grant' }], MERCHANT.weights, SEEDS)
    const refuseScore = scoreCandidate(state, 'p1', [...IDLE_SHEET, { type: 'guild', action: 'refuse' }], MERCHANT.weights, SEEDS)
    expect(grantScore).toBe(refuseScore)

    expect(planGuildResponse(state, 'p1', IDLE_SHEET, MERCHANT.weights, SEEDS))
      .toEqual({ type: 'guild', action: 'refuse' })
  })

  it('one Taler more — exactly the fee — is affordable, so the branches diverge', () => {
    const state = stateWith({ taler: IRON_FEE, pendingGuild: PENDING_IRON })
    const grantScore = scoreCandidate(state, 'p1', [...IDLE_SHEET, { type: 'guild', action: 'grant' }], MERCHANT.weights, SEEDS)
    const refuseScore = scoreCandidate(state, 'p1', [...IDLE_SHEET, { type: 'guild', action: 'refuse' }], MERCHANT.weights, SEEDS)
    expect(grantScore).not.toBe(refuseScore)
  })

  it('a ruler who is rich and already productive grants', () => {
    const state = stateWith({
      taler: 400_000,
      buildings: { ...STARTER_BUILDINGS, markets: 8, mills: 6 },
      pendingGuild: PENDING_IRON
    })
    expect(planGuildResponse(state, 'p1', IDLE_SHEET, MERCHANT.weights, SEEDS))
      .toEqual({ type: 'guild', action: 'grant' })
  })
})

// THE REGRESSION GUARD. Everything above pins a single position; this one pins
// the property the tranche exists to create — that across real play the answer
// is sometimes yes and sometimes no.
//
// It is deliberately a two-sided BAND rather than a pinned rate. A pinned
// number would go red on any balance edit and get re-baselined into
// meaninglessness; what must never come back is either DEGENERATE end, because
// both read as "the charter is not a decision": 0% makes it an unrest tax
// nobody can dodge (literally 21.8's pre-AI-path state, which the balance gate
// passed while the field collapsed), and 100% makes it a button everyone
// presses. Neither is visible to `npm run balance`, which is why the assertion
// lives here.
//
// The band is exclusive at both ends (15% and 85% themselves fail), and it is
// checked rather than guessed. Measured in THIS scenario (the two seeds and
// three archetypes below, not the wider bench):
//
//   21.8 closed-form screen   29 granted / 2 refused  = 93.5%   -> FAILS
//   21.9 real-reducer scoring 29 granted / 21 refused = 58.0%   -> passes
//
// Worth spelling out why the bound is two-sided instead of the obvious
// `refused > 0`: the closed form DID refuse twice here, so a one-sided
// existence check would have gone green on the very behaviour this tranche
// replaced. 58.0% clears the floor by 43 points; 93.5% clears the ceiling by
// 8.5, so in practice it is the CEILING that does the work.
//
// That asymmetry is structural, not luck. `granted` is 29 in both columns
// because these three rulers saturate their charter slots either way — what
// scoring changes is how many refusals pile up in the denominator on the way
// there. So the floor can only bite if grants themselves collapse, which is
// the 21.8-pre-AI-path failure; the ceiling is what catches a regression back
// toward "always yes".
//
// The unaffordable assertion below guards a different thing: that the planner
// scores the charter against its COMPLETE sheet. Steps 1 through 3.5 of the
// reducer are RNG-free and read only the player's own state, so the projected
// step-3.5 treasury is provably identical to the real one — which makes zero
// unaffordable-refusals a structural consequence of scoring the whole sheet,
// not a lucky sample. Score against a partial sheet (as 21.9's first draft
// did, omitting espionage and military spend that settle at steps 2 and 2.5)
// and the projection runs high, the AI reaches for charters it cannot pay for,
// and this goes non-zero. Nothing else in the suite catches that revert.
const MIN_GRANT_RATE = 0.15
const MAX_GRANT_RATE = 0.85

describe('the grant/refuse split is real in play, not just in a unit fixture', () => {
  it('a three-way field both grants and refuses charters over a full match', () => {
    const personalities = getPersonalities()
    const competitors: Competitor[] = [
      aiCompetitor('p1', personalities[0].id),
      aiCompetitor('p2', personalities[2].id),
      aiCompetitor('p3', personalities[3].id)
    ]

    let granted = 0
    let refused = 0
    let unaffordable = 0
    const observe = (_state: GameState, chronicle: Chronicle) => {
      for (const report of Object.values(chronicle.playerReports)) {
        if (!report.guildResolution) continue
        if (report.guildResolution.granted) granted++
        else refused++
        if (report.guildResolution.refusedForUnaffordable) unaffordable++
      }
    }

    // Two seeds, 40 years. Enough for petitions to fire repeatedly across three
    // rulers without paying for a 60-year run in the unit suite.
    for (const seed of [500, 1131]) runMatch(competitors, seed, 40, observe)

    const resolutions = granted + refused
    expect(resolutions, 'no petition was resolved at all — the pipeline is broken').toBeGreaterThan(10)

    // Must be exactly zero, and it is a theorem rather than a sample: an AI
    // that scores its complete sheet can never reach for a charter its own
    // decisions have already spent. Non-zero means planYear went back to
    // scoring a partial sheet.
    expect(
      unaffordable,
      `${unaffordable} unaffordable-refusal(s): the planner is pricing charters against a treasury ` +
      'that its own espionage/military spend has already claimed — score the COMPLETE sheet'
    ).toBe(0)

    const grantRate = granted / resolutions
    expect(
      grantRate,
      `grant rate ${(grantRate * 100).toFixed(1)}% (${granted}/${resolutions}) fell below ${MIN_GRANT_RATE * 100}%: ` +
      'the charter has become an unrest tax nobody can dodge rather than a decision'
    ).toBeGreaterThan(MIN_GRANT_RATE)
    expect(
      grantRate,
      `grant rate ${(grantRate * 100).toFixed(1)}% (${granted}/${resolutions}) exceeded ${MAX_GRANT_RATE * 100}%: ` +
      'the charter has become a button everyone presses rather than a decision'
    ).toBeLessThan(MAX_GRANT_RATE)
  })
})
