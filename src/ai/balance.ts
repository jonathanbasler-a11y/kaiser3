// BALANCE HARNESS — the numeric proof that the game stays hard throughout.
//
// The design requirement this exists to enforce (docs/kaiser-research.md
// § Persistent Scarcity): the game must NOT become a trivial exponential-growth
// snowball once the player survives the early game. That is the classic failure
// mode of this genre, and it is invisible in short playtests — "it feels hard"
// does not survive fifty hours of play, and drift creeps in one feature at a time.
//
// So it is measured instead, over hundreds of seeded AI-vs-AI matches, against
// three criteria. Each targets a different way a game can quietly go soft:
//
//   1. MARGIN FLATNESS   — does wealth compound faster than the costs and risks
//                          it attracts? Measured as return on holdings per decade.
//                          A rising trend is the definition of a snowball.
//   2. LOSS PERSISTENCE  — do setbacks keep happening late, or does a big empire
//                          become effectively immune? Measured as the chance of a
//                          serious wealth drop in each decade.
//   3. LEAD VOLATILITY   — is the game decided early? Measured by how often the
//                          leader changes late, and how often an early leader
//                          simply coasts to victory.
//
// These become committed acceptance tests, so any later feature that reintroduces
// snowballing fails CI rather than being discovered by a bored player.
//
// Caveat worth stating plainly: this measures AI-vs-AI play, which is a proxy for
// the human experience, not the thing itself. It is a good proxy — the AI plays by
// exactly the player's rules via the same Decision sheets — but a proxy.

import buildingsData from '../../data/buildings.json'
import economyData from '../../data/economy.json'
import { GameState, Chronicle } from '../engine/state.ts'
import { Competitor, runMatch, compareStanding } from './sim.ts'

const LAND_PRICE = economyData.prices.farmlandBasePrice
const MARKET_COST = buildingsData.production.market.buildCost
const MILL_COST = buildingsData.production.mill.buildCost
const PALACE_STAGE_COST = buildingsData.prestige.palace.costPerStage

export interface PlayerYearRecord {
  taler: number
  population: number
  holdings: number      // Total material worth: treasury plus land and buildings at cost
  grossIncome: number
  upkeep: number
  eventGoldLoss: number
  netIncome: number
  rank: number
  // Adversity actually suffered this year, as a share of what the ruler held
  // before the blow landed. Kept separate from treasury movement on purpose:
  // a falling treasury usually means the ruler CHOSE to spend, and conflating
  // investment with misfortune reverses the signal completely — early years look
  // dangerous merely because that is when land and palace stages get bought,
  // while a mature ruler with nothing left to buy looks serene.
  //
  // Counts BOTH natural disaster and hostile action. PLAN.md's criterion is about
  // "events and AI aggression", and once rivals could raid each other an
  // events-only measure understated late-game danger badly: a leader stripped of
  // 18% of its treasury by raiders registered as having had a quiet year.
  eventLossShare: number
}

export interface YearSnapshot {
  year: number
  leaderId: string | null
  players: Record<string, PlayerYearRecord>
}

// Everything a ruler owns, valued in Taler, so "return on holdings" compares like
// with like: a ruler who converted cash into markets has not become poorer.
function holdingsValue(state: GameState, playerId: string): number {
  const p = state.players[playerId]
  const land = p.land.farmland + p.land.buildingLand
  return p.taler
    + land * LAND_PRICE
    + p.buildings.markets * MARKET_COST
    + p.buildings.mills * MILL_COST
    + p.buildings.palace * PALACE_STAGE_COST
}

export function snapshotYear(state: GameState, chronicle: Chronicle): YearSnapshot {
  const players: Record<string, PlayerYearRecord> = {}

  for (const playerId of state.activePlayerIds) {
    const report = chronicle.playerReports[playerId]
    if (!report) continue

    const grossIncome = report.marketIncome + report.millIncome
      + report.taxIncome + report.tariffIncome + report.tributeIncome
    const netIncome = grossIncome - report.upkeepCost - report.eventGoldLoss

    // Coin and grain taken by rivals this year, on top of natural disaster.
    const plundered = chronicle.strikes
      .filter((strike) => strike.defenderId === playerId && strike.succeeded)
      .reduce((total, strike) => total + strike.talerStolen, 0)

    // Losses are already deducted from the live state, so the pre-blow figure is
    // recovered by adding them back.
    const goldLost = report.eventGoldLoss + plundered
    const talerBefore = state.players[playerId].taler + goldLost
    const populationBefore = state.players[playerId].population.peasants + report.eventPopulationLoss
    const goldShare = talerBefore > 0 ? goldLost / talerBefore : 0
    const populationShare = populationBefore > 0 ? report.eventPopulationLoss / populationBefore : 0

    players[playerId] = {
      taler: state.players[playerId].taler,
      population: state.players[playerId].population.peasants,
      holdings: holdingsValue(state, playerId),
      grossIncome,
      upkeep: report.upkeepCost,
      eventGoldLoss: report.eventGoldLoss,
      netIncome,
      rank: state.players[playerId].rank,
      eventLossShare: Math.max(goldShare, populationShare)
    }
  }

  let leaderId: string | null = null
  for (const playerId of state.activePlayerIds) {
    if (leaderId === null || compareStanding(state.players[playerId], state.players[leaderId]) > 0) {
      leaderId = playerId
    }
  }

  return { year: state.year, leaderId, players }
}

export interface MatchTimeline {
  seed: number
  snapshots: YearSnapshot[]
  finalLeaderId: string | null
}

export function runInstrumentedMatch(competitors: Competitor[], seed: number, maxYears: number): MatchTimeline {
  const snapshots: YearSnapshot[] = []
  const result = runMatch(competitors, seed, maxYears, (state, chronicle) => {
    snapshots.push(snapshotYear(state, chronicle))
  })
  return { seed, snapshots, finalLeaderId: result.winnerId }
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

const DECADE = 10

function decadeIndex(year: number): number {
  return Math.floor((year - 1) / DECADE)
}

// Ordinary least-squares slope of y against its index. Used to ask whether a
// per-decade series trends up, down, or stays flat.
export function trendSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (values[i] - meanY)
    denominator += (i - meanX) ** 2
  }
  return denominator === 0 ? 0 : numerator / denominator
}

export interface BalanceReport {
  matches: number
  decades: number
  // 1. Margin flatness
  leaderReturnByDecade: number[]
  returnTrendSlope: number
  // 2. Loss persistence
  setbackRateByDecade: number[]
  // 3. Lead volatility
  lateLeadChangeRate: number
  earlyLeaderWinRate: number
}

export interface BalanceConfig {
  competitors: Competitor[]
  matches: number
  maxYears: number
  seedBase?: number
  // A "serious setback": a year-on-year fall in holdings of at least this share.
  setbackThreshold?: number
  // Leadership changes after this year count toward late volatility.
  lateGameStartYear?: number
  // The year whose leader is checked against the final winner, for runaway detection.
  earlyLeaderYear?: number
}

export function analyseBalance(config: BalanceConfig): BalanceReport {
  const setbackThreshold = config.setbackThreshold ?? 0.15
  const lateGameStartYear = config.lateGameStartYear ?? 30
  const earlyLeaderYear = config.earlyLeaderYear ?? 20
  const seedBase = config.seedBase ?? 1
  const decades = Math.ceil(config.maxYears / DECADE)

  const returnSums = new Array(decades).fill(0)
  const returnCounts = new Array(decades).fill(0)
  const setbackMatches = new Array(decades).fill(0)
  const decadeObserved = new Array(decades).fill(0)

  let lateLeadChanges = 0
  let earlyLeaderWins = 0
  let matchesWithEarlyLeader = 0

  for (let m = 0; m < config.matches; m++) {
    const timeline = runInstrumentedMatch(config.competitors, seedBase + m * 7717, config.maxYears)
    const { snapshots } = timeline

    // --- 1. Margin flatness: the LEADER's return on holdings, by decade.
    // The leader is the right subject: the snowball worry is specifically that
    // whoever is ahead pulls away, not that the average ruler does well.
    for (const snapshot of snapshots) {
      const leaderId = snapshot.leaderId
      if (!leaderId) continue
      const record = snapshot.players[leaderId]
      if (!record || record.holdings <= 0) continue

      const d = decadeIndex(snapshot.year)
      if (d < 0 || d >= decades) continue
      returnSums[d] += record.netIncome / record.holdings
      returnCounts[d] += 1
    }

    // --- 2. Loss persistence: did adversity actually strike the leader hard in
    // each decade? Measured from the events that hit, NOT from treasury movement.
    //
    // Two earlier versions of this measurement were wrong, and both flattered the
    // game. Measuring total holdings registered 0.0% everywhere, because holdings
    // are dominated by land at book value and barely move. Measuring the treasury
    // was worse than useless: it counted the ruler's own SPENDING as misfortune,
    // so the early game (when land and palace stages are bought) looked perilous
    // and the mature ruler with nothing left to buy looked untroubled — precisely
    // backwards.
    const setbackSeenThisMatch = new Array(decades).fill(false)
    for (const snapshot of snapshots) {
      const d = decadeIndex(snapshot.year)
      if (d < 0 || d >= decades) continue

      const leaderId = snapshot.leaderId
      if (!leaderId) continue
      const record = snapshot.players[leaderId]
      if (!record) continue

      if (record.eventLossShare >= setbackThreshold) {
        setbackSeenThisMatch[d] = true
      }
    }
    for (let d = 0; d < decades; d++) {
      if (snapshots.some((s) => decadeIndex(s.year) === d)) decadeObserved[d] += 1
      if (setbackSeenThisMatch[d]) setbackMatches[d] += 1
    }

    // --- 3. Lead volatility.
    const lateSnapshots = snapshots.filter((s) => s.year >= lateGameStartYear)
    const lateLeaders = new Set(lateSnapshots.map((s) => s.leaderId).filter(Boolean))
    if (lateLeaders.size > 1) lateLeadChanges += 1

    const earlySnapshot = snapshots.find((s) => s.year === earlyLeaderYear)
    if (earlySnapshot?.leaderId) {
      matchesWithEarlyLeader += 1
      if (earlySnapshot.leaderId === timeline.finalLeaderId) earlyLeaderWins += 1
    }
  }

  const leaderReturnByDecade = returnSums.map((sum, d) => (returnCounts[d] > 0 ? sum / returnCounts[d] : 0))
  const setbackRateByDecade = setbackMatches.map((count, d) => (decadeObserved[d] > 0 ? count / decadeObserved[d] : 0))

  return {
    matches: config.matches,
    decades,
    leaderReturnByDecade,
    returnTrendSlope: trendSlope(leaderReturnByDecade),
    setbackRateByDecade,
    lateLeadChangeRate: config.matches > 0 ? lateLeadChanges / config.matches : 0,
    earlyLeaderWinRate: matchesWithEarlyLeader > 0 ? earlyLeaderWins / matchesWithEarlyLeader : 0
  }
}
