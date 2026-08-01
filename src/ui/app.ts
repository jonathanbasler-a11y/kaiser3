// App state machine: setup -> game (decisions) -> year report -> game (loop) -> game over.
// No framework — a module-level state object and a render() that rebuilds the
// active screen from scratch on every transition. The game only re-renders on
// discrete player actions (never continuously), so this is plenty fast.

import { GameState, Decision, Chronicle, PlayerState, EspionageMode } from '../engine/state.ts'
import { eventLossMagnitudeText } from '../engine/events/events.ts'
import { createStarterState } from '../engine/starter.ts'
import { advanceYear } from '../engine/year.ts'
import { getRankName, isFeatureUnlocked } from '../engine/ranks.ts'
import { getPersonalities, Personality } from '../ai/personalities.ts'
import { planYear } from '../ai/planner.ts'
import { compareStanding } from '../ai/sim.ts'
import { annualGrainRequirement, storageCapacity, grainBuybackPrice } from '../engine/economy.ts'
import { el, clear, stepper, sliderField, segmented, statTile } from './dom.ts'
import { DecisionDraft, defaultDraft, draftToDecisions, rivalOptions, affordableHectares, maxSellableGrain, maxAffordableGrainBuy, yearsOfFoodLabel } from './decisions.ts'
import { drawBanner } from './render.ts'
import { spriteImg } from './spriteLoader.ts'

// EventId -> tileset.json eventIcons asset id. Drought/flood (F6) have no art
// yet, so they're deliberately absent here — spriteImg's 404-safe fallback
// (spriteLoader.ts) means an unmapped id just renders without an icon rather
// than breaking, consistent with the art-fallback invariant.
const EVENT_ICON_ID: Record<string, string> = {
  plague: 'plague_flag',
  fire: 'fire_smoke',
  famine: 'famine_sign',
  revolt: 'revolt_banner',
  banditry: 'bandit_skull'
}


const HUMAN_ID = 'human'
const KAISER_RANK = 7

type Tab = 'overview' | 'grain' | 'land' | 'tax' | 'build' | 'spy' | 'war'

interface Session {
  state: GameState
  rivals: Map<string, Personality>
  maxYears: number
  draft: DecisionDraft
  activeTab: Tab
  yearReport: { entries: HTMLElement[]; outcome: Outcome | null } | null
}

type Outcome =
  | { kind: 'victory'; winnerId: string }
  | { kind: 'collapse' }
  | { kind: 'timeout' }

let session: Session | null = null
let root: HTMLElement

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
  clear(root)
  const personalities = getPersonalities()

  let opponentCount = 2
  let maxYears = 60

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
      onChange: (v) => { opponentCount = v }
    }))
    clear(yearsStepperHost as HTMLElement)
    yearsStepperHost.appendChild(stepper({
      label: 'Maximum years to play',
      value: maxYears, min: 20, max: 300, step: 20,
      onChange: (v) => { maxYears = v }
    }))
  }
  rerenderSteppers()

  const startBtn = el('button', { class: 'primary full', textContent: 'Begin Your Reign' })
  startBtn.addEventListener('click', () => startGame(opponentCount, maxYears))

  root.append(
    el('div', { class: 'screen' },
      el('h1', {}, 'Kaiser 3'),
      el('p', { class: 'subtitle' }, 'Rule a principality. Outlast your rivals. Be crowned Kaiser.'),
      el('div', { class: 'card' }, opponentStepperHost, yearsStepperHost),
      rivalList,
      el('div', { class: 'sticky-footer' }, startBtn)
    )
  )
}

function startGame(opponentCount: number, maxYears: number): void {
  const personalities = getPersonalities()
  const rivalIds = Array.from({ length: opponentCount }, (_, i) => `rival${i + 1}`)
  const rivals = new Map<string, Personality>()
  rivalIds.forEach((id, i) => rivals.set(id, personalities[i % personalities.length]))

  const playerIds = [
    { id: HUMAN_ID, name: 'You' },
    ...rivalIds.map((id) => ({ id, name: rivals.get(id)!.name }))
  ]
  const state = createStarterState(playerIds)

  session = {
    state,
    rivals,
    maxYears,
    draft: defaultDraft(state.players[HUMAN_ID]),
    activeTab: 'overview',
    yearReport: null
  }
  renderGame()
}

// ---------------------------------------------------------------------------
// Game screen (decisions)
// ---------------------------------------------------------------------------

function renderGame(): void {
  if (!session) return
  clear(root)
  const { state, draft } = session
  const player = state.players[HUMAN_ID]

  const banner = el('canvas', { id: 'banner' })

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Realm' },
    { id: 'grain', label: 'Grain' },
    { id: 'land', label: 'Land' },
    { id: 'tax', label: 'Tax' },
    { id: 'build', label: 'Build' },
    { id: 'spy', label: 'Secret Service' },
    { id: 'war', label: 'War' }
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
    const btn = el('button', { textContent: tab.label })
    btn.dataset.tab = tab.id
    btn.addEventListener('click', () => { session!.activeTab = tab.id; renderTab() })
    tabbar.appendChild(btn)
  }

  const endYearBtn = el('button', { class: 'primary full', textContent: `End Year ${state.year + 1}` })
  endYearBtn.addEventListener('click', () => runYear())

  root.append(
    el('div', { class: 'screen' },
      banner,
      el('h1', {}, `${getRankName(player.rank)} of the Realm`),
      statGrid(player, state),
      tabbar,
      content,
      el('div', { class: 'sticky-footer' }, endYearBtn)
    )
  )

  drawBanner(banner, undefined, getRankName(player.rank))
  renderTab()

  void draft // referenced to keep TS happy about the destructure above being used
}

function statGrid(player: PlayerState, _state: GameState): HTMLElement {
  const grainYears = Number(yearsOfFoodLabel(player))
  const grainTone = grainYears < 0.5 ? 'bad' : grainYears >= 1 ? 'good' : undefined
  const unrestTone = player.population.unrest > 60 ? 'bad' : player.population.unrest < 20 ? 'good' : undefined

  return el('div', { class: 'stat-grid' },
    statTile('Taler', player.taler.toFixed(0)),
    statTile('Population', player.population.peasants.toFixed(0)),
    statTile('Grain', `${player.grainStock.toFixed(0)} (${yearsOfFoodLabel(player)}y)`, grainTone),
    statTile('Unrest', `${player.population.unrest.toFixed(0)}/100`, unrestTone),
    statTile('Land', `${(player.land.farmland + player.land.buildingLand).toFixed(0)} ha`),
    statTile('Palace', `${player.buildings.palace}/16${player.buildings.cathedral ? ' + Cathedral' : ''}`),
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

function renderOverviewTab(): HTMLElement {
  const { state, rivals: rivalPersonalities } = session!
  const rivals = rivalOptions(state, HUMAN_ID)
  return el('div', {},
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
    el('p', { class: 'help-text' }, `Year ${state.year} of up to ${session!.maxYears}. Corn: ${state.kaizerTradePrices.corn.toFixed(2)}/unit · Farmland: ${state.kaizerTradePrices.farmland.toFixed(0)}/ha`)
  )
}

function renderGrainTab(player: GameState['players'][string], state: GameState): HTMLElement {
  const draft = session!.draft
  const container = el('div', {})

  container.appendChild(el('p', { class: 'help-text' },
    `Storage: ${player.grainStock.toFixed(0)} of ${storageCapacity(player.population, player.buildings.granary).toFixed(0)} — needs ${annualGrainRequirement(player.population).toFixed(0)}/year`
  ))

  container.appendChild(segmented<DecisionDraft['feedLevel']>({
    options: [
      { value: 'min', label: 'Min' },
      { value: 'required', label: 'Required' },
      { value: 'max', label: 'Max' },
      { value: 'custom', label: 'Custom' }
    ],
    value: draft.feedLevel,
    onChange: (v) => { draft.feedLevel = v; session!.activeTab = 'grain'; renderGame() }
  }))

  if (draft.feedLevel === 'custom') {
    container.appendChild(sliderField({
      label: 'Feed percentage', value: draft.customPercentage, min: 20, max: 80,
      onChange: (v) => { draft.customPercentage = v }
    }))
  }

  container.appendChild(stepper({
    label: `Sell grain to the Kaiser (${state.kaizerTradePrices.corn.toFixed(2)}/unit)`,
    value: draft.sellGrain, min: 0, max: maxSellableGrain(player), step: 250,
    onChange: (v) => { draft.sellGrain = v }
  }))
  container.appendChild(stepper({
    label: `Buy grain from the Kaiser (${grainBuybackPrice(state.kaizerTradePrices.corn).toFixed(2)}/unit)`,
    value: draft.buyGrain, min: 0, max: maxAffordableGrainBuy(player, grainBuybackPrice(state.kaizerTradePrices.corn)), step: 100,
    onChange: (v) => { draft.buyGrain = v }
  }))

  return container
}

function renderLandTab(player: GameState['players'][string], state: GameState): HTMLElement {
  const draft = session!.draft
  const maxFarmBuy = affordableHectares(player.taler, state.kaizerTradePrices.farmland)
  const maxBuildBuy = affordableHectares(player.taler, state.kaizerTradePrices.buildingLand)

  return el('div', {},
    el('p', { class: 'help-text' }, `Farmland ${player.land.farmland.toFixed(0)} ha · Building land ${player.land.buildingLand.toFixed(0)} ha. Farmland beyond ~5 ha per peasant sits idle.`),
    stepper({
      label: `Farmland (buy up to ${maxFarmBuy}, or sell what you hold)`,
      value: draft.farmlanbuy, min: -player.land.farmland, max: maxFarmBuy, step: 100,
      onChange: (v) => { draft.farmlanbuy = v }
    }),
    stepper({
      label: `Building land (buy up to ${maxBuildBuy}, or sell what you hold)`,
      value: draft.buildingLandBuy, min: -player.land.buildingLand, max: maxBuildBuy, step: 100,
      onChange: (v) => { draft.buildingLandBuy = v }
    })
  )
}

function renderTaxTab(draft: DecisionDraft): HTMLElement {
  return el('div', {},
    sliderField({ label: 'VAT', value: draft.vat, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.vat = v } }),
    sliderField({ label: 'Income tax', value: draft.incomeTax, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.incomeTax = v } }),
    sliderField({ label: 'Tariff', value: draft.tariff, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.tariff = v } }),
    sliderField({ label: 'Judicial graft', value: draft.justiceGraft, min: 0, max: 100, suffix: '%', onChange: (v) => { draft.justiceGraft = v } }),
    el('p', { class: 'help-text' }, 'Higher rates raise revenue but push unrest up — past a point, revolt becomes likely.')
  )
}

function buildRow(assetId: string, label: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'build-row' },
    spriteImg('buildings', assetId, label, 'building-sm'),
    el('div', { class: 'stepper-wrap' }, control)
  )
}

// A one-time mitigation building (well/hospital/granary/garrison — max 1, never
// removed) shows a static "Built ✓" badge once owned instead of a stepper whose
// value resets to 0 every year. That reset is correct (it's a fresh order, not
// the current count) but sitting right next to a small "(1)" in the label reads,
// at a glance, as "this went back to zero" — this was reported as a bug for
// exactly that reason even though the underlying state was never touched.
function mitigationRow(assetId: string, label: string, owned: boolean, draftValue: number, onChange: (v: number) => void): HTMLElement {
  const control = owned
    ? el('div', { class: 'field' },
        el('div', { class: 'field-label' }, label),
        el('div', { class: 'stepper' }, el('span', { class: 'stepper-value', style: 'flex:1;text-align:center;color:var(--good);font-weight:600' } as never, 'Built ✓'))
      )
    : stepper({ label, value: draftValue, min: 0, max: 1, step: 1, onChange })
  return buildRow(assetId, label, control)
}

function renderBuildTab(player: GameState['players'][string], draft: DecisionDraft): HTMLElement {
  const container = el('div', {},
    el('h3', {}, 'Production'),
    buildRow('market', 'Market', stepper({ label: `Markets (${player.buildings.markets})`, value: draft.marketBuild, min: 0, max: 10, step: 1, onChange: (v) => { draft.marketBuild = v } })),
    buildRow('mill', 'Mill', stepper({ label: `Mills (${player.buildings.mills})`, value: draft.millBuild, min: 0, max: 10, step: 1, onChange: (v) => { draft.millBuild = v } })),
    el('h3', {}, 'Rank path'),
    buildRow(
      player.buildings.palace >= 16 ? 'palace_stage_16' : player.buildings.palace >= 1 ? 'palace_stage_2' : 'palace_stage_1',
      'Palace',
      stepper({ label: `Palace stages (${player.buildings.palace}/16)`, value: draft.palaceStages, min: 0, max: 16, step: 1, onChange: (v) => { draft.palaceStages = v } })
    ),
  )

  if (!player.buildings.cathedral) {
    const cathedralBtn = el('button', { class: 'full', textContent: draft.cathedralBuild ? 'Cathedral: Building ✓' : 'Attempt Cathedral' })
    cathedralBtn.addEventListener('click', () => {
      draft.cathedralBuild = !draft.cathedralBuild
      cathedralBtn.textContent = draft.cathedralBuild ? 'Cathedral: Building ✓' : 'Attempt Cathedral'
    })
    container.appendChild(buildRow('cathedral', 'Cathedral', cathedralBtn))
  }

  container.append(
    el('h3', {}, 'Mitigation'),
    mitigationRow('well', 'Well — fire/drought', player.buildings.well > 0, draft.wellBuild, (v) => { draft.wellBuild = v }),
    mitigationRow('hospital', 'Hospital — plague', player.buildings.hospital > 0, draft.hospitalBuild, (v) => { draft.hospitalBuild = v }),
    mitigationRow('granary', 'Granary — famine', player.buildings.granary > 0, draft.granaryBuild, (v) => { draft.granaryBuild = v }),
    mitigationRow('garrison', 'Garrison — banditry/revolt/war defence', player.buildings.garrison > 0, draft.garrisonBuild, (v) => { draft.garrisonBuild = v }),
    mitigationRow('dike', 'Dike — flood', (player.buildings.dike ?? 0) > 0, draft.dikeBuild, (v) => { draft.dikeBuild = v })
  )

  if (isFeatureUnlocked(player.rank, 'tradingHouses')) {
    container.append(
      el('h3', {}, 'Commerce'),
      buildRow('trading_house', 'Trading House', stepper({
        label: `Trading houses (${player.tradingHouses}/3 — leased from the Kaiser, pays tribute on your wealth)`,
        value: draft.tradingHouseBuild, min: 0, max: 3, step: 1, onChange: (v) => { draft.tradingHouseBuild = v }
      }))
    )
  }

  return container
}

function renderSpyTab(player: GameState['players'][string], state: GameState, draft: DecisionDraft): HTMLElement {
  const rivals = rivalOptions(state, HUMAN_ID)
  const container = el('div', {},
    el('div', { class: 'stat-grid' },
      statTile('Guards (standing)', player.guards.toFixed(0)),
      statTile('Saboteurs (standing)', player.saboteurs.toFixed(0))
    ),
    el('p', { class: 'help-text' }, 'The counts above carry over year to year. The steppers below are NEW hires to add this turn — they start at 0 every year, not a reset of your standing force.'),
    stepper({ label: 'Hire guards (defence)', value: draft.guardHire, min: 0, max: 10, step: 1, onChange: (v) => { draft.guardHire = v } }),
    stepper({ label: 'Hire saboteurs (offence)', value: draft.saboteurHire, min: 0, max: 10, step: 1, onChange: (v) => { draft.saboteurHire = v } })
  )

  if (player.saboteurs > 0 && rivals.length > 0) {
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
      container.appendChild(stepper({
        label: 'Saboteurs to commit',
        value: draft.saboteursCommitted, min: 1, max: player.saboteurs, step: 1,
        onChange: (v) => { draft.saboteursCommitted = v }
      }))
      container.appendChild(segmented<EspionageMode>({
        options: [{ value: 'raid', label: 'Raid (coin)' }, { value: 'sabotage', label: 'Sabotage (burn + coin)' }],
        value: draft.mode,
        onChange: (v) => { draft.mode = v }
      }))
    }
  }

  return container
}

function renderWarTab(state: GameState, draft: DecisionDraft): HTMLElement {
  const rivals = rivalOptions(state, HUMAN_ID)
  const container = el('div', {},
    el('p', { class: 'help-text' },
      'Declaring war is the biggest risk in the game — both sides take real casualties even in victory, but the winner takes land and reparations from the loser. Requesting allies costs nothing; each one decides for itself whether to join.'
    )
  )

  if (rivals.length === 0) {
    container.appendChild(el('p', { class: 'help-text' }, 'No rivals left to declare war on.'))
    return container
  }

  container.appendChild(el('h3', {}, 'Declare war on'))
  const targetRow = el('div', { class: 'segmented' })
  const noneBtn = el('button', { textContent: 'None', className: draft.warTargetPlayerId === null ? 'active' : '' })
  noneBtn.addEventListener('click', () => {
    draft.warTargetPlayerId = null
    draft.declareWar = false
    session!.activeTab = 'war'
    renderGame()
  })
  targetRow.appendChild(noneBtn)
  for (const rival of rivals) {
    const btn = el('button', { textContent: rival.name, className: draft.warTargetPlayerId === rival.id ? 'active' : '' })
    btn.addEventListener('click', () => {
      draft.warTargetPlayerId = rival.id
      draft.declareWar = true
      draft.warAlliesRequested = draft.warAlliesRequested.filter((id) => id !== rival.id)
      session!.activeTab = 'war'
      renderGame()
    })
    targetRow.appendChild(btn)
  }
  container.appendChild(targetRow)

  if (draft.warTargetPlayerId) {
    const potentialAllies = rivals.filter((r) => r.id !== draft.warTargetPlayerId)
    if (potentialAllies.length > 0) {
      container.appendChild(el('h3', {}, 'Request allies (each may or may not join)'))
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
  const { state, rivals, draft } = session

  const decisions: Record<string, Decision[]> = {
    [HUMAN_ID]: draftToDecisions(draft)
  }
  const year = state.year
  for (const [id, personality] of rivals) {
    if (!state.activePlayerIds.includes(id)) continue
    const seed = 5000 + year * 104729 + id.length
    decisions[id] = planYear(state, id, personality, seed)
  }

  const seed = 1 + year * 1000
  const result = advanceYear(state, decisions, seed)
  session.state = result.state

  session.yearReport = { entries: buildReportEntries(result.chronicle, result.state), outcome: null }

  // Check end conditions.
  for (const id of result.state.activePlayerIds) {
    if (result.state.players[id].rank >= KAISER_RANK) {
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

  session.draft = defaultDraft(result.state.players[HUMAN_ID])
  renderYearReport()
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
    entries.push(el('div', { class: 'log-entry' }, `${report.grainOverflowLost.toFixed(0)} grain rotted — the barns were full.`))
  }

  for (const event of report.events) {
    const magnitude = eventLossMagnitudeText(event)
    const iconId = EVENT_ICON_ID[event.type]
    entries.push(el('div', { class: 'log-entry bad with-icon' },
      iconId ? spriteImg('eventIcons', iconId, event.type, 'event-sm') : null,
      el('span', {}, `${event.telegraphText} (${magnitude})`)
    ))
  }

  for (const strike of chronicle.strikes) {
    const verb = strike.mode === 'raid' ? 'raid' : 'sabotage'
    if (strike.defenderId === HUMAN_ID) {
      const attackerName = state.players[strike.attackerId]?.name ?? strike.attackerId
      entries.push(el('div', { class: `log-entry ${strike.succeeded ? 'bad' : 'good'}` },
        strike.succeeded
          ? `${attackerName} succeeded with a ${verb} against you — ${strike.talerStolen.toFixed(0)} Taler taken.`
          : `${attackerName} attempted a ${verb} — your guards drove them off.`
      ))
    } else if (strike.attackerId === HUMAN_ID) {
      const defenderName = state.players[strike.defenderId]?.name ?? strike.defenderId
      entries.push(el('div', { class: `log-entry ${strike.succeeded ? 'good' : 'bad'}` },
        strike.succeeded
          ? `Your ${verb} against ${defenderName} succeeded — ${strike.talerStolen.toFixed(0)} Taler taken.`
          : `Your ${verb} against ${defenderName} failed — ${strike.saboteursLost} saboteurs lost.`
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
    entries.push(el('div', { class: `log-entry with-icon ${humanWon ? 'good' : 'bad'}` },
      spriteImg('buildings', 'garrison', 'war', 'event-sm'),
      el('span', {},
        isAttacker
          ? `${humanWon ? 'You defeated' : 'You were defeated by'} ${rivalName} in the war you declared.`
          : `${rivalName} declared war on you and ${humanWon ? 'lost' : 'won'}.`,
        ` ${consequence}${alliesText}`
      )
    ))
  }

  if (report.succession) {
    entries.push(el('div', { class: 'log-entry' },
      `The reign ends; your heir succeeds you on the same throne. Territory and rank are undisturbed, but your reign's accumulated score resets to zero.`
    ))
  }

  if (report.rankPromoted) {
    entries.push(el('div', { class: 'log-entry good' }, `Promoted to ${getRankName(report.newRank!)}!`))
  }
  if (report.emigration > 1) {
    entries.push(el('div', { class: 'log-entry bad' }, `${report.emigration.toFixed(0)} peasants emigrated — unrest is taking its toll.`))
  }

  if (entries.length === 0) {
    entries.push(el('div', { class: 'log-entry' }, 'A quiet year.'))
  }
  return entries
}

function renderYearReport(): void {
  if (!session?.yearReport) return
  clear(root)
  const { entries, outcome } = session.yearReport
  const player = session.state.players[HUMAN_ID]

  const continueBtn = el('button', { class: 'primary full', textContent: outcome ? 'See Final Standings' : 'Continue' })
  continueBtn.addEventListener('click', () => {
    if (outcome) renderGameOver(outcome)
    else renderGame()
  })

  root.append(
    el('div', { class: 'screen' },
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
      ? 'You have been crowned Kaiser!'
      : `${state.players[outcome.winnerId].name} was crowned Kaiser.`
  } else if (outcome.kind === 'collapse') {
    headline = 'Your realm has collapsed.'
  } else {
    headline = 'The years have run their course.'
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
    : null

  root.append(
    el('div', { class: 'screen' },
      sceneBanner,
      el('h1', {}, headline),
      el('div', { class: 'card' }, el('h2', {}, 'Final standings'), el('div', { class: 'rival-list' }, ...rows)),
      el('div', { class: 'sticky-footer' }, again)
    )
  )
}
