// Malformed-input hardening (Phase 13). economy.ts's resolveFeeding() already
// established the rule for a malformed Decision field: degrade to the safe
// choice, never let it poison the simulation. That rule was only applied at
// ONE entry point. This file gives every other engine function reading a raw
// Decision number the same guard, applied at the boundary where untrusted
// input enters — not scattered through downstream arithmetic, which is easy
// to miss a spot in and hard to verify complete.
//
// Why this matters beyond "defensive coding": Decision objects reach
// advanceYear() WITHOUT validateDecisions() (src/engine/decisions.ts) being
// called automatically — that check happens at the UI/AI boundary, by
// convention, not inside the reducer itself (see decisions.ts's own comment:
// "Both the AI planner and the UI validate against this"). A malformed
// Decision that skips that step — a test constructing one directly, a future
// caller that forgets, a corrupted save once one exists — must not turn one
// bad number into a PlayerState field that is NaN forever. Every field this
// engine tracks is a running total mutated year over year (see year.ts's
// cloneGameState comment), so a single NaN write doesn't just spoil one
// year's report, it spoils every year after it for that ruler.
//
// `Math.max`/`Math.min`/`Math.floor` do NOT self-heal NaN — `Math.max(0, NaN)`
// is `NaN`, not `0` — which is why the existing clamps in land.ts/tax.ts/
// buildings.ts/espionage.ts (chosen to bound legal input) were silently
// unable to bound illegal (non-finite) input.

// Returns `value` if it is a finite number, otherwise `fallback`. The safe
// choice for a malformed quantity the engine is about to add/subtract is
// almost always 0 (do nothing) rather than guessing — same spirit as
// resolveFeeding()'s 'required' default branch.
export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// A rate/percentage field (tax rates, feed custom percentage) — sanitizes to
// a finite number AND clamps to the legal range, so a NaN, an out-of-range,
// or a negative rate all degrade to something the formula it feeds can't be
// broken by. Mirrors decisions.ts's checkRate() range, kept here rather than
// imported from there since decisions.ts is a pure validator (reports
// invalid, doesn't correct it) and this is the opposite: correct, don't reject.
export function sanitizeRate(value: number, min = 0, max = 100, fallback = 0): number {
  const finite = finiteOr(value, fallback)
  return Math.min(max, Math.max(min, finite))
}
