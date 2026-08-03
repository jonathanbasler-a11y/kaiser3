// UI coherence — guards against "two calculators for one claim" bugs like the
// Grain-tab population vs footer desync (PR #25). Pure helpers + previewYear
// agreement; no DOM.

import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { getDifficultyPreset } from '../src/ai/difficulty.ts'
import { getPersonality } from '../src/ai/personalities.ts'
import { previewYear } from '../src/ui/preview.ts'
import { defaultDraft } from '../src/ui/decisions.ts'
import {
  feedStockFromChronicle,
  roundedDelta,
  roundedLandSplit,
  roundedStrength,
  roundedSurplus
} from '../src/ui/displayCoherence.ts'
import { annualGrainRequirement } from '../src/engine/economy.ts'
import { warStrength, militaryMultiplier, applyMilitaryInvestment } from '../src/engine/war.ts'
import type { Personality } from '../src/ai/personalities.ts'
import type { PlayerState } from '../src/engine/state.ts'

describe('display rounding helpers', () => {
  it('roundedSurplus tiles always add up', () => {
    const { demand, available, surplus } = roundedSurplus(8552.4, 19098.6)
    expect(available - demand).toBe(surplus)
  })

  it('roundedDelta never shows after === before with a nonzero delta', () => {
    const { before, after, delta } = roundedDelta(1000.4, 1001.4)
    expect(after - before).toBe(delta)
  })

  it('roundedLandSplit idle + worked equals farmland', () => {
    const { farmland, worked, idle } = roundedLandSplit(12943.7, 5345.2)
    expect(worked + idle).toBe(farmland)
  })

  it('roundedStrength total matches base × multiplier after rounding', () => {
    const { base, total, multiplier } = roundedStrength(1234.6, 1.35)
    expect(total).toBe(Math.round(base * multiplier))
  })
})

describe('previewYear is the single oracle for year-end population', () => {
  it('Custom feed levels change populationAfter (not a frozen label)', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    state.players.human.grainStock = 5440
    state.players.human.population.peasants = 1069
    state.players.human.land.farmland = 12943
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')

    const pops: number[] = []
    for (const pct of [20, 50, 80] as const) {
      const draft = defaultDraft(state.players.human)
      draft.feedLevel = 'custom'
      draft.customPercentage = pct
      const preview = previewYear(state, 'human', draft, rivals, difficulty)
      expect(preview).not.toBeNull()
      pops.push(preview!.populationAfter)
    }
    expect(new Set(pops.map((p) => Math.round(p))).size).toBeGreaterThan(1)
  })

  it('Grain feed-stock from chronicle matches surplus identity', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    state.players.human.grainStock = 5440
    state.players.human.population.peasants = 1069
    state.players.human.land.farmland = 12943
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')
    const draft = defaultDraft(state.players.human)
    draft.feedLevel = 'required'
    const preview = previewYear(state, 'human', draft, rivals, difficulty)!
    const demand = annualGrainRequirement(state.players.human.population)
    const available = feedStockFromChronicle(
      state.players.human.grainStock,
      preview.spoilage,
      preview.harvestYield,
      preview.grainOverflowLost
    )
    const tiles = roundedSurplus(demand, available)
    expect(tiles.available - tiles.demand).toBe(tiles.surplus)
  })

  it('footer and Grain tab use the same rounded population delta', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    state.players.human.grainStock = 5440
    state.players.human.population.peasants = 1069
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')
    const draft = defaultDraft(state.players.human)
    draft.feedLevel = 'max'
    const preview = previewYear(state, 'human', draft, rivals, difficulty)!
    const grain = roundedDelta(preview.populationBefore, preview.populationAfter)
    const footer = roundedDelta(preview.populationBefore, preview.populationAfter)
    expect(grain.delta).toBe(footer.delta)
    expect(grain.after - grain.before).toBe(grain.delta)
  })
})

describe('pending war attacker includes same-turn army', () => {
  it('guard hires and affordable training raise warStrength', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const player = state.players.a
    player.taler = 50_000
    player.guards = 0
    player.buildings.garrison = 0
    const baseline = warStrength(player)

    const draft = defaultDraft(player)
    draft.guardHire = 5
    draft.trainingInvest = 2
    draft.garrisonBuild = 1

    const invested: PlayerState = {
      ...player,
      buildings: { ...player.buildings },
      population: { ...player.population }
    }
    applyMilitaryInvestment(invested, draft.trainingInvest, draft.equipmentInvest)
    invested.guards = player.guards + draft.guardHire
    invested.buildings.garrison = player.buildings.garrison + draft.garrisonBuild

    expect(warStrength(invested)).toBeGreaterThan(baseline)
    expect(militaryMultiplier(invested)).toBeGreaterThan(militaryMultiplier(player))
  })
})
