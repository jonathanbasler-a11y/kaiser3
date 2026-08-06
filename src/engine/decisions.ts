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

import economyData from '../../data/economy.json'
import { Decision, FeedMode } from './state.ts'

const FEEDING = economyData.feeding

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
        // 21.4: 'max' (80% of barn stock) became 'growth' (115% of demand). Both
        // the mode list and the custom range come from the same source the engine
        // reads, so retuning data/economy.json cannot leave this validator
        // rejecting settings the dial can actually produce.
        const valid: FeedMode[] = ['min', 'required', 'growth', 'custom']
        if (!valid.includes(decision.feedLevel)) {
          errors.push(`grain.feedLevel must be one of ${valid.join('/')} (got ${decision.feedLevel})`)
        }
        if (decision.feedLevel === 'custom') {
          const pct = decision.customPercentage
          const lo = FEEDING.customMinAdequacy * 100
          const hi = FEEDING.customMaxAdequacy * 100
          if (!isFiniteNumber(pct)) {
            errors.push('grain.customPercentage is required when feedLevel is "custom"')
          } else if (pct < lo || pct > hi) {
            errors.push(`grain.customPercentage must be within ${lo}-${hi} (got ${pct})`)
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
        checkNonNegativeInteger('construction.tradingHouseBuild', decision.tradingHouseBuild, errors)
        // dikeBuild (F6) is optional on the type, but once a caller supplies it
        // it must be well-formed like every other build count.
        if (decision.dikeBuild !== undefined) {
          checkNonNegativeInteger('construction.dikeBuild', decision.dikeBuild, errors)
        }
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

      case 'war': {
        if (typeof decision.declare !== 'boolean') errors.push('war.declare must be a boolean')
        if (decision.declare && !decision.targetPlayerId) {
          errors.push('war.targetPlayerId is required when declaring war')
        }
        break
      }

      case 'guild': {
        // 21.6: shape-only. Whether a 'guild' decision actually does anything
        // depends on player.pendingGuild at resolution time (21.8's concern), not
        // on anything checkable from the sheet alone.
        if (decision.action !== 'grant' && decision.action !== 'refuse') {
          errors.push(`guild.action must be "grant" or "refuse" (got ${decision.action})`)
        }
        break
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
