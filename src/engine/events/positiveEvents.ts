// POSITIVE EVENTS (Phase 18D) — small, flat-chance flavor events. Answers the
// playtest request: "add random positive events as well (not game changing
// but good enough to be happy about)".
//
// Deliberately simpler than data/events.json's negative events: no
// exposure/mitigation modeling, no probability that scales with prosperity or
// unrest, just a small flat chance per player per year. The reward magnitude
// is flat regardless of realm size by the same design choice — this is
// flavor a player is meant to smile at, not a lever worth planning around, so
// it stays modest early and stays modest late rather than growing into one.

import positiveEventsData from '../../../data/positiveEvents.json'
import { SeededRng } from '../rng.ts'
import { PlayerState, PositiveEventOutcome } from '../state.ts'

export type PositiveRewardType = PositiveEventOutcome['rewardType']

export interface PositiveEventDefinition {
  id: string
  text: string
  rewardType: PositiveRewardType
}

const CATALOG = positiveEventsData.events as PositiveEventDefinition[]
const CHANCE_PER_YEAR = positiveEventsData.chancePerYear as number
const REWARD_RANGES = positiveEventsData.rewardRanges as Record<PositiveRewardType, { min: number; max: number }>

// Fails fast on malformed content, same discipline validateEventCatalog()
// applies to the negative-event catalog — bad data should never reach a
// running game.
export function validatePositiveEventCatalog(catalog: PositiveEventDefinition[] = CATALOG): void {
  const seenIds = new Set<string>()
  for (const entry of catalog) {
    if (seenIds.has(entry.id)) throw new Error(`Positive event catalog: duplicate id "${entry.id}"`)
    seenIds.add(entry.id)
    if (!entry.text) throw new Error(`Positive event "${entry.id}" has no text`)
    if (!(entry.rewardType in REWARD_RANGES)) {
      throw new Error(`Positive event "${entry.id}" has unknown rewardType "${entry.rewardType}"`)
    }
  }
  if (CHANCE_PER_YEAR < 0 || CHANCE_PER_YEAR > 1) {
    throw new Error(`Positive event chancePerYear must be in [0,1], got ${CHANCE_PER_YEAR}`)
  }
}

validatePositiveEventCatalog()

// Rolls at most one positive event for this player this year, mutating them
// on a hit. Draws exactly 3 values from `rng` UNCONDITIONALLY (occurrence,
// catalog selection, magnitude) regardless of whether the roll actually
// fires, for the same reason resolveEvents() does: a fixed draw count keeps
// this step's presence from shifting the RNG stream position differently
// than a no-op would, which matters for anyone diffing seeded runs.
export function rollPositiveEvent(player: PlayerState, rng: SeededRng): PositiveEventOutcome | null {
  const occurrenceRoll = rng.next()
  const selectionRoll = rng.next()
  const magnitudeRoll = rng.next()

  if (occurrenceRoll >= CHANCE_PER_YEAR || CATALOG.length === 0) return null

  const entry = CATALOG[Math.floor(selectionRoll * CATALOG.length)]
  const range = REWARD_RANGES[entry.rewardType]
  const amount = range.min + magnitudeRoll * (range.max - range.min)

  switch (entry.rewardType) {
    case 'taler':
      player.taler += amount
      break
    case 'population':
      player.population.peasants += amount
      break
    case 'grain':
      player.grainStock += amount
      break
    case 'unrest':
      player.population.unrest = Math.max(0, player.population.unrest - amount)
      break
  }

  return { id: entry.id, text: entry.text, rewardType: entry.rewardType, amount }
}

export function getPositiveEventCatalog(): PositiveEventDefinition[] {
  return CATALOG
}
