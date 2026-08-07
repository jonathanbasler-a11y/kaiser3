// GUILD BENCH — measures what the guild mechanic actually DOES in play, and
// what the shipped default game feels like to win. Run with `npm run guild-bench`.
//
// WHY THIS EXISTS SEPARATELY FROM `npm run balance`.
//
// The balance gate measures the shape of the outcome distribution: margin
// flatness, loss persistence, lead volatility, no death spiral. Those criteria
// are about fairness and anti-snowball, and a mechanic can be thoroughly
// degenerate without moving any of them. 21.8 proved this concretely — with no
// AI answer path at all, EVERY petition for EVERY ruler lapsed to a refusal,
// mean rank at decade 6 fell from 5.43 to 1.99, and the gate still returned
// PASS on all five criteria, because a uniform tax on the whole field is
// perfectly fair. The gate could not see a collapsing game; it could only see
// that the collapse was even-handed.
//
// So this script counts the mechanic-level things a human would notice while
// watching a playthrough:
//   * how often a petition is offered, and how often the answer is yes
//   * whether the grant/refuse split differs BY ARCHETYPE and BY POSITION, or
//     whether everyone converges on the same answer (which would mean the
//     charter is not a decision at all)
//   * how many charters a ruler actually ends up holding, and of which types
//     (#51 is "specialization is not visible" — one iron guild in 60 years is
//     not visible)
//   * the shipped default game's win rate for the seat the human occupies
//
// The last one needs a careful word on method, because it is easy to overclaim.
// There is no human in a headless run, so the human seat is played by the AI
// planner. CLAUDE.md's Decision-parity invariant says the planner emits the same
// Decision[] a human can, through the same reducer — but that is parity of the
// ACTION SPACE, not of skill, and "the planner is therefore a competent human"
// does not follow from it. This script's own output refutes the singular: the
// same planner under the same rules spans 30%-90% purely by which weight vector
// it carries, so any single figure here is an unweighted mean over five
// arbitrary archetypes, not a property of human play.
//
// So treat it as a CONTROL, not an absolute. Held constant across a tuning pass
// it answers "did this change make the game easier?" — which is the question
// 21.9 needed. It does not answer "how often will the owner win".
//
// One further limit, which matters more than either: as of 21.9 there is no
// guild UI at all (`grep -i guild src/ui` returns nothing — it is 21.10's
// deliverable), so in the shipped build every HUMAN petition lapses to a
// refusal, spike and all. The seat measured below answers its petitions. Until
// 21.10 lands, this number is an upper bound on a build nobody can play.

import { getPersonalities, getPersonality } from '../src/ai/personalities.ts'
import { aiCompetitor, runMatch, Competitor } from '../src/ai/sim.ts'
import { Chronicle, GameState, GuildType } from '../src/engine/state.ts'
import { charterSlotsForRank } from '../src/engine/ranks.ts'
import { guildNetAnnualGain } from '../src/engine/guilds.ts'
import buildingsData from '../data/buildings.json'

const MAX_YEARS = Number(process.argv[3] ?? 60)
const RUNS = Number(process.argv[2] ?? 12)

const GUILD_TYPES: GuildType[] = ['cloth', 'iron', 'salt', 'wine']

interface GuildTally {
  petitionsQueued: number
  resolutions: number
  granted: number
  refusedExplicitly: number
  lapsed: number
  refusedForUnaffordable: number
  feesPaid: number
  firstGrantYears: number[]
  guildsHeldAtEnd: number
  charterSlotsAtEnd: number
  bySpecialization: Record<GuildType, number>
}

function emptyTally(): GuildTally {
  return {
    petitionsQueued: 0, resolutions: 0, granted: 0, refusedExplicitly: 0,
    lapsed: 0, refusedForUnaffordable: 0, feesPaid: 0, firstGrantYears: [],
    guildsHeldAtEnd: 0, charterSlotsAtEnd: 0,
    bySpecialization: { cloth: 0, iron: 0, salt: 0, wine: 0 }
  }
}

// Folds one match's chronicles into a tally for one seat. `observeYear` gives
// the post-year state and that year's chronicle, which is where every guild
// event is recorded — no re-derivation from final state, so what this counts is
// exactly what the year report would have shown the player.
function observeInto(tally: GuildTally, playerId: string) {
  let firstGrantThisMatch: number | undefined
  return {
    observe: (state: GameState, chronicle: Chronicle) => {
      const report = chronicle.playerReports[playerId]
      if (!report) return
      if (report.guildPetition) tally.petitionsQueued++
      const resolution = report.guildResolution
      if (resolution) {
        tally.resolutions++
        if (resolution.granted) {
          tally.granted++
          tally.feesPaid += resolution.charterFeePaid
          if (firstGrantThisMatch === undefined) firstGrantThisMatch = state.year
        } else if (resolution.lapsed) {
          tally.lapsed++
        } else if (resolution.refusedForUnaffordable) {
          tally.refusedForUnaffordable++
        } else {
          tally.refusedExplicitly++
        }
      }
    },
    finish: (state: GameState) => {
      if (firstGrantThisMatch !== undefined) tally.firstGrantYears.push(firstGrantThisMatch)
      const player = state.players[playerId]
      if (!player) return
      tally.guildsHeldAtEnd += player.guilds?.length ?? 0
      tally.charterSlotsAtEnd += charterSlotsForRank(player.rank)
      for (const guild of player.guilds ?? []) tally.bySpecialization[guild.specialization]++
    }
  }
}

const pct = (numerator: number, denominator: number) =>
  denominator === 0 ? '   n/a' : ((numerator / denominator) * 100).toFixed(0).padStart(4) + '%'
const mean = (total: number, count: number) => (count === 0 ? 0 : total / count)

// ---------------------------------------------------------------------------
// 1. Charter economics, straight off the data. No simulation — this is the
//    arithmetic BACKLOG S10 flagged, recomputed every run so a data edit that
//    breaks the payback story is visible immediately rather than at the next
//    audit.
// ---------------------------------------------------------------------------
console.log('=== Charter economics (data/buildings.json, no simulation) ===')
console.log('type   | fee    | net/yr market | payback | net/yr mill | payback')
console.log('-------|--------|---------------|---------|-------------|--------')
for (const type of GUILD_TYPES) {
  const def = buildingsData.guilds.types[type]
  const onMarket = guildNetAnnualGain({ kind: 'market', specialization: type, incomeMultiplier: def.incomeMultiplier })
  const onMill = guildNetAnnualGain({ kind: 'mill', specialization: type, incomeMultiplier: def.incomeMultiplier })
  console.log(
    `${type.padEnd(6)} | ${String(def.charterFee).padStart(6)} | ${onMarket.toFixed(0).padStart(13)} | ` +
    `${(def.charterFee / onMarket).toFixed(1).padStart(6)}y | ${onMill.toFixed(0).padStart(11)} | ` +
    `${(def.charterFee / onMill).toFixed(1).padStart(6)}y`
  )
}
const market = buildingsData.production.market
console.log(
  `(a market) | ${String(market.buildCost).padStart(4)} | ` +
  `${(market.incomePerYear - market.upkeepPerYear).toFixed(0).padStart(13)} | ` +
  `${(market.buildCost / (market.incomePerYear - market.upkeepPerYear)).toFixed(1).padStart(6)}y`
)

// ---------------------------------------------------------------------------
// 2. Per-archetype guild behaviour in a contested field. Solo matches would
//    measure the mechanic in a vacuum; the interesting question is what a ruler
//    does when a treasury also has rivals, war, and espionage competing for it.
// ---------------------------------------------------------------------------
console.log(`\n=== Guild behaviour by archetype (${RUNS} matches each, ${MAX_YEARS}y, vs 2 rivals) ===`)
console.log('Archetype          | petitions | grant | refuse | lapse | unafford | held/slots | 1st grant | fees')
console.log('-------------------|-----------|-------|--------|-------|----------|------------|-----------|------')

const personalities = getPersonalities()
const fieldTally = emptyTally()
const perArchetypeMix: Array<[string, GuildTally]> = []

for (const personality of personalities) {
  const tally = emptyTally()
  // Two rivals drawn from the OTHER archetypes, so the subject is never playing
  // against copies of itself (which would make the grant/refuse split look more
  // uniform than it is).
  const others = personalities.filter((p) => p.id !== personality.id)
  for (let i = 0; i < RUNS; i++) {
    const competitors: Competitor[] = [
      aiCompetitor('subject', personality.id),
      aiCompetitor('rival1', others[i % others.length].id),
      aiCompetitor('rival2', others[(i + 1) % others.length].id)
    ]
    const hook = observeInto(tally, 'subject')
    const result = runMatch(competitors, 500 + i * 131, MAX_YEARS, hook.observe)
    hook.finish(result.finalState)
  }

  fieldTally.petitionsQueued += tally.petitionsQueued
  fieldTally.resolutions += tally.resolutions
  fieldTally.granted += tally.granted
  perArchetypeMix.push([personality.name, tally])

  const firstGrant = tally.firstGrantYears.length
    ? (tally.firstGrantYears.reduce((a, b) => a + b, 0) / tally.firstGrantYears.length).toFixed(0) + 'y'
    : '  never'
  console.log(
    `${personality.name.padEnd(18)} | ${mean(tally.petitionsQueued, RUNS).toFixed(1).padStart(9)} | ` +
    `${pct(tally.granted, tally.resolutions)} | ${pct(tally.refusedExplicitly, tally.resolutions)} | ` +
    `${pct(tally.lapsed, tally.resolutions)} | ${pct(tally.refusedForUnaffordable, tally.resolutions)} | ` +
    `${mean(tally.guildsHeldAtEnd, RUNS).toFixed(1).padStart(4)}/${mean(tally.charterSlotsAtEnd, RUNS).toFixed(1).padEnd(5)} | ` +
    `${firstGrant.padStart(9)} | ${mean(tally.feesPaid, RUNS).toFixed(0).padStart(5)}`
  )
  for (const type of GUILD_TYPES) fieldTally.bySpecialization[type] += tally.bySpecialization[type]
}

console.log(
  `\nField grant rate: ${pct(fieldTally.granted, fieldTally.resolutions)} ` +
  `(${fieldTally.granted}/${fieldTally.resolutions} resolutions from ${fieldTally.petitionsQueued} petitions)`
)
console.log(
  '  A field grant rate at either extreme means the charter is not a decision:\n' +
  '  0% is an unrest tax nobody can dodge, 100% is a button everyone presses.'
)

// D2 acceptance criterion, verbatim: "Builder and Merchant show meaningfully
// different guild compositions (not all rulers specializing identically)". The
// design doc makes composition the trigger for another pass over the
// multipliers and surcharges, so it has to be printed PER ARCHETYPE — a field
// aggregate cannot answer it, and an earlier draft of this script computed the
// per-archetype numbers and then threw them away.
//
// Read this one knowing what generates it: nextGuildPetition rotates the
// offered type by YEAR over the eligible set (engine/guilds.ts), with no
// reference to personality. Archetypes therefore differ in composition only
// through which petitions they are ELIGIBLE for (rank and building-count gates)
// and which they accept — never through preference. Near-identical rows are
// the expected result of that design, not necessarily a tuning failure, but
// they do mean D2's criterion is unmet and should be argued rather than assumed.
console.log('\n--- Guild composition by archetype (D2: must not all specialize identically) ---')
console.log('Archetype          | ' + GUILD_TYPES.map((t) => t.padStart(5)).join(' | ') + ' | total | shares')
console.log('-------------------|' + GUILD_TYPES.map(() => '-------').join('|') + '|-------|-------')
for (const [name, tally] of perArchetypeMix) {
  const total = GUILD_TYPES.reduce((sum, t) => sum + tally.bySpecialization[t], 0)
  const shares = GUILD_TYPES.map((t) => (total === 0 ? ' -- ' : ((tally.bySpecialization[t] / total) * 100).toFixed(0).padStart(3) + '%'))
  console.log(
    `${name.padEnd(18)} | ${GUILD_TYPES.map((t) => String(tally.bySpecialization[t]).padStart(5)).join(' | ')} | ` +
    `${String(total).padStart(5)} | ${shares.join(' ')}`
  )
}
console.log(
  'Field total: ' + GUILD_TYPES.map((t) => `${t} ${fieldTally.bySpecialization[t]}`).join(', ')
)

// ---------------------------------------------------------------------------
// 3. The shipped default game. app.ts:326 defaults to 2 rivals over 60 years,
//    and app.ts:397 assigns them personalities[0] and personalities[1] — so
//    this is the exact field a player who presses "Begin Your Reign" without
//    touching the steppers actually faces.
//
//    OWNER TARGET (2026-08-07): 30-40% for the human seat. Fair share in a
//    three-way field is 33.3%, so this band is "the player is a peer of the
//    field, not its master." Stated by the project owner as an explicit
//    ceiling as much as a floor: "a win rate of 30-40% is ok I do not need it
//    to be too easy." A tuning pass that pushes this above 40% has made the
//    game easier, whatever else it improved.
//
//    Every cell below is n=RUNS and the summary is n=5*RUNS. At the default
//    that is 60 matches for the whole figure and 12 per row — wide intervals,
//    so read tens of points, not single ones. See BACKLOG S11 for the full
//    finding and its caveats.
// ---------------------------------------------------------------------------
// SEAT-SYMMETRY CONTROL, first. The win rate below is only a difficulty
// measurement if the seat labelled 'you' is not structurally advantaged or
// disadvantaged by its position in the competitor list — espionage and war
// targeting both iterate rivals, and a tie broken by iteration order would show
// up as difficulty when it is really seating. Three IDENTICAL archetypes must
// split roughly 33/33/33; anything else means the number after it is measuring
// the wrong thing.
console.log(`\n=== Seat-symmetry control (3 identical archetypes, ${RUNS} matches each) ===`)
console.log('Archetype          |  seat1 |  seat2 |  seat3 | none')
console.log('-------------------|--------|--------|--------|-----')
const seatTotals: Record<string, number> = { seat1: 0, seat2: 0, seat3: 0 }
let seatMatches = 0
for (const personality of personalities) {
  const wins: Record<string, number> = { seat1: 0, seat2: 0, seat3: 0 }
  let none = 0
  for (let i = 0; i < RUNS; i++) {
    const competitors: Competitor[] = [
      aiCompetitor('seat1', personality.id),
      aiCompetitor('seat2', personality.id),
      aiCompetitor('seat3', personality.id)
    ]
    const result = runMatch(competitors, 3300 + i * 7717, MAX_YEARS)
    if (result.winnerId) wins[result.winnerId]++
    else none++
  }
  for (const seat of ['seat1', 'seat2', 'seat3']) seatTotals[seat] += wins[seat]
  seatMatches += RUNS
  console.log(
    `${personality.name.padEnd(18)} | ${pct(wins.seat1, RUNS)}  | ${pct(wins.seat2, RUNS)}  | ` +
    `${pct(wins.seat3, RUNS)}  | ${none}`
  )
}
// The per-archetype rows above are individually noisy at this sample size; the
// aggregate is the number that actually licenses the win rate further down, so
// print it rather than leaving a reader to sum the column by eye. Anything far
// from 33/33/33 means seat POSITION confers an advantage — espionage and war
// both iterate rivals, and a tie broken by iteration order would masquerade as
// difficulty — and the shipped-default figure below would be measuring that
// instead.
console.log(
  '-------------------|--------|--------|--------|-----\n' +
  `${'ALL ARCHETYPES'.padEnd(18)} | ${pct(seatTotals.seat1, seatMatches)}  | ` +
  `${pct(seatTotals.seat2, seatMatches)}  | ${pct(seatTotals.seat3, seatMatches)}  | ` +
  `(n=${seatMatches})`
)

const SHIPPED_RIVALS = [personalities[0].id, personalities[1].id]
console.log(
  `\n=== Shipped default: you + 2 rivals (${getPersonality(SHIPPED_RIVALS[0]).name}, ` +
  `${getPersonality(SHIPPED_RIVALS[1]).name}), ${MAX_YEARS}y, ${RUNS} matches per seat ===`
)
console.log('Human seat plays  | win rate | wins | rival1 | rival2 | none')
console.log('------------------|----------|------|--------|--------|-----')

let humanWins = 0
let humanMatches = 0
for (const personality of personalities) {
  let wins = 0
  let r1 = 0
  let r2 = 0
  let none = 0
  for (let i = 0; i < RUNS; i++) {
    const competitors: Competitor[] = [
      aiCompetitor('you', personality.id),
      aiCompetitor('rival1', SHIPPED_RIVALS[0]),
      aiCompetitor('rival2', SHIPPED_RIVALS[1])
    ]
    const result = runMatch(competitors, 9000 + i * 7717, MAX_YEARS)
    if (result.winnerId === 'you') wins++
    else if (result.winnerId === 'rival1') r1++
    else if (result.winnerId === 'rival2') r2++
    else none++
  }
  humanWins += wins
  humanMatches += RUNS
  console.log(
    `${personality.name.padEnd(17)} | ${pct(wins, RUNS)}    | ${String(wins).padStart(2)}/${RUNS} | ` +
    `${pct(r1, RUNS)}  | ${pct(r2, RUNS)}  | ${none}`
  )
}

const humanWinRate = humanWins / humanMatches
const inBand = humanWinRate >= 0.3 && humanWinRate <= 0.4
console.log(
  `\nHuman-seat win rate: ${(humanWinRate * 100).toFixed(1)}% ` +
  `(${humanWins}/${humanMatches})  target 30-40%  ${inBand ? 'IN BAND' : 'OUT OF BAND'}`
)
console.log('  Fair share in a 3-way field is 33.3%. Above 40% the game got easier.')
