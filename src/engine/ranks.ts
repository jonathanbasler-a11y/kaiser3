// Rank promotion: 8 tiers (Baron → Kaiser), each requiring wealth, population, and
// building thresholds to be met simultaneously (docs/kaiser-research.md § Core
// Gameplay Loop, item 13). Promotion checks the highest rank whose requirements are
// ALL satisfied — a player can leapfrog ranks in one year if they qualify outright.

import ranksData from '../../data/ranks.json'
import { PlayerState } from './state.ts'

export interface RankRequirement {
  wealthMin: number
  populationMin: number
  palaceStages?: number
  cathedral?: boolean
}

export interface RankDef {
  id: number
  name: string
  requirements: RankRequirement
  unlockedFeature?: string
  description?: string
}

const RANKS: RankDef[] = ranksData.ranks as RankDef[]

function meetsRequirements(player: PlayerState, req: RankRequirement): boolean {
  if (player.taler < req.wealthMin) return false
  if (player.population.peasants < req.populationMin) return false
  if (req.palaceStages !== undefined && player.buildings.palace < req.palaceStages) return false
  if (req.cathedral === true && player.buildings.cathedral < 1) return false
  return true
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
// Progress is the MINIMUM across the requirements, not the average, because the
// requirements must all be satisfied simultaneously — so the meaningful number is
// how the BINDING constraint is doing. A ruler sitting on ten times the required
// wealth with half the required population is halfway there, not comfortable.
//
// Lives in the engine rather than the AI because it describes the rank system
// itself: both the AI's valuation and the standings comparator need it, and two
// copies would be free to drift apart.
export function rankProgress(player: PlayerState): number {
  const next = getNextRank(player.rank)
  if (!next) return 1 // already Kaiser

  const req = next.requirements
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

  return Math.max(0, Math.min(1, Math.min(...ratios)))
}

export function getTopRank(): number {
  return RANKS[RANKS.length - 1].id
}
