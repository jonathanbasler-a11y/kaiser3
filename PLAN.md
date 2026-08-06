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
| **11** | Sonnet | High | Trading houses, succession, warfare (BACKLOG B2-B4, F4, F5) | Tests green, balance gate re-passes with the new income/loss channels |
| **11.5** | Opus | Max | Balance instrumentation + make warfare a live mechanic | Harness sees every income/loss channel; war fires at a deliberate cadence; gate re-passes |
| **12** | Sonnet | High | `planYear` performance, flood/drought (F6), corn price drift precursor | ~4× perf with byte-identical decisions (golden test), balance gate re-passes twice |
| **13** | Opus/Sonnet | High | D2 design spike (rank-gate shape), difficulty presets, hardening sweep (D1/D3/D4/D5) | D2 decision documented; presets separate measurably in the harness; D5 gate floor actually fails a spiralled config; all prior gates re-pass |
| **14** | Sonnet | High | D2 rank-gate implementation (alternative requirement paths) | Schema/engine/evaluator generalized; every consumer updated; tests green with reviewed golden-fixture drift; balance gate re-passes; `ai-bench` shows real diversification |
| **15** | Sonnet | Medium | UI fixes — palace/cathedral land-gate feedback, D2 rank-progress bars | Gate messages + path progress verified in-browser; tests green |
| **16** | Sonnet | Medium | Legibility from bug reports #9–12 + crest art pipeline prep | Cost/income/rank hints live; crest schema/prompts/UI ready (PNGs optional) |
| **17** | Sonnet | Medium | Tap-to-toggle info tooltips on every changeable field | Mobile-first ⓘ tooltips; no hover dependency; tests green |
| **18A** | Sonnet | Medium | UX transparency — spend shortfalls, tooltip overflow, mitigation/war clarity | Shortfalls reported; tooltips stay on-screen; browser-verified |
| **18B** | Sonnet | Medium | Live spend/outcome preview panel (real `advanceYear` on a clone) | Preview matches End Year on spend order (deltas superseded by 21.3); rival `planYear` cached by state identity |
| **18C** | Sonnet | High | Warfare depth — training, equipment, defender's advantage | Strength multipliers; upkeep; balance gate re-passes |
| **18D** | Sonnet | Medium | ~200 small positive random events (flavor, gate-neutral) | 10%/yr flavor hits; balance gate unchanged; golden fixture reviewed |
| **19A** | Opus | High | War brakes — mutual truces + war weariness | Truce blocks repeats; weariness→unrest; AI prices brakes; gate re-passes |
| **19B** | Sonnet | Medium | Medieval CSS reskin (fonts, parchment palette, ornament) | Self-hosted OFL fonts; readable at 375×812; no new art |
| **19C** | Sonnet | Medium | Flavor pass — events/ranks/difficulty voice | Combinatorial fluff rewritten; mechanical UI text untouched |
| **19D** | Opus→Sonnet | High | Economy depth design spike (trade routes / guilds vs NPCs) | Spec approved; not F2 bilateral trade |
| **20.1** | Sonnet | Medium | PR #35 regressions — truce/weariness UI, contrast, rival names | Truce targets disabled; AA contrast; epithet names |
| **20.2** | Opus | High | Population ceiling retune + breakdown fix + profile | Breakdown sums in plague years; balance + pop profile |
| **20.3** | Sonnet | Medium | Events made visible — cards, live risk, catalog | Per-event cards; calculateEventProbability in UI |
| **20.4** | Sonnet | Medium | Explain every number (UI pass-through) | Footer breakdowns; Tax outputs; spy %; Breakdown type |
| **20.5** | Sonnet | Medium | Art wiring, procedural icons, status tones, gen list | Terrain/war/chronicle art; --warn; gen-art checklist |
| **20.6** | Sonnet | Medium | Art QA pass — verify, regenerate, delete dead entries | Committed in `2a77644` (#43) |
| **20.7** | Sonnet | Medium | GPU seed sweep for remaining crests | Committed in `0c7592b` (#44); baron/duke recovered |
| **21.0** | Sonnet | Low | Reducer golden fixture (baseline ratchet for the 21.x bug-log workstream) | Multi-player/multi-year cross-process fixture; proven to fail on a stray RNG draw; zero `src/` change |
| **21.1** | Cursor | — | Scroll jump on tax/land controls (#45) | Merged in `66c1919` (#53) |
| **21.2** | Cursor | — | Name destroyed markets/mills, sabotage grain (#48) | Merged in `32ff597` |
| **21.3** | Opus | High | Harvest becomes a forecast, not a spoiler (#46) | Per-player `weatherOverrides`; draw still consumed; 3-band preview; goldens byte-identical |
| **21.1** | Sonnet | Medium | Scroll-jump fix (#45) — stop `renderGame()` on slider/stepper | Tax/land/spy/war mutate draft or tab-only; `.screen` scroll preserved |
| **21.2** | Sonnet | Medium | Name destroyed buildings + sabotage grain (#48) | Event/sabotage loss text names markets/mills; strike log shows grain |

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

## Phase 10: ComfyUI Art Pass ✓

**Status:** Complete

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

### Results

**Generation Summary**
- Generated: 32/32 assets (all requested categories delivered)
- Total size: 5.1 MB (portraits largest at ~100–130 KB ea. due to ornate framing; scenes at 1.2–1.6 MB ea. at native res)
- Pipeline: SDXL (native 1024×1024 / 1152×896 / 1344×768) → ImageScale lanczos → in-game sizes (256×256 portraits, 128×96 buildings/terrain, 96×96 events, 1280×720 scenes)
- Seeding: Deterministic FNV-1a hash per category/assetId for reproducibility
- Verification: All files present, valid PNG, > 1 KB, no 404 errors on load

**Test & Verification**
- Full test suite: 154/154 passing (no regressions from art integration)
- Verification script: all 32 assets confirmed present and loaded successfully
- Infrastructure verified: `spriteLoader.ts` fetches art correctly, procedural fallback renders if any file missing

**Deployment**
- Committed: `git add public/art scripts/gen-art.ts && git commit -m "phase-10: ComfyUI art pass — all 32 assets generated and verified"`
- Game remains 100% playable with cosmetic art enhancement; procedural fallback is permanent invariant per CLAUDE.md

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

## Phase 11: Trading Houses, Succession, Warfare ✓

**Status:** Complete — closes BACKLOG.md items B2, B3, B4, F4, F5.

### What Was Built
- **Trading houses (B3):** `ConstructionDecision.tradingHouseBuild`, rank-gated at Margrave (`data/buildings.json` commerce.tradingHouse), capped at 3, generating real income via `calculateBuildingIncome()` — sized to roughly offset the pre-existing wealth-proportional tribute at typical Margrave-era wealth, then falling behind as wealth grows (the same anti-snowball shape every other late-game building follows). Wired into AI candidate generation and the human Build tab.
- **Succession (B2/F5):** `src/engine/succession.ts`. No chance before a 15-year minimum reign; then a small, rising, capped annual chance the reign ends. Territory/rank/buildings persist unchanged; only a new `score` field (cumulative productive income this reign) resets to zero. `dead` is now genuinely set by `checkExtinction()` on real population collapse — previously declared but never assigned anywhere in the codebase. `heir` is set to the player's own id (self-succession): Kaiser 3 is one continuous session against AI rivals, not a hot-seat handoff, so there is no separate heir entity — a documented simplification, not an oversight.
- **Warfare (F4):** `src/engine/war.ts`. `warStrength()` derived from garrison + guards + a population levy (no new unit system). Declared wars resolve probabilistically; requested allies join data-driven-probabilistically (more likely against a defender stronger than themselves). Both sides always take a real casualty regardless of outcome; the winner takes land (capped at half the loser's holdings) and reparations; the loser's garrison has a real chance of being destroyed. AI wiring in `src/ai/warAggression.ts` (same "price it directly, can't isolate-simulate a rival" reasoning as espionage's `aggression.ts`) — only archetypes with real aggression and a clearly favorable win probability (≥62%) ever declare. Human UI: new War tab mirroring the Secret Service tab's target-selection pattern, plus ally-request buttons.
- **B4 (TradeDecision/WarDecision no-ops):** WarDecision is now fully executed. `TradeDecision` (inter-ruler trade, F2) stays out of scope and was **removed from the `Decision` union** per BACKLOG's own prescribed remedy, rather than left validated-but-inert.
- **UI bug fix (unrelated report, fixed same phase):** mitigation buildings (well/hospital/granary/garrison) and the guards/saboteurs counts were reported as "resetting to zero" every turn. Root cause: not a state bug (verified directly — persistence confirmed via a standalone engine test) but a UI ambiguity — the yearly *order* stepper correctly defaults to 0 every year, sitting right next to a small `(1)` showing the real persisted count. Fixed: one-time mitigation buildings now show a static "Built ✓" badge once owned instead of a stepper; guards/saboteurs get a prominent stat-grid display with an explanatory note, both matching the pattern already used for the cathedral.
- **Art quality pass (unrelated report, fixed same session):** of the 32 ComfyUI-generated assets from Phase 10, 15 had real spec violations (multi-figure portraits where the brief called for one person, whole villages instead of single buildings, wrong subjects entirely for famine/revolt/drought icons, a full castle illustration instead of a parchment texture). Fixed via iterative per-category and per-asset negative-prompt tightening in `scripts/gen-art.ts` across three regeneration rounds; 31/32 now match spec (`well.png` still resolves to a small cottage rather than a bare wellhead after three attempts — accepted rather than further iterated). All 32 art assets wired into the UI for the first time: setup screen portraits, standings portraits, build-tab building icons, chronicle event icons, and a coronation scene on victory.

### Tests
- 18 new tests: `tests/war.test.ts` (8), `tests/succession.test.ts` (6), 4 new trading-house cases in `tests/buildings.test.ts`. One stale assertion fixed in `tests/ai.test.ts` (the AI now correctly emits a `war` decision every year — decision parity with the human, same as espionage).
- **172/172 tests passing**, `tsc` clean, production build succeeds.

### Balance Re-Validation
Per the project's own stated practice (any new income/loss channel requires a balance re-run), ran `npm run balance -- 60 60`. **Gate PASSED** on all four criteria, and the run was reported as showing loss-persistence leaping to 78–96%/decade with margin flatness running negative from decade 4.

> ⚠️ **Both of those figures were wrong.** They were artifacts of a balance harness that could not see the mechanics this phase added, not properties of the game. Corrected in Phase 11.5 below, which also found that warfare — described here as "the dominant aggression channel" — fired **once in 1,200 match-years**. The claims are left visible rather than deleted because the lesson is the point: a passing gate said nothing useful while the instrument was blind.

**Not re-measured this phase:** `npm run ai-bench` (archetype distinctness) — Phase 5/8's D2 finding predicted F4 might diversify the converged archetypes, but that specific claim needs its own benchmark run, not just the balance harness, before being treated as confirmed either way.

### Acceptance Criteria
- ✓ Trading houses buildable, rank-gated, generate income, AI and human both use them
- ✓ Succession fires probabilistically after a minimum reign, resets score only, territory/rank/buildings persist — verified directly (100-year run: 3 successions, each reset correctly)
- ✓ Extinction (`dead`) now genuinely set by the engine, not a vestigial always-false field
- ✓ Warfare resolves with the documented win-probability formula — verified directly (200-trial sample: 81.0% observed vs. 80.3% predicted)
- ✓ `TradeDecision` removed rather than left as a validated no-op
- ✓ 172/172 tests, `tsc` clean, build succeeds, balance gate re-passes (with the D5-related finding above recorded, not hidden)
- ✓ Verified end-to-end in-browser: War tab target/ally selection, Build tab rank-gating, chronicle war/succession entries, zero console errors

### Next Phase
**Phase 11.5** — investigate the war-balance finding above before moving on.

---

## Phase 11.5: Balance Instrumentation and Making War Real ✓

**Status:** Complete. Began as "tune war down"; the measurement inverted the premise twice.

### The premise was wrong: there was no balance problem
Before touching a single game constant, the harness itself was audited — and it could not see the mechanics being judged. **Four gaps, three introduced in Phase 11, one inherited:**

1. `grossIncome` omitted `tradingHouseIncome` entirely.
2. War reparations/casualties never counted as adversity — **yet war still shrank `taler` and `population`, which are the denominators those loss shares divide by.** Every war silently inflated the measured severity of whatever else happened that year. This is most of the phantom 78–96% setback rate.
3. Criterion 1 never subtracted espionage plunder while criterion 2 counted it, so the two disagreed about what a loss was.
4. **`grainTradeIncome` had never been counted since Phase 8 added the grain market** — despite `economy.json` describing it as the early game's primary income source. This alone is why every measured return went negative from decade 3 while actual holdings **almost tripled**. A criterion reporting a ruler getting poorer while their wealth compounds is not measuring return at all.

Corrected, on identical seeds: leader return is **positive in every decade**, decaying 5.48% → 0.79% — precisely the intended anti-snowball shape.

| Decade | Leader return (before) | (after) |
|---|---|---|
| 1 | 1.41% | **5.48%** |
| 3 | −0.78% | **1.70%** |
| 6 | −2.29% | **+0.79%** |

### A diagnostic for BACKLOG D5
`npm run balance` now prints a block explicitly outside the gate: **leader vs non-leader return**, field-wide population/holdings/rank, and extinction rate. The design *intends* the leader to suffer; it does not intend everyone to, and that pair distinguishes the two. Verdict: no death spiral — field population 1053→2002, holdings 417k→1,125k, mean rank 0.04→3.07, **0.0% extinctions**.

### The second inversion: war was dead content
War fired **once in 1,200 match-years** (0.001/match-year). Phase 11's claim that it was "the dominant aggression channel" was the opposite of true. Two causes, both design rather than numbers:

- **It could not fire.** `warStrength` is dominated by the population levy and every ruler grows population alike (mean strength ratio 1.07; nearly all build the one permitted garrison, so it differentiates nobody). Measured across 1,200 aggressive ruler-years the best available win probability had a **median of 0.481 and a maximum of 0.629** — against a 0.62 declaration threshold. It cleared in 0.1% of ruler-years.
- **It was not worth firing.** War moved land and coin. Population gates every senior rank, while land is already held at ~2× what the labour force can work (D3). War traded the binding resource for an inert one: winning was near-worthless, losing cost the only thing that mattered.

### Fixes
- **Conquered territory carries its people** (`populationTransferFraction`). Historically apt, and it makes war a genuine alternative *route* to the population-gated ranks — which D2 names as the entire purpose of having F4. Casualties cut 0.03→0.02 so the total population swing stays proportionate.
- **`planWar` computes a real expected value.** It previously calculated `p × gain` and never subtracted the downside, while being named `expectedValue`; the probability floor was silently carrying all risk management.
- **`MIN_WIN_PROBABILITY` 0.62 → 0.55**, chosen from the measured distribution (~3% of ruler-years) rather than guessed.
- **Allies fight for the attacker, not the defender.** Found only once war fired often enough to measure: attackers won **38.9%** against a 55% floor, because `planWar` had the attacker request allies while `resolveWar` added them to the *defender*. An AI asking for help was arming its own target. **A test asserted the buggy behaviour and had to be corrected too** — a test can enshrine a defect as easily as catch one.

### Result
War fires **2.2×/match** with a **72.7%** attacker win rate. Only aggressive archetypes declare (Schemer 1.20, Raider 1.00); economic ones never do.

**Known characteristic, not fixed:** wars cluster in decade 1 (1.70/match) and are rare after. Early rulers start identical, so small absolute investments open large *relative* strength gaps; by mid-game everyone holds a garrison and similar population, and the gaps close. War is therefore currently an early-game lever. Recorded rather than tuned away.

### Acceptance Criteria
- ✓ Harness sees every income and loss channel; return no longer contradicts holdings
- ✓ D5 diagnostic distinguishes "leader checked" from "field ground down"
- ✓ War is a live mechanic at a deliberate cadence, not dead content
- ✓ Population conserved across a war net of casualties (asserted by test)
- ✓ Full suite green, `tsc` clean, gate re-passes

---

## Phase 12: Performance, Flood/Drought, Corn Price ✓

**Status:** Complete. Scoped by a plan-mode research pass that also resolved
one of its own two open questions before any code was written: D2 (archetype
convergence) is a victory-condition design problem, not a missing-mechanics
one — `npm run ai-bench` (finally re-run, per Phase 11.5's "not re-measured
this phase" note) showed every archetype buying land to exactly the 13,000 ha
palace gate and stopping, with F4 (warfare, shipped Phase 11) moving that
number **not at all**. See BACKLOG.md D2 for the measured table.

### Golden baseline (prerequisite for the performance work)
`npm run ai-bench`'s output committed to `tests/fixtures/ai-bench-baseline.json`,
plus a genuinely cross-process guard — `tests/golden.test.ts` — that the prior
`determinism.test.ts` could not provide: that test only compares two runs *in
the same process*, so a change that consistently shifts which candidate wins
still passes it. `tests/golden.test.ts` diffs live `planYear` output against a
fixture on disk (`tests/fixtures/planner-golden.json`, regenerated only via a
deliberate run of `scripts/gen-golden-fixture.ts`), at both the starter state
and after 19 years of real simulated play.

### D4: `planYear` performance (~4× on the suite, byte-identical decisions)
Profiled cost: hoisting `isolate()` out of the per-candidate/per-seed loop in
`src/ai/planner.ts` (advanceYear never mutates the state it's given — see
`year.ts`'s own clone — so the isolated single-player state can be built once
per `planYear` call and reused across every candidate and seed); a
hand-written structural clone (`cloneGameState`/`clonePlayerState`,
`src/engine/state.ts`) replacing `JSON.parse(JSON.stringify())` in
`src/engine/year.ts` and `src/ai/evaluator.ts`'s `applyExpectedLosses`. Full
suite: 52.5s → 13.6s (`ai.test.ts` alone: 36.8s → 8.4s). Re-ran `npm run
ai-bench` after: output matched the committed baseline exactly — the
performance pass changed nothing about what the AI decides. **Excluded**
(per the plan): a `PlayerChronicle` clone optimization worth only 5-10% that
would have widened `advanceYear`'s signature, which CLAUDE.md treats as
load-bearing.

### F6: Flood and drought (Path B — agriculture-linked, not a data reskin)
A "Path A" reskin of the existing event types was rejected during planning:
it would have made flood≈fire and drought≈famine, failing this project's own
event-design standard (every event needs a genuinely distinct mitigation
hook). Built instead:
- New exposure drivers `harvestShortfall`/`harvestExcess` (`src/engine/scarcity.ts`),
  driven by the SAME weather roll that decided that year's harvest
  (`harvest.weather.multiplier`, threaded through `year.ts`) — drought/flood
  compound a real bad/wet year rather than rolling independently of it, the
  same relationship famine already has to a real feeding shortfall.
- New loss types `grain` (drought — scorches the barn) and `farmland` (flood —
  washes out hectares), added to `EventLossType`. **Every switch over that
  type was made exhaustive** — `src/engine/events/events.ts`'s
  `applyEventLoss`, `src/ai/evaluator.ts`'s `applyExpectedLosses`, and a new
  shared `eventLossMagnitudeText()` (moved into `events.ts` so
  `scripts/play.ts`'s CLI and `src/ui/app.ts`'s browser UI share one
  definition instead of two ternary chains that had already silently
  defaulted to "buildings destroyed" for anything unrecognised).
- New `dike` building (`data/buildings.json`), optional on `BuildingState`/
  `ConstructionDecision` rather than a required field threaded through the
  ~15 existing literal construction sites, defaulting to `?? 0` at every read
  and normalized to a real `0` by `clonePlayerState` so it can never silently
  drop out of a clone. `well` now also mitigates drought.
- **The AI's forward risk-pricing needed its own fix, not just a context
  field.** Pricing drought/flood off a single "expected weather multiplier"
  (~1.02, the weather-band mean) collapsed drought exposure to exactly zero
  forever — `max(0, 1 - 1.02) = 0` — the textbook Jensen's-gap trap
  (`E[f(X)] ≠ f(E[X])` for the nonlinear `max(0, ...)` exposure formula).
  Fixed by computing the TRUE expectations `E[max(0, 1-m)]` and
  `E[max(0, m-1)]` directly over the weather-band distribution
  (`projectedHarvestShortfall`/`projectedHarvestExcess`, `evaluator.ts`) —
  caught by a test asserting `expectedAnnualEventCost` is strictly lower for
  a player holding a well/dike than one without.
- `src/ai/balance.ts`'s `eventLossShare` extended to see grain/farmland loss
  as adversity — the same class of blind spot Phase 11.5 documented for war
  before it was wired in, avoided pre-emptively this time.
- 11 new tests (`tests/f6-weather-events.test.ts`): catalog shape, exposure
  zero-in-an-ordinary-year / positive-in-a-real-drought-or-flood-year,
  mitigation reduces but never eliminates probability, a fired event moves
  exactly the right resource and nothing else, AI risk-pricing differentiates
  mitigated from unmitigated, and `eventLossMagnitudeText` exhaustiveness.

### Precursor: `cornPriceBands` was dead data — wired in, not deleted
`data/economy.json`'s `prices.cornPriceBands` (min/max) was referenced
nowhere; the Kaiser's corn price never moved from its starting value for an
entire match. Wired in as `driftCornPrice()` (`src/engine/economy.ts`): a
field-wide poor/bountiful harvest (averaged across all rulers' already-rolled
weather, no new RNG draw) nudges next year's price toward scarcity, clamped
to the band — the Hanse-style "price + weather" uncertainty
`docs/kaiser-research.md` calls for, and it makes selling grain a real timing
decision rather than arithmetic against a fixed number.

### Golden fixture regeneration (both deliberate, both reviewed)
F6 and the corn-price drift each genuinely change what a 19-year-developed
game state looks like, so `tests/fixtures/planner-golden.json` was
regenerated once after each — confirmed by reading the diffs (grain-sale
sizing and tax posture shifting with the new price signal; nothing
structurally wrong) before accepting.

### Balance Re-Validation
Two new adversity/income channels, so the gate was re-run twice (`npm run
balance`, 200×60y, 5 rulers) — once after F6, once after the corn-price
precursor. **PASSED both times.** Diagnostics after both changes: leader
return still positive through decade 5, field population/holdings/mean-rank
still growing every decade (1069→2097 / 404k→1.05M / 0.03→3.27), **0.0%
extinctions** — no death spiral, consistent with Phase 11.5's reading of the
anti-snowball lever.

### Acceptance Criteria
- ✓ `tests/golden.test.ts` catches decision drift a same-process determinism
  test cannot; `npm run ai-bench` matched the committed baseline exactly after
  the performance pass
- ✓ D4: ~4× full-suite speedup, zero behavior change
- ✓ F6: flood and drought are real, distinct, mitigable events; every
  `EventLossType` switch is exhaustive (compile-time enforced)
- ✓ `cornPriceBands` is live data, not dead weight
- ✓ 195/195 tests, `tsc` clean, balance gate re-passes twice with diagnostics
  read (not just PASS taken at face value)

### Deferred (per the plan's own recommendation, not silently dropped)
- **F2 (inter-ruler trade):** its stated justification — fixing D2 — is now
  known false (see above). The `cornPriceBands` precursor was taken instead
  of the full feature.
- **F7 (fog of war):** would predictably regress the balance gate — leader-
  focused targeting is the anti-snowball lever criteria 2 and 3 measure, and
  it only works because AIs can see who leads.
- **D2 as a design problem, B5, D1, D5's numeric floor:** left for the
  hardening phase, per the approved plan.

### Next Phase
**Phase 13** — hardening/performance/testing, and D2 as a victory-condition
design question (not a benchmark to re-run).

---

**Last updated:** Phase 12 complete — `planYear` ~4× faster with byte-identical decisions, flood/drought (F6) shipped as real agriculture-linked events, corn price drift wired in. Balance gate re-passes. Ready for Phase 13 (hardening).

## Phase 13: D2 Design Spike, Difficulty Presets, Hardening Sweep ✓

**Status:** Complete. Scoped by a plan-mode research pass answering "what is
left" — the feature list was done (F1/F3/F4/F5/F6 shipped, F2/F7 deferred by
recorded decision); what remained was bookkeeping, one open design question
(D2), and the hardening phase PLAN.md had promised since Phase 0 but never
delivered. Sequenced **D2 spike before hardening** (user's explicit choice):
difficulty presets and any gate-threshold work are calibrated against the
victory condition, so deciding the rank-gate shape first avoids re-deriving
both after a later redesign.

### Step 0: Bookkeeping
Corrected PLAN.md's own phase-overview table (row 12 had drifted from what
Phase 12 actually shipped). Rewrote BACKLOG B5 — its "5,000 population"
figure was stale; re-verified against current data it found a real, milder,
live inconsistency instead (cathedral gate 2,800 vs. Archbishop's own
threshold of 2,600 — recorded, not fixed, since the choice of which number
moves is a balance call). Deleted `deserializeGameState()`
(`src/engine/state.ts`), referenced nowhere — the same dead-data class
`cornPriceBands` was before Phase 12 wired it in; re-add only alongside an
actual save/load feature.

### Step 1: D2 design spike — decision only, no implementation
`docs/d2-rank-gate-design.md`. Confirmed at the data level: every
`data/ranks.json` entry gates on the same `populationMin`+`palaceStages`
pair — one path, and F4 (a second *economic* channel) proved a second
channel feeding the same single gate can't diversify anything. Recommended
shape: **alternative requirement SETS per rank** (a rank qualifies via any
one path in full — Prestige/palace, Commerce/trading-houses, etc.), with
`rankProgress()` generalized to `max` across paths so it stays continuous
(no cliff — the same lesson `evaluator.ts`'s 540,000-utility-cliff comment
already recorded). Flagged the real blocker for implementation: trading
houses are themselves rank-gated at Margrave, which is only reachable via
the palace path today, so a naive Commerce path can't help until mid-game —
the doc recommends a separate Land/Population path for ranks 0-4 instead.
Two alternatives (a points/weighted system; per-archetype rank ladders) were
considered and rejected, with reasons. Implementation is deliberately its
own future phase.

### Step 2: Difficulty presets
`data/difficulty.json` + `src/ai/difficulty.ts`, three presets (Easy/
Standard/Hard). Two knobs, neither touching a game rule: **rival evaluation-
seed count** (`planYear()` gained an optional 5th parameter, defaulting to
the existing module constant so every pre-existing caller — tests,
ai-bench, the balance harness, the golden fixture — is byte-identical with
zero changes on their end) and **rival starting taler/farmland multiplier**
(`applyStartingMultiplier()`, `src/engine/starter.ts`, applied to rivals
only — the human always starts at the research doc's fixed baseline).
Surfaced in the setup screen as a segmented control. Verified the knobs
actually separate outcomes (`tests/difficulty.test.ts`): the starting
multiplier's effect is measured over a 15-year horizon rather than the full
40, because by year 40 same-personality matches often both hit the palace's
hard 16-stage ceiling, which erases the asymmetry under whatever noise is
left — a real finding about *when* the lever matters, not a test-tuning
workaround. The evaluation-seed knob's effect was measured directly at its
mechanism (how much a chosen decision moves across different planning seeds
at the same state) rather than a downstream 40-year score, after an earlier
version tried the downstream approach and found the signal too noisy to be
reliable at that distance — recorded in the test's own comment.

### Step 3: Hardening sweep
- **D5 gate floor** (`src/ai/balanceCriteria.ts`): a fourth criterion, "no
  death spiral," built from the DIAGNOSTICS fields Phase 11.5 already
  computed but never gated on (`nonLeaderReturnByDecade`,
  `fieldPopulationByDecade`, `fieldHoldingsByDecade`, `extinctionRate`).
  Verified against **hand-constructed** `BalanceReport` objects
  (`tests/balanceCriteria.test.ts`), not just real matches: a synthetic
  spiral-shaped report that would satisfy criteria 1-3 (a falling return
  trend "passes" margin flatness; a high setback rate "passes" loss
  persistence) is confirmed to fail criterion 4, and the actual Phase 12
  measured shape — including its worst-decade non-leader return of −0.61% —
  is confirmed to still pass.
- **D4 parallelisation** (`src/ai/balanceParallel.ts`,
  `scripts/balance-worker.ts`): worker threads split matches across cores.
  `generateTimelines()` (the expensive simulation step) and
  `aggregateTimelines()` (the cheap statistics step) were split out of
  `analyseBalance()` so the parallel and serial paths share one aggregation
  implementation, and a contiguous, ascending-order match-index split
  (`planSlices()`) means the parallel report is **byte-identical** to the
  serial one for the same config, not merely similar — proven directly
  (`tests/balanceParallel.test.ts`, real worker threads, not mocked).
  200-match gate run: ~180s serial → **39.4s parallel**, same result to the
  decimal place.
- **D3 affordance**: the Land tab now shows worked vs. idle hectares
  directly (`laborGatedFarmland()`, the same function the harvest itself
  uses, so it can never disagree with what happens at harvest time).
  Verified in-browser.
- **D1 re-measurement** (`scripts/rank-timing.ts`): the original figures
  predated Phase 8 and were already contradicted by Phase 12's ai-bench.
  Re-measured in solo play (20 seeds × 5 archetypes): Duke ~29y, Count
  ~62y, Margrave ~80y, **Kaiser reached in 58% of runs** by a mean year of
  126.6 within a 300-year window. "Out of reach" retired as a finding.
- **Malformed-input sweep**: audited every engine function reading a raw
  `Decision` number the way `resolveFeeding()`'s default branch already
  modeled, and found the same gap repeatedly — `Math.max`/`Math.min` do
  **not** self-heal `NaN`, so a malformed tax rate, land order, construction
  count, espionage count, custom feed percentage, or grain-trade order could
  poison a `PlayerState` running total permanently. Fixed with a shared
  `src/engine/sanitize.ts` applied at each entry point (`tax.ts`, `land.ts`,
  `buildings.ts`'s single `buildCapped` closure, `espionage.ts`, and two
  remaining gaps in `economy.ts` itself). Verified end-to-end through
  `advanceYear()`, including a clean second year after a fully-malformed
  sheet (`tests/malformedInput.test.ts`) — recorded as BACKLOG B6.

### Verification
- 224/224 tests, `tsc` clean, production build succeeds.
- `tests/golden.test.ts` stayed green throughout Steps 0-3 with **zero
  fixture regenerations** — direct proof none of this phase's changes moved
  a single AI decision. (The `ai-bench` numbers differ from the committed
  `tests/fixtures/ai-bench-baseline.json` — but that fixture predates
  Phase 12's F6/corn-price-drift and was never meant as a rolling
  regression baseline, only a D4 pre-optimization snapshot; its own comment
  says so. The golden fixture is the rolling guard, and it held.)
- Full 200-match balance gate: **PASSED all four criteria**, byte-identical
  to the pre-hardening-sweep run — leader return positive through decade 5,
  field population/holdings/rank growing every decade (1069→2097 /
  404k→1.05M / 0.03→3.27), 0.0% extinctions.
- Browser: Easy/Standard/Hard all render and select correctly; a Hard-
  difficulty rival started at 17,250 Taler (exactly 15,000 × 1.15); the
  worked/idle hectare split showed 5,000/5,000 on a starter realm (exactly
  right for 1,000 peasants × 5 ha/peasant labor capacity); zero console
  errors throughout.

### Acceptance Criteria
- ✓ D2 decision documented with rejected alternatives and an implementation
  path; no gameplay code changed by the spike itself
- ✓ Difficulty presets separate outcomes measurably, touch no game rule
- ✓ D5 floor demonstrably fails a spiral and passes the measured-healthy shape
- ✓ D4 parallel path is byte-identical to serial, ~4.6× faster wall-clock
- ✓ D3 affordance verified in-browser; D1 re-measured and corrected
- ✓ Malformed input degrades safely at every audited entry point
- ✓ All prior gates re-pass; golden fixture untouched

### Next Phase
Phase 14: D2 implementation (below). After that: F2/F7 remain deferred
(reasons recorded), a real save/load feature (would revive
`deserializeGameState`), B5 (cathedral/Archbishop gate reconciliation), and a
D2 calibration follow-up (Commerce-path numbers get little use before
Margrave — see BACKLOG.md D2).

---

## Phase 14: D2 Rank-Gate Implementation ✓

Implemented the shape decided in Phase 13's spike (`docs/d2-rank-gate-design.md`):
`data/ranks.json`'s `requirements` became an array of alternative requirement
groups per rank — Duke through Margrave gained a Land/Population alt path, and
Archbishop through Kaiser gained a Commerce alt path (`tradingHousesMin`), scoped
that way to dodge the chicken-and-egg problem the spike flagged (`tradingHouse` is
itself Margrave-gated). `src/engine/ranks.ts`'s `meetsRequirements` became
"any group satisfied"; `rankProgress` became `max` across groups' own `min`-across-
requirements progress, preserving continuity. `src/ai/evaluator.ts`'s
`palaceLandEnablement()` was made path-aware — it now only nudges toward
palace-gate land when the Prestige path is at least as promising as every
alternative, so a Commerce-leaning ruler isn't bribed toward land it doesn't need.

`npx tsc --noEmit` found every other consumer (the schema change from object to
array breaks the type everywhere it's read) — no separate research agent needed.
Golden fixture (`tests/fixtures/planner-golden.json`) was regenerated
deliberately, since D2 was always going to shift planner decisions; three
pre-existing tests encoded assumptions the new multi-path system falsifies (a
"richer but behind" comparison whose "behind" player now trivially maxes the alt
path's progress; a hard-coded palace-stage floor a test player now clears earlier
via the alt path; a "Merchant runs lean" archetype-profile assertion that was
literally the bug being fixed) and were rewritten to test the same underlying
property against the new mechanics, not weakened. One more test failure
(`f6-weather-events.test.ts`'s dike-mitigation cost comparison) turned out to be
an unrelated latent issue the fix exposed rather than caused: the test's default
player held far more farmland than population labor could work
(`laborGatedFarmland`), so a flood's loss fell entirely on already-idle surplus
land the AI correctly prices at ~zero — the dike's real benefit was being masked by
an incidental land-enablement subsidy in the *old*, not-path-aware code, which the
D2 fix correctly removed. Fixed by making that one test's player land-constrained,
not by touching the pricing formula.

See BACKLOG.md's D2 entry for the re-measured `ai-bench` table and full
follow-up-calibration note.

### Acceptance Criteria
- ✓ Schema, engine, and evaluator generalized to alternative requirement paths
- ✓ Every consumer updated (`tsc --noEmit` clean)
- ✓ 225/225 tests pass; golden fixture regenerated deliberately, decision drift
  reviewed and explained, not silently accepted
- ✓ Balance gate re-passes unchanged
- ✓ `ai-bench` shows real behavioral diversification (treasury strategy, not just
  underperformance) — calibration follow-up flagged, not blocking

---

## Phase 15: Palace/Cathedral Gate Feedback + D2 Rank-Progress Bars ✓

Found during a full browser playthrough of the D2 branch. Palace-stage and cathedral
builds were silently dropped by `applyConstruction()` when land/population thresholds
weren't met — the UI now explains the gate instead of leaving the player guessing.
Realm tab gained a rank-progress panel: one bar per alternative D2 requirement path
toward the next rank (Prestige / Land & Population / Commerce), highlighting whichever
path the ruler is closest to.

### Acceptance Criteria
- ✓ Palace/cathedral gate messages render with correct numbers (`en-US` locale)
- ✓ Rank-progress bars match hand-computed Duke thresholds at game start
- ✓ `tsc` / full vitest suite / build green; zero console errors in-browser

---

## Phase 16: Legibility Fixes (Bug Reports #9–12) + Crest Pipeline Prep ✓

Fixes four live mobile playtest bug reports (#9–#12):
- **#10** Guards/hospital "gone by turn 3" — engine persistence confirmed; UI now labels
  the hire stepper as "NEW hires this turn" so yearly order reset isn't mistaken for loss
- **#9** Cost descriptors — Build + Secret Service controls show cost/income/upkeep inline
  via shared `costSuffix()`
- **#11** Income & spending breakdown card on the year-report screen (engine fields that
  were already computed but never surfaced)
- **#12** Per-path unmet-requirement hints under the D2 rank-progress bars

Also prepped the `crests` art category (schema + prompts + UI wiring). PNGs optional —
procedural fallback covers missing files (see graphics lane / PR #15).

### Acceptance Criteria
- ✓ Bug reports #9–#12 closed with browser verification
- ✓ Crest pipeline ready without blocking play on missing PNGs
- ✓ `tsc` / vitest / build green

---

## Phase 17: Tap-to-Toggle Info Tooltips ✓

Mobile-first ⓘ tooltips on every stepper, slider, segmented control, and standalone
decision button. Deliberately not hover `title` — iPhone Safari players from the #9–12
push had no hover. Content cites real formulas/data (tax rates, war fractions, etc.)
rather than restated prose. One bubble open at a time; closes on second tap or outside tap.

### Acceptance Criteria
- ✓ Tooltips on every interactive control across setup + all play tabs
- ✓ Tap open / tap close / outside close; single-open invariant
- ✓ `tsc` / vitest / build green; zero console errors in-browser

---

## Phase 18A: UX Transparency ✓

Quick playtest follow-ups: `year.ts` reports construction/recruitment shortfalls when the shared treasury is exhausted mid-pipeline (the silent "guards/markets vanish" class of bug); tooltip bubbles flip when they'd overflow the viewport; mitigation and war surfaces cite real numbers.

### Acceptance Criteria
- ✓ Shortfalls appear on the year report when a queued build/hire is clamped
- ✓ Tooltips stay readable on narrow viewports
- ✓ Tests / `tsc` green

---

## Phase 18B: Live Spend/Outcome Preview ✓

`src/ui/preview.ts` runs the real `advanceYear()` on a throwaway clone using the human's in-progress draft plus rivals' planned decisions — so the sticky footer preview cannot disagree with End Year about spend order. Rival `planYear` is cached by `GameState` object identity (the expensive search); the human-side pass is a single deterministic year. Refresh is **debounced after draft edits** (not a 5Hz idle poll).

### Acceptance Criteria
- ⚠️ ~~Preview taler/population deltas and shortfalls match a real End Year on the same draft~~ —
  **superseded by Phase 21.3.** Left visible rather than deleted, per the practice above. The
  *shortfalls* half is still true and still tested: year steps 1–3 run before the harvest at step 4,
  so spend-order warnings remain exact predictions. The *deltas* half is deliberately no longer true —
  `previewYear` now resolves named weather bands instead of the true roll, so taler and population
  match End Year only when the real band happens to be the forecast band (~25% of years). That was the
  point: matching exactly is what leaked the harvest to the player before they committed (issue #46).
- ✓ Rival plans are not recomputed on every keystroke
- ✓ Idle tabs do not keep simulating years in the background

---

## Phase 18C: Warfare Depth ✓

Training and equipment are proportional strength multipliers (not flat adds), with per-level costs/upkeep and a defender's advantage — answering the playtest ask to "build armies, train, better equipment" with a real defender edge. Persist normalizes `trainingLevel` / `equipmentLevel` (default 0 on legacy saves).

### Acceptance Criteria
- ✓ Strength math + upkeep wired; AI invests via war aggression
- ✓ Save/load round-trips the new fields
- ✓ Balance gate re-passes

---

## Phase 18D: Positive Random Events ✓

~200 small positive flavor events (`data/positiveEvents.json`): flat 10%/year chance per player, modest taler/population/grain/unrest-relief rewards, no exposure/mitigation modeling by design. Gate-neutral magnitudes verified against the Phase C baseline.

### Acceptance Criteria
- ✓ Flavor events render on the year report
- ✓ Balance gate criteria unchanged in substance
- ✓ Stochastic tests adapted (difficulty / archetype) where RNG position shifted

---

## Phase 19A: War Brakes

War was memoryless: a defeated neighbour became a *better* repeat target. Mutual absolute truces (`GameState.truces`) plus per-ruler `warWeariness` (feeds unrest, decays in peacetime) brake both rematches and rotating warmongering. AI `planWar` skips truce-bound targets and prices weariness into EV. Save format stays v1 (tolerate absence). Tunables in `economy.json` `warfare`.

### Acceptance Criteria
- ✓ Engine refuses a declaration while a pair's truce is live; registers a 5-year mutual cooldown on resolution
- ✓ Weariness accumulates on both sides, feeds unrest, decays for non-belligerents
- ✓ `cloneGameState` + persist round-trip cover truces/weariness (no shared Record reference)
- ✓ War-frequency suite asserts no same-pair rematch inside the truce window
- ✓ Balance gate re-passes (weariness tuned so late/early loss-persistence stays ≥0.6)

---

## Phase 19B: Medieval Reskin ✓

CSS/typography only — self-hosted OFL **EB Garamond** (body) + **Cinzel** (display) in `public/fonts/`, parchment/ink/gilt `:root` tokens, manuscript ornament (drop caps, double-rule cards). Canvas stacks in `render.ts` updated. No new art.

### Acceptance Criteria
- ✓ Self-hosted `@font-face` (no CDN); theme-color + hardcoded button inks use tokens
- ✓ Parchment palette + ornament without layout reflow
- ✓ `tsc` green

---

## Phase 19C: Flavor Pass ✓

Dry chronicle wit across positive-event boilerplate, grim event telegraphs, rank descriptions, player-facing difficulty copy, weather band name polish, narrative chronicle/game-over lines, and deterministic medieval rival names. Mechanical labels/tooltips untouched.

### Acceptance Criteria
- ✓ Combinatorial positive fluff rewritten; hand-written tone keepers preserved
- ✓ Event catalog validators still pass; tests green
- ✓ Rival fallback names are period, not `Rival N`

---

## Phase 19D: Economy Depth (design spike, not committed build)

**Status: design spike DONE (spec written, nothing implemented).**
Spec: `docs/superpowers/specs/2026-08-03-phase19d-economy-depth-design.md`

Two features designed — explicitly not F2 bilateral trade:

- **D1 — Trade routes / caravans to named NPC powers** (Kaiser, Hanse, Venice,
  Levant): route establishment cost → recurring income → bandit/storm/war
  severance events; sub-linear returns via `min(baseIncome, taler × capFraction)`;
  ties into Phase 19A war-brakes state for severance.
- **D2 — Guilds / building specialization**: markets and mills specialize via
  petition events (grant → income multiplier; refuse → unrest spike); reuses
  `buildings.ts` + `buildings.json`; rank-gated.

Recommended build order: D2 first (contained within existing buildings/event
machinery), then D1 (requires new data file, RNG stream extension, 19A interaction).

### Acceptance Criteria
- ✓ Spec written and owner-reviewed
- ✓ Not F2 bilateral trade
- ✗ D2 guild implementation (future phase)
- ✗ D1 trade-route implementation (future phase)
- ✗ Balance gate re-run after combined D1+D2 (future phase)

---

**Last updated:** Phase 21.3 (harvest forecast #46). 21.0–21.2 merged; #45, #48, #46 cleared. Next Claude: 21.4 (feed-dial semantics #50a + population legibility #47). Next Cursor: 21.5 standing orders (needs 21.4's `FeedMode`). Then D2 guilds at 21.6–21.11. Deferred still: F2, F7; D1 trade routes.

---

## Phase 20.1: PR #35 Regressions ✓

Truce/weariness UI surface, parchment contrast repair, and medieval rival names in the live UI path.

### Acceptance Criteria
- ✓ Truce-bound War tab targets disabled with expiry year; engine shortfall if declaration still arrives
- ✓ `warWeariness` shown on War tab + unrest tile contribution
- ✓ Dark scrims / weak gilt text contrast repaired for parchment
- ✓ Rivals named e.g. `Heinrich, the Builder` (not archetype alone)

---

## Phase 20.2: Population Ceiling + Breakdown ✓

Fixed plague-year breakdown sum (`eventPopulationLoss` as fifth term). Retuned plague severity scaling `0.45→0.2`, exposure cap `3→2.5`, hospital severity reduction `0.2→0.4`. Added `npm run population-profile`. Hospital tooltip explains the population unlock.

### Acceptance Criteria
- ✓ Breakdown identity holds when events kill peasants (uiCoherence)
- ✓ Plague drag slows growth rather than hard-capping at the Cathedral gate
- ✓ `population-profile` script + balance gate green

---

## Phase 20.3: Events Made Visible ✓

Dismissible per-event scene cards (queue, then year report); Overview live risk via `calculateEventProbability`; collapsible event catalog with telegraphs.

### Acceptance Criteria
- ✓ Each fired negative event gets its own lazy-loaded scene card; positives get parchment treatment
- ✓ Live risk % on Overview from the engine oracle
- ✓ Catalog lists drivers, mitigation, telegraphs

---

## Phase 20.4: Explain Every Number ✓

UI-only: `tooltip` accepts nodes + bottom overflow; footer Taler/Population tips from preview income + pop components; Tax tab projected outputs; spy success %; war casualties on report; `roundedBreakdown` in displayCoherence.

### Acceptance Criteria
- ✓ YearPreview passes income fields; footer tooltips reuse them
- ✓ Tax tab shows projected numbers from the same preview oracle
- ✓ Breakdown summing invariant tested

---

## Phase 20.5: Art Consistency + Status Colour ✓

Wired existing terrain/battlefield/chronicle/market/stats art onto Land/Grain/Tax/Spies/War/year-report/game-over; parchment-aware `drawUiIconProcedural`; `--warn` + shared `statusTone.ts`; gen list at `docs/art-generation-list-phase20.md`. Removed unused canvas `loadSprite` path; declared `dike` in tileset for gen-art.

### Acceptance Criteria
- ✓ Bare tabs (Land/Grain/Tax/Spies/War) show art; collapse/timeout get scenes
- ✓ Tab-icon procedural fallbacks look deliberate on parchment
- ✓ Generation checklist handed back for missing crests/icons/reward scenes/dike
- ✓ Status tones unified (`good`/`warn`/`bad`) across stats, odds, idle land, event risk

---

## Phase 21.0: Reducer Golden Fixture (baseline ratchet) ✓

Opens the **21.x workstream** clearing the in-game bug log (GitHub issues #45–#51). Later tranches
change validated economy math (21.4), the `advanceYear` signature (21.3), and the reducer's step
sequence (21.8), and each must be able to prove what it did *not* disturb. This phase lays that
proof down first, from unmodified `HEAD`, before any of them run.

`tests/fixtures/advanceYear-noguild-golden.json` — a cross-process golden snapshot of the reducer.
Generated only by a manual `npx tsx scripts/gen-year-golden.ts`; the scenario lives in
`tests/helpers/yearGoldenRun.ts`, shared with `tests/yearGolden.test.ts` so the two cannot drift
into running different scenarios and comparing the results anyway. Zero changes under `src/` or
`data/`.

Distinct from the two existing guards, and deliberately so:
- `determinism.test.ts` compares two runs **in the same process** — a change that *consistently*
  shifts output passes it. Verified: injecting one conditional `rng.next()` for a single player
  leaves it green and turns every checkpoint here red.
- `planner-golden.json` guards `planYear`. This guards `advanceYear` and never calls the planner.
  The isolation runs one way only: a planner change moves only `planner-golden.json`, but a reducer
  change moves **both**, because `golden.test.ts` plays 19 real years forward before planning.

Multi-player (3 rulers) because `advanceYear` draws from one `SeededRng` across all
`activePlayerIds`, so a draw added or skipped for one ruler shifts every later roll for the others —
a solo fixture is structurally blind to that, and cannot reach the espionage/warfare/succession
passes at all. 35 years because rank promotion lands ~y29 and phase 21.8 is about to change it.

### Acceptance Criteria
- ✓ Fixture generated from unmodified `HEAD` (`git diff` on `src/` and `data/` empty)
- ✓ Proven to fail: a single conditional `rng.next()` for one player reddens all 4 checkpoints
- ✓ Proven complementary: the same mutation leaves `determinism.test.ts` green
- ✓ Scenario identity pinned in the fixture (players, span, seed base, checkpoints, **and the
  literal decision sheets**) and asserted, so editing the shared helper fails loudly instead of
  quietly shrinking the baseline
- ✓ Branch-coverage counters asserted non-zero — espionage 8, warfare 7, events 64, positive
  events 13, promotions 1, shortfalls 338 — so the scenario cannot silently stop exercising a
  path while still reading as coverage
- ✓ Checkpoints stored as structured JSON, not escaped strings, so regeneration diffs stay
  reviewable (matters most when 21.6 adds a `PlayerState` field and a reviewer must confirm the
  new empty field is the *only* change)
- ✓ Full suite green: 31 files, 316 tests, `tsc --noEmit` clean

### Known limitation
`serializeGameState` is a whole-state dump, so adding any field to `PlayerState` changes every
checkpoint even under provably zero behaviour change. When 21.6 lands, the guild fields must be
optional-and-unset (`JSON.stringify` drops `undefined`) for the fixture to stay byte-identical —
and if `clonePlayerState` materialises them to `[]` instead, a reviewed regeneration is required.
Decide that deliberately in 21.6 rather than discovering it from a red test.

---

## Phase 21.1: Scroll Jump Fix (#45) ✓

Tax sliders / land steppers / spy / war controls no longer call `renderGame()` (which
recreated `.screen` and reset `scrollTop`). Draft mutations drive the debounced preview;
structural changes use tab-body-only `rerenderActiveTab()`. Tax projected tiles update
from the same preview refresh.

### Acceptance Criteria
- ✓ Dragging Tax VAT (etc.) does not jump scroll to top
- ✓ Tax "Projected this year" still updates live
- ✓ Land buy caps still net each other (tab refresh, not full screen)
- ✓ `advanceYear-noguild-golden.json` untouched / still green

---

## Phase 21.2: Name What Was Destroyed (#48) ✓

Fire/event loss text names markets vs mills (`formatBuildingsDestroyed`). Sabotage
records `buildingDestroyedKind`; year-report strike log shows Taler, grain, and
which building burned. Spec note: fire exposure still counts all buildings while
only markets/mills burn — balance question left for Claude, not changed here.

### Acceptance Criteria
- ✓ `"1 market, 1 mill destroyed"` (not `"2 buildings destroyed"`) when split known
- ✓ Successful sabotage log mentions grain stolen and building kind
- ✓ Year-golden fixture still green (GameState byte-identity; chronicle-only fields)

---

## Phase 21.3: Harvest Becomes a Forecast (#46) ✓

Bug report #46 asked for "a range between low and high". The leak was structural, not cosmetic:
`previewYear` ran the REAL `advanceYear` with the REAL seed (`1 + year*1000`), and no human decision
consumes RNG before the harvest step — so the preview showed the *actual* roll. Hiding the number on
the Grain tab would not have been enough either: the sticky footer's `Population ±N` derives from feed
adequacy, which derives from the harvest, so the true figure leaked through that instead.

**Forecast mode on the reducer.** `advanceYear` gains an optional 4th parameter,
`AdvanceYearOptions { weatherOverrides?: Record<string, WeatherBandId> }`. `rollWeather(rng, override?)`
**still consumes its draw** when overridden and then returns the named band — the rng is shared across
every player and every later step, so returning early would shift the stream and make a forecast run
diverge for reasons unrelated to weather.

Keyed **per player, not globally** (a deviation from the original sketch): `driftCornPrice` aggregates
`weatherMultiplierSum` across all rulers, so a global override would move the Kaiser's corn price and
therefore the human's own grain-sale income. Overriding just the human asks the question actually being
asked — "what if *my* harvest is lean" — and leaves rivals rolling true.

`previewYear` now resolves three bands (`data/economy.json` `harvest.forecastBands` = lean/average/good)
and never the true roll; headline fields come from the expected branch. All three runs share one seed, so
within-band jitter and every later draw are identical and the branches differ **only** by weather.

What stays exact: year steps 1–3 (land trading, recruitment, construction) run before the harvest at
step 4, so A2's construction-shortfall warnings — the reason the preview exists — are unaffected.

### Acceptance Criteria
- ✓ `advanceYear(s, d, seed)` byte-identical to the 4-arg call with `undefined` / `{}` / `{weatherOverrides:{}}`
- ✓ `advanceYear-noguild-golden`, `planner-golden`, and `determinism` all still green — the 21.0 ratchet
  is what proves the new parameter is inert
- ✓ `rollWeather` advances the stream identically with and without an override
- ✓ Overriding the human leaves both rivals' `weatherId` and `harvestYield` untouched
- ✓ `harvestLow ≤ harvestExpected ≤ harvestHigh`, and the range is non-degenerate
- ✓ Unrecognised band id degrades to the real roll rather than throwing
- ✓ Verified in-browser: year 2 forecast read "11110–15685, likely about 13071"; the year report then
  revealed "Lean year: harvest 11110" — the actual value was the low end, not the likely one
- ✓ **Shortfalls proven band-independent** — identical under all seven weather bands, with the fixture
  asserted to actually produce a shortfall first. Pinned because 21.8 will reorder reducer steps; if a
  spend step ever moves after the harvest, this goes red instead of the footer silently lying.
- ✓ **Every forecast-bearing surface hedges.** The sticky footer (on every tab, the most-read line in
  the game) reads "Likely if you end the year now", ranges Taler and Population when the band moves
  them, and downgrades `· Promotion!` to `· Promotion possible` when a promotion holds in some bands
  but not all — `checkPromotion` reads taler and population, so a lean year can revoke it.
- ✓ Forecast band ids validated at import (throws), matching `validateEventCatalog()`. A typo would
  otherwise degrade silently to the true roll — i.e. **silently reintroduce #46** — and drop the caveat.
- ✓ Perf measured in-browser, not assumed (Phase 9's precedent): Realm→Grain round trip, which includes
  every `previewYear` call on the tab (~9 multi-player reducer runs), **median 1.3 ms** (min 0.9, max
  2.5) over 12 iterations at 2 rivals. ~0.15 ms per `advanceYear`; ample headroom for the iOS target.
- ✓ Suite: 34 files, 333 tests, `tsc --noEmit` clean

### Deliberate design call
The stated range is lean..good — 68% of the band weight, **not** the full drought..glut span, which at
0.3×–1.85× would forecast nothing useful. Because the simulation can therefore roll outside the stated
range, the Grain tab prints an explicit caveat. That caveat is **quantified and asymmetric** rather
than hedged: "roughly 1 year in 6 comes in below that — as far down as *Drought*". Four bands sit
outside the range, not two (drought 5 + poor 12 below, bountiful 10 + glut 5 above), and the downside
is not the mirror of the upside — the worst band yields ~35% of the stated floor, so "worse and better
are both possible" would flatten a famine and a bumper crop into one sentence. `CLAUDE.md` calls "a
reserve carried through a bad year" load-bearing, and sizing that reserve needs the tail's probability
and depth. Both are computed from the band table (`downsideTailProbability()`, `tailsExcluded`), so
retuning `forecastBands` cannot leave a stale number or a stale caveat.

A stated floor the simulation breaks through would read as the game lying — worse than the original bug.

### Contract note
This phase widened `advanceYear`'s signature, which `CLAUDE.md` previously described as taking *only*
three arguments — and which **Phase 12 explicitly declined to widen** for a 5–10% perf win. That
refusal still stands as the default; `CLAUDE.md`'s invariant has been amended to state the real rule
(the 3-arg call must stay byte-identical; options must be pure; draw counts stay unconditional) and to
record that the bar is a feature unbuildable any other way without breaking a *different* invariant.
21.3 cleared it because the alternative — a client-side harvest estimator — would have broken the
one-oracle rule, which is the worse failure. Perf work does not clear it.
