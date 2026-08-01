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

const WARFARE = economyData.warfare

// Total military strength a ruler can field: garrison (a real fortification, worth
// the most per point), a standing watch of guards (worth less — the same secret
// -service force that also stops sabotage, so it isn't purely military), and a
// wartime levy drawn from the population (worth the least per head, but usually
// the largest number by far). Exported so a future AI planner can price wars with
// the exact odds the engine will roll, the same contract strikeSuccessProbability
// already gives espionage.
export function warStrength(player: PlayerState): number {
  return (
    player.buildings.garrison * WARFARE.garrisonStrengthWeight +
    player.guards * WARFARE.guardStrengthWeight +
    (player.population.peasants / 1000) * WARFARE.levyStrengthPerThousandPeasants
  )
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
  const attackerStrength = warStrength(attacker)
  const defenderStrength =
    warStrength(defender) + joinedAllies.reduce((sum, ally) => sum + warStrength(ally) * WARFARE.allianceContributionFraction, 0)

  const probability = attackerStrength / (attackerStrength + defenderStrength + WARFARE.baseDefenceConstant)
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
    reparationsPaid,
    garrisonDestroyed
  }
}
