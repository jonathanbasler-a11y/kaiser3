// Shared status tones — one vocabulary for header tiles, requirement tiles,
// and help-text (Phase 20.5). Thresholds live here, not inline at call sites.

export type StatusTone = 'good' | 'warn' | 'bad' | undefined

export function tone(value: number, thresholds: { goodBelow?: number; goodAbove?: number; badBelow?: number; badAbove?: number; warnBelow?: number; warnAbove?: number }): StatusTone {
  if (thresholds.badAbove !== undefined && value > thresholds.badAbove) return 'bad'
  if (thresholds.badBelow !== undefined && value < thresholds.badBelow) return 'bad'
  if (thresholds.warnAbove !== undefined && value > thresholds.warnAbove) return 'warn'
  if (thresholds.warnBelow !== undefined && value < thresholds.warnBelow) return 'warn'
  if (thresholds.goodAbove !== undefined && value >= thresholds.goodAbove) return 'good'
  if (thresholds.goodBelow !== undefined && value <= thresholds.goodBelow) return 'good'
  return undefined
}

export const GRAIN_YEARS_TONE = { badBelow: 0.5, goodAbove: 1, warnBelow: 1 }
export const UNREST_TONE = { badAbove: 60, goodBelow: 20, warnAbove: 40 }
export const WAR_ODDS_TONE = { goodAbove: 0.5, badBelow: 0.5 }
/** Idle farmland share of total farmland (0–1). */
export const IDLE_LAND_SHARE_TONE = { warnAbove: 0.1, badAbove: 0.15 }
/** Event / strike probability (0–1). */
export const RISK_PROB_TONE = { badAbove: 0.25, warnAbove: 0.1, goodBelow: 0.1 }

export function helpToneClass(t: StatusTone): string {
  return t ? `help-text ${t}` : 'help-text'
}
