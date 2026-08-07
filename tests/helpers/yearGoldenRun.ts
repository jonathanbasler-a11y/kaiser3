// THE SCENARIO DEFINITION for the reducer golden fixture
// (tests/fixtures/advanceYear-golden.json).
//
// Was `advanceYear-noguild-golden.json` from 21.0 through 21.7b, where it did
// exactly the job its name described: pin the reducer's behaviour so each
// tranche had to PROVE what it changed. It was regenerated once in that span,
// deliberately and with a reviewed diff, at 21.4 when the feed dial was re-based
// (unrest 28.6 -> 13.6) — so "held byte-identical throughout" would overstate
// it; "moved only when a tranche meant it to" is the accurate claim.
//
// Renamed at 21.8, when guild petitions began firing and the baseline
// deliberately moved. Keeping a fixture called "noguild" whose checkpoints
// contain guilds would be precisely the stale-name trap this codebase keeps
// getting bitten by. The file is the same lineage (git mv), not a fresh start.
//
// Shared deliberately by scripts/gen-year-golden.ts (which writes the fixture)
// and tests/yearGolden.test.ts (which checks live output against it), so the two
// cannot drift into running different scenarios and comparing the results anyway.
//
// EDITING THIS FILE INVALIDATES THE COMMITTED FIXTURE. That is the trade-off of
// sharing: a change here moves both sides at once. The mitigation is that the
// fixture records the scenario's full identity — players, years, seed base,
// checkpoints, AND the literal decision sheets — and the test asserts every one
// of them. Weakening the scenario (dropping the sabotage strike, say) therefore
// shows up as a failed identity assertion, not as a quietly shrinking baseline.
// Do not tweak the scenario to make a failing test pass.
//
// WHY MULTI-PLAYER
// ----------------
// advanceYear constructs ONE SeededRng per year and draws from it across every
// id in activePlayerIds (year.ts:56, :105). A draw added or skipped for player A
// therefore shifts every subsequent roll for B and C. A solo fixture is
// structurally blind to that, which is the single likeliest way a future change
// breaks determinism here. It also cannot reach the cross-ruler passes at all:
// espionage (year.ts:343), warfare (year.ts:375), succession.
//
// WHY STATE ONLY, NOT THE CHRONICLE
// ---------------------------------
// The per-checkpoint snapshot is the game state; the chronicle is excluded on
// purpose. The chronicle is a report, and reporting changes (new breakdown
// fields, better event copy) should not force regeneration of a determinism
// baseline. A stray RNG draw changes the state, so state-only still catches what
// this guards. The one exception is the `coverage` block below, which records
// aggregate COUNTS off the chronicle — counts are insensitive to renaming or
// adding report fields, and they are what proves the scenario still exercises
// the branches it claims to.

import { advanceYear } from '../../src/engine/year.ts'
import { createStarterState } from '../../src/engine/starter.ts'
import { Decision, GameState, PlayerState } from '../../src/engine/state.ts'

// Matches the seeding convention used by the real game loop and the UI
// (gameLoop.ts:109 `seedBase + year * 1000`; app.ts:1631 `1 + year * 1000`).
export const SEED_BASE = 42
const seedForYear = (year: number): number => SEED_BASE + year * 1000

// 35 rather than a rounder 25: long enough that rank promotion used to land
// inside the run (~year 29 through 21.7b).
//
// IT NO LONGER DOES, and the reason is a genuine 21.8 finding rather than a
// fixture defect — though NOT the one an earlier draft of this comment claimed.
//
// The wrong story (written first, refuted by the committed fixture): "refusal
// unrest suppresses his population below the rank gate." All three parts are
// false. Unrest is 0 at every checkpoint (an +8 spike decays at 5/yr and is
// gone in two years), population RISES 1039 -> 2465, and it clears the 1900
// floor comfortably.
//
// The real mechanism is a knife-edge: alfred pays one 1,200 Taler charter fee
// in year 2, which leaves him at 1,852 against a market's 2,000 cost. He never
// crosses that threshold again, so he stops building entirely from year 3
// (constructionSpend is 0 every year thereafter), stays at 1 market and 1 mill,
// and eventually loses both to fire and sabotage. Pre-21.8 he compounded to 9
// markets, 9 mills, 37,647 Taler and Duke. The binding gate at year 35 is
// wealth (0 against 28,000), not population.
//
// One early charter fee cost him the compounding curve. That is the finding,
// and it is filed as BACKLOG S10 for 21.9's calibration.
//
// The scenario was NOT tuned to force the counter back up. Two earlier attempts
// are recorded because both were instructive: extending the span did nothing,
// and giving conrad markets so he could receive petitions inadvertently FUNDED
// his sabotage campaign (strikes 8 -> 17), raiding alfred even harder. Promotion
// semantics now get precise coverage in tests/guildReducer.test.ts, where a promoting
// player can simply be constructed; this fixture stays a determinism ratchet and
// records what the world actually does. The balance signal — that guild
// petitions can cost a poor builder his rank — is filed as BACKLOG S10.
export const TOTAL_YEARS = 35

// Snapshotting several points rather than only the end state: if this breaks,
// the first failing checkpoint localises the drift to a range of years instead
// of just saying "something, somewhere in 35 years, changed".
export const CHECKPOINT_YEARS = [1, 10, 25, 35] as const

export const PLAYERS = [
  { id: 'alfred', name: 'Alfred' },
  { id: 'brigitta', name: 'Brigitta' },
  { id: 'conrad', name: 'Conrad' }
] as const

// Three deliberately different constant sheets. Different so the rulers diverge
// and stay diverged (a fixture where everyone does the same thing would mask an
// ordering bug in the per-ruler loop), and constant so the fixture depends on
// the reducer alone and never on the planner.
//
// Between them they must enter every branch of the year pipeline that consumes
// RNG or crosses rulers. The `coverage` counters below are what actually holds
// them to that; these comments are only the intent.
export function sheetFor(playerId: string): Decision[] {
  switch (playerId) {
    // Builder: production buildings and mitigation, moderate taxes. Exercises
    // construction, the affordability-shortfall path (marketBuild outruns the
    // treasury in the early years), building income, and upkeep growth.
    case 'alfred':
      return [
        { type: 'grain', feedLevel: 'required' },
        { type: 'tax', vat: 20, incomeTax: 20, tariff: 0, justiceGraft: 0 },
        {
          type: 'construction',
          marketBuild: 1, millBuild: 1, palaceStages: 0, cathedralBuild: false,
          wellBuild: 1, hospitalBuild: 1, granaryBuild: 1, garrisonBuild: 0,
          tradingHouseBuild: 0
        },
        { type: 'espionage', guardHire: 1, saboteurHire: 0 },
        // 21.8: alfred ANSWERS his petitions, so the fixture covers the grant
        // branch — charterFee paid, a guild actually held, guild income and
        // upkeep flowing through buildings.ts. He is also conrad's sabotage
        // target, so holding guilds additionally exercises 21.7a's
        // prune-on-destruction inside the real reducer.
        { type: 'guild', action: 'grant' }
      ]

    // Prestige/tax path, and the belligerent. Heavy tax pushes unrest past the
    // tolerance threshold so unrest, emigration, and the revolt event are live
    // rather than dormant. The war decision is what carries steps 2.5 (military
    // investment) and 12.5 (warfare, including the ally-join loop that
    // BACKLOG.md R2 flags as an open conditional-draw site) into the baseline —
    // without it those branches run at zero or not at all. Truces gate the
    // declaration to roughly every fifth year, which exercises the truce path too.
    case 'brigitta':
      return [
        { type: 'grain', feedLevel: 'min' },
        { type: 'tax', vat: 60, incomeTax: 60, tariff: 20, justiceGraft: 30 },
        {
          type: 'construction',
          marketBuild: 0, millBuild: 0, palaceStages: 1, cathedralBuild: false,
          wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 1,
          tradingHouseBuild: 0
        },
        { type: 'espionage', guardHire: 0, saboteurHire: 0 },
        {
          type: 'war',
          declare: true, targetPlayerId: 'conrad', alliesRequested: ['alfred'],
          trainingInvest: 1, equipmentInvest: 1
        }
      ]

    // Schemer: the cross-ruler espionage pass is the part of the year where one
    // ruler's resolution can shift another's, so somebody has to actually strike.
    // Low tax and no construction keep him solvent enough to keep paying for
    // saboteurs across the full run — an earlier draft had him bankrupt by
    // year 10, which silently retired the branch this sheet exists to cover.
    case 'conrad':
      return [
        { type: 'grain', feedLevel: 'required', sellGrain: 40 },
        { type: 'tax', vat: 25, incomeTax: 25, tariff: 0, justiceGraft: 10 },
        {
          type: 'construction',
          marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
          wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0,
          tradingHouseBuild: 0
        },
        { type: 'land_trade', farmlanbuy: 50, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
        {
          type: 'espionage',
          guardHire: 0, saboteurHire: 1,
          targetPlayerId: 'alfred', saboteursCommitted: 1, mode: 'sabotage'
        },
      ]

    default:
      throw new Error(`No fixture sheet defined for player "${playerId}"`)
  }
}

export function decisionsForAll(): Record<string, Decision[]> {
  const sheets: Record<string, Decision[]> = {}
  for (const { id } of PLAYERS) sheets[id] = sheetFor(id)
  return sheets
}

// Aggregate counters proving the run actually entered the branches the sheets
// above claim to cover. Counts only — deliberately insensitive to chronicle
// field renames, so 21.2-style reporting changes cannot move them.
export interface CoverageCounters {
  strikesResolved: number
  warsResolved: number
  eventsFired: number
  positiveEventsFired: number
  promotions: number
  shortfallsNoted: number
  // 21.8 (D2). Pins that the scenario actually exercises the guild pipeline —
  // without these, a future change that silently stopped petitions firing would
  // move the checkpoints (caught) but give no clue WHY (not caught).
  guildPetitionsQueued: number
  guildsGranted: number
  guildRefusalsAndLapses: number
  promotionMoments: number
}

export interface YearGoldenFixture {
  // The scenario's full identity, so that editing the shared helper shows up as
  // a failed assertion rather than a silently different baseline.
  scenario: {
    players: string[]
    totalYears: number
    seedBase: number
    checkpointYears: number[]
    decisions: Record<string, Decision[]>
  }
  coverage: CoverageCounters
  // year -> game state at the end of that year, as structured JSON.
  // Structured rather than a serialized string so that a regeneration produces a
  // readable line-by-line diff. PLAN.md:753-755 records that fixture
  // regenerations are only accepted "confirmed by reading the diffs", and three
  // escaped 3 KB blobs would defeat that in practice — which matters most
  // exactly when 21.6 adds a field to PlayerState and a reviewer has to confirm
  // that the new empty field is the ONLY thing that changed.
  checkpoints: Record<string, PlayerState[] | unknown>
}

export function buildFixture(): YearGoldenFixture {
  let state: GameState = createStarterState(PLAYERS.map((p) => ({ id: p.id, name: p.name })))
  const decisions = decisionsForAll()
  const checkpoints: Record<string, unknown> = {}
  const coverage: CoverageCounters = {
    strikesResolved: 0,
    warsResolved: 0,
    eventsFired: 0,
    positiveEventsFired: 0,
    promotions: 0,
    shortfallsNoted: 0,
    guildPetitionsQueued: 0,
    guildsGranted: 0,
    guildRefusalsAndLapses: 0,
    promotionMoments: 0
  }

  for (let year = 0; year < TOTAL_YEARS; year++) {
    const result = advanceYear(state, decisions, seedForYear(year))
    state = result.state

    coverage.strikesResolved += result.chronicle.strikes.length
    coverage.warsResolved += result.chronicle.wars.length
    for (const report of Object.values(result.chronicle.playerReports)) {
      coverage.eventsFired += report.events.length
      coverage.shortfallsNoted += report.shortfalls.length
      if (report.positiveEvent) coverage.positiveEventsFired += 1
      if (report.rankPromoted) coverage.promotions += 1
      if (report.guildPetition) coverage.guildPetitionsQueued += 1
      if (report.guildResolution) {
        if (report.guildResolution.granted) coverage.guildsGranted += 1
        else coverage.guildRefusalsAndLapses += 1
      }
      if (report.charterSlotsAfterPromotion !== undefined) coverage.promotionMoments += 1
    }

    if ((CHECKPOINT_YEARS as readonly number[]).includes(state.year)) {
      // Round-tripped through JSON so the stored shape is exactly what
      // serialization produces (undefined fields dropped, no class instances),
      // while still being structured for diff readability.
      checkpoints[String(state.year)] = JSON.parse(JSON.stringify(state))
    }
  }

  return {
    scenario: {
      players: PLAYERS.map((p) => p.id),
      totalYears: TOTAL_YEARS,
      seedBase: SEED_BASE,
      checkpointYears: [...CHECKPOINT_YEARS],
      decisions
    },
    coverage,
    checkpoints
  }
}
