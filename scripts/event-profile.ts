// Diagnostic: prints event probabilities and observed rates across prosperity
// tiers, so balance work (Phase 6) can see the actual risk curve rather than
// inferring it from pass/fail tests.

import { getEventCatalog, calculateEventProbability, resolveEvents } from '../src/engine/events/events.ts'
import { SeededRng } from '../src/engine/rng.ts'
import { PlayerState } from '../src/engine/state.ts'
import { ExposureContext } from '../src/engine/scarcity.ts'

function makePlayer(o: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p', name: 'P', taler: 15000, land: { farmland: 10000, buildingLand: 0 }, grainStock: 5000,
    population: { peasants: 1000, unrest: 0 },
    buildings: { markets: 0, mills: 0, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 },
    rank: 0, guards: 0, saboteurs: 0, tradingHouses: 0, score: 0, reignYears: 0, dead: false, ...o
  }
}

const tiers: Array<{ label: string; player: PlayerState; ctx: ExposureContext }> = [
  { label: 'Starting (1k pop, 15k taler, 0 bld)', player: makePlayer(), ctx: { feedAdequacy: 1 } },
  {
    label: 'Growing (4k pop, 60k taler, 6 bld)',
    player: makePlayer({ taler: 60000, population: { peasants: 4000, unrest: 10 },
      buildings: { markets: 4, mills: 2, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 } }),
    ctx: { feedAdequacy: 1 }
  },
  {
    label: 'Thriving (20k pop, 200k taler, 27 bld)',
    player: makePlayer({ taler: 200000, population: { peasants: 20000, unrest: 20 },
      buildings: { markets: 10, mills: 8, palace: 8, cathedral: 1, hospital: 0, well: 0, granary: 0, garrison: 0 } }),
    ctx: { feedAdequacy: 1 }
  },
  {
    label: 'Thriving + FULLY mitigated',
    player: makePlayer({ taler: 200000, population: { peasants: 20000, unrest: 20 },
      buildings: { markets: 10, mills: 8, palace: 8, cathedral: 1, hospital: 1, well: 1, granary: 1, garrison: 1 } }),
    ctx: { feedAdequacy: 1 }
  },
  {
    label: 'Crisis (high unrest, starving)',
    player: makePlayer({ taler: 30000, population: { peasants: 3000, unrest: 85 },
      buildings: { markets: 3, mills: 2, palace: 0, cathedral: 0, hospital: 0, well: 0, granary: 0, garrison: 0 } }),
    ctx: { feedAdequacy: 0.35 }
  }
]

const TRIALS = 4000

for (const tier of tiers) {
  console.log(`\n=== ${tier.label} ===`)
  const header = getEventCatalog().map((e) => e.id.padStart(9)).join(' |')
  console.log(`           ${header}`)

  const probs = getEventCatalog()
    .map((e) => calculateEventProbability(e, tier.player, tier.ctx))
    .map((p) => (p * 100).toFixed(1).padStart(8) + '%')
    .join(' |')
  console.log(`predicted: ${probs}`)

  const counts: Record<string, number> = {}
  let anyEventYears = 0
  for (let i = 0; i < TRIALS; i++) {
    const subject = JSON.parse(JSON.stringify(tier.player)) as PlayerState
    const r = resolveEvents(subject, tier.ctx, new SeededRng(i + 1))
    if (r.events.length > 0) anyEventYears++
    for (const ev of r.events) counts[ev.type] = (counts[ev.type] ?? 0) + 1
  }
  const observed = getEventCatalog()
    .map((e) => (((counts[e.id] ?? 0) / TRIALS) * 100).toFixed(1).padStart(8) + '%')
    .join(' |')
  console.log(`observed:  ${observed}`)
  console.log(`  -> ${((anyEventYears / TRIALS) * 100).toFixed(1)}% of years see at least one event`)
}
