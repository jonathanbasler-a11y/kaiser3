// AI archetypes, loaded and validated from data/personalities.json.
// Personalities are pure data — tuning them is a JSON edit, never a code change.

import personalitiesData from '../../data/personalities.json'
import { PersonalityWeights } from './evaluator.ts'

export interface Personality {
  id: string
  name: string
  description: string
  weights: PersonalityWeights
}

const REQUIRED_WEIGHTS: Array<keyof PersonalityWeights> = [
  'wealth', 'population', 'land', 'production', 'prestige',
  'rank', 'unrest', 'grainSecurity', 'risk', 'riskHorizonYears'
]

const ARCHETYPES = personalitiesData.archetypes as Personality[]

// Fails fast on malformed personality data rather than silently producing an AI
// that ignores a whole utility term because of a typo'd key.
export function validatePersonalities(archetypes: Personality[] = ARCHETYPES): void {
  const seen = new Set<string>()

  for (const archetype of archetypes) {
    if (seen.has(archetype.id)) {
      throw new Error(`Personality catalog: duplicate archetype id "${archetype.id}"`)
    }
    seen.add(archetype.id)

    for (const key of REQUIRED_WEIGHTS) {
      const value = archetype.weights?.[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Personality "${archetype.id}" is missing a finite weight for "${key}"`)
      }
    }

    if (archetype.weights.riskHorizonYears < 1) {
      throw new Error(`Personality "${archetype.id}" has riskHorizonYears < 1 — it would never value mitigation buildings.`)
    }
  }
}

validatePersonalities()

export function getPersonalities(): Personality[] {
  return ARCHETYPES
}

export function getPersonality(id: string): Personality {
  const found = ARCHETYPES.find((a) => a.id === id)
  if (!found) throw new Error(`Unknown personality "${id}"`)
  return found
}
