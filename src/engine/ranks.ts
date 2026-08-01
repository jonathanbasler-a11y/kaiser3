// Rank promotion: 8 tiers (Baron → Kaiser), each with one or more ALTERNATIVE
// requirement-groups (docs/d2-rank-gate-design.md) — a ruler qualifies for a rank
// by satisfying any ONE group in full, not all of them. Each group's own thresholds
// (wealth, population, buildings) must all be met simultaneously. Promotion checks
// the highest rank with a satisfied group — a player can leapfrog ranks in one year
// if they qualify outright.

import ranksData from '../../data/ranks.json'
import { PlayerState } from './state.ts'

export interface RankRequirement {
  wealthMin: number
  populationMin: number
  palaceStages?: number
  cathedral?: boolean
  tradingHousesMin?: number
}

export interface RankDef {
  id: number
  name: string
  requirements: RankRequirement[]
  unlockedFeature?: string
  description?: string
}

const RANKS: RankDef[] = ranksData.ranks as RankDef[]

function meetsRequirementGroup(player: PlayerState, req: RankRequirement): boolean {
  if (player.taler < req.wealthMin) return false
  if (player.population.peasants < req.populationMin) return false
  if (req.palaceStages !== undefined && player.buildings.palace < req.palaceStages) return false
  if (req.cathedral === true && player.buildings.cathedral < 1) return false
  if (req.tradingHousesMin !== undefined && player.tradingHouses < req.tradingHousesMin) return false
  return true
}

function meetsRequirements(player: PlayerState, groups: RankRequirement[]): boolean {
  return groups.some((group) => meetsRequirementGroup(player, group))
}

export interface RankCheckResult {
  promoted: boolean
  newRank: number   // Unchanged from current rank if not promoted
  unlockedFeatures: string[]  // Features newly unlocked this check (empty if none)
}

// Only ever promotes (never demotes) — a bad year doesn't strip an earned title,
// matching the original's rank-as-milestone framing.
export function checkPromotion(player: PlayerState): RankCheckResult {
  let highestQualifyingRank = player.rank
  const unlockedFeatures: string[] = []

  for (const rank of RANKS) {
    if (rank.id <= player.rank) continue
    if (meetsRequirements(player, rank.requirements)) {
      highestQualifyingRank = rank.id
      if (rank.unlockedFeature) unlockedFeatures.push(rank.unlockedFeature)
    }
  }

  return {
    promoted: highestQualifyingRank > player.rank,
    newRank: highestQualifyingRank,
    unlockedFeatures
  }
}

export function getRankName(rankId: number): string {
  return RANKS.find((r) => r.id === rankId)?.name ?? 'Unknown'
}

export function isFeatureUnlocked(currentRank: number, feature: string): boolean {
  return RANKS.some((r) => r.id <= currentRank && r.unlockedFeature === feature)
}

// The rank a player is currently working toward, or undefined at Kaiser (the top).
export function getNextRank(currentRank: number): RankDef | undefined {
  return RANKS.find((r) => r.id === currentRank + 1)
}

// Fractional progress (0-1) toward the NEXT rank.
//
// Progress within a single requirement-group is the MINIMUM across that group's
// requirements, not the average, because the requirements in a group must all be
// satisfied simultaneously — so the meaningful number is how the BINDING
// constraint is doing. A ruler sitting on ten times the required wealth with half
// the required population is halfway there, not comfortable. A rank's overall
// progress is then the MAXIMUM across its alternative groups (D2,
// docs/d2-rank-gate-design.md) — a ruler need only complete ONE path, so progress
// tracks whichever path they're furthest along. Max-of-continuous-[0,1]-functions
// is itself continuous, so this stays free of the discontinuity evaluator.ts's
// 540,000-utility-cliff comment warns against.
//
// Lives in the engine rather than the AI because it describes the rank system
// itself: both the AI's valuation and the standings comparator need it, and two
// copies would be free to drift apart.
export function groupProgress(player: PlayerState, req: RankRequirement): number {
  const ratios: number[] = [
    req.wealthMin > 0 ? player.taler / req.wealthMin : 1,
    req.populationMin > 0 ? player.population.peasants / req.populationMin : 1
  ]
  if (req.palaceStages !== undefined && req.palaceStages > 0) {
    ratios.push(player.buildings.palace / req.palaceStages)
  }
  if (req.cathedral === true) {
    ratios.push(player.buildings.cathedral >= 1 ? 1 : 0)
  }
  if (req.tradingHousesMin !== undefined && req.tradingHousesMin > 0) {
    ratios.push(player.tradingHouses / req.tradingHousesMin)
  }

  return Math.max(0, Math.min(1, Math.min(...ratios)))
}

export function rankProgress(player: PlayerState): number {
  const next = getNextRank(player.rank)
  if (!next) return 1 // already Kaiser

  return Math.max(...next.requirements.map((group) => groupProgress(player, group)))
}

export function getTopRank(): number {
  return RANKS[RANKS.length - 1].id
}
