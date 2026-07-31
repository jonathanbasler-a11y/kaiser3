// Harvest, spoilage, and grain-feeding economics.
// Grain feeding outcomes follow the original Kaiser design: under-feeding causes
// unrest/emigration, over-feeding causes disease — both are real scarcity levers,
// not solved-once problems (see docs/kaiser-research.md § Where the Original Falls Short).

import economyData from '../../data/economy.json'
import { SeededRng } from './rng.ts'
import { GrainDecision, LandHolding, PopulationState } from './state.ts'

const HARVEST = economyData.harvest
const POP_ECONOMY = economyData.population

export interface HarvestResult {
  productiveFarmland: number   // Farmland actually worked (labor-gated)
  grossYield: number           // New grain produced this year
  spoiledFromStock: number     // Grain lost to spoilage from last year's carry-over
  newGrainStock: number        // grainStock after spoilage + new yield (before feeding)
}

// Farmland beyond available peasant labor produces nothing — a hard scarcity
// ceiling from the period (land without labor is worthless).
export function laborGatedFarmland(land: LandHolding, population: PopulationState): number {
  const laborCapacity = population.peasants * HARVEST.laborHectaresPerPeasant
  return Math.min(land.farmland, laborCapacity)
}

export function calculateHarvest(
  land: LandHolding,
  population: PopulationState,
  previousGrainStock: number,
  rng: SeededRng
): HarvestResult {
  const productiveFarmland = laborGatedFarmland(land, population)
  const weatherMultiplier = Math.max(0, rng.nextGaussian(HARVEST.weatherVariance))
  const grossYield = productiveFarmland * HARVEST.baseYieldPerHectare * weatherMultiplier

  // Spoilage applies to grain carried over from last year, before this year's harvest is added —
  // stockpiles rot; hoarding is not a free scarcity workaround.
  const spoiledFromStock = previousGrainStock * HARVEST.spoilagePercentage
  const stockAfterSpoilage = previousGrainStock - spoiledFromStock
  const newGrainStock = Math.max(0, stockAfterSpoilage) + grossYield

  return { productiveFarmland, grossYield, spoiledFromStock, newGrainStock }
}

export interface FeedingResult {
  grainConsumed: number
  grainStockAfter: number
  feedAdequacy: number   // fraction of required grain actually delivered (0 = starving, 1 = fully met, >1 = overfed)
  isUnderfed: boolean    // below the 'required' threshold — triggers unrest/emigration
  isOverfed: boolean     // above the 'max' (80%) threshold — triggers disease risk
}

export function resolveFeeding(
  decision: GrainDecision,
  population: PopulationState,
  grainStockBeforeFeeding: number
): FeedingResult {
  const requiredGrain = population.peasants * POP_ECONOMY.populationGrainRequirement

  // The original's dial (C64-Wiki): Maximum (80% of stock), Minimum (20% of stock),
  // Required amount (exactly what the population needs), or Custom (20-80% of stock).
  let grainOffered: number
  switch (decision.feedLevel) {
    case 'min':
      grainOffered = grainStockBeforeFeeding * 0.2
      break
    case 'max':
      grainOffered = grainStockBeforeFeeding * 0.8
      break
    case 'required':
      grainOffered = requiredGrain
      break
    case 'custom': {
      const pct = Math.min(80, Math.max(20, decision.customPercentage ?? 50))
      grainOffered = grainStockBeforeFeeding * (pct / 100)
      break
    }
  }

  const grainConsumed = Math.min(grainOffered, grainStockBeforeFeeding)
  const grainStockAfter = grainStockBeforeFeeding - grainConsumed

  const feedAdequacy = requiredGrain > 0 ? grainConsumed / requiredGrain : 1

  return {
    grainConsumed,
    grainStockAfter,
    feedAdequacy,
    isUnderfed: feedAdequacy < 0.9,
    isOverfed: feedAdequacy > 1.4
  }
}
