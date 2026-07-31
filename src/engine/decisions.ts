// What counts as a LEGAL decision sheet.
//
// The engine already *clamps* over-ambitious decisions (you can't spend more than
// your treasury, sell more land than you own, or exceed building ratios — see
// land.ts and buildings.ts). This module covers the different question of whether
// a decision is *well-formed* at all: negative build counts, tax rates outside
// 0-100, a custom feed percentage outside the dial's range.
//
// Both the AI planner and the (Phase 9) UI validate against this, so there is one
// definition of legality rather than two that can drift apart. PLAN.md's Phase 5
// acceptance criterion — "AI never emits an illegal decision" — is checked with it.

import { Decision } from './state.ts'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function checkRate(name: string, value: number, errors: string[]): void {
  if (!isFiniteNumber(value)) {
    errors.push(`${name} must be a finite number (got ${value})`)
  } else if (value < 0 || value > 100) {
    errors.push(`${name} must be within 0-100 (got ${value})`)
  }
}

function checkNonNegativeInteger(name: string, value: number, errors: string[]): void {
  if (!isFiniteNumber(value)) {
    errors.push(`${name} must be a finite number (got ${value})`)
  } else if (value < 0) {
    errors.push(`${name} cannot be negative (got ${value})`)
  } else if (!Number.isInteger(value)) {
    errors.push(`${name} must be a whole number (got ${value})`)
  }
}

export function validateDecisions(decisions: Decision[]): ValidationResult {
  const errors: string[] = []
  const seenTypes = new Set<string>()

  for (const decision of decisions) {
    // One decision per domain per year — a sheet with two conflicting tax
    // decisions is ambiguous, and the reducer would silently use only the first.
    if (seenTypes.has(decision.type)) {
      errors.push(`duplicate "${decision.type}" decision in one sheet`)
    }
    seenTypes.add(decision.type)

    switch (decision.type) {
      case 'grain': {
        const valid = ['min', 'max', 'required', 'custom']
        if (!valid.includes(decision.feedLevel)) {
          errors.push(`grain.feedLevel must be one of ${valid.join('/')} (got ${decision.feedLevel})`)
        }
        if (decision.feedLevel === 'custom') {
          const pct = decision.customPercentage
          if (!isFiniteNumber(pct)) {
            errors.push('grain.customPercentage is required when feedLevel is "custom"')
          } else if (pct < 20 || pct > 80) {
            errors.push(`grain.customPercentage must be within 20-80 (got ${pct})`)
          }
        }
        break
      }

      case 'land_trade': {
        if (!isFiniteNumber(decision.farmlanbuy)) errors.push('land_trade.farmlanbuy must be a finite number')
        if (!isFiniteNumber(decision.buildingLandBuy)) errors.push('land_trade.buildingLandBuy must be a finite number')
        if (!decision.partnerPlayerId) errors.push('land_trade.partnerPlayerId is required')
        break
      }

      case 'tax': {
        checkRate('tax.vat', decision.vat, errors)
        checkRate('tax.incomeTax', decision.incomeTax, errors)
        checkRate('tax.tariff', decision.tariff, errors)
        checkRate('tax.justiceGraft', decision.justiceGraft, errors)
        break
      }

      case 'construction': {
        checkNonNegativeInteger('construction.marketBuild', decision.marketBuild, errors)
        checkNonNegativeInteger('construction.millBuild', decision.millBuild, errors)
        checkNonNegativeInteger('construction.palaceStages', decision.palaceStages, errors)
        checkNonNegativeInteger('construction.wellBuild', decision.wellBuild, errors)
        checkNonNegativeInteger('construction.hospitalBuild', decision.hospitalBuild, errors)
        checkNonNegativeInteger('construction.granaryBuild', decision.granaryBuild, errors)
        checkNonNegativeInteger('construction.garrisonBuild', decision.garrisonBuild, errors)
        if (typeof decision.cathedralBuild !== 'boolean') {
          errors.push('construction.cathedralBuild must be a boolean')
        }
        break
      }

      case 'espionage': {
        checkNonNegativeInteger('espionage.guardHire', decision.guardHire, errors)
        checkNonNegativeInteger('espionage.saboteurHire', decision.saboteurHire, errors)
        break
      }

      case 'trade': {
        for (const field of ['cornBuyPrice', 'cornSellPrice', 'farmlanbSellPrice', 'buildingLandSellPrice'] as const) {
          const value = decision[field]
          if (!isFiniteNumber(value)) {
            errors.push(`trade.${field} must be a finite number`)
          } else if (value < 0) {
            errors.push(`trade.${field} cannot be negative (got ${value})`)
          }
        }
        checkRate('trade.minimumPercentageForSale', decision.minimumPercentageForSale, errors)
        break
      }

      case 'war': {
        if (typeof decision.declare !== 'boolean') errors.push('war.declare must be a boolean')
        if (decision.declare && !decision.targetPlayerId) {
          errors.push('war.targetPlayerId is required when declaring war')
        }
        break
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
