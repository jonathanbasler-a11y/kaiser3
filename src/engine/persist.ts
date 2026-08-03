// Save/load persistence for GameState. Serialize is already on state.ts for
// determinism tests; this module owns the reverse path + shape validation so a
// corrupted localStorage blob cannot poison a live session with NaNs.

import { GameState, PlayerState, BuildingState, cloneGameState } from './state.ts'

export const SAVE_FORMAT_VERSION = 1 as const

export interface SavedRival {
  playerId: string
  personalityId: string
}

export interface SavePayload {
  version: typeof SAVE_FORMAT_VERSION
  savedAt: string
  /** Player-chosen label (empty string if unnamed). */
  name: string
  game: GameState
  maxYears: number
  difficultyId: string
  rivals: SavedRival[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid save: ${label} must be a finite number`)
  }
  return value
}

function normalizeBuildings(raw: unknown): BuildingState {
  if (!isRecord(raw)) throw new Error('Invalid save: buildings missing')
  return {
    markets: finiteNumber(raw.markets, 'buildings.markets'),
    mills: finiteNumber(raw.mills, 'buildings.mills'),
    palace: finiteNumber(raw.palace, 'buildings.palace'),
    cathedral: finiteNumber(raw.cathedral, 'buildings.cathedral'),
    hospital: finiteNumber(raw.hospital, 'buildings.hospital'),
    well: finiteNumber(raw.well, 'buildings.well'),
    granary: finiteNumber(raw.granary, 'buildings.granary'),
    garrison: finiteNumber(raw.garrison, 'buildings.garrison'),
    dike: typeof raw.dike === 'number' && Number.isFinite(raw.dike) ? raw.dike : 0
  }
}

function normalizePlayer(raw: unknown, expectedId: string): PlayerState {
  if (!isRecord(raw)) throw new Error(`Invalid save: player ${expectedId} missing`)
  if (raw.id !== expectedId) throw new Error(`Invalid save: player id mismatch (${String(raw.id)} vs ${expectedId})`)
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new Error(`Invalid save: player ${expectedId} has no name`)
  }
  if (!isRecord(raw.land) || !isRecord(raw.population)) {
    throw new Error(`Invalid save: player ${expectedId} land/population missing`)
  }
  const player: PlayerState = {
    id: expectedId,
    name: raw.name,
    taler: finiteNumber(raw.taler, `${expectedId}.taler`),
    land: {
      farmland: finiteNumber(raw.land.farmland, `${expectedId}.farmland`),
      buildingLand: finiteNumber(raw.land.buildingLand, `${expectedId}.buildingLand`)
    },
    grainStock: finiteNumber(raw.grainStock, `${expectedId}.grainStock`),
    population: {
      peasants: finiteNumber(raw.population.peasants, `${expectedId}.peasants`),
      unrest: finiteNumber(raw.population.unrest, `${expectedId}.unrest`)
    },
    buildings: normalizeBuildings(raw.buildings),
    rank: finiteNumber(raw.rank, `${expectedId}.rank`),
    guards: finiteNumber(raw.guards, `${expectedId}.guards`),
    saboteurs: finiteNumber(raw.saboteurs, `${expectedId}.saboteurs`),
    tradingHouses: finiteNumber(raw.tradingHouses, `${expectedId}.tradingHouses`),
    score: finiteNumber(raw.score, `${expectedId}.score`),
    reignYears: finiteNumber(raw.reignYears, `${expectedId}.reignYears`),
    dead: Boolean(raw.dead),
    // Phase 18C. Tolerated-and-defaulted rather than required, exactly like
    // buildings.dike above: a save written before military investment existed
    // is still a valid save, and must load as "invested nothing" rather than
    // being rejected.
    trainingLevel: typeof raw.trainingLevel === 'number' && Number.isFinite(raw.trainingLevel) ? raw.trainingLevel : 0,
    equipmentLevel: typeof raw.equipmentLevel === 'number' && Number.isFinite(raw.equipmentLevel) ? raw.equipmentLevel : 0
  }
  if (typeof raw.heir === 'string') player.heir = raw.heir
  return player
}

export function deserializeGameState(json: string): GameState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid save: not JSON')
  }
  if (!isRecord(parsed)) throw new Error('Invalid save: root must be an object')

  const year = finiteNumber(parsed.year, 'year')
  if (!Array.isArray(parsed.activePlayerIds) || parsed.activePlayerIds.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid save: activePlayerIds must be string[]')
  }
  const activePlayerIds = parsed.activePlayerIds as string[]
  if (!isRecord(parsed.players)) throw new Error('Invalid save: players missing')
  if (!isRecord(parsed.kaizerTradePrices)) throw new Error('Invalid save: kaizerTradePrices missing')

  const players: Record<string, PlayerState> = {}
  for (const id of Object.keys(parsed.players)) {
    players[id] = normalizePlayer(parsed.players[id], id)
  }
  for (const id of activePlayerIds) {
    if (!players[id]) throw new Error(`Invalid save: active player ${id} missing from players`)
  }

  return cloneGameState({
    year,
    players,
    activePlayerIds: [...activePlayerIds],
    kaizerTradePrices: {
      corn: finiteNumber(parsed.kaizerTradePrices.corn, 'prices.corn'),
      farmland: finiteNumber(parsed.kaizerTradePrices.farmland, 'prices.farmland'),
      buildingLand: finiteNumber(parsed.kaizerTradePrices.buildingLand, 'prices.buildingLand')
    }
  })
}

export function parseSavePayload(json: string): SavePayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid save: not JSON')
  }
  if (!isRecord(parsed)) throw new Error('Invalid save: root must be an object')
  if (parsed.version !== SAVE_FORMAT_VERSION) {
    throw new Error(`Unsupported save version ${String(parsed.version)} (need ${SAVE_FORMAT_VERSION})`)
  }
  if (typeof parsed.savedAt !== 'string') throw new Error('Invalid save: savedAt missing')
  if (typeof parsed.difficultyId !== 'string') throw new Error('Invalid save: difficultyId missing')
  const maxYears = finiteNumber(parsed.maxYears, 'maxYears')
  if (maxYears < 1 || maxYears > 1000) throw new Error('Invalid save: maxYears out of range')
  if (!Array.isArray(parsed.rivals)) throw new Error('Invalid save: rivals missing')

  // Optional for saves written before named slots existed.
  let name = ''
  if (typeof parsed.name === 'string') {
    name = parsed.name.trim().slice(0, 48)
  } else if (parsed.name !== undefined) {
    throw new Error('Invalid save: name must be a string')
  }

  const rivals: SavedRival[] = parsed.rivals.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`Invalid save: rivals[${i}]`)
    if (typeof entry.playerId !== 'string' || typeof entry.personalityId !== 'string') {
      throw new Error(`Invalid save: rivals[${i}] ids`)
    }
    return { playerId: entry.playerId, personalityId: entry.personalityId }
  })

  // Re-serialize the game blob through deserialize so every numeric field is
  // validated once, regardless of whether callers pass a nested object or a
  // stringified GameState.
  const gameJson = typeof parsed.game === 'string'
    ? parsed.game
    : JSON.stringify(parsed.game)
  const game = deserializeGameState(gameJson)

  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: parsed.savedAt,
    name,
    game,
    maxYears,
    difficultyId: parsed.difficultyId,
    rivals
  }
}

export function buildSavePayload(input: {
  game: GameState
  maxYears: number
  difficultyId: string
  rivals: SavedRival[]
  name?: string
  savedAt?: string
}): SavePayload {
  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: input.savedAt ?? new Date().toISOString(),
    name: (input.name ?? '').trim().slice(0, 48),
    game: cloneGameState(input.game),
    maxYears: input.maxYears,
    difficultyId: input.difficultyId,
    rivals: input.rivals.map((r) => ({ ...r }))
  }
}

export function stringifySavePayload(payload: SavePayload): string {
  return JSON.stringify(payload)
}
