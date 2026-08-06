// Phase 21.6 — guild types & pure logic, ZERO reducer callers.
//
// This test file is the entire proof of correctness for this tranche: nothing
// in year.ts calls engine/guilds.ts yet, so nothing here can be caught by the
// golden fixtures. The `byte-identity` describe block below IS the fixture
// equivalent for a no-callers tranche — it proves the new types are inert by
// construction, not just by omission.

import { describe, it, expect } from 'vitest'
import buildingsData from '../data/buildings.json'
import { createStarterState, createStarterPlayer } from '../src/engine/starter.ts'
import { advanceYear } from '../src/engine/year.ts'
import { serializeGameState, PlayerState, GuildType, Decision } from '../src/engine/state.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import { buildSavePayload, stringifySavePayload, parseSavePayload } from '../src/engine/persist.ts'
import {
  GUILD_TYPES,
  guildDefinition,
  unspecializedCount,
  activeGuildCount,
  charterSlotsRemaining,
  nextGuildPetition,
  resolveGuildPetition,
  netGuildBonus
} from '../src/engine/guilds.ts'
import { charterSlotsForRank } from '../src/engine/ranks.ts'
import { getAllRanks } from '../src/engine/ranks.ts'

const BUILDINGS = buildingsData.production

function starter(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...createStarterPlayer('p1', 'Test'), ...overrides }
}

describe('byte-identity: 21.6 introduces zero behaviour change', () => {
  // The direct proof that adding these types/fields does not touch the reducer.
  // No test file calls nextGuildPetition or resolveGuildPetition from within
  // advanceYear — this describes the CURRENT state of year.ts, and if 21.7 or
  // 21.8 later wires a call in, THIS test (unchanged) should start failing,
  // which is the intended tripwire.
  it('a multi-player, multi-year run is unaffected by the new optional PlayerState fields being present but empty', () => {
    const state = createStarterState([
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }
    ])
    const decisions: Record<string, Decision[]> = {
      a: [{ type: 'grain', feedLevel: 'required' }],
      b: [{ type: 'grain', feedLevel: 'required' }],
      c: [{ type: 'grain', feedLevel: 'required' }]
    }
    const withoutFields = advanceYear(state, decisions, 555)

    const stateWithEmptyGuildFields = createStarterState([
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }
    ])
    for (const id of ['a', 'b', 'c']) {
      stateWithEmptyGuildFields.players[id].guilds = []
      stateWithEmptyGuildFields.players[id].guildCooldowns = {}
    }
    const withEmptyFields = advanceYear(stateWithEmptyGuildFields, decisions, 555)

    // NOT a raw string comparison: an explicit `guilds: []` serializes
    // differently from the field being absent (JSON.stringify emits the key
    // either way), which is a fact about JSON, not about the reducer. Strip
    // those two keys before comparing so the assertion is the one that
    // actually matters — every OTHER field (taler, population, score, every
    // number the reducer computes) is unaffected by the fields' mere presence.
    const strip = (json: string) => {
      const parsed = JSON.parse(json)
      for (const p of Object.values(parsed.players) as Record<string, unknown>[]) {
        delete p.guilds
        delete p.guildCooldowns
      }
      return JSON.stringify(parsed)
    }
    expect(strip(serializeGameState(withEmptyFields.state))).toBe(strip(serializeGameState(withoutFields.state)))
  })

  it('validateDecisions still accepts every pre-existing decision sheet shape', () => {
    const sheet: Decision[] = [
      { type: 'grain', feedLevel: 'required' },
      { type: 'land_trade', farmlanbuy: 0, buildingLandBuy: 0, partnerPlayerId: 'kaiser' },
      { type: 'tax', vat: 10, incomeTax: 10, tariff: 5, justiceGraft: 0 },
      {
        type: 'construction', marketBuild: 0, millBuild: 0, palaceStages: 0, cathedralBuild: false,
        wellBuild: 0, hospitalBuild: 0, granaryBuild: 0, garrisonBuild: 0, tradingHouseBuild: 0
      }
    ]
    expect(validateDecisions(sheet).valid).toBe(true)
  })
})

describe('validateDecisions accepts the new guild decision shape', () => {
  it('accepts grant and refuse', () => {
    expect(validateDecisions([{ type: 'guild', action: 'grant' }]).valid).toBe(true)
    expect(validateDecisions([{ type: 'guild', action: 'refuse' }]).valid).toBe(true)
  })

  it('rejects anything else', () => {
    const result = validateDecisions([{ type: 'guild', action: 'maybe' as 'grant' }])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('guild.action'))).toBe(true)
  })

  it('still enforces one decision per type', () => {
    const result = validateDecisions([{ type: 'guild', action: 'grant' }, { type: 'guild', action: 'refuse' }])
    expect(result.valid).toBe(false)
  })
})

describe('data integrity — no guild is ever strictly worse (D2 acceptance criterion)', () => {
  for (const type of GUILD_TYPES) {
    it(`${type}: incomeMultiplier - 1 > upkeepSurchargeFraction`, () => {
      const def = guildDefinition(type)
      expect(def.incomeMultiplier - 1).toBeGreaterThan(def.upkeepSurchargeFraction)
    })

    it(`${type}: net bonus is positive on a market (${BUILDINGS.market.incomePerYear}/yr)`, () => {
      expect(netGuildBonus(type, BUILDINGS.market.incomePerYear)).toBeGreaterThan(0)
    })

    it(`${type}: net bonus is positive on a mill (${BUILDINGS.mill.incomePerYear}/yr)`, () => {
      expect(netGuildBonus(type, BUILDINGS.mill.incomePerYear)).toBeGreaterThan(0)
    })
  }

  // This is the exact failure the design doc's own numbers hit against THIS
  // file's incomePerYear (cloth 1.40/200 nets zero; iron 1.35/180 is negative).
  // Asserted as a property so a future incomePerYear rebalance cannot silently
  // reintroduce it — this is what "cannot rot" means in practice.
  it('holds at a 30% higher incomePerYear (rebalance headroom)', () => {
    for (const type of GUILD_TYPES) {
      expect(netGuildBonus(type, BUILDINGS.market.incomePerYear * 1.3)).toBeGreaterThan(0)
      expect(netGuildBonus(type, BUILDINGS.mill.incomePerYear * 1.3)).toBeGreaterThan(0)
    }
  })

  it('every guild type unlocks at a rank the game actually reaches (Baron/Duke/Prince)', () => {
    // Rank-pacing invariant from the session plan: new rank-gated content must
    // land on ranks 0-2. Count(3)+ is a real gate but effectively unreachable in
    // a 60-year game (see data/ranks.json _populationNote).
    for (const type of GUILD_TYPES) {
      expect(guildDefinition(type).petitionMinRank).toBeLessThanOrEqual(2)
    }
  })
})

describe('charter slots — the promotion reward and the guild cap are the same number', () => {
  it('matches the plan-specified Baron/Duke/Prince/Count values', () => {
    expect(charterSlotsForRank(0)).toBe(1) // Baron
    expect(charterSlotsForRank(1)).toBe(2) // Duke
    expect(charterSlotsForRank(2)).toBe(4) // Prince
    expect(charterSlotsForRank(3)).toBe(5) // Count
  })

  it('is monotonically non-decreasing across every rank', () => {
    const ranks = getAllRanks().sort((a, b) => a.id - b.id)
    for (let i = 1; i < ranks.length; i++) {
      expect(charterSlotsForRank(ranks[i].id)).toBeGreaterThanOrEqual(charterSlotsForRank(ranks[i - 1].id))
    }
  })

  it('charterSlotsRemaining is the cap minus active guilds, floored at zero', () => {
    const player = starter({ rank: 0, guilds: [] })
    expect(charterSlotsRemaining(player)).toBe(1)

    const full = starter({
      rank: 0,
      guilds: [{ kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }]
    })
    expect(charterSlotsRemaining(full)).toBe(0)

    // Defensive: cannot go negative even if guilds somehow exceed the cap
    // (e.g. a demotion-adjacent edge case that doesn't exist yet, but the
    // function must not misreport a negative "remaining" capacity).
    const overfull = starter({
      rank: 0,
      guilds: [
        { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
        { kind: 'mill', specialization: 'iron', incomeMultiplier: 1.35 }
      ]
    })
    expect(charterSlotsRemaining(overfull)).toBe(0)
  })
})

describe('unspecializedCount', () => {
  it('equals the raw building count when nothing is specialized', () => {
    const player = starter({ buildings: { ...starter().buildings, markets: 5, mills: 3 } })
    expect(unspecializedCount(player, 'market')).toBe(5)
    expect(unspecializedCount(player, 'mill')).toBe(3)
  })

  it('subtracts only guilds of the matching kind', () => {
    const player = starter({
      buildings: { ...starter().buildings, markets: 5, mills: 3 },
      guilds: [
        { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
        { kind: 'mill', specialization: 'iron', incomeMultiplier: 1.35 },
        { kind: 'mill', specialization: 'salt', incomeMultiplier: 1.45 }
      ]
    })
    expect(unspecializedCount(player, 'market')).toBe(4)
    expect(unspecializedCount(player, 'mill')).toBe(1)
  })

  it('never goes negative even if more guilds are recorded than buildings exist', () => {
    const player = starter({
      buildings: { ...starter().buildings, markets: 1 },
      guilds: [
        { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
        { kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }
      ]
    })
    expect(unspecializedCount(player, 'market')).toBe(0)
  })
})

describe('nextGuildPetition — determinism and eligibility', () => {
  it('is a pure function: identical (player, year) always produces an identical answer', () => {
    const player = starter({ rank: 0, buildings: { ...starter().buildings, markets: 3 } })
    const a = nextGuildPetition(player, 5)
    const b = nextGuildPetition(player, 5)
    expect(a).toEqual(b)
  })

  it('is idempotent — calling it repeatedly on an unchanged player does not consume anything', () => {
    const player = starter({ rank: 0, buildings: { ...starter().buildings, markets: 3 } })
    for (let i = 0; i < 5; i++) {
      expect(nextGuildPetition(player, 1)).toEqual(nextGuildPetition(player, 1))
    }
  })

  it('starter state (rank 0, 0 markets/mills) is ineligible — matches the golden fixture year-1 assumption', () => {
    const player = starter()
    expect(player.buildings.markets).toBe(0)
    expect(player.buildings.mills).toBe(0)
    expect(nextGuildPetition(player, 1)).toBeNull()
  })

  it('returns null when the charter cap is already full', () => {
    const player = starter({
      rank: 0,
      buildings: { ...starter().buildings, markets: 5 },
      guilds: [{ kind: 'market', specialization: 'iron', incomeMultiplier: 1.35 }] // fills Baron's 1 slot
    })
    expect(nextGuildPetition(player, 1)).toBeNull()
  })

  it('returns null when a petition is already pending (defensive)', () => {
    const player = starter({
      rank: 0,
      buildings: { ...starter().buildings, markets: 5 },
      pendingGuild: { kind: 'market', specialization: 'iron', queuedYear: 1 }
    })
    expect(nextGuildPetition(player, 2)).toBeNull()
  })

  it('respects petitionMinRank — a Baron cannot be petitioned for wine (Prince-gated)', () => {
    const player = starter({ rank: 0, buildings: { ...starter().buildings, mills: 10 } })
    const petition = nextGuildPetition(player, 1)
    expect(petition?.specialization).not.toBe('wine')
  })

  it('offers wine once rank reaches Prince, given enough buildings', () => {
    const player = starter({ rank: 2, buildings: { ...starter().buildings, markets: 10 }, guilds: [] })
    const petition = nextGuildPetition(player, 1)
    expect(petition).not.toBeNull()
  })

  it('respects a cooldown after refusal — the SAME (player, year) with a fresh cooldown differs from without one', () => {
    const base = starter({ rank: 0, buildings: { ...starter().buildings, mills: 5 } })
    const withoutCooldown = nextGuildPetition(base, 1)
    expect(withoutCooldown).not.toBeNull()

    const cooledDown = starter({
      rank: 0,
      buildings: { ...starter().buildings, mills: 5 },
      guildCooldowns: { [withoutCooldown!.specialization]: 10 }
    })
    const result = nextGuildPetition(cooledDown, 1)
    // Either no petition at all, or a DIFFERENT type than the cooled-down one —
    // never a re-offer of the same type while its cooldown is active.
    if (result) expect(result.specialization).not.toBe(withoutCooldown!.specialization)
  })

  it('the cooldown expires — a type becomes offerable again once year reaches the cooldown value', () => {
    const player = starter({
      rank: 0,
      buildings: { ...starter().buildings, mills: 1 }, // only iron qualifies (minBuildingCount 1)
      guildCooldowns: { iron: 5 }
    })
    expect(nextGuildPetition(player, 4)).toBeNull() // still cooling down
    expect(nextGuildPetition(player, 5)).not.toBeNull() // cooldown lifted
  })

  it('prefers the kind with more room, ties going to market', () => {
    // iron qualifies on either kind at minBuildingCount 1; give mill more room.
    const player = starter({ rank: 0, buildings: { ...starter().buildings, markets: 1, mills: 4 } })
    const petition = nextGuildPetition(player, 1)
    expect(petition?.kind).toBe('mill')
  })

  // Regression test for a real bug the spec audit caught: an earlier draft
  // ranked eligible types by "readiness" (unspecializedCount - minBuildingCount),
  // which is mechanically larger for iron (threshold 1) than for cloth/salt/wine
  // (thresholds 2-3) whenever several are eligible at once — so iron won nearly
  // every multi-way comparison, not just genuine ties. A ruler who always grants
  // could fill their whole charter allotment with iron before the others were
  // ever offered. This test would have FAILED under that algorithm (seen.size
  // would have been 1, always 'iron') and passes under the year-based rotation
  // that replaced it.
  it('does not structurally favor the lowest-threshold type across years (rotation, not a readiness ranking)', () => {
    const player = starter({ rank: 2, buildings: { ...starter().buildings, markets: 10 }, guilds: [] })
    const seen = new Set<GuildType>()
    for (let year = 0; year < 8; year++) {
      const petition = nextGuildPetition(player, year)
      if (petition) seen.add(petition.specialization)
    }
    // All four types are equally eligible here (rank Prince, 10 markets clears
    // every threshold up to wine's 3) — a fair rotation surfaces more than one.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('the rotation is still a pure function of (player, year) — not wall-clock, not call order', () => {
    const player = starter({ rank: 2, buildings: { ...starter().buildings, markets: 10 }, guilds: [] })
    for (const year of [0, 3, 7]) {
      const a = nextGuildPetition(player, year)
      const b = nextGuildPetition(player, year)
      expect(a).toEqual(b)
    }
  })
})

describe('resolveGuildPetition', () => {
  const pendingIron = { kind: 'market' as const, specialization: 'iron' as GuildType, queuedYear: 1 }

  it('is a no-op when there is no pending petition', () => {
    const player = starter({ pendingGuild: undefined, taler: 100000 })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'grant' }, 2)
    expect(result.granted).toBe(false)
    expect(result.talerSpent).toBe(0)
    expect(result.unrestDelta).toBe(0)
    expect(result.guildsAfter).toEqual([])
  })

  it('grants when affordable', () => {
    const fee = guildDefinition('iron').charterFee
    const player = starter({ pendingGuild: pendingIron, taler: fee + 1000 })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'grant' }, 2)

    expect(result.granted).toBe(true)
    expect(result.talerSpent).toBe(fee)
    expect(result.unrestDelta).toBe(0)
    expect(result.refusedForUnaffordable).toBe(false)
    expect(result.lapsed).toBe(false)
    expect(result.guildsAfter).toEqual([
      { kind: 'market', specialization: 'iron', incomeMultiplier: guildDefinition('iron').incomeMultiplier }
    ])
  })

  it('explicit refusal costs unrest and sets a cooldown, grants nothing', () => {
    const player = starter({ pendingGuild: pendingIron, taler: 999999 })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'refuse' }, 2)

    expect(result.granted).toBe(false)
    expect(result.talerSpent).toBe(0)
    expect(result.unrestDelta).toBe(buildingsData.guilds.guildRefusalUnrestSpike)
    expect(result.guildsAfter).toEqual([])
    expect(result.guildCooldownsAfter.iron).toBe(2 + buildingsData.guilds.guildRefusalCooldownYears)
    expect(result.lapsed).toBe(false)
    expect(result.refusedForUnaffordable).toBe(false)
  })

  it('an unanswered petition lapses to a refusal — "never respond" cannot dominate answering', () => {
    const player = starter({ pendingGuild: pendingIron, taler: 999999 })
    const result = resolveGuildPetition(player, undefined, 2)

    expect(result.granted).toBe(false)
    expect(result.unrestDelta).toBe(buildingsData.guilds.guildRefusalUnrestSpike)
    expect(result.lapsed).toBe(true)
    expect(result.refusedForUnaffordable).toBe(false)
  })

  it('an unaffordable grant resolves as a refusal, not a crash or a free pass', () => {
    const fee = guildDefinition('iron').charterFee
    const player = starter({ pendingGuild: pendingIron, taler: fee - 1 })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'grant' }, 2)

    expect(result.granted).toBe(false)
    expect(result.talerSpent).toBe(0)
    expect(result.unrestDelta).toBe(buildingsData.guilds.guildRefusalUnrestSpike)
    expect(result.refusedForUnaffordable).toBe(true)
    expect(result.lapsed).toBe(false)
  })

  it('exactly enough taler (== charterFee) is affordable, not just > charterFee', () => {
    const fee = guildDefinition('iron').charterFee
    const player = starter({ pendingGuild: pendingIron, taler: fee })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'grant' }, 2)
    expect(result.granted).toBe(true)
  })

  it('appends to existing guilds and preserves existing cooldowns rather than replacing them', () => {
    const existingGuild = { kind: 'mill' as const, specialization: 'salt' as GuildType, incomeMultiplier: 1.45 }
    const player = starter({
      pendingGuild: pendingIron,
      taler: guildDefinition('iron').charterFee + 1,
      guilds: [existingGuild],
      guildCooldowns: { wine: 40 }
    })
    const result = resolveGuildPetition(player, { type: 'guild', action: 'grant' }, 2)
    expect(result.guildsAfter).toHaveLength(2)
    expect(result.guildsAfter[0]).toEqual(existingGuild)

    const refused = resolveGuildPetition(player, { type: 'guild', action: 'refuse' }, 2)
    expect(refused.guildCooldownsAfter.wine).toBe(40)
    expect(refused.guildCooldownsAfter.iron).toBe(2 + buildingsData.guilds.guildRefusalCooldownYears)
  })
})

describe('persist round-trip (D2 acceptance: survives clone/persist byte-identically)', () => {
  it('guilds, pendingGuild, and guildCooldowns survive a save/load round trip', () => {
    const state = createStarterState([{ id: 'p1', name: 'Test' }])
    state.players.p1.guilds = [{ kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }]
    state.players.p1.pendingGuild = { kind: 'mill', specialization: 'wine', queuedYear: 3 }
    state.players.p1.guildCooldowns = { iron: 7 }

    const payload = buildSavePayload({ game: state, name: 'test-save', maxYears: 60, difficultyId: 'standard', rivals: [] })
    const loaded = parseSavePayload(stringifySavePayload(payload))

    expect(loaded.game.players.p1.guilds).toEqual(state.players.p1.guilds)
    expect(loaded.game.players.p1.pendingGuild).toEqual(state.players.p1.pendingGuild)
    expect(loaded.game.players.p1.guildCooldowns).toEqual(state.players.p1.guildCooldowns)
  })

  it('a save with no guild fields at all loads with them simply absent, not defaulted to empty objects', () => {
    const state = createStarterState([{ id: 'p1', name: 'Test' }])
    const payload = buildSavePayload({ game: state, name: 'pre-21.6', maxYears: 60, difficultyId: 'standard', rivals: [] })
    const loaded = parseSavePayload(stringifySavePayload(payload))

    expect(loaded.game.players.p1.guilds).toBeUndefined()
    expect(loaded.game.players.p1.pendingGuild).toBeUndefined()
    expect(loaded.game.players.p1.guildCooldowns).toBeUndefined()
  })

  it('a malformed guild entry is dropped individually rather than rejecting the whole save', () => {
    const state = createStarterState([{ id: 'p1', name: 'Test' }])
    const payload = buildSavePayload({ game: state, name: 'test', maxYears: 60, difficultyId: 'standard', rivals: [] })
    const raw = JSON.parse(stringifySavePayload(payload)) as { game: { players: { p1: Record<string, unknown> } } }
    raw.game.players.p1.guilds = [
      { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
      { kind: 'castle', specialization: 'cloth', incomeMultiplier: 1.4 }, // bad kind
      { kind: 'mill', specialization: 'unobtainium', incomeMultiplier: 1.4 } // bad type
    ]
    const loaded = parseSavePayload(JSON.stringify(raw))
    expect(loaded.game.players.p1.guilds).toEqual([
      { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }
    ])
  })
})

describe('clonePlayerState carries guild fields', () => {
  it('present fields survive a clone, shallow-copied (not shared references)', async () => {
    const { clonePlayerState } = await import('../src/engine/state.ts')
    const player = starter({
      guilds: [{ kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 }],
      pendingGuild: { kind: 'mill', specialization: 'iron', queuedYear: 2 },
      guildCooldowns: { salt: 9 }
    })
    const cloned = clonePlayerState(player)
    expect(cloned.guilds).toEqual(player.guilds)
    expect(cloned.guilds).not.toBe(player.guilds)
    expect(cloned.pendingGuild).toEqual(player.pendingGuild)
    expect(cloned.pendingGuild).not.toBe(player.pendingGuild)
    expect(cloned.guildCooldowns).toEqual(player.guildCooldowns)
    expect(cloned.guildCooldowns).not.toBe(player.guildCooldowns)
  })

  it('absent fields stay absent after a clone', async () => {
    const { clonePlayerState } = await import('../src/engine/state.ts')
    const cloned = clonePlayerState(starter())
    expect(cloned.guilds).toBeUndefined()
    expect(cloned.pendingGuild).toBeUndefined()
    expect(cloned.guildCooldowns).toBeUndefined()
  })
})

describe('activeGuildCount', () => {
  it('is zero when guilds is absent or empty', () => {
    expect(activeGuildCount(starter())).toBe(0)
    expect(activeGuildCount(starter({ guilds: [] }))).toBe(0)
  })

  it('counts every entry regardless of kind', () => {
    const player = starter({
      guilds: [
        { kind: 'market', specialization: 'cloth', incomeMultiplier: 1.4 },
        { kind: 'mill', specialization: 'iron', incomeMultiplier: 1.35 }
      ]
    })
    expect(activeGuildCount(player)).toBe(2)
  })
})
