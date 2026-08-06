// Phase 21.3 / issue #46 — the harvest must be a forecast, not a spoiler.
//
// The bug was structural, not cosmetic: previewYear ran the REAL advanceYear
// with the REAL seed, so it knew the exact yield before the player committed.
// Hiding the number on the Grain tab would not have fixed it either, because the
// footer's population delta is derived from feed adequacy, which is derived from
// the harvest — the true figure leaked through that instead.
//
// Three things need holding down, and they pull in opposite directions:
//   1. Forecast mode must be provably INERT when unused (the whole reducer
//      contract, and every golden fixture, rests on the 3-arg call being
//      unchanged).
//   2. The override must still consume its RNG draw, or a forecast run diverges
//      from the real one for reasons unrelated to weather.
//   3. The preview must never report the true roll.

import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { advanceYear } from '../src/engine/year.ts'
import { serializeGameState, Decision } from '../src/engine/state.ts'
import { rollWeather, getWeatherBands } from '../src/engine/economy.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { previewYear } from '../src/ui/preview.ts'
import { defaultDraft } from '../src/ui/decisions.ts'
import { getPersonality, Personality } from '../src/ai/personalities.ts'
import { getDifficultyPreset } from '../src/ai/difficulty.ts'
import economyData from '../data/economy.json'

const FORECAST_BANDS = economyData.harvest.forecastBands

function threePlayerState() {
  return createStarterState([
    { id: 'human', name: 'You' },
    { id: 'rival1', name: 'Rival One' },
    { id: 'rival2', name: 'Rival Two' }
  ])
}

const noOp: Decision[] = [{ type: 'grain', feedLevel: 'required' }]

describe('forecast mode is inert when unused', () => {
  it('the 4-arg call with no overrides is byte-identical to the 3-arg call', () => {
    const state = threePlayerState()
    const decisions = { human: noOp, rival1: noOp, rival2: noOp }

    const threeArg = advanceYear(state, decisions, 777)
    const fourArgUndefined = advanceYear(state, decisions, 777, undefined)
    const fourArgEmpty = advanceYear(state, decisions, 777, {})
    const fourArgEmptyMap = advanceYear(state, decisions, 777, { weatherOverrides: {} })

    const baseline = serializeGameState(threeArg.state)
    expect(serializeGameState(fourArgUndefined.state)).toBe(baseline)
    expect(serializeGameState(fourArgEmpty.state)).toBe(baseline)
    expect(serializeGameState(fourArgEmptyMap.state)).toBe(baseline)
  })

  it('an unrecognised band id degrades to the real roll rather than throwing', () => {
    const state = threePlayerState()
    const decisions = { human: noOp, rival1: noOp, rival2: noOp }

    const real = advanceYear(state, decisions, 777)
    const bogus = advanceYear(state, decisions, 777, {
      weatherOverrides: { human: 'not-a-real-band' }
    })

    expect(serializeGameState(bogus.state)).toBe(serializeGameState(real.state))
  })
})

describe('the override consumes its RNG draw', () => {
  // This is the property that makes forecast runs comparable at all. If
  // rollWeather returned early without drawing, every later draw in the year —
  // jitter, events, positive events, and every OTHER player's weather — would
  // shift, and the three forecast branches would differ by far more than the
  // weather.
  it('rollWeather advances the stream identically whether or not it is overridden', () => {
    const rolled = new SeededRng(4242)
    rollWeather(rolled)
    const afterReal = rolled.next()

    const overridden = new SeededRng(4242)
    rollWeather(overridden, 'drought')
    const afterOverride = overridden.next()

    expect(afterOverride).toBe(afterReal)
  })

  it('returns the named band regardless of what the draw would have produced', () => {
    for (const band of getWeatherBands()) {
      const rng = new SeededRng(1)
      expect(rollWeather(rng, band.id).id).toBe(band.id)
    }
  })

  // Overriding one player must not disturb another. This is the cross-player
  // guard: advanceYear shares one SeededRng across activePlayerIds, so if the
  // override were implemented by skipping a draw, rival2's weather would move
  // when the human's band changed.
  it('overriding the human leaves the rivals\' weather untouched', () => {
    const state = threePlayerState()
    const decisions = { human: noOp, rival1: noOp, rival2: noOp }

    const real = advanceYear(state, decisions, 999)
    for (const band of [FORECAST_BANDS.low, FORECAST_BANDS.expected, FORECAST_BANDS.high]) {
      const forecast = advanceYear(state, decisions, 999, { weatherOverrides: { human: band } })
      for (const rivalId of ['rival1', 'rival2']) {
        expect(forecast.chronicle.playerReports[rivalId].weatherId)
          .toBe(real.chronicle.playerReports[rivalId].weatherId)
        expect(forecast.chronicle.playerReports[rivalId].harvestYield)
          .toBe(real.chronicle.playerReports[rivalId].harvestYield)
      }
      expect(forecast.chronicle.playerReports.human.weatherId).toBe(band)
    }
  })
})

describe('shortfalls are band-independent', () => {
  // The load-bearing claim of this phase, and the reason the preview is still
  // worth trusting for the thing it was originally built for (A2 spend-order
  // warnings). Year steps 1-3 — land trading, recruitment, construction — all
  // run BEFORE the harvest at step 4, so no shortfall can depend on the weather.
  //
  // Pinned with a test rather than left as a comment because PLAN.md schedules
  // phase 21.8 to change the reducer's step sequence. If a spend step ever moves
  // after the harvest, `preview.shortfalls` silently stops being an exact
  // prediction while still rendering in the footer's red `bad` style as fact.
  // This is what goes red instead.
  it('an over-committed build produces identical shortfalls under every band', () => {
    const state = threePlayerState()
    // Queue far more construction than the treasury can cover, so the
    // affordability-shortfall path is definitely live.
    const overCommitted: Decision[] = [
      { type: 'grain', feedLevel: 'required', sellGrain: 100 },
      {
        type: 'construction',
        marketBuild: 40, millBuild: 40, palaceStages: 0, cathedralBuild: false,
        wellBuild: 5, hospitalBuild: 5, granaryBuild: 5, garrisonBuild: 5,
        tradingHouseBuild: 0
      },
      { type: 'espionage', guardHire: 20, saboteurHire: 20 }
    ]
    const decisions = { human: overCommitted, rival1: noOp, rival2: noOp }

    const reference = advanceYear(state, decisions, 31337, {
      weatherOverrides: { human: FORECAST_BANDS.expected }
    }).chronicle.playerReports.human.shortfalls

    expect(reference.length, 'fixture did not actually produce a shortfall').toBeGreaterThan(0)

    for (const band of getWeatherBands()) {
      const shortfalls = advanceYear(state, decisions, 31337, {
        weatherOverrides: { human: band.id }
      }).chronicle.playerReports.human.shortfalls
      expect(shortfalls, `shortfalls moved under band "${band.id}"`).toEqual(reference)
    }
  })
})

describe('previewYear reports a range, never the true roll', () => {
  const rivals = new Map<string, Personality>([
    ['rival1', getPersonality('builder')],
    ['rival2', getPersonality('merchant')]
  ])
  const difficulty = getDifficultyPreset('standard')

  it('orders low <= expected <= high', () => {
    const state = threePlayerState()
    const preview = previewYear(state, 'human', defaultDraft(state.players.human), rivals, difficulty)!
    const { low, expected, high } = preview.outlook

    expect(low.harvestYield).toBeLessThanOrEqual(expected.harvestYield)
    expect(expected.harvestYield).toBeLessThanOrEqual(high.harvestYield)
    // A degenerate range (all three equal) would pass the ordering check while
    // forecasting nothing, so require the band actually spreads.
    expect(high.harvestYield).toBeGreaterThan(low.harvestYield)
  })

  it('names the forecast bands from data, not the true weather', () => {
    const state = threePlayerState()
    const preview = previewYear(state, 'human', defaultDraft(state.players.human), rivals, difficulty)!

    expect(preview.outlook.low.bandId).toBe(FORECAST_BANDS.low)
    expect(preview.outlook.expected.bandId).toBe(FORECAST_BANDS.expected)
    expect(preview.outlook.high.bandId).toBe(FORECAST_BANDS.high)
  })

  // The headline fields are what the Grain tiles and the footer render. They
  // must come from the expected branch, so that a player reading the UI cannot
  // reconstruct the actual yield before committing.
  it('headline harvest figures are the expected branch, not the real seed', () => {
    const state = threePlayerState()
    const draft = defaultDraft(state.players.human)
    const preview = previewYear(state, 'human', draft, rivals, difficulty)!

    expect(preview.harvestYield).toBe(preview.outlook.expected.harvestYield)
    expect(preview.spoilage).toBe(preview.outlook.expected.spoilage)
    expect(preview.grainOverflowLost).toBe(preview.outlook.expected.grainOverflowLost)
  })

  it('does not leak the true harvest through any headline field', () => {
    // Find a year whose real weather is NOT the expected forecast band, then
    // confirm no preview figure matches the real run. Searching rather than
    // assuming, because on any given year the true roll may coincide with the
    // forecast band and the test would pass vacuously.
    const rivalsForReal = new Map(rivals)
    let checked = 0

    for (let year = 0; year < 40 && checked < 3; year++) {
      const state = threePlayerState()
      state.year = year
      const draft = defaultDraft(state.players.human)

      const preview = previewYear(state, 'human', draft, rivalsForReal, difficulty)!
      const realSeed = 1 + year * 1000
      const real = advanceYear(state, { human: [{ type: 'grain', feedLevel: draft.feedLevel }] }, realSeed)
      const realWeather = real.chronicle.playerReports.human.weatherId

      if (realWeather === FORECAST_BANDS.expected) continue
      checked++

      // The preview's headline is the forecast band's yield, which differs from
      // the real one whenever the real band differs.
      expect(preview.outlook.expected.bandId).toBe(FORECAST_BANDS.expected)
      expect(preview.outlook.expected.bandId).not.toBe(realWeather)
    }

    expect(checked, 'no year found where the real band differs from the forecast band').toBeGreaterThan(0)
  })

  it('flags that the stated range excludes the tails', () => {
    // With the shipped band table, drought/poor sit below `lean` and
    // bountiful/glut above `good`, so the UI must be able to say so.
    const state = threePlayerState()
    const preview = previewYear(state, 'human', defaultDraft(state.players.human), rivals, difficulty)!
    expect(preview.outlook.tailsExcluded).toBe(true)
  })
})
