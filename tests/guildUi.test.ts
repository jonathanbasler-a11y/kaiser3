import { describe, it, expect } from 'vitest'
import { createStarterState } from '../src/engine/starter.ts'
import { nextGuildPetition } from '../src/engine/guilds.ts'
import { advanceYear } from '../src/engine/year.ts'
import { validateDecisions } from '../src/engine/decisions.ts'
import {
  defaultDraft,
  draftToDecisions
} from '../src/ui/decisions.ts'
import {
  guildResolutionReportLine,
  petitionQueuedReportLine,
  unansweredPetitionPreviewWarning,
  promotionCardBody,
  guildTypeLabel
} from '../src/ui/guildCopy.ts'
import { previewYear } from '../src/ui/preview.ts'
import { getPersonalities } from '../src/ai/personalities.ts'
import { getDifficultyPreset } from '../src/ai/difficulty.ts'

describe('guild petition UI wiring (21.10)', () => {
  it('omits guild Decision when unanswered — same as AI absence → engine lapse', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const draft = defaultDraft(state.players.human)
    expect(draft.guildAction).toBeNull()
    const decisions = draftToDecisions(draft)
    expect(decisions.some((d) => d.type === 'guild')).toBe(false)
    expect(validateDecisions(decisions).valid).toBe(true)
  })

  it('emits the same GuildDecision shape the AI uses for grant and refuse', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    for (const action of ['grant', 'refuse'] as const) {
      const draft = defaultDraft(state.players.human)
      draft.guildAction = action
      const decisions = draftToDecisions(draft)
      const guild = decisions.find((d) => d.type === 'guild')
      expect(guild).toEqual({ type: 'guild', action })
      expect(validateDecisions(decisions).valid).toBe(true)
    }
  })

  it('preview surfaces unanswered-petition warning copy and guild resolution fields', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const player = state.players.human
    player.rank = 0
    player.buildings.markets = 3
    player.taler = 20_000
    const petition = nextGuildPetition(player, state.year)
    expect(petition).not.toBeNull()
    player.pendingGuild = petition!

    const draft = defaultDraft(player)
    expect(draft.guildAction).toBeNull()

    const rivals = new Map()
    const difficulty = getDifficultyPreset('standard')
    const preview = previewYear(state, 'human', draft, rivals, difficulty)
    expect(preview).not.toBeNull()
    expect(preview!.guildResolution?.lapsed).toBe(true)
    expect(preview!.guildResolution?.granted).toBe(false)
    expect(unansweredPetitionPreviewWarning(petition!)).toContain(guildTypeLabel(petition!.specialization))
  })

  it('grant on the Decision sheet resolves through the real reducer', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const player = state.players.human
    player.rank = 0
    player.buildings.markets = 3
    player.taler = 20_000
    const petition = nextGuildPetition(player, state.year)!
    player.pendingGuild = petition

    const draft = defaultDraft(player)
    draft.guildAction = 'grant'
    const sheet = draftToDecisions(draft)

    const result = advanceYear(state, { human: sheet }, 42)
    const report = result.chronicle.playerReports.human
    expect(report.guildResolution?.granted).toBe(true)
    expect(result.state.players.human.guilds?.length).toBe(1)
    expect(result.state.players.human.pendingGuild).toBeUndefined()
  })

  it('formats chronicle lines from frozen 21.8 chronicle fields', () => {
    expect(petitionQueuedReportLine({
      kind: 'market',
      specialization: 'iron',
      queuedYear: 3
    })).toMatch(/Iron guild petitions/)

    expect(guildResolutionReportLine({
      kind: 'market',
      specialization: 'cloth',
      granted: true,
      lapsed: false,
      refusedForUnaffordable: false,
      charterFeePaid: 1500,
      unrestDelta: 0
    })).toMatch(/granted the Cloth guild/)

    expect(guildResolutionReportLine({
      kind: 'mill',
      specialization: 'salt',
      granted: false,
      lapsed: true,
      refusedForUnaffordable: false,
      charterFeePaid: 0,
      unrestDelta: 8
    })).toMatch(/unanswered and lapsed/)

    expect(promotionCardBody(1, 2)).toMatch(/Duke|lord of substance/i)
    expect(promotionCardBody(1, 2)).toMatch(/charter slots now: 2/i)
  })

  it('preview guildBonusIncome is present (0 when no guilds)', () => {
    const state = createStarterState([{ id: 'human', name: 'You' }])
    const personalities = getPersonalities()
    const rivals = new Map([['rival', personalities[0]]])
    // Single-player preview — empty rivals is fine; keep a personality map shape.
    rivals.clear()
    const preview = previewYear(
      state,
      'human',
      defaultDraft(state.players.human),
      rivals,
      getDifficultyPreset('standard')
    )
    expect(preview).not.toBeNull()
    expect(preview!.guildBonusIncome).toBe(0)
    expect(preview!.guildResolution).toBeUndefined()
  })
})
