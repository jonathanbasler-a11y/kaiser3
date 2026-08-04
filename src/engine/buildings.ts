// Construction, building income, and upkeep. Markets/mills are ratio-gated by
// land (1 per 1,000 hectares — docs/kaiser-research.md); palaces/cathedrals are
// prestige buildings gated by land and population thresholds, required for the
// top ranks. Every building carries ongoing upkeep — this is a deliberate
// anti-snowball lever (docs/kaiser-research.md § Persistent Scarcity):
// bigger holdings mean bigger standing costs, not just bigger income.

import buildingsData from '../../data/buildings.json'
import economyData from '../../data/economy.json'
import { BuildingState, ConstructionDecision, LandHolding, PopulationState } from './state.ts'
import { finiteOr } from './sanitize.ts'
import { totalLand } from './land.ts'

const PRODUCTION = buildingsData.production
const PRESTIGE = buildingsData.prestige
const MITIGATION = buildingsData.mitigation
const COMMERCE = buildingsData.commerce
const UPKEEP = economyData.upkeep

/** Same land gate applyConstruction uses before palace stages can begin. */
export function meetsPalaceLandGate(landHeld: number): boolean {
  return landHeld >= PRESTIGE.palace.landRequirement
}

/** Same land+population gates applyConstruction uses for the cathedral attempt. */
export function meetsCathedralGates(landHeld: number, peasants: number): boolean {
  return (
    landHeld >= PRESTIGE.cathedral.landRequirement &&
    peasants >= PRESTIGE.cathedral.requiresMinPopulation
  )
}

/** Same population gate that caps hospital construction. */
export function meetsHospitalPopulationGate(peasants: number): boolean {
  return peasants >= MITIGATION.hospital.requiresMinPopulation
}

export interface ConstructionResult {
  newBuildings: BuildingState
  newTaler: number
  newTradingHouses: number
  spent: number
}

// Spends taler on construction in a fixed priority order (markets, mills, mitigation
// buildings, palace stages, cathedral), skipping/clamping anything unaffordable or
// beyond ratio/threshold caps rather than failing the whole decision.
export function applyConstruction(
  land: LandHolding,
  population: PopulationState,
  buildings: BuildingState,
  taler: number,
  rank: number,
  tradingHouses: number,
  decision: ConstructionDecision
): ConstructionResult {
  const landHeld = totalLand(land)
  let remainingTaler = taler
  const newBuildings: BuildingState = { ...buildings }

  // Every construction count in this function funnels through here, so
  // sanitizing `requested` once (sanitize.ts) covers markets/mills/mitigation
  // buildings/palace stages/cathedral/trading houses in one place — a NaN
  // build order degrades to "build nothing" rather than poisoning
  // newBuildings/remainingTaler (both running totals) for every year after.
  const buildCapped = (requested: number, cost: number, capRemaining: number): number => {
    const safeRequested = finiteOr(requested, 0)
    const affordable = cost > 0 ? Math.floor(remainingTaler / cost) : safeRequested
    const count = Math.max(0, Math.min(safeRequested, capRemaining, affordable))
    remainingTaler -= count * cost
    return count
  }

  // Markets & mills: ratio-gated by total land holdings.
  const maxMarkets = Math.floor(landHeld / PRODUCTION.market.ratioPerHectares)
  const marketsBuilt = buildCapped(decision.marketBuild, PRODUCTION.market.buildCost, Math.max(0, maxMarkets - newBuildings.markets))
  newBuildings.markets += marketsBuilt

  const maxMills = Math.floor(landHeld / PRODUCTION.mill.ratioPerHectares)
  const millsBuilt = buildCapped(decision.millBuild, PRODUCTION.mill.buildCost, Math.max(0, maxMills - newBuildings.mills))
  newBuildings.mills += millsBuilt

  // Mitigation buildings: affordability-gated only (no ratio cap — one of each is
  // enough to reduce risk; more upkeep for more isn't modeled in Phase 2).
  const hospitalMax = meetsHospitalPopulationGate(population.peasants) ? 1 : 0
  newBuildings.hospital += buildCapped(decision.hospitalBuild, MITIGATION.hospital.cost, Math.max(0, hospitalMax - newBuildings.hospital))

  newBuildings.well += buildCapped(decision.wellBuild, MITIGATION.well.cost, Math.max(0, 1 - newBuildings.well))
  newBuildings.granary += buildCapped(decision.granaryBuild, MITIGATION.granary.cost, Math.max(0, 1 - newBuildings.granary))
  newBuildings.garrison += buildCapped(decision.garrisonBuild, MITIGATION.garrison.cost, Math.max(0, 1 - newBuildings.garrison))
  // F6: dike (flood mitigation). Same affordability-gated, one-of-each shape
  // as the other mitigation buildings above.
  newBuildings.dike = (newBuildings.dike ?? 0)
    + buildCapped(decision.dikeBuild ?? 0, MITIGATION.dike.cost, Math.max(0, 1 - (newBuildings.dike ?? 0)))

  // Palace: requires enough land to begin, then up to 16 stages, 5,000 Taler each.
  if (meetsPalaceLandGate(landHeld)) {
    const stagesBuilt = buildCapped(decision.palaceStages, PRESTIGE.palace.costPerStage, Math.max(0, PRESTIGE.palace.stages - newBuildings.palace))
    newBuildings.palace += stagesBuilt
  }

  // Cathedral: single build, requires land + population thresholds.
  if (
    decision.cathedralBuild &&
    newBuildings.cathedral === 0 &&
    meetsCathedralGates(landHeld, population.peasants)
  ) {
    const built = buildCapped(1, PRESTIGE.cathedral.cost, 1)
    newBuildings.cathedral += built
  }

  // Trading houses: rank-gated (Margrave+, data-driven) rather than a land ratio —
  // per docs/kaiser-research.md these are LEASED from the Kaiser, not built on your
  // own holdings, so there is no land cost, only the lease price and a count cap.
  let newTradingHouses = tradingHouses
  if (rank >= COMMERCE.tradingHouse.requiresRank) {
    const built = buildCapped(
      decision.tradingHouseBuild ?? 0,
      COMMERCE.tradingHouse.cost,
      Math.max(0, COMMERCE.tradingHouse.maxCount - newTradingHouses)
    )
    newTradingHouses += built
  }

  return { newBuildings, newTaler: remainingTaler, newTradingHouses, spent: taler - remainingTaler }
}

export interface BuildingIncomeResult {
  marketIncome: number
  millIncome: number
  tradingHouseIncome: number
}

export function calculateBuildingIncome(buildings: BuildingState, tradingHouses: number): BuildingIncomeResult {
  return {
    marketIncome: buildings.markets * PRODUCTION.market.incomePerYear,
    millIncome: buildings.mills * PRODUCTION.mill.incomePerYear,
    tradingHouseIncome: tradingHouses * COMMERCE.tradingHouse.incomePerYear
  }
}

export interface BuildingUpkeepBreakdown {
  markets: number
  mills: number
  palace: number
  cathedral: number
  hospital: number
  well: number
  granary: number
  garrison: number
  dike: number
  tradingHouseTribute: number
  total: number
}

// Itemised version of calculateUpkeep below — same terms, kept as separate
// named fields so the UI can show WHERE upkeep goes instead of one opaque
// scalar (Phase 20 follow-up: "explain every number").
export function calculateUpkeepBreakdown(
  buildings: BuildingState,
  tradingHouses: number,
  taler: number
): BuildingUpkeepBreakdown {
  const markets = buildings.markets * PRODUCTION.market.upkeepPerYear
  const mills = buildings.mills * PRODUCTION.mill.upkeepPerYear
  const palace = buildings.palace > 0 ? PRESTIGE.palace.upkeepPerYear : 0
  const cathedral = buildings.cathedral * PRESTIGE.cathedral.upkeepPerYear
  const hospital = buildings.hospital * MITIGATION.hospital.upkeepPerYear
  const well = buildings.well * MITIGATION.well.upkeepPerYear
  const granary = buildings.granary * MITIGATION.granary.upkeepPerYear
  const garrison = buildings.garrison * MITIGATION.garrison.upkeepPerYear
  const dike = (buildings.dike ?? 0) * MITIGATION.dike.upkeepPerYear
  const tradingHouseTribute = tradingHouses > 0 ? taler * UPKEEP.tradingHouseTributePercentage : 0
  return {
    markets, mills, palace, cathedral, hospital, well, garrison, granary, dike, tradingHouseTribute,
    total: markets + mills + palace + cathedral + hospital + well + granary + garrison + dike + tradingHouseTribute
  }
}

// Total annual upkeep across all buildings plus trading-house tribute to the Kaiser
// (a percentage of wealth — the anti-snowball lever from Hanse/Kaiser research:
// bigger treasuries pay bigger tribute, not a flat fee).
export function calculateUpkeep(buildings: BuildingState, tradingHouses: number, taler: number): number {
  return calculateUpkeepBreakdown(buildings, tradingHouses, taler).total
}
