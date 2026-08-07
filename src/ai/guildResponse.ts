// AI grant/refuse response to a guild petition (D2, #51).
//
// WHY THIS IS IN 21.8 AT ALL, when the plan assigns AI parity to 21.9.
//
// 21.8 made petitions fire. Without any answer path, EVERY petition for EVERY
// ruler lapses, and a lapse costs the full refusal unrest spike. Measured: the
// balance harness still passed all five criteria, but mean rank at decade 6
// fell from 5.43 to 1.99 and population retention from 2.20 to 0.91 — a field
// collapsing uniformly rather than a game. The gate could not see it because
// its criteria measure fairness and anti-snowball, and an even tax on everyone
// is perfectly fair; the leader-wins rate actually IMPROVED (51% -> 12.5%)
// because nobody can hold a lead while everyone is sinking.
//
// So this is the minimum needed to make 21.8 a coherent state rather than a
// knowingly broken one. It is deliberately NOT the full 21.9 design, which
// scores [...best, grant] against [...best, refuse] through the real reducer
// via planner.ts's candidate machinery. This is a closed-form first-order
// screen over the same weights that scoring would use — good enough to stop
// the collapse, explicitly not good enough to call the mechanic calibrated.
// 21.9 still owns that, and BACKLOG S10 carries the measured findings it needs.

import buildingsData from '../../data/buildings.json'
import { GuildDecision, PlayerState } from '../engine/state.ts'
import { guildNetAnnualGain } from '../engine/guilds.ts'
import { PersonalityWeights } from './evaluator.ts'

const PRODUCTION = buildingsData.production
const GUILDS = buildingsData.guilds
const MARKET_NET_ANNUAL_GAIN = PRODUCTION.market.incomePerYear - PRODUCTION.market.upkeepPerYear

/** No petition pending → no decision to emit. Returning undefined rather than a
 *  no-op decision keeps the sheet free of inert entries, matching how the
 *  planner treats every other optional decision. */
export function planGuildResponse(
  player: PlayerState,
  weights: PersonalityWeights
): GuildDecision | undefined {
  const pending = player.pendingGuild
  if (!pending) return undefined

  const def = GUILDS.types[pending.specialization]

  // Refusing (or failing to pay) costs the spike. resolveGuildPetition treats an
  // unaffordable grant EXACTLY like a refusal, so an unaffordable 'grant' is
  // never better than an honest 'refuse' — and saying 'refuse' keeps the
  // chronicle's refusedForUnaffordable flag meaningful for the human's report
  // rather than firing on the AI every year.
  if (player.taler < def.charterFee) return { type: 'guild', action: 'refuse' }

  // Same market-equivalents capitalisation the evaluator uses for a HELD guild
  // (evaluator.ts guildProductionEquivalents), so the AI values acquiring one on
  // the same terms it values owning one. Deliberately reuses guildNetAnnualGain
  // rather than restating the arithmetic.
  const equivalents = guildNetAnnualGain({
    kind: pending.kind,
    specialization: pending.specialization,
    incomeMultiplier: def.incomeMultiplier
  }) / MARKET_NET_ANNUAL_GAIN

  const grantValue = equivalents * weights.production - def.charterFee * weights.wealth
  const refuseValue = -GUILDS.guildRefusalUnrestSpike * weights.unrest

  return { type: 'guild', action: grantValue > refuseValue ? 'grant' : 'refuse' }
}
