// AI WAR DECLARATIONS — whether to declare war this year, on whom, and who to
// request as allies.
//
// Same reasoning as aggression.ts (espionage): war cannot be evaluated by the
// planner's usual one-year-forward-in-isolation method, because an isolated state
// has no rivals to fight. Priced directly instead, using the REAL warStrength()
// and the same win-probability shape resolveWar() actually rolls against, so the
// AI's odds match the game's odds exactly — the same contract espionage's pricing
// already holds.
//
// Declaring war is Kaiser 3's biggest single risk: both sides always take a real
// casualty regardless of outcome, so this is priced far more conservatively than a
// sabotage — an archetype needs to be both aggressive AND clearly favored before it
// commits.

import economyData from '../../data/economy.json'
import { GameState, PlayerState, WarDecision } from '../engine/state.ts'
import { warStrength } from '../engine/war.ts'
import { compareStanding } from './sim.ts'
import { PersonalityWeights } from './evaluator.ts'
import { AggressionProfile } from './aggression.ts'

const WARFARE = economyData.warfare

// Only archetypes with real appetite for conflict ever consider war — this is a
// materially bigger risk than a sabotage raid, so the bar is well above
// "aggression > 0".
const MIN_AGGRESSION_TO_CONSIDER_WAR = 0.5

// A sanity floor, NOT the risk calculation — that is what expectedValue() below
// is for. This was 0.62 and was doing all the risk management on its own, which
// made it the single reason war never happened: measured across 1,200 aggressive
// ruler-years, the best available win probability had a median of 0.481 and a
// maximum of 0.629, so a 0.62 bar cleared in 0.1% of ruler-years and war fired
// once in 1,200 match-years. warStrength is dominated by the population levy and
// every ruler grows population similarly (mean strength ratio 1.07), so the large
// asymmetries a high bar demands simply never occur between competent rulers.
// 0.55 admits roughly 3% of ruler-years — a handful of genuine opportunities per
// match — and the real go/no-go is now a proper expected value.
const MIN_WIN_PROBABILITY = 0.55

function estimatedWinProbability(self: PlayerState, target: PlayerState): number {
  const selfStrength = warStrength(self)
  const targetStrength = warStrength(target)
  return selfStrength / (selfStrength + targetStrength + WARFARE.baseDefenceConstant)
}

export function planWar(
  state: GameState,
  selfId: string,
  profile: AggressionProfile,
  weights: PersonalityWeights
): Pick<WarDecision, 'declare' | 'targetPlayerId' | 'alliesRequested'> {
  const self = state.players[selfId]
  const rivals = state.activePlayerIds.filter((id) => id !== selfId)

  if (profile.aggression < MIN_AGGRESSION_TO_CONSIDER_WAR || rivals.length === 0) {
    return { declare: false }
  }

  // Prefer whoever is ahead, same leader-focused anti-snowball logic espionage
  // targeting already uses — a war is an even bigger lever against a runaway
  // leader than a raid is.
  let bestTarget: string | undefined
  let bestScore = -Infinity
  for (const rivalId of rivals) {
    const rival = state.players[rivalId]
    const winProbability = estimatedWinProbability(self, rival)
    if (winProbability < MIN_WIN_PROBABILITY) continue

    // A genuine expected value: p x (what winning gains) MINUS (1-p) x (what
    // losing costs). The previous version computed only `p * gain` while calling
    // itself an expected value, which meant the downside of a war never entered
    // the decision at all and the probability floor above was silently carrying
    // the entire risk calculation.
    //
    // Everything is priced through this archetype's own weights, so a Merchant
    // weighs the treasury, a Builder the land, and every archetype weighs the
    // peasants — who are the binding constraint on all the senior ranks and now
    // change hands with the territory.
    const landAtStake = (rival.land.farmland + rival.land.buildingLand) * WARFARE.landTransferFraction
    const ownLandAtStake = (self.land.farmland + self.land.buildingLand) * WARFARE.landTransferFraction
    const talerAtStake = rival.taler * WARFARE.reparationsFraction
    const ownTalerAtStake = self.taler * WARFARE.reparationsFraction
    const peopleAtStake = rival.population.peasants * WARFARE.populationTransferFraction
    const ownPeopleAtStake = self.population.peasants * WARFARE.populationTransferFraction

    const gain =
      landAtStake * weights.land +
      talerAtStake * weights.wealth +
      peopleAtStake * weights.population -
      self.population.peasants * WARFARE.casualtyFractionWinner * weights.population

    const loss =
      ownLandAtStake * weights.land +
      ownTalerAtStake * weights.wealth +
      ownPeopleAtStake * weights.population +
      self.population.peasants * WARFARE.casualtyFractionLoser * weights.population

    const expectedValue = (winProbability * gain - (1 - winProbability) * loss)
      * (1 + (compareStanding(rival, self) > 0 ? profile.leaderFocus : 0))

    if (expectedValue > bestScore) {
      bestScore = expectedValue
      bestTarget = rivalId
    }
  }

  if (!bestTarget || bestScore <= 0) {
    return { declare: false }
  }

  // Requesting allies costs nothing to ask — every other active rival (besides
  // the target) is worth requesting, since resolveAllianceRequests() decides
  // for itself whether each one actually shows up.
  const alliesRequested = rivals.filter((id) => id !== bestTarget)

  return { declare: true, targetPlayerId: bestTarget, alliesRequested }
}
