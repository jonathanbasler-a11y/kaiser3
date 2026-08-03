/** Stable per-player salt for planYear seeds — must NOT use id.length. */
export function playerIdSalt(playerId: string): number {
  let h = 2166136261
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function planningSeed(baseSeed: number, year: number, playerId: string): number {
  return baseSeed + year * 104729 + playerIdSalt(playerId)
}
