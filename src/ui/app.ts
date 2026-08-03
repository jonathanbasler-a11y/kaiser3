// App state machine: setup -> game (decisions) -> year report -> game (loop) -> game over.
// No framework — a module-level state object and a render() that rebuilds the
// active screen from scratch on every transition. The game only re-renders on
// discrete player actions (never continuously), so this is plenty fast.

import buildingsData from '../../data/buildings.json'
import economyData from '../../data/economy.json'
import eventsData from '../../data/events.json'
import { GameState, Decision, Chronicle, PlayerState, EspionageMode, PlayerChronicle, GrainDecision } from '../engine/state.ts'
import { eventLossMagnitudeText, calculateEventProbability, getEventCatalog } from '../engine/events/events.ts'
import { createStarterState, applyStartingMultiplier } from '../engine/starter.ts'
import { advanceYear } from '../engine/year.ts'
import { getRankName, isFeatureUnlocked, getNextRank, groupProgress, getAllRanks, getTopRank, RankRequirement } from '../engine/ranks.ts'
import { warStrength, warWinProbability, militaryMultiplier, isTruceActive, truceExpiryYear } from '../engine/war.ts'
import { medievalRivalName } from '../engine/gameLoop.ts'
import { strikeSuccessProbability } from '../engine/espionage.ts'
import { totalLand } from '../engine/land.ts'
import { getPersonalities, Personality } from '../ai/personalities.ts'
import { getDifficultyPresets, getDifficultyPreset, DEFAULT_DIFFICULTY_ID, DifficultyPreset } from '../ai/difficulty.ts'
import { planYear } from '../ai/planner.ts'
import { planningSeed } from '../ai/planningSeed.ts'
import { compareStanding } from '../ai/sim.ts'
import { annualGrainRequirement, storageCapacity, grainBuybackPrice, laborGatedFarmland, resolveFeeding } from '../engine/economy.ts'
import { el, clear, stepper, sliderField, segmented, statTile, tooltip } from './dom.ts'
import { DecisionDraft, defaultDraft, draftToDecisions, rivalOptions, affordableHectares, maxSellableGrain, maxAffordableGrainBuy, yearsOfFoodLabel, maxNewHires } from './decisions.ts'
import { previewYear, warSnapshotDraft, YearPreview } from './preview.ts'
import {
  feedStockFromChronicle,
  roundedDelta,
  roundedLandSplit,
  roundedStrength,
  roundedSurplus,
  roundedBreakdown
} from './displayCoherence.ts'
import { tone, helpToneClass, GRAIN_YEARS_TONE, UNREST_TONE, WAR_ODDS_TONE, IDLE_LAND_SHARE_TONE, RISK_PROB_TONE } from './statusTone.ts'
import { drawBanner } from './render.ts'
import { spriteImg } from './spriteLoader.ts'
import { SavePayload } from '../engine/persist.ts'
import {
  clearSlot,
  downloadSaveFile,
  formatSlotLabel,
  listSlotSummaries,
  readSaveFile,
  readSlot,
  writeSlot,
  writeSlotPayload
} from './saves.ts'

// EventId -> tileset.json eventIcons asset id. Flood/drought (F6) icons live
// under the same category; unmapped ids still render icon-less via spriteImg.
const EVENT_ICON_ID: Record<string, string> = {
  plague: 'plague_flag',
  fire: 'fire_smoke',
  famine: 'famine_sign',
  revolt: 'revolt_banner',
  banditry: 'bandit_skull',
  flood: 'flood_wave',
  drought: 'drought_sun'
}

// Full-screen year-report splash (tileset eventScenes). Same keys as event.type.
const EVENT_SCENE_ID: Record<string, string> = {
  plague: 'plague',
  fire: 'fire',
  famine: 'famine',
  revolt: 'revolt',
  banditry: 'banditry',
  flood: 'flood',
  drought: 'drought'
}

const PALACE = buildingsData.prestige.palace
const PRODUCTION = buildingsData.production
const MITIGATION = buildingsData.mitigation
const COMMERCE = buildingsData.commerce
const HARVEST = economyData.harvest
const ESPIONAGE = economyData.espionage
const WARFARE = economyData.warfare

// "How much does what cost? — need descriptors" (bug report #9). Every build
// control's cost was previously shown nowhere — a player could only learn it
// by overspending and seeing how many the game actually built. `costSuffix`
// standardizes "cost, upkeep/income" formatting so every buildRow label says
// the same thing the same way.
function costSuffix(cost: number, opts: { upkeep?: number; income?: number } = {}): string {
  const parts = [`${cost.toLocaleString('en-US')} Taler`]
  if (opts.income) parts.push(`${opts.income.toLocaleString('en-US')}/yr income`)
  if (opts.upkeep) parts.push(`${opts.upkeep.toLocaleString('en-US')}/yr upkeep`)
  return parts.join(', ')
}

// rank id (0-7, data/ranks.json Baron -> Kaiser) -> crests asset id (data/tileset.json).
const RANK_CREST_ID = ['baron', 'duke', 'prince', 'count', 'margrave', 'archbishop', 'king', 'kaiser']


const HUMAN_ID = 'human'

type Tab = 'overview' | 'grain' | 'land' | 'tax' | 'build' | 'spy' | 'war'

interface EventCard {
  kind: 'negative' | 'positive'
  sceneId: string | null
  title: string
  body: string
  magnitude: string
  rewardType?: string
}

interface Session {
  state: GameState
  rivals: Map<string, Personality>
  maxYears: number
  difficulty: DifficultyPreset
  draft: DecisionDraft
  activeTab: Tab
  yearReport: {
    entries: HTMLElement[]
    outcome: Outcome | null
    eventCards: EventCard[]
    cardIndex: number
  } | null
}

type Outcome =
  | { kind: 'victory'; winnerId: string }
  | { kind: 'collapse' }
  | { kind: 'timeout' }

let session: Session | null = null
let root: HTMLElement

// Phase 18B: live spend/outcome preview. Phase B specified debounce after the
// last draft edit (150–250ms); an earlier ship used a 5Hz setInterval poll that
// re-ran cloneGameState + advanceYear even while the player sat idle reading a
// tab. Debounce + a Proxy on the draft object catches every mutation (including
// stepper onChange that deliberately skips renderGame) without hooking each
// control by hand. Rival planYear stays cached by state identity in preview.ts.
const PREVIEW_DEBOUNCE_MS = 200
let previewDebounceId: ReturnType<typeof setTimeout> | null = null
let previewPanelEl: HTMLElement | null = null

function clearPreviewSchedule(): void {
  if (previewDebounceId !== null) {
    clearTimeout(previewDebounceId)
    previewDebounceId = null
  }
}

function refreshPreviewNow(): void {
  if (!session || !previewPanelEl) return
  const preview = previewYear(session.state, HUMAN_ID, session.draft, session.rivals, session.difficulty)
  updatePreviewPanel(previewPanelEl, preview)
}

function schedulePreviewRefresh(): void {
  clearPreviewSchedule()
  previewDebounceId = setTimeout(() => {
    previewDebounceId = null
    refreshPreviewNow()
  }, PREVIEW_DEBOUNCE_MS)
}

// Any field write on the draft (steppers, sliders, war-target buttons, etc.)
// schedules a preview recompute. Array/object fields are replaced wholesale in
// this UI, so a property-set trap is enough — no deep Proxy needed.
function trackDraft(draft: DecisionDraft): DecisionDraft {
  return new Proxy(draft, {
    set(target, prop, value) {
      const result = Reflect.set(target, prop, value)
      schedulePreviewRefresh()
      return result
    }
  })
}

export function mount(container: HTMLElement): void {
  root = container
  mountBugReport()
  renderSetup()
}

// ---------------------------------------------------------------------------
// Bug report — files a GitHub issue via /api/bug-report. Lives outside
// `root` (appended to document.body) since renderGame()/renderSetup() wipe
// root wholesale on every transition; the report button must survive that.
// ---------------------------------------------------------------------------

function mountBugReport(): void {
  const overlay = el('div', { class: 'modal-overlay hidden' })
  const statusEl = el('p', { class: 'help-text' })
  const summaryInput = el('input', { type: 'text', placeholder: 'What went wrong? (required)', maxLength: 200 })
  const detailsInput = el('textarea', { placeholder: 'Steps to reproduce, what you expected, anything else (optional)' })
  const submitBtn = el('button', { class: 'primary full', textContent: 'Send report' })
  const cancelBtn = el('button', { class: 'full', textContent: 'Cancel' })

  const closeModal = () => {
    overlay.classList.add('hidden')
    summaryInput.value = ''
    detailsInput.value = ''
    statusEl.textContent = ''
  }

  cancelBtn.addEventListener('click', closeModal)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

  submitBtn.addEventListener('click', () => {
    const summary = summaryInput.value.trim()
    if (!summary) {
      statusEl.textContent = 'Please describe the problem first.'
      return
    }
    submitBtn.setAttribute('disabled', 'true')
    statusEl.textContent = 'Sending…'

    const player = session?.state.players[HUMAN_ID]
    fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        details: detailsInput.value.trim(),
        tab: session?.activeTab,
        year: session?.state.year,
        rank: player ? getRankName(player.rank) : undefined,
        userAgent: navigator.userAgent
      })
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
        return res.json() as Promise<{ number: number }>
      })
      .then((data) => {
        statusEl.textContent = `Thanks — filed as issue #${data.number}.`
        summaryInput.value = ''
        detailsInput.value = ''
        setTimeout(closeModal, 1800)
      })
      .catch((err: Error) => {
        statusEl.textContent = `Could not send: ${err.message}`
      })
      .finally(() => submitBtn.removeAttribute('disabled'))
  })

  overlay.appendChild(
    el('div', { class: 'modal-sheet' },
      el('h2', {}, 'Report a bug'),
      summaryInput,
      detailsInput,
      statusEl,
      el('div', { class: 'row' }, submitBtn, cancelBtn)
    )
  )

  const fab = el('button', { class: 'bug-report-fab', textContent: '🐞 Report bug' })
  fab.addEventListener('click', () => overlay.classList.remove('hidden'))

  document.body.appendChild(fab)
  document.body.appendChild(overlay)
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function renderSetup(): void {
  clearPreviewSchedule()
  previewPanelEl = null
  clear(root)
  const personalities = getPersonalities()
  const difficulties = getDifficultyPresets()

  let opponentCount = 2
  let maxYears = 60
  let difficultyId = DEFAULT_DIFFICULTY_ID

  const difficultyHost = el('div', {})
  const difficultyDescription = el('p', { class: 'help-text' }, getDifficultyPreset(difficultyId).description)
  const rerenderDifficulty = () => {
    clear(difficultyHost as HTMLElement)
    difficultyHost.appendChild(segmented({
      options: difficulties.map((d) => ({ value: d.id, label: d.name })),
      value: difficultyId,
      onChange: (v) => {
        difficultyId = v
        difficultyDescription.textContent = getDifficultyPreset(v).description
      }
    }))
  }
  rerenderDifficulty()

  const rivalList = el('div', { class: 'card' },
    el('h2', {}, 'Rival rulers'),
    ...personalities.map((p) => el('div', { class: 'archetype-row' },
      spriteImg('portraits', p.id, p.name, 'portrait-lg'),
      el('p', { class: 'help-text' },
        el('strong', { style: 'color:var(--ink)' } as never, p.name), ' — ', p.description
      )
    ))
  )

  const opponentStepperHost = el('div', {})
  const yearsStepperHost = el('div', {})

  const rerenderSteppers = () => {
    clear(opponentStepperHost as HTMLElement)
    opponentStepperHost.appendChild(stepper({
      label: 'Number of rival rulers',
      value: opponentCount, min: 1, max: personalities.length, step: 1,
      onChange: (v) => { opponentCount = v },
      tooltip: 'Each rival is a fixed AI archetype (see the roster below) — more rivals means more competition for land and rank, but also more targets for war and espionage.'
    }))
    clear(yearsStepperHost as HTMLElement)
    yearsStepperHost.appendChild(stepper({
      label: 'Maximum years to play',
      value: maxYears, min: 20, max: 300, step: 20,
      onChange: (v) => { maxYears = v },
      tooltip: 'If nobody reaches Kaiser by this year, the game ends and whoever is furthest ahead (by rank, then progress, then wealth) wins.'
    }))
  }
  rerenderSteppers()

  const startBtn = el('button', { class: 'primary full', textContent: 'Begin Your Reign' })
  startBtn.addEventListener('click', () => startGame(opponentCount, maxYears, difficultyId))

  root.append(
    el('div', { class: 'screen' },
      el('h1', {}, 'Kaiser 3'),
      el('p', { class: 'subtitle' }, 'Rule a principality. Outlast your rivals. Be crowned Kaiser.'),
      el('div', { class: 'card' }, opponentStepperHost, yearsStepperHost,
        el('h3', {}, 'Difficulty'), difficultyHost, difficultyDescription),
      renderSaveSlotsCard({ mode: 'load' }),
      rivalList,
      el('div', { class: 'sticky-footer' }, startBtn)
    )
  )
}

function startGame(opponentCount: number, maxYears: number, difficultyId: string): void {
  const personalities = getPersonalities()
  const difficulty = getDifficultyPreset(difficultyId)
  const rivalIds = Array.from({ length: opponentCount }, (_, i) => `rival${i + 1}`)
  const rivals = new Map<string, Personality>()
  rivalIds.forEach((id, i) => rivals.set(id, personalities[i % personalities.length]))

  const playerIds = [
    { id: HUMAN_ID, name: 'You' },
    ...rivalIds.map((id, i) => {
      const personality = rivals.get(id)!
      // Proper name + archetype epithet so the personality tell stays readable.
      const epithet = personality.name.replace(/^The\s+/i, 'the ')
      return { id, name: `${medievalRivalName(i)}, ${epithet}` }
    })
  ]
  const state = createStarterState(playerIds)

  // Difficulty's starting asymmetry applies to rivals only — the human always
  // starts from the research doc's fixed baseline (see starter.ts's own
  // comment on applyStartingMultiplier).
  for (const rivalId of rivalIds) {
    state.players[rivalId] = applyStartingMultiplier(state.players[rivalId], difficulty.rivalStartingMultiplier)
  }

  session = {
    state,
    rivals,
    maxYears,
    difficulty,
    draft: trackDraft(defaultDraft(state.players[HUMAN_ID])),
    activeTab: 'overview',
    yearReport: null
  }
  renderGame()
}

function resumeFromSave(payload: SavePayload): void {
  const personalities = getPersonalities()
  const byId = new Map(personalities.map((p) => [p.id, p]))
  const rivals = new Map<string, Personality>()
  for (const entry of payload.rivals) {
    const personality = byId.get(entry.personalityId)
    if (!personality) {
      throw new Error(`Save names unknown personality "${entry.personalityId}"`)
    }
    rivals.set(entry.playerId, personality)
  }
  if (!payload.game.players[HUMAN_ID]) {
    throw new Error('Save has no human player')
  }

  session = {
    state: payload.game,
    rivals,
    maxYears: payload.maxYears,
    difficulty: getDifficultyPreset(payload.difficultyId),
    draft: trackDraft(defaultDraft(payload.game.players[HUMAN_ID])),
    activeTab: 'overview',
    yearReport: null
  }
  renderGame()
}

function currentSaveInput(name: string): {
  game: GameState
  maxYears: number
  difficultyId: string
  rivals: Array<{ playerId: string; personalityId: string }>
  name: string
} {
  if (!session) throw new Error('No active session to save')
  return {
    game: session.state,
    maxYears: session.maxYears,
    difficultyId: session.difficulty.id,
    rivals: [...session.rivals.entries()].map(([playerId, personality]) => ({
      playerId,
      personalityId: personality.id
    })),
    name
  }
}

function renderSaveSlotsCard(opts: { mode: 'load' | 'save' }): HTMLElement {
  const host = el('div', { class: 'card save-slots' })
  const status = el('p', { class: 'help-text' })
  const nameInput = el('input', {
    type: 'text',
    class: 'save-name-input',
    placeholder: 'Save name (optional)',
    maxLength: 48
  } as never) as HTMLInputElement

  const rerender = () => {
    const typedName = nameInput.value
    clear(host)
    host.appendChild(el('h2', {}, opts.mode === 'load' ? 'Continue a reign' : 'Save to a slot'))
    host.appendChild(el('p', { class: 'help-text' },
      opts.mode === 'load'
        ? 'Three local slots on this device. Export a .json file to move a reign to another phone or computer; Import puts it into a slot here.'
        : 'Name the save, then pick a slot. Export from the title screen later to carry it across devices.'
    ))

    if (opts.mode === 'save') {
      nameInput.value = typedName
      host.appendChild(el('label', { class: 'save-name-label' }, 'Save name', nameInput))
    }

    for (const summary of listSlotSummaries(HUMAN_ID)) {
      const label = formatSlotLabel(summary, getRankName)
      const row = el('div', { class: 'save-slot-row' },
        el('div', { class: 'save-slot-meta' },
          el('strong', {}, `Slot ${summary.index + 1}`),
          el('span', { class: 'help-text' }, label)
        )
      )
      const actions = el('div', { class: 'save-slot-actions' })

      if (opts.mode === 'load') {
        const loadBtn = el('button', { textContent: summary.empty || summary.error ? 'Empty' : 'Load' })
        if (summary.empty || summary.error) loadBtn.setAttribute('disabled', 'true')
        loadBtn.addEventListener('click', () => {
          try {
            const payload = readSlot(summary.index)
            if (!payload) {
              status.textContent = 'That slot is empty.'
              return
            }
            resumeFromSave(payload)
          } catch (err) {
            status.textContent = `Could not load: ${(err as Error).message}`
          }
        })
        actions.appendChild(loadBtn)
        if (!summary.empty && !summary.error) {
          const exportBtn = el('button', { textContent: 'Export' })
          exportBtn.addEventListener('click', () => {
            try {
              const payload = readSlot(summary.index)
              if (!payload) return
              downloadSaveFile(payload)
              status.textContent = `Exported slot ${summary.index + 1}.`
            } catch (err) {
              status.textContent = (err as Error).message
            }
          })
          actions.appendChild(exportBtn)
          const delBtn = el('button', { textContent: 'Delete' })
          delBtn.addEventListener('click', () => {
            clearSlot(summary.index)
            status.textContent = `Slot ${summary.index + 1} cleared.`
            rerender()
          })
          actions.appendChild(delBtn)
        }
      } else {
        const saveBtn = el('button', { class: 'primary', textContent: summary.empty ? 'Save here' : 'Overwrite' })
        saveBtn.addEventListener('click', () => {
          try {
            const payload = writeSlot(summary.index, currentSaveInput(nameInput.value))
            status.textContent = payload.name
              ? `Saved “${payload.name}” to slot ${summary.index + 1}.`
              : `Saved to slot ${summary.index + 1}.`
            rerender()
          } catch (err) {
            status.textContent = (err as Error).message
          }
        })
        actions.appendChild(saveBtn)
      }

      row.appendChild(actions)
      host.appendChild(row)
    }

    if (opts.mode === 'load') {
      const importRow = el('div', { class: 'save-import-row' })
      const fileInput = el('input', {
        type: 'file',
        accept: 'application/json,.json',
        class: 'hidden-file-input'
      } as never) as HTMLInputElement
      const importBtn = el('button', { class: 'full', textContent: 'Import save file…' })
      importBtn.addEventListener('click', () => fileInput.click())
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        fileInput.value = ''
        if (!file) return
        void readSaveFile(file)
          .then((payload) => {
            const empty = listSlotSummaries(HUMAN_ID).find((s) => s.empty)
            const target = empty?.index ?? 0
            const overwriting = !empty
            if (overwriting && !window.confirm(`All slots are full. Overwrite slot ${target + 1}?`)) return
            writeSlotPayload(target, payload)
            status.textContent = payload.name
              ? `Imported “${payload.name}” into slot ${target + 1}.`
              : `Imported into slot ${target + 1}.`
            rerender()
          })
          .catch((err: Error) => {
            status.textContent = `Import failed: ${err.message}`
          })
      })
      importRow.append(importBtn, fileInput)
      host.appendChild(importRow)
    }

    host.appendChild(status)
  }

  rerender()
  return host
}

function openSaveModal(): void {
  const overlay = el('div', { class: 'modal-overlay' })
  const close = () => overlay.remove()
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  const sheet = el('div', { class: 'modal-sheet' },
    renderSaveSlotsCard({ mode: 'save' }),
    el('button', { class: 'full', textContent: 'Close' })
  )
  sheet.lastChild!.addEventListener('click', close)
  overlay.appendChild(sheet)
  document.body.appendChild(overlay)
}

// ---------------------------------------------------------------------------
// Game screen (decisions)
// ---------------------------------------------------------------------------

function renderGame(): void {
  if (!session) return
  clearPreviewSchedule()
  clear(root)
  const { state } = session
  const player = state.players[HUMAN_ID]

  const banner = el('canvas', { id: 'banner' })

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'overview', label: 'Realm', icon: 'people' },
    { id: 'grain', label: 'Grain', icon: 'grain' },
    { id: 'land', label: 'Land', icon: 'land' },
    { id: 'tax', label: 'Tax', icon: 'taler' },
    { id: 'build', label: 'Build', icon: 'buildings' },
    { id: 'spy', label: 'Spies', icon: 'spy' },
    { id: 'war', label: 'War', icon: 'army' }
  ]
  const tabbar = el('div', { class: 'tabbar' })
  const content = el('div', { class: 'card' })

  const renderTab = () => {
    clear(content)
    for (const b of Array.from(tabbar.children)) b.classList.remove('active')
    const activeBtn = tabbar.querySelector(`[data-tab="${session!.activeTab}"]`)
    activeBtn?.classList.add('active')
    content.appendChild(renderTabContent(session!.activeTab))
  }

  for (const tab of tabs) {
    const btn = el('button', { class: 'tab-btn', type: 'button' })
    btn.dataset.tab = tab.id
    btn.append(
      spriteImg('uiIcons', tab.icon, tab.label, 'tab-icon'),
      el('span', { class: 'tab-label' }, tab.label)
    )
    btn.addEventListener('click', () => { session!.activeTab = tab.id; renderTab() })
    tabbar.appendChild(btn)
  }

  const endYearBtn = el('button', { class: 'primary full', textContent: `End Year ${state.year + 1}` })
  endYearBtn.addEventListener('click', () => runYear())
  const saveBtn = el('button', { class: 'full', textContent: 'Save game' })
  saveBtn.addEventListener('click', () => openSaveModal())
  const menuBtn = el('button', { class: 'full', textContent: 'Main menu' })
  menuBtn.addEventListener('click', () => {
    // Session stays in memory until a new game/load replaces it; leaving without
    // saving is intentional — the three slots are the durable store.
    session = null
    renderSetup()
  })

  // Phase 18B: live spend/outcome preview — immediate paint on render, then
  // debounced refreshes only when the draft mutates (see trackDraft).
  const previewPanel = el('div', { class: 'preview-panel' })
  previewPanelEl = previewPanel

  root.append(
    el('div', { class: 'screen' },
      banner,
      el('h1', { class: 'row' }, spriteImg('crests', RANK_CREST_ID[player.rank] ?? 'baron', getRankName(player.rank), 'crest-sm'), `${getRankName(player.rank)} of the Realm`),
      statGrid(player, state),
      tabbar,
      content,
      el('div', { class: 'sticky-footer' }, previewPanel, saveBtn, endYearBtn, menuBtn)
    )
  )

  drawBanner(banner, undefined, getRankName(player.rank))
  renderTab()

  clearPreviewSchedule()
  refreshPreviewNow()
}

function updatePreviewPanel(panel: HTMLElement, preview: YearPreview | null): void {
  clear(panel)
  if (!preview) return

  const taler = roundedDelta(preview.talerBefore, preview.talerAfter)
  const pop = roundedDelta(preview.populationBefore, preview.populationAfter)
  const incomeBreakdown = roundedBreakdown([
    { label: 'Tax', value: preview.taxIncome },
    { label: 'Tariffs', value: preview.tariffIncome },
    { label: 'Graft', value: preview.tributeIncome },
    { label: 'Markets', value: preview.marketIncome },
    { label: 'Mills', value: preview.millIncome },
    { label: 'Trading houses', value: preview.tradingHouseIncome },
    { label: 'Grain trade', value: preview.grainTradeIncome },
    { label: 'Upkeep', value: -preview.upkeepCost }
  ].filter((p) => Math.abs(p.value) >= 0.5))
  const popParts = [
    preview.births > 0 ? `+${Math.round(preview.births)} born` : null,
    preview.deaths > 0 ? `−${Math.round(preview.deaths)} died` : null,
    preview.immigration > 0 ? `+${Math.round(preview.immigration)} in` : null,
    preview.emigration > 0 ? `−${Math.round(preview.emigration)} out` : null,
    preview.eventPopulationLoss > 0 ? `−${Math.round(preview.eventPopulationLoss)} events` : null
  ].filter(Boolean).join(', ')

  const talerTip = el('div', {},
    ...incomeBreakdown.parts.map((p) =>
      el('div', { class: 'row between' },
        el('span', {}, p.label),
        el('span', {}, `${p.value >= 0 ? '+' : ''}${p.value}`)
      )
    ),
    el('p', { class: 'help-text' }, `Operating net ${incomeBreakdown.total >= 0 ? '+' : ''}${incomeBreakdown.total} (excludes land/builds/war/events)`)
  )
  const popTip = popParts || 'No population movement this year.'

  panel.appendChild(el('p', { class: 'help-text preview-line' },
    'If you end the year now: ',
    el('span', { class: taler.delta >= 0 ? 'good' : 'bad' }, `Taler ${taler.delta >= 0 ? '+' : ''}${taler.delta}`),
    tooltip(talerTip),
    ' · ',
    el('span', { class: pop.delta >= 0 ? 'good' : 'bad' }, `Population ${pop.delta >= 0 ? '+' : ''}${pop.delta}`),
    tooltip(popTip),
    preview.rankPromoted ? ' · Promotion!' : ''
  ))
  for (const shortfall of preview.shortfalls) {
    panel.appendChild(el('p', { class: 'help-text bad preview-line' }, shortfall))
  }
}

function statGrid(player: PlayerState, _state: GameState): HTMLElement {
  const grainYears = Number(yearsOfFoodLabel(player))
  const grainTone = tone(grainYears, GRAIN_YEARS_TONE)
  const unrestTone = tone(player.population.unrest, UNREST_TONE)
  const weariness = player.warWeariness ?? 0
  const wearinessUnrest = weariness * WARFARE.wearinessUnrestMultiplier
  const unrestLabel = weariness > 0
    ? `${player.population.unrest.toFixed(0)}/100 (weariness +${wearinessUnrest.toFixed(1)}/yr)`
    : `${player.population.unrest.toFixed(0)}/100`

  return el('div', { class: 'stat-grid' },
    statTile('Taler', player.taler.toFixed(0), undefined, 'Treasury after last year. End-year preview breaks down the next delta.'),
    statTile('Population', player.population.peasants.toFixed(0), undefined, 'Peasants. Plague severity rises with size — see hospital on Build.'),
    statTile('Grain', `${player.grainStock.toFixed(0)} (${yearsOfFoodLabel(player)}y)`, grainTone),
    statTile('Unrest', unrestLabel, unrestTone),
    statTile('Land', `${totalLand(player.land).toFixed(0)} ha`),
    statTile('Palace', `${player.buildings.palace}/${PALACE.stages}${player.buildings.cathedral ? ' + Cathedral' : ''}`),
  )
}

function renderTabContent(tab: Tab): HTMLElement {
  const { state, draft } = session!
  const player = state.players[HUMAN_ID]

  switch (tab) {
    case 'overview':
      return renderOverviewTab()
    case 'grain':
      return renderGrainTab(player, state)
    case 'land':
      return renderLandTab(player, state)
    case 'tax':
      return renderTaxTab(draft)
    case 'build':
      return renderBuildTab(player, draft)
    case 'spy':
      return renderSpyTab(player, state, draft)
    case 'war':
      return renderWarTab(state, draft)
  }
}

// Labels a D2 requirement group (docs/d2-rank-gate-design.md) by which fields
// it carries — there is no name in the data itself, only the shape.
function pathLabel(req: RankRequirement): string {
  if (req.tradingHousesMin !== undefined) return 'Commerce'
  if (req.palaceStages !== undefined || req.cathedral === true) return 'Prestige'
  return 'Land & Population'
}

interface ReqTile {
  icon: string
  label: string
  ok: boolean
  /** "OK" or the remaining amount / shortfall text shown in red. */
  valueText: string
}

// Kaiser-II-style checklist: green OK vs red remaining amount per hard gate.
function requirementTiles(req: RankRequirement, player: PlayerState): ReqTile[] {
  const tiles: ReqTile[] = []

  const wealthOk = player.taler >= req.wealthMin
  tiles.push({
    icon: 'req_wealth',
    label: 'Taler',
    ok: wealthOk,
    valueText: wealthOk ? 'OK' : Math.ceil(req.wealthMin - player.taler).toLocaleString('en-US')
  })

  const popOk = player.population.peasants >= req.populationMin
  tiles.push({
    icon: 'req_population',
    label: 'People',
    ok: popOk,
    valueText: popOk ? 'OK' : Math.ceil(req.populationMin - player.population.peasants).toLocaleString('en-US')
  })

  if (req.palaceStages !== undefined) {
    const ok = player.buildings.palace >= req.palaceStages
    tiles.push({
      icon: 'req_palace',
      label: 'Palace',
      ok,
      valueText: ok ? 'OK' : `${player.buildings.palace}/${req.palaceStages}`
    })
  }
  if (req.cathedral === true) {
    const ok = player.buildings.cathedral >= 1
    tiles.push({
      icon: 'req_cathedral',
      label: 'Cathedral',
      ok,
      valueText: ok ? 'OK' : 'Need 1'
    })
  }
  if (req.tradingHousesMin !== undefined) {
    const ok = player.tradingHouses >= req.tradingHousesMin
    tiles.push({
      icon: 'req_trading_house',
      label: 'Trade houses',
      ok,
      valueText: ok ? 'OK' : `${player.tradingHouses}/${req.tradingHousesMin}`
    })
  }

  return tiles
}

function renderReqTile(tile: ReqTile): HTMLElement {
  return el('div', { class: `req-tile${tile.ok ? ' ok' : ' deficit'}` },
    spriteImg('uiIcons', tile.icon, tile.label, 'req-icon'),
    el('span', { class: 'req-tile-label' }, tile.label),
    el('span', { class: 'req-tile-value' }, tile.valueText)
  )
}

// Full Baron→Kaiser ladder — attained ranks highlighted (Kaiser II Rangleiter pattern).
function renderRankLadder(player: PlayerState): HTMLElement {
  return el('div', { class: 'card' },
    el('h2', {}, 'Rank ladder'),
    el('div', { class: 'rank-ladder' },
      ...getAllRanks().map((rank) => {
        const attained = player.rank >= rank.id
        const current = player.rank === rank.id
        return el('div', {
          class: `rank-ladder-cell${attained ? ' attained' : ''}${current ? ' current' : ''}`,
          title: rank.name
        } as never,
          spriteImg('crests', RANK_CREST_ID[rank.id] ?? 'baron', rank.name, 'crest-ladder'),
          el('span', { class: 'rank-ladder-name' }, rank.name)
        )
      })
    )
  )
}

// D2 paths toward the next rank with OK/deficit tiles (replaces prose-only hints).
function renderRankProgress(player: PlayerState): HTMLElement | null {
  const next = getNextRank(player.rank)
  if (!next) return el('p', { class: 'help-text' }, 'You hold the highest rank — Kaiser of the Holy Roman Empire.')

  const rows = next.requirements.map((req) => {
    const pct = Math.round(groupProgress(player, req) * 100)
    return { label: pathLabel(req), pct, tiles: requirementTiles(req, player) }
  })
  const leadPct = Math.max(...rows.map((r) => r.pct))

  return el('div', { class: 'card' },
    el('h2', {}, `Path to ${next.name}`),
    el('p', { class: 'help-text' }, 'Green OK = met. Red = still missing (amount or stages).'),
    ...rows.map((row) =>
      el('div', { class: `rank-progress-row${row.pct === leadPct ? ' leading' : ''}` },
        el('div', { class: 'rank-progress-label' }, el('span', {}, row.label), el('span', {}, `${row.pct}%`)),
        el('div', { class: 'progress-track' }, el('div', { class: 'progress-fill', style: `width:${row.pct}%` } as never)),
        el('div', { class: 'req-tile-grid' }, ...row.tiles.map(renderReqTile))
      )
    )
  )
}

function renderOverviewTab(): HTMLElement {
  const { state, rivals: rivalPersonalities, draft } = session!
  const player = state.players[HUMAN_ID]
  const rivals = rivalOptions(state, HUMAN_ID)
  return el('div', {},
    el('div', { class: 'scene-banner' },
      spriteImg('scenes', 'kingdom_overview', 'Your principality', 'scene-full')
    ),
    renderRankLadder(player),
    renderRankProgress(player),
    renderEventRiskPanel(player, draft),
    renderEventCatalogPanel(),
    el('h2', {}, 'Rival standings'),
    el('div', { class: 'rival-list' },
      ...rivals.map(({ id, name }) => {
        const p = state.players[id]
        const archetypeId = rivalPersonalities.get(id)?.id
        return el('div', { class: 'rival-row' },
          el('span', { class: 'rival-name' },
            archetypeId ? spriteImg('portraits', archetypeId, name, 'portrait-sm') : null,
            name
          ),
          el('span', { class: 'rival-rank' }, `${getRankName(p.rank)} · ${p.taler.toFixed(0)} Taler · ${p.population.peasants.toFixed(0)} pop`)
        )
      })
    ),
    el('p', { class: 'help-text' }, `Year ${state.year} of up to ${session!.maxYears} · ${session!.difficulty.name} difficulty. Corn: ${state.kaizerTradePrices.corn.toFixed(2)}/unit · Farmland: ${state.kaizerTradePrices.farmland.toFixed(0)}/ha`)
  )
}

/** Live per-event risk using the engine's calculateEventProbability (one oracle). */
function renderEventRiskPanel(player: PlayerState, draft: DecisionDraft): HTMLElement {
  const feeding = resolveFeeding(
    { type: 'grain', feedLevel: draft.feedLevel },
    player.population,
    player.grainStock
  )
  const ctx = { feedAdequacy: feeding.feedAdequacy }
  const rows = getEventCatalog().map((event) => {
    const p = calculateEventProbability(event, player, ctx)
    const pct = `${(p * 100).toFixed(0)}%`
    const mit = event.mitigation.building
    const owned = Number((player.buildings as unknown as Record<string, number>)[mit] ?? 0) > 0
    return el('div', { class: 'row between event-risk-row' },
      el('span', {}, event.name),
      el('span', { class: tone(p, RISK_PROB_TONE) ?? '' },
        `${pct}${owned ? '' : ` · needs ${mit}`}`)
    )
  })
  return el('div', { class: 'card' },
    el('h2', {}, 'This year\'s risks'),
    el('p', { class: 'help-text' },
      'Live odds from the same probability function the year uses. Feeding and buildings change them. Telegraphs appear when an event fires.'
    ),
    ...rows
  )
}

function renderEventCatalogPanel(): HTMLElement {
  const details = el('details', { class: 'event-catalog' },
    el('summary', {}, 'What can happen (event catalog)'),
    ...getEventCatalog().map((event) =>
      el('div', { class: 'event-catalog-entry' },
        el('strong', {}, event.name),
        el('p', { class: 'help-text' },
          `Driven by ${event.exposure.driver}. Mitigate with ${event.mitigation.building} `
          + `(risk −${Math.round(event.mitigation.probabilityReduction * 100)}%, `
          + `severity −${Math.round(event.mitigation.severityReduction * 100)}%).`
        ),
        el('p', { class: 'help-text' }, `Unmitigated: ${event.telegraph.unmitigated}`),
        el('p', { class: 'help-text' }, `Mitigated: ${event.telegraph.mitigated}`)
      )
    )
  )
  return el('div', { class: 'card' }, details)
}

// A6: projected next-year population — MUST match the sticky footer's
// "If you end the year now" population delta. That footer is previewYear()
// (real advanceYear on a clone). An earlier feed-only estimate disagreed
// with it: (1) slider edits didn't refresh the Grain-tab line, (2) it fed
// from pre-harvest stock while year.ts feeds after harvest, (3) it ignored
// events/trade/etc. that advanceYear applies. One source of truth.
function populationProjectionText(player: GameState['players'][string], draft: DecisionDraft): string {
  if (!session) {
    return `Projected population next year at this feed level: ${player.population.peasants.toFixed(0)} (currently ${player.population.peasants.toFixed(0)}).`
  }
  const preview = previewYear(session.state, HUMAN_ID, draft, session.rivals, session.difficulty)
  if (!preview) {
    return `Projected population next year at this feed level: ${player.population.peasants.toFixed(0)} (currently ${player.population.peasants.toFixed(0)}).`
  }
  const { before, after, delta } = roundedDelta(preview.populationBefore, preview.populationAfter)
  const deltaText = `${delta >= 0 ? '+' : ''}${delta}`
  const breakdown = populationBreakdownText(
    preview.births, preview.deaths, preview.immigration, preview.emigration, preview.eventPopulationLoss
  )
  return `Projected population next year at this feed level: ${after} (currently ${before}; ${deltaText}${breakdown ? ` — ${breakdown}` : ''}). Same full-year estimate as the footer — includes harvest, feeding, and events.`
}

// Bug report #28 ("Population growth — unclear where growth and shrinking is
// coming from — should be seen at end turn stats and during turn in
// forecast"): births/deaths/migration were already computed every year
// (PlayerChronicle) but only emigration ever reached the UI, and only above a
// threshold. This is the single source both the forecast above and the
// year-end report below draw from, so the two can't disagree.
//
// Phase 20.2: eventPopulationLoss is applied AFTER applyPopulationDynamics, so
// it is a fifth term — without it the breakdown silently fails to sum in a
// plague year.
function populationBreakdownText(
  births: number,
  deaths: number,
  immigration: number,
  emigration: number,
  eventPopulationLoss: number = 0
): string {
  const parts: string[] = []
  if (births > 0) parts.push(`+${births.toFixed(0)} born`)
  if (deaths > 0) parts.push(`−${deaths.toFixed(0)} died`)
  if (immigration > 0) parts.push(`+${immigration.toFixed(0)} immigrated`)
  if (emigration > 0) parts.push(`−${emigration.toFixed(0)} emigrated`)
  if (eventPopulationLoss > 0) parts.push(`−${eventPopulationLoss.toFixed(0)} to events`)
  return parts.join(', ')
}

/** War-tab display attacker from previewYear's post-spend military snapshot. */
function previewWarAttacker(player: PlayerState, preview: YearPreview | null): PlayerState {
  const attacker: PlayerState = {
    ...player,
    buildings: { ...player.buildings },
    population: { ...player.population }
  }
  if (!preview) return attacker

  attacker.guards = preview.guardsAfter
  attacker.buildings.garrison = preview.garrisonAfter
  attacker.trainingLevel = preview.trainingLevelAfter
  attacker.equipmentLevel = preview.equipmentLevelAfter
  attacker.population.peasants = preview.populationAfter
  attacker.taler = preview.talerAfter
  return attacker
}

function warOddsText(attacker: PlayerState, defender: PlayerState, hasAllyRequests: boolean): string {
  const attackerStrength = warStrength(attacker)
  const defenderStrength = warStrength(defender)
  const winProbability = warWinProbability(attackerStrength, defenderStrength)
  const yours = roundedStrength(attackerStrength, militaryMultiplier(attacker)).total
  const theirs = roundedStrength(defenderStrength, militaryMultiplier(defender)).total
  const toneNote = hasAllyRequests ? ' (before any requested allies join — joining only helps)' : ''
  return `Estimated win chance: ${Math.round(winProbability * 100)}%${toneNote} — your strength ${yours} vs. their ${theirs} (defending at ${WARFARE.defenderAdvantageMultiplier}x; includes this preview's post-spend army and year-end levy).`
}

function renderGrainTab(player: GameState['players'][string], state: GameState): HTMLElement {
  const draft = session!.draft
  const container = el('div', {},
    el('div', { class: 'scene-banner' },
      spriteImg('terrain', 'farmland_ripe', 'Harvest', 'scene-full')
    )
  )

  const demand = annualGrainRequirement(player.population)
  // Prefer the same harvest oracle as the footer (previewYear / advanceYear).
  const preview = previewYear(session!.state, HUMAN_ID, draft, session!.rivals, session!.difficulty)
  const available = preview
    ? feedStockFromChronicle(player.grainStock, preview.spoilage, preview.harvestYield, preview.grainOverflowLost)
    : player.grainStock
  const { demand: demandShown, available: availableShown, surplus: surplusShown } = roundedSurplus(demand, available)
  container.appendChild(el('div', { class: 'stat-grid' },
    statTile('Demand this year', `${demandShown}`),
    statTile(preview ? 'At feeding (after harvest)' : 'Barn stock (preview unavailable)', `${availableShown}`),
    statTile(surplusShown >= 0 ? 'Surplus vs demand' : 'Deficit vs demand', `${Math.abs(surplusShown)}`, surplusShown >= 0 ? 'good' : 'bad')
  ))
  const barnLine = `Barn now: ${player.grainStock.toFixed(0)} of ${storageCapacity(player.population, player.buildings.granary).toFixed(0)} capacity.`
  const helpText = preview
    ? `${barnLine} Harvest this preview: ${preview.harvestYield.toFixed(0)} (−${preview.spoilage.toFixed(0)} spoilage` +
      (preview.grainOverflowLost > 0 ? `, −${preview.grainOverflowLost.toFixed(0)} overflow` : '') +
      `). "At feeding" is stock after spoilage/harvest/cap — what Custom/Min/Max percentages apply to.`
    : `${barnLine} Year preview unavailable — "At feeding" shows barn stock only; feed percentages apply to this figure until preview loads.`
  container.appendChild(el('p', { class: 'help-text' }, helpText))
  const projectionLine = el('p', { class: 'help-text' }, populationProjectionText(player, draft))
  container.appendChild(projectionLine)

  container.appendChild(segmented<DecisionDraft['feedLevel']>({
    options: [
      { value: 'min', label: 'Min' },
      { value: 'required', label: 'Required' },
      { value: 'max', label: 'Max' },
      { value: 'custom', label: 'Custom' }
    ],
    value: draft.feedLevel,
    onChange: (v) => { draft.feedLevel = v; session!.activeTab = 'grain'; renderGame() },
    title: 'Feed level',
    tooltip: 'How much grain to give your people this year. Min / Max / Custom are fractions of your stock at feeding time (after harvest; Kaiser’s original dial: 20% / 80% / 20–80%). Required is exactly Demand.'
  }))

  if (draft.feedLevel === 'custom') {
    container.appendChild(sliderField({
      label: 'Feed percentage of stock', value: draft.customPercentage, min: economyData.feeding.customMinPercentage, max: economyData.feeding.customMaxPercentage,
      onChange: (v) => {
        draft.customPercentage = v
        projectionLine.textContent = populationProjectionText(player, draft)
        refreshPreviewNow()
      },
      tooltip: 'Share of stock at feeding time (after this year’s harvest) to hand out — not a percentage of Demand. Kaiser’s original dial.'
    }))
  }

  // Trade settles AFTER feeding (year.ts step 6) — max is leftover barn, not pre-harvest stock.
  const grainDecision: GrainDecision = {
    type: 'grain',
    feedLevel: draft.feedLevel,
    customPercentage: draft.customPercentage,
    sellGrain: 0,
    buyGrain: 0
  }
  const stockAfterFeeding = resolveFeeding(grainDecision, player.population, available).grainStockAfter
  const maxSell = maxSellableGrain(stockAfterFeeding)
  if (draft.sellGrain > maxSell) draft.sellGrain = maxSell
  container.appendChild(stepper({
    label: `Sell grain to the Kaiser (${state.kaizerTradePrices.corn.toFixed(2)}/unit; max after feeding ${maxSell})`,
    value: draft.sellGrain, min: 0, max: maxSell, step: 250,
    onChange: (v) => { draft.sellGrain = v },
    tooltip: 'Converts stored grain into Taler at the current price. Max is stock left after this year’s harvest and feeding — the same order the engine uses.'
  }))
  container.appendChild(stepper({
    label: `Buy grain from the Kaiser (${grainBuybackPrice(state.kaizerTradePrices.corn).toFixed(2)}/unit)`,
    value: draft.buyGrain, min: 0, max: maxAffordableGrainBuy(player, grainBuybackPrice(state.kaizerTradePrices.corn)), step: 100,
    onChange: (v) => { draft.buyGrain = v },
    tooltip: 'Buys grain at a markup over the sell price — useful to top up storage ahead of a feared shortfall, but expensive as a habit.'
  }))

  return container
}

function renderLandTab(player: GameState['players'][string], state: GameState): HTMLElement {
  const draft = session!.draft
  const maxFarmBuy = affordableHectares(player.taler, state.kaizerTradePrices.farmland)
  const maxBuildBuy = affordableHectares(player.taler, state.kaizerTradePrices.buildingLand)

  // D3 (BACKLOG.md): farmland beyond what the current population can work
  // produces nothing (economy.ts's laborGatedFarmland — the same function
  // the harvest itself uses, so this can never disagree with what actually
  // happens at harvest time). Buying past that line was a trap with nothing
  // in the UI explaining it; showing the real worked/idle split makes the
  // tradeoff visible instead of only findable by reading the source.
  const workedFarmland = laborGatedFarmland(player.land, player.population)
  const { worked, idle, farmland } = roundedLandSplit(player.land.farmland, workedFarmland)
  const idleShare = farmland > 0 ? idle / farmland : 0
  const idleTone = tone(idleShare, IDLE_LAND_SHARE_TONE)

  return el('div', {},
    el('div', { class: 'terrain-strip' },
      spriteImg('terrain', idle > 0 ? 'farmland_fallow' : 'farmland_planted', 'Fields', 'terrain-tile'),
      spriteImg('terrain', 'farmland_ripe', 'Ripe fields', 'terrain-tile'),
      spriteImg('terrain', 'forest', 'Woods', 'terrain-tile'),
      spriteImg('terrain', 'river', 'River', 'terrain-tile')
    ),
    el('div', { class: 'stat-grid' },
      statTile('Farmland worked', `${worked} ha`),
      statTile('Farmland idle', `${idle} ha`, idleTone),
      statTile('Building land', `${Math.round(player.land.buildingLand)} ha`)
    ),
    el('p', { class: 'help-text' },
      `Farmland is worked at ~${HARVEST.laborHectaresPerPeasant} ha per peasant — buying beyond that leaves hectares idle until your population grows into them.`
    ),
    stepper({
      label: `Farmland (buy up to ${maxFarmBuy}, or sell what you hold)`,
      value: draft.farmlanbuy, min: -player.land.farmland, max: maxFarmBuy, step: 100,
      onChange: (v) => { draft.farmlanbuy = v },
      tooltip: `Grows grain. At ${state.kaizerTradePrices.farmland.toFixed(0)}/ha this turn. Only worked hectares (~${HARVEST.laborHectaresPerPeasant} per peasant) produce anything — buying far ahead of your population just sits idle.`
    }),
    stepper({
      label: `Building land (buy up to ${maxBuildBuy}, or sell what you hold)`,
      value: draft.buildingLandBuy, min: -player.land.buildingLand, max: maxBuildBuy, step: 100,
      onChange: (v) => { draft.buildingLandBuy = v },
      tooltip: `At ${state.kaizerTradePrices.buildingLand.toFixed(0)}/ha this turn. Required to construct markets, mills, the palace, and the cathedral (Build tab) — farmland can't be built on.`
    })
  )
}

function renderTaxTab(draft: DecisionDraft): HTMLElement {
  const preview = session
    ? previewYear(session.state, HUMAN_ID, draft, session.rivals, session.difficulty)
    : null
  const projected = preview
    ? el('div', { class: 'card' },
        el('h3', {}, 'Projected this year'),
        el('div', { class: 'stat-grid' },
          statTile('Tax', `+${Math.round(preview.taxIncome)}`),
          statTile('Tariffs', `+${Math.round(preview.tariffIncome)}`),
          statTile('Graft', `+${Math.round(preview.tributeIncome)}`),
          statTile('Unrest after', preview.unrestAfter.toFixed(0), tone(preview.unrestAfter, UNREST_TONE))
        ),
        el('p', { class: 'help-text' }, 'Same advanceYear preview as the footer — not a second estimate.')
      )
    : el('p', { class: 'help-text' }, 'End-year preview unavailable.')

  return el('div', {},
    el('div', { class: 'scene-banner' },
      spriteImg('buildings', 'market', 'Taxation', 'scene-full')
    ),
    projected,
    sliderField({
      label: 'VAT', value: draft.vat, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.vat = v; session!.activeTab = 'tax'; renderGame() },
      tooltip: 'Taxes the population\'s economic output — averaged with Income tax to set your base revenue rate. Full unrest weight.'
    }),
    sliderField({
      label: 'Income tax', value: draft.incomeTax, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.incomeTax = v; session!.activeTab = 'tax'; renderGame() },
      tooltip: 'Taxes the population\'s economic output — averaged with VAT to set your base revenue rate. Full unrest weight.'
    }),
    sliderField({
      label: 'Tariff', value: draft.tariff, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.tariff = v; session!.activeTab = 'tax'; renderGame() },
      tooltip: 'Revenue only in years you buy or sell land (Land tab). Unrest from the tariff rate applies every year at full weight, even when you trade nothing.'
    }),
    sliderField({
      label: 'Judicial graft', value: draft.justiceGraft, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.justiceGraft = v; session!.activeTab = 'tax'; renderGame() },
      tooltip: 'Skims an extra ~30% on top of whatever VAT/Income tax/Tariff already earned, at HALF their unrest cost per point — the most unrest-efficient way to squeeze more revenue, but it earns nothing on its own if the other three are at 0.'
    }),
    el('p', { class: 'help-text' }, 'Higher rates raise revenue but push unrest up — past a point, revolt becomes likely.')
  )
}

function buildRow(assetId: string, label: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'build-row' },
    spriteImg('buildings', assetId, label, 'building-sm'),
    el('div', { class: 'stepper-wrap' }, control)
  )
}

// A3: real numbers for a mitigation building's tooltip, pulled straight from
// data/events.json rather than restated by hand — a building can mitigate
// more than one event (garrison: banditry + revolt; well: fire + drought),
// so this reports each affected event's actual probabilityReduction/
// severityReduction rather than one qualitative "reduces chance AND
// severity" line for all of them.
function mitigationDetail(building: string): string {
  const events = eventsData.events as Array<{
    name: string
    mitigation: { building: string; probabilityReduction: number; severityReduction: number }
  }>
  const parts = events
    .filter((e) => e.mitigation.building === building)
    .map((e) => `${e.name} risk −${Math.round(e.mitigation.probabilityReduction * 100)}%, severity −${Math.round(e.mitigation.severityReduction * 100)}%`)
  // Hospital is also the population unlock: plague severity scales with realm
  // size, so without one a mid-game realm sits near its own growth ceiling.
  if (building === 'hospital') {
    parts.push('Without a hospital, plague severity rises with population and can cap growth near the Cathedral gate (~2,600); the hospital is the unlock that restores headroom')
  }
  return parts.join('; ')
}

// A one-time mitigation building (well/hospital/granary/garrison — max 1, never
// removed) shows a static "Built ✓" badge once owned instead of a stepper whose
// value resets to 0 every year. That reset is correct (it's a fresh order, not
// the current count) but sitting right next to a small "(1)" in the label reads,
// at a glance, as "this went back to zero" — this was reported as a bug for
// exactly that reason even though the underlying state was never touched.
function mitigationRow(assetId: string, label: string, owned: boolean, draftValue: number, onChange: (v: number) => void, tooltipText?: string): HTMLElement {
  const control = owned
    ? el('div', { class: 'field' },
        el('div', { class: 'field-label' }, tooltipText ? el('span', { class: 'field-label-text' }, label, tooltip(tooltipText)) : label),
        el('div', { class: 'stepper' }, el('span', { class: 'stepper-value', style: 'flex:1;text-align:center;color:var(--good);font-weight:600' } as never, 'Built ✓'))
      )
    : stepper({ label, value: draftValue, min: 0, max: 1, step: 1, onChange, tooltip: tooltipText })
  return buildRow(assetId, label, control)
}

function renderBuildTab(player: GameState['players'][string], draft: DecisionDraft): HTMLElement {
  const landHeld = totalLand(player.land)
  const CATHEDRAL = buildingsData.prestige.cathedral

  // Palace stages and the cathedral both require a land threshold to begin at
  // all (data/buildings.json) — buildings.ts's applyConstruction() drops the
  // entire order silently below that line, so a player could queue stages or
  // attempt the cathedral, see nothing happen at year-end, and have no way to
  // know why. Gate the control here and say what's missing instead.
  const palaceLandOk = landHeld >= PALACE.landRequirement
  const palaceRow = buildRow(
    player.buildings.palace >= PALACE.stages ? 'palace_stage_16' : player.buildings.palace >= 1 ? 'palace_stage_2' : 'palace_stage_1',
    'Palace',
    stepper({
      label: `Palace stages (${player.buildings.palace}/${PALACE.stages}) — ${costSuffix(PALACE.costPerStage, { upkeep: PALACE.upkeepPerYear })} total`,
      value: palaceLandOk ? draft.palaceStages : 0, min: 0, max: palaceLandOk ? PALACE.stages : 0, step: 1, onChange: (v) => { draft.palaceStages = v },
      tooltip: `The Prestige path to your next rank (Realm tab) — most ranks require some number of stages built. Needs ${PALACE.landRequirement.toLocaleString('en-US')} ha of land before the first stage can begin.`
    })
  )

  const container = el('div', {},
    el('h3', {}, 'Production'),
    buildRow('market', 'Market', stepper({
      label: `Markets (${player.buildings.markets}) — ${costSuffix(PRODUCTION.market.buildCost, { income: PRODUCTION.market.incomePerYear, upkeep: PRODUCTION.market.upkeepPerYear })}`,
      value: draft.marketBuild, min: 0, max: 10, step: 1, onChange: (v) => { draft.marketBuild = v },
      tooltip: `Passive Taler income every year. Capped by land: 1 market per ${PRODUCTION.market.ratioPerHectares.toLocaleString('en-US')} ha owned.`
    })),
    buildRow('mill', 'Mill', stepper({
      label: `Mills (${player.buildings.mills}) — ${costSuffix(PRODUCTION.mill.buildCost, { income: PRODUCTION.mill.incomePerYear, upkeep: PRODUCTION.mill.upkeepPerYear })}`,
      value: draft.millBuild, min: 0, max: 10, step: 1, onChange: (v) => { draft.millBuild = v },
      tooltip: `Passive Taler income every year, more than a market but costlier to run. Capped by land: 1 mill per ${PRODUCTION.mill.ratioPerHectares.toLocaleString('en-US')} ha owned.`
    })),
    el('h3', {}, 'Rank path'),
    palaceRow,
    palaceLandOk ? null : el('p', { class: 'help-text bad' },
      `Needs ${PALACE.landRequirement.toLocaleString('en-US')} ha to begin construction — you hold ${landHeld.toFixed(0)} ha.`)
  )

  if (!player.buildings.cathedral) {
    const cathedralLandOk = landHeld >= CATHEDRAL.landRequirement
    const cathedralPopOk = player.population.peasants >= CATHEDRAL.requiresMinPopulation
    const cathedralOk = cathedralLandOk && cathedralPopOk
    if (!cathedralOk) draft.cathedralBuild = false

    const cathedralLabel = `Attempt Cathedral — ${costSuffix(CATHEDRAL.cost, { upkeep: CATHEDRAL.upkeepPerYear })}`
    const cathedralBtn = el('button', { style: 'flex:1' as never, textContent: draft.cathedralBuild ? 'Cathedral: Building ✓' : cathedralLabel })
    if (!cathedralOk) cathedralBtn.setAttribute('disabled', 'true')
    cathedralBtn.addEventListener('click', () => {
      draft.cathedralBuild = !draft.cathedralBuild
      cathedralBtn.textContent = draft.cathedralBuild ? 'Cathedral: Building ✓' : cathedralLabel
    })
    container.appendChild(buildRow('cathedral', 'Cathedral', el('div', { class: 'row' },
      cathedralBtn,
      tooltip('Required by the Prestige path to Archbishop and Kaiser (Realm tab) — the Commerce alt path skips it entirely. One-time build, never destroyed.')
    )))
    if (!cathedralOk) {
      const missing = [
        !cathedralLandOk ? `${CATHEDRAL.landRequirement.toLocaleString('en-US')} ha (have ${landHeld.toFixed(0)})` : null,
        !cathedralPopOk ? `${CATHEDRAL.requiresMinPopulation.toLocaleString('en-US')} population (have ${player.population.peasants.toFixed(0)})` : null
      ].filter(Boolean).join(' and ')
      container.appendChild(el('p', { class: 'help-text bad' }, `Needs ${missing} to attempt.`))
    }
  }

  container.append(
    el('h3', {}, 'Mitigation'),
    mitigationRow('well', `Well — fire/drought — ${costSuffix(MITIGATION.well.cost, { upkeep: MITIGATION.well.upkeepPerYear })}`, player.buildings.well > 0, draft.wellBuild, (v) => { draft.wellBuild = v },
      `${mitigationDetail('well')}. One-time build, max 1, never destroyed.`),
    mitigationRow('hospital', `Hospital — plague — ${costSuffix(MITIGATION.hospital.cost, { upkeep: MITIGATION.hospital.upkeepPerYear })}`, player.buildings.hospital > 0, draft.hospitalBuild, (v) => { draft.hospitalBuild = v },
      `${mitigationDetail('hospital')}. Requires ${MITIGATION.hospital.requiresMinPopulation.toLocaleString('en-US')} population to build. One-time build, max 1, never destroyed.`),
    mitigationRow('granary', `Granary — famine — ${costSuffix(MITIGATION.granary.cost, { upkeep: MITIGATION.granary.upkeepPerYear })}`, player.buildings.granary > 0, draft.granaryBuild, (v) => { draft.granaryBuild = v },
      `${mitigationDetail('granary')}, and raises grain storage capacity (Grain tab). One-time build, max 1, never destroyed.`),
    mitigationRow('garrison', `Garrison — banditry/revolt/war defence — ${costSuffix(MITIGATION.garrison.cost, { upkeep: MITIGATION.garrison.upkeepPerYear })}`, player.buildings.garrison > 0, draft.garrisonBuild, (v) => { draft.garrisonBuild = v },
      `${mitigationDetail('garrison')}, and adds defensive strength if a rival declares war on you. One-time build, max 1 — but a lost war can destroy it.`),
    mitigationRow('dike', `Dike — flood — ${costSuffix(MITIGATION.dike.cost, { upkeep: MITIGATION.dike.upkeepPerYear })}`, (player.buildings.dike ?? 0) > 0, draft.dikeBuild, (v) => { draft.dikeBuild = v },
      `${mitigationDetail('dike')}. Only protects against flood, not drought — build a well too if you get both. One-time build, max 1, never destroyed.`)
  )

  if (isFeatureUnlocked(player.rank, 'tradingHouses')) {
    container.append(
      el('h3', {}, 'Commerce'),
      buildRow('trading_house', 'Trading House', stepper({
        label: `Trading houses (${player.tradingHouses}/${COMMERCE.tradingHouse.maxCount}) — ${costSuffix(COMMERCE.tradingHouse.cost, { income: COMMERCE.tradingHouse.incomePerYear })}, plus tribute on your wealth`,
        value: draft.tradingHouseBuild, min: 0, max: COMMERCE.tradingHouse.maxCount, step: 1, onChange: (v) => { draft.tradingHouseBuild = v },
        tooltip: 'The Commerce path to your next rank (Realm tab) for Archbishop and above. Leased from the Kaiser, not built on your own land — pays an ongoing tribute proportional to your total wealth, which grows as you get richer.'
      }))
    )
  } else {
    // A4: shown-but-locked, same treatment as the palace/cathedral land gates
    // above, so trading houses read as "not yet" rather than "doesn't exist."
    const unlockRank = getAllRanks().find((r) => r.unlockedFeature === 'tradingHouses')
    container.append(
      el('h3', {}, 'Commerce'),
      buildRow('trading_house', 'Trading House', stepper({
        label: `Trading houses (0/${COMMERCE.tradingHouse.maxCount}) — ${costSuffix(COMMERCE.tradingHouse.cost, { income: COMMERCE.tradingHouse.incomePerYear })}, plus tribute on your wealth`,
        value: 0, min: 0, max: 0, step: 1, onChange: () => {},
        tooltip: 'The Commerce path to your next rank (Realm tab) for Archbishop and above. Leased from the Kaiser, not built on your own land — pays an ongoing tribute proportional to your total wealth, which grows as you get richer.'
      })),
      el('p', { class: 'help-text bad' },
        `Unlocks at ${unlockRank ? getRankName(unlockRank.id) : 'a higher rank'} (currently ${getRankName(player.rank)}).`)
    )
  }

  return container
}

function renderSpyTab(player: GameState['players'][string], state: GameState, draft: DecisionDraft): HTMLElement {
  const rivals = rivalOptions(state, HUMAN_ID)
  // bug report #10 ("bought them in turn 1 and gone by turn 3"): nothing
  // actually removes guards/saboteurs — upkeep only costs Taler, never headcount
  // (espionage.ts). The confusion is the stepper below correctly resetting to 0
  // every year (it's a NEW-hires order, not a display of your standing force),
  // read at a glance as "my guards vanished." Naming it "standing" in the stat
  // tile above and "NEW hires" in the stepper label itself (not just a paragraph
  // easy to skip) puts the distinction in both places a player's eye actually
  // lands.
  const availableSaboteurs = player.saboteurs + Math.max(0, draft.saboteurHire)
  const container = el('div', {},
    el('div', { class: 'scene-banner' },
      spriteImg('uiIcons', 'stats', 'Spies', 'scene-full')
    ),
    el('div', { class: 'stat-grid' },
      statTile('Guards (standing)', player.guards.toFixed(0)),
      statTile('Saboteurs (standing)', player.saboteurs.toFixed(0))
    ),
    el('p', { class: 'help-text' }, 'The counts above carry over year to year and are never reduced by upkeep (only Taler is spent) — the steppers below are NEW hires to add this turn, and correctly start at 0 every year. Hires this turn can strike this turn.'),
    stepper({
      label: `Hire NEW guards this turn (defence) — ${costSuffix(ESPIONAGE.guardCost, { upkeep: ESPIONAGE.guardUpkeepPerYear })} each, max ${ESPIONAGE.maxGuards} standing`,
      value: draft.guardHire, min: 0, max: maxNewHires(player.guards, ESPIONAGE.maxGuards), step: 1,
      onChange: (v) => { draft.guardHire = v; session!.activeTab = 'spy'; renderGame() },
      tooltip: 'Lowers the chance a rival\'s strike against you succeeds, and adds defensive strength if a rival declares war. Does nothing on offence.'
    }),
    stepper({
      label: `Hire NEW saboteurs this turn (offence) — ${costSuffix(ESPIONAGE.saboteurCost, { upkeep: ESPIONAGE.saboteurUpkeepPerYear })} each, max ${ESPIONAGE.maxSaboteurs} standing`,
      value: draft.saboteurHire, min: 0, max: maxNewHires(player.saboteurs, ESPIONAGE.maxSaboteurs), step: 1,
      onChange: (v) => { draft.saboteurHire = v; session!.activeTab = 'spy'; renderGame() },
      tooltip: 'Needed to strike a rival (Strike section below, once standing + this turn\'s hires ≥ 1). Committing more against a rival\'s guards raises your odds of success; a failed strike loses some of the committed saboteurs.'
    })
  )

  if (availableSaboteurs > 0 && rivals.length > 0) {
    container.appendChild(el('h3', {}, 'Strike'))
    const targetRow = el('div', { class: 'segmented' })
    const noneBtn = el('button', { textContent: 'None', className: draft.targetPlayerId === null ? 'active' : '' })
    noneBtn.addEventListener('click', () => { draft.targetPlayerId = null; session!.activeTab = 'spy'; renderGame() })
    targetRow.appendChild(noneBtn)
    for (const rival of rivals) {
      const btn = el('button', { textContent: rival.name, className: draft.targetPlayerId === rival.id ? 'active' : '' })
      btn.addEventListener('click', () => { draft.targetPlayerId = rival.id; session!.activeTab = 'spy'; renderGame() })
      targetRow.appendChild(btn)
    }
    container.appendChild(targetRow)

    if (draft.targetPlayerId) {
      const maxCommit = Math.max(1, availableSaboteurs)
      if (draft.saboteursCommitted > maxCommit) draft.saboteursCommitted = maxCommit
      if (draft.saboteursCommitted < 1) draft.saboteursCommitted = 1
      container.appendChild(stepper({
        label: `Saboteurs to commit (up to ${availableSaboteurs} including this turn's hires)`,
        value: draft.saboteursCommitted, min: 1, max: maxCommit, step: 1,
        onChange: (v) => { draft.saboteursCommitted = v; session!.activeTab = 'spy'; renderGame() },
        tooltip: 'Success chance = committed ÷ (committed + the target\'s guards + a small base defence). More committed raises your odds but risks more saboteurs if it fails. Same-turn hires are available to commit.'
      }))
      container.appendChild(segmented<EspionageMode>({
        options: [{ value: 'raid', label: 'Raid (coin)' }, { value: 'sabotage', label: 'Sabotage (burn + coin)' }],
        value: draft.mode,
        onChange: (v) => { draft.mode = v },
        title: 'Strike type',
        tooltip: 'Raid: steals a larger share of the target\'s treasury only. Sabotage: steals a smaller share of treasury plus grain, and destroys some of their production buildings — more damage, less coin.'
      }))
      const defender = state.players[draft.targetPlayerId]
      if (defender) {
        const p = strikeSuccessProbability(draft.saboteursCommitted, defender.guards)
        container.appendChild(el('p', {
          class: helpToneClass(tone(p, WAR_ODDS_TONE))
        }, `Strike success chance: ${Math.round(p * 100)}% (engine formula — same odds the year will roll).`))
      }
    }
  }

  return container
}

function renderWarTab(state: GameState, draft: DecisionDraft): HTMLElement {
  const rivals = rivalOptions(state, HUMAN_ID)
  const player = state.players[HUMAN_ID]
  const container = el('div', {},
    el('div', { class: 'scene-banner' },
      spriteImg('scenes', 'battlefield_backdrop', 'Battlefield', 'scene-full')
    ),
    el('p', { class: 'help-text' },
      'Declaring war is the biggest risk in the game — both sides take real casualties even in victory, but the winner takes land and reparations from the loser. Requesting allies costs nothing; each one decides for itself whether to join.'
    )
  )

  // Phase 18C: the standing army. Shown before the declare-war controls
  // because that is the order it actually gets used in — you build the
  // strength first, then find it has moved the odds below.
  const trainingLevel = player.trainingLevel ?? 0
  const equipmentLevel = player.equipmentLevel ?? 0
  const weariness = player.warWeariness ?? 0
  const wearinessUnrest = weariness * WARFARE.wearinessUnrestMultiplier
  let armyPreview = previewYear(session!.state, HUMAN_ID, warSnapshotDraft(draft), session!.rivals, session!.difficulty)
  let pending = previewWarAttacker(player, armyPreview)
  const strengthShown = roundedStrength(warStrength(pending), militaryMultiplier(pending))
  const strengthGrid = el('div', { class: 'stat-grid' },
    statTile('Base strength', `${strengthShown.base}`),
    statTile('Army multiplier', `${strengthShown.multiplier.toFixed(2)}x`),
    statTile('Total strength', `${strengthShown.total}`),
    statTile('War weariness', weariness > 0 ? `${weariness.toFixed(0)} (+${wearinessUnrest.toFixed(1)} unrest/yr)` : '0')
  )

  const refreshArmyDisplay = () => {
    armyPreview = previewYear(session!.state, HUMAN_ID, warSnapshotDraft(draft), session!.rivals, session!.difficulty)
    pending = previewWarAttacker(player, armyPreview)
    const shown = roundedStrength(warStrength(pending), militaryMultiplier(pending))
    const wear = pending.warWeariness ?? 0
    const wearUnrest = wear * WARFARE.wearinessUnrestMultiplier
    clear(strengthGrid)
    strengthGrid.append(
      statTile('Base strength', `${shown.base}`),
      statTile('Army multiplier', `${shown.multiplier.toFixed(2)}x`),
      statTile('Total strength', `${shown.total}`),
      statTile('War weariness', wear > 0 ? `${wear.toFixed(0)} (+${wearUnrest.toFixed(1)} unrest/yr)` : '0')
    )
    if (oddsLine && draft.warTargetPlayerId) {
      const defender = state.players[draft.warTargetPlayerId]
      if (defender) {
        const hasAllyRequests = draft.warAlliesRequested.length > 0
        const text = warOddsText(pending, defender, hasAllyRequests)
        const winProbability = warWinProbability(warStrength(pending), warStrength(defender))
        oddsLine.className = helpToneClass(tone(winProbability, WAR_ODDS_TONE))
        oddsLine.textContent = text
      }
    }
  }

  let oddsLine: HTMLElement | null = null

  container.append(
    el('h3', { class: 'row' }, 'Your army', tooltip(
      `Base strength comes from your garrison, guards and a levy drawn from your population. Training and equipment MULTIPLY that base — every level of training adds ${Math.round(WARFARE.trainingStrengthBonusPerLevel * 100)}% and every level of equipment ${Math.round(WARFARE.equipmentStrengthBonusPerLevel * 100)}%, so they are worth the same proportionally whether your realm is small or large. Both carry annual upkeep forever, so an army you never use is a permanent drain. Tiles use previewYear's post-spend army snapshot, including clamps from earlier spending this year.`
    )),
    strengthGrid,
    stepper({
      label: `Training levels to buy (have ${trainingLevel}/${WARFARE.maxTrainingLevel}) — ${WARFARE.trainingCostPerLevel.toLocaleString('en-US')} Taler each, ${WARFARE.trainingUpkeepPerLevelPerYear}/yr upkeep`,
      value: draft.trainingInvest, min: 0, max: Math.max(0, WARFARE.maxTrainingLevel - trainingLevel), step: 1,
      onChange: (v) => { draft.trainingInvest = v; refreshArmyDisplay() },
      tooltip: `Drilled troops. Each level adds ${Math.round(WARFARE.trainingStrengthBonusPerLevel * 100)}% to your total war strength, permanently, for a one-time cost plus ${WARFARE.trainingUpkeepPerLevelPerYear} Taler every year after. Cheaper per point of strength than equipment.`
    }),
    stepper({
      label: `Equipment levels to buy (have ${equipmentLevel}/${WARFARE.maxEquipmentLevel}) — ${WARFARE.equipmentCostPerLevel.toLocaleString('en-US')} Taler each, ${WARFARE.equipmentUpkeepPerLevelPerYear}/yr upkeep`,
      value: draft.equipmentInvest, min: 0, max: Math.max(0, WARFARE.maxEquipmentLevel - equipmentLevel), step: 1,
      onChange: (v) => { draft.equipmentInvest = v; refreshArmyDisplay() },
      tooltip: `Arms and armour. Each level adds ${Math.round(WARFARE.equipmentStrengthBonusPerLevel * 100)}% to your total war strength — a bigger jump per level than training, but dearer to buy and to maintain.`
    })
  )

  if (rivals.length === 0) {
    container.appendChild(el('p', { class: 'help-text' }, 'No rivals left to declare war on.'))
    return container
  }

  const effectiveLandTransferShare = Math.min(WARFARE.landTransferFraction, WARFARE.maxLandTransferShare)
  container.appendChild(el('h3', { class: 'row' }, 'Declare war on', tooltip(
    `Strength is derived from your garrison, guards and population levy, multiplied by training and equipment. The defender fights at an advantage — their strength counts for ${WARFARE.defenderAdvantageMultiplier}x in the odds — so attacking needs a real edge, not parity. The winner takes ${Math.round(effectiveLandTransferShare * 100)}% of the loser's land, ${Math.round(WARFARE.populationTransferFraction * 100)}% of their population, and ${Math.round(WARFARE.reparationsFraction * 100)}% of their treasury as reparations. Both sides take casualties: ${Math.round(WARFARE.casualtyFractionLoser * 100)}% of population for the loser, ${(WARFARE.casualtyFractionWinner * 100).toFixed(1)}% for the winner, even in victory.`
  )))
  const targetRow = el('div', { class: 'segmented' })
  const noneBtn = el('button', { textContent: 'None', className: draft.warTargetPlayerId === null ? 'active' : '' })
  noneBtn.addEventListener('click', () => {
    draft.warTargetPlayerId = null
    draft.declareWar = false
    session!.activeTab = 'war'
    renderGame()
  })
  // Clear a stale declaration if the selected target is under truce.
  if (draft.warTargetPlayerId && isTruceActive(state.truces, HUMAN_ID, draft.warTargetPlayerId, state.year)) {
    draft.warTargetPlayerId = null
    draft.declareWar = false
  }
  noneBtn.className = draft.warTargetPlayerId === null ? 'active' : ''

  targetRow.appendChild(noneBtn)
  for (const rival of rivals) {
    const underTruce = isTruceActive(state.truces, HUMAN_ID, rival.id, state.year)
    const expiry = truceExpiryYear(state.truces, HUMAN_ID, rival.id)
    const label = underTruce && expiry !== undefined
      ? `${rival.name} (truce → ${expiry})`
      : rival.name
    const btn = el('button', {
      textContent: label,
      className: draft.warTargetPlayerId === rival.id ? 'active' : ''
    }) as HTMLButtonElement
    if (underTruce) {
      btn.disabled = true
      btn.title = `Truce until year ${expiry}`
    } else {
      btn.addEventListener('click', () => {
        draft.warTargetPlayerId = rival.id
        draft.declareWar = true
        draft.warAlliesRequested = draft.warAlliesRequested.filter((id) => id !== rival.id)
        session!.activeTab = 'war'
        renderGame()
      })
    }
    targetRow.appendChild(btn)
  }
  container.appendChild(targetRow)

  // A5: win-probability line, reusing warStrength() and the exact
  // baseDefenceConstant resolveWar() will roll — never a separate estimate
  // that could drift from what actually happens. Allies are requested, not
  // guaranteed (resolveAllianceRequests is probabilistic), so this shows the
  // baseline odds with no allies and notes that a join would only help.
  // Training/equipment steppers refresh this line in place (refreshArmyDisplay).
  if (draft.warTargetPlayerId) {
    const defender = state.players[draft.warTargetPlayerId]
    if (defender) {
      const hasAllyRequests = draft.warAlliesRequested.length > 0
      const winProbability = warWinProbability(warStrength(pending), warStrength(defender))
      oddsLine = el('p', { class: helpToneClass(tone(winProbability, WAR_ODDS_TONE)) },
        warOddsText(pending, defender, hasAllyRequests)
      )
      container.appendChild(oddsLine)
    }
  }

  if (draft.warTargetPlayerId) {
    const potentialAllies = rivals.filter((r) => r.id !== draft.warTargetPlayerId)
    if (potentialAllies.length > 0) {
      container.appendChild(el('h3', { class: 'row' }, 'Request allies (each may or may not join)', tooltip(
        'Allies fight on YOUR side, lending part of their strength for this one battle only. They take no casualties and get none of the spoils — a request costs nothing, but each rival decides for itself whether to join, and is likelier to if your target already outweighs them.'
      )))
      const allyRow = el('div', { class: 'row wrap' })
      for (const ally of potentialAllies) {
        const active = draft.warAlliesRequested.includes(ally.id)
        const btn = el('button', { textContent: ally.name, className: active ? 'active' : '' })
        btn.addEventListener('click', () => {
          draft.warAlliesRequested = active
            ? draft.warAlliesRequested.filter((id) => id !== ally.id)
            : [...draft.warAlliesRequested, ally.id]
          session!.activeTab = 'war'
          renderGame()
        })
        allyRow.appendChild(btn)
      }
      container.appendChild(allyRow)
    }
  }

  return container
}

// ---------------------------------------------------------------------------
// Turn resolution
// ---------------------------------------------------------------------------

function runYear(): void {
  if (!session) return
  clear(root)
  // A visible loading state before the (up to a few hundred ms on a phone —
  // see BACKLOG P1) AI planning work runs, so the tap always gets instant
  // feedback rather than an apparently-frozen button.
  root.appendChild(el('div', { class: 'screen' }, el('h2', {}, 'Advancing the year…')))

  // setTimeout, NOT requestAnimationFrame: rAF callbacks are tied to the
  // display's compositor and simply do not fire while a tab is backgrounded or
  // not visible (screen lock, app-switch on mobile, a hidden tab) — verified
  // directly, this stalled a year-advance for 6+ seconds in a non-composited
  // browser context that would otherwise never have painted the rAF callback
  // at all. setTimeout still yields a turn to let the loading screen paint,
  // but keeps firing regardless of visibility.
  setTimeout(() => resolveYear(), 0)
}

function resolveYear(): void {
  if (!session) return
  const { state, rivals, draft, difficulty } = session

  const decisions: Record<string, Decision[]> = {
    [HUMAN_ID]: draftToDecisions(draft)
  }
  const year = state.year
  for (const [id, personality] of rivals) {
    if (!state.activePlayerIds.includes(id)) continue
    const seed = planningSeed(5000, year, id)
    decisions[id] = planYear(state, id, personality, seed, difficulty.rivalEvaluationSeeds)
  }

  const seed = 1 + year * 1000
  const result = advanceYear(state, decisions, seed)
  session.state = result.state

  session.yearReport = {
    entries: buildReportEntries(result.chronicle, result.state),
    outcome: null,
    eventCards: collectEventCards(result.chronicle),
    cardIndex: 0
  }

  // Check end conditions.
  for (const id of result.state.activePlayerIds) {
    if (result.state.players[id].rank >= getTopRank()) {
      session.yearReport.outcome = { kind: 'victory', winnerId: id }
      break
    }
  }
  if (!session.yearReport.outcome) {
    result.state.activePlayerIds = result.state.activePlayerIds.filter(
      (id) => id === HUMAN_ID || result.state.players[id].population.peasants >= 1
    )
    if (result.state.players[HUMAN_ID].population.peasants < 1) {
      session.yearReport.outcome = { kind: 'collapse' }
    } else if (result.state.year >= session.maxYears) {
      session.yearReport.outcome = { kind: 'timeout' }
    }
  }

  // Bug report #29 ("Tax — goes back to default every turn"): defaultDraft()
  // resets EVERYTHING for the new turn, which is correct for the one-shot
  // orders (land, construction, recruitment, grain trade) but wrong for tax —
  // that's a standing policy, not a per-turn order, so a rate the player set
  // deliberately should hold until they change it again, not silently revert.
  const previousTax = {
    vat: session.draft.vat,
    incomeTax: session.draft.incomeTax,
    tariff: session.draft.tariff,
    justiceGraft: session.draft.justiceGraft
  }
  session.draft = trackDraft({ ...defaultDraft(result.state.players[HUMAN_ID]), ...previousTax })
  renderYearReport()
}

// bug report #11 ("Income and spend — not clear where it is coming from"):
// the engine already computes a full itemized breakdown every year
// (state.ts's PlayerChronicle) but the report screen only ever surfaced the
// grain trade line — tax, tariffs, market/mill/trading-house income, judicial
// graft, and upkeep were all silently absorbed into the Taler stat with no
// visible cause. This surfaces every line the engine already tracks.
function buildIncomeBreakdown(report: Chronicle['playerReports'][string]): HTMLElement {
  const pair = (label: string, value: number): [string, number] => [label, value]
  const lines: Array<[string, number]> = [
    pair('Tax revenue', report.taxIncome),
    pair('Tariffs', report.tariffIncome),
    pair('Judicial graft', report.tributeIncome),
    pair('Market income', report.marketIncome),
    pair('Mill income', report.millIncome),
    pair('Trading house income', report.tradingHouseIncome),
    pair('Grain trade', report.grainTradeIncome),
    pair('Upkeep (buildings, secret service, army, tribute)', -report.upkeepCost)
  ].filter(([, v]) => Math.abs(v) >= 1)
  // Round each line first so displayed Operating net equals the sum of displayed lines.
  const shown = lines.map(([label, v]) => [label, Math.round(v)] as [string, number])
  const net = shown.reduce((sum, [, v]) => sum + v, 0)

  return el('div', { class: 'card' },
    el('h3', {}, 'Income & spending'),
    ...shown.map(([label, v]) =>
      el('div', { class: 'row between' },
        el('span', { class: 'help-text' }, label),
        el('span', { class: v >= 0 ? 'good' : 'bad' }, `${v >= 0 ? '+' : ''}${v}`)
      )
    ),
    el('div', { style: 'border-top:1px solid var(--border);padding-top:6px;margin-top:6px' } as never,
      el('div', { class: 'row between', style: 'font-weight:600' } as never,
        el('span', {}, 'Operating net'),
        el('span', { class: net >= 0 ? 'good' : 'bad' }, `${net >= 0 ? '+' : ''}${net}`)
      ),
      el('p', { class: 'help-text' },
        'Excludes land, builds, recruits, army spend, events, raids, and war.'
      )
    )
  )
}

function collectEventCards(chronicle: Chronicle): EventCard[] {
  const cards: EventCard[] = []
  const report = chronicle.playerReports[HUMAN_ID]
  if (!report) return cards

  for (const event of report.events) {
    cards.push({
      kind: 'negative',
      sceneId: EVENT_SCENE_ID[event.type] ?? null,
      title: event.type.charAt(0).toUpperCase() + event.type.slice(1),
      body: event.telegraphText,
      magnitude: eventLossMagnitudeText(event)
    })
  }

  if (report.positiveEvent) {
    cards.push({
      kind: 'positive',
      sceneId: null,
      title: 'A fortunate turn',
      body: report.positiveEvent.text,
      magnitude: positiveEventMagnitudeText(report.positiveEvent),
      rewardType: report.positiveEvent.rewardType
    })
  }

  return cards
}

// EXHAUSTIVE over PositiveRewardType — mirrors eventLossMagnitudeText's own
// exhaustiveness discipline (events.ts) so a new reward type is a compile
// error here, not a silently blank magnitude.
function positiveEventMagnitudeText(outcome: NonNullable<PlayerChronicle['positiveEvent']>): string {
  switch (outcome.rewardType) {
    case 'taler': return `+${outcome.amount.toFixed(0)} Taler`
    case 'population': return `+${outcome.amount.toFixed(0)} peasants`
    case 'grain': return `+${outcome.amount.toFixed(0)} grain`
    case 'unrest': return `unrest −${outcome.amount.toFixed(0)}`
  }
}

function buildReportEntries(chronicle: Chronicle, state: GameState): HTMLElement[] {
  const entries: HTMLElement[] = []
  const report = chronicle.playerReports[HUMAN_ID]
  if (!report) return entries

  const traded = report.grainSold > 0
    ? `Sold ${report.grainSold.toFixed(0)} grain for ${report.grainTradeIncome.toFixed(0)} Taler.`
    : report.grainBought > 0
      ? `Bought ${report.grainBought.toFixed(0)} grain for ${(-report.grainTradeIncome).toFixed(0)} Taler.`
      : ''
  entries.push(el('div', { class: 'log-entry weather' },
    `${report.weatherName}: harvest ${report.harvestYield.toFixed(0)}. ${traded}`
  ))
  if (report.grainOverflowLost > 100) {
    entries.push(el('div', { class: 'log-entry' }, `${report.grainOverflowLost.toFixed(0)} bushels rotted in the yard — the barns could hold no more.`))
  }
  entries.push(buildIncomeBreakdown(report))

  for (const shortfall of report.shortfalls) {
    entries.push(el('div', { class: 'log-entry bad' }, shortfall))
  }

  for (const event of report.events) {
    const magnitude = eventLossMagnitudeText(event)
    const iconId = EVENT_ICON_ID[event.type]
    entries.push(el('div', { class: 'log-entry bad with-icon' },
      iconId ? spriteImg('eventIcons', iconId, event.type, 'event-sm') : null,
      el('span', {}, `${event.telegraphText} (${magnitude})`)
    ))
  }

  if (report.positiveEvent) {
    entries.push(el('div', { class: 'log-entry good' },
      `${report.positiveEvent.text} (${positiveEventMagnitudeText(report.positiveEvent)})`
    ))
  }

  for (const strike of chronicle.strikes) {
    const verb = strike.mode === 'raid' ? 'raid' : 'sabotage'
    if (strike.defenderId === HUMAN_ID) {
      const attackerName = state.players[strike.attackerId]?.name ?? strike.attackerId
      entries.push(el('div', { class: `log-entry ${strike.succeeded ? 'bad' : 'good'}` },
        strike.succeeded
          ? `${attackerName}'s ${verb} succeeded. ${strike.talerStolen.toFixed(0)} Taler taken before your guards arrived.`
          : `${attackerName} tried a ${verb}; your guards drove them off without loss.`
      ))
    } else if (strike.attackerId === HUMAN_ID) {
      const defenderName = state.players[strike.defenderId]?.name ?? strike.defenderId
      entries.push(el('div', { class: `log-entry ${strike.succeeded ? 'good' : 'bad'}` },
        strike.succeeded
          ? `Your ${verb} against ${defenderName} succeeded. ${strike.talerStolen.toFixed(0)} Taler taken.`
          : `Your ${verb} against ${defenderName} failed — ${strike.saboteursLost} saboteur${strike.saboteursLost === 1 ? '' : 's'} lost.`
      ))
    }
  }

  for (const war of chronicle.wars) {
    if (war.attackerId !== HUMAN_ID && war.defenderId !== HUMAN_ID) continue
    const isAttacker = war.attackerId === HUMAN_ID
    const rivalId = isAttacker ? war.defenderId : war.attackerId
    const rivalName = state.players[rivalId]?.name ?? rivalId
    const humanWon = isAttacker ? war.attackerWon : !war.attackerWon
    const alliesText = war.alliesJoined.length > 0
      ? ` (${war.alliesJoined.map((id) => state.players[id]?.name ?? id).join(', ')} joined the fight)`
      : ''
    const consequence = humanWon
      ? `${war.landTransferred.toFixed(0)} ha and ${war.populationTransferred.toFixed(0)} subjects annexed, and ${war.reparationsPaid.toFixed(0)} Taler taken from ${rivalName}.`
      : `Lost ${war.landTransferred.toFixed(0)} ha and ${war.populationTransferred.toFixed(0)} subjects to ${rivalName}, and paid ${war.reparationsPaid.toFixed(0)} Taler in reparations${war.garrisonDestroyed ? '; your garrison was destroyed' : ''}.`
    const ourCasualties = isAttacker ? war.attackerCasualties : war.defenderCasualties
    const theirCasualties = isAttacker ? war.defenderCasualties : war.attackerCasualties
    entries.push(el('div', { class: `log-entry with-icon ${humanWon ? 'good' : 'bad'}` },
      spriteImg('buildings', 'garrison', 'war', 'event-sm'),
      el('span', {},
        isAttacker
          ? `${humanWon ? 'You defeated' : 'You were defeated by'} ${rivalName} in the war you declared.`
          : `${rivalName} declared war on you and ${humanWon ? 'lost' : 'won'}.`,
        ` ${consequence}${alliesText}`,
        ` Casualties: ${ourCasualties.toFixed(0)} of yours, ${theirCasualties.toFixed(0)} of theirs.`
      )
    ))
  }

  if (report.succession) {
    entries.push(el('div', { class: 'log-entry' },
      `Your reign ends. Your heir takes the same throne, the same land, the same rank — and begins the count again from nothing.`
    ))
  }

  if (report.rankPromoted) {
    entries.push(el('div', { class: 'log-entry good' }, `Raised to the rank of ${getRankName(report.newRank!)}.`))
  }
  const popBreakdown = populationBreakdownText(
    report.births, report.deaths, report.immigration, report.emigration, report.eventPopulationLoss
  )
  if (popBreakdown) {
    const net = report.births - report.deaths + report.immigration - report.emigration - report.eventPopulationLoss
    const tone = report.emigration > 1 || report.eventPopulationLoss > 0 ? 'bad' : undefined
    entries.push(el('div', { class: tone ? `log-entry ${tone}` : 'log-entry' },
      `Population: ${popBreakdown} (net ${net >= 0 ? '+' : ''}${net.toFixed(0)}).`
      + (report.emigration > 1 ? ' Unrest is taking its toll.' : '')
    ))
  }

  if (entries.length === 0) {
    entries.push(el('div', { class: 'log-entry' }, 'A quiet year. The accounts balance, the rooftops hold, and nobody revolts. This is rarer than it sounds.'))
  }
  return entries
}

function renderYearReport(): void {
  if (!session?.yearReport) return
  clearPreviewSchedule()
  previewPanelEl = null
  clear(root)
  const report = session.yearReport
  const { entries, outcome, eventCards, cardIndex } = report
  const player = session.state.players[HUMAN_ID]

  // Phase 20.3: one dismissible full-bleed card per fired event, then the report.
  if (cardIndex < eventCards.length) {
    const card = eventCards[cardIndex]
    const nextBtn = el('button', {
      class: 'primary full',
      textContent: cardIndex + 1 < eventCards.length ? 'Next' : 'See the year'
    })
    nextBtn.addEventListener('click', () => {
      report.cardIndex += 1
      renderYearReport()
    })

    const art = card.sceneId
      ? el('div', { class: 'event-card-art' }, spriteImg('eventScenes', card.sceneId, card.sceneId, 'scene-full'))
      : el('div', { class: `event-card-parchment reward-${card.rewardType ?? 'taler'}` },
          el('p', { class: 'event-card-reward-label' }, (card.rewardType ?? 'fortune').toUpperCase())
        )

    root.append(
      el('div', { class: 'screen event-card-screen' },
        el('div', { class: `event-card ${card.kind}` },
          art,
          el('h1', {}, card.title),
          el('p', {}, card.body),
          el('p', { class: card.kind === 'negative' ? 'bad' : 'good', style: 'font-weight:700;font-size:1.15rem' } as never, card.magnitude),
          el('p', { class: 'help-text' }, `${cardIndex + 1} of ${eventCards.length}`)
        ),
        el('div', { class: 'sticky-footer' }, nextBtn)
      )
    )
    return
  }

  const continueBtn = el('button', { class: 'primary full', textContent: outcome ? 'See Final Standings' : 'Continue' })
  continueBtn.addEventListener('click', () => {
    if (outcome) renderGameOver(outcome)
    else renderGame()
  })

  root.append(
    el('div', { class: 'screen' },
      el('div', { class: 'scene-banner' },
        spriteImg('scenes', 'chronicle_parchment', 'Chronicle', 'scene-full')
      ),
      el('h1', {}, `Year ${session.state.year}`),
      el('p', { class: 'subtitle' }, `${getRankName(player.rank)} · ${player.taler.toFixed(0)} Taler · ${player.population.peasants.toFixed(0)} peasants`),
      el('div', { class: 'log' }, ...entries),
      el('div', { class: 'sticky-footer' }, continueBtn)
    )
  )
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

function renderGameOver(outcome: Outcome): void {
  if (!session) return
  clear(root)
  const { state } = session

  let headline: string
  if (outcome.kind === 'victory') {
    headline = outcome.winnerId === HUMAN_ID
      ? 'You have been crowned Kaiser of the Holy Roman Empire.'
      : `${state.players[outcome.winnerId].name} was crowned Kaiser before you reached the throne.`
  } else if (outcome.kind === 'collapse') {
    headline = 'Your realm is gone. The peasants have left, the fields lie unclaimed. It ends here.'
  } else {
    headline = 'The years allotted have run their course. No Kaiser was made — only the nearest to one.'
  }

  // Standings sorted the same way the game itself decides a winner.
  const standings = [...state.activePlayerIds].sort(
    (a, b) => compareStanding(state.players[b], state.players[a])
  )

  const rows = standings.map((id) => {
    const p = state.players[id]
    return el('div', { class: 'rival-row' },
      el('span', {}, id === HUMAN_ID ? 'You' : p.name),
      el('span', { class: 'rival-rank' }, `${getRankName(p.rank)} · ${p.taler.toFixed(0)} Taler · ${p.population.peasants.toFixed(0)} pop`)
    )
  })

  const again = el('button', { class: 'primary full', textContent: 'Play Again' })
  again.addEventListener('click', () => { session = null; renderSetup() })

  const sceneBanner = outcome.kind === 'victory'
    ? el('div', { class: 'scene-banner' }, spriteImg('scenes', 'coronation_tableau', 'Coronation', 'scene-full'))
    : outcome.kind === 'collapse'
      ? el('div', { class: 'scene-banner' }, spriteImg('terrain', 'farmland_blighted', 'Collapse', 'scene-full'))
      : el('div', { class: 'scene-banner' }, spriteImg('scenes', 'chronicle_parchment', 'Timeout', 'scene-full'))

  root.append(
    el('div', { class: 'screen' },
      sceneBanner,
      el('h1', {}, headline),
      el('div', { class: 'card' }, el('h2', {}, 'Final standings'), el('div', { class: 'rival-list' }, ...rows)),
      el('div', { class: 'sticky-footer' }, again)
    )
  )
}
