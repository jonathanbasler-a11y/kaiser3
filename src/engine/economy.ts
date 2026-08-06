// Harvest, spoilage, and grain-feeding economics.
// Grain feeding outcomes follow the original Kaiser design: under-feeding causes
// unrest/emigration, over-feeding causes disease — both are real scarcity levers,
// not solved-once problems (see docs/kaiser-research.md § Where the Original Falls Short).

import economyData from '../../data/economy.json'
import { SeededRng } from './rng.ts'
import { GrainDecision, LandHolding, PopulationState } from './state.ts'
import { finiteOr } from './sanitize.ts'

const HARVEST = economyData.harvest
const STORAGE = economyData.storage
const PRICES = economyData.prices
const POP_ECONOMY = economyData.population
const FEEDING = economyData.feeding

export interface WeatherBand {
  id: string
  name: string
  multiplier: number
  weight: number
}

const WEATHER_BANDS = HARVEST.weatherBands as WeatherBand[]
const TOTAL_WEATHER_WEIGHT = WEATHER_BANDS.reduce((sum, band) => sum + band.weight, 0)

/** A weather band's `id` from data/economy.json — not a closed union, because the
 *  band list is data and a hardcoded union here would go stale the moment one is
 *  added. Unknown ids fall back to the real roll rather than throwing. */
export type WeatherBandId = string

export function getWeatherBands(): readonly WeatherBand[] {
  return WEATHER_BANDS
}

// Draws a named weather band. Bands rather than a narrow bell curve: a drought
// should be an event a player remembers and plans around, not a 15% dip lost in
// the noise. The long-run mean is close to 1, so the variance is drama rather
// than a hidden tax.
//
// `override` powers forecast mode (issue #46). THE DRAW STILL HAPPENS when it is
// set, and that is the whole point rather than an oversight: the rng is shared
// across every player and every later step of the year, so returning early
// without drawing would shift the stream and make a forecast run diverge from
// the real one for reasons that have nothing to do with the weather. Consume,
// discard, return the named band.
export function rollWeather(rng: SeededRng, override?: WeatherBandId): WeatherBand {
  let roll = rng.next() * TOTAL_WEATHER_WEIGHT

  if (override !== undefined) {
    const named = WEATHER_BANDS.find((band) => band.id === override)
    if (named) return named
    // Unrecognised id degrades to the real roll — same principle as the
    // feedLevel default branch below: malformed input takes the safe path
    // instead of poisoning the simulation.
  }

  for (const band of WEATHER_BANDS) {
    roll -= band.weight
    if (roll <= 0) return band
  }
  return WEATHER_BANDS[WEATHER_BANDS.length - 1]
}

export function annualGrainRequirement(population: PopulationState): number {
  return population.peasants * POP_ECONOMY.populationGrainRequirement
}

/** Years of consumption currently in the barn (Infinity if demand is zero). */
export function yearsOfFoodHeld(grainStock: number, population: PopulationState): number {
  const required = annualGrainRequirement(population)
  if (required <= 0) return Infinity
  return grainStock / required
}

// How much grain a realm can actually keep, expressed in years of consumption so
// it scales with the realm rather than becoming irrelevant as it grows. Grain
// above this simply rots in the barn.
export function storageCapacity(population: PopulationState, granaries: number): number {
  const years = STORAGE.baseCapacityYears + (granaries > 0 ? STORAGE.granaryCapacityBonusYears : 0)
  return annualGrainRequirement(population) * years
}

export interface HarvestResult {
  productiveFarmland: number   // Farmland actually worked (labor-gated)
  grossYield: number           // New grain produced this year
  spoiledFromStock: number     // Grain lost to spoilage from last year's carry-over
  overflowLost: number         // Grain that exceeded what the realm can store, left to rot
  weather: WeatherBand         // The year's weather, for the chronicle
  newGrainStock: number        // grainStock after spoilage, new yield and the storage cap
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
  granaries: number,
  rng: SeededRng,
  weatherOverride?: WeatherBandId
): HarvestResult {
  const productiveFarmland = laborGatedFarmland(land, population)

  const weather = rollWeather(rng, weatherOverride)
  // A little variation inside the band, so two "lean years" are not identical,
  // without letting bands blur into one another.
  const jitter = 1 + (rng.next() - 0.5) * HARVEST.withinBandJitter
  const grossYield = Math.max(0, productiveFarmland * HARVEST.baseYieldPerHectare * weather.multiplier * jitter)

  // Spoilage hits grain carried over from last year, before this year's harvest is
  // added: stores decay, so a reserve is a wasting asset rather than a free buffer.
  const spoiledFromStock = previousGrainStock * STORAGE.spoilagePercentage
  const stockAfterSpoilage = Math.max(0, previousGrainStock - spoiledFromStock)

  // Anything beyond what the realm can physically store is lost. This is the hard
  // stop on hoarding: without it a good run of weather compounds into an infinite
  // granary, and the sell-or-store decision disappears.
  const capacity = storageCapacity(population, granaries)
  const gathered = stockAfterSpoilage + grossYield
  const newGrainStock = Math.min(gathered, capacity)
  const overflowLost = gathered - newGrainStock

  return { productiveFarmland, grossYield, spoiledFromStock, overflowLost, weather, newGrainStock }
}

export interface FeedingResult {
  grainConsumed: number
  grainStockAfter: number
  /** What the dial ASKED for. Differs from feedAdequacy exactly when the barn
   *  could not cover it, which is the case worth showing the player. */
  targetAdequacy: number
  feedAdequacy: number   // fraction of required grain actually delivered (0 = starving, 1 = fully met, >1 = overfed)
  isUnderfed: boolean    // below the 'required' threshold — triggers unrest/emigration
  isOverfed: boolean     // above overfedAdequacy (share of demand) — triggers disease risk
}

export function resolveFeeding(
  decision: GrainDecision,
  population: PopulationState,
  grainStockBeforeFeeding: number
): FeedingResult {
  const requiredGrain = population.peasants * POP_ECONOMY.populationGrainRequirement

  // PHASE 21.4 (issue #50a) — the dial names an ADEQUACY, not a share of stock.
  //
  // The original C64 dial was Maximum (80% of stock) / Minimum (20% of stock) /
  // Required / Custom (20-80% of stock). Faithful, but it meant one setting fed a
  // different share of your people every year depending on how full the barn was.
  // The bug report described it as the "relationship seems to change", and that
  // was an accurate reading of the mechanic rather than a misreading: with a full
  // barn, "Max" overfed into disease; with an empty one it starved. Targeting
  // demand makes Min always mean 75% fed.
  //
  // The default branch is load-bearing, not defensive padding. Without it an
  // unrecognised feedLevel left grainOffered undefined and NaN propagated silently
  // through feeding, population, events and the treasury — a realm reporting "NaN
  // peasants lost" and collapsing in two years. Malformed input should degrade to
  // the safe choice, never poison the simulation. (validateDecisions() rejects such
  // a sheet up front; this is the second line of defence for callers that skip it.)
  let targetAdequacy: number
  switch (decision.feedLevel) {
    case 'min':
      targetAdequacy = FEEDING.minAdequacy
      break
    case 'growth':
      targetAdequacy = FEEDING.growthAdequacy
      break
    case 'custom': {
      // `?? default` alone only catches undefined/null, not NaN (sanitize.ts) — a
      // NaN customPercentage would otherwise clamp to NaN (Math.max/min do
      // not self-heal it) and poison the target, then feedAdequacy, population
      // dynamics, and the treasury for the whole year.
      const fraction = finiteOr(decision.customPercentage, FEEDING.customDefaultAdequacy * 100) / 100
      targetAdequacy = Math.min(FEEDING.customMaxAdequacy, Math.max(FEEDING.customMinAdequacy, fraction))
      break
    }
    case 'required':
    default:
      targetAdequacy = FEEDING.requiredAdequacy
      break
  }

  // Clamped by the barn, always: naming a target does not conjure grain, so a
  // starving realm still just eats what it has and the realised adequacy below
  // comes out lower than the dial.
  const grainOffered = requiredGrain * targetAdequacy

  const grainConsumed = Math.min(grainOffered, grainStockBeforeFeeding)
  const grainStockAfter = grainStockBeforeFeeding - grainConsumed

  const feedAdequacy = requiredGrain > 0 ? grainConsumed / requiredGrain : 1

  return {
    grainConsumed,
    grainStockAfter,
    targetAdequacy,
    feedAdequacy,
    isUnderfed: feedAdequacy < FEEDING.underfedAdequacy,
    isOverfed: feedAdequacy > FEEDING.overfedAdequacy
  }
}

// ---------------------------------------------------------------------------
// Grain market
// ---------------------------------------------------------------------------
//
// The original's central loop is buying and selling corn against the Kaiser
// (docs/kaiser-research.md § Trade partner / market screen). Without it, surplus
// grain has no purpose at all: harvests pile up, sabotage loot is worthless, and
// weather barely matters because nothing turns on the size of the heap.
//
// The Kaiser buys low and sells high, and the spread is deliberate: it makes
// "store it or sell it" a judgement rather than arithmetic. Selling a reserve at
// a good price is only correct if the next harvest cooperates.

export interface GrainTradeResult {
  soldUnits: number
  boughtUnits: number
  talerDelta: number      // Positive = earned, negative = spent
  grainStockAfter: number
}

export function grainBuybackPrice(marketPrice: number): number {
  return marketPrice * PRICES.cornBuybackMarkup
}

// Drifts the Kaiser's corn price toward scarcity: a field-wide poor harvest
// pushes next year's price up (grain is worth more when it's short), a
// glut pushes it down — clamped to cornPriceBands so it can never run away in
// either direction. `cornPriceBands` was previously unreferenced dead data
// (BACKLOG.md precursor to F2): the min/max existed but the price never
// actually moved from its starting value for an entire match.
//
// This is the Hanse-style "price + weather" uncertainty docs/kaiser-research.md
// calls for (§ Comparable Games — Hanse), and it makes selling grain a genuine
// TIMING decision rather than arithmetic against a fixed number: a reserve
// held through a bad year is worth more to sell than one dumped in a glut
// year, on top of the existing spoilage/storage tradeoff.
export function driftCornPrice(currentPrice: number, averageWeatherMultiplier: number): number {
  const shortfall = 1 - averageWeatherMultiplier   // positive = a lean year across the field, negative = a bountiful one
  const drift = 1 + shortfall * PRICES.cornPriceDriftSensitivity
  return Math.min(PRICES.cornPriceBands.max, Math.max(PRICES.cornPriceBands.min, currentPrice * drift))
}

export function applyGrainTrade(
  grainStock: number,
  taler: number,
  sellUnits: number,
  buyUnits: number,
  marketPrice: number,
  capacity: number
): GrainTradeResult {
  // Sanitized at the boundary (sanitize.ts): year.ts calls this with
  // `grainDecision.sellGrain ?? 0`/`buyGrain ?? 0`, which only catches
  // undefined, not NaN — grainStock/taler are running totals, so an
  // unsanitized NaN order here would poison them for every year after.
  const safeSellUnits = finiteOr(sellUnits, 0)
  const safeBuyUnits = finiteOr(buyUnits, 0)

  // Selling is clamped to what is actually in the barn.
  const sold = Math.max(0, Math.min(safeSellUnits, grainStock))
  const earned = sold * marketPrice

  // Buying is clamped by affordability AND by remaining storage — there is no
  // point purchasing grain the realm cannot keep.
  const budget = taler + earned
  const room = Math.max(0, capacity - (grainStock - sold))
  const price = grainBuybackPrice(marketPrice)
  const bought = Math.max(0, Math.min(safeBuyUnits, room, price > 0 ? Math.floor(budget / price) : 0))
  const spent = bought * price

  return {
    soldUnits: sold,
    boughtUnits: bought,
    talerDelta: earned - spent,
    grainStockAfter: grainStock - sold + bought
  }
}
