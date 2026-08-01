// SUCCESSION — F5 from docs/kaiser-research.md: "On death, designate an heir who
// inherits territory/rank but resets score to zero — a soft-permadeath/legacy
// mechanic." Kaiser 3 is a single continuous session against AI rivals rather than
// a hot-seat handoff between human players, so there is no separate heir entity to
// choose: the SAME seat continues (heir = self), and the only real consequence is
// the accumulated `score` resetting — a fresh reign starting from an inherited
// (not rebuilt) territory.
//
// Distinct from extinction (`player.dead`): a ruler with a living population always
// has an heir. Extinction — the population collapsing to nothing — is the one case
// with no one left to inherit, and is permanent.

import economyData from '../../data/economy.json'
import { PlayerState } from './state.ts'
import { SeededRng } from './rng.ts'

const SUCCESSION = economyData.succession

export interface SuccessionResult {
  succeeded: boolean
}

// Rolls whether the current reign ends this year. No chance before
// minReignYears; risk then climbs with how long the reign has run, capped so it
// never becomes a near-certainty even for an exceptionally long reign.
export function applySuccession(player: PlayerState, rng: SeededRng): SuccessionResult {
  player.reignYears += 1

  if (player.reignYears < SUCCESSION.minReignYears) {
    return { succeeded: false }
  }

  const yearsOverMinimum = player.reignYears - SUCCESSION.minReignYears
  const chance = Math.min(
    SUCCESSION.maxAnnualDeathChance,
    SUCCESSION.annualDeathChanceBase + yearsOverMinimum * SUCCESSION.annualDeathChanceGrowth
  )

  if (rng.next() >= chance) {
    return { succeeded: false }
  }

  // Territory, rank, and buildings are untouched — only the reign's own
  // accumulated score resets, and the clock on the next succession restarts.
  player.score = 0
  player.reignYears = 0
  player.heir = player.id
  return { succeeded: true }
}

// Population collapsed to nothing: no heir is possible, the realm is out
// permanently. Called from the population step so `player.dead` — read
// everywhere else in the engine as "skip this player forever" — finally
// reflects something the engine itself set, rather than being derived
// separately (and inconsistently) by every caller.
export function checkExtinction(player: PlayerState): boolean {
  if (player.dead) return false // already recorded; don't re-fire the chronicle flag
  if (player.population.peasants >= 1) return false
  player.dead = true
  return true
}
