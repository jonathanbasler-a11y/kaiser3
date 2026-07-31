// ANTI-SNOWBALL LEVERS — the single home for every knob that keeps the game hard
// throughout (CLAUDE.md's key invariant: "Scarcity never goes away: prosperity
// scales *risk*, not immunity").
//
// The core idea from docs/kaiser-research.md: in this genre the classic failure
// mode is that late-game income dwarfs any remaining threat. Kaiser 3 counters
// that on three fronts:
//   1. Upkeep scales with holdings          → buildings.ts (Phase 2)
//   2. Tribute scales with wealth           → buildings.ts (Phase 2)
//   3. Event EXPOSURE scales with prosperity → this file (Phase 4)
//
// (3) is the subtle one. Rather than a single global "prosperity" number, each
// event scales with the *specific* kind of prosperity that makes it plausible:
// plague follows people, fire follows buildings, banditry follows wealth. That's
// both more believable and a better lever — it means there is no single stat a
// player can dump to become globally safe.
//
// Exposure is deliberately SUBLINEAR (exponent < 1, plus a hard cap). Linear
// scaling would make late-game unplayable rather than merely tense; sublinear
// scaling means growth always costs you something without ever becoming a
// death spiral. Tuning these coefficients is Phase 6's job — they live in
// data/events.json, not here, so balance passes never touch simulation logic.

import { PlayerState } from './state.ts'

export type ExposureDriver = 'population' | 'buildings' | 'wealth' | 'unrest' | 'grainShortfall'

export interface ExposureSpec {
  driver: ExposureDriver
  reference: number   // The value at which exposure is ~1.0 (calibrated to the starting state)
  exponent: number    // < 1 dampens growth (sublinear); >= 1 for condition-driven events
  cap: number         // Hard ceiling — prosperity raises risk, but never without bound
}

// Extra per-year context the exposure model needs but PlayerState doesn't carry
// (feeding adequacy is computed during the year, not stored on the player).
export interface ExposureContext {
  feedAdequacy: number   // From economy.ts resolveFeeding(); 1.0 = exactly fed
}

// Counts everything a fire could plausibly consume. Palace stages count because
// a half-built palace is a construction site full of timber and scaffolding.
export function countBuildings(player: PlayerState): number {
  const b = player.buildings
  return b.markets + b.mills + b.palace + b.cathedral + b.hospital + b.well + b.granary + b.garrison
}

function rawDriverValue(driver: ExposureDriver, player: PlayerState, context: ExposureContext): number {
  switch (driver) {
    case 'population':
      return player.population.peasants
    case 'buildings':
      return countBuildings(player)
    case 'wealth':
      return player.taler
    case 'unrest':
      return player.population.unrest
    case 'grainShortfall':
      // How far short of feeding the population we fell. 0 when adequately fed —
      // this is what makes famine COMPOUND an existing shortage rather than
      // rolling as an independent disaster (a PLAN.md Phase 4 acceptance criterion).
      return Math.max(0, 1 - context.feedAdequacy)
  }
}

// Returns a multiplier applied to an event's base weight. ~1.0 at the reference
// value, rising sublinearly with prosperity, clamped to [0, cap].
export function calculateExposure(spec: ExposureSpec, player: PlayerState, context: ExposureContext): number {
  const raw = rawDriverValue(spec.driver, player, context)
  if (raw <= 0) return 0
  if (spec.reference <= 0) return 0

  const normalized = raw / spec.reference
  const scaled = Math.pow(normalized, spec.exponent)
  return Math.min(spec.cap, scaled)
}
