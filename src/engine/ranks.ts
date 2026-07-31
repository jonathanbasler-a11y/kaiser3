// Rank promotion: 8 tiers (Baron → Kaiser), each requiring wealth, population, and
// building thresholds to be met simultaneously (docs/kaiser-research.md § Core
// Gameplay Loop, item 13). Promotion checks the highest rank whose requirements are
// ALL satisfied — a player can leapfrog ranks in one year if they qualify outright.

import ranksData from '../../data/ranks.json'
import { PlayerState } from './state.ts'

interface RankRequirement {
  wealthMin: number
  populationMin: number
  palaceStages?: number
  cathedral?: boolean
}

interface RankDef {
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
