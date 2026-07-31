// Weather → banner color mapping. Kept as data so it stays in sync with
// data/economy.json's weatherBands by id, and so Phase 10's art pass can replace
// the banner drawing without touching this table.

export interface Tone { from: string; to: string }

export const WEATHER_TONES: Record<string, Tone> = {
  drought: { from: '#5a3a1e', to: '#8a5a2a' },
  poor: { from: '#4a3a24', to: '#6a5230' },
  lean: { from: '#3e4a2a', to: '#5c6b3e' },
  average: { from: '#3a5a3a', to: '#5a7a4a' },
  good: { from: '#2f6a4a', to: '#4a8a5f' },
  bountiful: { from: '#2a6a6a', to: '#3f8a8a' },
  glut: { from: '#1f5a6a', to: '#3a8aa0' }
}

export const DEFAULT_TONE: Tone = { from: '#3a2c1d', to: '#4a3826' }
