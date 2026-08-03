// Difficulty presets, loaded and validated from data/difficulty.json — same
// data-driven pattern as personalities.ts (Phase 13). A preset varies rival
// EVALUATOR QUALITY (how many futures a rival's planner weighs before
// committing — see planner.ts's optional evaluationSeeds override) and rival
// STARTING ASYMMETRY (a head-start/handicap on taler, farmland, and
// population, applied only to rivals via starter.ts's
// applyStartingMultiplier). It never touches game rules — no threshold,
// upkeep curve, or event formula moves. See data/difficulty.json's own
// comment and docs/kaiser-research.md's product requirement that difficulty
// vary opponent competence, not the rules. Population is required (D6):
// taler/farmland alone do not reliably handicap when farmland stays above
// the labor gate.

import difficultyData from '../../data/difficulty.json'

export interface StartingMultiplier {
  taler: number
  farmland: number
  population: number
}

export interface DifficultyPreset {
  id: string
  name: string
  description: string
  rivalEvaluationSeeds: number
  rivalStartingMultiplier: StartingMultiplier
}

const PRESETS = difficultyData.presets as DifficultyPreset[]

// Fails fast on malformed data, same discipline as validatePersonalities().
export function validateDifficultyPresets(presets: DifficultyPreset[] = PRESETS): void {
  const seen = new Set<string>()

  for (const preset of presets) {
    if (seen.has(preset.id)) {
      throw new Error(`Difficulty catalog: duplicate preset id "${preset.id}"`)
    }
    seen.add(preset.id)

    if (!Number.isInteger(preset.rivalEvaluationSeeds) || preset.rivalEvaluationSeeds < 1) {
      throw new Error(`Difficulty "${preset.id}" must have rivalEvaluationSeeds >= 1 (got ${preset.rivalEvaluationSeeds})`)
    }
    const mult = preset.rivalStartingMultiplier
    if (!mult || !(mult.taler > 0) || !(mult.farmland > 0) || !(mult.population > 0)) {
      throw new Error(`Difficulty "${preset.id}" must have positive taler/farmland/population starting multipliers`)
    }
  }
}

validateDifficultyPresets()

export function getDifficultyPresets(): DifficultyPreset[] {
  return PRESETS
}

export function getDifficultyPreset(id: string): DifficultyPreset {
  const found = PRESETS.find((p) => p.id === id)
  if (!found) throw new Error(`Unknown difficulty preset "${id}"`)
  return found
}

export const DEFAULT_DIFFICULTY_ID = 'standard'
