// One-off generator for the REDUCER golden fixture (tests/fixtures/advanceYear-golden.json).
//
// Run manually with `npx tsx scripts/gen-year-golden.ts` ONLY when a deliberate,
// reviewed change to advanceYear should shift the baseline — never as part of
// normal test running, and never to make a red test go green. The whole value of
// this fixture is that it does NOT regenerate itself: yearGolden.test.ts compares
// live output against what is committed here, in a separate process, on a
// separate run.
//
// WHY THIS EXISTS SEPARATELY FROM planner-golden.json
// ---------------------------------------------------
// planner-golden.json guards planYear (which candidate the AI picks). This one
// guards advanceYear (what the world does), and it deliberately never calls
// planYear.
//
// The isolation runs in ONE direction only, and it is worth being precise about
// which: a planner change moves only planner-golden.json, but a REDUCER change
// moves BOTH, because golden.test.ts plays 19 real years forward before planning
// (golden.test.ts:36-44). PLAN.md records two reducer-only changes (F6, and
// corn-price drift) that forced a planner-golden regeneration for exactly that
// reason. The diagnostic value is in the pattern: both red means suspect the
// reducer, planner-golden alone means suspect the AI.
//
// The scenario itself lives in tests/helpers/yearGoldenRun.ts, shared with the
// test so the two cannot drift apart. That file documents why it is
// multi-player, multi-year, planner-free, and state-only, and the fixture
// records the scenario's full identity (including the literal decision sheets)
// so that editing it fails an assertion instead of quietly shrinking coverage.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildFixture, CHECKPOINT_YEARS } from '../tests/helpers/yearGoldenRun.ts'

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'advanceYear-golden.json'
)

const fixture = buildFixture()
writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8')

console.log(`Wrote ${outPath}`)
console.log(`Checkpoints at years: ${CHECKPOINT_YEARS.join(', ')}`)
// Printed so whoever regenerates can see at a glance whether the scenario still
// reaches every branch it is supposed to. A zero here is a broken baseline, not
// a quiet one — yearGolden.test.ts asserts the same thing.
console.log('Branch coverage over the run:')
for (const [branch, count] of Object.entries(fixture.coverage)) {
  console.log(`  ${count === 0 ? '!!' : '  '} ${branch}: ${count}`)
}
