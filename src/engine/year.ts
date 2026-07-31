// THE REDUCER: advanceYear() is the single function that advances the game by one year.
// Pure deterministic function: same (state, decisions[], seed) → byte-identical result.
// This is the load-bearing contract for AI parity, testability, and future multiplayer.

import { SeededRng } from './rng.ts'
import {
  GameState, Decision, Chronicle, PlayerChronicle, StrikeRecord,
  GrainDecision, LandTradeDecision, TaxDecision, ConstructionDecision, EspionageDecision
} from './state.ts'
import { calculateHarvest, resolveFeeding } from './economy.ts'
import { applyLandTrade } from './land.ts'
import { applyPopulationDynamics } from './population.ts'
import { applyTaxation } from './tax.ts'
import { applyConstruction, calculateBuildingIncome, calculateUpkeep } from './buildings.ts'
import { checkPromotion } from './ranks.ts'
import { resolveEvents } from './events/events.ts'
import { applyRecruitment, espionageUpkeep, resolveStrike } from './espionage.ts'

function findDecision<T extends Decision>(decisions: Decision[], type: T['type']): T | undefined {
  return decisions.find((d) => d.type === type) as T | undefined
}

const DEFAULT_GRAIN_DECISION: GrainDecision = { type: 'grain', feedLevel: 'required' }
const DEFAULT_TAX_DECISION: TaxDecision = { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 }
const DEFAULT_CONSTRUCTION_DECISION: ConstructionDecision = {
  type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
  wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0
}

export function advanceYear(
  state: GameState,
  decisions: Record<string, Decision[]>,
  seed: number
): { state: GameState; chronicle: Chronicle } {
  const rng = new SeededRng(seed)
  const newState = JSON.parse(JSON.stringify(state)) as GameState
  const chronicle: Chronicle = {
    year: state.year + 1,
    playerReports: {},
    globalEvents: [],
    strikes: []
  }

  // Year-advance sequence (mirrors the research doc's core gameplay loop):
  //
  //   PER RULER, in isolation:
  //     1. Land trading          [Phase 1]
  //     2. Recruitment           [Phase 7]
  //     3. Construction          [Phase 2]
  //     4. Harvest & grain       [Phase 1]
  //     5. Grain distribution    [Phase 1]
  //     6. Population dynamics   [Phase 1]
  //     7. Building income       [Phase 2]
  //     8. Taxation              [Phase 2]
  //     9. Upkeep                [Phase 2 + 7]
  //    10. Events                [Phase 4]
  //
  //   ACROSS RULERS:
  //    11. Espionage strikes     [Phase 7]
  //
  //   PER RULER again:
  //    12. Rank promotion check  [Phase 2]
  //
  // Espionage sits between the two per-ruler passes because it is the only phase
  // where rulers touch each other, and the promotion check has to come after it:
  // a treasury emptied by raiders should cost you the title that year.
  //
  //    13. Warfare               [Phase 8]

  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    if (!player || player.dead) continue

    const playerDecisions = decisions[playerId] ?? []

    const report: PlayerChronicle = {
      births: 0,
      deaths: 0,
      emigration: 0,
      immigration: 0,
      harvestYield: 0,
      spoilage: 0,
      marketIncome: 0,
      millIncome: 0,
      tributeIncome: 0,
      taxIncome: 0,
      tariffIncome: 0,
      upkeepCost: 0,
      eventGoldLoss: 0,
      eventPopulationLoss: 0,
      eventBuildingsDestroyed: 0,
      unrestGain: 0,
      events: [],
      rankPromoted: false
    }

    const unrestAtYearStart = player.population.unrest

    // 1. Land trading (against the NPC Kaiser)
    const landDecision = findDecision<LandTradeDecision>(playerDecisions, 'land_trade')
    let tradeVolume = 0
    if (landDecision) {
      const tradeResult = applyLandTrade(player.land, player.taler, landDecision, newState.kaizerTradePrices)
      player.land = tradeResult.newLand
      player.taler = tradeResult.newTaler
      tradeVolume = Math.abs(tradeResult.talerDelta)
    }

    // 2. Recruitment (guards and saboteurs) — before construction so the two
    //    compete for the same treasury in a fixed, predictable order.
    const espionageDecision = findDecision<EspionageDecision>(playerDecisions, 'espionage')
    if (espionageDecision) {
      applyRecruitment(player, espionageDecision.guardHire, espionageDecision.saboteurHire)
    }

    // 3. Construction
    const constructionDecision = findDecision<ConstructionDecision>(playerDecisions, 'construction') ?? DEFAULT_CONSTRUCTION_DECISION
    const constructionResult = applyConstruction(player.land, player.population, player.buildings, player.taler, constructionDecision)
    player.buildings = constructionResult.newBuildings
    player.taler = constructionResult.newTaler

    // 3. Harvest (labor-gated productivity, weather variance, spoilage on carried-over stock)
    const harvest = calculateHarvest(player.land, player.population, player.grainStock, rng)
    player.grainStock = harvest.newGrainStock
    report.harvestYield = harvest.grossYield
    report.spoilage = harvest.spoiledFromStock

    // 4. Grain feeding decision
    const grainDecision = findDecision<GrainDecision>(playerDecisions, 'grain') ?? DEFAULT_GRAIN_DECISION
    const feeding = resolveFeeding(grainDecision, player.population, player.grainStock)
    player.grainStock = feeding.grainStockAfter

    // 5. Population dynamics (births/deaths/migration driven by feeding adequacy)
    const popResult = applyPopulationDynamics(player.population, feeding, rng)
    player.population = popResult.newPopulation
    report.births = popResult.births
    report.deaths = popResult.deaths
    report.emigration = popResult.emigration
    report.immigration = popResult.immigration

    // 6. Building income (markets/mills, from buildings as of this year's construction)
    const income = calculateBuildingIncome(player.buildings)
    player.taler += income.marketIncome + income.millIncome
    report.marketIncome = income.marketIncome
    report.millIncome = income.millIncome

    // 7. Taxation (revenue from the population's economic output; burden feeds unrest)
    const taxDecision = findDecision<TaxDecision>(playerDecisions, 'tax') ?? DEFAULT_TAX_DECISION
    const taxResult = applyTaxation(player.population, taxDecision, tradeVolume)
    player.taler += taxResult.totalRevenue
    player.population.unrest = Math.min(100, player.population.unrest + taxResult.unrestDelta)
    report.taxIncome = taxResult.taxIncome
    report.tariffIncome = taxResult.tariffIncome
    report.tributeIncome = taxResult.graftBonus

    // 9. Upkeep (buildings, trading-house tribute, and the standing secret service —
    //    all scale with holdings, the anti-snowball lever)
    const upkeep = calculateUpkeep(player.buildings, player.tradingHouses, player.taler)
      + espionageUpkeep(player)
    player.taler = Math.max(0, player.taler - upkeep)
    report.upkeepCost = upkeep

    // 9. Events (plague/fire/banditry scale with prosperity; revolt/famine compound
    //    the player's own bad state). Resolved AFTER taxation so revolt reacts to
    //    this year's unrest including the tax burden, and BEFORE the rank check so
    //    a bad year can genuinely cost a promotion.
    const eventResult = resolveEvents(player, { feedAdequacy: feeding.feedAdequacy }, rng)
    report.events = eventResult.events
    report.eventGoldLoss = eventResult.totalGoldLoss
    report.eventPopulationLoss = eventResult.totalPopulationLoss
    report.eventBuildingsDestroyed = eventResult.totalBuildingsDestroyed

    report.unrestGain = player.population.unrest - unrestAtYearStart

    chronicle.playerReports[playerId] = report
  }

  // 11. Espionage strikes — the only cross-ruler phase.
  //
  // Resolved in activePlayerIds order, which is deterministic: if two rulers raid
  // each other in the same year, the first to act finds a fuller treasury. That is
  // a real ordering effect rather than an accident, and it is stable for a seed.
  for (const attackerId of newState.activePlayerIds) {
    const attacker = newState.players[attackerId]
    if (!attacker || attacker.dead) continue

    const espionage = findDecision<EspionageDecision>(decisions[attackerId] ?? [], 'espionage')
    if (!espionage?.targetPlayerId || !espionage.saboteursCommitted) continue

    const defender = newState.players[espionage.targetPlayerId]
    // Silently ignore strikes at a ruler who is gone, dead, or at oneself, rather
    // than failing the whole year over a stale target.
    if (!defender || defender.dead || defender.id === attackerId) continue
    if (!newState.activePlayerIds.includes(defender.id)) continue

    const outcome = resolveStrike(
      attacker,
      defender,
      espionage.saboteursCommitted,
      espionage.mode ?? 'raid',
      rng
    )
    if (outcome.saboteursCommitted > 0) {
      chronicle.strikes.push(outcome as StrikeRecord)
    }
  }

  // 12. Rank promotion check — after espionage, so a treasury emptied by raiders
  //     genuinely costs the title this year.
  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    const report = chronicle.playerReports[playerId]
    if (!player || player.dead || !report) continue

    const promotion = checkPromotion(player)
    if (promotion.promoted) {
      player.rank = promotion.newRank
      report.rankPromoted = true
      report.newRank = promotion.newRank
    }
  }

  newState.year += 1
  return { state: newState, chronicle }
}
