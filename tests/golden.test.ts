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
