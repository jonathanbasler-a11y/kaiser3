// Taxation: VAT/income tax/tariffs/justice graft, levied on the population's
// economic output. Revenue flows TO the ruler; burden flows into unrest.
// "Population has a tolerance ceiling" (docs/kaiser-research.md) — tax past that
// ceiling buys short-term gold at the cost of long-term stability.

import economyData from '../../data/economy.json'
import { PopulationState, TaxDecision } from './state.ts'

const POP_ECONOMY = economyData.population
const TAXATION = economyData.taxation

export interface TaxResult {
  taxIncome: number         // VAT + income tax revenue
  tariffIncome: number      // Tariff revenue on trade volume
  graftBonus: number        // Extra revenue extracted via judicial corruption
  totalRevenue: number      // taxIncome + tariffIncome + graftBonus
  unrestDelta: number       // Unrest added (0 if burden is within tolerance)
}

export function applyTaxation(
  population: PopulationState,
  decision: TaxDecision,
  tradeVolume: number  // Taler value of land trade activity this year (tariff base)
): TaxResult {
  const grossPopulationIncome = population.peasants * POP_ECONOMY.incomePerCapita

  const combinedRate = (decision.vat + decision.incomeTax) / 2 / 100
  const taxIncome = grossPopulationIncome * combinedRate
  const tariffIncome = tradeVolume * (decision.tariff / 100)

  const graftBonus = (taxIncome + tariffIncome) * (decision.justiceGraft / 100) * TAXATION.graftRevenueBonus
  const totalRevenue = taxIncome + tariffIncome + graftBonus

  // Burden combines the three tax knobs (average) with judicial corruption (graft
  // burdens the population even though it doesn't scale 1:1 with visible tax rates).
  const burden = (decision.vat + decision.incomeTax + decision.tariff) / 3
    + decision.justiceGraft * TAXATION.graftUnrestMultiplier

  let unrestDelta = 0
  if (burden > TAXATION.toleranceThreshold) {
    unrestDelta = (burden - TAXATION.toleranceThreshold) * TAXATION.unrestPerExcessPoint / 10
  }

  return { taxIncome, tariffIncome, graftBonus, totalRevenue, unrestDelta }
}
