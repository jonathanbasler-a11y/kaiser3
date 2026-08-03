// One-off generator for data/positiveEvents.json. Run manually with
// `npx tsx scripts/gen-positive-events.ts > data/positiveEvents.json` — like
// gen-golden-fixture.ts, this does NOT run automatically; the output is
// committed and reviewed like any other content change.
//
// ~200 small, flavorful, explicitly NOT-game-changing positive events (Phase
// 18C playtest request: "add random positive events... not game changing but
// good enough to be happy about... some funny ones as well"). Combinatorial
// templates give real sentence variety without 200 individually hand-typed
// lines; a block of fully standalone one-offs carries the deliberate humor
// the template sentences can't (a joke needs a specific shape, not a slot).

interface Entry { id: string; text: string; rewardType: 'taler' | 'population' | 'grain' | 'unrest' }

const entries: Entry[] = []
const seen = new Set<string>()

function add(rewardType: Entry['rewardType'], text: string) {
  if (seen.has(text)) return // combinatorics can coincidentally repeat; skip rather than duplicate
  seen.add(text)
  const id = `${rewardType}-${String(entries.filter(e => e.rewardType === rewardType).length + 1).padStart(3, '0')}`
  entries.push({ id, text, rewardType })
}

// A subject x action cross product overshoots the target count fast (16x10 =
// 160 for one category alone). Evenly stride through the full combinatorial
// list down to `target` rather than truncating, so the surviving subset keeps
// variety across BOTH subjects and actions instead of favoring whichever
// subject happened to be listed first.
function strided<T>(all: T[], target: number): T[] {
  if (all.length <= target) return all
  const stride = all.length / target
  const out: T[] = []
  for (let i = 0; i < target; i++) out.push(all[Math.floor(i * stride)])
  return out
}

// --- TALER: windfalls, trade luck, forgotten debts ---
const talerSubjects = [
  'A traveling merchant', 'A passing tax collector', 'A visiting bishop', 'A retired soldier',
  'A grateful pilgrim', 'A wandering minstrel', 'A shrewd moneylender', 'A returning trade caravan',
  'A minor noble passing through', 'A guild of tanners', 'A fishing fleet', 'A traveling notary',
  'A cousin twice removed', 'A vineyard owner', 'A cartwright', 'A wool merchant'
]
const talerActions = [
  'settles an old debt in full, with interest', 'leaves a generous tip after a good meal',
  'pays a toll twice by mistake and does not notice', 'sells a load of goods at a better price than expected',
  'repays a loan your predecessor forgot was ever made', 'donates to the treasury out of sheer good humor',
  'strikes a favorable one-time trade deal', 'finds your roads so well-kept they pay extra to use them',
  'leaves behind a purse after a night at the inn', 'gifts the treasury a share of a lucky harvest'
]
const talerCombos: string[] = []
for (const s of talerSubjects) for (const a of talerActions) talerCombos.push(`${s} ${a}.`)
for (const text of strided(talerCombos, 50)) add('taler', text)

// --- POPULATION: settlers, births, migrants drawn by good news ---
const popSubjects = [
  'A family of weavers', 'A band of hardy farmers', 'A group of skilled masons', 'Word of your fair rule',
  'A small caravan of refugees', 'A traveling blacksmith and his kin', 'A cheerful young couple',
  'A troupe of craftsmen', 'News of your prosperity', 'A group of shepherds', 'A midwife\'s good year',
  'A returning group of your own emigrants', 'A family fleeing a harsher lord', 'A pair of newlyweds'
]
const popActions = [
  'decides to settle within your borders', 'spreads to a neighboring village, drawing new arrivals',
  'brings several new households to your lands', 'convinces a whole hamlet to relocate here',
  'is the talk of the region, and more follow', 'chooses your principality over three others',
  'arrives looking for steady work and stays', 'finds your markets full and your peace real'
]
const popCombos: string[] = []
for (const s of popSubjects) for (const a of popActions) popCombos.push(`${s} ${a}.`)
for (const text of strided(popCombos, 40)) add('population', text)

// --- GRAIN: good stores, gifts, lucky finds ---
const grainSubjects = [
  'A neighboring miller', 'A grateful village', 'An old grain store', 'A traveling monk',
  'A passing quartermaster', 'A returning harvest crew', 'A charitable abbey', 'A friendly rival ruler',
  'A retired granary keeper', 'A well-stocked mill'
]
const grainActions = [
  'shares a surplus with your barns', 'gifts a wagonload of grain out of goodwill',
  'turns out to have been under-counted, to your benefit', 'sends thanks in the form of good wheat',
  'trades a favor for grain your barns can spare — and it comes back doubled',
  'discovers an overlooked store still sound and dry', 'sends a tithe of grain your way unasked'
]
const grainCombos: string[] = []
for (const s of grainSubjects) for (const a of grainActions) grainCombos.push(`${s} ${a}.`)
for (const text of strided(grainCombos, 35)) add('grain', text)

// --- UNREST: festivals, good news, small mercies that calm the people ---
const unrestSubjects = [
  'A well-timed festival', 'A local wedding', 'A good rumor about the harvest', 'A traveling storyteller',
  'A minor tax dispute resolved fairly', 'An unexpected holiday', 'A popular local victory at the fair',
  'A well-loved priest\'s sermon', 'A round of free ale at the tavern', 'A juggler passing through town',
  'A rare clear night for stargazing', 'A surprise reunion of old friends'
]
const unrestActions = [
  'lifts the mood of the whole principality', 'gives the peasants something to smile about',
  'settles nerves that had been fraying', 'has everyone talking for days, in a good way',
  'brings the town together for an evening', 'quiets grumbling that had been building',
  'reminds people why they are proud to live here', 'turns a dull week into a memorable one'
]
const unrestCombos: string[] = []
for (const s of unrestSubjects) for (const a of unrestActions) unrestCombos.push(`${s} ${a}.`)
for (const text of strided(unrestCombos, 45)) add('unrest', text)

// --- Standalone one-offs: the deliberate humor a template slot can't carry ---
const standalone: Array<[Entry['rewardType'], string]> = [
  ['taler', 'A traveling salesman insists your castle needs a slightly bigger flag. You decline; he tips out of embarrassment.'],
  ['taler', 'Someone finally pays back the Baron who ruled three reigns ago. You were not expecting this.'],
  ['taler', 'A rival\'s messenger delivers a bribe to the wrong address. Yours.'],
  ['taler', 'A traveling dentist sets up shop, does brisk business, and leaves a "thank you" donation.'],
  ['taler', 'Your court jester wins a bet with a visiting noble. He shares the winnings, mostly.'],
  ['taler', 'A merchant caravan mistakes your border for a toll road that stopped existing decades ago. They pay anyway.'],
  ['taler', 'An anonymous benefactor leaves a sack of coin at the gate with a note reading simply "well governed."'],
  ['taler', 'A traveling astrologer predicts your prosperity, and several nobles pay handsomely to hear it confirmed.'],
  ['taler', 'Your scribes discover a clerical error that has been quietly costing the Kaiser money and not you.'],
  ['taler', 'A duel over a card game ends peacefully, and the loser insists on paying your treasury instead of his opponent.'],
  ['population', 'A famous chef relocates to your lands purely for the produce. His apprentices follow within the year.'],
  ['population', 'A traveling theater troupe likes it here so much they simply never leave.'],
  ['population', 'Twins are born in the same week to three different families. Word travels; more families arrive hoping for luck.'],
  ['population', 'A minor prophecy names your principality "a good place to raise children." People take it seriously.'],
  ['population', 'A beekeeper\'s spectacular honey harvest becomes regional gossip, and with it, your reputation.'],
  ['population', 'An old hermit comes down from the hills, likes what he sees, and tells everyone he knows. He knows a lot of people.'],
  ['grain', 'A visiting friar blesses the harvest. The harvest, coincidentally or not, turns out slightly better than expected.'],
  ['grain', 'A miller\'s scale was broken for months, undercounting deliveries. It is fixed, and the barns are fuller than the books claimed.'],
  ['grain', 'A rival principality\'s granary roof collapses. They sell the contents cheap rather than let it spoil, and you buy in.'],
  ['grain', 'A field thought exhausted produces one unexpectedly generous crop before finally giving out.'],
  ['unrest', 'A traveling comedian performs in the square and the whole town is still laughing about it a week later.'],
  ['unrest', 'A pig escapes the market and leads half the town on a chase. Nobody catches it, but everyone has a good story now.'],
  ['unrest', 'Two feuding families settle their dispute over ale instead of at the gallows, to general relief.'],
  ['unrest', 'A local legend turns out to be true, or at least everyone agrees to believe it is. Morale improves regardless.'],
  ['unrest', 'The tavern keeper announces a "harvest special" and, for one evening, nobody complains about anything.'],
  ['unrest', 'A traveling bard writes a song about your realm. It is not entirely accurate, but it is very catchy.'],
  ['unrest', 'A stray dog adopts the guardhouse. Morale among the guards — and by extension everyone else — noticeably improves.'],
  ['unrest', 'A minor miracle is reported at the local chapel. Investigation is inconclusive; enthusiasm is not.'],
  ['unrest', 'The weather clears just in time for a long-planned market day, and everyone remembers it fondly for months.'],
  ['unrest', 'A visiting acrobat troupe puts on an unscheduled show in the square. Even the tax collector stops to watch.']
]
for (const [type, text] of standalone) add(type, text)

const rewardRanges = {
  taler: { min: 200, max: 900 },
  population: { min: 8, max: 30 },
  grain: { min: 150, max: 500 },
  // Amount the event REDUCES unrest by (floored at 0 by the caller) — this is
  // the one reward type that is a relief rather than a gain.
  unrest: { min: 3, max: 10 }
}

const output = {
  _comment: 'Phase 18D: small, flat-chance positive events — deliberately simpler than data/events.json (no exposure/mitigation modeling). Rolled once per player per year (src/engine/events/positiveEvents.ts). Rewards are flat regardless of realm size by design: this is flavor, not a strategy lever, so it stays small relative to a mature economy while still meaning something early. "some funny ones as well" per the playtest request that asked for this.',
  chancePerYear: 0.1,
  rewardRanges,
  events: entries
}

console.log(JSON.stringify(output, null, 2))
console.error(`generated ${entries.length} entries`) // stderr so it doesn't pollute the JSON on stdout
