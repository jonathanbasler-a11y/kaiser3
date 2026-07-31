// AI PLANNER — chooses a Decision sheet for one ruler for one year.
//
// Method: generate a set of coherent candidate sheets, simulate each ONE YEAR
// FORWARD through the real advanceYear() reducer, and keep whichever produces the
// best-valued resulting state. The AI therefore plays by exactly the rules the
// player does, using exactly the engine the player does — there is no parallel
// "AI math" that can drift from the simulation (CLAUDE.md's Decision-parity rule).
//
// Two details make the comparison honest:
//   * Every candidate is evaluated under the SAME evaluation seeds, so candidates
//     are compared under identical weather and identical event rolls. Comparing
//     them under different luck would just reward whichever candidate happened to
//     draw a good harvest.
//   * Each candidate is evaluated under SEVERAL seeds and averaged, so the AI
//     picks a plan that is robust rather than one that happens to win under a
//     single roll of the dice.

import { GameState, PlayerState, Decision, TaxDecision, ConstructionDecision, LandTradeDecision } from '../engine/state.ts'
import { advanceYear } from '../engine/year.ts'
import { evaluateState, projectedFeedAdequacy, PersonalityWeights } from './evaluator.ts'
import { Personality } from './personalities.ts'
import buildingsData from '../../data/buildings.json'

const PRESTIGE = buildingsData.prestige
const MITIGATION = buildingsData.mitigation

// How many independent futures each candidate is averaged over. More is steadier
// but linearly more expensive; 2 is enough to stop a single lucky harvest from
// deciding the plan.
const EVALUATION_SEEDS = 2

const TAX_PRESETS: Array<Omit<TaxDecision, 'type'>> = [
  { vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 },   // light
  { vat: 25, incomeTax: 25, tariff: 10, justiceGraft: 0 },  // moderate
  { vat: 45, incomeTax: 45, tariff: 15, justiceGraft: 0 },  // heavy but within tolerance
  { vat: 60, incomeTax: 60, tariff: 20, justiceGraft: 0 },  // past tolerance: trades unrest for cash
  { vat: 45, incomeTax: 45, tariff: 15, justiceGraft: 40 }  // corrupt: more cash, more unrest
]

const NO_CONSTRUCTION: Omit<ConstructionDecision, 'type'> = {
  marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
  wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0
}

function landOptions(player: PlayerState, prices: GameState['kaizerTradePrices']): Array<Omit<LandTradeDecision, 'type'>> {
  const options: Array<Omit<LandTradeDecision, 'type'>> = [
    { farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
  ]

  // Spend a slice of the treasury on land. Farmland feeds growth; building land
  // unlocks construction and counts toward the palace's land requirement.
  for (const share of [0.15, 0.4]) {
    const budget = player.taler * share
    const farmlandHectares = Math.floor(budget / prices.farmland)
    if (farmlandHectares > 0) {
      options.push({ farmlanbuy: farmlandHectares, buildingLandBuy: 0, partnerPlayerId: 'kaiser' })
    }
    const buildingHectares = Math.floor(budget / prices.buildingLand)
    if (buildingHectares > 0) {
      options.push({ farmlanbuy: 0, buildingLandBuy: buildingHectares, partnerPlayerId: 'kaiser' })
    }
  }

  // Move toward the palace's land requirement — the precondition that unlocks the
  // entire rank path. Two candidates: cross it outright when affordable, or buy as
  // much of the shortfall as the treasury allows so the gap can be closed over
  // several years. Without the partial option a ruler who can never afford the
  // whole ~90,000 Taler jump in one year never starts the rank path at all.
  const totalLand = player.land.farmland + player.land.buildingLand
  const shortfall = PRESTIGE.palace.landRequirement - totalLand
  if (shortfall > 0) {
    const affordable = Math.floor(player.taler / prices.farmland)
    const toBuy = Math.min(shortfall, affordable)
    if (toBuy > 0) {
      options.push({ farmlanbuy: toBuy, buildingLandBuy: 0, partnerPlayerId: 'kaiser' })
    }
  }

  return options
}

// `projectedLand` is the land the ruler will hold AFTER the land purchase paired
// with these options — not what they hold now. This matters: the palace requires
// 13,000 ha and a ruler starts with 10,000, so gating construction on current land
// would mean "buy land AND start the palace" was never generated as a candidate at
// all, and the AI could never begin the rank path. (It didn't, in the first
// benchmark run — every archetype finished at rank 0 with an untouched palace.)
function constructionOptions(player: PlayerState, projectedLand: number): Array<Omit<ConstructionDecision, 'type'>> {
  const options: Array<Omit<ConstructionDecision, 'type'>> = [NO_CONSTRUCTION]
  const totalLand = projectedLand

  // Production capacity — the engine clamps to the land ratio and to affordability,
  // so proposing a few is safe even when only some are buildable.
  options.push({ ...NO_CONSTRUCTION, marketBuild: 2, millBuild: 1 })
  options.push({ ...NO_CONSTRUCTION, marketBuild: 4, millBuild: 3 })

  // Mitigation buildings, individually and as a full insurance package. The
  // evaluator prices these through expectedAnnualEventLoss(), so they only get
  // chosen when the risk they remove actually outweighs their upkeep.
  if (player.buildings.hospital === 0 && player.population.peasants >= MITIGATION.hospital.requiresMinPopulation) {
    options.push({ ...NO_CONSTRUCTION, hospitalBuild: 1 })
  }
  if (player.buildings.granary === 0) options.push({ ...NO_CONSTRUCTION, granaryBuild: 1 })
  if (player.buildings.well === 0) options.push({ ...NO_CONSTRUCTION, wellBuild: 1 })
  if (player.buildings.garrison === 0) options.push({ ...NO_CONSTRUCTION, garrisonBuild: 1 })
  options.push({
    ...NO_CONSTRUCTION,
    hospitalBuild: player.buildings.hospital === 0 && player.population.peasants >= MITIGATION.hospital.requiresMinPopulation ? 1 : 0,
    granaryBuild: player.buildings.granary === 0 ? 1 : 0,
    wellBuild: player.buildings.well === 0 ? 1 : 0,
    garrisonBuild: player.buildings.garrison === 0 ? 1 : 0
  })

  // The rank path: palace stages, then a cathedral.
  if (totalLand >= PRESTIGE.palace.landRequirement && player.buildings.palace < PRESTIGE.palace.stages) {
    options.push({ ...NO_CONSTRUCTION, palaceStages: 1 })
    options.push({ ...NO_CONSTRUCTION, palaceStages: 3 })
    // Building prestige and production in the same year is often the strongest
    // play once the treasury is deep enough to do both.
    options.push({ ...NO_CONSTRUCTION, palaceStages: 2, marketBuild: 2, millBuild: 1 })
  }
  if (
    player.buildings.cathedral === 0 &&
    totalLand >= PRESTIGE.cathedral.landRequirement &&
    player.population.peasants >= PRESTIGE.cathedral.requiresMinPopulation
  ) {
    options.push({ ...NO_CONSTRUCTION, cathedralBuild: true })
  }

  return options
}

// Feeding: 'required' is almost always correct (it delivers exactly what the
// population needs). 'min' is the austerity play when grain is desperately short
// and stretching reserves matters more than contentment.
const FEED_OPTIONS: Array<Decision & { type: 'grain' }> = [
  { type: 'grain', feedLevel: 'required' },
  { type: 'grain', feedLevel: 'min' }
]

export function generateCandidates(player: PlayerState, prices: GameState['kaizerTradePrices']): Decision[][] {
  const candidates: Decision[][] = []

  const currentLand = player.land.farmland + player.land.buildingLand

  for (const feed of FEED_OPTIONS) {
    for (const land of landOptions(player, prices)) {
      // Land bought this year is available to build on this year, so construction
      // candidates are generated against the post-purchase holding.
      const projectedLand = currentLand + Math.max(0, land.farmlanbuy) + Math.max(0, land.buildingLandBuy)
      for (const tax of TAX_PRESETS) {
        for (const construction of constructionOptions(player, projectedLand)) {
          candidates.push([
            feed,
            { type: 'land_trade', ...land },
            { type: 'tax', ...tax },
            { type: 'construction', ...construction }
          ])
        }
      }
    }
  }

  return candidates
}

// Builds a single-player game state so a candidate can be simulated in isolation,
// without other rulers' decisions perturbing the comparison.
function isolate(state: GameState, playerId: string): GameState {
  const player = JSON.parse(JSON.stringify(state.players[playerId])) as PlayerState
  return {
    year: state.year,
    players: { [playerId]: player },
    activePlayerIds: [playerId],
    kaizerTradePrices: { ...state.kaizerTradePrices }
  }
}

function scoreCandidate(
  state: GameState,
  playerId: string,
  candidate: Decision[],
  weights: PersonalityWeights,
  evaluationSeeds: number[]
): number {
  let total = 0

  for (const seed of evaluationSeeds) {
    const isolated = isolate(state, playerId)
    const result = advanceYear(isolated, { [playerId]: candidate }, seed)
    const outcome = result.state.players[playerId]
    total += evaluateState(outcome, { feedAdequacy: projectedFeedAdequacy(outcome) }, weights)
  }

  return total / evaluationSeeds.length
}

export function planYear(
  state: GameState,
  playerId: string,
  personality: Personality,
  seed: number
): Decision[] {
  const player = state.players[playerId]
  const candidates = generateCandidates(player, state.kaizerTradePrices)

  // Fixed per-turn evaluation seeds: every candidate this turn sees identical
  // weather and identical event rolls, so differences in score come from the
  // decisions rather than from luck.
  const evaluationSeeds = Array.from({ length: EVALUATION_SEEDS }, (_, i) => seed + i * 7919)

  let best = candidates[0]
  let bestScore = -Infinity

  for (const candidate of candidates) {
    const score = scoreCandidate(state, playerId, candidate, personality.weights, evaluationSeeds)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}
