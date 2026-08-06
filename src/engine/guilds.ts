// Guild petitions and building specialization (D2, GitHub issues #49/#51).
//
// PHASE 21.6 added the pure petition/resolution logic with ZERO callers.
// PHASE 21.7 (this pass) wires the income/upkeep math and destruction pruning
// into buildings.ts, events.ts, and espionage.ts — but STILL byte-identical in
// every real game, because no player can hold a guild until 21.8 makes
// petitions actually fire (nextGuildPetition/resolveGuildPetition still have no
// caller in year.ts). See state.ts's comment on GuildDecision for why two
// tranches of "wired but unreachable" is not the TradeDecision/BACKLOG-B4
// anti-pattern: this is scaffolding on a locked sequencing table, not a
// permanently dead feature.
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

/** Gross extra income one specialized building of `type` earns per year, on
 *  top of the base `incomePerYear` it already earns via the ordinary
 *  markets/mills count (specialized buildings are NOT removed from
 *  `BuildingState.markets`/`mills` — see the comment on `SpecializedBuilding`
 *  in state.ts). Itemized separately from `guildUpkeepSurcharge` below rather
 *  than netted together, matching this codebase's established "explain every
 *  number" convention (`calculateUpkeepBreakdown`'s own comment) — the 21.10 UI
 *  can then show "guild bonus +X" and "guild surcharge -Y" as two lines instead
 *  of one number a player cannot audit. */
export function guildGrossBonusIncome(type: GuildType, baseIncomePerYear: number): number {
  return baseIncomePerYear * (guildDefinition(type).incomeMultiplier - 1)
}

/** The upkeep cost of running a guild — the flip side of the bonus above. */
export function guildUpkeepSurcharge(type: GuildType, baseIncomePerYear: number): number {
  return baseIncomePerYear * guildDefinition(type).upkeepSurchargeFraction
}

/** Net annual gain from specializing one building of `type`, relative to
 *  leaving it unspecialized — the quantity that must be positive for every
 *  guild type, at every buildings.json income figure, for the D2 promise "no
 *  guild is ever worse" to hold. `baseIncomePerYear` is the building's own
 *  incomePerYear (market 500 or mill 600 today), passed in rather than looked
 *  up here so this stays pure and callable from a static data-integrity test
 *  without constructing a BuildingState at all. */
export function netGuildBonus(type: GuildType, baseIncomePerYear: number): number {
  return guildGrossBonusIncome(type, baseIncomePerYear) - guildUpkeepSurcharge(type, baseIncomePerYear)
}

/** Net annual Taler a specific held guild adds, over and above what the same
 *  building would earn unspecialized. The per-instance form of netGuildBonus,
 *  resolving the building's own incomePerYear from its kind — this is what the
 *  AI evaluator capitalises into market-equivalents (see evaluator.ts). */
export function guildNetAnnualGain(guild: SpecializedBuilding): number {
  return netGuildBonus(guild.specialization, baseIncomePerYearForKind(guild.kind))
}

const PRODUCTION = buildingsData.production

function baseIncomePerYearForKind(kind: BuildingKind): number {
  return kind === 'market' ? PRODUCTION.market.incomePerYear : PRODUCTION.mill.incomePerYear
}

/** Total gross guild bonus income across every specialized building a player
 *  holds. Reads each building's OWN incomePerYear from data/buildings.json
 *  rather than requiring the caller to pass it in, since by 21.7 there is a
 *  real BuildingState-independent call site (year.ts's income step) that only
 *  has `player.guilds` in hand, not a per-building income figure. Zero when
 *  `guilds` is absent or empty — the exact case that keeps every real game
 *  byte-identical until 21.8 makes petitions fire. */
export function totalGuildBonusIncome(guilds: SpecializedBuilding[] | undefined): number {
  return (guilds ?? []).reduce((sum, g) => sum + guildGrossBonusIncome(g.specialization, baseIncomePerYearForKind(g.kind)), 0)
}

/** Total upkeep surcharge across every specialized building a player holds —
 *  the itemized upkeep line `calculateUpkeepBreakdown` (buildings.ts) adds. */
export function totalGuildUpkeepSurcharge(guilds: SpecializedBuilding[] | undefined): number {
  return (guilds ?? []).reduce((sum, g) => sum + guildUpkeepSurcharge(g.specialization, baseIncomePerYearForKind(g.kind)), 0)
}

// PHASE 21.7 — prune-on-destruction.
//
// Buildings are fungible counts, not tracked identities (see the comment on
// GuildDecision in state.ts), so when fire or sabotage destroys a market or
// mill there is no way to know whether the specific building that burned was
// a specialized one. Rather than an extra RNG draw to decide, this is
// deterministic: whenever the number of guilds recorded for a kind exceeds the
// number of buildings of that kind actually standing, the LOWEST-NET-VALUE
// guild(s) of that kind are pruned first — an unlucky fire costs a player
// their weakest specialization, not their best investment. Ties broken by
// GUILD_TYPES order for full determinism.
//
// Ranked by (incomeMultiplier - upkeepSurchargeFraction) — the actual net
// benefit — not by incomeMultiplier alone. With today's data/buildings.json
// the two orderings happen to coincide (iron < cloth < salt < wine either
// way), but nothing enforces that going forward: a future guild type with a
// high multiplier and a disproportionately higher surcharge would rank
// "richest-looking" by raw multiplier while actually being the weakest
// investment, and this must keep pruning the weakest one, not the flashiest.
//
// Called from events.ts's destroyProductionBuildings and espionage.ts's
// removeOneProductionBuilding, right after they decrement the building count,
// so player.guilds can never silently drift out of sync with what a player
// actually owns. Currently a no-op in every real ENGINE-GENERATED game,
// because no player has any guilds until 21.8 makes petitions fire.
// persist.ts's save-file loader has tolerated a hand-crafted guilds[] array
// since 21.6, and this tranche is what makes it stop being inert if loaded —
// not reachable through any normal gameplay path, but worth naming precisely.
export function pruneGuildsToFit(player: PlayerState): SpecializedBuilding[] {
  const guilds = player.guilds
  if (!guilds || guilds.length === 0) return guilds ?? []

  const netValue = (g: SpecializedBuilding) =>
    g.incomeMultiplier - guildDefinition(g.specialization).upkeepSurchargeFraction

  let result = guilds
  for (const kind of BUILDING_KINDS) {
    const total = totalOfKind(player, kind)
    const ofKind = result.filter((g) => g.kind === kind)
    const excess = ofKind.length - total
    // `< 1`, not `<= 0`: `total` can be FRACTIONAL when the caller is the AI
    // evaluator's hypothetical damaged state (applyExpectedLosses reduces
    // building counts by an expected-loss share). A partial excess prunes
    // nothing — slice() truncates a fractional count to 0 — so returning early
    // states that step rule outright instead of falling through to a sort and
    // an empty slice that allocate for no result.
    if (excess < 1) continue

    const weakestFirst = [...ofKind].sort((a, b) => {
      const diff = netValue(a) - netValue(b)
      if (diff !== 0) return diff
      return GUILD_TYPES.indexOf(a.specialization) - GUILD_TYPES.indexOf(b.specialization)
    })
    const toRemove = new Set(weakestFirst.slice(0, excess))
    result = result.filter((g) => !(g.kind === kind && toRemove.has(g)))
  }
  return result
}
