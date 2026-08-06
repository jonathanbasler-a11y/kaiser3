# Research: "Kaiser" (1984 Ariolasoft) → Standalone Rebuild ("Kaiser 3")

## Context

The user asked for in-depth research on the game **Kaiser**, covering its graphics and features, as groundwork for a rebuild-and-improve project. Clarified via chat: this is **Kaiser** (Ariolasoft, 1984) — the pioneering German economic/political simulation where players rule a principality in the Holy Roman Empire and compete to be crowned Kaiser — pointed to by the user via `kaiser2.de` (a fan-made modern remake site). This is confirmed to be a **standalone new game**, unrelated in genre to the current repo's WWI hex-tactics project (Great War Tactics); nothing in `src/`, `data/`, or `docs/` for the current game is touched by this work.

**User-directed priorities (override the defaults below):**
1. **Not hot-seat-focused.** The user explicitly does not care about hot-seat multiplayer as the primary mode — priority is a **strong AI with multiple AI opponents**, i.e. solo play against several competent computer-controlled rulers is the main design target. Hot-seat can remain as an option but isn't the design center.
2. **Good graphics, generated locally.** The user has a local **ComfyUI** MCP connection available in this environment and wants to use it to generate original art (matching this repo's established Phase-20 pattern of AI-generated raster assets checked into an art folder, loaded via Canvas 2D — see CLAUDE.md's art-sourcing rule, which this new project should also follow: no tracing/deriving from copyrighted reference material, 100% original generation).
3. **Expand the random-event system.** Kaiser's original "randomness" was thin — weather affecting harvest yield, and disease as a side-effect of over-feeding — it did **not** have discrete disaster events. The user wants this modernized with proper historical event types: plagues, fires, and similar. Researched below against comparable genre games (Anno 1602/1404/1701) that did build this out well.
4. **Persistent scarcity — no exponential snowball.** The game should stay hard throughout, not turn into trivial exponential growth once past the early game. Researched below against Fugger II and Hanse for concrete anti-snowball mechanisms (scaling upkeep, prosperity-scaled risk).
5. **Solo-first, multiplayer-ready architecture.** No multiplayer in the initial build — single player vs. multiple AI rulers is the whole scope for now — but the core sim must be architected so multiplayer (hot-seat and/or networked) can be added later without a rewrite. Concretely: keep the year-advance function a pure, deterministic reducer over serializable state driven by a uniform `Decision` structure that both human and AI players emit identically — that same contract is what a future network layer would serialize and sync, so no separate "AI path" vs. "player path" to later untangle.
6. **Project identity: "Kaiser 3."** This is the working name for the rebuild (successor framing to the original Kaiser and the fan-made "Kaiser II – Die Rückkehr"). It lives in its own directory **and its own git repository**, fully separate from `historyline` — not a subfolder or branch of this repo.

Kaiser predates and inspired the entire German "Wirtschaftssimulation" (economic sim) genre (Hanse, Vermeer, Patrizier, etc.). It has no modern, well-produced version — official history stopped at 16-bit ports; the only living version is `kaiser2.de`, an amateur freeware Windows remake ("Kaiser II – Die Rückkehr") of a fan-made unofficial Amiga sequel, not the original developer's game. That gap is the opportunity: a clean, modern, well-designed rebuild.

## Research Findings

### Identity & History
- **Original**: *Kaiser*, 1984, Ariolasoft. Code: Markus Mergard. Graphics: Claudio Kronmüller. Design/management: Dirk Beyelstein.
- Platforms: Commodore 64, Atari 8-bit (400/800), Amstrad CPC (1984-85); later ports to Amiga/Atari ST/PC with improved graphics (1988).
- First commercially successful German-made economic simulation; credited with launching the genre that later produced Hanse, Die Siedler-adjacent trading sims, Patrizier, etc.
- Unofficial "Kaiser II" (Amiga/Atari ST) added a bank and a "debt tower" mechanic.
- 2003: original BASIC source released under GPL by Carsten Strotmann.
- Reception: contemporary reviews rated graphics low (~5/10) but playability high (~8/10) — "Kaiser really rules... despite poor graphics," compared favorably to *M.U.L.E.* Popularity extended beyond typical gamers due to its depth as a multiplayer hot-seat strategy game.

### Setting & Premise
- Late-medieval/early-modern Holy Roman Empire (sources vary 15th–18th century framing across versions; kaiser2.de's remake sets it at "1499"; the C64 manual references 18th-century borders).
- 1–9 players (original Atari), 1–8 (later versions), primarily **hot-seat multiplayer** — this was a living-room/party economic strategy game as much as a solo one.
- Each player starts identically: 15,000 Taler, 10,000 hectares of land.
- Goal: accumulate wealth, land, population, and prestige buildings, then be voted/promoted through 8 ranks (Baron → ... → Kaiser/Emperor).

### Core Gameplay Loop (per game-year turn)
1. **Harvest & grain calculation** — yield from farmland, spoilage %, weather effects.
2. **Grain distribution decision** — feed population at Max (80%)/Min (20%)/Required/Custom; under-feeding causes unrest & emigration, over-feeding causes disease/mortality. Storage must stay ≥20% above population need.
   > ⚠️ **Superseded in Phase 21.4 — this line describes the 1984 original, not the rebuild.** The
   > percentages above are shares of *barn stock*, which is faithful but means one setting delivers a
   > different share of demand every year; bug report #50a is a player hitting exactly that. The
   > rebuild's modes name a share of **demand** instead (Min 75% / Required 100% / Growth 115% /
   > Custom 60–150%), and `Max` no longer exists. Departing from the original's input conventions is
   > licensed by *Where the Original Falls Short* below; the outcome half of this line
   > (under-feed → unrest, over-feed → disease) is unchanged and still load-bearing. See PLAN.md §21.4.
   >
   > **"Storage must stay ≥20% above population need" was never implemented** and has no analogue in
   > the code — the `0.2` that superficially echoed it was `minStockFraction`, an unrelated dial
   > constant, now removed. Recorded in BACKLOG rather than left reading as a live requirement.
3. **Land trading** — buy/sell farmland (production) and building land (construction), price varies (~16–70 Taler/hectare); farmland productivity is gated by available peasant labor.
4. **Trade partner / market screen** — buy/sell corn and land vs. the Kaiser (NPC) or other players; price comparison shopping. In multiplayer, players set their own buy/sell prices for others (min. 10% of goods must be offered per in-fiction imperial decree — a nice period-flavor rule).
5. **State income / taxation** — set VAT, income tax, import tariffs, and judicial "greed" (fair ↔ corrupt); population has a tolerance ceiling.
6. **Construction** — markets (1 per 1,000 ha) and mills (income-generating; 5 markets + 3 mills per city for urban growth) — plus prestige buildings: palaces (13,000 ha, 16 stages @ 5,000 Taler each) and cathedrals, required for Emperor eligibility.
7. **Trading houses** (Handelshäuser, later-game feature) — lease from the Kaiser, staff with 6–14 employees, pay tribute as % of wealth; unlocked at Margrave rank.
8. **Secret service / espionage** — hire guards (defense) and saboteurs (offense); spy phase reveals enemy guard counts; sabotage phase burns buildings and transfers their grain/currency/land to the attacker on success, kills saboteurs on failure.
9. **Warfare (optional)** — split-screen battle view, military units vs. cities with a legend; other rulers can vote to send alliance support; borders follow historical geography, indirect attack requires passage permission from intervening rulers.
10. **Annual chronicle** — births/deaths/migration, market & mill profits, secret-service report; screen "locks" until acknowledged.
11. **Succession** — on death, designate an heir who inherits territory/rank but resets score to zero — a soft-permadeath/legacy mechanic.
12. **Overview map** — scrolling territory map showing buildings, cities, population, wealth per player.
13. **Annual title/rank check** — promotion requires meeting finance, population, and building thresholds simultaneously.

### Graphics & UI (by era — all primitive by modern standards, which is the opportunity)
- **8-bit (C64/Atari/CPC, 1984)**: text-mode / spreadsheet-like interface, ~8-color palette, single-color symbolic buildings on the map, minimal animation (marching troop sprites during combat only), 3 short music cues (intro/outro/coronation), simple SFX (clicks, grinding, artillery). Joystick-only input; numeric entry via a digit-picker UI (move digit position, adjust value, confirm with fire button) — a clever constrained-input pattern worth preserving in spirit but replacing with modern controls.
- **16-bit (Amiga/Atari ST/PC, 1988)**: same screen structure, upgraded pixel art, richer sound, more elaborate box art/packaging; still fundamentally menu/screen-driven, not a live map you walk around.
- **Screens are strictly sequential/modal**: trade → grain → land → tax → chronicle → map → state purchases → secret service → (optional) war, cycling once per game-year. No free-roam camera; the "map" is a summary/inspection screen, not primary interaction surface.

### Named Feature List (for parity + improvement targets)
- Grain economy with weather/spoilage variance
- Land market (farmland vs. building land, distinct price curves)
- Peasant-labor gating of farmland productivity
- Markets & mills (production buildings, ratio-gated by land)
- Palaces & cathedrals (prestige buildings, multi-stage construction, rank-gated)
- Taxation (VAT / income tax / tariffs / judicial corruption) with population tolerance limits
- Population simulation (births, deaths, immigration, emigration, disease, unrest)
- Trading houses + Kaiser tribute (later-game economic layer)
- Secret service: espionage (spying) + sabotage (guards vs. saboteurs), building destruction/looting
- Optional warfare with alliance voting and geography-gated attack permissions
- Rank/title progression (8 tiers) gating which systems are available
- Succession/heir mechanic on player death
- Digit-wheel numeric input (historical UI curiosity, not necessarily worth keeping)
- Hot-seat multiplayer as a first-class mode, including per-player pricing in the trade-data screen

### Random Events & Disasters — Original vs. Genre Comparables
- **Kaiser (1984) itself**: only two sources of randomness confirmed by research — (1) **weather variance** affecting harvest yield/spoilage each year, and (2) **disease as a side-effect of over-feeding** the population (not an independent event, just a food-policy consequence). C64-Wiki notes the random element was thin enough that it "reduces economic action to two strategies" — a fair criticism and a clear improvement target.
- **Anno 1602/1404/1701** (the genre's later, more polished descendants) built out a proper **disaster system** worth modeling against:
  - **Fire**: spreads through un-serviced buildings; mitigated by constructing a Fire Department with road-connected service radius.
  - **Plague**: strikes buildings lacking Doctor coverage (population-threshold gated); visually flagged per-building (skeletal icon in Anno); mitigated by Doctor buildings with adequate service radius.
  - Both are radius/infrastructure-gated (not pure dice rolls), which is what makes them feel fair and strategic rather than punishing — a design principle to carry into the rebuild.
- **Improvement plan**: build a proper **event system** layered over Kaiser's existing food/weather randomness, with historically-flavored event types mitigable by player infrastructure/policy choices (mirroring the Anno "build a service building to reduce risk" pattern), for example: plague (mitigated by hospitals/quarantine policy), fire (mitigated by firebreaks/wells, worse in high-density building-land), famine (compounds Kaiser's existing grain-shortage mechanic rather than replacing it), peasant revolt (triggered by excess taxation/greed, already hinted at by Kaiser's "population tolerance" limit — make it an actual event with consequences, not just a soft cap), trade caravan loss/banditry (interacts with the land/trade screens), and could extend to flood/drought as agriculture-linked events. Each should be visually telegraphed on the map (smoke, quarantine flags, etc.) — the original had zero visual disaster feedback, called out above as a graphics gap.

### Screenshot Analysis (yadam.heinrich5991.de/KAISER — user-supplied)
A fan/remake site's screenshot page confirms the game's three visual anchors and its self-aware presentation philosophy ("Kaiser certainly doesn't need 3D voxel raytracing… graphics reminiscent of word-processing software" — gameplay-first, spreadsheet-plain):
- **Hauptschirm (main screen)**: the central management hub — territory, possessions, army — driven by popup menus and a button toolbar. Confirms the rebuild's "single dashboard with drill-in panels" direction is faithful to how later Kaiser versions already consolidated the modal screen cycle.
- **Schlachtfeld (battlefield)**: a dedicated combat screen where military placement/strategy resolves battles — warfare is a real scene, not just a dice report.
- **Huldigung (homage/coronation)**: a celebratory full-screen victory tableau when a player reaches Kaiser — the emotional payoff screen; worth investing real art in (coronation scene is a prime ComfyUI generation target).
These three (dashboard, battle scene, ceremony) define the minimum set of distinct "screens" the rebuild must render beyond menus.

### Comparable Games — Feature Mining

**Die Fugger II** (1996, Sunflowers) — merchant sim, expand a trading business across 16 towns, rise through political rank toward Emperor:
- **Multi-city network** with distinct per-city supply/demand for goods (cloth, spices, metals) — richer than Kaiser's single-market abstraction; a strong candidate for the rebuild's map/economy layer.
- **Piracy & plunder as a real threat**: trade caravans can be plundered, warehouses/stock can burn down — explicit precedent (alongside Anno's fire) for the fire/loss event the user wants.
- **Player-ownable pirate hideouts** to raid competitors — an aggressive-play option beyond Kaiser's espionage/sabotage, worth considering as an alternate AI archetype (the "aggressive" AI personality could specialize here).
- **Political rank unlocks legislative power** (change laws, raise taxes) once high enough — same rank-gated-power shape as Kaiser's title system, but framed as an active tool rather than just a scoreboard.

**Hanse / Hanse – The Hanseatic League** (1986, Ariolasoft) — shipping/trading sim, become mayor of Lübeck via the salt trade:
- **Price + weather uncertainty drives every decision**: current salt price and weather forecast govern shipment planning — this is a more *active* uncertainty model than Kaiser's harvest-only weather roll, and a good template for the "unpredictability should persist" goal below.
- **Physical logistics layer**: trading stations, ships, and cannons must be purchased and maintained — infrastructure investment as an ongoing cost, not a one-time build (relevant to the "avoid runaway growth" goal: upkeep scales with expansion).
- **AI opponent that actively attacks** the player's trading stations, triggering a defense mini-encounter (place cannons, destroy attacking ships) — direct precedent for a hostile, competent AI opponent rather than a passive economic rival, reinforcing the user's AI-opponents priority.
- **Smuggling as an alt-strategy path** — another example (with Fugger's piracy) of illicit/risky play styles the rebuild could support as viable, higher-risk/higher-reward AI or player strategies.

### Design Principle: Persistent Scarcity, No Runaway Growth

The user explicitly wants the game to **stay hard throughout**, not become a trivial exponential-growth snowball once past an early hump — a common failure mode in this genre (Anno-likes especially) where late-game income dwarfs any remaining threat. Findings above give concrete mechanisms to enforce this, to fold into the eventual build plan:
- **Scaling upkeep, not just scaling income**: Hanse's ships/stations/cannons and Kaiser's own tribute-to-the-Kaiser mechanic both show maintenance cost that grows with holdings — the rebuild should make upkeep (garrison costs, trading-house tribute, disaster-response infrastructure) scale at least linearly with territory/wealth so bigger empires stay fragile, not just bigger.
- **Disaster frequency/severity should scale with prosperity**, not stay flat — richer, denser holdings should draw more fire/plague/revolt/piracy risk (mirrored in Anno's density-linked plague and Fugger's plunder-of-the-wealthy framing), so success creates new pressure instead of removing it.
- **Hard resource ceilings from the period**: Kaiser's farmland-productivity-gated-by-peasant-labor and grain-storage-spoilage mechanics are genuine scarcity levers (land without labor is worthless; stockpiles rot) — keep and possibly tighten these rather than let a large treasury trivially buy through every problem.
- **Competent, adaptive AI opponents** (per the AI-opponents priority above) are themselves an anti-snowball mechanism: Hanse's AI actively raids the player, and multiple Kaiser-style AI rulers competing for the same finite land/titles/rank slots means player growth invites more AI aggression rather than coasting to victory uncontested.
- **Weather/price unpredictability should remain a factor at all game stages** (per Hanse), not just an early-game training-wheel mechanic — keep harvest/price variance meaningfully large late-game too, rather than diminishing.

### Where the Original Falls Short (rebuild/improve targets)
- Graphics are flat and dated even for their era (5/10 contemporary rating) — no readable map identity, no visual feedback for prosperity/unrest.
- Turn structure is a rigid linear sequence of ~10 modal screens per year — no overview, no non-linear play.
- No solo-AI depth called out in sources — multiplayer-hot-seat was the intended mode; a modern version needs a real AI opponent for solo play.
- Numeric digit-wheel input was a joystick-era workaround, not a design worth preserving as-is on modern input devices.
- No persistent/replayable campaign framing — it's a single open-ended match.

## Recommended Approach

### Project setup
**Kaiser 3** is a brand-new sibling project at `C:\Users\Joni\Documents\cc\kaiser3\` (name TBD-confirmable, but `kaiser3` is the working slug) with its **own git repository** (`git init`), fully independent of `historyline` — no subfolder, no branch, no shared history. It reuses the *pattern* of this repo (TS + Vite + Canvas 2D + Vitest, no engine/backend, `/data` JSON-driven, docs → PLAN.md → reference hierarchy, phase-by-phase commits with agent gates) but not a single file or dependency from it. First step of implementation (not this turn) is scaffolding this new repo with its own `CLAUDE.md` adapted from these findings.

### Architecture (sim core is the load-bearing decision)
The single most important architectural choice, carried over from this repo's proven pattern: **the entire game-year is a pure, deterministic reducer over serializable state** — `advanceYear(state, decisions[], seed) → {state, chronicle}` — driven by a seeded RNG. Everything else (human UI, AI, headless balance harness, and any *future* multiplayer/network layer) is just a producer or consumer of that one function. This single contract is what makes both the AI-opponent priority and the "multiplayer later without a rewrite" requirement tractable: human and AI both emit the same `Decision[]` shape into the same reducer, so there is no separate "AI path" to diverge from what a network layer would eventually serialize and sync.

```
kaiser3/
  data/           scenario.json, economy.json, buildings.json, ranks.json,
                  events.json, personalities.json, tileset.json
  src/engine/     state.ts, rng.ts, economy.ts, land.ts, tax.ts, buildings.ts,
                  population.ts, espionage.ts, war.ts, ranks.ts,
                  events/{events.ts,catalog.ts}, year.ts (the reducer), scarcity.ts
  src/ai/         evaluator.ts, personalities.ts, planner.ts, sim.ts (headless runner)
  src/ui/         app.ts, dashboard.ts, panels/*, chronicle.ts, render.ts, spriteLoader.ts
  scripts/        sim.ts, balance.ts, gen-art.ts
  tests/          per-module unit tests + sim acceptance tests with numeric thresholds
```
- `Decision` union type: one discriminated union covering every yearly choice (feed level, land orders, tax rates, build orders, espionage orders, trade orders, war declarations) — human and AI both just produce `Decision[]`.
- `Chronicle` output: `advanceYear` returns a structured annual log consumed by both the UI (chronicle screen) and the balance harness (metrics) — one data structure, two consumers.
- `scarcity.ts`: every anti-snowball knob (upkeep-vs-holdings curve, prosperity→event-weight multiplier, price elasticity) isolated in one file, coefficients data-driven from `economy.json`/`events.json`, so balance tuning never touches simulation logic.
- Same agent-ownership split this repo uses: an "economy-engineer" analog owns sim core, "ai-engineer" owns AI, "spec-guardian" gates doc/code conformance, "test-runner" gates every phase.

### Feature set (parity + improvements, folding in all research above)
Keep as the tested "fun" skeleton: grain/land/tax/construction/espionage/rank-progression/succession loop. Improve: modal screen-cycle → single dashboard hub with drill-in panels (validated by the Hauptschirm screenshot already doing this in spirit); flat 8-color tiles → coherent original art via local ComfyUI; joystick digit-wheels → modern numeric controls; add the plague/fire/famine/revolt/banditry event system with infrastructure-based mitigation and map telegraphing; add Fugger II's multi-region economy and rank-unlocked *active* legislative powers; add Hanse's ongoing-upkeep logistics and hostile AI-raid pattern; keep the three visual anchor screens (dashboard, battlefield, coronation) as the presentation spine.

### AI opponents (primary design target, not hot-seat)
Multiple simultaneous AI rulers with distinct data-driven personalities (builder, expansionist, merchant/trader, schemer/espionage-focused, raider/piracy — the last two pulling directly from Fugger II and Hanse). AI decision-making must cover every screen a human plays — no restricted "AI-only simplified mode" — using an evaluator that scores candidate `Decision` sheets with the *real* engine functions (the historyline AI-tuning trick: the AI can't misjudge a harvest or trade because it computes with the same math the player sees). Difficulty presets vary evaluator quality and starting asymmetry, never the underlying rules.

### Anti-snowball balance — the strongest de-risking tool
"Feels hard" doesn't survive long play sessions; drift is invisible in short playtests. The de-risking mechanism is a **headless AI-vs-AI tournament harness** (`npm run balance`, mirroring this repo's `npm run sim`) run over hundreds of seeded full games, gated by explicit numeric flatness criteria before any content/art work proceeds:
1. *Margin flatness* — the leader's net-income-to-holdings ratio must not trend upward across decades (wealth shouldn't compound faster than upkeep+risk).
2. *Loss persistence* — probability of the leader suffering a ≥15% wealth setback in any given decade stays roughly constant from early to late game (events + AI aggression keep biting late-game, not just early).
3. *Lead volatility* — rank-leader changes hands in a meaningful share of matches after year 30; runaway-by-year-20 finishes stay below a ceiling.
These become committed, CI-enforced acceptance tests, so any later feature that reintroduces snowballing fails automatically — the same discipline this repo already applies to combat math.

### Event system design
Every event's probability formula must include a mitigation term the player (or AI) controls via infrastructure/policy (hospital for plague, firebreaks/wells for fire, granary reserve for famine, fair courts for revolt, road patrols for banditry) — schema-enforced so an event without a mitigation hook is invalid data. Mitigation caps risk at a floor, never zero, and mitigation buildings carry ongoing upkeep (Hanse pattern) so "buy total safety once" is impossible. Event weight scales with prosperity (Anno pattern), reinforcing the anti-snowball goal. Telegraphing (why an event hit, e.g. "no hospital in Ostmark") is data from day one so the UI can always explain a hard event rather than have it read as arbitrary punishment.

### Art pipeline (local ComfyUI)
Mirror this repo's Phase-20 pattern: `data/tileset.json` manifest mapping asset ids → `public/art/` paths (terrain, buildings incl. multi-stage palace/cathedral, portraits per AI personality, event icons, and the three anchor scenes — dashboard chrome, battlefield backdrop, coronation tableau); a ported `spriteLoader.ts` (async, non-blocking, 404-safe); procedural vector rendering as the permanent fallback (invariant test: delete all art, game stays fully playable); a `scripts/gen-art.ts` driver against the local ComfyUI MCP connection, batch-generating from a prompt-spec table with one shared style preamble for coherence. Generation priority: ruler portraits and event icons first (highest characterization/legibility value), then the coronation tableau, then buildings, then terrain (where procedural fallback is already acceptable) last. Same legal discipline as this repo's art rule: 100% original generation, never derived from Kaiser/Ariolasoft or any copyrighted material.

### Phased build order (for the eventual Kaiser-3 PLAN.md)
Sequencing principle: playable text-first sim early, AI opponents mid-build, the balance harness gates content, art comes last.
- **Phase 0** — scaffold new repo (own git init), data schemas, seeded RNG, determinism test.
- **Phase 1** — grain/land/population core; `advanceYear` v1; numeric-range and classic-dynamics tests.
- **Phase 2** — tax, construction, ranks (8 tiers, Fugger-style active legislative unlocks).
- **Phase 3** — playable text/CLI game vs. scripted rulers — the first "is this fun at all" gate.
- **Phase 4** — event system (plague/fire/famine/revolt/banditry) with mitigation + prosperity scaling; statistical acceptance tests.
- **Phase 5** — AI opponents v1 (builder/expansionist/merchant), evaluator using real engine math; win-rate and legality benchmarks.
- **Phase 6** — balance harness + anti-snowball hard gate (the three flatness criteria above must pass before continuing).
- **Phase 7** — espionage, inter-ruler trade, schemer/raider AI archetypes (Fugger/Hanse-derived); leading-ruler-draws-aggression verified statistically.
- **Phase 8** — optional warfare + alliance voting + succession/heir mechanic.
- **Phase 9** — graphical UI v1, procedural art, dashboard/battlefield/chronicle/coronation screens, event telegraphing on the map.
- **Phase 10** — ComfyUI art pass per the pipeline above.
- **Phase 11** — QA/hardening, full regression, difficulty-preset validation via the harness.
- (Deferred, not in initial scope per user direction) — **hot-seat/networked multiplayer**, enabled by the `Decision`-reducer architecture above but not built until requested.

This turn covers **research + scoping only**, per the plan-mode rule — it does not start scaffolding, code, or art generation. A follow-up planning pass (once this research is approved) would turn the phase list above into the actual `PLAN.md` for the new `kaiser3` repo.

### Model & effort strategy (phase-by-phase)
Mirrors this repo's CLAUDE.md pattern (session default effort, escalate only for judgment-dense stretches, subagents pin their own frontmatter) — adapted to Kaiser 3's phase list. "Multicode" = worth a `Workflow` multi-agent pass (independent, parallelizable sub-tasks); everything else is a normal single-agent turn.

| Phase | Model | Effort | Multicode? | Why |
|---|---|---|---|---|
| 0 — Scaffold | Haiku | Low | No | Mechanical: config files, folder structure, boilerplate types. No judgment calls. |
| 1 — Grain/land/population core | Sonnet | Medium–High | No | Foundational sim math ported from research; correctness matters and later phases build on it, but it's a single coherent module — sequential work, not parallelizable. |
| 2 — Tax/construction/ranks | Sonnet | Medium | No | Same character as Phase 1, lower risk (less numerically sensitive, more rule-lookup shaped). |
| 3 — Playable text/CLI gate | Sonnet | Medium | No | Integration work wiring existing modules into a loop; the value is in playtesting judgment, not raw code complexity. |
| 4 — Event system | Opus | High | Optional — parallel event-type authoring (plague/fire/famine/revolt/banditry can be drafted independently, then integrated by one agent) | Probabilistic design with fairness tradeoffs (mitigation curves, prosperity scaling) — the same "judgment-dense, gates later balance" character as this repo's Phase-3 combat port. Escalate here explicitly. |
| 5 — AI opponents v1 | Opus | High | No (shared evaluator must stay one coherent module) | Direct analog of this repo's Phase-7 AI tuning, called out in CLAUDE.md as an escalation trigger. Get the evaluator-uses-real-engine-math contract right once, carefully, rather than fast. |
| 6 — Balance harness + anti-snowball gate | Opus | Max | Yes — parallel seed-sweep runs / parallel tuning-hypothesis agents, synthesized by one agent before committing a change | Highest-stakes phase: this is the numeric proof the whole "stays hard throughout" requirement holds. Treat like a contentious spec-guardian dispute — max effort, and multi-agent lets you test several `scarcity.ts` coefficient sets against the harness concurrently instead of guessing serially. |
| 7 — Espionage/trade/aggressive AI archetypes | Opus | High | Optional — schemer and raider archetypes can be tuned in parallel, then jointly re-verified against Phase 6's gate | Extends the AI evaluator (Phase 5's escalation logic applies) and re-touches balance (must re-pass Phase 6 criteria). |
| 8 — Warfare + succession | Sonnet | Medium | No | Bounded, mostly self-contained feature; not touching the core economic balance loop. |
| 9 — Graphical UI v1 (procedural) | Sonnet | Medium | Optional — parallel panel implementation (grain/land/tax/construction/espionage panels are independent), one agent integrates into the dashboard router | Mechanical Canvas/UI work per panel, but enough surface area that fan-out saves wall-clock without needing judgment escalation. |
| 10 — ComfyUI art pass | Sonnet or Haiku | Low–Medium | Yes — this is the clearest multicode win: portraits, event icons, buildings, terrain, and the two anchor scenes are independent generation+review jobs that can run concurrently, then one agent checks style coherence against the shared preamble | Direct analog of this repo's Phase-12/13 art passes, which CLAUDE.md pre-approves for `Workflow`/ultracode orchestration. Low judgment per asset, high value from parallelism. |
| 11 — QA/hardening/final balance | Sonnet | High | Yes — parallel QA lenses (regression, malformed-save handling, difficulty-preset validation) converging into one hardening pass | Same shape as this repo's Phase-13 regression sweep — breadth-of-coverage task, well-suited to fan-out before a single synthesis/fix pass. |

General rule carried over unchanged from this repo: escalate with `ultrathink` in the prompt or `/effort` for a specific stretch, then drop back to the session default (Sonnet/medium suggested as Kaiser 3's baseline) once that stretch is done — don't leave the whole project pinned to a high tier by default.

## Verification

This is a research task with no runnable code — "verification" is the user confirming the research doc accurately captures Kaiser's (and comparable games') mechanics/graphics, agreeing on the improvement targets, the AI/anti-snowball/event/art priorities, and the new-repo scope, before any Kaiser-3 build work begins.
