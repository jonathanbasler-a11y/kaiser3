# Kaiser 3 — Build Plan

Phased implementation of the modern rebuild of *Kaiser* (Ariolasoft, 1984). Solo play vs. AI opponents, pure reducer architecture, anti-snowball balance via headless harness validation.

## Phase Overview

| Phase | Model | Effort | Goal | Acceptance |
|---|---|---|---|---|
| **0** | Haiku | Low | Scaffold repo, RNG, state types, determinism test | `npm test` green, same seed → byte-identical state |
| **1** | Sonnet | Medium–High | Grain/land/population core; `advanceYear` v1 | Classic dynamics tests (emigration on under-feed, etc.), numeric ranges stay sane |
| **2** | Sonnet | Medium | Tax, construction, ranks (8 tiers) | Tax tolerance / unrest tests, rank promotion matrix |
| **3** | Sonnet | Medium | Playable text/CLI game vs. scripted rulers | Human can play to bankruptcy or Kaiser rank without crashing |
| **4** | Opus | High | Event system (plague/fire/famine/revolt/banditry) + mitigation | Statistical tests: event weight ∝ prosperity, mitigation reduces loss measurably, each event at ≥floor risk |
| **5** | Opus | High | AI opponents v1 (builder/expansionist/merchant personalities) | AI vs. random-legal bot win rate ≥90%, no illegal decisions, archetype profiles distinct |
| **6** | Opus | Max | Balance harness + anti-snowball gate | **Hard gate:** 3 flatness criteria pass over ≥200 seeded matches before Phase 7 starts |
| **7** | Opus | High | Espionage, inter-ruler trade, schemer/raider archetypes | Sabotage math, leading-ruler-draws-fire verified, Phase 6 criteria re-pass |
| **8** | Sonnet | Medium | Warfare, alliances, succession/heir | War resolution, alliance votes, heir inheritance tests |
| **9** | Sonnet | Medium | Graphical UI v1 (procedural art, dashboard/battlefield/chronicle/coronation) | Human plays full game without CLI, all events visible on map |
| **10** | Sonnet/Haiku | Low–Medium | ComfyUI art pass (portraits, buildings, event icons, coronation tableau) | Tileset manifest loads, art deletable → procedural fallback works |
| **11** | Sonnet | High | QA/hardening, regression, difficulty presets | All prior gates re-pass, difficulty presets validate via harness |

## Phase 0: Scaffold & Ground Rules ✓

**Status:** Done (this commit)

### What was built
- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- `CLAUDE.md` (project discipline)
- Folder structure (`src/engine/`, `src/ai/`, `src/ui/`, `data/`, `scripts/`, `tests/`)
- `src/engine/rng.ts` — seeded PRNG (LCG, deterministic)
- `src/engine/state.ts` — `GameState`, `PlayerState`, `Decision` union (the reducer contract)
- `src/engine/year.ts` — stub `advanceYear()` reducer with placeholder comment for each phase
- `tests/determinism.test.ts` — acceptance test: same seed twice → byte-identical serialized state

### Acceptance Criteria
- ✓ `npm install` runs without errors
- ✓ `npm run test` runs determinism test (will pass once Phase 1 fills in the stub)
- ✓ `npm run sim` can be invoked (stub; no output yet)
- ✓ Types compile without errors
- ✓ Seeded RNG produces repeatable sequences

### Next Phase
**Phase 1 — Grain/land/population core.** Implement `economy.ts`, `land.ts`, `population.ts`; fill in `advanceYear` sequence for harvest, grain feeding, land trading, population dynamics.

---

## Phase 1: Grain/Land/Population Core ✓

**Status:** Done

### What was built
- `src/engine/economy.ts` — `laborGatedFarmland()` (hard scarcity ceiling: land without labor produces nothing), `calculateHarvest()` (weather-variant yield + spoilage on carried-over stock), `resolveFeeding()` (min/max/required/custom dial matching the original's design)
- `src/engine/population.ts` — `applyPopulationDynamics()`: unrest rises on underfeeding and decays on adequate feeding, births scale with feed adequacy and are damped by unrest, deaths include disease (overfeeding) and starvation (severe underfeeding) mortality, emigration triggers above the unrest tolerance threshold, immigration only when thriving
- `src/engine/land.ts` — `applyLandTrade()`: buy/sell farmland and building-land against the NPC Kaiser, clamped so sells never exceed holdings and buys never run the treasury negative (proportional scale-down on unaffordable combined orders)
- `src/engine/year.ts` — `advanceYear()` now sequences land trade → harvest → feeding → population dynamics per active player, populating the chronicle
- `src/engine/state.ts` — added `grainStock` to `PlayerState` (carried-over stockpile, spoils annually)
- Fixed data typos in `data/economy.json` (`farmlAndBasePrice` → `farmlandBasePrice`, etc.) and added missing coefficients (`laborHectaresPerPeasant`, `emigrationRate`, `immigrationRate`, disease/starvation mortality rates)
- `scripts/sim.ts` — headless 20-year runner, prints per-player year-by-year table

### Tests (23 total, all passing)
- `tests/economy.test.ts` (10) — labor gating, harvest zero-yield-without-labor, spoilage math, non-negative yield under adverse weather, feeding dial correctness (min/max/required/custom), stock-cap enforcement, starvation edge case
- `tests/population.test.ts` (4) — sustained underfeeding → unrest rises → emigration triggers; adequate feeding → unrest stays at 0; overfeeding → disease deaths exceed baseline; population never goes negative under compounding starvation
- `tests/land.test.ts` (5) — buy/sell at posted prices, sell-clamped-to-holdings, buy-clamped-to-affordability (no debt), simultaneous buy/sell orders funded by sell proceeds
- `tests/integration.test.ts` (2) — 20-year run stays in sane numeric ranges (no NaN, no negative population/taler/grainStock, unrest bounded 0-100); sustained min-feeding over 20 years produces population decline or high unrest (scarcity is real, not a solved-once problem)
- `tests/determinism.test.ts` (2) — re-verified green with the new mechanics wired in

### Acceptance Criteria
- ✓ Classic dynamics reproduced: underfeeding → unrest → emigration; overfeeding → disease
- ✓ Land without labor yields nothing (hard scarcity ceiling)
- ✓ 20-year scripted run stays in sane numeric ranges, no NaN/negative values
- ✓ `npx tsc --noEmit` clean
- ✓ `npm run sim` (via `npx tsx scripts/sim.ts`) produces a readable year-by-year table

### Known Balance Note (expected, not a bug)
The Phase 1 headless sim shows grain stock accumulating unboundedly over 20 years under "required" feeding — harvest yield outpaces consumption need given the starter land/population ratio. This is **expected and intentional to leave unaddressed here**: Phase 1's job is correct mechanics, not tuned balance. The anti-snowball tuning (upkeep scaling, prosperity-scaled event risk) is explicitly deferred to Phase 6's balance harness, per `docs/kaiser-research.md`'s design principle — tuning a small system before the full one is tractable; tuning everything at once is whack-a-mole.

### Next Phase
**Phase 2 — Tax, construction, ranks.** Implement `tax.ts` (VAT/income tax/tariffs/justice graft with unrest tolerance), `buildings.ts` (market/mill construction, upkeep, prestige building stages), `ranks.ts` (8-tier promotion matrix, Fugger-style rank-gated active powers). Wire into `advanceYear`.

---

## Phase 2: Tax, Construction, Ranks ✓

**Status:** Done

### What was built
- `src/engine/tax.ts` — `applyTaxation()`: VAT/income-tax revenue drawn from the population's economic output (not building income — tax is levied on the populace), tariff revenue on land-trade volume, judicial graft extracts extra revenue at the cost of compounding unrest. Burden past the tolerance threshold (data/economy.json `taxation.toleranceThreshold`) raises unrest — the "population has a tolerance ceiling" mechanic from the research doc.
- `src/engine/buildings.ts` — `applyConstruction()`: markets/mills ratio-gated by total land (1 per 1,000 ha), mitigation buildings (hospital/well/granary/garrison) gated by affordability and population thresholds, palace gated by a 13,000 ha land requirement before any stage can be built (16 stages, 5,000 Taler each), cathedral requires land + population thresholds simultaneously. Every build path clamps to affordability rather than failing the whole decision. `calculateBuildingIncome()` and `calculateUpkeep()` — upkeep scales with holdings (more buildings = more upkeep) and trading-house tribute scales with wealth (not a flat fee) — both are the anti-snowball levers called out in `docs/kaiser-research.md` § Persistent Scarcity.
- `src/engine/ranks.ts` — `checkPromotion()`: finds the highest rank whose wealth/population/building requirements are ALL met simultaneously; never demotes; a player can leapfrog multiple ranks in one year if they outright qualify. `getRankName()`, `isFeatureUnlocked()` (Margrave rank unlocks trading houses, per the original's design).
- `src/engine/year.ts` — `advanceYear()` now sequences: land trade → construction → harvest → feeding → population → building income → taxation → upkeep → rank check, per active player.
- Cleaned up `data/economy.json`'s `upkeep` section (per-building upkeep now lives in `data/buildings.json` next to each building's other specs — the old duplicate fields were dead data) and added a `buildCost` field for markets/mills.

### Tests (44 total, all passing — 21 new this phase)
- `tests/tax.test.ts` (5) — fair taxation generates revenue without unrest; taxation past tolerance raises unrest; higher rates generate more revenue; judicial graft extracts more revenue but compounds unrest at the same nominal rate; tariff income scales with trade volume
- `tests/buildings.test.ts` (8) — markets capped by land ratio; construction capped by affordability; hospital blocked below minimum population; palace blocked below land requirement, unblocked above it; cathedral requires land AND population simultaneously; building income scales linearly; upkeep scales with holdings; trading-house tribute scales with wealth
- `tests/ranks.test.ts` (7) — no promotion when any single requirement is unmet; promotion when all three are met simultaneously; leapfrogging multiple ranks in one check; never demotes; unlocked-feature reporting (trading houses at Margrave); rank name/feature-unlock lookups
- `tests/integration.test.ts` (+1) — a player with palace-eligible land who funds 2 palace stages/year reaches Duke rank (wealth + population + 4 palace stages, all data-driven from `data/ranks.json`) within a few years, end-to-end through `advanceYear`

### Acceptance Criteria
- ✓ Promotion test matrix: each rank reachable only when all thresholds met simultaneously
- ✓ Over-taxation raises unrest; the tolerance-threshold cutoff is data-driven and testable
- ✓ Construction respects land ratios, affordability, and population/land thresholds — never overspends or overbuilds
- ✓ Upkeep and tribute both scale with holdings/wealth (anti-snowball levers verified by test, not just asserted in docs)
- ✓ `npx tsc --noEmit` clean, 44/44 tests passing
- ✓ End-to-end promotion path verified through the full `advanceYear` reducer, not just unit-level

### Next Phase
**Phase 3 — Playable text/CLI game.** Wire a human-playable loop (`scripts/play.ts` or similar) where a player makes real decisions each year against 2-3 scripted/do-nothing AI rulers, with the chronicle printed per year. This is the "is the loop fun at all" gate before investing further — per PLAN.md's sequencing principle, playable-text-first before AI opponents (Phase 5) or art (Phase 10).

---

## Phase 3: Playable Text/CLI Game ✓

**Status:** Done

### What was built
- `src/engine/starter.ts` — shared `createStarterState()`/`createStarterPlayer()` (previously duplicated across `scripts/sim.ts`, `tests/determinism.test.ts`, `tests/integration.test.ts` — now a single source of truth)
- `src/engine/gameLoop.ts` — `runGame()`: wires the pure `advanceYear` reducer into a runnable game against scripted opponents. Checks victory (any player reaches Kaiser rank) and population collapse (the human's peasants fall below the extinction floor) each year; drops collapsed opponents from `activePlayerIds`. `scriptedOpponentDecisions()` — a simple, deliberately unambitious placeholder ruler (feeds adequately, taxes moderately, buys a little land, builds toward 3 markets/2 mills) — real AI evaluator-driven opponents are Phase 5.
- `scripts/play.ts` — the interactive CLI (`npm run play`): prompts a human for every decision each year, prints a state summary and the chronicle, and reports the final outcome. Supports both real interactive terminals (via `readline/promises`) and piped/scripted input (reads stdin synchronously up front when not a TTY) — see the code comment on why: Node's `readline` interface auto-closes as soon as a piped stdin hits EOF (near-instant for a file redirect), silently orphaning any `.question()` call made after that point. This was caught by actually running the CLI end-to-end with scripted input, not just unit-testing the underlying loop.
- `scripts/sim.ts` — refactored to use the shared starter helper (dead-code removal)

### Tests (51 total, all passing — 7 new this phase)
- `tests/gameLoop.test.ts` (7) — a full game against scripted opponents completes without crashing; a catastrophic strategy (sell all farmland, then under-feed) eventually collapses the human's population (traced empirically — mortality/emigration are percentage-based, so decay is asymptotic, not instant); a construction-focused strategy ends with strictly more productive buildings than passive play (proving decisions propagate through the full loop, same seed for a fair comparison); `onYearComplete` fires exactly once per year played with a matching chronicle; an async human-decision provider works (proving the interactive-callback shape is sound before wiring real terminal I/O)
- Refactored `tests/determinism.test.ts` and `tests/integration.test.ts` to use the new shared `starter.ts` helper instead of locally duplicated fixtures

### Acceptance Criteria
- ✓ A human can play to bankruptcy (population collapse) or Kaiser rank (victory) without crashing — verified both by automated tests AND by actually running `npx tsx scripts/play.ts` end-to-end with scripted terminal input
- ✓ Chronicle output covers every income/loss source (printed per year in the CLI)
- ✓ `npx tsc --noEmit` clean, 51/51 tests passing

### Design Note: The Extinction Floor
Population mortality/emigration are percentage-based (a fraction of current peasants), so population decays asymptotically toward zero rather than reaching it in finite time under a fixed strategy — this was discovered empirically while building the "reckless play collapses the population" test (a naive `peasants <= 0` check basically never fires; traced the real trajectory and found it crosses below 1 peasant around year ~75 under a maximally catastrophic strategy). `gameLoop.ts` treats "fewer than 1 whole peasant" as the collapse threshold — a legitimate design call (a principality can't function with a fractional population), not a workaround. This is worth keeping in mind for Phase 6: if the balance harness needs a faster-resolving loss condition for AI-vs-AI tournaments, the same asymptotic-decay shape will show up there too.

### Next Phase
**Phase 4 — Event system.** Implement `events/events.ts` (probability/mitigation engine) and `events/catalog.ts` (plague, fire, famine, revolt, banditry), each with a mitigation hook tied to `data/buildings.json`'s mitigation buildings and prosperity-scaled weight per `data/events.json`. This phase escalates to Opus/High effort per the model strategy table — fairness tradeoffs in event design are judgment-dense, matching this project's Phase-4-analog escalation trigger.

---

## Phase 4: Event System ✓

**Status:** Done (Opus/High effort per the model strategy table)

### What was built
- `src/engine/scarcity.ts` — the anti-snowball lever module CLAUDE.md designates. Owns event *exposure*: rather than one global "prosperity" number, **each event scales with the specific kind of prosperity that makes it plausible** — plague follows people, fire follows buildings, banditry follows wealth. That's both more believable and a better lever: there's no single stat a player can dump to become globally safe. Exposure is deliberately **sublinear** (exponent < 1) with a hard cap, so growth always costs something without becoming a death spiral.
- `src/engine/events/events.ts` — probability/mitigation/resolution engine plus `validateEventCatalog()`, which **enforces the design rules in code rather than leaving them as documentation**: every event must name a mitigation building that actually exists in `data/buildings.json`, and no event may declare `probabilityReduction`/`severityReduction` ≥ 1 (mitigation caps risk, never eliminates it). Invalid data throws at import — bad event data can never reach a running game.
- `data/events.json` — rewritten with a real schema (category, exposure spec, mitigation coefficients, floor/max probability, loss spec, per-outcome telegraph text).
- Wired into `advanceYear` as step 9 — **after** taxation (so revolt reacts to this year's unrest including tax burden) and **before** the rank check (so a bad year can genuinely cost a promotion).
- `scripts/event-profile.ts` (`npm run event-profile`) — balance diagnostic printing predicted vs. observed risk curves per prosperity tier. Written for Phase 6, which needs exactly this.

### Two event categories (a deliberate taxonomy, documented in `data/events.json`)
- **Prosperity events** (plague, fire, banditry) — exposure *grows with success*. These are the anti-snowball levers.
- **Condition events** (revolt, famine) — exposure is driven by the player's own bad state (unrest, grain shortfall). These *compound existing problems* rather than rolling independently, which is what satisfies the "famine must compound a shortage" acceptance criterion. A well-governed principality legitimately sees a 0% revolt/famine rate — so the "risk floor" invariant is asserted against prosperity events only, which is the honest scope rather than forcing all five to behave identically.

### Measured risk curve (`npm run event-profile`, 4000 trials/tier)
| Tier | plague | fire | banditry | revolt | famine | ≥1 event/yr |
|---|---|---|---|---|---|---|
| Starting (1k pop, 15k Taler, 0 bld) | 10.0% | 0.0% | 10.1% | 0% | 0% | **19.4%** |
| Growing (4k pop, 60k, 6 bld) | 20.0% | 12.0% | 20.8% | 1.8% | 0% | **45.1%** |
| Thriving (20k pop, 200k, 27 bld) | 44.8% | 23.3% | 37.3% | 4.6% | 0% | **75.2%** |
| Thriving + fully mitigated | 13.5% | 10.9% | 9.2% | 2.4% | 0% | **31.4%** |
| Crisis (unrest 85, feedAdequacy 0.35) | 17.3% | 10.9% | 14.5% | 42.8% | 45.3% | **80.4%** |

This is the intended shape: early game is forgiving (19%), success draws pressure (75%), and full mitigation is *worth buying* (75% → 31%) without ever making you safe — at 850 Taler/yr standing upkeep. Safety is rent, not a purchase.

### Tests (76 total, all passing — 25 new this phase)
- **Schema enforcement (5)** — the shipped catalog validates; an event with no mitigation hook, a nonexistent mitigation building, risk-eliminating mitigation, or a duplicate id each throw.
- **Prosperity scaling (5)** — plague/banditry/fire risk each rise monotonically across a range of driver values; a thriving principality suffers measurably more total disaster than a modest one; exposure caps so even an absurd empire can't exceed `maxProbability`.
- **Mitigation (6)** — hospital/garrison/granary each measurably cut their event's frequency; mitigation reduces expected population loss (severity as well as frequency); a fully-mitigated thriving ruler *still* suffers events over 800 trials; every prosperity event keeps a nonzero floor when exposed.
- **Condition events (3)** — famine rate is 0% when well fed and rises as the shortage deepens (compounding, not independent); a well-governed principality never revolts; revolt risk rises with unrest from a true 0% base.
- **Resolution mechanics (6)** — no event fires twice for one player in a year (300 seeds at maximum exposure); every fired event carries telegraph text and a loss type; losses never drive any resource below zero; fire never destroys the palace or cathedral; results are deterministic per seed; **event resolution consumes a fixed RNG draw count regardless of outcome**.

### Design decision: fixed RNG draw count
`resolveEvents` draws **both** the occurrence roll and the severity roll unconditionally — a fixed 2 draws per event per player per year, whether or not the event fires. This was a real bug caught mid-implementation: an earlier version only drew severity when an event fired, which meant a *prevented* plague desynced the RNG stream and scrambled every later fire/banditry roll. That would have silently invalidated Phase 6's A/B balance comparisons — a "with hospital vs. without hospital" run would have differed in unrelated events too. Now an A/B run differs only in the knob actually changed. Covered by a dedicated test asserting stream position matches.

### Other decisions worth recording
- **`justiceGraft` as revolt mitigation was backwards in the Phase 0 stub data** and has been removed. Graft *causes* unrest — it can't also protect against the revolt that unrest drives. Revolt is now driven by unrest and mitigated by the garrison (civic order), which gives the garrison a meaningful dual role (banditry + revolt) and makes it a real investment decision rather than a single-purpose tax.
- **Fire never destroys the palace or cathedral** — they're stone, they're the rank-progression path, and losing 12 palace stages to one dice roll would be the kind of unfair that makes players quit. It burns markets and mills.
- **Banditry loss scales with wealth** (fraction, with a flat minimum floor) so raids stay relevant late-game instead of becoming rounding errors — another anti-snowball detail.
- **`PlayerEvent.location` was removed** rather than filled with a placeholder: there are no regions yet (that's the deferred Fugger-style multi-region idea). `flood`/`drought` were likewise dropped from the `EventId` union — a union member with no implementation behind it is a trap for exhaustive switches. `data/buildings.json` claimed `well` mitigates a `drought` event that doesn't exist; that stale metadata is fixed, and unreferenced `effectiveness`/`storageCapacity`/`maintainsCivicOrder` fields were removed after grepping to confirm nothing read them.

### Acceptance Criteria
- ✓ Event frequency rises monotonically with prosperity (verified per-event and in aggregate)
- ✓ Each mitigation building measurably reduces its event's expected loss
- ✓ No event fires twice on the same target in one year (structurally guaranteed, tested over 300 seeds)
- ✓ Famine compounds an existing grain shortage rather than rolling independently
- ✓ Every event has a mitigation hook — enforced by schema validation, not convention
- ✓ Mitigation never eliminates risk — enforced by schema validation and verified over 800 trials
- ✓ `npx tsc --noEmit` clean, 76/76 tests passing
- ✓ Verified end-to-end: events fire through `advanceYear` in the headless sim, and telegraph text surfaces in the playable CLI with loss magnitudes

### Next Phase
**Phase 5 — AI opponents v1.** Implement `src/ai/evaluator.ts` (scoring candidate `Decision` sheets using the *real* engine functions — including `calculateEventProbability`, so the AI correctly values mitigation buildings), `personalities.ts` (builder/expansionist/merchant weight vectors from `data/personalities.json`), and `planner.ts`. Stays at Opus/High effort per the model strategy table — the evaluator contract is the load-bearing piece for solo play.

---

## Implementation Notes

### The Reducer Contract
The entire game-year is:
```typescript
advanceYear(state: GameState, decisions: Record<string, Decision[]>, seed: number)
  → { state: GameState, chronicle: Chronicle }
```

- **Inputs:** current game state, each player's yearly decisions (uniform structure), seeded RNG seed
- **Outputs:** next year's game state, a chronicle of what happened (births, deaths, income, events, losses)
- **Guarantee:** deterministic — same inputs always produce byte-identical outputs
- **Implication:** human UI and AI planner both emit `Decision[]`; they plug into the same reducer, so there's no separate "AI code path" to drift or diverge

### Decision Parity
Both human and AI must produce the same `Decision` union shape. This means:
- No "simplified AI mode" (e.g., "AI always feeds to required level")
- No separate evaluator math (e.g., "AI evaluates trades differently")
- The AI scores candidate `Decision` sheets using the *real* `advanceYear` math

### Anti-Snowball Levers (deferred to Phase 6 tuning)
Identified in research, to be implemented and tuned per phase:
1. **Scaling upkeep** — cost of maintaining mitigation buildings, trading houses, garrisons scales with holdings
2. **Prosperity-scaled risk** — event weight multiplier rises with wealth/buildings
3. **Price back-pressure** — oversupply pushes prices down; underbidders force price competition
4. **Rank competition** — multiple AI rulers vying for finite ranks/land/titles
5. **Hostile AI aggression** — leading ruler draws more espionage/raids

### Data-Driven Tuning
All balance knobs live in:
- `data/economy.json` (harvest yields, upkeep rates, price curves)
- `data/events.json` (event base weights, prosperity scaling, mitigation effectiveness)
- `data/personalities.json` (AI archetype weight vectors)

Code *reads* these, never writes them. Balance tuning is JSON edits, not code refactors.

### Testing Strategy
- **Unit tests per module** (economy, land, tax, etc.) — verify individual mechanics in isolation
- **Integration tests** — seeded `advanceYear` runs over 20–100 years, check numeric ranges/invariants
- **Acceptance tests per phase** — the hard gates (Phases 3, 6, 11) are playthroughs or tournament runs

### Headless Simulation
`npm run sim` launches a headless runner that plays seeded games without UI. This powers:
- AI benchmarking (win rates, legality checks, archetype distinctness)
- Balance validation (the Phase 6 flatness criteria)
- Regression testing (every commit must re-pass prior gates)

### Model & Effort Baseline
- **Default:** Sonnet/Medium (fast, sufficient for most work)
- **Escalate to Opus/High:** Phases 4 (event fairness), 5 (AI evaluator contract), 7 (aggressive archetypes)
- **Escalate to Opus/Max:** Phase 6 (the numeric proof of "stays hard")
- **Phase 10 (art):** Haiku/Low + `Workflow` multi-agent for independent asset generation

## Deferred (Out of Initial Scope)
- **Multiplayer (hot-seat or networked)** — architecture supports it (pure reducer + uniform Decision), but not built until explicitly requested
- **Warfare battlefield scene** — will be procedural/text-based in Phase 9, gets Phase 10 art polish
- **Audio** — out of scope unless requested later

---

**Last updated:** Phase 0 scaffolding complete. Ready for Phase 1.
