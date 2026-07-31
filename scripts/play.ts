// Interactive CLI: a human plays Kaiser 3 against scripted rival rulers, one
// year at a time, via terminal prompts. This is the Phase 3 "is the loop fun
// at all" gate — run with `npx tsx scripts/play.ts`.

import * as readline from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { GameState, Decision, GrainDecision, TaxDecision } from '../src/engine/state.ts'
import { runGame } from '../src/engine/gameLoop.ts'
import { getRankName } from '../src/engine/ranks.ts'

// Real terminals stay interactive via readline.question(). Piped/non-TTY input
// (scripted playthroughs, automated verification) is read synchronously up front —
// Node's readline auto-closes as soon as a piped stdin hits EOF, which happens
// near-instantly for a file redirect, silently orphaning any .question() calls
// made after that point. Buffering avoids that trap while behaving identically
// from the caller's perspective either way.
const isInteractive = stdin.isTTY === true
const rl = isInteractive ? readline.createInterface({ input: stdin, output: stdout }) : undefined
const bufferedLines = isInteractive ? [] : readFileSync(0, 'utf-8').split('\n').map((l) => l.replace(/\r$/, ''))
let bufferedIndex = 0

async function ask(prompt: string, defaultValue: string): Promise<string> {
  let raw: string
  if (rl) {
    raw = await rl.question(`${prompt} [${defaultValue}]: `)
  } else {
    stdout.write(`${prompt} [${defaultValue}]: `)
    raw = bufferedLines[bufferedIndex++] ?? ''
    stdout.write(`${raw}\n`)
  }
  return raw.trim() === '' ? defaultValue : raw.trim()
}

async function askNumber(prompt: string, defaultValue: number): Promise<number> {
  const raw = await ask(prompt, String(defaultValue))
  const n = Number(raw)
  return Number.isFinite(n) ? n : defaultValue
}

async function askYesNo(prompt: string, defaultValue: boolean): Promise<boolean> {
  const raw = await ask(prompt, defaultValue ? 'y' : 'n')
  return raw.toLowerCase().startsWith('y')
}

function printPlayerSummary(state: GameState, humanId: string): void {
  const p = state.players[humanId]
  console.log(`\n=== Year ${state.year} — ${p.name}, ${getRankName(p.rank)} ===`)
  console.log(`Taler: ${p.taler.toFixed(0)} | Farmland: ${p.land.farmland.toFixed(0)} ha | Building land: ${p.land.buildingLand.toFixed(0)} ha`)
  console.log(`Population: ${p.population.peasants.toFixed(0)} (unrest: ${p.population.unrest.toFixed(1)}/100)`)
  console.log(`Grain stock: ${p.grainStock.toFixed(0)}`)
  console.log(`Buildings — markets: ${p.buildings.markets}, mills: ${p.buildings.mills}, palace: ${p.buildings.palace}/16, cathedral: ${p.buildings.cathedral}`)
  console.log(`Kaiser prices — corn: ${state.kaizerTradePrices.corn}/unit, farmland: ${state.kaizerTradePrices.farmland}/ha, building land: ${state.kaizerTradePrices.buildingLand}/ha`)
}

async function getHumanDecisions(state: GameState, humanId: string): Promise<Decision[]> {
  printPlayerSummary(state, humanId)

  const feedLevel = await ask('Feed level (min/max/required/custom)', 'required') as GrainDecision['feedLevel']
  const grainDecision: GrainDecision = feedLevel === 'custom'
    ? { type: 'grain', feedLevel, customPercentage: await askNumber('Custom feed % (20-80)', 50) }
    : { type: 'grain', feedLevel }

  const farmlanbuy = await askNumber('Farmland to buy(+)/sell(-), hectares', 0)
  const buildingLandBuy = await askNumber('Building land to buy(+)/sell(-), hectares', 0)

  const vat = await askNumber('VAT rate (0-100)', 15)
  const incomeTax = await askNumber('Income tax rate (0-100)', 15)
  const tariff = await askNumber('Tariff rate (0-100)', 5)
  const justiceGraft = await askNumber('Justice graft (0=fair, 100=greedy)', 0)
  const taxDecision: TaxDecision = { type: 'tax', vat, incomeTax, tariff, justiceGraft }

  const marketBuild = await askNumber('Markets to build', 0)
  const millBuild = await askNumber('Mills to build', 0)
  const palaceStages = await askNumber('Palace stages to build', 0)
  const cathedralBuild = await askYesNo('Attempt to build cathedral?', false)
  const wellBuild = await askNumber('Wells to build', 0)
  const hospitalBuild = await askNumber('Hospitals to build', 0)
  const granaryBuild = await askNumber('Granaries to build', 0)
  const garrisonBuild = await askNumber('Garrisons to build', 0)

  return [
    grainDecision,
    { type: 'land_trade', farmlanbuy, buildingLandBuy, partnerPlayerId: 'kaiser' },
    taxDecision,
    { type: 'construction', marketBuild, millBuild, palaceStages, cathedralBuild, wellBuild, hospitalBuild, granaryBuild, garrisonBuild }
  ]
}

async function main() {
  console.log('=== Kaiser 3 — Playable Text Prototype (Phase 3) ===')
  console.log('You rule a principality. Compete against scripted rival rulers to become Kaiser.\n')

  const opponentCount = await askNumber('Number of rival rulers', 2)
  const maxYears = await askNumber('Maximum years to play', 50)

  const result = await runGame({
    humanId: 'human',
    humanName: 'You',
    opponentCount,
    maxYears,
    getHumanDecisions: (state) => getHumanDecisions(state, 'human'),
    onYearComplete: (_state, chronicle) => {
      const report = chronicle.playerReports['human']
      if (report.rankPromoted) {
        console.log(`\n*** Promoted to ${getRankName(report.newRank!)}! ***`)
      }
      if (report.emigration > 0) {
        console.log(`(${report.emigration.toFixed(0)} peasants emigrated this year — unrest is taking a toll)`)
      }
    }
  })

  console.log('\n=== Game Over ===')
  console.log(`Years played: ${result.yearsPlayed}`)
  console.log(`Outcome: ${result.outcome}`)
  if (result.outcome === 'victory') {
    const winnerName = result.finalState.players[result.winnerId!].name
    console.log(`${winnerName} was crowned Kaiser!`)
  }

  rl?.close()
}

main().catch((err) => {
  console.error(err)
  rl?.close()
  process.exit(1)
})
