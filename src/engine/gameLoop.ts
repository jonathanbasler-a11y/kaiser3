// The playable game loop: wires the pure advanceYear reducer into a runnable game
// against scripted (non-AI) opponents. This is Phase 3's "is the loop fun at all"
// gate — real AI opponents (evaluator-driven) are Phase 5; these opponents are
// fixed, simple, deliberately unambitious placeholders.

import { GameState, Decision, Chronicle, PlayerState } from './state.ts'
import { advanceYear } from './year.ts'
import { createStarterState } from './starter.ts'

const KAISER_RANK = 7

// A scripted opponent: feeds adequately, taxes moderately, buys a little land
// each year if affordable, and builds one market when there's room. Not
// "intelligent" (Phase 5 territory) — just enough to not be a pushover.
export function scriptedOpponentDecisions(player: PlayerState, kaizerPrices: GameState['kaizerTradePrices']): Decision[] {
  const affordableFarmland = Math.floor((player.taler * 0.1) / kaizerPrices.farmland)
  const farmlandBuy = Math.min(100, affordableFarmland)

  return [
    { type: 'grain', feedLevel: 'required' },
    { type: 'land_trade', farmlanbuy: farmlandBuy, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
    { type: 'tax', vat: 15, incomeTax: 15, tariff: 5, justiceGraft: 10 },
    {
      type: 'construction',
      marketBuild: player.buildings.markets < 3 ? 1 : 0,
      millBuild: player.buildings.mills < 2 ? 1 : 0,
      palaceStages: 0,
      cathedralBuild: false,
      wellBuild: 0,
      hospitalBuild: 0,
      granaryBuild: 0,
      garrisonBuild: 0
    }
  ]
}

export interface PlayGameConfig {
  humanId: string
  humanName: string
  opponentCount: number
  maxYears: number
  getHumanDecisions: (state: GameState) => Decision[] | Promise<Decision[]>
  onYearComplete?: (state: GameState, chronicle: Chronicle) => void
  seedBase?: number
}

export type GameOutcome = 'victory' | 'population_collapse' | 'timeout'

export interface PlayGameResult {
  finalState: GameState
  yearsPlayed: number
  outcome: GameOutcome
  winnerId?: string
}

export async function runGame(config: PlayGameConfig): Promise<PlayGameResult> {
  const opponentIds = Array.from({ length: config.opponentCount }, (_, i) => `opponent${i + 1}`)
  const playerIds = [
    { id: config.humanId, name: config.humanName },
    ...opponentIds.map((id, i) => ({ id, name: `Rival ${i + 1}` }))
  ]

  let state = createStarterState(playerIds)
  const seedBase = config.seedBase ?? 1

  for (let year = 0; year < config.maxYears; year++) {
    const humanDecisions = await config.getHumanDecisions(state)
    const decisions: Record<string, Decision[]> = { [config.humanId]: humanDecisions }
    for (const oppId of opponentIds) {
      decisions[oppId] = scriptedOpponentDecisions(state.players[oppId], state.kaizerTradePrices)
    }

    const result = advanceYear(state, decisions, seedBase + year * 1000)
    state = result.state
    config.onYearComplete?.(state, result.chronicle)

    // Check victory: any active player reaching Kaiser rank.
    for (const playerId of state.activePlayerIds) {
      if (state.players[playerId].rank >= KAISER_RANK) {
        return { finalState: state, yearsPlayed: year + 1, outcome: 'victory', winnerId: playerId }
      }
    }

    // Check population collapse for the human specifically (the playable-loss condition).
    // Mortality/emigration are percentage-based, so population decays asymptotically
    // toward zero rather than hitting it exactly — fewer than one whole peasant left
    // means the principality is effectively depopulated.
    const EXTINCTION_THRESHOLD = 1
    if (state.players[config.humanId].population.peasants < EXTINCTION_THRESHOLD) {
      return { finalState: state, yearsPlayed: year + 1, outcome: 'population_collapse', winnerId: undefined }
    }

    // Drop any opponent whose population has collapsed (they're out of the game).
    state.activePlayerIds = state.activePlayerIds.filter(
      (id) => id === config.humanId || state.players[id].population.peasants >= EXTINCTION_THRESHOLD
    )
  }

  return { finalState: state, yearsPlayed: config.maxYears, outcome: 'timeout' }
}
