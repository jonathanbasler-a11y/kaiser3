// Hardening measurements (post Phase 18): preview/advanceYear cost and
// difficulty playthroughs. Run: npx tsx scripts/hardening-measure.ts

import { createStarterState, applyStartingMultiplier } from '../src/engine/starter.ts'
import { advanceYear } from '../src/engine/year.ts'
import { planYear } from '../src/ai/planner.ts'
import { getPersonality } from '../src/ai/personalities.ts'
import { getDifficultyPreset, getDifficultyPresets } from '../src/ai/difficulty.ts'
import { previewYear } from '../src/ui/preview.ts'
import { defaultDraft } from '../src/ui/decisions.ts'
import { getTopRank, getRankName } from '../src/engine/ranks.ts'
import type { Personality } from '../src/ai/personalities.ts'

function ms(n: number): string {
  return `${n.toFixed(2)}ms`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

console.log('=== 1. advanceYear / previewYear cost (developed mid-game state) ===')
{
  const builder = getPersonality('builder')
  let state = createStarterState([
    { id: 'human', name: 'You' },
    { id: 'rival1', name: 'The Builder' },
    { id: 'rival2', name: 'The Merchant' }
  ])
  const difficulty = getDifficultyPreset('standard')
  // Warm into a mid-game state so warfare / ranks / houses exist.
  for (let y = 0; y < 25; y++) {
    const decisions: Record<string, ReturnType<typeof planYear>> = {}
    for (const id of state.activePlayerIds) {
      const personality = id === 'human' ? builder : getPersonality(id === 'rival1' ? 'builder' : 'merchant')
      decisions[id] = planYear(state, id, personality, 9000 + y * 104729 + id.length, difficulty.rivalEvaluationSeeds)
    }
    state = advanceYear(state, decisions, 1 + y * 1000).state
  }

  const rivals = new Map<string, Personality>([
    ['rival1', getPersonality('builder')],
    ['rival2', getPersonality('merchant')]
  ])
  const draft = defaultDraft(state.players.human)
  draft.marketBuild = 1
  draft.trainingInvest = 1

  // Cold: first preview fills rival planYear cache.
  const t0 = performance.now()
  previewYear(state, 'human', draft, rivals, difficulty)
  const coldMs = performance.now() - t0

  const samples: number[] = []
  for (let i = 0; i < 40; i++) {
    draft.marketBuild = i % 3
    draft.palaceStages = i % 2
    const t = performance.now()
    previewYear(state, 'human', draft, rivals, difficulty)
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)

  const yearSamples: number[] = []
  for (let i = 0; i < 20; i++) {
    const decisions: Record<string, ReturnType<typeof planYear>> = {
      human: planYear(state, 'human', builder, 42 + i, 2),
      rival1: planYear(state, 'rival1', getPersonality('builder'), 43 + i, 2),
      rival2: planYear(state, 'rival2', getPersonality('merchant'), 44 + i, 2)
    }
    const t = performance.now()
    advanceYear(state, decisions, 5000 + i)
    yearSamples.push(performance.now() - t)
  }
  yearSamples.sort((a, b) => a - b)

  console.log(`  previewYear cold (includes rival planYear): ${ms(coldMs)}`)
  console.log(`  previewYear warm (cached rivals), n=40: p50=${ms(percentile(samples, 50))} p95=${ms(percentile(samples, 95))} max=${ms(samples[samples.length - 1])}`)
  console.log(`  advanceYear (3 rulers, mid-game), n=20: p50=${ms(percentile(yearSamples, 50))} p95=${ms(percentile(yearSamples, 95))} max=${ms(yearSamples[yearSamples.length - 1])}`)
  console.log(`  Idle poll cost avoided: ~${(1000 / 200).toFixed(0)}× warm preview/sec ≈ ${ms(percentile(samples, 50) * 5)}/sec wasted while reading a tab`)
}

console.log('\n=== 2. Long playthroughs per difficulty (Builder human vs 2 rivals, 120y cap) ===')
{
  const MAX = 120
  const TOP = getTopRank()
  for (const difficulty of getDifficultyPresets()) {
    let bestRank = 0
    let reachedKaiser = 0
    let yearsToKaiser: number[] = []
    const SEEDS = 8
    for (let i = 0; i < SEEDS; i++) {
      // Manual match so difficulty starting multipliers apply to rivals.
      let state = createStarterState([
        { id: 'human', name: 'You' },
        { id: 'rival1', name: 'R1' },
        { id: 'rival2', name: 'R2' }
      ])
      state.players.rival1 = applyStartingMultiplier(state.players.rival1, difficulty.rivalStartingMultiplier)
      state.players.rival2 = applyStartingMultiplier(state.players.rival2, difficulty.rivalStartingMultiplier)
      const personalities = {
        human: getPersonality('builder'),
        rival1: getPersonality('expansionist'),
        rival2: getPersonality('merchant')
      }
      const seed = 7000 + i * 9973
      let years = 0
      for (; years < MAX; years++) {
        if (!state.activePlayerIds.includes('human')) break
        if (state.players.human.rank >= TOP) break
        const decisions: Record<string, ReturnType<typeof planYear>> = {}
        for (const id of state.activePlayerIds) {
          const p = personalities[id as keyof typeof personalities]
          const evalSeeds = id === 'human' ? 2 : difficulty.rivalEvaluationSeeds
          decisions[id] = planYear(state, id, p, seed + years * 104729 + id.length, evalSeeds)
        }
        state = advanceYear(state, decisions, seed + years * 1000).state
      }
      const rank = state.players.human.rank
      bestRank = Math.max(bestRank, rank)
      if (rank >= TOP) {
        reachedKaiser++
        yearsToKaiser.push(years)
      }
    }
    const avgYears = yearsToKaiser.length
      ? (yearsToKaiser.reduce((a, b) => a + b, 0) / yearsToKaiser.length).toFixed(1)
      : '—'
    console.log(
      `  ${difficulty.id.padEnd(10)} Kaiser ${reachedKaiser}/${SEEDS}  ` +
        `bestRank=${bestRank} (${getRankName(bestRank)})  avgYearsToKaiser=${avgYears}`
    )
  }
}
