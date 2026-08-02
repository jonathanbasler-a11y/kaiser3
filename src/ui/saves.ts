// Three localStorage save slots for solo play. Static-hosted, no backend —
// browser storage holds the three slots; Export/Import JSON moves a reign
// across devices without accounts or cloud sync.

import {
  SavePayload,
  SavedRival,
  buildSavePayload,
  parseSavePayload,
  stringifySavePayload
} from '../engine/persist.ts'
import { GameState } from '../engine/state.ts'

export const SAVE_SLOT_COUNT = 3
const KEY_PREFIX = 'kaiser3.save.slot.'

export interface SlotSummary {
  index: number
  empty: boolean
  name?: string
  savedAt?: string
  year?: number
  rank?: number
  taler?: number
  difficultyId?: string
  error?: string
}

export interface SaveWriteInput {
  game: GameState
  maxYears: number
  difficultyId: string
  rivals: SavedRival[]
  name?: string
}

function slotKey(index: number): string {
  return `${KEY_PREFIX}${index}`
}

function assertSlotIndex(index: number): void {
  if (index < 0 || index >= SAVE_SLOT_COUNT) throw new Error(`Save slot ${index} out of range`)
}

export function readSlot(index: number): SavePayload | null {
  assertSlotIndex(index)
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(slotKey(index))
  if (!raw) return null
  return parseSavePayload(raw)
}

export function writeSlot(index: number, input: SaveWriteInput): SavePayload {
  assertSlotIndex(index)
  if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable')
  const payload = buildSavePayload(input)
  try {
    localStorage.setItem(slotKey(index), stringifySavePayload(payload))
  } catch (err) {
    throw new Error(`Could not write save slot ${index + 1}: ${(err as Error).message}`)
  }
  return payload
}

/** Write an already-validated payload (e.g. after Import) into a slot. */
export function writeSlotPayload(index: number, payload: SavePayload): void {
  assertSlotIndex(index)
  if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable')
  try {
    localStorage.setItem(slotKey(index), stringifySavePayload(payload))
  } catch (err) {
    throw new Error(`Could not write save slot ${index + 1}: ${(err as Error).message}`)
  }
}

export function clearSlot(index: number): void {
  assertSlotIndex(index)
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(slotKey(index))
}

export function listSlotSummaries(humanId = 'human'): SlotSummary[] {
  const summaries: SlotSummary[] = []
  for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
    if (typeof localStorage === 'undefined') {
      summaries.push({ index: i, empty: true })
      continue
    }
    const raw = localStorage.getItem(slotKey(i))
    if (!raw) {
      summaries.push({ index: i, empty: true })
      continue
    }
    try {
      const payload = parseSavePayload(raw)
      const human = payload.game.players[humanId]
      summaries.push({
        index: i,
        empty: false,
        name: payload.name,
        savedAt: payload.savedAt,
        year: payload.game.year,
        rank: human?.rank,
        taler: human?.taler,
        difficultyId: payload.difficultyId
      })
    } catch (err) {
      summaries.push({ index: i, empty: false, error: (err as Error).message })
    }
  }
  return summaries
}

export function formatSlotLabel(summary: SlotSummary, rankName: (rank: number) => string): string {
  if (summary.empty) return 'Empty'
  if (summary.error) return `Damaged — ${summary.error}`
  const when = summary.savedAt ? new Date(summary.savedAt).toLocaleString() : 'unknown time'
  const rank = summary.rank !== undefined ? rankName(summary.rank) : '?'
  const year = summary.year ?? '?'
  const taler = summary.taler !== undefined ? `${Math.round(summary.taler).toLocaleString('en-US')} Taler` : ''
  const title = summary.name && summary.name.length > 0 ? summary.name : `Year ${year}`
  const detail = summary.name && summary.name.length > 0
    ? `Year ${year} · ${rank}${taler ? ` · ${taler}` : ''}`
    : `${rank}${taler ? ` · ${taler}` : ''}`
  return `${title} — ${detail} · ${when}`
}

function safeFileStem(name: string, year: number): string {
  const base = (name.trim() || `year-${year}`).toLowerCase()
  const cleaned = base.replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return cleaned || `year-${year}`
}

/** Download a slot (or any payload) as a portable `.json` file. */
export function downloadSaveFile(payload: SavePayload): void {
  const blob = new Blob([stringifySavePayload(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kaiser3-${safeFileStem(payload.name, payload.game.year)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function readSaveFile(file: File): Promise<SavePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') throw new Error('Could not read that file')
        resolve(parseSavePayload(reader.result))
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsText(file)
  })
}
