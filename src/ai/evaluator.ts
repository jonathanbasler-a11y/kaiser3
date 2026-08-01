// STATE VALUATION — how an AI ruler judges how well it is doing.
//
// The load-bearing rule (CLAUDE.md): the evaluator scores states using the REAL
// engine functions, never a parallel approximation. It calls the actual
// calculateEventProbability() and the actual rankProgress(), so the AI's view of
// risk and of progress is exactly what the game will apply to it.
//
// Risk is priced by PERTURBATION rather than by a hand-written formula: we apply
// the expected annual event losses to a copy of the state and ask how much
// intrinsic utility that destroys. This matters more than it sounds. Valuing a
// lost peasant at the personality's raw `population` weight (5.0) badly
// understates it, because population is usually the BINDING rank requirement —
// where a peasant is really worth weights.rank / populationMin, two orders of
// magnitude more. Perturbation picks that up automatically, along with every
// other nonlinearity in the utility function, and cannot drift out of sync with
// it the way a parallel formula would.
//
// Without this, the AI declines to build a hospital — and a benchmark showed
// exactly why that is fatal: unmitigated plague costs ~19.7 peasants a year
// against natural growth of ~12, so an uninsured principality shrinks forever and
// never reaches the population thresholds the higher ranks require.

import economyData from '../../data/economy.json'
import buildingsData from '../../data/buildings.json'
import { PlayerState, clonePlayerState } from '../engine/state.ts'
import { getEventCatalog, calculateEventProbability } from '../engine/events/events.ts'
import { ExposureContext } from '../engine/scarcity.ts'
import { rankProgress, getNextRank } from '../engine/ranks.ts'

const POP_ECONOMY = economyData.population
const HARVEST = economyData.harvest
const PALACE = buildingsData.prestige.palace

// Share of a rank's value credited for holding the land the palace requires.
//
// The palace needs 13,000 ha and a ruler starts with 10,000, so the rank path has
// a PRECONDITION costing ~90,000 Taler in a single lump. rankProgress() rightly
// gives no credit for a half-met precondition — you cannot build half a palace on
// insufficient land — but that leaves a greedy planner facing a cliff: every
// partial land purchase scores as pure loss, so it never accumulates toward the
// jump and the entire rank path stays unreachable.
//
// Observed directly: expansionist runs split cleanly into "reached 13,000 ha,
// built the palace, won" and "stuck at 10,000 ha, palace 0, progress 0.000, lost".
//
// Sized as a NUDGE, not a driver. Making marginal land purchases self-financing
// on their own would need share > pricePerHectare x landRequirement / rankWeight
// ~= 0.39; at that strength it dominated the valuation and made the Builder
// strictly worse (385k -> 36k Taler, 16 -> 9.8 palace stages, win rate 100% ->
// 96.7%) because land crowded out the economy that funds the palace. At 0.15 it
// tips decisions at the margin without overriding them, and the palace stages
// themselves stay worth building on their own prestige value.
//
// Self-limiting: readiness caps at 1, so it cannot drive unbounded land buying.
const PALACE_LAND_ENABLEMENT_SHARE = 0.15

export interface PersonalityWeights {
  wealth: number
  population: number
  land: number
  production: number
  prestige: number
  rank: number
  unrest: number
  grainSecurity: number
  risk: number
  riskHorizonYears: number
}

function yearsOfFoodHeld(player: PlayerState): number {
  const required = player.population.peasants * POP_ECONOMY.populationGrainRequirement
  if (required <= 0) return Infinity
  return player.grainStock / required
}

// The reserve that actually buys safety, expressed as a 0-1 score.
//
// Deliberately measured against TWO years of food, not one. A drought harvests at
// 0.3x, so a single year in the barn does not cover it — and while the cap was one
// year the AI treated every grain above that as worthless and sold it. It then
// starved in the first drought and never recovered: realms shrank from ~1,600
// peasants to ~450 over two centuries. Grain above two years is genuinely surplus:
// it spoils at 30% a year and the barns cannot hold it anyway.
const SECURE_RESERVE_YEARS = 2

function grainSecurityRatio(player: PlayerState): number {
  return Math.min(1, yearsOfFoodHeld(player) / SECURE_RESERVE_YEARS)
}

// The feeding adequacy this player can expect to achieve NEXT year given the grain
// they are holding now. Famine exposure keys off exactly this (scarcity.ts), so it
// is what a forward-looking evaluation should use: a ruler sitting on full stores
// faces no famine risk, one running on empty faces a lot.
//
// Capped at one year, unlike the security score above: you cannot be better than
// fully fed, however deep the barns.
export function projectedFeedAdequacy(player: PlayerState): number {
  return Math.min(1, yearsOfFoodHeld(player))
}

// F6: next year's weather is exogenous — nothing in player state predicts it,
// unlike feedAdequacy above, which the ruler's own grain stock genuinely
// determines. The one-year-ahead risk pricing needs E[harvestShortfall] and
// E[harvestExcess] — the TRUE expectation of scarcity.ts's max(0, ...)
// formulas over the weather-band distribution, computed directly here rather
// than derived from a single "expected multiplier".
//
// That distinction matters: the band-weighted mean multiplier is ~1.02 (see
// economy.json's own _harvestNote, skewed above 1 by design), so
// max(0, 1 - 1.02) collapses to exactly 0 — plugging the mean multiplier into
// the shortfall formula would price drought risk at zero FOREVER regardless
// of exposure, the textbook Jensen's-gap trap (E[f(X)] != f(E[X]) for a
// nonlinear f). Computing E[max(0, 1-m)] and E[max(0, m-1)] directly avoids
// it, and gives the same result the real per-year path would average to over
// many seeds. Constants, not per-player projections — computed once at
// module load, same shape as any other precomputed weight in this file.
//
// Without this the AI would price drought/flood risk at exactly zero and
// never value a well or a dike for it — the same failure mode this file
// already documents for hospitals above.
interface WeatherBandLike { multiplier: number; weight: number }

function weightedMean(bands: WeatherBandLike[], valueOf: (band: WeatherBandLike) => number): number {
  const totalWeight = bands.reduce((sum, band) => sum + band.weight, 0)
  const totalValue = bands.reduce((sum, band) => sum + valueOf(band) * band.weight, 0)
  return totalWeight > 0 ? totalValue / totalWeight : 0
}

const WEATHER_BANDS = HARVEST.weatherBands as WeatherBandLike[]
const PROJECTED_HARVEST_SHORTFALL = weightedMean(WEATHER_BANDS, (b) => Math.max(0, 1 - b.multiplier))
const PROJECTED_HARVEST_EXCESS = weightedMean(WEATHER_BANDS, (b) => Math.max(0, b.multiplier - 1))

export function projectedHarvestShortfall(): number {
  return PROJECTED_HARVEST_SHORTFALL
}

export function projectedHarvestExcess(): number {
  return PROJECTED_HARVEST_EXCESS
}

// How much headroom beyond the present workforce still counts as useful land.
// Roughly a generation's worth of growth: enough that a ruler keeps buying room to
// expand into, not so much that it hoards hectares nobody will ever work.
const LAND_HEADROOM_FACTOR = 1.8

function usableLand(player: PlayerState): number {
  const totalLand = player.land.farmland + player.land.buildingLand
  const workforceCapacity = player.population.peasants * HARVEST.laborHectaresPerPeasant
  return Math.min(totalLand, workforceCapacity * LAND_HEADROOM_FACTOR)
}

// Everything the ruler is worth right now, ignoring future risk.
export function intrinsicUtility(player: PlayerState, weights: PersonalityWeights): number {
  const productionBuildings = player.buildings.markets + player.buildings.mills
  // A cathedral represents a comparable investment to a completed palace, so it is
  // valued as a full palace's worth of prestige rather than as a single stage.
  const prestigeStages = player.buildings.palace + player.buildings.cathedral * 16

  let utility = 0
  utility += player.taler * weights.wealth
  utility += player.population.peasants * weights.population
  // Land is valued only as far as it can be USED. Farmland is labour-gated at 5 ha
  // per peasant, so hectares far beyond the workforce are dead weight — valuing
  // them equally is what once had the Expansionist buying 9,574 idle hectares.
  //
  // But land just beyond the current workforce is not idle, it is HEADROOM: it is
  // what the next generation of peasants will work, and population is the binding
  // requirement for every senior rank. So usable land is measured against the
  // workforce a realm can plausibly grow into, not the one it has today.
  utility += usableLand(player) * weights.land
  utility += productionBuildings * weights.production
  utility += prestigeStages * weights.prestige
  // A continuous rank ladder: whole ranks earned, plus fractional progress toward
  // the next. The fractional part is what makes multi-year investment in the win
  // condition legible to a one-year planner, which cannot otherwise see a step
  // function four palace stages away.
  utility += (player.rank + rankProgress(player)) * weights.rank
  utility -= player.population.unrest * weights.unrest
  utility += grainSecurityRatio(player) * weights.grainSecurity
  utility += palaceLandEnablement(player) * weights.rank * PALACE_LAND_ENABLEMENT_SHARE

  return utility
}

// Readiness (0-1) to build the palace at all, measured in land held. Applies
// whenever the next rank has a palace requirement.
//
// Deliberately NOT gated on "palace stages still outstanding". An earlier version
// switched the term off once the ruler held the stages the next rank needed, which
// put a ~540,000-utility cliff at exactly 4 stages: building the 4th was a
// catastrophic loss, so the AI refused to, and the Builder's palace stalled at an
// average of 2.8 stages instead of the 16 it had been completing. Any term that
// vanishes on meeting a requirement will bribe the planner not to meet it — this
// one varies only with land, and so stays smooth.
function palaceLandEnablement(player: PlayerState): number {
  const next = getNextRank(player.rank)
  if (next?.requirements.palaceStages === undefined) return 0

  const totalLand = player.land.farmland + player.land.buildingLand
  return Math.min(1, totalLand / PALACE.landRequirement)
}

// A copy of the player with one year's EXPECTED event losses already applied.
function applyExpectedLosses(player: PlayerState, context: ExposureContext): PlayerState {
  // Hand-written clone (state.ts) instead of JSON.parse(JSON.stringify()) —
  // this runs once per candidate-seed evaluation, same hot path as the
  // isolate()/advanceYear() clones this pass already replaced. `projected` is
  // purely a scratch valuation object (see the comment on intrinsicUtility
  // below), never fed back into the simulation, so a field-for-field copy is
  // exactly as safe as the JSON round-trip it replaces.
  const projected = clonePlayerState(player)

  for (const event of getEventCatalog()) {
    const probability = calculateEventProbability(event, player, context)
    if (probability <= 0) continue

    // Mean severity is 1.0 (the jitter band is symmetric about it), reduced when a
    // mitigation building is present — mirroring applyEventLoss()'s severityFactor.
    const mitigated = (player.buildings as unknown as Record<string, number>)[event.mitigation.building] > 0
    const severityFactor = mitigated ? 1 - event.mitigation.severityReduction : 1
    const expectedShare = probability * severityFactor

    switch (event.loss.type) {
      case 'population':
        projected.population.peasants = Math.max(
          0,
          projected.population.peasants - player.population.peasants * event.loss.fraction * expectedShare
        )
        break
      case 'gold': {
        const magnitude = Math.min(player.taler, Math.max(player.taler * event.loss.fraction, event.loss.minimum ?? 0))
        projected.taler = Math.max(0, projected.taler - magnitude * expectedShare)
        break
      }
      case 'buildings': {
        // Fractional building counts are fine here: this state is a hypothetical
        // used only for valuation, never fed back into the simulation.
        const lossShare = event.loss.fraction * expectedShare
        projected.buildings.markets = Math.max(0, projected.buildings.markets - player.buildings.markets * lossShare)
        projected.buildings.mills = Math.max(0, projected.buildings.mills - player.buildings.mills * lossShare)
        break
      }
      case 'grain': {
        // F6 (drought). Grain has no weight in intrinsicUtility() directly — its
        // value shows up through grainSecurityRatio(), so pricing this loss is
        // what makes the AI value a well against drought the same way it values
        // a granary against famine.
        projected.grainStock = Math.max(0, projected.grainStock - player.grainStock * event.loss.fraction * expectedShare)
        break
      }
      case 'farmland': {
        // F6 (flood). Reduces the land itself, not just this year's yield —
        // priced through usableLand()'s land weight, same as any other loss of
        // productive hectares.
        projected.land.farmland = Math.max(0, projected.land.farmland - player.land.farmland * event.loss.fraction * expectedShare)
        break
      }
    }
  }

  return projected
}

// Expected utility destroyed by events over one year, in the same units as
// intrinsicUtility — so risk is directly comparable to what it threatens.
export function expectedAnnualEventCost(
  player: PlayerState,
  context: ExposureContext,
  weights: PersonalityWeights
): number {
  const damaged = applyExpectedLosses(player, context)
  return Math.max(0, intrinsicUtility(player, weights) - intrinsicUtility(damaged, weights))
}

export function evaluateState(
  player: PlayerState,
  context: ExposureContext,
  weights: PersonalityWeights
): number {
  const risk = expectedAnnualEventCost(player, context, weights)
  return intrinsicUtility(player, weights) - risk * weights.risk * weights.riskHorizonYears
}
