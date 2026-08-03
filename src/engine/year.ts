// THE REDUCER: advanceYear() is the single function that advances the game by one year.
// Pure deterministic function: same (state, decisions[], seed) → byte-identical result.
// This is the load-bearing contract for AI parity, testability, and future multiplayer.

import { SeededRng } from './rng.ts'
import {
  GameState, Decision, Chronicle, PlayerChronicle, StrikeRecord,
  GrainDecision, LandTradeDecision, TaxDecision, ConstructionDecision, EspionageDecision, WarDecision,
  cloneGameState
} from './state.ts'
import { calculateHarvest, resolveFeeding, applyGrainTrade, storageCapacity, driftCornPrice } from './economy.ts'
import { applyLandTrade } from './land.ts'
import { applyPopulationDynamics } from './population.ts'
import { applyTaxation } from './tax.ts'
import { applyConstruction, calculateBuildingIncome, calculateUpkeep } from './buildings.ts'
import { checkPromotion } from './ranks.ts'
import { resolveEvents } from './events/events.ts'
import { rollPositiveEvent } from './events/positiveEvents.ts'
import { applyRecruitment, espionageUpkeep, resolveStrike } from './espionage.ts'
import { applySuccession, checkExtinction } from './succession.ts'
import { resolveAllianceRequests, resolveWar, applyMilitaryInvestment, militaryUpkeep, isTruceActive, registerTruce, trucePairKey } from './war.ts'
import economyData from '../../data/economy.json'

const WARFARE = economyData.warfare

function findDecision<T extends Decision>(decisions: Decision[], type: T['type']): T | undefined {
  return decisions.find((d) => d.type === type) as T | undefined
}

// A2: records a plain-language notice whenever a queued order (construction,
// recruitment) got less than requested — most commonly because an earlier
// decision this same year (typically land trading) already spent the
// treasury before this step ran. `talerAtStep` is the treasury balance at
// the moment this step executed, so the report explains itself rather than
// just reporting a silent gap.
function noteShortfall(report: PlayerChronicle, label: string, requested: number, actual: number, talerAtStep: number): void {
  if (requested > actual) {
    report.shortfalls.push(
      `Wanted ${requested} ${label}, only ${actual} built (had ${Math.round(talerAtStep)} Taler on hand when this step ran).`
    )
  }
}

const DEFAULT_GRAIN_DECISION: GrainDecision = { type: 'grain', feedLevel: 'required' }
const DEFAULT_TAX_DECISION: TaxDecision = { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 }
const DEFAULT_CONSTRUCTION_DECISION: ConstructionDecision = {
  type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
  wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
}

export function advanceYear(
  state: GameState,
  decisions: Record<string, Decision[]>,
  seed: number
): { state: GameState; chronicle: Chronicle } {
  const rng = new SeededRng(seed)
  const newState = cloneGameState(state)
  const chronicle: Chronicle = {
    year: state.year + 1,
    playerReports: {},
    globalEvents: [],
    strikes: [],
    wars: []
  }

  // Year-advance sequence (mirrors the research doc's core gameplay loop):
  //
  //   PER RULER, in isolation:
  //     1. Land trading          [Phase 1]
  //     2. Recruitment           [Phase 7]
  //     2.5. Military investment [Phase 18C — training/equipment levels]
  //     3. Construction          [Phase 2]
  //     4. Harvest & weather      [Phase 1 + 8]
  //     5. Grain distribution     [Phase 1]
  //     6. Grain market            [Phase 8]
  //     7. Population dynamics    [Phase 1]
  //     8. Building income        [Phase 2]
  //     9. Taxation               [Phase 2]
  //    10. Upkeep                 [Phase 2 + 7]
  //    11. Events                 [Phase 4]
  //    11.4. Positive events      [Phase 18D — small flat-chance flavor rewards]
  //
  //   AFTER ALL RULERS (still per-year, not per-ruler):
  //    11.6. Corn price drift     [F2 precursor — field-wide scarcity nudges the Kaiser's price]
  //
  //   ACROSS RULERS:
  //    12. Espionage strikes     [Phase 7]
  //    12.5. Warfare             [F4 — declared wars resolve here, same shape as espionage]
  //    12.75. Succession          [F5 — reign turnover, resets score only]
  //
  //   PER RULER again:
  //    13. Rank promotion check  [Phase 2]
  //
  // Espionage/warfare sit between the two per-ruler passes because they are the
  // only phases where rulers touch each other, and the promotion check has to
  // come after them: a treasury emptied by raiders or a war loss should cost you
  // the title that year.

  // Accumulated across the per-ruler loop below to drift the Kaiser's corn
  // price toward scarcity once every ruler's harvest is known (see
  // driftCornPrice in economy.ts).
  let weatherMultiplierSum = 0
  let weatherSamples = 0

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
      grainOverflowLost: 0,
      weatherId: '',
      weatherName: '',
      grainSold: 0,
      grainBought: 0,
      grainTradeIncome: 0,
      marketIncome: 0,
      millIncome: 0,
      tradingHouseIncome: 0,
      tributeIncome: 0,
      taxIncome: 0,
      tariffIncome: 0,
      upkeepCost: 0,
      eventGoldLoss: 0,
      eventPopulationLoss: 0,
      eventBuildingsDestroyed: 0,
      eventGrainLoss: 0,
      eventFarmlandLoss: 0,
      unrestGain: 0,
      events: [],
      rankPromoted: false,
      succession: false,
      extinct: false,
      shortfalls: [],
      positiveEvent: null
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
      const talerBeforeRecruitment = player.taler
      const recruitResult = applyRecruitment(player, espionageDecision.guardHire, espionageDecision.saboteurHire)
      noteShortfall(report, 'guards', espionageDecision.guardHire, recruitResult.guardsHired, talerBeforeRecruitment)
      noteShortfall(report, 'saboteurs', espionageDecision.saboteurHire, recruitResult.saboteursHired, talerBeforeRecruitment)
    }

    // 2.5. Military investment (F4/Phase 18C) — training and equipment levels.
    //      Sits with recruitment rather than construction because it is the same
    //      class of spend (standing military capability), and BEFORE step 12.5
    //      so this year's investment counts in this year's war, matching how a
    //      garrison built in step 3 already does.
    const warDecisionForInvestment = findDecision<WarDecision>(playerDecisions, 'war')
    if (warDecisionForInvestment) {
      const talerBeforeMilitary = player.taler
      const militaryResult = applyMilitaryInvestment(
        player,
        warDecisionForInvestment.trainingInvest ?? 0,
        warDecisionForInvestment.equipmentInvest ?? 0
      )
      noteShortfall(report, 'training levels', warDecisionForInvestment.trainingInvest ?? 0, militaryResult.trainingBought, talerBeforeMilitary)
      noteShortfall(report, 'equipment levels', warDecisionForInvestment.equipmentInvest ?? 0, militaryResult.equipmentBought, talerBeforeMilitary)
    }

    // 3. Construction
    const constructionDecision = findDecision<ConstructionDecision>(playerDecisions, 'construction') ?? DEFAULT_CONSTRUCTION_DECISION
    const buildingsBeforeConstruction = { ...player.buildings }
    const tradingHousesBeforeConstruction = player.tradingHouses
    const talerBeforeConstruction = player.taler
    const constructionResult = applyConstruction(
      player.land, player.population, player.buildings, player.taler, player.rank, player.tradingHouses, constructionDecision
    )
    player.buildings = constructionResult.newBuildings
    player.taler = constructionResult.newTaler
    player.tradingHouses = constructionResult.newTradingHouses

    const shortfallsBeforeConstruction = report.shortfalls.length
    noteShortfall(report, 'markets', constructionDecision.marketBuild, player.buildings.markets - buildingsBeforeConstruction.markets, talerBeforeConstruction)
    noteShortfall(report, 'mills', constructionDecision.millBuild, player.buildings.mills - buildingsBeforeConstruction.mills, talerBeforeConstruction)
    noteShortfall(report, 'hospitals', constructionDecision.hospitalBuild, player.buildings.hospital - buildingsBeforeConstruction.hospital, talerBeforeConstruction)
    noteShortfall(report, 'wells', constructionDecision.wellBuild, player.buildings.well - buildingsBeforeConstruction.well, talerBeforeConstruction)
    noteShortfall(report, 'granaries', constructionDecision.granaryBuild, player.buildings.granary - buildingsBeforeConstruction.granary, talerBeforeConstruction)
    noteShortfall(report, 'garrisons', constructionDecision.garrisonBuild, player.buildings.garrison - buildingsBeforeConstruction.garrison, talerBeforeConstruction)
    noteShortfall(report, 'dikes', constructionDecision.dikeBuild ?? 0, (player.buildings.dike ?? 0) - (buildingsBeforeConstruction.dike ?? 0), talerBeforeConstruction)
    noteShortfall(report, 'palace stages', constructionDecision.palaceStages, player.buildings.palace - buildingsBeforeConstruction.palace, talerBeforeConstruction)
    if (constructionDecision.cathedralBuild && buildingsBeforeConstruction.cathedral === 0) {
      noteShortfall(report, 'cathedral', 1, player.buildings.cathedral - buildingsBeforeConstruction.cathedral, talerBeforeConstruction)
    }
    noteShortfall(report, 'trading houses', constructionDecision.tradingHouseBuild ?? 0, player.tradingHouses - tradingHousesBeforeConstruction, talerBeforeConstruction)

    // Bug report #27 ("I sold a lot of grain but it did not build"): the
    // grain market doesn't settle until step 6, AFTER construction (step 3),
    // deliberately — see step 6's own comment. That means a same-turn grain
    // sale can never fund a same-turn build; reordering the pipeline is a
    // bigger, riskier change (every step number in this file's tests is tied
    // to the current order), so this makes the OUTCOME legible instead: if a
    // construction shortfall just happened and this turn also queued a grain
    // sale, say so explicitly rather than leaving the player to infer it from
    // a treasury number alone.
    const queuedGrainSale = findDecision<GrainDecision>(playerDecisions, 'grain')?.sellGrain ?? 0
    if (report.shortfalls.length > shortfallsBeforeConstruction && queuedGrainSale > 0) {
      report.shortfalls.push(
        `This turn's grain sale settles after construction, so its proceeds didn't count toward the build above — queue the sale a turn ahead if you're relying on it to fund one.`
      )
    }

    // 4. Harvest (labor-gated productivity, weather band, spoilage, storage cap)
    const harvest = calculateHarvest(
      player.land, player.population, player.grainStock, player.buildings.granary, rng
    )
    player.grainStock = harvest.newGrainStock
    report.harvestYield = harvest.grossYield
    report.spoilage = harvest.spoiledFromStock
    report.grainOverflowLost = harvest.overflowLost
    report.weatherId = harvest.weather.id
    report.weatherName = harvest.weather.name
    weatherMultiplierSum += harvest.weather.multiplier
    weatherSamples += 1

    // 5. Grain feeding decision
    const grainDecision = findDecision<GrainDecision>(playerDecisions, 'grain') ?? DEFAULT_GRAIN_DECISION
    const feeding = resolveFeeding(grainDecision, player.population, player.grainStock)
    player.grainStock = feeding.grainStockAfter

    // 6. Grain market — settled AFTER feeding, so a ruler sells genuine surplus
    //    rather than the bread out of its peasants' mouths.
    const capacity = storageCapacity(player.population, player.buildings.granary)
    const trade = applyGrainTrade(
      player.grainStock, player.taler,
      grainDecision.sellGrain ?? 0, grainDecision.buyGrain ?? 0,
      newState.kaizerTradePrices.corn, capacity
    )
    player.grainStock = trade.grainStockAfter
    player.taler = Math.max(0, player.taler + trade.talerDelta)
    report.grainSold = trade.soldUnits
    report.grainBought = trade.boughtUnits
    report.grainTradeIncome = trade.talerDelta

    // 7. Population dynamics (births/deaths/migration driven by feeding adequacy)
    const popResult = applyPopulationDynamics(player.population, feeding, rng)
    player.population = popResult.newPopulation
    report.births = popResult.births
    report.deaths = popResult.deaths
    report.emigration = popResult.emigration
    report.immigration = popResult.immigration

    // Extinction: population collapsed to nothing. No heir is possible — this is
    // the one permanent failure state, distinct from succession below.
    report.extinct = checkExtinction(player)

    // 8. Building income (markets/mills/trading houses, from buildings as of this year's construction)
    const income = calculateBuildingIncome(player.buildings, player.tradingHouses)
    player.taler += income.marketIncome + income.millIncome + income.tradingHouseIncome
    report.marketIncome = income.marketIncome
    report.millIncome = income.millIncome
    report.tradingHouseIncome = income.tradingHouseIncome

    // 9. Taxation (revenue from the population's economic output; burden feeds unrest)
    const taxDecision = findDecision<TaxDecision>(playerDecisions, 'tax') ?? DEFAULT_TAX_DECISION
    const taxResult = applyTaxation(player.population, taxDecision, tradeVolume)
    player.taler += taxResult.totalRevenue
    player.population.unrest = Math.min(100, player.population.unrest + taxResult.unrestDelta)
    report.taxIncome = taxResult.taxIncome
    report.tariffIncome = taxResult.tariffIncome
    report.tributeIncome = taxResult.graftBonus

    // Reign score: cumulative productive income this reign (F5) — resets on
    // succession below, independent of the real material state (land/rank/
    // buildings), which never resets.
    player.score += income.marketIncome + income.millIncome + income.tradingHouseIncome + taxResult.totalRevenue

    // 10. Upkeep (buildings, trading-house tribute, the standing secret service,
    //    and the standing army's training/equipment — all scale with holdings or
    //    ambition, the anti-snowball lever)
    const upkeep = calculateUpkeep(player.buildings, player.tradingHouses, player.taler)
      + espionageUpkeep(player)
      + militaryUpkeep(player)
    player.taler = Math.max(0, player.taler - upkeep)
    report.upkeepCost = upkeep

    // 11. Events (plague/fire/banditry scale with prosperity; revolt/famine compound
    //    the player's own bad state). Resolved AFTER taxation so revolt reacts to
    //    this year's unrest including the tax burden, and BEFORE the rank check so
    //    a bad year can genuinely cost a promotion.
    const eventResult = resolveEvents(
      player,
      { feedAdequacy: feeding.feedAdequacy, weatherMultiplier: harvest.weather.multiplier },
      rng
    )
    report.events = eventResult.events
    report.eventGoldLoss = eventResult.totalGoldLoss
    report.eventPopulationLoss = eventResult.totalPopulationLoss
    report.eventBuildingsDestroyed = eventResult.totalBuildingsDestroyed
    report.eventGrainLoss = eventResult.totalGrainLoss
    report.eventFarmlandLoss = eventResult.totalFarmlandLoss

    // 11.4. Positive events (Phase 18D) — small, flat-chance flavor rewards,
    //    deliberately unrelated to prosperity/unrest exposure (unlike the
    //    negative events above). After the negative-event roll so both draw
    //    from a consistent RNG position regardless of which fired.
    report.positiveEvent = rollPositiveEvent(player, rng)

    report.unrestGain = player.population.unrest - unrestAtYearStart

    chronicle.playerReports[playerId] = report
  }

  // 11.6. Corn price drift — a field-wide poor/bountiful harvest nudges next
  // year's Kaiser corn price (economy.ts driftCornPrice). Deliberately global
  // rather than per-ruler: the Kaiser is one NPC market, not a separate price
  // for each principality. No new RNG draw — reuses each ruler's own harvest
  // roll already spent above.
  if (weatherSamples > 0) {
    newState.kaizerTradePrices.corn = driftCornPrice(
      newState.kaizerTradePrices.corn, weatherMultiplierSum / weatherSamples
    )
  }

  // 12. Espionage strikes — the only cross-ruler phase.
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

  // 12.5. Warfare — same cross-ruler shape as espionage, resolved in
  // activePlayerIds order for the same determinism reason.
  // Phase 19A: refuse live truces; register mutual cooldown + weariness on
  // resolution; convert weariness → unrest; decay for non-belligerents.
  if (!newState.truces) newState.truces = {}
  const belligerents = new Set<string>()

  for (const attackerId of newState.activePlayerIds) {
    const attacker = newState.players[attackerId]
    if (!attacker || attacker.dead) continue

    const war = findDecision<WarDecision>(decisions[attackerId] ?? [], 'war')
    if (!war?.declare || !war.targetPlayerId) continue

    const defender = newState.players[war.targetPlayerId]
    // Silently ignore a war declared at a ruler who is gone, dead, or at oneself,
    // rather than failing the whole year over a stale target — same treatment
    // espionage gives a stale strike target.
    if (!defender || defender.dead || defender.id === attackerId) continue
    if (!newState.activePlayerIds.includes(defender.id)) continue
    if (isTruceActive(newState.truces, attacker.id, defender.id, newState.year)) {
      // Belt-and-braces: UI should disable truce targets, but if a declaration
      // still arrives, explain the refuse on the year report (silent-failure class).
      const report = chronicle.playerReports[attackerId]
      const expiry = newState.truces[trucePairKey(attacker.id, defender.id)]
      if (report) {
        report.shortfalls.push(
          `Truce with ${defender.name} holds until year ${expiry} — war declaration ignored.`
        )
      }
      continue
    }

    const requestedAllies = (war.alliesRequested ?? [])
      .map((id) => newState.players[id])
      .filter((p): p is typeof attacker => !!p && !p.dead && newState.activePlayerIds.includes(p.id))
    const joinedAllies = resolveAllianceRequests(requestedAllies, attacker, defender, rng)

    const outcome = resolveWar(attacker, defender, joinedAllies, rng)
    registerTruce(newState.truces, attacker.id, defender.id, newState.year, WARFARE.truceYears)
    attacker.warWeariness = (attacker.warWeariness ?? 0) + WARFARE.wearinessPerWar
    defender.warWeariness = (defender.warWeariness ?? 0) + WARFARE.wearinessPerWar
    belligerents.add(attacker.id)
    belligerents.add(defender.id)

    chronicle.wars.push({
      attackerId: outcome.attackerId,
      defenderId: outcome.defenderId,
      alliesJoined: outcome.alliesJoined,
      attackerWon: outcome.attackerWon,
      attackerCasualties: outcome.attackerCasualties,
      defenderCasualties: outcome.defenderCasualties,
      landTransferred: outcome.landTransferred,
      populationTransferred: outcome.populationTransferred,
      reparationsPaid: outcome.reparationsPaid,
      garrisonDestroyed: outcome.garrisonDestroyed
    })
  }

  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    if (!player || player.dead) continue
    const weariness = player.warWeariness ?? 0
    if (weariness > 0) {
      player.population.unrest = Math.min(
        100,
        player.population.unrest + weariness * WARFARE.wearinessUnrestMultiplier
      )
    }
    if (!belligerents.has(playerId) && weariness > 0) {
      player.warWeariness = Math.max(0, weariness - WARFARE.wearinessDecayPerYear)
    }
  }

  // 12.75. Succession (F5) — after strikes and wars so the required unconditional
  // succession draw cannot perturb the hostile-action stream, and before
  // promotion because succession resets only score/reign/heir, not title inputs.
  for (const playerId of newState.activePlayerIds) {
    const player = newState.players[playerId]
    const report = chronicle.playerReports[playerId]
    // Skipped for a realm that just went extinct this year; there is no one left
    // for an heir to inherit from.
    if (!player || player.dead || !report) continue
    report.succession = applySuccession(player, rng).succeeded
  }

  // 13. Rank promotion check — after espionage/warfare, so a treasury emptied by
  //     raiders or a war loss genuinely costs the title this year.
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
