# Audit bugfix design — 2026-08-03

**Status:** Approved (approach B, full B+R tranche; S/T deferred)  
**Source:** `BACKLOG.md` § Full-codebase audit — 2026-08-03 (post-PR #26)  
**Out of scope:** S1–S9, T1–T2 (T3 lands with B7 in PR2)

## Goal

Close every open **Bug (B7–B13)** and **Correctness (R1–R8)** finding from the post-PR #26 audit, without mixing stream-shifting changes into UI/coherence PRs.

## Architecture

Two PRs by blast radius:

1. **PR1 — Silent.** Fixes that must not change `advanceYear` / `planYear` RNG consumption or planning-seed decorrelation. Goldens stay byte-identical.
2. **PR2 — Stream + war math.** Planning-seed salt, unconditional RNG draws, war population-transfer flooring. Deliberate golden + measure re-baseline.

Shared rules for both:

- Player-facing “if you end the year now” claims use `previewYear` / engine state, not parallel estimates.
- Game stats stay in `/data` where a fix already touches a hardcoded cap (B13); no drive-by S2/S3 migration.
- BACKLOG entries are removed or marked ✅ when fixed, not left ticked.

## PR1 — Silent / no stream shift

### B8 — War tab odds vs treasury order

**Problem:** `pendingWarAttacker` applies military investment and adds guards/garrison against the start-of-turn treasury with no recruitment/construction clamps.

**Design:** Extend `YearPreview` with a post-year military snapshot taken from the human’s state after the real `advanceYear` clone run:

- `guardsAfter`, `garrisonAfter`, `trainingLevelAfter`, `equipmentLevelAfter` (and optionally `talerAfter` already present)

War-tab strength tiles and odds line build a display `PlayerState` from **current** player fields overwritten with that snapshot (levy/population still current-or-after consistently — prefer after-state population only if war strength uses it; today `warStrength` uses peasants, so use `populationAfter` for the levy term).

Remove (or reduce to preview-null fallback) the hand-rolled `pendingWarAttacker` spend simulation.

Stepper refresh on training/equipment: call the same preview path already used by the footer debounce (`refreshPreviewNow` / `previewYear`), then rewrite tiles from the new snapshot — do not reintroduce a second calculator.

### B9 — AI military investment treasury order

**Problem:** `planMilitaryInvestment` prices against `self.taler` minus reserve only; `year.ts` spends land then recruitment first.

**Design:** Change `planMilitaryInvestment` (and/or its `planYear` call site) to accept **already-chosen** land trade + espionage hire costs and subtract them from `spendable` before buying levels:

```ts
planMilitaryInvestment(state, playerId, aggression, priorSpendTalers: number)
```

In `planYear`, after `best` candidate and `espionage` are known, compute:

- land cost from best’s `land_trade` × prices (same formulas as `land.ts`)
- recruitment cost from espionage `guardHire`/`saboteurHire` × data costs

Pass `priorSpendTalers` into military planning. Do **not** run a second full `advanceYear` just for this (planner perf). Document that construction still spends after military in the engine — matching engine order means military is planned after land+recruit only (correct relative to year.ts steps 1–2.5); construction clamp remains engine-side as today.

### B11 — Grain “available” dual definition

**Problem:** `preview == null` fallback uses `grainStock + expectedHarvest` without spoilage/cap.

**Design:** When preview is null, show barn stock only for the “At feeding” tile (or hide surplus identity), with help text “preview unavailable”. Never mix weather-averaged harvest into the post-harvest feed-stock tile. Prefer keeping `feedStockFromChronicle` as the only full definition.

### B12 — Income “Net” vs footer Taler delta

**Problem:** Sum of operating lines ≠ footer's `talerAfter − talerBefore`.

**Design:** Relabel the breakdown total to **Operating net** (or “Income − upkeep”) and one help line listing exclusions: construction, land, recruitment/military, events, raids, war. Do not try to make it equal the footer without adding those lines.

### B13 — Hire caps

**Problem:** UI `max: 10` vs data `maxGuards`/`maxSaboteurs` 25; AI has separate policy caps.

**Design:** UI stepper max = `max(0, DATA_MAX - standing)`. AI caps in `aggression.ts` stay as **policy** (comment citing data max as ceiling they must not exceed). No change to engine caps.

### R3 — `clonePlayerState` NaN coercion

Match `persist.ts`: for numeric fields that use `?? 0` today, use `Number.isFinite(x) ? x : 0` (shared tiny helper ok). Update the misleading comment at `state.ts:23-25`.

### R4 — Optional fields on clone

Keep hand-written clone. Add `tests/clonePlayerState.test.ts` that:

1. Asserts current optionals (`dike`, `trainingLevel`, `equipmentLevel`, `heir`) round-trip.
2. Documents that new optionals must be added to clone + this test (comment + BACKLOG note). Full structural typing for optionals is out of scope (would need a different clone strategy).

### R5 — `applyStartingMultiplier` buildings ref

Deep-copy `buildings` (and `land`/`population` already copied) so mutation of the result cannot touch the source.

### R6 — Event `loss.type` validation

`validateEventCatalog` rejects unknown `loss.type` with a thrown/returned error consistent with existing validators. Exhaustive union check against engine `EventLoss` types.

### R7 — Positive event ranges

Validate `range.min`/`range.max` finite and `min ≤ max` in `validatePositiveEventCatalog`.

### R8 — Pre-F5 save fields

`score` and `reignYears`: absent → default `0` (same philosophy as `trainingLevel`). Non-finite present values still reject.

## PR2 — Stream + war math

### B7 + T3 — Planning seed salt

Replace `+ id.length` with a shared helper, e.g. `planningSeed(base, year, playerId)` in `src/ai/planningSeed.ts` (or `src/engine/` if UI shouldn’t import AI — prefer `src/ai/` and have UI/scripts import it; preview already imports planner).

Salt = stable 32-bit string hash of `playerId` (not length, not array index — index shifts on death).

Update all broken call sites (audit listed 9; also check `rank-timing.ts`). Add test: `rival1`…`rival5` and `builder`/`schemer` all get distinct salts.

**Baseline:** run `npx tsx scripts/gen-golden-fixture.ts` and commit fixture diff; note in PR that ai-bench/balance numbers will move; spot-run `npm run balance` or `hardening-measure` and paste summary.

### B10 — Population transfer flooring

`Math.floor` the population transfer the same way as casualties (loser loses floor, winner gains floor). Test: after `resolveWar`, both `peasants` are integers.

### R1 — Garrison destruction RNG

Always `const roll = rng.next()`; destroy only if `garrison > 0 && roll < chance`.

### R2 — Immigration (in-scope siblings)

**In scope for this PR:**

- `population.ts` immigration: always draw; apply only if gate passes.
- `war.ts` garrison (R1).
- `succession.ts`: always draw; apply only if roll passes (already almost this shape — verify no short-circuit before draw).
- `espionage.ts` strike success: draw is already after probability compute — verify no early return skips the draw when a strike is attempted; if strike not attempted, no draw (that’s fine — different code path).

**Out of scope:** variable-length ally join loop (`war.ts:143`) — changing that needs a separate design (pad to max allies). Document as remaining stream hazard in BACKLOG.

## Deferred (follow-up plan)

S1 (`maxLandTransferShare`), S2–S9, T1–T2, R2 ally-join padding, Loop 5 (`render.ts` / `saves.ts` / `dom.ts`).

## Success criteria

- PR1: `npx tsc --noEmit`, `npx vitest run` green; **golden fixtures unchanged**.
- PR2: suite green after fixture regen; BACKLOG B7–B13, R1–R8, T3 closed; S/T follow-up section still open.
