// CROSS-PROCESS GOLDEN — guards planYear/advanceYear against decision drift
// during the D4 performance pass (BACKLOG.md).
//
// This is deliberately NOT the same thing as determinism.test.ts, which only
// proves two runs *in the same process* agree — an optimization that
// consistently changes which candidate wins still passes that test. This test
// compares live output against tests/fixtures/planner-golden.json, a fixture
// committed to disk and regenerated only by a deliberate, reviewed run of
// scripts/gen-golden-fixture.ts. If a performance change alters which
// candidate the planner picks, this is the test that catches it.

import { describe, it, expect } from 'vitest'
import { getPersonalities } from '../src/ai/personalities.ts'
import { planYear } from '../src/ai/planner.ts'
import { planningSeed } from '../src/ai/planningSeed.ts'
import { advanceYear } from '../src/engine/year.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { aiCompetitor } from '../src/ai/sim.ts'
import golden from './fixtures/planner-golden.json'

const PLANNING_SEED = 9001

describe('planner golden (year 1, starter state)', () => {
  for (const personality of getPersonalities()) {
    it(`${personality.id} emits the committed decision sheet`, () => {
      const state = createStarterState([{ id: 'ai', name: personality.name }])
      const decisions = planYear(state, 'ai', personality, PLANNING_SEED)
      expect(decisions).toEqual((golden as any).year1[personality.id])
    })
  }
})

// ===========================================================================
// GREEN AND CURRENT AS OF 21.11. The guild work is finished; this is the
// settled state, not a waypoint.
// ===========================================================================
// This block used to say, verbatim, "EXPECTED RED FROM PHASE 21.8 UNTIL 21.11.
// DO NOT REGENERATE TO GO GREEN." — and promised the fixture exactly one deliberate
// regeneration at 21.11. That plan was overtaken by events and the comment went
// stale for three tranches — recorded here rather than quietly deleted, because
// a stale instruction in a golden test is worse than none: it tells the next
// reader to expect failures and to re-baseline, which is precisely the habit
// this file exists to prevent.
//
// What actually happened: 21.8's FIXUP regenerated planner-golden.json once,
// under the review check PLAN.md specifies (year-1 block byte-identical; the
// entire year-20 diff was one line, builder's sellGrain 5358 -> 5206). It has
// been green ever since. 21.9 changed how the AI answers a petition and moved
// it not at all; 21.10 was UI-only.
//
// 21.11 therefore performed NO regeneration, and verified rather than assumed
// that none was due: `npx tsx scripts/gen-golden-fixture.ts` was run into a
// scratch file and compared against the committed fixture. Byte-identical.
// Regenerating anyway would have been a no-op commit that normalises
// re-baselining as a routine step, which is the one thing this fixture must
// never become.
//
// WHAT THE YEAR-20 BLOCK DOES AND DOES NOT COVER, since it is easy to get
// backwards. The committed year-20 sheet contains NO guild decision: by year 19
// every archetype sits at rank 1 (Duke, 2 charter slots) holding 2 guilds, so
// slots are saturated and nextGuildPetition offers nothing. Guild coverage here
// is INDIRECT and comes from the 19-year replay above it — each archetype
// resolves 2 petitions and grants both, and those grants shape the year-20
// state the sheet is planned from. So this fixture does guard the AI's
// grant/refuse behaviour, but through the state it produces rather than through
// a decision in the snapshot. It does not exercise the refuse path at all;
// tests/guildResponse.test.ts owns that.
//
// The year-1 block stays the structural half: the starter state is rank 0 with
// zero production buildings, so it is ineligible for a petition (asserted
// directly in tests/guildReducer.test.ts) and should survive any guild change
// untouched.
//
// The reducer's own ratchet (tests/yearGolden.test.ts) was likewise regenerated
// at 21.8 and needs nothing further.
describe('planner golden (year 20, developed state)', () => {
  for (const personality of getPersonalities()) {
    it(`${personality.id} emits the committed decision sheet after 19 years of real play`, () => {
      const competitor = aiCompetitor('ai', personality.id)
      let state = createStarterState([{ id: 'ai', name: personality.name }])
      const seed = 4242
      for (let year = 0; year < 19; year++) {
        const planSeed = planningSeed(seed, year, competitor.id)
        const sheet = planYear(state, 'ai', personality, planSeed)
        const result = advanceYear(state, { ai: sheet }, seed + year * 1000)
        state = result.state
      }
      const planSeed = planningSeed(seed, 19, competitor.id)
      const decisions = planYear(state, 'ai', personality, planSeed)
      expect(decisions).toEqual((golden as any).year20[personality.id])
    })
  }
})
