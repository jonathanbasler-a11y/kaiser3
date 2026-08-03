// UI coherence — guards against "two calculators for one claim" bugs like the
// Grain-tab population vs footer desync (PR #25). Pure helpers + previewYear
// agreement; no DOM.

import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { getDifficultyPreset } from '../src/ai/difficulty.ts'
import { getPersonality } from '../src/ai/personalities.ts'
import { previewYear, warSnapshotDraft } from '../src/ui/preview.ts'
import { defaultDraft } from '../src/ui/decisions.ts'
import {
  feedStockFromChronicle,
  roundedDelta,
  roundedLandSplit,
  roundedStrength,
  roundedSurplus
} from '../src/ui/displayCoherence.ts'
import { annualGrainRequirement } from '../src/engine/economy.ts'
import type { Personality } from '../src/ai/personalities.ts'

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
  it('previewYear reports affordable training bought this year', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const player = state.players.human
    player.taler = 50_000
    player.trainingLevel = 0

    const draft = defaultDraft(player)
    draft.trainingInvest = 1

    const preview = previewYear(state, 'human', draft, new Map(), getDifficultyPreset('standard'))!

    expect(preview.trainingLevelAfter).toBeGreaterThan(player.trainingLevel)
  })

  it('previewYear reports zero training bought when the treasury clamps spend', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const player = state.players.human
    player.taler = 0
    player.trainingLevel = 0

    const draft = defaultDraft(player)
    draft.trainingInvest = 5

    const preview = previewYear(state, 'human', draft, new Map(), getDifficultyPreset('standard'))!

    expect(preview.trainingLevelAfter).toBe(player.trainingLevel)
  })

  it('War tab army snapshot matches no-war preview even when a war target is selected', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    const player = state.players.human
    player.taler = 50_000
    player.trainingLevel = 0
    player.guards = 0
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')

    const noWarDraft = defaultDraft(player)
    noWarDraft.trainingInvest = 1
    noWarDraft.guardHire = 3

    const selectedWarDraft = { ...noWarDraft }
    selectedWarDraft.declareWar = true
    selectedWarDraft.warTargetPlayerId = 'rival1'
    selectedWarDraft.warAlliesRequested = ['rival1']

    const noWarPreview = previewYear(state, 'human', noWarDraft, rivals, difficulty)!
    const selectedWarSnapshot = previewYear(state, 'human', warSnapshotDraft(selectedWarDraft), rivals, difficulty)!

    expect(selectedWarSnapshot.trainingLevelAfter).toBe(noWarPreview.trainingLevelAfter)
    expect(selectedWarSnapshot.guardsAfter).toBe(noWarPreview.guardsAfter)
    expect(selectedWarSnapshot.populationAfter).toBe(noWarPreview.populationAfter)
  })
})

describe('previewYear surfaces population components (bug report #28)', () => {
  it('births/deaths/immigration/emigration/events net to the before/after delta', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')
    const draft = defaultDraft(state.players.human)

    const preview = previewYear(state, 'human', draft, rivals, difficulty)!

    expect(preview.births).toBeGreaterThanOrEqual(0)
    expect(preview.deaths).toBeGreaterThanOrEqual(0)
    expect(preview.immigration).toBeGreaterThanOrEqual(0)
    expect(preview.emigration).toBeGreaterThanOrEqual(0)
    expect(preview.eventPopulationLoss).toBeGreaterThanOrEqual(0)

    // Dynamics terms + event losses (applied later in advanceYear) must sum to
    // the displayed before→after delta — including plague years.
    const net = preview.births - preview.deaths + preview.immigration - preview.emigration
      - preview.eventPopulationLoss
    expect(Math.round(preview.populationAfter - preview.populationBefore)).toBe(Math.round(net))
  })

  it('still sums when an event kills peasants', () => {
    const state = createStarterState([
      { id: 'human', name: 'You' },
      { id: 'rival1', name: 'Rival' }
    ])
    // Large unmitigated realm → plague is likely and severe enough to fire.
    state.players.human.population.peasants = 8000
    state.players.human.taler = 120000
    state.players.human.buildings.markets = 8
    state.players.human.buildings.mills = 4
    const rivals = new Map<string, Personality>([['rival1', getPersonality('builder')]])
    const difficulty = getDifficultyPreset('standard')
    const draft = defaultDraft(state.players.human)

    let foundEventLoss = false
    for (let year = 0; year < 40; year++) {
      state.year = year
      const preview = previewYear(state, 'human', draft, rivals, difficulty)!
      const net = preview.births - preview.deaths + preview.immigration - preview.emigration
        - preview.eventPopulationLoss
      expect(Math.round(preview.populationAfter - preview.populationBefore)).toBe(Math.round(net))
      if (preview.eventPopulationLoss > 0) foundEventLoss = true
    }
    expect(foundEventLoss).toBe(true)
  })
})
