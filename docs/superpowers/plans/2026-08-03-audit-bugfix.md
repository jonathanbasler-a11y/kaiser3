# Audit Bugfix (B+R) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit Bugs B7–B13 and Correctness R1–R8 in two PRs (silent first, then stream-shifting), per `docs/superpowers/specs/2026-08-03-audit-bugfix-design.md`.

**Architecture:** PR1 never changes RNG draw counts or planning-seed decorrelation (goldens stay identical). PR2 introduces a shared `planningSeed()` helper, unconditional draws for immigration/garrison, and floored war population transfer, then regenerates goldens deliberately.

**Tech Stack:** TypeScript, Vitest, pure `advanceYear` reducer, Vite static UI (`src/ui/app.ts`), AI planner (`src/ai/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-audit-bugfix-design.md` — follow it; do not expand into S1–S9 or T1–T2.
- Do not regenerate golden fixtures in PR1.
- Do not hardcode new game stats in `/src` when data already exists (`maxGuards` / `maxSaboteurs`).
- One oracle for year-end UI claims: `previewYear`.
- After each task: `npx tsc --noEmit` and targeted vitest; full `npx vitest run` before each PR.
- Update `BACKLOG.md` when closing items (remove or ✅ FIXED with PR ref).

## File map

| File | Role |
|------|------|
| `src/ui/preview.ts` | Extend `YearPreview` with military snapshot (B8) |
| `src/ui/app.ts` | War odds from preview; grain fallback (B11); Net label (B12); hire caps (B13) |
| `src/ai/warAggression.ts` / `src/ai/planner.ts` | Prior-spend for military plan (B9) |
| `src/engine/state.ts` | NaN-safe clone (R3); optional field copy (R4) |
| `src/engine/starter.ts` | Deep-copy buildings (R5) |
| `src/engine/events/events.ts` | Validate `loss.type` (R6) |
| `src/engine/events/positiveEvents.ts` | Validate ranges (R7) |
| `src/engine/persist.ts` | Default `score` / `reignYears` (R8) |
| `src/ai/planningSeed.ts` | **Create** — shared salt helper (B7) |
| `src/engine/war.ts` | Floor pop transfer (B10); unconditional garrison roll (R1) |
| `src/engine/population.ts` | Unconditional immigration draw (R2) |
| `src/engine/succession.ts` | Verify/fix unconditional draw (R2) |
| `tests/*` | New/extended coverage per task |
| `scripts/gen-golden-fixture.ts`, `tests/golden.test.ts`, fixtures | PR2 only |

---

# Phase 1 — PR1 Silent (`cursor-audit-pr1-silent`)

### Task 1: R5 — Deep-copy buildings in `applyStartingMultiplier`

**Files:**
- Modify: `src/engine/starter.ts`
- Test: `tests/starter.test.ts` (create if missing) or extend nearest existing starter test

**Interfaces:**
- Consumes: `applyStartingMultiplier(player, multiplier)`
- Produces: returned player’s `buildings` must not be `===` source `buildings`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createStarterState, applyStartingMultiplier } from '../src/engine/starter.ts'

describe('applyStartingMultiplier', () => {
  it('does not share buildings by reference with the source player', () => {
    const state = createStarterState([{ id: 'a', name: 'A' }])
    const source = state.players.a
    const scaled = applyStartingMultiplier(source, 0.9)
    scaled.buildings.markets += 1
    expect(source.buildings.markets).not.toBe(scaled.buildings.markets)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (mutation leaks)

Run: `npx vitest run tests/starter.test.ts`

- [ ] **Step 3: Implement** — when spreading the player, set `buildings: { ...player.buildings }` (include `dike` if present).

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit** `fix: deep-copy buildings in applyStartingMultiplier (R5)`

---

### Task 2: R3 — NaN-safe `clonePlayerState`

**Files:**
- Modify: `src/engine/state.ts` (`clonePlayerState`, comments ~23–25 and ~52–53)
- Test: `tests/clonePlayerState.test.ts` (create)

**Interfaces:**
- Produces: `clonePlayerState(player): PlayerState` with finite numerics

- [ ] **Step 1: Write failing test** — clone a player with `trainingLevel: NaN`, `equipmentLevel: NaN`, `buildings.dike: NaN`; assert clones are `0` (or finite), and a following `advanceYear` stays finite.

```ts
it('coerces NaN optional military fields to 0', () => {
  const state = createStarterState([{ id: 'a', name: 'A' }])
  const p = state.players.a
  ;(p as { trainingLevel?: number }).trainingLevel = NaN
  ;(p as { equipmentLevel?: number }).equipmentLevel = NaN
  p.buildings.dike = NaN as unknown as number
  const c = clonePlayerState(p)
  expect(Number.isFinite(c.trainingLevel ?? 0)).toBe(true)
  expect(c.trainingLevel ?? 0).toBe(0)
  expect(c.equipmentLevel ?? 0).toBe(0)
  expect(c.buildings.dike).toBe(0)
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** — local helper `finiteOrZero(n: number | undefined): number` = `Number.isFinite(n) ? (n as number) : 0` for optional numerics and any field already using `?? 0` in the clone. Fix comments that claim clone coerces NaN.

- [ ] **Step 4: PASS + commit** `fix: coerce non-finite fields in clonePlayerState (R3)`

---

### Task 3: R4 — Optional-field clone coverage test

**Files:**
- Modify: `tests/clonePlayerState.test.ts`
- Modify: `src/engine/state.ts` only if a current optional is missing from the clone

**Interfaces:**
- Documents: `dike`, `trainingLevel`, `equipmentLevel`, `heir` must round-trip

- [ ] **Step 1: Test** that setting `trainingLevel: 2`, `equipmentLevel: 3`, `heir: 'a'`, `dike: 1` survives `clonePlayerState` and `cloneGameState` unchanged.

- [ ] **Step 2: Fix clone if any fail**

- [ ] **Step 3: Commit** `test: lock clone coverage for PlayerState optionals (R4)`

---

### Task 4: R8 — Persist defaults for `score` / `reignYears`

**Files:**
- Modify: `src/engine/persist.ts`
- Test: `tests/persist.test.ts`

- [ ] **Step 1: Failing test** — payload missing `score` and `reignYears` on a player still `read`/`normalize`s successfully with both `0`.

- [ ] **Step 2: Change `finiteNumber` calls for those fields to optional-default pattern used for `trainingLevel` (absent → 0; present non-finite → reject).

- [ ] **Step 3: PASS + commit** `fix: default missing score/reignYears on load (R8)`

---

### Task 5: R6 + R7 — Catalog validation

**Files:**
- Modify: `src/engine/events/events.ts` (`validateEventCatalog`)
- Modify: `src/engine/events/positiveEvents.ts` (`validatePositiveEventCatalog`)
- Test: extend `tests/events.test.ts` (or dedicated validation tests)

- [ ] **Step 1: Failing tests**
  - Catalog entry with `loss: { type: 'not_a_real_loss', ... }` fails validation.
  - Positive event with `range: { min: NaN, max: 1 }` or `min > max` fails validation.

- [ ] **Step 2: Implement checks** against the same loss-type union `applyEventLoss` handles; positive ranges `Number.isFinite` and `min <= max`.

- [ ] **Step 3: PASS + commit** `fix: validate event loss types and positive reward ranges (R6, R7)`

---

### Task 6: B13 — Hire steppers use data maxima

**Files:**
- Modify: `src/ui/app.ts` (`renderSpyTab` steppers ~1183, 1189)
- Test: optional pure helper test if you extract `maxNewHires(standing, cap)`; otherwise manual note in commit — prefer:

```ts
// in decisions.ts or displayCoherence-adjacent
export function maxNewHires(standing: number, cap: number): number {
  return Math.max(0, cap - standing)
}
```

- [ ] **Step 1: Unit test** `maxNewHires(20, 25) === 5`, `maxNewHires(25, 25) === 0`

- [ ] **Step 2: Wire spy steppers** `max: maxNewHires(player.guards, ESPIONAGE.maxGuards)` (and saboteurs). Comment in `aggression.ts` that AI `Math.min(3|4,…)` is policy under the data ceiling.

- [ ] **Step 3: Commit** `fix: spy hire caps from economy.json maxima (B13)`

---

### Task 7: B11 — Single grain “available” definition

**Files:**
- Modify: `src/ui/app.ts` (`renderGrainTab`)

- [ ] **Step 1: When `preview` is null**, set `available = player.grainStock` only (no `expectedHarvestYield` add-in). Help text must say preview unavailable / barn only — not “after harvest”.

- [ ] **Step 2: When preview present**, keep `feedStockFromChronicle(...)` only.

- [ ] **Step 3: Commit** `fix: grain available tile never mixes spoilage-free estimate (B11)`

---

### Task 8: B12 — Relabel income Net

**Files:**
- Modify: `src/ui/app.ts` (`buildIncomeBreakdown`)

- [ ] **Step 1: Change heading/label** from `Net` to `Operating net` and add a one-line help-text: excludes land, builds, recruits, army spend, events, raids, war.

- [ ] **Step 2: Commit** `fix: distinguish operating net from footer Taler delta (B12)`

---

### Task 9: B9 — AI military investment after prior spend

**Files:**
- Modify: `src/ai/warAggression.ts` (`planMilitaryInvestment`)
- Modify: `src/ai/planner.ts` (`planYear`)
- Test: `tests/warAggression.test.ts` or `tests/ai.test.ts`

**Interfaces:**
- Produces: `planMilitaryInvestment(state, playerId, aggression, priorSpendTalers?: number)`
- `priorSpendTalers` default `0` for callers that don’t pass it

- [ ] **Step 1: Failing test** — player with `taler` exactly enough for 1 training level **after** a large land buy in the same sheet would be over-promised if `priorSpend` ignored: call with `priorSpendTalers` equal to land cost and assert `trainingInvest === 0` when remainder &lt; cost.

- [ ] **Step 2: In `planYear`**, after `best` and `espionage` exist, compute land spend (buy hectares × prices, sell as negative) + `guardHire * guardCost + saboteurHire * saboteurCost`, then:

```ts
const war: Decision = {
  type: 'war',
  ...planWar(state, playerId, personality.aggression, personality.weights),
  ...planMilitaryInvestment(state, playerId, personality.aggression, priorSpendTalers)
}
```

Reorder so `war` is built **after** `best` is selected (today war is built before the candidate loop — move military planning to after the loop; `planWar` can stay before or after — only military needs `best` + espionage).

- [ ] **Step 3: PASS** — note: may change AI decisions in non-golden paths; **golden year1 uses id `ai` and may still change if military buys change**. If goldens fail, **stop** and report — B9 is specified as PR1 but if it shifts goldens, either (a) confirm fixture change is decision-only not RNG and regen with explicit PR note, or (b) move B9 to PR2. Prefer (a) only if `golden.test.ts` fails; document in PR body.

- [ ] **Step 4: Commit** `fix: plan military investment after land and recruitment spend (B9)`

---

### Task 10: B8 — War odds from `YearPreview` military snapshot

**Files:**
- Modify: `src/ui/preview.ts` — extend `YearPreview`
- Modify: `src/ui/app.ts` — War tab
- Test: `tests/uiCoherence.test.ts` or `tests/preview.test.ts`

**Interfaces:**
- `YearPreview` gains: `guardsAfter: number`, `garrisonAfter: number`, `trainingLevelAfter: number`, `equipmentLevelAfter: number`, `populationAfter` (already)

- [ ] **Step 1: Extend `previewYear` return** from `humanAfter` buildings/guards/levels.

- [ ] **Step 2: Test** — draft with `trainingInvest: 1` and enough taler / no competing spend increases `trainingLevelAfter` vs before; draft with taler `0` and `trainingInvest: 5` leaves `trainingLevelAfter` unchanged (clamped).

- [ ] **Step 3: War tab** — build attacker display state from snapshot fields; delete spend re-implementation in `pendingWarAttacker` (or make it a pure “apply snapshot onto player” helper). Refresh steppers via `previewYear` + rewrite tiles (reuse footer debounce if needed).

- [ ] **Step 4: Commit** `fix: War tab odds use previewYear post-spend army (B8)`

---

### Task 11: PR1 closeout

- [ ] **Step 1:** `npx tsc --noEmit` && `npx vitest run`
- [ ] **Step 2:** Confirm `tests/fixtures/**` git diff is empty (or only intentional B9 decision diffs per Task 9 escape hatch)
- [ ] **Step 3:** Mark B8–B13, R3–R8 ✅ in `BACKLOG.md` with PR placeholder
- [ ] **Step 4:** Push branch, open PR, merge when green

---

# Phase 2 — PR2 Stream (`cursor-audit-pr2-rng`)

### Task 12: B7 + T3 — Shared `planningSeed` helper

**Files:**
- Create: `src/ai/planningSeed.ts`
- Modify: all `id.length` planning-seed sites (`src/ai/sim.ts`, `src/ui/app.ts`, `src/ui/preview.ts`, `scripts/gen-golden-fixture.ts`, `scripts/hardening-measure.ts`, `tests/golden.test.ts`; check `scripts/rank-timing.ts`)
- Test: `tests/planningSeed.test.ts`

```ts
/** Stable per-player salt for planYear seeds — must NOT use id.length. */
export function playerIdSalt(playerId: string): number {
  let h = 2166136261
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function planningSeed(baseSeed: number, year: number, playerId: string): number {
  return baseSeed + year * 104729 + playerIdSalt(playerId)
}
```

- [ ] **Step 1: Failing test** — `playerIdSalt('rival1') … 'rival5'` all distinct; `builder` ≠ `schemer`; `planningSeed(0,0,'a') !== planningSeed(0,0,'b')`.

- [ ] **Step 2: Implement helper + replace call sites**

- [ ] **Step 3: Commit** `fix: decorrelate rival planning seeds by id hash (B7)`

---

### Task 13: B10 — Floor war population transfer

**Files:**
- Modify: `src/engine/war.ts`
- Test: `tests/war.test.ts`

- [ ] **Step 1: Failing test** — after a resolved war, both sides’ `population.peasants` are integers (`Number.isInteger`).

- [ ] **Step 2: `Math.floor` transfer**; apply floored amount to both loser and winner.

- [ ] **Step 3: Commit** `fix: floor war population transfer like casualties (B10)`

---

### Task 14: R1 — Unconditional garrison destruction roll

**Files:**
- Modify: `src/engine/war.ts`
- Test: `tests/war.test.ts` — two wars identical except loser garrison 0 vs 1 should consume the same number of `rng.next` calls up to and including the garrison roll (instrument with a counting stub RNG if the codebase has one; else assert stream alignment via a following weather-sensitive field in a minimal harness).

Minimal approach if no stub RNG:

```ts
// CountingRng implements the same next() interface and counts calls
```

- [ ] **Step 1: Failing test** — call count equal with garrison 0 and garrison 1 through `resolveWar`.

- [ ] **Step 2: Implement** `const roll = rng.next(); if (garrison > 0 && roll < chance)`

- [ ] **Step 3: Commit** `fix: draw garrison destruction roll unconditionally (R1)`

---

### Task 15: R2 — Unconditional immigration draw

**Files:**
- Modify: `src/engine/population.ts`
- Modify: `src/engine/succession.ts` if a draw is behind a gate
- Test: `tests/population.test.ts`

- [ ] **Step 1: Failing test** — counting RNG: one `applyPopulationDynamics` with gate false vs true draws the same number of times; immigration amount is 0 when gated.

- [ ] **Step 2: Implement**

```ts
const immigrationRoll = rng.next()
let immigration = 0
if (unrest < 15 && feedAdequacy >= 0.95 && feedAdequacy <= 1.3) {
  immigration = population.peasants * POP_ECONOMY.immigrationRate * immigrationRoll
}
```

- [ ] **Step 3: Ally-join loop** — do **not** change; add BACKLOG note under R2 residual.

- [ ] **Step 4: Commit** `fix: draw immigration RNG unconditionally (R2)`

---

### Task 16: PR2 baseline regeneration

- [ ] **Step 1:** `npx tsx scripts/gen-golden-fixture.ts > tests/fixtures/golden-decisions.json` (or whatever path `golden.test.ts` reads — match existing script output instructions in file header)

- [ ] **Step 2:** `npx vitest run` — fix any non-golden failures

- [ ] **Step 3:** Spot-run `npm run hardening-measure` or `npm run ai-bench` / `npm run balance`; paste key lines in PR body

- [ ] **Step 4:** Mark B7, B10, R1, R2, T3 ✅ in `BACKLOG.md`; note S1 still open

- [ ] **Step 5:** Push, PR, merge

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| B8 | 10 |
| B9 | 9 |
| B11 | 7 |
| B12 | 8 |
| B13 | 6 |
| R3 | 2 |
| R4 | 3 |
| R5 | 1 |
| R6 | 5 |
| R7 | 5 |
| R8 | 4 |
| B7+T3 | 12 |
| B10 | 13 |
| R1 | 14 |
| R2 | 15 |
| Baseline | 11, 16 |
| S/T deferred | noted in Global Constraints |

## Placeholder scan

No TBD/TODO steps; helper signatures named; golden regen path points at existing `scripts/gen-golden-fixture.ts`.
