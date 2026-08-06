// HEADLESS AI SIMULATION — match runner, benchmark opponents, and tournaments.
//
// This is the measurement rig for PLAN.md's Phase 5 acceptance criteria (AI beats
// a random-legal bot, emits only legal decisions, and archetypes are actually
// distinct). Phase 6's balance harness builds on the same primitives.

import { GameState, Decision, PlayerState, Chronicle } from '../engine/state.ts'
import { advanceYear } from '../engine/year.ts'
import { createStarterState } from '../engine/starter.ts'
import { SeededRng } from '../engine/rng.ts'
import { rankProgress, getTopRank } from '../engine/ranks.ts'
import { totalLand } from '../engine/land.ts'
import { Personality, getPersonality } from './personalities.ts'
import { planYear } from './planner.ts'

import { planningSeed } from './planningSeed.ts'
import economyData from '../../data/economy.json'

const PRICES = economyData.prices
const FEEDING = economyData.feeding

// A ruler under some controller: either a tuned personality or a benchmark bot.
export type Controller =
  | { kind: 'ai'; personality: Personality }
  | { kind: 'random' }
  | { kind: 'passive' }

export interface Competitor {
  id: string
  name: string
  controller: Controller
}

// Makes random but WELL-FORMED decisions — the benchmark the tuned AI must beat.
// It respects the shape of every decision (legal rates, non-negative whole
// building counts) so that any win margin reflects better judgement rather than
// the bot disqualifying itself on malformed input.
export function randomLegalDecisions(player: PlayerState, rng: SeededRng): Decision[] {
  const feedLevels = ['min', 'growth', 'required', 'custom'] as const
  const feedLevel = feedLevels[rng.nextInt(0, feedLevels.length - 1)]

  const landBudget = player.taler * (rng.next() * 0.5)

  return [
    feedLevel === 'custom'
      // 21.4: customPercentage is now a target adequacy (% of demand), not a
      // share of barn stock, so the fuzzer's range has to move with it or it
      // starts emitting sheets validateDecisions() rejects. Bounds read from the
      // data rather than pinned: this bot exists to probe the whole legal space,
      // and a hardcoded ceiling below customMaxAdequacy would leave the
      // overfeeding band — the one part of the dial that can kill you — unfuzzed.
      ? {
          type: 'grain', feedLevel,
          customPercentage: rng.nextInt(
            Math.round(FEEDING.customMinAdequacy * 100),
            Math.round(FEEDING.customMaxAdequacy * 100)
          )
        }
      : { type: 'grain', feedLevel },
    {
      type: 'land_trade',
      farmlanbuy: Math.floor(landBudget / PRICES.farmlandBasePrice) * (rng.next() < 0.75 ? 1 : -1),
      buildingLandBuy: rng.next() < 0.5 ? Math.floor((player.taler * rng.next() * 0.2) / PRICES.buildingLandBasePrice) : 0,
      partnerPlayerId: 'kaiser'
    },
    {
      type: 'tax',
      vat: rng.nextInt(0, 100),
      incomeTax: rng.nextInt(0, 100),
      tariff: rng.nextInt(0, 100),
      justiceGraft: rng.nextInt(0, 100)
    },
    {
      type: 'construction',
      marketBuild: rng.nextInt(0, 3),
      millBuild: rng.nextInt(0, 3),
      palaceStages: rng.nextInt(0, 2),
      cathedralBuild: rng.next() < 0.15,
      wellBuild: rng.nextInt(0, 1),
      hospitalBuild: rng.nextInt(0, 1),
      granaryBuild: rng.nextInt(0, 1),
      garrisonBuild: rng.nextInt(0, 1),
      tradingHouseBuild: rng.nextInt(0, 1)
    }
  ]
}

function passiveDecisions(): Decision[] {
  return [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 0 },
    {
      type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
      wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
    }
  ]
}

export function decideFor(
  competitor: Competitor,
  state: GameState,
  rng: SeededRng,
  planningSeed: number
): Decision[] {
  switch (competitor.controller.kind) {
    case 'ai':
      return planYear(state, competitor.id, competitor.controller.personality, planningSeed)
    case 'random':
      return randomLegalDecisions(state.players[competitor.id], rng)
    case 'passive':
      return passiveDecisions()
  }
}

export interface MatchResult {
  winnerId: string | null
  finalState: GameState
  yearsPlayed: number
  reachedKaiser: boolean
  // Every decision sheet produced during the match, for legality auditing.
  allDecisions: Array<{ playerId: string; decisions: Decision[] }>
}

// The material position behind a ruler's title — the tiebreak, never the headline.
export function materialScore(player: PlayerState): number {
  return player.buildings.palace * 10_000
    + player.buildings.cathedral * 100_000
    + player.taler
    + player.population.peasants * 10
    + totalLand(player.land)
}

// Who is winning, compared LEXICOGRAPHICALLY: title first, then closeness to the
// next title, and only then material wealth.
//
// This is deliberately not a weighted sum. An earlier scalar version (rank worth
// 1,000,000, Taler worth 1) let a random bot with 2.4M Taler, rank 0 and a dying
// population of 229 peasants outrank an actual Duke — which is plainly the wrong
// answer for a game whose stated goal is to be crowned Kaiser, not to die rich.
// Any scalar has some treasury large enough to buy its way past a title; a
// lexicographic comparison has none, and cannot be broken later by inflation.
export function compareStanding(a: PlayerState, b: PlayerState): number {
  if (a.rank !== b.rank) return a.rank - b.rank

  const progressA = rankProgress(a)
  const progressB = rankProgress(b)
  if (Math.abs(progressA - progressB) > 1e-9) return progressA - progressB

  return materialScore(a) - materialScore(b)
}

// Called after each year with the state and that year's chronicle. Used by the
// Phase 6 balance harness to build a timeline without duplicating the match loop.
export type YearObserver = (state: GameState, chronicle: Chronicle) => void

export function runMatch(
  competitors: Competitor[],
  seed: number,
  maxYears: number,
  observeYear?: YearObserver
): MatchResult {
  let state = createStarterState(competitors.map((c) => ({ id: c.id, name: c.name })))
  const rng = new SeededRng(seed)
  const allDecisions: Array<{ playerId: string; decisions: Decision[] }> = []

  for (let year = 0; year < maxYears; year++) {
    const decisions: Record<string, Decision[]> = {}

    for (const competitor of competitors) {
      if (!state.activePlayerIds.includes(competitor.id)) continue
      const planSeed = planningSeed(seed, year, competitor.id)
      const sheet = decideFor(competitor, state, rng, planSeed)
      decisions[competitor.id] = sheet
      allDecisions.push({ playerId: competitor.id, decisions: sheet })
    }

    const result = advanceYear(state, decisions, seed + year * 1000)
    state = result.state
    observeYear?.(state, result.chronicle)

    for (const playerId of state.activePlayerIds) {
      if (state.players[playerId].rank >= getTopRank()) {
        return { winnerId: playerId, finalState: state, yearsPlayed: year + 1, reachedKaiser: true, allDecisions }
      }
    }

    // A ruler whose population is gone is out of the running.
    state.activePlayerIds = state.activePlayerIds.filter((id) => state.players[id].population.peasants >= 1)
    if (state.activePlayerIds.length === 0) {
      return { winnerId: null, finalState: state, yearsPlayed: year + 1, reachedKaiser: false, allDecisions }
    }
  }

  let winnerId: string | null = null
  for (const playerId of state.activePlayerIds) {
    if (winnerId === null || compareStanding(state.players[playerId], state.players[winnerId]) > 0) {
      winnerId = playerId
    }
  }

  return { winnerId, finalState: state, yearsPlayed: maxYears, reachedKaiser: false, allDecisions }
}

export interface TournamentResult {
  matches: number
  winsByPlayer: Record<string, number>
  winRate: (playerId: string) => number
}

export function runTournament(
  competitors: Competitor[],
  matches: number,
  maxYears: number,
  seedBase = 1
): TournamentResult {
  const winsByPlayer: Record<string, number> = {}
  for (const c of competitors) winsByPlayer[c.id] = 0

  for (let i = 0; i < matches; i++) {
    const result = runMatch(competitors, seedBase + i * 7717, maxYears)
    if (result.winnerId) winsByPlayer[result.winnerId] += 1
  }

  return {
    matches,
    winsByPlayer,
    winRate: (playerId: string) => (winsByPlayer[playerId] ?? 0) / matches
  }
}

export function aiCompetitor(id: string, personalityId: string): Competitor {
  const personality = getPersonality(personalityId)
  return { id, name: personality.name, controller: { kind: 'ai', personality } }
}
