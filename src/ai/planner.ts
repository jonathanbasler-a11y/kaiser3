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

import {
  GameState, PlayerState, Decision, TaxDecision, ConstructionDecision,
  LandTradeDecision, EspionageDecision, clonePlayerState
} from '../engine/state.ts'
import { applyLandTrade, totalLand } from '../engine/land.ts'
import { applyRecruitment } from '../engine/espionage.ts'
import { annualGrainRequirement } from '../engine/economy.ts'
import { isolate, scoreCandidate } from './candidateScore.ts'
import { Personality } from './personalities.ts'
import { planAggression } from './aggression.ts'
import { planWar, planMilitaryInvestment } from './warAggression.ts'
import { planGuildResponse } from './guildResponse.ts'
import buildingsData from '../../data/buildings.json'
import economyData from '../../data/economy.json'

const FEEDING = economyData.feeding

const PRESTIGE = buildingsData.prestige
const MITIGATION = buildingsData.mitigation
const COMMERCE = buildingsData.commerce

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
  wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
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
  const landHeld = totalLand(player.land)
  const shortfall = PRESTIGE.palace.landRequirement - landHeld
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
function constructionOptions(player: PlayerState, projectedLand: number, rank: number): Array<Omit<ConstructionDecision, 'type'>> {
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
  if ((player.buildings.dike ?? 0) === 0) options.push({ ...NO_CONSTRUCTION, dikeBuild: 1 })
  options.push({
    ...NO_CONSTRUCTION,
    hospitalBuild: player.buildings.hospital === 0 && player.population.peasants >= MITIGATION.hospital.requiresMinPopulation ? 1 : 0,
    granaryBuild: player.buildings.granary === 0 ? 1 : 0,
    wellBuild: player.buildings.well === 0 ? 1 : 0,
    garrisonBuild: player.buildings.garrison === 0 ? 1 : 0,
    dikeBuild: (player.buildings.dike ?? 0) === 0 ? 1 : 0
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

  // Trading houses (B3/commerce): rank-gated, so only proposed once actually
  // unlocked. The evaluator prices the resulting income against the wealth-
  // proportional tribute through the real reducer, same as everything else here.
  if (rank >= COMMERCE.tradingHouse.requiresRank && player.tradingHouses < COMMERCE.tradingHouse.maxCount) {
    options.push({ ...NO_CONSTRUCTION, tradingHouseBuild: 1 })
  }

  return options
}

// Feeding and the grain market, together — they are one decision in practice.
// 'required' is almost always the right feed level; 'min' is the austerity play
// when stores are desperately short.
//
// The interesting axis is how much surplus to SELL. Holding grain is insurance
// against a bad harvest and it decays; selling it is cash now and a gamble on the
// weather. Candidates are expressed as "keep N years of food, sell the rest", so
// the personality's grainSecurity weight against its wealth weight decides the
// posture — a Merchant will run the barns lean, an Expansionist will not.
function grainOptions(player: PlayerState): Array<Decision & { type: 'grain' }> {
  const yearOfFood = annualGrainRequirement(player.population)
  const options: Array<Decision & { type: 'grain' }> = []

  for (const reserveYears of [3, 2, 1.25, 0]) {
    const sellGrain = Math.max(0, Math.floor(player.grainStock - yearOfFood * reserveYears))
    options.push({ type: 'grain', feedLevel: 'required', sellGrain })
  }
  // Austerity: stretch the stores when they are thin, and sell nothing.
  options.push({ type: 'grain', feedLevel: 'min' })

  // 21.4: 'growth' (115% of demand) sits inside the immigration window, so it is
  // a real strategic lever rather than the erratic old 'max' (80% of barn stock,
  // which meant a different adequacy every year and overfed into disease when the
  // barn was full). Offered to the AI because CLAUDE.md's decision-parity
  // invariant forbids the human having a dial the planner cannot reach.
  //
  // Gated on being able to afford it rather than offered unconditionally: the
  // candidate sweep is multiplicative and Phase 12 exists because of its cost, so
  // a permanent extra grain option would tax every position to serve the few
  // where a surplus actually makes overfeeding sensible.
  // Reads PRE-harvest stock (planning happens before year.ts step 4), so a ruler
  // sitting on one year of food with a big harvest incoming is denied a candidate
  // the human could still pick. Conservative in the safe direction, and cheaper
  // than forecasting the harvest here purely to widen a candidate list.
  if (player.grainStock > yearOfFood * FEEDING.growthAdequacy) {
    options.push({ type: 'grain', feedLevel: 'growth' })
  }

  // De-duplicate: when the barn is nearly empty several reserve levels collapse
  // onto "sell nothing", and evaluating the same sheet repeatedly is pure cost.
  const seen = new Set<string>()
  return options.filter((option) => {
    const key = `${option.feedLevel}:${option.sellGrain ?? 0}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function generateCandidates(player: PlayerState, prices: GameState['kaizerTradePrices']): Decision[][] {
  const candidates: Decision[][] = []

  const currentLand = totalLand(player.land)

  for (const feed of grainOptions(player)) {
    for (const land of landOptions(player, prices)) {
      // Land bought this year is available to build on this year, so construction
      // candidates are generated against the post-purchase holding.
      const projectedLand = currentLand + Math.max(0, land.farmlanbuy) + Math.max(0, land.buildingLandBuy)
      for (const tax of TAX_PRESETS) {
        for (const construction of constructionOptions(player, projectedLand, player.rank)) {
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

function priorSpendBeforeMilitary(
  player: PlayerState,
  state: GameState,
  candidate: Decision[],
  espionage: EspionageDecision
): number {
  const land = candidate.find((decision) => decision.type === 'land_trade') as LandTradeDecision | undefined
  const landResult = land
    ? applyLandTrade(player.land, player.taler, land, state.kaizerTradePrices)
    : undefined
  const landSpend = Math.max(0, -(landResult?.talerDelta ?? 0))

  const recruited = clonePlayerState(player)
  recruited.taler = landResult?.newTaler ?? player.taler
  const recruitment = applyRecruitment(recruited, espionage.guardHire, espionage.saboteurHire)

  return landSpend + recruitment.spent
}

export function planYear(
  state: GameState,
  playerId: string,
  personality: Personality,
  seed: number,
  // Difficulty presets (Phase 13, src/ai/difficulty.ts) override how many
  // independent futures a candidate is averaged over — fewer seeds means this
  // ruler's own plan is judged on noisier information and plays less
  // robustly, never that a rule bends for it. Optional and defaulting to the
  // module constant below, so every existing caller (tests, ai-bench, the
  // balance harness, the golden fixture) keeps getting byte-identical
  // decisions with zero changes on their end.
  evaluationSeedCount: number = EVALUATION_SEEDS
): Decision[] {
  const player = state.players[playerId]
  const candidates = generateCandidates(player, state.kaizerTradePrices)

  // Espionage is decided separately (see aggression.ts): it is the one decision the
  // isolated one-year lookahead cannot evaluate, because an isolated state contains
  // no rivals to strike. It is still an ordinary EspionageDecision in the same
  // sheet, so Decision parity with the human player holds.
  const espionage: Decision = {
    type: 'espionage',
    ...planAggression(state, playerId, personality.aggression, personality.weights)
  }

  // Fixed per-turn evaluation seeds: every candidate this turn sees identical
  // weather and identical event rolls, so differences in score come from the
  // decisions rather than from luck.
  const evaluationSeeds = Array.from({ length: evaluationSeedCount }, (_, i) => seed + i * 7919)

  const isolated = isolate(state, playerId)

  let best = candidates[0]
  let bestScore = -Infinity

  for (const candidate of candidates) {
    const score = scoreCandidate(isolated, playerId, candidate, personality.weights, evaluationSeeds)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  const priorSpendTalers = priorSpendBeforeMilitary(player, state, best, espionage)
  // War is decided the same way espionage is: priced directly against the real
  // rivals, since an isolated one-year lookahead cannot see them at all. The
  // training/equipment investment rides on the same decision for the same
  // reason, but it is planned only after the best land order and espionage
  // recruitment are known. That mirrors year.ts's treasury order through
  // recruitment; construction still spends after military and remains
  // engine-clamped there.
  const war: Decision = {
    type: 'war',
    ...planWar(state, playerId, personality.aggression, personality.weights),
    ...planMilitaryInvestment(state, playerId, personality.aggression, priorSpendTalers)
  }

  // Answer a pending guild petition, if there is one. Appended LAST and omitted
  // entirely when nothing is pending, so the sheet is unchanged in the
  // overwhelmingly common year — which is what keeps golden-fixture movement
  // attributable to petitions actually firing rather than to sheet shape.
  //
  // 21.9 replaced 21.8's closed-form screen with real-reducer scoring, so this
  // now needs the isolated state, the sheet to score on top of, and the same
  // evaluation seeds the sweep above used — it scores [...sheet, grant] against
  // [...sheet, refuse] and keeps the winner. Deliberately NOT folded into
  // generateCandidates: doing so would double a ~1,650-candidate sweep to price
  // a binary that only exists in the handful of years a petition is pending.
  // As written it costs two extra scoreCandidate calls in those years (one
  // advanceYear run per evaluation seed each) and nothing at all in the rest.
  //
  // The sheet handed over is the COMPLETE one, espionage and war included, not
  // just `best`. That matters for affordability and was wrong in 21.9's first
  // draft: recruitment settles at year.ts step 2 and military investment at
  // step 2.5, both BEFORE the charter fee is charged at step 3.5. Scoring the
  // charter against a sheet missing them projects a treasury that is too high
  // by exactly that spend — and it is largest for the archetypes that recruit
  // and arm the most, so the error was not evenly distributed either. Building
  // the emitted sheet first and scoring on top of it also makes the thing
  // scored identical to the thing returned, rather than a near-copy.
  const sheet = [...best, espionage, war]
  const guild = planGuildResponse(isolated, playerId, sheet, personality.weights, evaluationSeeds)

  return guild ? [...sheet, guild] : sheet
}
