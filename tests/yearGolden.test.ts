// CROSS-PROCESS GOLDEN — guards advanceYear (the reducer) against silent drift.
//
// This is deliberately NOT determinism.test.ts. That one proves two runs *in the
// same process* agree, which a change that CONSISTENTLY shifts the output still
// satisfies — replay a wrong world twice and it matches itself perfectly.
// Verified: injecting a single conditional `rng.next()` for one player in
// year.ts leaves determinism.test.ts green and turns every checkpoint here red.
// That gap is this file's entire reason to exist.
//
// RELATIONSHIP TO golden.test.ts (planner-golden.json)
// ----------------------------------------------------
// That fixture guards planYear; this one guards advanceYear, and never calls the
// planner. The isolation runs in ONE direction only: a planner change moves only
// planner-golden.json, but a REDUCER change moves both, because golden.test.ts
// plays 19 real years forward before planning (golden.test.ts:36-44). PLAN.md
// records two reducer-only changes (F6, corn-price drift) that forced a
// planner-golden regeneration for exactly this reason. So when both go red,
// the reducer is the suspect; when only planner-golden does, the AI is.
//
// IF THIS TEST FAILS, THAT IS THE FINDING. Regenerating the fixture to make it
// green launders a real regression into the baseline. Regenerate only when the
// reducer change is deliberate and reviewed, in the same commit as the change.

import { describe, it, expect, beforeAll } from 'vitest'
import golden from './fixtures/advanceYear-noguild-golden.json'
import {
  buildFixture,
  decisionsForAll,
  CHECKPOINT_YEARS,
  CoverageCounters,
  PLAYERS,
  SEED_BASE,
  TOTAL_YEARS,
  YearGoldenFixture
} from './helpers/yearGoldenRun.ts'

const committed = golden as unknown as YearGoldenFixture

describe('advanceYear cross-process golden', () => {
  let live: YearGoldenFixture

  // Built in beforeAll rather than in the describe body so that a throw inside
  // the reducer surfaces as a named test failure instead of a suite-collection
  // error, and so the 25-year run happens once rather than per assertion.
  beforeAll(() => {
    live = buildFixture()
  })

  // Guards the shared scenario helper itself. Without this, editing
  // yearGoldenRun.ts would move the live side and the fixture side together on
  // the next regeneration, and every comparison below would keep passing while
  // silently measuring something else. The decision sheets are pinned too —
  // they are the most behaviour-determining part of the scenario, so "simplify
  // the sheets, regenerate, still green" is the failure mode most worth closing.
  describe('scenario identity', () => {
    it('runs the same players, span, and seed base the fixture was generated from', () => {
      expect(committed.scenario.players).toEqual(PLAYERS.map((p) => p.id))
      expect(committed.scenario.totalYears).toBe(TOTAL_YEARS)
      expect(committed.scenario.seedBase).toBe(SEED_BASE)
      expect(committed.scenario.checkpointYears).toEqual([...CHECKPOINT_YEARS])
    })

    it('runs the same decision sheets the fixture was generated from', () => {
      expect(committed.scenario.decisions).toEqual(decisionsForAll())
    })

    it('has a committed snapshot for every checkpoint', () => {
      for (const year of CHECKPOINT_YEARS) {
        expect(
          committed.checkpoints[String(year)],
          `missing checkpoint for year ${year}`
        ).toBeTruthy()
      }
    })
  })

  // A baseline that quietly stops exercising a branch is worse than no baseline,
  // because it still reads as coverage. These assert the scenario actually
  // enters the paths its sheets claim to — in particular the cross-ruler
  // espionage and warfare passes, which are where one ruler's resolution can
  // shift another's and where a solo fixture would see nothing at all.
  describe('scenario coverage (the sheets do what they claim)', () => {
    const branches: Array<[keyof CoverageCounters, string]> = [
      ['strikesResolved', 'cross-ruler espionage (year.ts:343)'],
      ['warsResolved', 'warfare + ally-join loop (year.ts:375)'],
      ['eventsFired', 'the negative event catalog (year.ts:304)'],
      ['positiveEventsFired', 'positive events (year.ts:~318)'],
      ['shortfallsNoted', 'the affordability-shortfall path'],
      // Directly load-bearing for phase 21.8, which makes promotion do something
      // besides set a flag. Only reachable because the run is 35 years long.
      ['promotions', 'rank promotion (year.ts step 13)']
    ]

    for (const [counter, description] of branches) {
      it(`enters ${description}`, () => {
        expect(live.coverage[counter], `${counter} was zero — branch never entered`).toBeGreaterThan(0)
      })
    }

    it('matches the committed coverage counts', () => {
      expect(live.coverage).toEqual(committed.coverage)
    })
  })

  describe('state snapshots', () => {
    for (const year of CHECKPOINT_YEARS) {
      it(`state after year ${year} is identical to the committed baseline`, () => {
        expect(live.checkpoints[String(year)]).toEqual(committed.checkpoints[String(year)])
      })
    }
  })
})
