import { describe, it, expect } from 'vitest'
import { applySuccession, checkExtinction } from '../src/engine/succession.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState } from '../src/engine/state.ts'

function makePlayer(o: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p', name: 'P', taler: 15000, land: { farmland: 10000, buildingLand: 0 }, grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 2, mills: 1, palace: 4, cathedral: 0, hospital: 1, well: 0, granary: 0, garrison: 0 },
    rank: 1, guards: 0, saboteurs: 0, tradingHouses: 0, score: 50000, reignYears: 0, dead: false,
    ...o
  }
}

class CountingRng extends SeededRng {
  calls = 0

  override next(): number {
    this.calls++
    return super.next()
  }
}

describe('applySuccession', () => {
  it('never fires before minReignYears, however the dice fall', () => {
    const player = makePlayer({ reignYears: 0 })
    // Roll a very favorable-to-succession rng (near 0) many times — even so, an
    // early reign must never end.
    for (let year = 0; year < 14; year++) {
      const result = applySuccession(player, new SeededRng(1))
      expect(result.succeeded).toBe(false)
    }
    expect(player.reignYears).toBe(14)
  })

  it('resets score and reignYears, but leaves rank/land/buildings untouched', () => {
    const player = makePlayer({ reignYears: 20, score: 123456 })
    const beforeRank = player.rank
    const beforeLand = { ...player.land }
    const beforeBuildings = { ...player.buildings }

    // Try many seeds until one actually triggers succession (deterministic
    // per-seed, so this just finds a seed that rolls under the chance).
    let triggered = false
    for (let seed = 0; seed < 200 && !triggered; seed++) {
      const p = { ...player, land: { ...player.land }, buildings: { ...player.buildings } }
      const result = applySuccession(p, new SeededRng(seed))
      if (result.succeeded) {
        triggered = true
        expect(p.score).toBe(0)
        expect(p.reignYears).toBe(0)
        expect(p.heir).toBe(p.id)
        expect(p.rank).toBe(beforeRank)
        expect(p.land).toEqual(beforeLand)
        expect(p.buildings).toEqual(beforeBuildings)
      }
    }
    expect(triggered).toBe(true)
  })

  it('increments reignYears by exactly one on a year where succession does not fire', () => {
    const player = makePlayer({ reignYears: 5 })
    applySuccession(player, new SeededRng(999999)) // a seed unlikely to trigger this early anyway (below minReignYears)
    expect(player.reignYears).toBe(6)
  })

  it('draws the death roll before minReignYears without applying it', () => {
    const player = makePlayer({ reignYears: 0 })
    const rng = new CountingRng(1)

    const result = applySuccession(player, rng)

    expect(result.succeeded).toBe(false)
    expect(player.reignYears).toBe(1)
    expect(rng.calls).toBe(1)
  })
})

describe('checkExtinction', () => {
  it('sets dead=true and returns true when population has collapsed to nothing', () => {
    const player = makePlayer({ population: { peasants: 0.5, unrest: 0 } })
    const fired = checkExtinction(player)
    expect(fired).toBe(true)
    expect(player.dead).toBe(true)
  })

  it('does nothing while population is still viable', () => {
    const player = makePlayer({ population: { peasants: 100, unrest: 0 } })
    const fired = checkExtinction(player)
    expect(fired).toBe(false)
    expect(player.dead).toBe(false)
  })

  it('does not re-fire for an already-dead player', () => {
    const player = makePlayer({ population: { peasants: 0, unrest: 0 }, dead: true })
    const fired = checkExtinction(player)
    expect(fired).toBe(false) // already recorded, not a fresh event
    expect(player.dead).toBe(true)
  })
})
