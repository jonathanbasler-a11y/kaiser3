// One-off generator for the cross-process golden fixtures (tests/fixtures/).
// Run manually with `npx tsx scripts/gen-golden-fixture.ts` ONLY when a
// deliberate, reviewed change to planYear/advanceYear should shift the
// baseline — never as part of normal test running. The point of the fixture
// is that it does NOT regenerate itself; golden.test.ts compares live output
// against what's committed here.

import { getPersonalities } from '../src/ai/personalities.ts'
import { planYear } from '../src/ai/planner.ts'
import { advanceYear } from '../src/engine/year.ts'
import { createStarterState } from '../src/engine/starter.ts'
import { aiCompetitor } from '../src/ai/sim.ts'

const PLANNING_SEED = 9001

// Year-1 decisions from the starter state, for every archetype — exercises the
// full candidate sweep against known, simple inputs.
const year1: Record<string, unknown> = {}
for (const personality of getPersonalities()) {
  const state = createStarterState([{ id: 'ai', name: personality.name }])
  const decisions = planYear(state, 'ai', personality, PLANNING_SEED)
  year1[personality.id] = decisions
}

// Year-20 decisions — reached by actually playing 19 years forward first, so
// the candidate sweep is exercised against a realistic, developed state
// (mid-rank-path, real buildings, real treasury) rather than only the trivial
// starting position.
const year20: Record<string, unknown> = {}
for (const personality of getPersonalities()) {
  const competitor = aiCompetitor('ai', personality.id)
  let state = createStarterState([{ id: 'ai', name: personality.name }])
  const seed = 4242
  for (let year = 0; year < 19; year++) {
    const planningSeed = seed + year * 104729 + competitor.id.length
    const sheet = planYear(state, 'ai', personality, planningSeed)
    const result = advanceYear(state, { ai: sheet }, seed + year * 1000)
    state = result.state
  }
  const planningSeed = seed + 19 * 104729 + competitor.id.length
  year20[personality.id] = planYear(state, 'ai', personality, planningSeed)
}

console.log(JSON.stringify({ year1, year20 }, null, 2))
