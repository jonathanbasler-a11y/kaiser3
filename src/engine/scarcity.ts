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

export type ExposureDriver = 'population' | 'buildings' | 'wealth' | 'unrest' | 'grainShortfall' | 'harvestShortfall' | 'harvestExcess'

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
  // F6: the SAME weather roll that decided this year's harvest (economy.ts
  // WeatherBand.multiplier; 1.0 = an ordinary year). Drought/flood are
  // deliberately driven by the real weather that already happened this year
  // (harvest.weather, computed before events resolve — see year.ts), not by a
  // second independent roll: a genuine drought year should be the year the
  // drought EVENT is more likely, the same way famine compounds a real feeding
  // shortfall rather than rolling independently of it.
  //
  // Optional, defaulting to 1.0 (an ordinary year, zero drought/flood
  // exposure) wherever read — see rawDriverValue below — so the many existing
  // call sites built before F6 (mostly in tests) that construct a context with
  // only `feedAdequacy` keep compiling and keep behaving exactly as before:
  // no drought/flood exposure unless a caller deliberately supplies real
  // weather.
  weatherMultiplier?: number
  // The AI's forward-looking risk pricing (evaluator.ts) cannot know next
  // year's ACTUAL weather, so it cannot derive harvestShortfall/harvestExcess
  // from a single weatherMultiplier the way the real per-year path does.
  //
  // Deliberately NOT approximated as max(0, 1 - E[weatherMultiplier]): the
  // weather-band mean is ~1.02 (skewed above 1 by design), which makes
  // max(0, 1 - 1.02) collapse to exactly 0 — the AI would price drought risk
  // at zero forever, the Jensen's-gap trap this file's own hospital story
  // warns about (E[f(X)] != f(E[X]) for a nonlinear f like max(0, ...)).
  // These carry the CORRECT expectation instead — E[max(0, 1-m)] and
  // E[max(0, m-1)] computed directly over the weather bands (evaluator.ts) —
  // and rawDriverValue prefers them over the weatherMultiplier-derived
  // formula whenever present.
  harvestShortfallExpectation?: number
  harvestExcessExpectation?: number
}

// Counts everything a fire could plausibly consume. Palace stages count because
// a half-built palace is a construction site full of timber and scaffolding.
export function countBuildings(player: PlayerState): number {
  const b = player.buildings
  return b.markets + b.mills + b.palace + b.cathedral + b.hospital + b.well + b.granary + b.garrison + (b.dike ?? 0)
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
    case 'harvestShortfall':
      // F6: how far this year's weather fell below an ordinary one. 0 in an
      // average-or-better year — drought compounds a bad harvest, it doesn't
      // roll independently of it. A precomputed expectation (evaluator.ts's
      // projection) takes priority when supplied — see the comment on
      // ExposureContext. Falls back to an ordinary year (0 exposure) if a
      // caller omits weatherMultiplier too, rather than propagating NaN into
      // a probability the resolveEvents() firing check can't safely compare —
      // same "degrade to the safe choice" rule economy.ts's feed-level
      // default follows.
      if (context.harvestShortfallExpectation !== undefined) return context.harvestShortfallExpectation
      return Math.max(0, 1 - (context.weatherMultiplier ?? 1))
    case 'harvestExcess':
      // F6: how far this year's weather exceeded an ordinary one. 0 in an
      // average-or-worse year — flood compounds an unusually wet/bountiful
      // year, mirroring drought's relationship to a dry one. Same precedence
      // and NaN-safe default as harvestShortfall above.
      if (context.harvestExcessExpectation !== undefined) return context.harvestExcessExpectation
      return Math.max(0, (context.weatherMultiplier ?? 1) - 1)
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
