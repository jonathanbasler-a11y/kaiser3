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
// Never declare unless clearly favored — war is not a coin flip an AI should
// choose to make.
const MIN_WIN_PROBABILITY = 0.62

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

    const isAhead = compareStanding(rival, self) > 0
    // Value of winning: the land/taler resolveWar() would transfer, priced
    // through this archetype's own weights so a Merchant cares about the taler
    // and a Builder cares more about the land.
    const landGain = (rival.land.farmland + rival.land.buildingLand) * WARFARE.landTransferFraction
    const talerGain = rival.taler * WARFARE.reparationsFraction
    const expectedValue = winProbability * (landGain * weights.land + talerGain * weights.wealth)
      * (1 + (isAhead ? profile.leaderFocus : 0))

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
