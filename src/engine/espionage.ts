// SECRET SERVICE — guards, saboteurs, and strikes against rival rulers.
//
// From docs/kaiser-research.md: the original's espionage phase let a ruler hire
// guards (defence) and saboteurs (offence), then send saboteurs to burn a rival's
// buildings and carry off what was inside; a failed attempt cost the saboteurs.
// Fugger II's piracy is the same shape aimed at wealth rather than infrastructure,
// so both are modelled here as two modes of one contest.
//
// Beyond flavour this is an ANTI-SNOWBALL lever, and the one Phase 6 flagged as
// missing: its loss-persistence criterion is about "events AND AI aggression", and
// until now only events existed. A ruler who pulls ahead becomes the obvious
// target for every rival, so a lead now invites attack instead of compounding
// quietly.

import economyData from '../../data/economy.json'
import { SeededRng } from './rng.ts'
import { PlayerState, EspionageMode } from './state.ts'
import { finiteOr } from './sanitize.ts'

const ESPIONAGE = economyData.espionage

// Probability that a strike gets through. Exported so the AI prices attacks with
// the REAL formula rather than an approximation that could drift from it.
//
// `baseDefence` represents the ordinary watchfulness of any settlement — walls,
// suspicious neighbours, a bailiff. Without it an undefended ruler would be robbed
// with certainty every single year, which is punishing rather than tense.
export function strikeSuccessProbability(saboteursCommitted: number, defendingGuards: number): number {
  if (saboteursCommitted <= 0) return 0
  return saboteursCommitted / (saboteursCommitted + defendingGuards + ESPIONAGE.baseDefence)
}

export interface StrikeOutcome {
  attackerId: string
  defenderId: string
  mode: EspionageMode
  saboteursCommitted: number
  succeeded: boolean
  saboteursLost: number
  talerStolen: number
  grainStolen: number
  buildingsDestroyed: number
}

function removeOneProductionBuilding(player: PlayerState): number {
  if (player.buildings.markets >= player.buildings.mills && player.buildings.markets > 0) {
    player.buildings.markets -= 1
    return 1
  }
  if (player.buildings.mills > 0) {
    player.buildings.mills -= 1
    return 1
  }
  return 0
}

// Resolves one strike, mutating both rulers.
export function resolveStrike(
  attacker: PlayerState,
  defender: PlayerState,
  saboteursCommitted: number,
  mode: EspionageMode,
  rng: SeededRng
): StrikeOutcome {
  // Sanitized at the boundary (sanitize.ts): Math.max/min do NOT self-heal
  // NaN (Math.max(0, NaN) is NaN, not 0), and `committed` becomes
  // attacker.saboteurs — a running total — so an unsanitized NaN order would
  // poison it permanently instead of degrading to "commit nothing."
  const committed = Math.max(0, Math.min(Math.floor(finiteOr(saboteursCommitted, 0)), attacker.saboteurs))

  const outcome: StrikeOutcome = {
    attackerId: attacker.id,
    defenderId: defender.id,
    mode,
    saboteursCommitted: committed,
    succeeded: false,
    saboteursLost: 0,
    talerStolen: 0,
    grainStolen: 0,
    buildingsDestroyed: 0
  }
  const strikeRoll = rng.next()
  if (committed <= 0) return outcome

  const probability = strikeSuccessProbability(committed, defender.guards)
  outcome.succeeded = strikeRoll < probability

  // Saboteurs are lost either way — heavily on failure, lightly on success. This
  // makes a secret service an expendable, recurring investment rather than a
  // permanent army that pays dividends forever.
  const lossRate = outcome.succeeded ? ESPIONAGE.successSaboteurLossRate : ESPIONAGE.failureSaboteurLossRate
  outcome.saboteursLost = Math.min(committed, Math.max(1, Math.round(committed * lossRate)))
  attacker.saboteurs = Math.max(0, attacker.saboteurs - outcome.saboteursLost)

  if (!outcome.succeeded) return outcome

  if (mode === 'raid') {
    // Plunder: wealth changes hands. Scales with the victim's treasury, so raiding
    // the leader is worth more than bullying a pauper.
    outcome.talerStolen = defender.taler * ESPIONAGE.lootTreasuryFraction
    defender.taler = Math.max(0, defender.taler - outcome.talerStolen)
    attacker.taler += outcome.talerStolen
  } else {
    // Sabotage: burn a workshop, then carry off what was inside — grain AND a
    // share of the coin kept with it, per the original (docs/kaiser-research.md:
    // "transfers their grain/currency to the attacker"). The building itself is
    // destroyed rather than transferred. The coin share is well below a dedicated
    // raid's: sabotage trades plunder for permanent damage.
    outcome.buildingsDestroyed = removeOneProductionBuilding(defender)

    outcome.grainStolen = defender.grainStock * ESPIONAGE.lootGrainFraction
    defender.grainStock = Math.max(0, defender.grainStock - outcome.grainStolen)
    attacker.grainStock += outcome.grainStolen

    outcome.talerStolen = defender.taler * ESPIONAGE.sabotageTreasuryFraction
    defender.taler = Math.max(0, defender.taler - outcome.talerStolen)
    attacker.taler += outcome.talerStolen
  }

  return outcome
}

export interface RecruitmentResult {
  guardsHired: number
  saboteursHired: number
  spent: number
}

// Recruitment is clamped to affordability and to a standing-force cap, so an
// over-ambitious order is trimmed rather than rejected — the same forgiving
// treatment construction gets.
export function applyRecruitment(
  player: PlayerState,
  guardHire: number,
  saboteurHire: number
): RecruitmentResult {
  let remaining = player.taler
  const result: RecruitmentResult = { guardsHired: 0, saboteursHired: 0, spent: 0 }

  // Sanitized at the boundary (sanitize.ts) — same reasoning as resolveStrike
  // above: player.guards/saboteurs are running totals, so a NaN hire order
  // must degrade to "hire none," not poison the standing force forever.
  const safeGuardHire = finiteOr(guardHire, 0)
  const safeSaboteurHire = finiteOr(saboteurHire, 0)

  const guardRoom = Math.max(0, ESPIONAGE.maxGuards - player.guards)
  const affordableGuards = Math.floor(remaining / ESPIONAGE.guardCost)
  result.guardsHired = Math.max(0, Math.min(Math.floor(safeGuardHire), guardRoom, affordableGuards))
  remaining -= result.guardsHired * ESPIONAGE.guardCost

  const saboteurRoom = Math.max(0, ESPIONAGE.maxSaboteurs - player.saboteurs)
  const affordableSaboteurs = Math.floor(remaining / ESPIONAGE.saboteurCost)
  result.saboteursHired = Math.max(0, Math.min(Math.floor(safeSaboteurHire), saboteurRoom, affordableSaboteurs))
  remaining -= result.saboteursHired * ESPIONAGE.saboteurCost

  player.guards += result.guardsHired
  player.saboteurs += result.saboteursHired
  result.spent = player.taler - remaining
  player.taler = remaining

  return result
}

export function espionageUpkeep(player: PlayerState): number {
  return player.guards * ESPIONAGE.guardUpkeepPerYear
    + player.saboteurs * ESPIONAGE.saboteurUpkeepPerYear
}
