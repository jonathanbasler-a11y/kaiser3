# Phase 19A — War Brakes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop war snowballing via mutual 5-year truces + war weariness that feeds unrest, with AI pricing both brakes.

**Architecture:** New `GameState.truces` (pair-key → expiry year) and `PlayerState.warWeariness`. Engine refuses truce-bound declarations; on resolution register truce + add weariness to both sides; each year convert weariness → unrest and decay for non-belligerents. Tunables live in `data/economy.json` `warfare`. Save format version stays 1 (tolerate absence).

**Tech Stack:** TypeScript, Vitest, existing `advanceYear` reducer.

**Source design:** `~/.claude/plans/research-the-game-kaiser-mutable-origami.md` (Phase A).

---

### Task 1: Data + state surface

- [ ] Add `truceYears`, `wearinessPerWar`, `wearinessDecayPerYear`, `wearinessUnrestMultiplier` to `economy.json` warfare
- [ ] Add `warWeariness?: number` on `PlayerState`; `truces?: Record<string, number>` on `GameState`
- [ ] Wire `clonePlayerState` / `cloneGameState` (deep-copy truces)
- [ ] Wire `createStarterState` → `truces: {}`
- [ ] Wire `persist.ts` normalize (default 0 / `{}`, sanitize NaN)
- [ ] Helpers in `war.ts`: `trucePairKey`, `isTruceActive`, `registerTruce`

### Task 2: Engine + AI

- [ ] `year.ts` step 12.5: skip live truce; after war register truce + weariness; apply unrest from weariness; decay non-belligerents
- [ ] `planWar`: skip truce-bound targets; price weariness into EV via `weights.unrest`

### Task 3: Tests + gate

- [ ] Tests: truce blocks repeat; weariness accumulates/decays; clone + save round-trip; repeat-target assertion in war-frequency suite
- [ ] `npx tsc --noEmit` + `npx vitest run` green
- [ ] Regenerate goldens if AI decisions shift; review diff
- [ ] `npm run balance` (and ai-bench if feasible) vs baseline

### Task 4: Docs

- [ ] Add Phase 19 overview to `PLAN.md`; note 19A done when merged
