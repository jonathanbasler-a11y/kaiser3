// AI AGGRESSION — choosing whether to strike a rival, whom, and how.
//
// Kept out of planner.ts because it is the one decision that cannot be evaluated
// by the planner's usual method. Everything else is scored by simulating a year
// forward in ISOLATION, which by construction contains no rivals; a strike only
// has meaning against another ruler. So it is priced directly instead — but with
// the REAL strikeSuccessProbability() from the engine, so the AI's odds are
// exactly the odds the game will roll against (CLAUDE.md's contract).
//
// Target selection deliberately prefers whoever is ahead. That is the anti-snowball
// lever Phase 6 identified as missing: its loss-persistence criterion is about
// "events AND AI aggression", and until now a leader only had weather to fear.
// Now pulling ahead paints a target on your back.

import economyData from '../../data/economy.json'
import { GameState, PlayerState, EspionageDecision, EspionageMode } from '../engine/state.ts'
import { strikeSuccessProbability } from '../engine/espionage.ts'
import { compareStanding } from './sim.ts'
import { PersonalityWeights } from './evaluator.ts'

const ESPIONAGE = economyData.espionage

export interface AggressionProfile {
  // 0 = never strikes; 1 = strikes whenever it is worth anything at all.
  aggression: number
  // Which move this ruler favours. 'raid' plunders treasury, 'sabotage' burns
  // infrastructure and carries off grain.
  preferredMode: EspionageMode
  // How strongly to prefer the leader over a softer target. High values make a
  // ruler a dedicated leader-hunter; low values make it an opportunist.
  leaderFocus: number
}

// Expected value of committing `saboteurs` against `defender`, in the attacker's
// own utility units, net of the saboteurs it expects to lose.
export function strikeExpectedValue(
  defender: PlayerState,
  saboteurs: number,
  mode: EspionageMode,
  weights: PersonalityWeights
): number {
  if (saboteurs <= 0) return 0

  const probability = strikeSuccessProbability(saboteurs, defender.guards)

  let gain = 0
  if (mode === 'raid') {
    gain = defender.taler * ESPIONAGE.lootTreasuryFraction * weights.wealth
  } else {
    // Sabotage carries off grain and burns a workshop. The denial is only worth
    // anything if there is actually a workshop to burn — an earlier version priced
    // it as a flat constant, so a Schemer would keep paying for saboteurs to raze
    // buildings a rival did not own.
    const hasProductionToBurn = defender.buildings.markets + defender.buildings.mills > 0
    gain = defender.grainStock * ESPIONAGE.lootGrainFraction * (weights.grainSecurity / 20000)
      + defender.taler * ESPIONAGE.sabotageTreasuryFraction * weights.wealth
      + (hasProductionToBurn ? weights.production * 0.35 : 0)
  }

  const expectedLoss =
    probability * ESPIONAGE.successSaboteurLossRate + (1 - probability) * ESPIONAGE.failureSaboteurLossRate
  const saboteurValue = saboteurs * expectedLoss * ESPIONAGE.saboteurCost * weights.wealth

  return probability * gain - saboteurValue
}

// How attractive a target is, blending "is worth robbing" with "is ahead of me".
//
// Evaluated at the force this ruler ASPIRES to field, not the one it currently
// has. Using the current barracks deadlocks the whole system: a ruler starts with
// no saboteurs, so every target scores zero, so it never recruits any, so it never
// has saboteurs. That silently switched espionage off entirely — zero strikes in
// twenty matches — while every archetype still paid for guards.
function targetScore(
  self: PlayerState,
  candidate: PlayerState,
  desiredForce: number,
  profile: AggressionProfile,
  weights: PersonalityWeights
): number {
  const value = strikeExpectedValue(candidate, desiredForce, profile.preferredMode, weights)
  const isAhead = compareStanding(candidate, self) > 0
  const leadBonus = isAhead ? profile.leaderFocus : 0
  return value * (1 + leadBonus)
}

// Both forces are recruited against the SITUATION, never against appetite alone.
// An earlier version kept a standing complement sized purely by the personality's
// aggression, which meant a Raider facing a pauper still paid saboteur upkeep for
// raids that could never repay it — and duly lost matches it should have won.
// Guards now answer the threat that actually exists, and saboteurs are only worth
// keeping while some rival is worth robbing.
export function planAggression(
  state: GameState,
  selfId: string,
  profile: AggressionProfile,
  weights: PersonalityWeights
): Pick<EspionageDecision, 'guardHire' | 'saboteurHire' | 'targetPlayerId' | 'saboteursCommitted' | 'mode'> {
  const self = state.players[selfId]
  const rivals = state.activePlayerIds.filter((id) => id !== selfId)

  if (rivals.length === 0) {
    return { guardHire: 0, saboteurHire: 0 }
  }

  // Guards answer the knives actually pointed at us: how many saboteurs the most
  // dangerous rival is fielding, plus a small standing watch. A realm nobody can
  // strike does not need a garrison of spies.
  const worstThreat = Math.max(0, ...rivals.map((id) => state.players[id].saboteurs))
  const guardTarget = worstThreat > 0 ? Math.ceil(worstThreat * 0.6) + 1 : 1
  // Per-turn batch caps (3 guards, 4 saboteurs) are AI policy; engine enforces
  // ESPIONAGE.maxGuards / maxSaboteurs as the hard ceiling.
  const guardHire = Math.max(0, Math.min(3, guardTarget - self.guards))

  if (profile.aggression <= 0) {
    return { guardHire, saboteurHire: 0 }
  }

  const desiredForce = Math.ceil(profile.aggression * 8)

  let bestTarget: string | undefined
  let bestScore = 0
  for (const rivalId of rivals) {
    const score = targetScore(self, state.players[rivalId], desiredForce, profile, weights)
    if (score > bestScore) {
      bestScore = score
      bestTarget = rivalId
    }
  }

  // No one worth robbing: keep the watch, disband the knives.
  if (!bestTarget) {
    return { guardHire, saboteurHire: 0 }
  }

  // Maintain a force only while striking the best available target would actually
  // pay at the size we intend to field.
  const prospectiveValue = strikeExpectedValue(
    state.players[bestTarget], desiredForce, profile.preferredMode, weights
  )
  const saboteurHire = prospectiveValue > 0
    ? Math.max(0, Math.min(4, desiredForce - self.saboteurs))
    : 0

  if (self.saboteurs < 2) {
    return { guardHire, saboteurHire }
  }

  // Commit most of the barracks, but keep a seed to rebuild from.
  const committed = Math.max(1, Math.min(self.saboteurs - 1, Math.floor(self.saboteurs * 0.75)))
  const value = strikeExpectedValue(state.players[bestTarget], committed, profile.preferredMode, weights)
  if (value <= 0) {
    return { guardHire, saboteurHire }
  }

  return {
    guardHire,
    saboteurHire,
    targetPlayerId: bestTarget,
    saboteursCommitted: committed,
    mode: profile.preferredMode
  }
}
