import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { annualGrainRequirement, resolveFeeding } from '../src/engine/economy.ts'
import {
  applyStandingOrders,
  defaultDraft,
  draftToDecisions,
  formatStandingOrderFire,
  standingOrderSellAmount
} from '../src/ui/decisions.ts'

describe('standing orders (#50b)', () => {
  const state = createStarterState([{ id: 'human', name: 'You' }])
  const player = state.players.human
  // Full barn after a forecast harvest — enough that Growth feeding still leaves surplus.
  const stockAtFeeding = annualGrainRequirement(player.population) * 2.0

  it('produces the same Decision[] as the equivalent manual feed + sell', () => {
    const percent = 50
    const auto = defaultDraft(player)
    const fire = applyStandingOrders(
      auto,
      { autoFeedMode: 'growth', autoSellGrainPercent: percent },
      stockAtFeeding,
      player.population
    )
    expect(fire).not.toBeNull()

    const manual = defaultDraft(player)
    manual.feedLevel = 'growth'
    const stockAfter = resolveFeeding(
      { type: 'grain', feedLevel: 'growth' },
      player.population,
      stockAtFeeding
    ).grainStockAfter
    manual.sellGrain = standingOrderSellAmount(stockAfter, player.population, percent)

    expect(draftToDecisions(auto)).toEqual(draftToDecisions(manual))
  })

  it('never sells into the 1-year demand reserve', () => {
    const demand = annualGrainRequirement(player.population)
    // After feeding, only 0.5y left — surplus above 1y reserve is zero.
    const thin = demand * 0.5
    expect(standingOrderSellAmount(thin, player.population, 100)).toBe(0)

    const fat = demand * 3
    const sell = standingOrderSellAmount(fat, player.population, 100)
    expect(sell).toBe(Math.floor(fat) - Math.ceil(demand))
    expect(fat - sell).toBeGreaterThanOrEqual(demand)
  })

  it('sells a percentage of surplus only', () => {
    const demand = annualGrainRequirement(player.population)
    const stockAfter = demand * 3
    const full = standingOrderSellAmount(stockAfter, player.population, 100)
    const half = standingOrderSellAmount(stockAfter, player.population, 50)
    expect(half).toBe(Math.floor(full * 0.5))
  })

  it('applies auto-feed alone without forcing a sale', () => {
    const draft = defaultDraft(player)
    draft.sellGrain = 0
    const fire = applyStandingOrders(
      draft,
      { autoFeedMode: 'min' },
      stockAtFeeding,
      player.population
    )
    expect(fire).toEqual({ autoFeedMode: 'min' })
    expect(draft.feedLevel).toBe('min')
    expect(draft.sellGrain).toBe(0)
  })

  it('formats a year-report line when an order fired', () => {
    expect(formatStandingOrderFire({
      autoFeedMode: 'growth',
      autoSellGrainPercent: 40,
      soldGrain: 1200
    })).toBe('Standing order: feed set to Growth; sold 1200 grain (40% of surplus above reserve).')
  })

  it('does nothing when standingOrders are absent', () => {
    const draft = defaultDraft(player)
    expect(applyStandingOrders(draft, undefined, stockAtFeeding, player.population)).toBeNull()
    expect(applyStandingOrders(draft, {}, stockAtFeeding, player.population)).toBeNull()
  })
})
