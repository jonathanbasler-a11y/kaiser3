// Core game state and decision types — the contract between UI/AI and the reducer.

import { finiteOr } from './sanitize.ts'
import type { BuildingUpkeepBreakdown } from './buildings.ts'

function finiteOrZero(n: number | undefined): number {
  return finiteOr(n, 0)
}

export interface PlayerState {
  id: string
  name: string
  taler: number                    // Currency
  land: LandHolding               // Farmland and building-land holdings
  grainStock: number                // Stored grain carried over between years (spoils annually)
  population: PopulationState
  buildings: BuildingState
  rank: number                     // 0–7 (Baron → Kaiser)
  guards: number                   // Secret service: hired guards (defense)
  saboteurs: number                // Secret service: hired saboteurs (offense)
  tradingHouses: number            // Number of leased trading houses
  score: number                    // Cumulative productive income earned THIS REIGN (resets on succession — see F5)
  reignYears: number                // Years the current ruler/heir has held the throne (resets on succession)
  dead: boolean                    // True once the realm's population has collapsed to extinction (permanent — no heir can inherit nothing)
  heir?: string                    // The player ID that inherited on succession (currently always self — see docs/kaiser-research.md succession note; a DIFFERENT heir ID is a multiplayer/dynasty extension, deferred per CLAUDE.md)
  // Phase 18C: standing military investment, multiplying war strength (see
  // war.ts's militaryMultiplier). Optional for the same reason BuildingState's
  // `dike` is — the ~18 PlayerState literals across tests/scripts would
  // otherwise all need a mechanical edit for two new fields — and safe for the
  // same reason: every read site treats them as `?? 0`, and both
  // clonePlayerState() and persist.ts's normalizePlayer() coerce them to a
  // real 0, so neither can silently drop out of a cloned or saved state.
  trainingLevel?: number
  equipmentLevel?: number
  // Phase 19A: accumulates on each war, decays in peacetime; feeds unrest.
  // Optional + ?? to 0 for the same reason as trainingLevel.
  warWeariness?: number
}

export interface LandHolding {
  farmland: number                 // Productive hectares (generate grain)
  buildingLand: number             // Construction hectares (where markets/mills/palaces go)
}

export interface PopulationState {
  peasants: number                 // Total population
  unrest: number                   // Accumulates from over-taxation, under-feeding; triggers emigration/revolt
}

export interface BuildingState {
  markets: number                  // Income buildings
  mills: number                    // Income buildings
  palace: number                   // Prestige building, 0–16 stages (16 = complete, required for Kaiser rank)
  cathedral: number                // 0 or 1 (prestige building, required for Emperor promotion)
  hospital: number                 // Event mitigation (plague reduction)
  well: number                     // Event mitigation (fire/drought reduction)
  granary: number                  // Event mitigation (famine reduction)
  garrison: number                 // Optional: guards quarters (upkeep cost, scales with risk)
  // F6: flood mitigation. Optional (rather than required like the rest) so the
  // ~15 existing BuildingState literals across tests/scripts don't all need a
  // mechanical edit for one new building; every read site treats it as `?? 0`,
  // and clonePlayerState() below normalizes it to a real 0 on every clone, so
  // it can never silently drop out of a saved/cloned state once set.
  dike?: number
}

export interface GameState {
  year: number
  players: Record<string, PlayerState>
  activePlayerIds: string[]        // Rulers still in the game (not dead/bankrupt)
  kaizerTradePrices: {             // NPC Kaiser's current market prices (for player trading)
    corn: number                   // Taler per unit
    farmland: number               // Taler per hectare
    buildingLand: number           // Taler per hectare
  }
  // Phase 19A: pair-key (`idA|idB`, sorted) → first year the pair may fight again.
  // Optional so pre-19A saves and hand-built test states still load; clone/persist
  // always materialise `{}`.
  truces?: Record<string, number>
}

export interface Chronicle {
  year: number
  playerReports: Record<string, PlayerChronicle>
  globalEvents: GameEvent[]        // Events that affect multiple players (market crashes, wars, etc.)
  // Espionage is inherently cross-player, so strikes are recorded once at the top
  // level rather than duplicated into both the attacker's and the victim's report.
  strikes: StrikeRecord[]
  // Warfare (F4) is the same shape: cross-player, recorded once.
  wars: WarRecord[]
}

export interface WarRecord {
  attackerId: string
  defenderId: string
  alliesJoined: string[]
  attackerWon: boolean
  attackerCasualties: number
  defenderCasualties: number
  landTransferred: number
  populationTransferred: number
  reparationsPaid: number
  garrisonDestroyed: boolean
}

export interface StrikeRecord {
  attackerId: string
  defenderId: string
  mode: EspionageMode
  saboteursCommitted: number
  succeeded: boolean
  saboteursLost: number
  talerStolen: number
  grainStolen: number
  buildingsDestroyed: number
}

export interface PlayerChronicle {
  births: number
  deaths: number
  emigration: number
  immigration: number
  harvestYield: number
  spoilage: number
  grainOverflowLost: number        // Surplus that exceeded storage and rotted
  weatherId: string                // Which weather band the year drew
  weatherName: string              // Human-readable, for the chronicle
  grainSold: number
  grainBought: number
  grainTradeIncome: number         // Net Taler from the grain market (may be negative)
  marketIncome: number
  millIncome: number
  tradingHouseIncome: number
  tributeIncome: number
  taxIncome: number
  tariffIncome: number
  upkeepCost: number
  // Itemised version of upkeepCost, so the UI can show WHERE it went instead
  // of one lump sum (Phase 20 follow-up). Same total as upkeepCost above,
  // plus the two standing-force lines calculateUpkeep doesn't cover.
  upkeepBreakdown?: BuildingUpkeepBreakdown & { secretService: number; army: number }
  // Signed — net Taler from this year's land trade (positive = sold more than
  // bought). The "excludes land, builds, recruits, army spend" caveat on the
  // income card exists because these four were computed and thrown away.
  landTradeNet: number
  constructionSpend: number
  recruitmentSpend: number
  militarySpend: number
  // Grain actually consumed by feeding this year (economy.ts resolveFeeding) —
  // without this the Grain tab's stock identity (before + harvest − spoilage
  // − overflow − fed − sold + bought) cannot be shown to balance.
  grainConsumed: number
  // Event losses are recorded PER UNIT, never summed together: adding peasants to
  // Taler produces a number that means nothing. Phase 6's balance harness needs
  // the gold figure on its own to compute net income.
  eventGoldLoss: number
  eventPopulationLoss: number
  eventBuildingsDestroyed: number
  eventGrainLoss: number           // F6: drought scorching stored/standing grain
  eventFarmlandLoss: number        // F6: flood washing out hectares
  unrestGain: number
  // Components of unrestGain — feeding shortfall/decay (population.ts), tax
  // burden (tax.ts), and war weariness (year.ts step 12.5+). Measured as
  // actual before/after state deltas at each step, so they sum to unrestGain
  // exactly even where the 0-100 clamp bites mid-year.
  unrestFromFeeding: number
  unrestFromTax: number
  unrestFromWarWeariness: number
  events: PlayerEvent[]
  rankPromoted: boolean
  newRank?: number
  // F5 succession (docs/kaiser-research.md): a ruler occasionally dies of natural
  // causes and an heir inherits the SAME territory/rank/buildings, only the
  // accumulated reign `score` resets to zero. Distinct from `dead` (extinction —
  // no heir, no continuation).
  succession: boolean
  extinct: boolean
  // A2: plain-language notices when a queued construction/recruitment order
  // couldn't fully execute (usually because an earlier decision this same
  // year — typically land trading — already spent the treasury). Surfaces
  // the "I built it then it vanished" bug's real cause (it was never built)
  // instead of leaving it silent.
  shortfalls: string[]
  // Phase 18D: at most one small, flavorful positive event per player per
  // year (src/engine/events/positiveEvents.ts) — null on a year where none
  // fired, which is most years by design (chancePerYear is small).
  positiveEvent: PositiveEventOutcome | null
}

// Phase 18D. Lives here rather than positiveEvents.ts because PlayerChronicle
// (above) needs it and state.ts is the shared contract every other module
// already imports from — same reasoning PlayerEvent gets defined here rather
// than in events.ts.
export interface PositiveEventOutcome {
  id: string
  text: string
  rewardType: 'taler' | 'population' | 'grain' | 'unrest'
  amount: number
}

// The events shipped in data/events.json. Flood and drought (F6) are
// agriculture-linked: driven by the same weather roll that decides the
// harvest, so they compound a bad year rather than rolling independently.
export type EventId = 'plague' | 'fire' | 'famine' | 'revolt' | 'banditry' | 'drought' | 'flood'

// 'grain' (drought — the standing crop and stores scorch) and 'farmland'
// (flood — hectares washed out) are F6 additions. Every switch over
// EventLossType MUST be exhaustive (never fall through to an `else`/default
// branch) — see src/ai/evaluator.ts, src/ui/app.ts, scripts/play.ts, which a
// non-exhaustive switch would silently price/report these at zero.
export type EventLossType = 'population' | 'gold' | 'buildings' | 'grain' | 'farmland'

export interface PlayerEvent {
  type: EventId
  severity: number                 // Effective severity multiplier after mitigation
  mitigated: boolean               // Did a mitigation building blunt this?
  loss: number                     // Magnitude, in the units given by lossType
  lossType: EventLossType          // What the loss was denominated in (so the UI can format it)
  telegraphText: string            // Why it happened — always explains the cause
}

export interface GameEvent {
  type: string
  description: string
  affectedPlayers: string[]
}

// Decision union: every yearly choice a player makes (human or AI).
// Enforces parity between human UI and AI planner.
//
// TradeDecision (inter-ruler trade, F2 in BACKLOG.md) is deliberately NOT a
// member: it was defined and validated but nothing ever executed it — a
// validated-but-inert no-op is worse than a missing feature (BACKLOG.md B4).
// Re-add it only alongside the phase that actually implements F2.
export type Decision =
  | GrainDecision
  | LandTradeDecision
  | TaxDecision
  | ConstructionDecision
  | EspionageDecision
  | WarDecision

export interface GrainDecision {
  type: 'grain'
  feedLevel: 'min' | 'max' | 'required' | 'custom'
  customPercentage?: number        // 20–80 if 'custom'
  // Trade with the Kaiser's granary, resolved AFTER the population is fed — you
  // sell what is left over, not what your peasants still need. Selling a reserve
  // is a bet that next year's weather holds.
  sellGrain?: number               // Units of surplus to sell
  buyGrain?: number                // Units to buy back (at a markup)
}

export interface LandTradeDecision {
  type: 'land_trade'
  farmlanbuy: number               // Hectares to buy (negative = sell)
  buildingLandBuy: number          // Hectares to buy (negative = sell)
  partnerPlayerId: 'kaiser' | string // 'kaiser' = NPC, else player ID
}

export interface TaxDecision {
  type: 'tax'
  vat: number                      // 0–100 (%)
  incomeTax: number                // 0–100 (%)
  tariff: number                   // 0–100 (%)
  justiceGraft: number             // 0–100 (0 = fair, 100 = greedy)
}

export interface ConstructionDecision {
  type: 'construction'
  marketBuild: number              // How many markets to construct
  millBuild: number                // How many mills to construct
  palaceStages: number             // Spend on palace (0–N stages per year)
  cathedralBuild: boolean          // Attempt to build cathedral
  wellBuild: number                // Mitigation buildings
  hospitalBuild: number
  granaryBuild: number
  garrisonBuild: number
  tradingHouseBuild: number        // Rank-gated (Count+) — see data/buildings.json commerce.tradingHouse
  dikeBuild?: number               // F6: flood mitigation. Optional — see BuildingState.dike
}

// Two distinct ways to strike a rival, so the aggressive archetypes are not
// merely two names for the same move:
//   'sabotage' — burn infrastructure. Destroys a production building and spoils
//                grain stores. The Kaiser secret-service move.
//   'raid'     — plunder the treasury. The Fugger/Hanse piracy move.
export type EspionageMode = 'sabotage' | 'raid'

export interface EspionageDecision {
  type: 'espionage'
  guardHire: number                 // New guards to recruit (defence)
  saboteurHire: number              // New saboteurs to recruit (offence)
  targetPlayerId?: string           // Whom to strike; omitted means stay home
  saboteursCommitted?: number       // How many to send against that target
  mode?: EspionageMode
}

export interface WarDecision {
  type: 'war'
  declare: boolean                 // Declare war on target?
  targetPlayerId?: string
  alliesRequested?: string[]       // Whom to ask for military support
  // Phase 18C: levels of training/equipment to BUY this year (not the running
  // totals — those live on PlayerState, same relationship EspionageDecision's
  // guardHire has to PlayerState.guards). Optional so existing WarDecision
  // literals keep compiling.
  trainingInvest?: number
  equipmentInvest?: number
}

// Hand-written structural clone, replacing JSON.parse(JSON.stringify(state))
// at the top of advanceYear() — measured at ~20% of planYear's total cost,
// since the AI planner calls advanceYear roughly 2,000-3,000 times per
// planning pass. Deliberately field-by-field rather than a generic deep-clone
// utility: GameState has no cyclic references, no Dates/Maps/functions, and a
// small closed shape, so hand-copying is both faster than JSON round-tripping
// and (unlike a generic clone) fails loudly at compile time if a new field is
// ever added to PlayerState/GameState without also being copied here.
export function clonePlayerState(player: PlayerState): PlayerState {
  return {
    id: player.id,
    name: player.name,
    taler: player.taler,
    land: { farmland: player.land.farmland, buildingLand: player.land.buildingLand },
    grainStock: player.grainStock,
    population: { peasants: player.population.peasants, unrest: player.population.unrest },
    buildings: {
      markets: player.buildings.markets,
      mills: player.buildings.mills,
      palace: player.buildings.palace,
      cathedral: player.buildings.cathedral,
      hospital: player.buildings.hospital,
      well: player.buildings.well,
      granary: player.buildings.granary,
      garrison: player.buildings.garrison,
      dike: finiteOrZero(player.buildings.dike)
    },
    rank: player.rank,
    guards: player.guards,
    saboteurs: player.saboteurs,
    tradingHouses: player.tradingHouses,
    score: player.score,
    reignYears: player.reignYears,
    dead: player.dead,
    heir: player.heir,
    trainingLevel: finiteOrZero(player.trainingLevel),
    equipmentLevel: finiteOrZero(player.equipmentLevel),
    warWeariness: finiteOrZero(player.warWeariness)
  }
}

export function cloneGameState(state: GameState): GameState {
  const players: Record<string, PlayerState> = {}
  for (const id of Object.keys(state.players)) {
    players[id] = clonePlayerState(state.players[id])
  }
  return {
    year: state.year,
    players,
    activePlayerIds: [...state.activePlayerIds],
    kaizerTradePrices: { ...state.kaizerTradePrices },
    // Real copy — sharing the Record reference would let preview/AI clones
    // mutate the live truce table (audit R4 class).
    truces: { ...(state.truces ?? {}) }
  }
}

// Serialization helper (determinism tests compare two runs by serialized
// equality — tests/determinism.test.ts). deserializeGameState lives in
// persist.ts alongside the save/load payload validators.
export function serializeGameState(state: GameState): string {
  return JSON.stringify(state, null, 2)
}
