import { describe, it, expect } from 'vitest'
import { applyTaxation } from '../src/engine/tax.ts'
import { PopulationState, TaxDecision } from '../src/engine/state.ts'

const population: PopulationState = { peasants: 1000, unrest: 0 }

describe('applyTaxation', () => {
  it('low, fair taxation generates revenue without raising unrest', () => {
    const decision: TaxDecision = { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 }
    const result = applyTaxation(population, decision, 0)
    expect(result.taxIncome).toBeGreaterThan(0)
    expect(result.unrestDelta).toBe(0)
  })

  it('taxation past the tolerance threshold raises unrest', () => {
    const decision: TaxDecision = { type: 'tax', vat: 90, incomeTax: 90, tariff: 90, justiceGraft: 0 }
    const result = applyTaxation(population, decision, 0)
    expect(result.unrestDelta).toBeGreaterThan(0)
  })

  it('higher tax rates generate more revenue than lower rates (all else equal)', () => {
    const lowDecision: TaxDecision = { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 }
    const highDecision: TaxDecision = { type: 'tax', vat: 50, incomeTax: 50, tariff: 5, justiceGraft: 0 }
    const lowResult = applyTaxation(population, lowDecision, 0)
    const highResult = applyTaxation(population, highDecision, 0)
    expect(highResult.taxIncome).toBeGreaterThan(lowResult.taxIncome)
  })

  it('judicial graft extracts extra revenue but compounds unrest at the same nominal tax rate', () => {
    const fairDecision: TaxDecision = { type: 'tax', vat: 30, incomeTax: 30, tariff: 10, justiceGraft: 0 }
    const corruptDecision: TaxDecision = { type: 'tax', vat: 30, incomeTax: 30, tariff: 10, justiceGraft: 80 }
    const fairResult = applyTaxation(population, fairDecision, 0)
    const corruptResult = applyTaxation(population, corruptDecision, 0)
    expect(corruptResult.totalRevenue).toBeGreaterThan(fairResult.totalRevenue)
    expect(corruptResult.unrestDelta).toBeGreaterThan(fairResult.unrestDelta)
  })

  it('tariff income scales with trade volume', () => {
    const decision: TaxDecision = { type: 'tax', vat: 0, incomeTax: 0, tariff: 10, justiceGraft: 0 }
    const noTrade = applyTaxation(population, decision, 0)
    const withTrade = applyTaxation(population, decision, 10000)
    expect(withTrade.tariffIncome).toBeGreaterThan(noTrade.tariffIncome)
  })
})
