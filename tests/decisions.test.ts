import { describe, it, expect } from 'vitest'
import { validateDecisions } from '../src/engine/decisions.ts'
import { Decision } from '../src/engine/state.ts'

const legalSheet: Decision[] = [
  { type: 'grain', feedLevel: 'required' },
  { type: 'land_trade', farmlanbuy: 100, buildingLandBuy: -50, partnerPlayerId: 'kaiser' },
  { type: 'tax', vat: 20, incomeTax: 20, tariff: 5, justiceGraft: 0 },
  {
    type: 'construction', marketBuild: 2, millBuild: 1, palaceStages: 1, cathedralBuild: false,
    wellBuild: 0, hospitalBuild: 1, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
  }
]

describe('validateDecisions', () => {
  it('accepts a well-formed sheet', () => {
    expect(validateDecisions(legalSheet).valid).toBe(true)
  })

  it('accepts negative land trades — selling land is legal', () => {
    const result = validateDecisions([
      { type: 'land_trade', farmlanbuy: -500, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects tax rates outside 0-100', () => {
    const result = validateDecisions([{ type: 'tax', vat: 150, incomeTax: -5, tariff: 5, justiceGraft: 0 }])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('tax.vat'))).toBe(true)
    expect(result.errors.some((e) => e.includes('tax.incomeTax'))).toBe(true)
  })

  it('rejects negative or fractional build counts', () => {
    const negative = validateDecisions([{
      type: 'construction', marketBuild: -1, millBuild: 0, palaceStages: 0, cathedralBuild: false,
      wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
    }])
    expect(negative.valid).toBe(false)

    const fractional = validateDecisions([{
      type: 'construction', marketBuild: 1.5, millBuild: 0, palaceStages: 0, cathedralBuild: false,
      wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
    }])
    expect(fractional.valid).toBe(false)
  })

  it('rejects a custom feed level outside the 20-80 dial, or with no percentage given', () => {
    expect(validateDecisions([{ type: 'grain', feedLevel: 'custom', customPercentage: 95 }]).valid).toBe(false)
    expect(validateDecisions([{ type: 'grain', feedLevel: 'custom' }]).valid).toBe(false)
    expect(validateDecisions([{ type: 'grain', feedLevel: 'custom', customPercentage: 50 }]).valid).toBe(true)
  })

  it('rejects two decisions of the same type in one sheet', () => {
    const result = validateDecisions([
      { type: 'grain', feedLevel: 'min' },
      { type: 'grain', feedLevel: 'max' }
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true)
  })

  it('rejects NaN and Infinity, which would silently poison the simulation', () => {
    expect(validateDecisions([
      { type: 'land_trade', farmlanbuy: NaN, buildingLandBuy: 0, partnerPlayerId: 'kaiser' }
    ]).valid).toBe(false)
    expect(validateDecisions([
      { type: 'tax', vat: Infinity, incomeTax: 0, tariff: 0, justiceGraft: 0 }
    ]).valid).toBe(false)
  })

  it('requires a target when declaring war', () => {
    expect(validateDecisions([{ type: 'war', declare: true }]).valid).toBe(false)
    expect(validateDecisions([{ type: 'war', declare: true, targetPlayerId: 'rival' }]).valid).toBe(true)
  })
})
