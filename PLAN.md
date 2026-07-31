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
