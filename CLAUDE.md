# CLAUDE.md — Kaiser 3

Modern rebuild of *Kaiser* (Ariolasoft, 1984): a Holy Roman Empire economic/political sim where players rule a principality and compete to be crowned Emperor. Solo play vs. multiple AI opponents, with an architecture that enables multiplayer later without rewrite.

## The one rule that matters most
**The game-year is a pure, deterministic reducer:** `advanceYear(state, decisions[], seed) → {state, chronicle}`. Everything else (human UI, AI planner, headless balance harness, future network layer) is just a producer or consumer of that one function. This contract guarantees AI parity (same `Decision` structure for human and AI), testability (seeded → bit-identical state replay), and multiplayer-readiness (serialize/sync the same reducer).

## Source of truth hierarchy
1. `docs/kaiser-research.md` (the full original research on mechanics/graphics from Phase 0)
2. `PLAN.md` (phased build order + acceptance criteria per phase)
3. `BACKLOG.md` (verified bugs, dead code, and missing features — kept out of PLAN.md so the plan stays a plan)
4. `data/*.json` (game data: economy.json, buildings.json, ranks.json, events.json, personalities.json)
5. `src/engine/` (simulation core — pure, zero DOM imports)

## Product requirements (owner-directed)
- **Solo play against multiple strong AI opponents** is the design centre. Hot-seat is optional; networked multiplayer is deferred but must stay architecturally reachable (see the reducer contract above).
- **The game must stay hard throughout.** No exponential-growth snowball once the early game is survived. This is enforced numerically by the balance gate, not by feel — see `docs/balance-report.md`.
- **Agricultural scarcity must feel real.** Grain keeps for a couple of seasons, not indefinitely, and harvests vary between genuinely good and genuinely bad years. A reserve carried through a bad year is a real decision, and a run of bad weather is a real threat.
- **Playable in a mobile browser, iOS Safari included.** Touch-first, portrait-friendly, static-hosted, no backend. This constrains the UI phase from the start rather than being retrofitted — see BACKLOG.md § P1.
- **Original art only**, AI-generated locally via ComfyUI, with procedural fallback so the game is fully playable with no art present.

Code conforms to data, never vice versa. Game balance lives in `src/engine/scarcity.ts` (all anti-snowball knobs isolated, coefficients data-driven from `economy.json`/`events.json`).

## Workflow
- Work strictly phase by phase per PLAN.md; one commit per phase, message `phase-N: <summary>`.
- After each phase: delegate to **test-runner** (test suite green?) and **spec-guardian** (doc compliance PASS?) before committing.
- Escalate judgment-heavy phases: Phase 4 (event design), Phase 5 (AI tuning), Phase 6 (balance harness validation) → Opus/High effort. Otherwise Sonnet/Medium baseline.
- Phase 6 is a hard gate: the three flatness criteria (margin flatness, loss persistence, lead volatility) must pass before Phase 7+ content/art work proceeds.
- Delegate AI design to `ai-engineer`, sim core to `economy-engineer`, art to ComfyUI pipeline.

## Key invariants (spot-check yourself even outside game code)
- **Pure reducer contract:** `advanceYear` takes `(state, decisions[], seed)` plus an optional pure `AdvanceYearOptions`, and returns `(state, chronicle)`. No side effects, no external I/O, no RNG calls except from `rng.ts` (seeded). **The 3-argument call must stay byte-identical forever** — that, not the argument count, is the actual invariant, and it is enforced by `tests/harvestForecast.test.ts` and ratcheted by the 21.0 golden fixture. Options must be pure inputs (no callbacks, no I/O, no clocks) and every RNG draw must stay unconditional, so an option can change *which value* a draw resolves to but never *how many* draws happen.
  - Widened in Phase 21.3 for forecast mode. Phase 12 (`PLAN.md`) previously **declined** to widen this signature for a 5–10% perf win, and that refusal still stands as the default: the bar is a feature that cannot be built any other way without breaking a *different* invariant. 21.3 cleared it because the alternative — a client-side harvest estimator — would have broken the one-oracle rule below, which is the worse failure. Perf work does not clear it.
- **Decision parity:** human and AI both emit identical `Decision[]` shape into the reducer. No "AI-only simplified mode" or separate code path.
- **Scarcity never goes away:** prosperity scales *risk* (event weight multiplier), *not* immunity. Upkeep scales with holdings. Late-game income is bounded by late-game expenses.
- **Event mitigation is hard:** every event has a mitigation hook (hospital, firebreaks, granary, etc.) but mitigation doesn't eliminate risk, just caps it. Mitigation infrastructure carries ongoing upkeep.
- **AI aggregates prosperity:** multiple AI rulers compete for finite land/titles/rank slots; player growth invites more AI aggression (leading ruler draws the most sabotage/raids), which is itself an anti-snowball lever.
- **Headless test priority:** any game-year dynamics that matter (harvest variance, spoilage, unrest/emigration, upkeep scaling, event triggering, rank promotion) must be provable via seeded `advanceYear` calls in `tests/`, no UI required.

## Architecture
```
src/engine/     The pure sim reducer and all its sub-systems
  state.ts        GameState, PlayerState, Decision union, Chronicle types
  rng.ts          Seeded PRNG (determinism guarantee)
  economy.ts      Harvest, spoilage, grain feeding outcomes, price formation
  land.ts         Land market, labor-gated productivity
  tax.ts          Tax/tariff/corruption income, tolerance/unrest
  buildings.ts    Construction, upkeep, ratios (markets/mills/prestige), ranks
  population.ts   Births/deaths/migration/disease/unrest
  espionage.ts    Guards vs. saboteurs, spy reports, sabotage resolution
  war.ts          Optional warfare, alliances, geography gating
  ranks.ts        8 rank tiers, thresholds, unlocked powers
  events/
    events.ts     Event engine: probability, mitigation, application
    catalog.ts    Typed event implementations (plague, fire, famine, revolt, banditry)
  year.ts         THE REDUCER: advanceYear() sequencing everything
  scarcity.ts     Anti-snowball levers in one file: upkeep curves, prosperity scaling, price elasticity

src/ai/         AI decision-making (decision-makers, not decision-validators)
  evaluator.ts    Scores Decision sheets using REAL engine math (no separate "AI math")
  personalities.ts Data-driven archetype weights (builder, expansionist, merchant, schemer, raider)
  planner.ts      Builds per-year Decision sheet per AI ruler (greedy, 1-year forecast)
  sim.ts          Headless runners: runMatch(seed, rulers[]), runTournament(N)

src/ui/         Human-facing interface
  app.ts          Main screen router
  dashboard.ts    Territory hub with drill-in panels
  panels/*        Grain, land, tax, construction, espionage, trade drill-downs
  chronicle.ts    Annual report screen with event telegraphs
  render.ts       Canvas rendering, procedural fallback
  spriteLoader.ts Async art loader, 404-safe, uses procedural fallback

data/           Game data (all JSON, schema-enforced)
  scenario.json       Starting setup: rulers, Taler/land, map regions
  economy.json        Harvest yields, spoilage %, price curves, upkeep rates
  buildings.json      Markets, mills, palaces, mitigation infrastructure specs
  ranks.json          8 ranks: thresholds (wealth/pop/buildings) + unlocked powers
  events.json         Event defs: base weight, prosperity scaling, mitigation hooks
  personalities.json  AI archetypes: weight vectors over evaluator dimensions
  tileset.json        Art manifest for ComfyUI generated assets + procedural fallback

scripts/
  sim.ts              npm run sim — headless summary (tournament metrics)
  balance.ts          npm run balance — anti-snowball harness (the Phase 6 gate)
  gen-art.ts          ComfyUI-driven asset generation (Phase 10+)
```

## Commands
`npm install` · `npm run dev` · `npm run test` · `npm run sim` · `npm run balance` · `npm run build`

## Art sourcing
Phase 10 onward: ComfyUI-generated original raster art checked into `public/art/`, loaded via Canvas 2D `drawImage`, falling back to procedural vector rendering in `render.ts` when art is missing (404-safe invariant: delete `public/art/` → fully playable game). 100% originally generated, never derived from or traced against Kaiser/Ariolasoft or any copyrighted reference material.

## Independence from other projects
Kaiser 3 is a fully separate project — its own repo, own remote, own history. It shares no code, data, or dependencies with `historyline` (Great War Tactics) or any other repo on this machine. **Design decisions never carry over automatically.** Conventions, mechanics, architecture choices, art style, or workflow habits established in another project have zero default authority here — even if they were the right call there. The only thing that may cross over is a genuinely reusable *skill or technique* (e.g. "seeded PRNG for determinism" as a general pattern, not "how historyline balances combat"), and even then it must be proposed and confirmed with the owner before being applied — never assumed.

## Effort strategy (phase-by-phase)
Per the plan table in `PLAN.md`: Haiku/Low for scaffolding (Phase 0), Sonnet/Medium baseline for most work (Phases 1–3, 8–9, 11), **Opus/High for judgment-dense stretches** (Phase 4: event fairness design, Phase 5: AI evaluator contract, Phase 7: aggressive archetype balance), **Opus/Max for Phase 6** (balance harness — the numeric proof of "stays hard throughout"). Phase 10 (art) scales multi-agent via `Workflow` for asset parallelism. Escalate with `ultrathink` or `/effort` for a stretch, then drop back to Sonnet/Medium.
