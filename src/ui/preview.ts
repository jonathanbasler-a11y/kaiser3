// Phase 18B — live, reversible spend/outcome preview.
//
// Root cause this exists to fix: year.ts's decision pipeline spends from the
// SAME treasury in a fixed order (land trading, then recruitment, then
// construction), so a player queuing a land purchase and a market build in
// the same turn could have the market silently clamped to 0 with no warning
// until the year report (see A2). Reimplementing that spending order client
// -side to preview it would just create a second copy that could drift from
// the real one. Instead this calls the REAL advanceYear() on a throwaway
// clone of the current state and reads back what actually happened —
// impossible to disagree with the engine because it IS the engine.
//
// Rival AI decisions (planYear) are cached per real GameState object rather
// than recomputed on every preview call: planYear is a genuine search over
// candidate decisions (Phase 12's perf work exists because of it), while the
// human-side advanceYear() pass is a single deterministic pass with no
// search. Since rivals only replan when the real state actually advances
// (a new GameState object from resolveYear(), or a new game), keying the
// cache on state object identity (===) gives correct invalidation for free —
// no separate "clear on new turn" bookkeeping needed.

import { GameState, Decision, cloneGameState } from '../engine/state.ts'
import { advanceYear } from '../engine/year.ts'
import { planYear } from '../ai/planner.ts'
import { planningSeed } from '../ai/planningSeed.ts'
import { Personality } from '../ai/personalities.ts'
import { DifficultyPreset } from '../ai/difficulty.ts'
import { DecisionDraft, draftToDecisions } from './decisions.ts'

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
  /** Chronicle fields so Grain tiles can share the same harvest oracle as the footer. */
  harvestYield: number
  spoilage: number
  grainOverflowLost: number
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
  // advanceYear() already clones its input internally, but cloning here too
  // means this preview is provably unable to touch the real session state
  // even if that internal changes.
  const result = advanceYear(cloneGameState(state), decisions, seed)
  const humanAfter = result.state.players[humanId]
  const report = result.chronicle.playerReports[humanId]
  if (!humanAfter || !report) return null

  return {
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
    harvestYield: report.harvestYield,
    spoilage: report.spoilage,
    grainOverflowLost: report.grainOverflowLost
  }
}
