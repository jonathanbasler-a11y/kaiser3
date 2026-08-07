// Pure copy helpers for guild petition / promotion UI (Phase 21.10).
// Kept out of app.ts so Decision-parity and chronicle wording can be tested
// without jsdom.

import buildingsData from '../../data/buildings.json'
import { GuildType, PendingGuildPetition, PlayerChronicle } from '../engine/state.ts'
import { guildDefinition, guildGrossBonusIncome, guildUpkeepSurcharge } from '../engine/guilds.ts'
import { getAllRanks } from '../engine/ranks.ts'

const REFUSAL_SPIKE: number = buildingsData.guilds.guildRefusalUnrestSpike
const PRODUCTION = buildingsData.production

export function guildTypeLabel(type: GuildType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function buildingKindLabel(kind: 'market' | 'mill'): string {
  return kind === 'market' ? 'market' : 'mill'
}

export function petitionTitle(pending: PendingGuildPetition): string {
  return `${guildTypeLabel(pending.specialization)} guild petition`
}

export function petitionBody(pending: PendingGuildPetition): string {
  const def = guildDefinition(pending.specialization)
  const kind = buildingKindLabel(pending.kind)
  const base = pending.kind === 'market' ? PRODUCTION.market.incomePerYear : PRODUCTION.mill.incomePerYear
  const bonus = Math.round(guildGrossBonusIncome(pending.specialization, base))
  const surcharge = Math.round(guildUpkeepSurcharge(pending.specialization, base))
  return (
    `A ${guildTypeLabel(pending.specialization)} guild asks to charter one of your ${kind}s. `
    + `Granting costs ${def.charterFee.toLocaleString('en-US')} Taler and raises that ${kind}'s income `
    + `(+${bonus}/yr bonus, +${surcharge}/yr upkeep). `
    + `Refusing — or ending the year unanswered — costs +${REFUSAL_SPIKE} unrest.`
  )
}

export function petitionQueuedReportLine(pending: PendingGuildPetition): string {
  return (
    `A ${guildTypeLabel(pending.specialization)} guild petitions to specialize one of your `
    + `${buildingKindLabel(pending.kind)}s. Answer on the Build tab before End Year, or it lapses as a refusal.`
  )
}

export function guildResolutionReportLine(
  resolution: NonNullable<PlayerChronicle['guildResolution']>
): string {
  const type = guildTypeLabel(resolution.specialization)
  const kind = buildingKindLabel(resolution.kind)
  if (resolution.granted) {
    return (
      `You granted the ${type} guild a charter on a ${kind} `
      + `(−${resolution.charterFeePaid.toLocaleString('en-US')} Taler).`
    )
  }
  if (resolution.refusedForUnaffordable) {
    return (
      `You answered grant to the ${type} guild, but the treasury could not cover the charter fee — `
      + `treated as a refusal (+${resolution.unrestDelta} unrest).`
    )
  }
  if (resolution.lapsed) {
    return (
      `The ${type} guild's petition went unanswered and lapsed as a refusal `
      + `(+${resolution.unrestDelta} unrest).`
    )
  }
  return `You refused the ${type} guild's petition (+${resolution.unrestDelta} unrest).`
}

export function promotionCardBody(rankId: number, charterSlots: number | undefined): string {
  const rank = getAllRanks().find((r) => r.id === rankId)
  const description = rank?.description?.trim()
  const slots = charterSlots !== undefined
    ? ` Guild charter slots now: ${charterSlots}.`
    : ''
  if (description) return `${description}${slots}`
  return `The realm rises with you.${slots}`
}

export function unansweredPetitionPreviewWarning(pending: PendingGuildPetition): string {
  return (
    `Guild petition unanswered — End Year will refuse the ${guildTypeLabel(pending.specialization)} `
    + `charter (+${REFUSAL_SPIKE} unrest). Answer on the Build tab.`
  )
}

export function unaffordableGrantPreviewWarning(pending: PendingGuildPetition): string {
  const fee = guildDefinition(pending.specialization).charterFee
  return (
    `Grant selected, but the charter fee (${fee.toLocaleString('en-US')} Taler) will not clear after `
    + `this year's other spends — the engine treats that as a refusal (+${REFUSAL_SPIKE} unrest).`
  )
}
