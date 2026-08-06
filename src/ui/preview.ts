// Phase 18B — live, reversible spend/outcome preview.
// Phase 21.3 — the harvest half of it became a forecast (issue #46).
//
// Root cause this exists to fix: year.ts's decision pipeline spends from the
// SAME treasury in a fixed order (land trading, then recruitment, then
// construction), so a player queuing a land purchase and a market build in
// the same turn could have the market silently clamped to 0 with no warning
// until the year report (see A2). Reimplementing that spending order client
// -side to preview it would just create a second copy that could drift from
// the real one. Instead this calls the REAL advanceYear() on a throwaway
// clone of the current state and reads back what actually happened.
//
// PRECISELY WHAT THIS DOES AND DOES NOT PROMISE, since 21.3 split the two.
// This is still the engine, not a second calculator — the "two calculators"
// failure uiCoherence.test.ts exists to prevent is still prevented, because
// every number below comes out of a real advanceYear() run. But it is no longer
// a promise about what WILL happen, and that distinction is now load-bearing:
//
//   Steps 1-3 of the year (land trading, recruitment, construction) run BEFORE
//   the harvest at step 4 and consume no weather, so shortfalls — the A2 reason
//   this file exists — remain exact predictions.
//
//   Everything downstream of step 4 is a FORECAST. previewYear resolves three
//   named weather bands and reports the middle one, and deliberately never runs
//   the true roll, because doing so leaked the exact harvest to the player
//   before they committed (see the long note in previewYear).
//
// Rival AI decisions (planYear) are cached per real GameState object rather
// than recomputed on every preview call: planYear is a genuine search over
// candidate decisions (Phase 12's perf work exists because of it), while the
// human-side advanceYear() pass is a single deterministic pass with no
// search. Since rivals only replan when the real state actually advances
// (a new GameState object from resolveYear(), or a new game), keying the
// cache on state object identity (===) gives correct invalidation for free —
// no separate "clear on new turn" bookkeeping needed.

import economyData from '../../data/economy.json'
import { GameState, Decision, PlayerChronicle, cloneGameState } from '../engine/state.ts'
import { advanceYear } from '../engine/year.ts'
import { getWeatherBands } from '../engine/economy.ts'
import { planYear } from '../ai/planner.ts'
import { planningSeed } from '../ai/planningSeed.ts'
import { Personality } from '../ai/personalities.ts'
import { DifficultyPreset } from '../ai/difficulty.ts'
import { DecisionDraft, draftToDecisions } from './decisions.ts'

const FORECAST_BANDS = economyData.harvest.forecastBands

// Fail at import if a forecast band id does not resolve, matching
// validateEventCatalog()'s house rule that invalid data can never reach a
// running game. Without this a typo degrades silently to the true roll
// (economy.ts rollWeather) — which does not merely lose the forecast, it
// SILENTLY REINTRODUCES BUG #46, and takes the caveat down with it because
// forecastRangeIsNarrowerThanPossible() would return false too.
for (const [role, id] of Object.entries(FORECAST_BANDS)) {
  if (!getWeatherBands().some((band) => band.id === id)) {
    throw new Error(
      `data/economy.json harvest.forecastBands.${role} = "${id}" is not a weather band id. ` +
      `Known: ${getWeatherBands().map((b) => b.id).join(', ')}`
    )
  }
}

/** Whether the simulation can roll outside the stated low..high range. True with
 *  the shipped band table (drought/poor below lean, bountiful/glut above good),
 *  and computed rather than assumed so that widening `forecastBands` in data
 *  quietly drops the UI's caveat instead of leaving it lying. */
function forecastRangeIsNarrowerThanPossible(): boolean {
  const bands = getWeatherBands()
  const lowBand = bands.find((b) => b.id === FORECAST_BANDS.low)
  const highBand = bands.find((b) => b.id === FORECAST_BANDS.high)
  if (!lowBand || !highBand) return false
  return bands.some((b) => b.multiplier < lowBand.multiplier || b.multiplier > highBand.multiplier)
}

/** Share of the band weight falling BELOW the stated forecast floor. The
 *  downside tail is what a player reserving grain actually needs to size, and
 *  it is not symmetric with the upside: a drought is 35% of the stated low.
 *  Computed from the band table so retuning the data cannot leave a stale
 *  number in the UI. */
export function downsideTailProbability(): number {
  const bands = getWeatherBands()
  const lowBand = bands.find((b) => b.id === FORECAST_BANDS.low)
  if (!lowBand) return 0
  const total = bands.reduce((sum, b) => sum + b.weight, 0)
  if (total <= 0) return 0
  const below = bands.filter((b) => b.multiplier < lowBand.multiplier).reduce((s, b) => s + b.weight, 0)
  return below / total
}

let rivalDecisionsCache: { stateRef: GameState; decisions: Record<string, Decision[]> } | null = null

function rivalDecisionsFor(
  state: GameState,
  rivals: Map<string, Personality>,
  difficulty: DifficultyPreset
): Record<string, Decision[]> {
  if (rivalDecisionsCache && rivalDecisionsCache.stateRef === state) {
    return rivalDecisionsCache.decisions
  }
  const decisions: Record<string, Decision[]> = {}
  const year = state.year
  for (const [id, personality] of rivals) {
    if (!state.activePlayerIds.includes(id)) continue
    // Same seed formula resolveYear() actually uses (app.ts) — this is not a
    // placeholder, it's the REAL seed for this turn, so a preview taken right
    // before End Year matches what End Year will actually produce.
    const seed = planningSeed(5000, year, id)
    decisions[id] = planYear(state, id, personality, seed, difficulty.rivalEvaluationSeeds)
  }
  rivalDecisionsCache = { stateRef: state, decisions }
  return decisions
}

export interface YearPreview {
  talerBefore: number
  talerAfter: number
  populationBefore: number
  populationAfter: number
  guardsAfter: number
  garrisonAfter: number
  trainingLevelAfter: number
  equipmentLevelAfter: number
  unrestAfter: number
  shortfalls: string[]
  rankPromoted: boolean
  /** Population components (bug report #28: neither the forecast nor the
   *  year-end report broke down WHY population changed — only the net delta
   *  was shown anywhere). Same chronicle fields buildReportEntries uses. */
  births: number
  deaths: number
  emigration: number
  immigration: number
  /** Event deaths (plague etc.) applied AFTER population dynamics — must be in the UI sum. */
  eventPopulationLoss: number
  /** Pass-through income fields for footer/tax tooltips (already on the chronicle). */
  taxIncome: number
  tariffIncome: number
  tributeIncome: number
  marketIncome: number
  millIncome: number
  tradingHouseIncome: number
  grainTradeIncome: number
  upkeepCost: number
  /** Chronicle fields so Grain tiles can share the same harvest oracle as the footer.
   *  These come from the EXPECTED forecast run, not the true roll — see previewYear. */
  harvestYield: number
  spoilage: number
  grainOverflowLost: number
  /** Issue #46: the pre-commit harvest range. */
  outlook: HarvestOutlook
  /** Issue #47: why immigration is or is not flowing. Straight from the engine's
   *  own gate evaluation — the UI must not re-derive the condition. */
  immigrationGate: PlayerChronicle['immigrationGate']
  /** Issue #50a: what the feed dial asked for vs what the barn covered. */
  feedTargetAdequacy: number
  feedAdequacy: number
}

/** One forecast branch — the whole year resolved under a named weather band. */
export interface ForecastBranch {
  bandId: string
  bandName: string
  harvestYield: number
  spoilage: number
  grainOverflowLost: number
  populationAfter: number
  talerAfter: number
  /** checkPromotion reads taler AND population, both of which move with the
   *  harvest — so a promotion can be real in a good year and revoked in a lean
   *  one. The footer needs all three branches to avoid promising a coronation
   *  the weather can take back. */
  rankPromoted: boolean
}

/** Issue #46. `expected` is the headline; `low`/`high` bracket the usual range.
 *  Deliberately NOT the full drought..glut span — see `_forecastNote` in
 *  data/economy.json for why a 0.3x-1.85x range would forecast nothing. */
export interface HarvestOutlook {
  low: ForecastBranch
  expected: ForecastBranch
  high: ForecastBranch
  /** True when the stated range is narrower than what the simulation can roll,
   *  so the UI can say so instead of implying a floor that does not exist. */
  tailsExcluded: boolean
}

// War-tab odds need the army AFTER same-turn spending, but BEFORE the selected
// war itself applies casualties, transfers, or reparations.
export function warSnapshotDraft(draft: DecisionDraft): DecisionDraft {
  return {
    ...draft,
    declareWar: false,
    warTargetPlayerId: null,
    warAlliesRequested: []
  }
}

// Runs the real advanceYear() with the human's IN-PROGRESS draft and rivals'
// real planned decisions, on a cloned state, and discards everything except
// the human's before/after numbers and any shortfalls — never touches the
// real session state.
export function previewYear(
  state: GameState,
  humanId: string,
  draft: DecisionDraft,
  rivals: Map<string, Personality>,
  difficulty: DifficultyPreset
): YearPreview | null {
  const humanBefore = state.players[humanId]
  if (!humanBefore || humanBefore.dead) return null

  const decisions: Record<string, Decision[]> = {
    ...rivalDecisionsFor(state, rivals, difficulty),
    [humanId]: draftToDecisions(draft)
  }

  const seed = 1 + state.year * 1000

  // ISSUE #46 — this deliberately never runs the true weather roll.
  //
  // It used to. The preview called the real advanceYear with the real seed, so
  // it knew the exact harvest before the player committed, and hiding the number
  // on the Grain tab would not have been enough: the sticky footer's
  // `Population +/-N` is derived from feed adequacy, which is derived from the
  // harvest, so the true figure leaked through it anyway. The leak was
  // structural, so the fix is structural — the preview now resolves three named
  // bands and reports the middle one, and the true roll surfaces for the first
  // time in the year report.
  //
  // What stays exact: steps 1-3 of the year (land trading, recruitment,
  // construction) all run BEFORE the harvest at step 4, so shortfalls — the
  // whole reason this preview exists (A2) — are unaffected by which band runs.
  // What becomes a forecast: everything downstream of the harvest.
  //
  // All three runs share one seed, so the within-band jitter and every later
  // draw are identical across them. The only thing that differs is the band,
  // which makes the three cleanly comparable rather than three separate futures.
  const runBand = (bandId: string): { branch: ForecastBranch; full: ReturnType<typeof advanceYear> } | null => {
    // advanceYear() already clones its input internally, but cloning here too
    // means this preview is provably unable to touch the real session state
    // even if that internal changes.
    const run = advanceYear(cloneGameState(state), decisions, seed, {
      weatherOverrides: { [humanId]: bandId }
    })
    const after = run.state.players[humanId]
    const rep = run.chronicle.playerReports[humanId]
    if (!after || !rep) return null
    return {
      branch: {
        bandId: rep.weatherId,
        bandName: rep.weatherName,
        harvestYield: rep.harvestYield,
        spoilage: rep.spoilage,
        grainOverflowLost: rep.grainOverflowLost,
        populationAfter: after.population.peasants,
        talerAfter: after.taler,
        rankPromoted: rep.rankPromoted
      },
      full: run
    }
  }

  const low = runBand(FORECAST_BANDS.low)
  const expected = runBand(FORECAST_BANDS.expected)
  const high = runBand(FORECAST_BANDS.high)
  if (!low || !expected || !high) return null

  // The headline numbers are the EXPECTED branch — the player's central case.
  const result = expected.full
  const humanAfter = result.state.players[humanId]
  const report = result.chronicle.playerReports[humanId]
  if (!humanAfter || !report) return null

  return {
    outlook: {
      low: low.branch,
      expected: expected.branch,
      high: high.branch,
      tailsExcluded: forecastRangeIsNarrowerThanPossible()
    },
    talerBefore: humanBefore.taler,
    talerAfter: humanAfter.taler,
    populationBefore: humanBefore.population.peasants,
    populationAfter: humanAfter.population.peasants,
    guardsAfter: humanAfter.guards,
    garrisonAfter: humanAfter.buildings.garrison,
    trainingLevelAfter: humanAfter.trainingLevel ?? 0,
    equipmentLevelAfter: humanAfter.equipmentLevel ?? 0,
    unrestAfter: humanAfter.population.unrest,
    shortfalls: report.shortfalls,
    rankPromoted: report.rankPromoted,
    births: report.births,
    deaths: report.deaths,
    emigration: report.emigration,
    immigration: report.immigration,
    eventPopulationLoss: report.eventPopulationLoss,
    taxIncome: report.taxIncome,
    tariffIncome: report.tariffIncome,
    tributeIncome: report.tributeIncome,
    marketIncome: report.marketIncome,
    millIncome: report.millIncome,
    tradingHouseIncome: report.tradingHouseIncome,
    grainTradeIncome: report.grainTradeIncome,
    upkeepCost: report.upkeepCost,
    harvestYield: report.harvestYield,
    spoilage: report.spoilage,
    grainOverflowLost: report.grainOverflowLost,
    immigrationGate: report.immigrationGate,
    feedTargetAdequacy: report.feedTargetAdequacy ?? 1,
    feedAdequacy: report.feedAdequacy ?? 1
  }
}
