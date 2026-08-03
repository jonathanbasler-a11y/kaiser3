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
import { warStrength, warWinProbability, militaryMultiplier, landTransferAmount, isTruceActive } from '../engine/war.ts'
import { totalLand } from '../engine/land.ts'
import { compareStanding } from './sim.ts'
import { PersonalityWeights } from './evaluator.ts'
import { AggressionProfile } from './aggression.ts'

const WARFARE = economyData.warfare

// Only archetypes with real appetite for conflict ever consider war — this is a
// materially bigger risk than a sabotage raid, so the bar is well above
// "aggression > 0".
const MIN_AGGRESSION_TO_CONSIDER_WAR = 0.5

// Reserve-tier policy, separate from the declaration gate above. Today the two
// thresholds intentionally match; retuning when a ruler starts arming should not
// silently retune whether that ruler is willing to declare war.
const MIN_AGGRESSION_FOR_AGGRESSOR_RESERVE = 0.5

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

// Delegates to the engine's own formula rather than restating it — this used
// to be a third hand-written copy of the same expression (alongside
// resolveWar and the UI's risk indicator), which Phase 18C's defender
// advantage would have silently left behind in exactly one of them.
function estimatedWinProbability(self: PlayerState, target: PlayerState): number {
  return warWinProbability(warStrength(self), warStrength(target))
}

// AI POLICY constants, not game rules — the same distinction the aggression
// thresholds and win-probability floor above already draw. Costs, strength bonuses
// and caps are game
// rules and live in data/economy.json; how cautious a given AI is about
// spending on them is behaviour, and belongs here.
//
// Rivals MUST be able to invest in training/equipment, not just the human.
// The balance harness measures AI-vs-AI play, so an AI that never touched
// this mechanic would make the gate blind to it while the human quietly held
// a lever nobody else in the measured game had — the exact "silently reshape
// archetype behaviour" failure Phase 12's D2 measurement warns about.
// An aggressor is buying the ability to attack, and starts as soon as it can
// keep the lights on. A defender is buying insurance, and only once genuinely
// comfortable — so the two move at different speeds.
const MILITARY_RESERVE_AGGRESSOR_TALER = 8000
const MILITARY_RESERVE_DEFENDER_TALER = 30000
// One level per track per year: a gradual buildup a rival can see coming and
// react to, rather than a treasury dumped into a one-turn strength spike.
const MAX_MILITARY_LEVELS_PER_YEAR = 1

// EVERY archetype invests, not only the aggressive ones — measured the hard
// way. Gating this on aggression alone produced a predator/prey field: the
// Schemer and Raider reached 5/5 while the Builder, Merchant and Expansionist
// sat at 0/0 forever, so a declaration was favourable literally every year and
// war fired 84 times per 60-year match (against roughly zero before Phase
// 18C). Every one of the balance gate's five criteria still PASSED through
// that, which is precisely why it was worth measuring separately: the gate
// scores the shape of the economy, not whether a mechanic has become spam.
//
// Letting defenders arm too is what makes economy.json's own
// _warfareDepthNote true rather than aspirational — "mutual escalation
// converges back toward the defender" only holds if the defender is allowed
// to escalate. The two reserve thresholds above are what keep it from
// collapsing into permanent parity: aggressors arm early and cheaply,
// defenders only once rich, so windows of real asymmetry open and close over
// a match instead of everyone sitting at the same level forever.
export function planMilitaryInvestment(
  state: GameState,
  selfId: string,
  profile: AggressionProfile,
  priorSpendTalers: number = 0
): Pick<WarDecision, 'trainingInvest' | 'equipmentInvest'> {
  const self = state.players[selfId]
  // No rivals means nothing to attack and nothing to defend against, so an
  // army here is pure upkeep against no threat. Worth the explicit check
  // rather than leaving it to the reserve thresholds: solo matches are how
  // `npm run ai-bench` profiles each archetype and how the cross-process
  // golden fixture is generated, and without this an aggressive archetype
  // burnt its purchase price plus upkeep every year of every solo run,
  // polluting the one measurement meant to isolate an archetype's economy
  // from conflict.
  const rivalIds = state.activePlayerIds.filter((id) => id !== selfId)
  if (!self || rivalIds.length === 0) return { trainingInvest: 0, equipmentInvest: 0 }

  const isAggressor = profile.aggression >= MIN_AGGRESSION_FOR_AGGRESSOR_RESERVE

  // A defender arms in RESPONSE to a rival who has armed, not merely because
  // rivals exist. Training and equipment levels are public state, so this is
  // information a ruler legitimately has — no peeking at hidden personality.
  //
  // Reacting rather than pre-arming is what keeps this from becoming a
  // universal tax: a field with no aggressor in it never buys an army nobody
  // needs. That was not a hypothetical — arming on "a rival exists" alone
  // made two peaceful Builders each burn their treasury on troops neither
  // would ever march, and because the spend scales with wealth it erased a
  // deliberate starting handicap outright (tests/difficulty.test.ts). It also
  // gives the arms race its shape: an aggressor's buildup is visible, and the
  // response lags it by design, so the window it opens is real but closes.
  if (!isAggressor) {
    const strongestRival = Math.max(...rivalIds.map((id) => militaryMultiplier(state.players[id])))
    if (strongestRival <= militaryMultiplier(self)) {
      return { trainingInvest: 0, equipmentInvest: 0 }
    }
  }

  // Which track to fill first is DERIVED from the data (strength bought per
  // Taler of purchase price plus a year of upkeep) rather than asserted, so
  // retuning economy.json's costs moves the AI's preference with it instead
  // of leaving a stale hardcoded ordering behind.
  const tracks = [
    {
      key: 'training' as const,
      level: self.trainingLevel ?? 0,
      max: WARFARE.maxTrainingLevel,
      cost: WARFARE.trainingCostPerLevel,
      value: WARFARE.trainingStrengthBonusPerLevel
        / (WARFARE.trainingCostPerLevel + WARFARE.trainingUpkeepPerLevelPerYear)
    },
    {
      key: 'equipment' as const,
      level: self.equipmentLevel ?? 0,
      max: WARFARE.maxEquipmentLevel,
      cost: WARFARE.equipmentCostPerLevel,
      value: WARFARE.equipmentStrengthBonusPerLevel
        / (WARFARE.equipmentCostPerLevel + WARFARE.equipmentUpkeepPerLevelPerYear)
    }
  ].sort((a, b) => b.value - a.value)

  const bought = { trainingInvest: 0, equipmentInvest: 0 }
  const priorSpend = Number.isFinite(priorSpendTalers) ? Math.max(0, priorSpendTalers) : 0
  let spendable = self.taler
    - priorSpend
    - (isAggressor ? MILITARY_RESERVE_AGGRESSOR_TALER : MILITARY_RESERVE_DEFENDER_TALER)

  for (const track of tracks) {
    if (track.level >= track.max) continue
    if (spendable < track.cost) continue
    const levels = Math.min(MAX_MILITARY_LEVELS_PER_YEAR, track.max - track.level, Math.floor(spendable / track.cost))
    if (levels <= 0) continue
    spendable -= levels * track.cost
    if (track.key === 'training') bought.trainingInvest = levels
    else bought.equipmentInvest = levels
  }

  return bought
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
    if (isTruceActive(state.truces, selfId, rivalId, state.year)) continue

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
    const landAtStake = landTransferAmount(
      totalLand(rival.land),
      WARFARE.landTransferFraction,
      WARFARE.maxLandTransferShare
    )
    const ownLandAtStake = landTransferAmount(
      totalLand(self.land),
      WARFARE.landTransferFraction,
      WARFARE.maxLandTransferShare
    )
    const talerAtStake = rival.taler * WARFARE.reparationsFraction
    const ownTalerAtStake = self.taler * WARFARE.reparationsFraction
    const peopleAtStake = rival.population.peasants * WARFARE.populationTransferFraction
    const ownPeopleAtStake = self.population.peasants * WARFARE.populationTransferFraction

    // Phase 19A: both sides take wearinessPerWar unrest burden regardless of
    // outcome — price it as a flat EV debit, not only on the loss branch.
    const wearinessUnrestCost =
      WARFARE.wearinessPerWar * WARFARE.wearinessUnrestMultiplier * weights.unrest

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

    const expectedValue = (winProbability * gain - (1 - winProbability) * loss - wearinessUnrestCost)
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
