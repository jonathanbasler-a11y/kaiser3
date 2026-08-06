// Guild petitions and building specialization (D2, GitHub issues #49/#51).
//
// PHASE 21.6 — PURE LOGIC, ZERO CALLERS. Nothing in year.ts, decisions.ts's
// runtime path, planner.ts, or app.ts invokes anything in this file yet. That
// lands in 21.7 (economics wiring) and 21.8 (reducer wiring — petitions start
// firing). Until then this module is exercised only by its own tests. See
// state.ts's comment on GuildDecision for why that is not the same anti-pattern
// BACKLOG.md B4 warns against for the abandoned TradeDecision: this is
// scaffolding on a locked sequencing table, not a permanently dead feature.
//
// THE ONE INVARIANT THAT MATTERS MOST: nextGuildPetition is a pure function of
// (player, year) with ZERO RNG draws. The design doc this implements
// (docs/superpowers/specs/2026-08-03-phase19d-economy-depth-design.md § D2)
// specified a `guildPetitionBaseChance` roll; that is deliberately dropped. A
// probabilistic petition is a Poisson process that can hand one ruler four
// petitions by year 15 and another zero by year 40 — building specialization
// would then be luck, not strategy, which undercuts the entire point of adding
// it (issue #51: "specialization is not visible"). More importantly, adding an
// RNG draw here would shift the shared seeded stream for every player and every
// later step of the year, which is exactly what the 21.0 golden fixture exists
// to catch. Zero new draws is what keeps 21.6 and 21.7 provably inert.

import buildingsData from '../../data/buildings.json'
import { GuildDecision, GuildType, PendingGuildPetition, PlayerState, SpecializedBuilding } from './state.ts'
import { charterSlotsForRank } from './ranks.ts'

interface GuildTypeDef {
  incomeMultiplier: number
  upkeepSurchargeFraction: number
  petitionMinRank: number
  petitionMinBuildingCount: number
  charterFee: number
}

const GUILDS: Record<GuildType, GuildTypeDef> = buildingsData.guilds.types as Record<GuildType, GuildTypeDef>
const REFUSAL_UNREST_SPIKE: number = buildingsData.guilds.guildRefusalUnrestSpike
const REFUSAL_COOLDOWN_YEARS: number = buildingsData.guilds.guildRefusalCooldownYears

// Fixed priority order for tie-breaking — deterministic on purpose, since this
// whole module is not allowed to reach for an RNG to break a tie.
export const GUILD_TYPES: readonly GuildType[] = ['cloth', 'iron', 'salt', 'wine']

export function guildDefinition(type: GuildType): GuildTypeDef {
  return GUILDS[type]
}

const BUILDING_KINDS = ['market', 'mill'] as const
type BuildingKind = (typeof BUILDING_KINDS)[number]

function totalOfKind(player: PlayerState, kind: BuildingKind): number {
  return kind === 'market' ? player.buildings.markets : player.buildings.mills
}

/** Buildings of this kind not already carrying a specialization. This is the
 *  pool a new petition can draw from — specialized buildings stay in
 *  `buildings.markets`/`mills`'s plain count too (D2's "minimizes blast radius"
 *  choice), so the unspecialized figure is always a subtraction, never a
 *  separately-tracked number that could drift from it. */
export function unspecializedCount(player: PlayerState, kind: BuildingKind): number {
  const specialized = (player.guilds ?? []).filter((g) => g.kind === kind).length
  return Math.max(0, totalOfKind(player, kind) - specialized)
}

export function activeGuildCount(player: PlayerState): number {
  return player.guilds?.length ?? 0
}

export function charterSlotsRemaining(player: PlayerState): number {
  return Math.max(0, charterSlotsForRank(player.rank) - activeGuildCount(player))
}

function onCooldown(player: PlayerState, type: GuildType, year: number): boolean {
  const until = player.guildCooldowns?.[type]
  return until !== undefined && year < until
}

// The building kind a petition of this type would target: whichever of
// market/mill has MORE room (so a petition preferentially uses up capacity
// where the ruler has the most of it), ties going to market. Returns undefined
// if neither kind meets the type's minimum.
function candidateKind(player: PlayerState, type: GuildType): BuildingKind | undefined {
  const def = GUILDS[type]
  const marketRoom = unspecializedCount(player, 'market')
  const millRoom = unspecializedCount(player, 'mill')
  const marketOk = marketRoom >= def.petitionMinBuildingCount
  const millOk = millRoom >= def.petitionMinBuildingCount
  if (!marketOk && !millOk) return undefined
  if (marketOk && millOk) return marketRoom >= millRoom ? 'market' : 'mill'
  return marketOk ? 'market' : 'mill'
}

/** The next guild petition to offer this player this year, or null if none is
 *  eligible. Deterministic: same (player, year) always produces the same
 *  answer, and calling it twice on an unchanged player is idempotent — there is
 *  no hidden roll consumed by calling it "too often". Callers (from 21.8) are
 *  expected to invoke this only when `player.pendingGuild` is undefined; the
 *  guard below is defensive, not the primary contract, since by the time
 *  year.ts's last step runs, this year's petition (if any) was already resolved
 *  at step 3.5.
 *
 *  Among multiple eligible types, selection is a YEAR-BASED ROTATION over the
 *  eligible set, not a "which type has the most room" ranking. An earlier draft
 *  picked whichever type had the highest `unspecializedCount - minBuildingCount`
 *  ("readiness") — but that quantity is mechanically larger for types with a
 *  LOWER threshold (iron's is 1, versus 2-3 for the others), so iron won nearly
 *  every multi-way comparison, not just genuine ties. A ruler who always grants
 *  could fill their entire charter allotment with iron before cloth/salt/wine
 *  were ever offered — the opposite of #51's "specialization is not visible"
 *  goal. Rotating by year is still pure and RNG-free (same year, same eligible
 *  set → same pick), but gives every eligible type a fair turn instead of a
 *  structural bias toward whichever has the smallest building-count gate. */
export function nextGuildPetition(player: PlayerState, year: number): PendingGuildPetition | null {
  if (player.pendingGuild) return null
  if (charterSlotsRemaining(player) <= 0) return null

  const eligible: Array<{ type: GuildType; kind: BuildingKind }> = []
  for (const type of GUILD_TYPES) {
    const def = GUILDS[type]
    if (player.rank < def.petitionMinRank) continue
    if (onCooldown(player, type, year)) continue
    const kind = candidateKind(player, type)
    if (!kind) continue
    eligible.push({ type, kind })
  }

  if (eligible.length === 0) return null
  const chosen = eligible[((year % eligible.length) + eligible.length) % eligible.length]
  return { kind: chosen.kind, specialization: chosen.type, queuedYear: year }
}

/** Outcome of answering (or failing to answer) `player.pendingGuild`. Pure —
 *  reports what changed rather than mutating `player`, so 21.8's reducer step
 *  stays the only place that writes it back onto the real state. */
export interface GuildResolution {
  guildsAfter: SpecializedBuilding[]
  guildCooldownsAfter: Partial<Record<GuildType, number>>
  /** Positive when a grant was honoured — the reducer subtracts this from taler. */
  talerSpent: number
  unrestDelta: number
  granted: boolean
  /** True when the player answered 'grant' but the treasury could not cover
   *  charterFee — resolves as a refusal (same unrest spike), distinguished here
   *  so the chronicle can say what actually happened rather than "refused". */
  refusedForUnaffordable: boolean
  /** True when no GuildDecision was submitted at all — an unanswered petition
   *  lapses to a refusal rather than silently persisting, so "never respond"
   *  cannot strictly dominate answering (PLAN.md's guild-design sanity note). */
  lapsed: boolean
}

/** Resolves `player.pendingGuild` against the player's submitted decision (or
 *  its absence). A no-op — identity result, no cost, no unrest — when there is
 *  no pending petition to answer, so callers do not need to guard on that
 *  themselves. */
export function resolveGuildPetition(player: PlayerState, decision: GuildDecision | undefined, year: number): GuildResolution {
  const existingGuilds = player.guilds ?? []
  const existingCooldowns = player.guildCooldowns ?? {}
  const noOp: GuildResolution = {
    guildsAfter: existingGuilds,
    guildCooldownsAfter: existingCooldowns,
    talerSpent: 0,
    unrestDelta: 0,
    granted: false,
    refusedForUnaffordable: false,
    lapsed: false
  }

  const pending = player.pendingGuild
  if (!pending) return noOp

  const def = GUILDS[pending.specialization]
  const lapsed = decision === undefined
  const wantsGrant = decision?.action === 'grant'
  const canAfford = player.taler >= def.charterFee

  if (wantsGrant && canAfford) {
    const newGuild: SpecializedBuilding = {
      kind: pending.kind,
      specialization: pending.specialization,
      incomeMultiplier: def.incomeMultiplier
    }
    return {
      guildsAfter: [...existingGuilds, newGuild],
      guildCooldownsAfter: existingCooldowns,
      talerSpent: def.charterFee,
      unrestDelta: 0,
      granted: true,
      refusedForUnaffordable: false,
      lapsed: false
    }
  }

  // Refusal — explicit, lapsed, or a grant the treasury could not cover. All
  // three read identically to the population/unrest system (same spike, same
  // cooldown): "declaring grant with an empty treasury also counts as a
  // refusal" is a deliberate anti-exploit (PLAN.md) — without it, a bankrupt
  // ruler could always answer 'grant' to dodge the refusal's unrest for free.
  return {
    guildsAfter: existingGuilds,
    guildCooldownsAfter: { ...existingCooldowns, [pending.specialization]: year + REFUSAL_COOLDOWN_YEARS },
    talerSpent: 0,
    unrestDelta: REFUSAL_UNREST_SPIKE,
    granted: false,
    refusedForUnaffordable: wantsGrant && !canAfford,
    lapsed
  }
}

/** Net annual gain from specializing one building of `type`, relative to
 *  leaving it unspecialized — the quantity that must be positive for every
 *  guild type, at every buildings.json income figure, for the D2 promise "no
 *  guild is ever worse" to hold. `baseIncomePerYear` is the building's own
 *  incomePerYear (market 500 or mill 600 today), passed in rather than looked
 *  up here, because 21.7's economics wiring is the only caller with the actual
 *  BuildingState-derived income figure in hand. */
export function netGuildBonus(type: GuildType, baseIncomePerYear: number): number {
  const def = GUILDS[type]
  const bonus = baseIncomePerYear * (def.incomeMultiplier - 1)
  const surcharge = baseIncomePerYear * def.upkeepSurchargeFraction
  return bonus - surcharge
}
