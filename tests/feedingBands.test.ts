// Phase 21.4 / issue #50a — the feed dial means one thing.
//
// The report was "Impact of grain usages on Bev — strange, relationship seems to
// change, why?". That was an accurate reading of the mechanic, not a
// misreading. Min/Max were fractions of BARN STOCK (0.2 / 0.8), so the same
// setting delivered a different share of demand every year depending on how full
// the barn happened to be — and in a full barn "Max" tipped into disease. Modes
// now name a target adequacy directly.
//
// These tests pin the relationships between the dial and the systems downstream
// of it, because those are what make the numbers in data/economy.json coherent
// rather than arbitrary. Retuning the data without honouring them is what this
// file exists to catch.

import { describe, it, expect } from 'vitest'
import economyData from '../data/economy.json'
import { resolveFeeding } from '../src/engine/economy.ts'
import { applyPopulationDynamics } from '../src/engine/population.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PopulationState, GrainDecision, FeedMode } from '../src/engine/state.ts'

const FEEDING = economyData.feeding
const POP = economyData.population

const population: PopulationState = { peasants: 1000, unrest: 0 }
const required = population.peasants * POP.populationGrainRequirement
const deepBarn = required * 50

const feed = (decision: GrainDecision, stock = deepBarn) => resolveFeeding(decision, population, stock)

describe('the dial means the same thing every year (#50a)', () => {
  // THE bug. Under the old stock-fraction dial this failed by construction.
  it('every preset mode delivers its stated adequacy regardless of barn size', () => {
    const modes: Array<[FeedMode, number]> = [
      ['min', FEEDING.minAdequacy],
      ['required', FEEDING.requiredAdequacy],
      ['growth', FEEDING.growthAdequacy]
    ]
    for (const [mode, expected] of modes) {
      for (const stock of [required * 2, required * 10, required * 200]) {
        const result = feed({ type: 'grain', feedLevel: mode }, stock)
        expect(result.feedAdequacy, `${mode} @ stock ${stock}`).toBeCloseTo(expected, 6)
      }
    }
  })

  it('custom delivers the slider value as a share of demand', () => {
    for (const pct of [60, 90, 100, 125, 150]) {
      const clamped = Math.min(FEEDING.customMaxAdequacy, Math.max(FEEDING.customMinAdequacy, pct / 100))
      const result = feed({ type: 'grain', feedLevel: 'custom', customPercentage: pct })
      expect(result.feedAdequacy).toBeCloseTo(clamped, 6)
    }
  })

  it('the barn still caps the dial — naming a target does not conjure grain', () => {
    const halfAYear = required * 0.5
    const result = feed({ type: 'grain', feedLevel: 'growth' }, halfAYear)
    expect(result.grainConsumed).toBeLessThanOrEqual(halfAYear)
    expect(result.feedAdequacy).toBeCloseTo(0.5, 6)
    // The dial still reports what was ASKED for, which is what lets the UI say
    // "you asked for X but only Y is in store" rather than looking broken.
    expect(result.targetAdequacy).toBeCloseTo(FEEDING.growthAdequacy, 6)
  })

  it('reports target and realised as equal when the barn can cover it', () => {
    const result = feed({ type: 'grain', feedLevel: 'min' })
    expect(result.targetAdequacy).toBeCloseTo(result.feedAdequacy, 6)
  })
})

describe('the mode constants stay coherent with the systems they feed', () => {
  // Growth exists to attract immigrants. If it drifts outside the immigration
  // window it silently becomes a strictly worse "Required" that just wastes grain.
  it('growth sits inside the immigration window', () => {
    expect(FEEDING.growthAdequacy).toBeGreaterThanOrEqual(POP.immigrationMinAdequacy)
    expect(FEEDING.growthAdequacy).toBeLessThanOrEqual(POP.immigrationMaxAdequacy)
  })

  it('growth does not tip into disease', () => {
    expect(FEEDING.growthAdequacy).toBeLessThan(FEEDING.overfedAdequacy)
  })

  it('min is genuinely austerity — under the underfed line', () => {
    expect(FEEDING.minAdequacy).toBeLessThan(FEEDING.underfedAdequacy)
  })

  it('required is not underfed', () => {
    expect(FEEDING.requiredAdequacy).toBeGreaterThanOrEqual(FEEDING.underfedAdequacy)
  })

  // The overfeed-to-disease lever must stay reachable. economy.ts's header and
  // CLAUDE.md both call it a real scarcity lever; the phase plan originally
  // capped custom at 1.35, which is BELOW overfedAdequacy (1.4) and would have
  // made the mechanic unreachable by any mode and orphaned
  // population.diseaseOverfeedMortality.
  it('custom can still reach overfeeding, so the disease lever is not dead code', () => {
    expect(FEEDING.customMaxAdequacy).toBeGreaterThan(FEEDING.overfedAdequacy)

    const overfed = feed({ type: 'grain', feedLevel: 'custom', customPercentage: FEEDING.customMaxAdequacy * 100 })
    expect(overfed.isOverfed).toBe(true)

    const normal = feed({ type: 'grain', feedLevel: 'required' })
    const overResult = applyPopulationDynamics(population, overfed, new SeededRng(7))
    const normalResult = applyPopulationDynamics(population, normal, new SeededRng(7))
    expect(overResult.deaths).toBeGreaterThan(normalResult.deaths)
  })

  it('no preset mode can overfeed by accident', () => {
    for (const mode of ['min', 'required', 'growth'] as FeedMode[]) {
      expect(feed({ type: 'grain', feedLevel: mode }).isOverfed, mode).toBe(false)
    }
  })
})

describe('validation tracks the data, not a hardcoded range', () => {
  it('accepts the whole custom range the slider can produce', () => {
    for (const pct of [FEEDING.customMinAdequacy * 100, 100, FEEDING.customMaxAdequacy * 100]) {
      const result = validateDecisions([{ type: 'grain', feedLevel: 'custom', customPercentage: pct }])
      expect(result.valid, `${pct}% should be legal`).toBe(true)
    }
  })

  it('rejects values outside it', () => {
    for (const pct of [FEEDING.customMinAdequacy * 100 - 1, FEEDING.customMaxAdequacy * 100 + 1]) {
      expect(validateDecisions([{ type: 'grain', feedLevel: 'custom', customPercentage: pct }]).valid).toBe(false)
    }
  })

  it('rejects the retired "max" mode outright rather than silently degrading it', () => {
    // 'max' meant 80% of stock. Left un-rejected it would degrade to 'required'
    // via resolveFeeding's default branch, which is safe but silent — a stale
    // save file or an old script should fail loudly instead.
    const result = validateDecisions([{ type: 'grain', feedLevel: 'max' as FeedMode }])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('feedLevel'))).toBe(true)
  })
})

describe('immigration reports why it is gated (#47)', () => {
  // The player asked whether immigration is driven by "food prestige tax". It is
  // driven by none of those, and usually it is simply off — which a bare zero
  // cannot communicate.
  it('reports an open gate when unrest is low and feeding is in the window', () => {
    const calm: PopulationState = { peasants: 1000, unrest: 0 }
    const feeding = resolveFeeding({ type: 'grain', feedLevel: 'growth' }, calm, deepBarn)
    const result = applyPopulationDynamics(calm, feeding, new SeededRng(3))

    expect(result.immigrationGate.unrestOk).toBe(true)
    expect(result.immigrationGate.adequacyOk).toBe(true)
    expect(result.immigration).toBeGreaterThan(0)
  })

  it('names unrest as the blocker when the realm is angry', () => {
    const angry: PopulationState = { peasants: 1000, unrest: POP.immigrationMaxUnrest + 20 }
    const feeding = resolveFeeding({ type: 'grain', feedLevel: 'growth' }, angry, deepBarn)
    const result = applyPopulationDynamics(angry, feeding, new SeededRng(3))

    expect(result.immigrationGate.unrestOk).toBe(false)
    expect(result.immigration).toBe(0)
  })

  it('names feeding as the blocker when the realm is hungry', () => {
    const calm: PopulationState = { peasants: 1000, unrest: 0 }
    const feeding = resolveFeeding({ type: 'grain', feedLevel: 'min' }, calm, deepBarn)
    const result = applyPopulationDynamics(calm, feeding, new SeededRng(3))

    expect(result.immigrationGate.adequacyOk).toBe(false)
    expect(result.immigrationGate.adequacy).toBeCloseTo(FEEDING.minAdequacy, 6)
    expect(result.immigration).toBe(0)
  })

  // The draw must happen either way — population.ts:60-70's established pattern.
  // A conditionally-skipped draw would shift every later roll for every other
  // player, and the suite would still pass.
  it('consumes its RNG draw whether or not anyone immigrates', () => {
    const calm: PopulationState = { peasants: 1000, unrest: 0 }
    const angry: PopulationState = { peasants: 1000, unrest: POP.immigrationMaxUnrest + 20 }

    const openRng = new SeededRng(99)
    applyPopulationDynamics(calm, resolveFeeding({ type: 'grain', feedLevel: 'growth' }, calm, deepBarn), openRng)

    const shutRng = new SeededRng(99)
    applyPopulationDynamics(angry, resolveFeeding({ type: 'grain', feedLevel: 'growth' }, angry, deepBarn), shutRng)

    expect(shutRng.next()).toBe(openRng.next())
  })
})
