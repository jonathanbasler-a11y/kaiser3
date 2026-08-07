// AI grant/refuse response to a guild petition (D2, #51).
//
// 21.8 shipped a closed-form first-order screen here — compare the charter's
// market-equivalents against the fee and the refusal spike, in arithmetic, and
// pick the larger. It existed because 21.8 made petitions fire and without ANY
// answer path every petition for every ruler lapsed, collapsing the field (mean
// rank at decade 6 fell 5.43 -> 1.99) while the balance gate still returned PASS
// on all five criteria. It was explicitly labelled "good enough to stop the
// collapse, not good enough to call the mechanic calibrated".
//
// 21.9 replaces it with what the plan specified: score [...sheet, grant] against
// [...sheet, refuse] through the REAL reducer. Three things the closed form
// could not see, all of which BACKLOG S10's "caveat on method" named as
// unquantified:
//
//   * The refusal spike does not stay unrest. It propagates through birth
//     damping, emigration, and revolt exposure, and perturbs rankProgress —
//     against a rank weight of 1e6, a population nudge can outweigh the entire
//     production term. The closed form priced the spike as `8 * weights.unrest`
//     and nothing else.
//   * A grant earns its first year of bonus income immediately — step 3.5
//     resolves before step 8 reads player.guilds — so the one-year lookahead
//     sees real cash flow, not just a capitalised estimate.
//   * The fee does not stay Taler. It lands in the same treasury the wealth
//     term reads at year end, and every downstream step of that year sees the
//     reduced figure.
//
// What it does NOT see, stated precisely because 21.9's first draft claimed the
// opposite: the fee cannot squeeze this year's CONSTRUCTION. Construction is
// step 3 and the charter is settled at step 3.5, so the causation runs the other
// way — what a ruler already built this year constrains what it can charter, and
// never the reverse. S10 finding 4's mechanism is real but CROSS-year: a fee paid
// in year N leaves the treasury short at year N+1's construction step, and if
// that drops it below a market's build cost it can stay there. A one-year
// lookahead sees the smaller treasury but not the compounding it forfeits.
//
// This is the same technique aggression.ts and warAggression.ts already use for
// the two other decisions an isolated lookahead cannot price, and it means the
// AI answers a petition with exactly the machinery it uses for every other
// choice: no separate guild valuation that can drift from the engine.

import { Decision, GameState, GuildDecision } from '../engine/state.ts'
import { PersonalityWeights } from './evaluator.ts'
import { scoreCandidate } from './candidateScore.ts'

// Returned fresh on each call rather than as module-level singletons. Every
// sheet these land in is a real Decision[] held on a live match, and handing the
// same two objects to every ruler in every year would make one accidental
// mutation anywhere a silent cross-ruler bug.
const grantDecision = (): GuildDecision => ({ type: 'guild', action: 'grant' })
const refuseDecision = (): GuildDecision => ({ type: 'guild', action: 'refuse' })

/** No petition pending → no decision to emit. Returning undefined rather than a
 *  no-op decision keeps the sheet free of inert entries, matching how the
 *  planner treats every other optional decision.
 *
 *  `isolated` is the single-player state planYear already built for its own
 *  candidate sweep, and `sheet` is the complete sheet it is about to emit —
 *  grain, land, tax, construction, espionage and war. Scoring the answer on top
 *  of the whole sheet rather than a partial one is the point: recruitment (step
 *  2) and military investment (step 2.5) both draw on the treasury before the
 *  charter fee is charged at step 3.5, so a sheet missing them prices the
 *  charter against money that is already spoken for. */
export function planGuildResponse(
  isolated: GameState,
  playerId: string,
  sheet: Decision[],
  weights: PersonalityWeights,
  evaluationSeeds: number[]
): GuildDecision | undefined {
  if (!isolated.players[playerId]?.pendingGuild) return undefined

  // No affordability shortcut, and no need for one. resolveGuildPetition treats
  // an unaffordable 'grant' exactly like a refusal — same spike, same cooldown,
  // same zero spend (engine/guilds.ts) — so when the treasury is short the two
  // branches produce identical STATES, score equal, and the tie rule below
  // returns REFUSE without a special case.
  //
  // 21.8 short-circuited here to stop the chronicle's refusedForUnaffordable
  // flag firing on the AI every year. Removing the short-circuit does not bring
  // that back: because the tie sends an unaffordable petition to REFUSE, the
  // emitted decision has action 'refuse', and the flag is only set for
  // `wantsGrant && !canAfford`. So the AI can no longer raise it at all, and it
  // stays what it should be — a human-facing report that someone reached for a
  // charter they could not pay for.
  const grantScore = scoreCandidate(isolated, playerId, [...sheet, grantDecision()], weights, evaluationSeeds)
  const refuseScore = scoreCandidate(isolated, playerId, [...sheet, refuseDecision()], weights, evaluationSeeds)

  // Ties go to refusing. A tie means the reducer could not tell the two apart,
  // and the cheaper of two indistinguishable options is the one that does not
  // spend the treasury.
  return grantScore > refuseScore ? grantDecision() : refuseDecision()
}
