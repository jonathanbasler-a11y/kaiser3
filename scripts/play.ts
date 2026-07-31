// Interactive CLI: a human plays Kaiser 3 against scripted rival rulers, one
// year at a time, via terminal prompts. This is the Phase 3 "is the loop fun
// at all" gate — run with `npx tsx scripts/play.ts`.

import * as readline from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { GameState, Decision, GrainDecision, TaxDecision, EspionageDecision } from '../src/engine/state.ts'
import { runGame } from '../src/engine/gameLoop.ts'
import { getRankName } from '../src/engine/ranks.ts'
import { annualGrainRequirement, storageCapacity, grainBuybackPrice } from '../src/engine/economy.ts'
import { getPersonalities } from '../src/ai/personalities.ts'
import { planYear } from '../src/ai/planner.ts'

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
  const needed = annualGrainRequirement(p.population)
  const capacity = storageCapacity(p.population, p.buildings.granary)
  console.log(
    `Grain: ${p.grainStock.toFixed(0)} of ${capacity.toFixed(0)} storable ` +
    `(${(p.grainStock / needed).toFixed(1)} years' food; your people eat ${needed.toFixed(0)}/year)`
  )
  console.log(`Corn sells at ${state.kaizerTradePrices.corn}/unit, buys back at ${grainBuybackPrice(state.kaizerTradePrices.corn).toFixed(2)}`)
  console.log(`Buildings — markets: ${p.buildings.markets}, mills: ${p.buildings.mills}, palace: ${p.buildings.palace}/16, cathedral: ${p.buildings.cathedral}`)
}

async function getHumanDecisions(state: GameState, humanId: string): Promise<Decision[]> {
  printPlayerSummary(state, humanId)

  // Validate rather than casting the raw string: an unrecognised value used to
  // sail straight into the engine and produce NaN losses.
  const FEED_LEVELS: Array<GrainDecision['feedLevel']> = ['min', 'max', 'required', 'custom']
  const feedInput = await ask('Feed level (min/max/required/custom)', 'required')
  const feedLevel = (FEED_LEVELS as string[]).includes(feedInput)
    ? (feedInput as GrainDecision['feedLevel'])
    : 'required'
  if (feedLevel !== feedInput) {
    console.log(`  (unrecognised feed level "${feedInput}" — using "required")`)
  }
  const customPercentage = feedLevel === 'custom' ? await askNumber('Custom feed % (20-80)', 50) : undefined

  const sellGrain = await askNumber('Grain to sell to the Kaiser', 0)
  const buyGrain = await askNumber('Grain to buy from the Kaiser', 0)

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

  // Secret service. The same EspionageDecision the AI emits — Decision parity
  // means the player has exactly the tools its rivals do.
  const player = state.players[humanId]
  const rivals = state.activePlayerIds.filter((id) => id !== humanId)
  const guardHire = await askNumber('Guards to hire (defence)', 0)
  const saboteurHire = await askNumber('Saboteurs to hire (offence)', 0)

  const espionage: EspionageDecision = { type: 'espionage', guardHire, saboteurHire }
  if (player.saboteurs > 0 && rivals.length > 0) {
    console.log(`  Rivals you could strike: ${rivals.map((id, i) => `${i + 1}=${state.players[id].name}`).join(', ')}`)
    const choice = await askNumber(`Strike whom? (0 = nobody, you have ${player.saboteurs} saboteurs)`, 0)
    if (choice >= 1 && choice <= rivals.length) {
      espionage.targetPlayerId = rivals[choice - 1]
      espionage.saboteursCommitted = await askNumber('Saboteurs to commit', player.saboteurs)
      const mode = await ask('Mode — raid (take coin) or sabotage (burn a workshop, take grain and coin)', 'raid')
      espionage.mode = mode.startsWith('s') ? 'sabotage' : 'raid'
    }
  }

  const grainDecision: GrainDecision = { type: 'grain', feedLevel, customPercentage, sellGrain, buyGrain }

  return [
    grainDecision,
    { type: 'land_trade', farmlanbuy, buildingLandBuy, partnerPlayerId: 'kaiser' },
    taxDecision,
    { type: 'construction', marketBuild, millBuild, palaceStages, cathedralBuild, wellBuild, hospitalBuild, granaryBuild, garrisonBuild },
    espionage
  ]
}

async function main() {
  console.log('=== Kaiser 3 ===')
  console.log('You rule a principality. Compete against rival rulers to become Kaiser.\n')

  const personalities = getPersonalities()
  console.log('Rival rulers available:')
  for (const p of personalities) console.log(`  ${p.name} — ${p.description}`)
  console.log('')

  const opponentCount = await askNumber(`Number of rival rulers (1-${personalities.length})`, 2)
  const maxYears = await askNumber('Maximum years to play', 50)

  // Each rival is driven by a distinct AI personality, cycling through the roster.
  const rivals = Array.from({ length: opponentCount }, (_, i) => personalities[i % personalities.length])

  const result = await runGame({
    humanId: 'human',
    humanName: 'You',
    opponentCount,
    maxYears,
    opponentNames: rivals.map((p) => p.name),
    getHumanDecisions: (state) => getHumanDecisions(state, 'human'),
    getOpponentDecisions: (state, opponent, year) => {
      const index = Number(opponent.id.replace('opponent', '')) - 1
      return planYear(state, opponent.id, rivals[index], 5000 + year * 104729 + index)
    },
    onYearComplete: (state, chronicle) => {
      const report = chronicle.playerReports['human']

      // The year's weather, always — a drought must be something the player sees
      // coming out of the fields, not a number they reverse-engineer later.
      const traded = report.grainSold > 0
        ? `, sold ${report.grainSold.toFixed(0)} grain for ${report.grainTradeIncome.toFixed(0)} Taler`
        : report.grainBought > 0
          ? `, bought ${report.grainBought.toFixed(0)} grain for ${(-report.grainTradeIncome).toFixed(0)} Taler`
          : ''
      console.log(`\n  ~ ${report.weatherName}: harvest ${report.harvestYield.toFixed(0)}${traded}`)
      if (report.grainOverflowLost > 100) {
        console.log(`    (${report.grainOverflowLost.toFixed(0)} grain rotted — the barns are full)`)
      }

      // Always surface the telegraph text — a hard event must read as a
      // consequence the player can learn from, never as an unexplained loss.
      for (const event of report.events) {
        const magnitude = event.lossType === 'gold'
          ? `${event.loss.toFixed(0)} Taler lost`
          : event.lossType === 'population'
            ? `${event.loss.toFixed(0)} peasants lost`
            : `${event.loss.toFixed(0)} buildings destroyed`
        console.log(`\n  ! ${event.telegraphText} (${magnitude})`)
      }

      // Espionage is cross-player, so it lives on the chronicle rather than in
      // any one ruler's report. Surface anything involving the human either way —
      // being robbed without being told would be baffling.
      for (const strike of chronicle.strikes) {
        const verb = strike.mode === 'raid' ? 'raid' : 'sabotage'
        if (strike.defenderId === 'human') {
          const attacker = state.players[strike.attackerId]?.name ?? strike.attackerId
          console.log(strike.succeeded
            ? `\n  ! ${attacker} launched a ${verb} against you — ${strike.talerStolen.toFixed(0)} Taler` +
              `${strike.grainStolen > 0 ? `, ${strike.grainStolen.toFixed(0)} grain` : ''}` +
              `${strike.buildingsDestroyed > 0 ? `, and ${strike.buildingsDestroyed} building burned` : ''}`
            : `\n  . ${attacker} attempted a ${verb} against you — your guards drove them off`)
        } else if (strike.attackerId === 'human') {
          const defender = state.players[strike.defenderId]?.name ?? strike.defenderId
          console.log(strike.succeeded
            ? `\n  > Your ${verb} against ${defender} succeeded — ${strike.talerStolen.toFixed(0)} Taler taken`
            : `\n  > Your ${verb} against ${defender} failed — ${strike.saboteursLost} saboteurs lost`)
        }
      }

      if (report.rankPromoted) {
        console.log(`\n*** Promoted to ${getRankName(report.newRank!)}! ***`)
      }
      if (report.emigration > 0) {
        console.log(`(${report.emigration.toFixed(0)} peasants emigrated this year — unrest is taking a toll)`)
      }

      // Show the rivals' standing, so the competition is visible rather than
      // something the player only discovers at the end.
      const rivalLines = state.activePlayerIds
        .filter((id) => id !== 'human')
        .map((id) => {
          const p = state.players[id]
          return `${p.name}: ${getRankName(p.rank)}, ${p.taler.toFixed(0)} Taler, ${p.population.peasants.toFixed(0)} peasants`
        })
      if (rivalLines.length > 0) console.log(`  Rivals — ${rivalLines.join(' | ')}`)
    }
  })

  console.log('\n=== Game Over ===')
  console.log(`Years played: ${result.yearsPlayed}`)
  console.log(`Outcome: ${result.outcome}`)
  if (result.outcome === 'victory') {
    const winnerName = result.finalState.players[result.winnerId!].name
    console.log(`${winnerName} was crowned Kaiser!`)
  }
  console.log('\nFinal standings:')
  for (const id of result.finalState.activePlayerIds) {
    const p = result.finalState.players[id]
    console.log(
      `  ${p.name.padEnd(18)} ${getRankName(p.rank).padEnd(10)} ` +
      `${p.taler.toFixed(0).padStart(8)} Taler  ${p.population.peasants.toFixed(0).padStart(6)} peasants  palace ${p.buildings.palace}/16`
    )
  }

  rl?.close()
}

main().catch((err) => {
  console.error(err)
  rl?.close()
  process.exit(1)
})
