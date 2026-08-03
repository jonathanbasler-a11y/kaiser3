// The human player's in-progress choices for the current year, as one mutable
// draft object the form controls read from and write to. Converted to the same
// Decision[] shape the AI emits (planner.ts) — Decision parity holds for the UI
// too, so there is exactly one definition of what a legal turn looks like
// (engine/decisions.ts validates both).

import { GameState, Decision, EspionageMode, PlayerState } from '../engine/state.ts'
import { annualGrainRequirement } from '../engine/economy.ts'

export interface DecisionDraft {
  feedLevel: 'min' | 'max' | 'required' | 'custom'
  customPercentage: number
  sellGrain: number
  buyGrain: number
  farmlanbuy: number
  buildingLandBuy: number
  vat: number
  incomeTax: number
  tariff: number
  justiceGraft: number
  marketBuild: number
  millBuild: number
  palaceStages: number
  cathedralBuild: boolean
  wellBuild: number
  hospitalBuild: number
  granaryBuild: number
  garrisonBuild: number
  dikeBuild: number
  tradingHouseBuild: number
  guardHire: number
  saboteurHire: number
  targetPlayerId: string | null
  saboteursCommitted: number
  mode: EspionageMode
  declareWar: boolean
  warTargetPlayerId: string | null
  warAlliesRequested: string[]
  // Phase 18C: LEVELS TO BUY this year, not the running totals (those live on
  // PlayerState) — the same relationship guardHire has to player.guards.
  trainingInvest: number
  equipmentInvest: number
}

// Sensible defaults each year, re-derived from the fresh state rather than carried
// over — a stale "sell 5000 grain" order from last year should not silently repeat
// against a barn that may now hold far less.
export function defaultDraft(player: PlayerState): DecisionDraft {
  return {
    feedLevel: 'required',
    customPercentage: 50,
    sellGrain: 0,
    buyGrain: 0,
    farmlanbuy: 0,
    buildingLandBuy: 0,
    vat: 15,
    incomeTax: 15,
    tariff: 5,
    justiceGraft: 0,
    marketBuild: 0,
    millBuild: 0,
    palaceStages: 0,
    cathedralBuild: false,
    wellBuild: 0,
    hospitalBuild: 0,
    granaryBuild: 0,
    garrisonBuild: 0,
    dikeBuild: 0,
    tradingHouseBuild: 0,
    guardHire: 0,
    saboteurHire: 0,
    targetPlayerId: null,
    saboteursCommitted: Math.min(player.saboteurs, 4),
    mode: 'raid',
    declareWar: false,
    warTargetPlayerId: null,
    warAlliesRequested: [],
    trainingInvest: 0,
    equipmentInvest: 0
  }
}

export function draftToDecisions(draft: DecisionDraft): Decision[] {
  return [
    {
      type: 'grain',
      feedLevel: draft.feedLevel,
      customPercentage: draft.feedLevel === 'custom' ? draft.customPercentage : undefined,
      sellGrain: draft.sellGrain,
      buyGrain: draft.buyGrain
    },
    {
      type: 'land_trade',
      farmlanbuy: draft.farmlanbuy,
      buildingLandBuy: draft.buildingLandBuy,
      partnerPlayerId: 'kaiser'
    },
    {
      type: 'tax',
      vat: draft.vat,
      incomeTax: draft.incomeTax,
      tariff: draft.tariff,
      justiceGraft: draft.justiceGraft
    },
    {
      type: 'construction',
      marketBuild: draft.marketBuild,
      millBuild: draft.millBuild,
      palaceStages: draft.palaceStages,
      cathedralBuild: draft.cathedralBuild,
      wellBuild: draft.wellBuild,
      hospitalBuild: draft.hospitalBuild,
      granaryBuild: draft.granaryBuild,
      garrisonBuild: draft.garrisonBuild,
      dikeBuild: draft.dikeBuild,
      tradingHouseBuild: draft.tradingHouseBuild
    },
    {
      type: 'espionage',
      guardHire: draft.guardHire,
      saboteurHire: draft.saboteurHire,
      targetPlayerId: draft.targetPlayerId ?? undefined,
      saboteursCommitted: draft.targetPlayerId ? draft.saboteursCommitted : undefined,
      mode: draft.targetPlayerId ? draft.mode : undefined
    },
    {
      type: 'war',
      declare: draft.declareWar && !!draft.warTargetPlayerId,
      targetPlayerId: draft.warTargetPlayerId ?? undefined,
      alliesRequested: draft.warAlliesRequested.length > 0 ? draft.warAlliesRequested : undefined,
      // Unconditional, unlike the fields above: buying training/equipment is a
      // standing investment that stands on its own, with or without a war
      // declared this year — most of the time you build the army first.
      trainingInvest: draft.trainingInvest,
      equipmentInvest: draft.equipmentInvest
    }
  ]
}

/** Max sell units given stock left AFTER feeding (year.ts settles trade after feed). */
export function maxSellableGrain(stockAfterFeeding: number): number {
  return Math.max(0, Math.floor(stockAfterFeeding))
}

export function maxAffordableGrainBuy(player: PlayerState, cornBuyPrice: number): number {
  if (cornBuyPrice <= 0) return 0
  return Math.floor(player.taler / cornBuyPrice)
}

export function yearsOfFoodLabel(player: PlayerState): string {
  const needed = annualGrainRequirement(player.population)
  if (needed <= 0) return '—'
  return (player.grainStock / needed).toFixed(1)
}

export function affordableHectares(taler: number, pricePerHectare: number): number {
  if (pricePerHectare <= 0) return 0
  return Math.floor(taler / pricePerHectare)
}

/** How many new hires the stepper may offer this turn (standing → data cap). */
export function maxNewHires(standing: number, cap: number): number {
  return Math.max(0, cap - standing)
}

export function rivalOptions(state: GameState, humanId: string): Array<{ id: string; name: string }> {
  return state.activePlayerIds
    .filter((id) => id !== humanId)
    .map((id) => ({ id, name: state.players[id].name }))
}
