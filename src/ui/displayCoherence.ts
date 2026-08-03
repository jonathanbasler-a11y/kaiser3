// Display-coherence helpers — keep related on-screen numbers arithmetically
// honest and prefer one oracle (previewYear / engine) over parallel estimates.
// See the Grain-tab population desync (PR #25) and tests/uiCoherence.test.ts.

/** Round a related pair so displayed B − A equals the displayed delta. */
export function roundedDelta(before: number, after: number): {
  before: number
  after: number
  delta: number
} {
  const b = Math.round(before)
  const a = Math.round(after)
  return { before: b, after: a, delta: a - b }
}

/** Round demand/available so surplus tiles always add up. */
export function roundedSurplus(demand: number, available: number): {
  demand: number
  available: number
  surplus: number
} {
  const d = Math.round(demand)
  const a = Math.round(available)
  return { demand: d, available: a, surplus: a - d }
}

/** Round worked + farmland so idle = farmland − worked on screen. */
export function roundedLandSplit(farmland: number, worked: number): {
  farmland: number
  worked: number
  idle: number
} {
  const f = Math.round(farmland)
  const w = Math.round(Math.min(worked, farmland))
  return { farmland: f, worked: w, idle: f - w }
}

/** Round base strength so total ≈ round(base × multiplier) for display. */
export function roundedStrength(total: number, multiplier: number): {
  base: number
  total: number
  multiplier: number
} {
  const mult = multiplier > 0 ? multiplier : 1
  const base = Math.round(total / mult)
  return { base, total: Math.round(base * mult), multiplier: mult }
}

/**
 * Stock the engine will feed from after harvest (spoilage + yield − overflow),
 * matching year.ts step 4 → 5. Prefer chronicle fields from the same preview
 * seed when available.
 */
export function feedStockFromChronicle(
  grainStockBefore: number,
  spoilage: number,
  harvestYield: number,
  grainOverflowLost: number
): number {
  return Math.max(0, grainStockBefore - spoilage + harvestYield - grainOverflowLost)
}
