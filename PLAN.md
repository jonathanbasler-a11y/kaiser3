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

## Phase 5: AI Opponents v1 ✓

**Status:** Done (Opus/High effort per the model strategy table)

### What was built
- `src/engine/decisions.ts` — `validateDecisions()`, the single definition of a *well-formed* decision sheet (the engine already clamps over-ambitious ones). Shared by the AI and, later, the UI, so legality can't drift into two definitions.
- `src/ai/evaluator.ts` — state valuation. Scores using the **real** engine functions: `calculateEventProbability()` and `rankProgress()`. Risk is priced by **perturbation** — apply expected annual losses to a copy and measure the utility destroyed — rather than by a hand-written formula.
- `src/ai/personalities.ts` + `data/personalities.json` — three validated archetypes as pure weight vectors.
- `src/ai/planner.ts` — generates coherent candidate sheets and simulates each **one year forward through the actual `advanceYear` reducer**, then keeps the best. All candidates share the same evaluation seeds, so they're compared under identical weather and identical event rolls; each is averaged over 2 seeds so a single lucky harvest can't decide the plan.
- `src/ai/sim.ts` — match runner, random-legal benchmark bot, tournaments, and `compareStanding()`.
- `src/engine/ranks.ts` — added `rankProgress()` (see below) and `getNextRank()`.
- `scripts/ai-bench.ts` (`npm run ai-bench`) — measures every acceptance criterion and prints archetype profiles.
- `scripts/play.ts` + `gameLoop.ts` — **the human now plays against real AI rivals** with distinct personalities and visible year-by-year standings. Opponent decisions are *injected* into `runGame`, so the engine never imports from `src/ai` (the AI is a consumer of the engine, not the reverse) and the engine stays runnable with no AI present.

### Results (`npm run ai-bench`, 60-year matches)
| Archetype | vs. random bot | vs. passive | Taler | Peasants | Palace | Rank |
|---|---|---|---|---|---|---|
| The Builder | **100%** (30/30) | 100% | 385,185 | 1,305 | 16.0 | 0.08 |
| The Expansionist | **100%** (30/30) | 100% | 376,086 | 1,373 | 16.0 | 0.25 |
| The Merchant | **100%** (30/30) | 100% | 437,074 | 1,159 | 3.0 | 0.08 |

Legality audit: **360 decision sheets, 0 illegal.**

### Acceptance Criteria
- ✓ AI beats a random-legal bot in ≥90% of matches — 100% for all three archetypes
- ✓ Never emits an illegal decision — 0 of 360 audited sheets
- ✓ Archetypes measurably distinct — Merchant is richest with the fewest monuments (palace 3 vs 16); Expansionist grows the largest population
- ✓ `npx tsc --noEmit` clean, 112/112 tests passing
- ✓ Verified end-to-end in the playable CLI, not only in benchmarks

### Four bugs found by benchmarking (each was measured, not guessed)
The AI initially **lost to a random bot (26.7%)**. Diagnosis was iterative, and each fix came from a measurement:

1. **The AI optimised a different game than it was scored on.** Its utility valued a whole rank at 25,000 while a typical treasury reached 431,000 — cash outweighed a rank by **17×**. It rationally hoarded money and never left rank 0. Rank weights are now ~1,000,000, matching how decisively rank dominates the actual victory condition.
2. **Rank is a step function a one-year planner is blind to.** A palace stage costs 5,000 and pays nothing until the 4th lands alongside wealth and population thresholds. Added `rankProgress()` — a continuous ladder using the **minimum** across requirements, so credit goes to whichever dimension is *binding* and hoarding the easy one earns nothing.
3. **Construction candidates were generated from pre-purchase land.** The palace needs 13,000 ha and a ruler starts with 10,000, so "buy land *and* start the palace" was never generated and the rank path was unreachable. Candidates now use post-purchase land, matching the engine's own land→construction ordering.
4. **Risk was priced with the raw `population` weight (5.0)** when a peasant's real marginal value — as the binding rank constraint — is ~600. So the AI refused to build a hospital, which measurement showed is *decisive*: unmitigated plague costs ~19.7 peasants/year against ~12/year natural growth, so an uninsured principality shrinks forever. Perturbation-based pricing fixed this, and the AI now buys the hospital and grows (1,038 → 1,809 peasants over 60 years).

### A bug I introduced and caught
The palace-land enablement term was first gated on "palace stages still outstanding", which put a ~540,000-utility **cliff at exactly 4 stages** — building the 4th was a catastrophic loss, so the AI refused, and the Builder's palace stalled at 2.8 stages instead of the 16 it had been completing. **Any term that vanishes on meeting a requirement bribes the planner not to meet it.** The term now varies only with land and stays smooth.

### The Expansionist was fighting the game's own economics
It failed at 75-83% while the others hit 100%, and the cause was a genuine design flaw, not tuning noise. Three compounding problems, all measured:
- `risk` 0.7 — it weighted population highest of all three archetypes yet **under-insured the one thing that destroys population**.
- `prestige` 3000, **below the palace's 5,000-per-stage cost**, so stages never paid for themselves and it never started the rank path. Runs split cleanly into "reached 13,000 ha and won" and "stuck at palace 0, progress 0.000, lost".
- `land` 1.1, the highest of any archetype — but **farmland is labor-gated at 5 ha per peasant**. It finished holding 13,412 ha with 757 peasants: **9,574 ha (71%) idle**, and the *smallest* population of the three despite caring most about population. It was buying hectares nobody could work, starving the population that would have made them useful.

Expansion in this game runs through **people**, not deeds — peasants unlock the land you already hold. Rebuilt around food security, contentment, and protection, it went 75% → **100%**, and its population from 757 → 1,457.

### Known limitation (deferred to Phase 7, recorded honestly)
The Builder and Expansionist have **converged** more than is ideal (385k vs 376k Taler, both palace 16). With only economy, construction, and events implemented, the strategy space is narrow enough that competent AIs rationally find the same path; the clear separation is Merchant-vs-the-others. Genuine archetype diversity needs Phase 7's espionage, inter-ruler trade, and raiding to open up strategies that reward genuinely different play. The distinctness test asserts only the differences that are real today rather than overclaiming.

### Balance note for Phase 6
Ranks arrive slowly: Duke ~80 years, Prince ~120, Margrave ~200; Kaiser (20,000 peasants) is far out of reach in a normal-length game. The ladder works and the AI climbs it, so this is a **pacing** question, which is exactly Phase 6's remit.

### Next Phase
**Phase 6 — Balance harness + anti-snowball gate.** Build `scripts/balance.ts` and enforce the three flatness criteria (margin flatness, loss persistence, lead volatility) over ≥200 seeded matches. **This is a hard gate: no content or art work proceeds until it passes.** Escalates to Opus/Max per the model strategy table — it is the numeric proof of the "stays hard throughout" requirement. Note that `resolveEvents` deliberately consumes a fixed RNG draw count (Phase 4) precisely so this harness can attribute effects to the knob it changed.

---

## Phase 6: Balance Harness + Anti-Snowball Gate ✓

**Status:** Done — **GATE PASSED** at full scale (200 matches × 60 years). Full results in [docs/balance-report.md](docs/balance-report.md).

### What was built
- `src/ai/balance.ts` — instrumentation and the three criteria. `runInstrumentedMatch` collects a per-year timeline via a `YearObserver` callback threaded through the existing `runMatch`, so there is no duplicated match loop to drift.
- `src/ai/balanceCriteria.ts` — thresholds in **one place**, shared by the script and the committed tests, so they cannot disagree about what "balanced" means.
- `scripts/balance.ts` (`npm run balance [matches] [years]`) — prints all criteria and **exits non-zero on failure**, so it can gate a build as well as inform tuning.
- `tests/balance.test.ts` — the criteria as committed acceptance tests on a smaller sample of the same deterministic seeds.

### Gate results (200 matches × 60 years)
| Criterion | Result | Threshold |
|---|---|---|
| Margin flatness | slope **−2.821e-3** (returns fall 2.13% → 0.95%) | ≤ 0.002 |
| Loss persistence | late rate **38.8%**, late/early ratio **1.30** | ≥ 25%, ≥ 0.6 |
| Late lead volatility | leader changes late in **39.5%** of matches | ≥ 20% |
| No early runaway | yr-20 leader wins **50.5%** | ≤ 85% |

The setback arc by decade — **27% → 33% → 10% → 14% → 27% → 51%** — is the intended shape: danger dips while mitigation is being bought, then climbs past its starting level as prosperity outgrows the insurance. Success creates new pressure instead of removing it.

### The first run passed — and was wrong
The most valuable thing this phase did was catch its own measurements. Three bugs, all of which **flattered the game**:
1. Setbacks measured against **total holdings** read 0.0% in every decade of every match (holdings are dominated by land at book value and barely move), and a division-by-zero fallback let that "pass" vacuously. A criterion that never fires is not evidence of balance. The vacuous path is now an explicit failure with an absolute floor alongside the ratio, plus a test asserting the metric actually fires.
2. Setbacks measured against **treasury movement** were worse than useless — they counted the ruler's own **spending** as misfortune. The early game looked perilous precisely because that is when land and palace stages get bought, while a mature ruler with nothing left to buy looked serene. Exactly backwards. Adversity is now read from event losses in the chronicle.
3. `PlayerChronicle.eventLosses` **summed peasants and Taler into a single number**, which means nothing. Split into `eventGoldLoss` / `eventPopulationLoss` / `eventBuildingsDestroyed`.

### Two genuine design faults, then fixed
4. **Only event frequency scaled with prosperity, not severity.** A large realm was struck more often but each blow stayed proportionally identical — and once mitigation shaved 40–50% off, no single event could dent a mature ruler at all. Added `severityExposureScaling`: a plague in a dense city really is worse than one in a village. Condition events (revolt, famine) have exposure ≤ 1 by construction and are deliberately untouched — only prosperity amplifies.
5. **Mitigation was close to immunity.** Cutting frequency 70–80% *and* severity 40–60% compounds to ~87% risk reduction. Insurance should mean "this happens to me less often", not "this barely matters when it happens". Severity reductions cut to 0.2–0.3, probability reductions moderated to 0.6–0.7.

### Separate finding: the rank ladder was unreachable
Tuning exposed that the Phase 0 rank thresholds predated the population model entirely. Measured: under *ideal* play with full mitigation, population peaks near **4,600** and oscillates. Kaiser required **20,000** — unreachable by 4–5×, making every rank above Prince unattainable however well the game was played. Thresholds recalibrated to what the simulation actually produces (Duke 1,300 → Kaiser 4,200). Progression now: **Duke at 60y, Count at 120y, Margrave at 300y.** Kaiser stays deliberately out of reach in a normal-length game — recorded for Phase 11's difficulty presets rather than quietly tuned away.

### Acceptance Criteria
- ✓ All three flatness criteria pass over ≥200 seeded matches — **the hard gate is met**
- ✓ Thresholds committed as CI-enforced tests so regressions fail automatically
- ✓ Results written to `docs/balance-report.md`
- ✓ `npx tsc --noEmit` clean, 124/124 tests passing

### Next Phase
**Phase 7 — Espionage, inter-ruler trade, and the schemer/raider archetypes.** Drops back to Opus/High. Two things to carry forward: the loss-persistence criterion is partly about "events **and AI aggression**" in the plan's own wording, so it should be re-examined and likely tightened once rulers can strike each other; and Phase 5's recorded limitation — Builder and Expansionist converging because the strategy space is narrow — is exactly what this phase's mechanics should open up.

---

## Phase 7: Espionage and Aggressive Archetypes ✓

**Status:** Done. Gate re-passed with five archetypes.

### What was built
- `src/engine/espionage.ts` — guards, saboteurs, and two distinct strike modes so the aggressive archetypes are not two names for the same move: **raid** plunders the treasury (the Fugger/Hanse piracy move), **sabotage** burns a workshop and carries off grain *and* coin (the Kaiser secret-service move). `strikeSuccessProbability` is exported so the AI prices attacks with the real formula.
- `src/ai/aggression.ts` — target selection and strike valuation, deliberately kept out of `planner.ts` because it is the one decision the isolated one-year lookahead cannot score (an isolated state has no rivals in it). Still emits an ordinary `EspionageDecision`, so Decision parity holds.
- Two new archetypes, **The Schemer** (sabotage) and **The Raider** (raid), plus aggression profiles for the original three.
- `advanceYear` restructured into per-ruler → cross-ruler → per-ruler passes. The rank check moved **after** espionage, so a treasury emptied by raiders genuinely costs the title that year.
- Strikes surfaced in the playable CLI both ways, and the human can now recruit and strike with the same decision the AI uses.

### Results
- **All five archetypes ≥91.7%** vs the random-legal bot; 5-way wins spread **3/5/7/4/5** over 24 matches — every archetype is genuinely viable.
- **~3,270 strikes** across 24 matches, **33.7% aimed at the current leader** where random targeting would give 25%.
- Gate re-passed with five rulers, and the aggression levers moved it decisively:

| Criterion | Phase 6 (3 peaceful) | Phase 7 (5, with aggression) |
|---|---|---|
| Late lead volatility | 39.5% | **54.2%** |
| Early leader wins | 50.5% | **20.8%** |
| Late setback rate | 38.8% | **72.9%** |

Being ahead is now actively dangerous, which is exactly the anti-snowball lever Phase 6 recorded as missing.

### Bugs found and fixed
1. **Aggression deadlock.** Target attractiveness was scored using the ruler's *current* saboteurs — zero at the start — so every target scored zero, so saboteurs were never recruited, so there were never any saboteurs. Espionage silently switched itself off: **zero strikes across twenty matches**, while every archetype still paid for guards. Targets are now scored at the force the ruler *aspires* to field.
2. **Standing forces bought regardless of opportunity.** Recruitment was sized purely by personality appetite, so a Raider facing a pauper still paid saboteur upkeep for raids that could never repay it. Guards now answer the threat that actually exists (rivals' saboteur counts) and saboteurs are only kept while some rival is worth robbing.
3. **Sabotage valued burning a workshop the victim did not own** — a flat constant in the AI's valuation regardless of the target's buildings.
4. **The balance harness could not see aggression at all.** Its setback metric counted only *events*, so a leader stripped of 18% of its treasury by raiders registered as having had a quiet year — and the gate failed on loss persistence purely because leadership was changing hands too fast for events alone to land. Plundered coin now counts as adversity, which is what PLAN.md's "events **and AI aggression**" wording always meant.
5. **`NaN` propagation from malformed input.** `resolveFeeding`'s switch had no default branch, so an unrecognised feed level left `grainOffered` undefined and NaN spread silently through feeding, population, events and the treasury — surfacing in the CLI as "NaN peasants lost" and a realm that collapsed in two years. Found by feeding the CLI deliberately misaligned input. Fixed in the engine (degrade to `required`) *and* in the CLI (validate before submitting), with a regression test.

### Design finding recorded, not papered over
The Schemer initially lost despite sabotage **succeeding over 70% of the time**, because its loot was grain — and **grain has no monetary value in this game**. There is no market to sell surplus into, and harvests already run far above consumption, so stockpiles reach hundreds of thousands and do nothing. The immediate fix was faithful to the source (the original transfers "grain/currency"), so sabotage now takes coin too, and that lifted the Schemer from 83.3% to 91.7%.

The underlying gap remains: **a grain market is missing**, and with it the whole surplus-selling loop that was central to the original. That is the top item for Phase 8, and it is also the reason inter-ruler trade was not attempted here — trading grain between rulers is meaningless while grain cannot be priced. Shipping half a trade system would have been worse than shipping none.

### Acceptance Criteria
- ✓ Sabotage math tested — success odds, loot transfer conserving totals, saboteur losses heavier on failure, no resource driven below zero
- ✓ Leading-ruler-draws-fire verified statistically (33.7% vs 25% random)
- ✓ Phase 6's flatness criteria re-pass with all five archetypes in the pool
- ✓ All five archetypes viable, none dominant
- ✓ `npx tsc --noEmit` clean, 145/145 tests passing
- ✓ Verified end-to-end in the playable CLI, both striking and being struck

### Next Phase
**Phase 8 — Grain market, warfare, and succession.** The grain market is now the highest-value item and should come first: it gives the harvest surplus a purpose, makes sabotage's loot meaningful on its own, restores the original's central buy/sell-corn loop, and is the precondition for inter-ruler trade. Then warfare, alliance voting, and the heir mechanic. Sonnet/Medium per the model table, but the grain market will require re-running the balance gate since it adds a whole income channel.

---

## Phase 8: The Agricultural Economy ✓

**Status:** Done. Gate re-passed. **The game is winnable end-to-end for the first time.**

Scope was set by owner direction: a grain market, grain that keeps a couple of seasons, and harvests with genuinely good and bad years. Warfare and succession move to Phase 9.

### What was built
- **Weather bands** (`data/economy.json`) — harvests draw from seven named bands from *Drought* (0.3×) to *Harvest of a lifetime* (1.85×), weighted to a near-neutral long-run mean. A drought is now something a player remembers and plans around rather than a 15% dip lost in noise.
- **Multi-season storage** — 18%/yr spoilage (about half a reserve survives three years) plus a hard storage ceiling expressed in *years of consumption*, which a granary raises. Grain is a real but wasting asset, and the granary finally earns its upkeep beyond famine cover.
- **Grain market** — sell surplus to the Kaiser, buy back at a markup. The spread makes "store it or sell it" a judgement rather than arithmetic, and gives the early game an income source before any market or mill exists.
- **Consumption recalibrated 0.5 → 8.0 per peasant.** The old figure meant each peasant produced **25× what they ate**, which is not an agricultural economy: grain was worthless, stockpiles meaningless, sabotage loot pointless and weather irrelevant. A peasant now produces roughly 1.5× their own food.
- The AI plans the sell/store decision as "keep N years of food, sell the rest", so a Merchant runs the barns lean where an Expansionist does not.

### Fixed: the game was unwinnable (BACKLOG B1)
`ranks.json` required a cathedral for the top ranks while `buildings.json` gated the cathedral behind **5,000 population — above the measured ceiling of ~4,600**. Measured: `cathedral = 0` in every run, rank capping at Margrave after 300 years. This was introduced in Phase 6, which recalibrated rank population thresholds but not the coupled building requirement. **Lesson: when recalibrating a threshold, check every other requirement that depends on the same quantity.**

### Progression now
| | Before Phase 8 | After |
|---|---|---|
| Solo rank ceiling | Margrave (4) at 300y | **Kaiser (7) at ~120y** |
| Cathedral built | never | yes, ~yr 100 |
| Outright Kaiser victories | 0 | **7 of 24** competitive matches |

### Four bugs found by measurement
1. **Prices were hardcoded in `starter.ts`**, so retuning `cornBasePrice` in the data changed nothing — the game kept selling at the old 40/unit and one bountiful harvest paid **440,000 Taler**. Prices now read from data.
2. **The AI valued grain reserves only up to one year.** A drought harvests at 0.3×, so one year in the barn does not cover it; everything above was treated as worthless and sold. Realms then starved in the first drought and never recovered. The security score now measures against **two** years — while feeding adequacy still caps at one, since you cannot be better than fully fed.
3. **Population was in long-run decline and food was not the cause.** Traced over 200 years: births +4,669 and immigration +1,493 against deaths −3,383, emigration −212 and **event losses −2,947**. Plague, not hunger, was eating the realm — Phase 6 deliberately made events severe, and +1%/yr natural growth could not recover between them. Birth/death rates raised to 3.8%/1.7% (net +2.1%): high churn, modest net, historically how pre-modern populations rebuilt after plague years. *Two earlier grain-tuning attempts failed because I was fixing the wrong thing; the fix only came from measuring the actual flows.*
4. **Zero-loss events were reported to the player** — "Fire tears through the workshops (0 buildings destroyed)", because fire exposure counts every building but only workshops can burn. An event that took nothing is no longer recorded.

### Also
- **Land is now valued as population headroom**, not just as a palace precondition: usable land is capped at the workforce a realm can plausibly grow into, so buying room to expand is rewarded while hoarding idle hectares is not.
- Rank population thresholds recalibrated again (Kaiser 4,200 → 3,200) because making food a real constraint *lowered* the sustainable population.
- The CLI now frames grain legibly — *"11,000 of 20,000 storable (1.4 years' food; your people eat 8,000/year)"* — and reports each year's weather and any grain that rotted for want of barn space.

### Gate (24 matches × 60 years, 5 rulers) — PASSED
| Criterion | Result | Threshold |
|---|---|---|
| Margin flatness | slope **−6.72e-3** | ≤ 0.002 |
| Loss persistence | late rate **92.9%**, ratio 1.14 | ≥ 25%, ≥ 0.6 |
| Late lead volatility | **91.7%** | ≥ 20% |
| No early runaway | **33.3%** | ≤ 85% |

### Recorded honestly, not tuned away
- **Archetype convergence got worse** (BACKLOG D2). Population is now the effective gate on every senior rank, so every competent archetype grows one; treasuries finish within ~5% of each other. The fix is different *routes* to rank — inter-ruler trade and warfare — not more weight-tweaking. The distinctness test was narrowed to what is still genuinely true.
- **The gate is one-sided** (BACKLOG D5). Leader returns now go negative late (−1.36% by decade 6), which passes margin flatness trivially. That is plausibly the leader-focused aggression working as designed, but the gate cannot currently tell that apart from a game grinding everyone down. It needs a floor as well as a ceiling.

### Next Phase
**Phase 9 — Mobile-first UI (iOS Safari), then warfare and succession.** The UI is now the critical path: the simulation is winnable, balanced and covered by 154 tests, and it has never been seen outside a terminal. Per the owner requirement it must be touch-first and portrait-friendly on iOS Safari, statically hosted with no backend. **Measure `planYear` on a phone before committing to a turn flow** — it evaluates ~150 candidates × 2 seeds per ruler per year, which is comfortable on a laptop and entirely unmeasured on mobile (BACKLOG P1).

---

## Phase 9: Mobile-First UI ✓

**Status:** Done. The game is playable end-to-end in a browser for the first time — previously only a Node CLI.

### What was built
- `index.html` + `src/ui/` — a small no-framework app (`app.ts` state machine, `dom.ts` DOM helpers, `decisions.ts` draft→Decision builder, `render.ts`/`theme.ts` a procedural Canvas 2D banner). Screens: setup → decisions (tabbed: Realm/Grain/Land/Tax/Build/Secret Service) → year report → game over → play again.
- Touch-first controls throughout: **steppers** (+/− buttons) for bounded integer choices and **sliders** for 0-100 rates — no free-text numeric entry anywhere in normal play, so no numeric keyboard ever needs to appear on a phone.
- Mobile-safe layout: `viewport-fit=cover` + `env(safe-area-inset-*)` for the iPhone notch/home-indicator, `100dvh` for the iOS dynamic toolbar, `touch-action: manipulation` to remove the old 300ms iOS tap delay, 44px minimum tap targets throughout.
- `Decision` parity holds for the human too: `decisions.ts` builds the exact same `Decision[]` shape `planYear` emits, validated by the same `validateDecisions()` — one definition of a legal turn across AI, UI, and (already, from Phase 3) the CLI.
- Static production build: 47.75 kB JS / 15.56 kB gzipped, root-relative asset paths, zero backend calls anywhere in the bundle.

### Verified in-browser, not just compiled
Screenshot capture failed in this environment (Browser pane not compositing — a known limitation, not a bug in the app). Verification instead drove real synthetic click/input events via `javascript_tool` and read results back via `get_page_text`/console/DOM inspection — the `verify-without-screenshot` approach. Covered: full setup → 20-year game → game-over → play-again loop, every tab, grain/land steppers, tax sliders, construction, hiring guards/saboteurs, selecting a strike target and mode, and the resulting event/strike log. Zero console errors across the entire session. Confirmed zero horizontal overflow at an exact 375×812 (iPhone) viewport and correct centered layout at desktop width.

### The performance question, answered
`planYear`'s candidate sweep was flagged in Phase 8 as "comfortable on a laptop, unmeasured on mobile." Measured **in the actual browser** (not Node): **30-50ms per year at 2 rivals, 77-118ms at 5 (the maximum)**. Even at the 3-6x slowdown phones typically show versus a dev laptop, that is comfortably under any threshold a user would notice, let alone the ~1s mark where browsers start warning about an unresponsive page. No Web Worker needed for this phase.

### A real bug the measurement caught
The year-advance handler used a double `requestAnimationFrame` to yield one frame — so the "Advancing the year…" loading screen would paint — before running the heavy synchronous planning work. First timing attempt showed this taking **6+ seconds** instead of the expected ~50ms. The cause: rAF callbacks are scheduled by the display compositor and **do not fire at all** while a tab is not actively compositing — confirmed directly, since this session's Browser pane has exactly that property (the same reason screenshot capture failed above). Any real device hitting the same condition — backgrounding mid-tap, a screen lock, certain mobile-browser navigation states — would see the same stall, indefinitely in the worst case, with no error and no way out except reloading. Replaced with `setTimeout(fn, 0)`, which still yields a turn for the paint but fires regardless of visibility. **rAF is the wrong primitive for "defer this synchronous work"** — it's for "run this in sync with the next paint," a different thing — and this is flagged in BACKLOG.md as a pattern to watch for in any future UI code.

### Acceptance Criteria
- ✓ Playable end-to-end in a browser (previously CLI-only)
- ✓ Touch-first: no free-text numeric entry, 44px minimum tap targets, no hover-only affordances
- ✓ Portrait-friendly with correct iOS safe-area/dynamic-toolbar handling
- ✓ Verified at a real mobile viewport (375×812) with zero overflow and zero console errors
- ✓ Static build, no backend, deployable anywhere
- ✓ AI turn latency measured in-browser and found comfortable without a Worker
- ✓ `npx tsc --noEmit` clean, all 154 existing tests still passing, production build succeeds

### Next Phase
**Phase 10 — ComfyUI art pass**, or **warfare + succession** (BACKLOG F4/F5) if gameplay depth is prioritized over visuals first — the procedural banner is a genuine fallback, not a blocker, so either order works. Recommend warfare/succession next: the UI now exists to surface it immediately, and it is the more direct lever on the archetype-convergence problem (BACKLOG D2) than another art pass would be.

---

## Phase 10: ComfyUI Art Pass (Ready to Execute)

**Status:** Fully prepared, awaiting generation

### What Will Be Built
45 art assets via local ComfyUI (all original, no copyrighted reference material):
- **Portraits (5):** One per archetype (builder, expansionist, merchant, schemer, raider), 256×256
- **Buildings (21):** Market, mill, cathedral, hospital, well, granary, garrison, trading house, palace 16 stages, 128×96
- **Event Icons (7):** Plague, fire, famine, revolt, banditry, flood, drought, 96×96
- **Terrain (6):** Farmland (fallow/planted/ripe/blighted), forest, river, 128×96
- **Scenes (3):** Coronation tableau, battlefield backdrop, chronicle parchment, 1280×720

**Generated to:** `public/art/<category>/<assetId>.png`  
**Fallback:** Procedural Canvas 2D rendering if any file missing (game remains 100% playable)

### Fully Prepared Infrastructure
- ✅ `docs/art-spec.md` — complete asset specifications with visual preambles and per-asset prompts
- ✅ `docs/phase-10-plan.md` — full execution workflow, generation parameters, success criteria
- ✅ `data/tileset.json` — manifest mapping all 45 asset IDs → paths
- ✅ `src/ui/spriteLoader.ts` — loader tries disk art, falls back to procedural
- ✅ `src/ui/render.ts` — procedural fallback renderers for all 5 categories (portraits, buildings, events, terrain, scenes)
- ✅ `scripts/gen-art.ts` — orchestration script: reads specs, dispatches to ComfyUI, saves PNGs
- ✅ `scripts/verify-art.ts` — post-generation validation (file sizes, load test, fallback check)
- ✅ `package.json` — added `npm run gen-art` and `npm run verify-art` scripts

### Generation Workflow
1. **Parallel asset generation:** Portraits → Event icons → Buildings → Terrain → Scenes (can parallelize by category via multi-agent `Workflow`)
2. **ComfyUI parameters:** DPM++ 2M Karras, 30–40 steps, CFG 7–8, seed derived from asset ID (deterministic)
3. **Verification:** `npm run verify-art` confirms all files, procedural fallback still works
4. **Testing:** `npm run test`, `npm run build`, play full game end-to-end, spot-check at 375×812 viewport
5. **Commit:** All 45 PNGs checked in, auto-deploy to Vercel

### Acceptance Criteria
- ✓ All 45 assets generated, > 1 KB each, correct dimensions
- ✓ No fetch/404 errors in browser console
- ✓ Visual spot-check: faces recognizable, building silhouettes clear, event icons readable, terrain distinct
- ✓ Game plays end-to-end with generated art
- ✓ Procedural fallback works (delete art, game renders procedurally, restore)
- ✓ Tests pass, build clean, deployed live

### Next Phase
**Phase 11 — QA/Hardening** or optional **Phase 11b (Warfare + Succession)** if gameplay depth is prioritized over polish. After art is live, the game is feature-complete and ready for regression, difficulty presets, and final balance validation.

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
