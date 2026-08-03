// Population dynamics: births, deaths, migration, unrest — driven by feeding
// adequacy from economy.ts. Mirrors the original Kaiser's core tension:
// under-feed → unrest & emigration; over-feed → disease & mortality.

import economyData from '../../data/economy.json'
import { SeededRng } from './rng.ts'
import { PopulationState } from './state.ts'
import { FeedingResult } from './economy.ts'

const POP_ECONOMY = economyData.population
const FEEDING = economyData.feeding

export interface PopulationDynamicsResult {
  births: number
  deaths: number
  emigration: number
  immigration: number
  newPopulation: PopulationState
}

export function applyPopulationDynamics(
  population: PopulationState,
  feeding: FeedingResult,
  rng: SeededRng
): PopulationDynamicsResult {
  // Unrest moves toward a target driven by feeding adequacy: underfed years push it up,
  // adequately-fed years let it decay. Unrest never fully vanishes to zero instantly —
  // it's a slow-moving pressure gauge, not a switch.
  let unrest = population.unrest
  if (feeding.isUnderfed) {
    const shortfall = Math.max(0, FEEDING.underfedAdequacy - feeding.feedAdequacy)
    unrest += shortfall * POP_ECONOMY.unrestShortfallScale
  } else {
    unrest = Math.max(0, unrest - POP_ECONOMY.unrestDecayPerYear)
  }
  unrest = Math.min(100, Math.max(0, unrest))

  // Births: scale with feeding adequacy (capped at 1.0 — overfeeding doesn't boost births further)
  // and dampened by unrest (an unhappy populace has fewer children).
  const birthAdequacyFactor = Math.min(1, feeding.feedAdequacy)
  const unrestDamping = 1 - unrest / POP_ECONOMY.unrestBirthDampingDivisor
  const births = population.peasants * POP_ECONOMY.birthRateBase * birthAdequacyFactor * unrestDamping

  // Deaths: base rate, plus disease mortality if overfed, plus starvation mortality if severely underfed.
  let deaths = population.peasants * POP_ECONOMY.deathRateBase
  if (feeding.isOverfed) {
    deaths += population.peasants * POP_ECONOMY.diseaseOverfeedMortality
  }
  if (feeding.feedAdequacy < POP_ECONOMY.starvationAdequacyThreshold) {
    deaths += population.peasants * POP_ECONOMY.starvationMortality
  }

  // Emigration: triggered once unrest crosses the tolerance threshold, scaling with the excess.
  let emigration = 0
  if (unrest > POP_ECONOMY.unrestEmigrationThreshold) {
    const excess = (unrest - POP_ECONOMY.unrestEmigrationThreshold) / (100 - POP_ECONOMY.unrestEmigrationThreshold)
    emigration = population.peasants * POP_ECONOMY.emigrationRate * excess
  }

  // Immigration: only applied when the principality is genuinely thriving, but the draw
  // is unconditional so gated immigration does not shift downstream seeded rolls.
  let immigration = 0
  const immigrationRoll = rng.next()
  if (
    unrest < POP_ECONOMY.immigrationMaxUnrest
    && feeding.feedAdequacy >= POP_ECONOMY.immigrationMinAdequacy
    && feeding.feedAdequacy <= POP_ECONOMY.immigrationMaxAdequacy
  ) {
    immigration = population.peasants * POP_ECONOMY.immigrationRate * immigrationRoll
  }

  const newPeasants = Math.max(0, population.peasants + births - deaths - emigration + immigration)

  return {
    births,
    deaths,
    emigration,
    immigration,
    newPopulation: { peasants: newPeasants, unrest }
  }
}
