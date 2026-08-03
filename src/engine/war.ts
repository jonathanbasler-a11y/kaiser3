// WARFARE — F4 from docs/kaiser-research.md: a declared-war system with alliance
// requests, resolved probabilistically like a battle rather than narrated as a
// dice-roll report. There is no map in Kaiser 3 (unlike the research doc's
// "geography-gated attack requiring passage permission" — that needs a hex/region
// model this game doesn't have), so this is deliberately scoped to what the
// existing architecture actually supports: military strength derived from stats
// the player already manages (garrison, guards, population), resolved once per
// declared war per year, with land changing hands as the closest available stand-in
// for a territorial consequence.
//
// Same shape as espionage.ts on purpose: strength -> probability -> consequences,
// both sides pay a cost regardless of outcome, and mitigation (a garrison) helps
// without making a realm invulnerable — the same "risk never hits zero" rule every
// other mechanic in this game follows.

import economyData from '../../data/economy.json'
import { SeededRng } from './rng.ts'
import { PlayerState } from './state.ts'
import { finiteOr } from './sanitize.ts'

const WARFARE = economyData.warfare

// Total military strength a ruler can field: garrison (a real fortification, worth
// the most per point), a standing watch of guards (worth less — the same secret
// -service force that also stops sabotage, so it isn't purely military), and a
// wartime levy drawn from the population (worth the least per head, but usually
// the largest number by far). Exported so a future AI planner can price wars with
// the exact odds the engine will roll, the same contract strikeSuccessProbability
// already gives espionage.
export function warStrength(player: PlayerState): number {
  const base =
    player.buildings.garrison * WARFARE.garrisonStrengthWeight +
    player.guards * WARFARE.guardStrengthWeight +
    (player.population.peasants / 1000) * WARFARE.levyStrengthPerThousandPeasants

  // Phase 18C: training and equipment multiply the base rather than adding to
  // it, so the investment is worth the same proportionally at every scale —
  // see data/economy.json's _warfareDepthNote. A flat bonus would be decisive
  // in year 5 and rounding error by year 50, which is exactly the shape that
  // made the garrison stop differentiating anybody (_warfareTuningNote).
  return base * militaryMultiplier(player)
}

// Exported so the UI can show what an investment is actually buying, rather
// than the player having to infer it from a win-probability that moved.
export function militaryMultiplier(player: PlayerState): number {
  return 1
    + (player.trainingLevel ?? 0) * WARFARE.trainingStrengthBonusPerLevel
    + (player.equipmentLevel ?? 0) * WARFARE.equipmentStrengthBonusPerLevel
}

// THE win-probability formula — one definition, three callers (resolveWar
// below, the AI's war pricing in src/ai/warAggression.ts, and the War tab's
// risk indicator in src/ui/app.ts). It previously existed as three separate
// copies of the same expression, which was survivable only while none of
// them changed; adding the defender advantage is exactly the kind of edit
// that would have silently left one copy behind, so they now share this.
//
// Takes pre-computed strengths rather than the two players because the
// attacker's side includes allied contributions, which are not a property of
// any single PlayerState.
export function warWinProbability(attackerStrength: number, defenderStrength: number): number {
  return attackerStrength / (
    attackerStrength
    + defenderStrength * WARFARE.defenderAdvantageMultiplier
    + WARFARE.baseDefenceConstant
  )
}

export interface MilitaryInvestmentResult {
  trainingBought: number
  equipmentBought: number
  spent: number
}

// Buys levels of training and equipment, clamped to affordability and to the
// per-track level cap — the same forgiving treatment applyRecruitment() and
// applyConstruction() already give an over-ambitious order, and the same
// `finiteOr` boundary sanitization for the same reason: trainingLevel and
// equipmentLevel are RUNNING TOTALS, so a NaN order must degrade to "buy
// nothing" rather than poisoning the standing multiplier forever.
export function applyMilitaryInvestment(
  player: PlayerState,
  trainingInvest: number,
  equipmentInvest: number
): MilitaryInvestmentResult {
  let remaining = player.taler
  const result: MilitaryInvestmentResult = { trainingBought: 0, equipmentBought: 0, spent: 0 }

  const trainingRoom = Math.max(0, WARFARE.maxTrainingLevel - (player.trainingLevel ?? 0))
  const affordableTraining = Math.floor(remaining / WARFARE.trainingCostPerLevel)
  result.trainingBought = Math.max(0, Math.min(
    Math.floor(finiteOr(trainingInvest, 0)), trainingRoom, affordableTraining
  ))
  remaining -= result.trainingBought * WARFARE.trainingCostPerLevel

  const equipmentRoom = Math.max(0, WARFARE.maxEquipmentLevel - (player.equipmentLevel ?? 0))
  const affordableEquipment = Math.floor(remaining / WARFARE.equipmentCostPerLevel)
  result.equipmentBought = Math.max(0, Math.min(
    Math.floor(finiteOr(equipmentInvest, 0)), equipmentRoom, affordableEquipment
  ))
  remaining -= result.equipmentBought * WARFARE.equipmentCostPerLevel

  player.trainingLevel = (player.trainingLevel ?? 0) + result.trainingBought
  player.equipmentLevel = (player.equipmentLevel ?? 0) + result.equipmentBought
  result.spent = player.taler - remaining
  player.taler = remaining

  return result
}

// Standing cost of a drilled, well-equipped army — the same anti-snowball
// shape guards and saboteurs already have (economy.json's _espionageNote): a
// military edge is a recurring burden, never a bought-once advantage.
export function militaryUpkeep(player: PlayerState): number {
  return (player.trainingLevel ?? 0) * WARFARE.trainingUpkeepPerLevelPerYear
    + (player.equipmentLevel ?? 0) * WARFARE.equipmentUpkeepPerLevelPerYear
}

// A simple, engine-local wealth/power proxy for alliance decisions. Deliberately
// NOT importing from src/ai (materialScore, compareStanding): the engine must stay
// independently runnable with no AI present, the same rule espionage.ts and every
// other engine module already follows.
function roughPower(player: PlayerState): number {
  return player.taler + player.population.peasants * 10
}

// Whether each requested ally actually joins the attacker. An ally is more willing
// to help check a defender who is currently more powerful than itself — the same
// balance-of-power logic that makes leader-focused aggression an anti-snowball
// lever elsewhere in this game (a strong ruler draws opposition, not deference).
export function resolveAllianceRequests(
  requestedAllies: PlayerState[],
  attacker: PlayerState,
  defender: PlayerState,
  rng: SeededRng
): PlayerState[] {
  const joined: PlayerState[] = []
  for (const ally of requestedAllies) {
    if (ally.id === attacker.id || ally.id === defender.id) continue
    const defenderIsStronger = roughPower(defender) > roughPower(ally)
    const chance = WARFARE.allianceJoinBaseChance + (defenderIsStronger ? WARFARE.allianceJoinStrongerTargetBonus : 0)
    if (rng.next() < chance) joined.push(ally)
  }
  return joined
}

export interface WarOutcome {
  attackerId: string
  defenderId: string
  alliesJoined: string[]
  attackerWon: boolean
  attackerStrength: number
  defenderStrength: number
  attackerCasualties: number
  defenderCasualties: number
  landTransferred: number
  populationTransferred: number
  reparationsPaid: number
  garrisonDestroyed: boolean
}

// Resolves one declared war, mutating attacker and defender (and reading, but not
// mutating, the joined allies — their contribution is a one-year loan of strength,
// not a shared stake in the spoils; modeling ally rewards is a real simplification,
// noted rather than silently assumed).
export function resolveWar(
  attacker: PlayerState,
  defender: PlayerState,
  joinedAllies: PlayerState[],
  rng: SeededRng
): WarOutcome {
  // Allies fight for the ATTACKER — this is a coalition against a strong rival,
  // not a defensive pact. That matches resolveAllianceRequests' own rule (a ruler
  // is likelier to join when the *defender* outweighs it) and the decision shape
  // (alliesRequested lives on the attacker's WarDecision), and it is the reading
  // that serves the anti-snowball goal: pulling ahead should invite a coalition.
  //
  // This previously added allied strength to the DEFENDER while the attacker was
  // the one recruiting them, so an AI requesting help was in effect arming its own
  // target — measured attacker win rate was 38.9% against a 55% declaration floor.
  const allyStrength = joinedAllies.reduce(
    (sum, ally) => sum + warStrength(ally) * WARFARE.allianceContributionFraction, 0
  )
  const attackerStrength = warStrength(attacker) + allyStrength
  const defenderStrength = warStrength(defender)

  const probability = warWinProbability(attackerStrength, defenderStrength)
  const attackerWon = rng.next() < probability

  const winner = attackerWon ? attacker : defender
  const loser = attackerWon ? defender : attacker

  // War costs both sides — even the winner bleeds, so declaring one is never a
  // free lever, matching this game's "stays hard throughout" design rule.
  const winnerCasualties = Math.floor(winner.population.peasants * WARFARE.casualtyFractionWinner)
  const loserCasualties = Math.floor(loser.population.peasants * WARFARE.casualtyFractionLoser)
  winner.population.peasants = Math.max(0, winner.population.peasants - winnerCasualties)
  loser.population.peasants = Math.max(0, loser.population.peasants - loserCasualties)

  // Territory changes hands, capped so a single war can never claim more than
  // maxLandTransferShare of the loser's holdings — the closest available stand-in
  // for the research doc's territorial consequence without an actual map.
  const loserTotalLand = loser.land.farmland + loser.land.buildingLand
  const landTransferred = Math.min(
    loserTotalLand * WARFARE.landTransferFraction,
    loserTotalLand * WARFARE.maxLandTransferShare
  )
  if (landTransferred > 0 && loserTotalLand > 0) {
    const farmlandShare = loser.land.farmland / loserTotalLand
    const farmlandTaken = landTransferred * farmlandShare
    const buildingLandTaken = landTransferred - farmlandTaken
    loser.land.farmland = Math.max(0, loser.land.farmland - farmlandTaken)
    loser.land.buildingLand = Math.max(0, loser.land.buildingLand - buildingLandTaken)
    winner.land.farmland += farmlandTaken
    winner.land.buildingLand += buildingLandTaken
  }

  // Conquered territory carries the people who work it. Without this, war traded
  // the binding resource for an inert one — population gates every senior rank
  // while land is already held at roughly twice what the labour force can work
  // (BACKLOG D3), so winning a war was close to worthless and losing one cost the
  // only thing that mattered. Annexing subjects alongside their fields is both the
  // historically apt reading and what makes war a genuine alternative ROUTE to the
  // population-gated ranks, which BACKLOG D2 identifies as the entire purpose of
  // having warfare at all.
  //
  // Applied AFTER casualties so the transferred share is measured against the
  // population that actually survived the fighting.
  const populationTransferred = Math.floor(
    loser.population.peasants * WARFARE.populationTransferFraction
  )
  loser.population.peasants = Math.max(0, loser.population.peasants - populationTransferred)
  winner.population.peasants += populationTransferred

  // Reparations: coin changes hands too, same direction as the land.
  const reparationsPaid = loser.taler * WARFARE.reparationsFraction
  loser.taler = Math.max(0, loser.taler - reparationsPaid)
  winner.taler += reparationsPaid

  // A defeated garrison has a real chance of being destroyed in the fighting —
  // the fortification investment that should have prevented this loss.
  let garrisonDestroyed = false
  if (loser.buildings.garrison > 0 && rng.next() < WARFARE.garrisonDestructionChanceLoser) {
    loser.buildings.garrison = 0
    garrisonDestroyed = true
  }

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    alliesJoined: joinedAllies.map((a) => a.id),
    attackerWon,
    attackerStrength,
    defenderStrength,
    attackerCasualties: attackerWon ? winnerCasualties : loserCasualties,
    defenderCasualties: attackerWon ? loserCasualties : winnerCasualties,
    landTransferred,
    populationTransferred,
    reparationsPaid,
    garrisonDestroyed
  }
}
