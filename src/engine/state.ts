// Core game state and decision types — the contract between UI/AI and the reducer.

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
  score: number                    // Annual promotion score
  dead: boolean                    // If true, may designate heir
  heir?: string                    // Heir's player ID when dead
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
}

export interface Chronicle {
  year: number
  playerReports: Record<string, PlayerChronicle>
  globalEvents: GameEvent[]        // Events that affect multiple players (market crashes, wars, etc.)
}

export interface PlayerChronicle {
  births: number
  deaths: number
  emigration: number
  immigration: number
  harvestYield: number
  spoilage: number
  marketIncome: number
  millIncome: number
  tributeIncome: number
  taxIncome: number
  tariffIncome: number
  upkeepCost: number
  eventLosses: number
  unrestGain: number
  events: PlayerEvent[]
  rankPromoted: boolean
  newRank?: number
}

// The events shipped in data/events.json. Flood/drought are plausible future
// additions but are NOT listed here until they actually exist — a union member
// with no implementation behind it is a trap for exhaustive switches.
export type EventId = 'plague' | 'fire' | 'famine' | 'revolt' | 'banditry'

export type EventLossType = 'population' | 'gold' | 'buildings'

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
export type Decision =
  | GrainDecision
  | LandTradeDecision
  | TaxDecision
  | ConstructionDecision
  | EspionageDecision
  | TradeDecision
  | WarDecision

export interface GrainDecision {
  type: 'grain'
  feedLevel: 'min' | 'max' | 'required' | 'custom'
  customPercentage?: number        // 20–80 if 'custom'
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
}

export interface EspionageDecision {
  type: 'espionage'
  guardHire: number                // New guards to hire
  saboteurHire: number             // New saboteurs to hire
  targetPlayerId?: string          // Whom to spy on / attack
  spyAllocation?: number           // How many guards to assign to defense
  sabotageAllocation?: number      // How many saboteurs to assign to attacks
}

export interface TradeDecision {
  type: 'trade'
  cornBuyPrice: number             // What I'll pay per unit
  cornSellPrice: number            // What I'll sell at
  farmlanbSellPrice: number        // Land trading prices
  buildingLandSellPrice: number
  minimumPercentageForSale: number // Rule: must offer ≥10% of holdings for sale (imperial decree)
}

export interface WarDecision {
  type: 'war'
  declare: boolean                 // Declare war on target?
  targetPlayerId?: string
  alliesRequested?: string[]       // Whom to ask for military support
}

// Serialization helpers (for save/load, determinism tests)
export function serializeGameState(state: GameState): string {
  return JSON.stringify(state, null, 2)
}

export function deserializeGameState(json: string): GameState {
  return JSON.parse(json) as GameState
}
