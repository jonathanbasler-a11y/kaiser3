// EVENT ENGINE — probability, mitigation, and resolution.
//
// Design rules (from docs/kaiser-research.md § Event system design), enforced by
// validateEventCatalog() below rather than left as documentation:
//
//   1. EVERY event must declare a mitigation hook the player controls. An event
//      without one is invalid data and throws at load. This is what keeps events
//      feeling fair rather than like dice punishment — there is always something
//      you could have done.
//   2. Mitigation CAPS risk, never eliminates it. Even fully mitigated, an event
//      keeps its floorProbability. "Buy total safety once" is impossible — and
//      mitigation buildings carry ongoing upkeep (data/buildings.json), so safety
//      is rent, not a purchase.
//   3. Telegraphing is data from day one. Every fired event carries text
//      explaining WHY it hit, so a hard event reads as a consequence rather than
//      as arbitrary cruelty. The UI (Phase 9) renders these; it doesn't invent them.
//
// Each event rolls AT MOST ONCE per player per year — structurally guaranteed by
// iterating the catalog once, not by a de-duplication pass.

import eventsData from '../../../data/events.json'
import buildingsData from '../../../data/buildings.json'
import { SeededRng } from '../rng.ts'
import { PlayerState, PlayerEvent, EventId, EventLossType } from '../state.ts'
import { calculateExposure, ExposureSpec, ExposureContext } from '../scarcity.ts'

export interface EventMitigation {
  building: string              // Key into data/buildings.json `mitigation`
  probabilityReduction: number  // 0-1: how much having the building cuts the chance
  severityReduction: number     // 0-1: how much it blunts the damage when it does happen
}

export interface EventLossSpec {
  type: EventLossType
  fraction: number
  minimum?: number       // gold only: a floor so early-game raids still sting
  severityJitter: number // Width of the random severity band around 1.0
}

export interface EventDefinition {
  id: EventId
  name: string
  category: 'prosperity' | 'condition'
  baseWeight: number
  exposure: ExposureSpec
  mitigation: EventMitigation
  floorProbability: number
  maxProbability: number
  loss: EventLossSpec
  telegraph: { unmitigated: string; mitigated: string }
}

const CATALOG = eventsData.events as EventDefinition[]
const MITIGATION_BUILDINGS = buildingsData.mitigation as Record<string, unknown>

// Fails fast on malformed data rather than silently producing an unfair game.
export function validateEventCatalog(catalog: EventDefinition[] = CATALOG): void {
  const seenIds = new Set<string>()

  for (const event of catalog) {
    if (seenIds.has(event.id)) {
      throw new Error(`Event catalog: duplicate event id "${event.id}"`)
    }
    seenIds.add(event.id)

    // Rule 1: a mitigation hook the player actually controls.
    if (!event.mitigation || !event.mitigation.building) {
      throw new Error(`Event "${event.id}" has no mitigation hook — every event must be mitigable (see docs/kaiser-research.md).`)
    }
    if (!(event.mitigation.building in MITIGATION_BUILDINGS)) {
      throw new Error(`Event "${event.id}" names mitigation building "${event.mitigation.building}", which does not exist in data/buildings.json.`)
    }

    // Rule 2: mitigation caps risk but cannot eliminate it.
    if (event.mitigation.probabilityReduction >= 1) {
      throw new Error(`Event "${event.id}" has probabilityReduction >= 1 — mitigation must cap risk, never eliminate it.`)
    }
    if (event.mitigation.severityReduction >= 1) {
      throw new Error(`Event "${event.id}" has severityReduction >= 1 — mitigation must blunt damage, never nullify it.`)
    }

    if (event.floorProbability > event.maxProbability) {
      throw new Error(`Event "${event.id}" has floorProbability above maxProbability.`)
    }
    if (event.loss.severityJitter < 0 || event.loss.severityJitter > 2) {
      throw new Error(`Event "${event.id}" has an out-of-range severityJitter (expected 0-2).`)
    }
  }
}

// Fail fast at import: bad event data should never reach a running game.
validateEventCatalog()

function hasMitigationBuilding(player: PlayerState, building: string): boolean {
  const count = (player.buildings as unknown as Record<string, number>)[building]
  return typeof count === 'number' && count > 0
}

// The probability formula. Exposed separately from rolling so tests (and Phase 5's
// AI evaluator) can reason about expected risk without consuming RNG draws.
export function calculateEventProbability(
  event: EventDefinition,
  player: PlayerState,
  context: ExposureContext
): number {
  const exposure = calculateExposure(event.exposure, player, context)
  const mitigated = hasMitigationBuilding(player, event.mitigation.building)
  const mitigationFactor = mitigated ? 1 - event.mitigation.probabilityReduction : 1

  const raw = event.baseWeight * exposure * mitigationFactor

  // The floor applies only where there is real exposure. A principality with zero
  // unrest should not suffer a floor-probability peasant revolt out of nowhere —
  // condition-driven events set floorProbability to 0 for exactly this reason,
  // but guarding on exposure keeps the intent explicit rather than data-dependent.
  const floor = exposure > 0 ? event.floorProbability : 0
  return Math.min(event.maxProbability, Math.max(floor, raw))
}

export interface ResolvedEvent {
  event: PlayerEvent
  populationLoss: number
  goldLoss: number
  buildingsDestroyed: number
}

function rollSeverity(event: EventDefinition, rng: SeededRng): number {
  const jitter = event.loss.severityJitter
  return Math.max(0.1, 1 - jitter / 2 + rng.next() * jitter)
}

// Removes N production buildings, spread across markets and mills. Fire consumes
// timber workshops, not the stone palace or cathedral — so prestige buildings are
// deliberately exempt (they are also the rank-progression path, and destroying
// them would undo hours of investment on a dice roll).
function destroyProductionBuildings(player: PlayerState, count: number): number {
  let remaining = Math.floor(count)
  let destroyed = 0

  while (remaining > 0 && (player.buildings.markets > 0 || player.buildings.mills > 0)) {
    if (player.buildings.markets >= player.buildings.mills && player.buildings.markets > 0) {
      player.buildings.markets -= 1
    } else if (player.buildings.mills > 0) {
      player.buildings.mills -= 1
    } else {
      break
    }
    destroyed += 1
    remaining -= 1
  }

  return destroyed
}

// Applies a fired event's loss to the player, mutating them, and returns a
// structured record for the chronicle.
function applyEventLoss(
  event: EventDefinition,
  player: PlayerState,
  severity: number,
  mitigated: boolean
): ResolvedEvent {
  const severityFactor = mitigated ? severity * (1 - event.mitigation.severityReduction) : severity

  let populationLoss = 0
  let goldLoss = 0
  let buildingsDestroyed = 0

  switch (event.loss.type) {
    case 'population': {
      populationLoss = player.population.peasants * event.loss.fraction * severityFactor
      player.population.peasants = Math.max(0, player.population.peasants - populationLoss)
      break
    }
    case 'gold': {
      const proportional = player.taler * event.loss.fraction
      const floor = event.loss.minimum ?? 0
      // Scale with wealth so raids stay relevant late-game, but keep a flat floor
      // so they still sting early. Never takes more than the treasury holds.
      goldLoss = Math.min(player.taler, Math.max(proportional, floor) * severityFactor)
      player.taler = Math.max(0, player.taler - goldLoss)
      break
    }
    case 'buildings': {
      const productionBuildings = player.buildings.markets + player.buildings.mills
      const target = productionBuildings * event.loss.fraction * severityFactor
      // Round up so a fire that "hits" always destroys something when there is
      // anything to burn — otherwise small holdings would be silently immune.
      buildingsDestroyed = destroyProductionBuildings(player, Math.ceil(target))
      break
    }
  }

  const totalLoss = populationLoss + goldLoss + buildingsDestroyed

  return {
    event: {
      type: event.id,
      severity: severityFactor,
      mitigated,
      loss: totalLoss,
      lossType: event.loss.type,
      telegraphText: mitigated ? event.telegraph.mitigated : event.telegraph.unmitigated
    },
    populationLoss,
    goldLoss,
    buildingsDestroyed
  }
}

export interface EventPhaseResult {
  events: PlayerEvent[]
  totalPopulationLoss: number
  totalGoldLoss: number
  totalBuildingsDestroyed: number
}

// Rolls every event in the catalog exactly once for this player, applying any
// that fire. Mutates `player`. Draws from `rng` in catalog order, so results are
// deterministic for a given seed.
export function resolveEvents(
  player: PlayerState,
  context: ExposureContext,
  rng: SeededRng
): EventPhaseResult {
  const events: PlayerEvent[] = []
  let totalPopulationLoss = 0
  let totalGoldLoss = 0
  let totalBuildingsDestroyed = 0

  for (const event of CATALOG) {
    const probability = calculateEventProbability(event, player, context)

    // Draw BOTH the occurrence roll and the severity roll unconditionally — a fixed
    // 2 draws per event per player per year, whether or not the event fires.
    //
    // This keeps the RNG stream position independent of outcomes, which is what
    // makes controlled comparisons meaningful: an A/B run of "with hospital" vs
    // "without hospital" differs only in the plague result, instead of desyncing
    // the stream and scrambling every later fire/banditry roll too. Phase 6's
    // balance harness depends on this property to attribute effects to the knob
    // it actually changed.
    const roll = rng.next()
    const severity = rollSeverity(event, rng)

    if (roll >= probability) continue

    const mitigated = hasMitigationBuilding(player, event.mitigation.building)
    const resolved = applyEventLoss(event, player, severity, mitigated)

    events.push(resolved.event)
    totalPopulationLoss += resolved.populationLoss
    totalGoldLoss += resolved.goldLoss
    totalBuildingsDestroyed += resolved.buildingsDestroyed
  }

  return { events, totalPopulationLoss, totalGoldLoss, totalBuildingsDestroyed }
}

export function getEventCatalog(): EventDefinition[] {
  return CATALOG
}
