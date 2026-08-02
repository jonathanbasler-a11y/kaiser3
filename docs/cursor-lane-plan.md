# Cursor Lane Plan — Graphics + Non-Claude Backlog

**Status:** Safe backlog pass on `cursor-safe-backlog` (B5 + PLAN sync + crest/well regen).  
**Branch:** `cursor-safe-backlog` (isolated from Claude’s Phase 18 work).  
**Rule:** Do not touch Phase 18 critical files while Claude owns that plan.

---

## Lane ownership (do not cross)

| Claude (Phase 18 A→D) — leave alone | Cursor — this plan |
|---|---|
| `src/ui/app.ts`, `dom.ts`, `style.css` | `src/ui/render.ts`, `spriteLoader.ts` |
| `src/ui/preview.ts` (new) | `public/art/**`, `scripts/gen-art.ts`, `scripts/verify-art.ts` |
| `src/engine/year.ts`, `state.ts`, `war.ts` | `docs/art-spec.md`, `docs/overnight-gen-guide.md` |
| `data/economy.json` (warfare), `data/positiveEvents.json` | `data/tileset.json` (art paths only) |
| Tooltips, spend preview, war depth, positive events | Crest art, procedural fallbacks, art QA |

**Git discipline:** stay on `cursor-graphics-crests` (or later `cursor-*` branches). PR into `master` only after Claude’s current phase PR merges, or rebase carefully if both land as independent PRs with no file overlap.

**GPU discipline:** one producer at a time on ComfyUI. If Claude (or anything else) is already generating, wait for an empty queue + VRAM free ≳6 GB before starting `gen-art`. If a crest run stalls (>2 min with no progress / `s/it` >> a few seconds), cancel, restart ComfyUI, retry — see `docs/overnight-gen-guide.md`.

---

## Already in progress on this branch

Procedural crest fallback (uncommitted):
- `drawCrestProcedural()` in `render.ts` — Baron→Kaiser escalating ornamentation
- Wired into `spriteLoader` canvas + `spriteImg` DOM fallback (missing PNG → procedural, not empty box)
- `tsc` clean

Ship this with or without real PNGs (art-fallback invariant).

---

## Phase G1 — Rank crests via ComfyUI (primary)

**Why:** Phase 16 prepped schema/UI/prompts; `public/art/crests/` was empty. Crests are already wired in `app.ts` (Realm title) — Claude does not need to change UI for this to show up.

**Command (after queue empty):**
```bash
cd C:\Users\Joni\Documents\cc\kaiser3
npm run gen-art -- --filter crests
npm run verify-art
```

**Assets (8 × 96×96):** `baron`, `duke`, `prince`, `count`, `margrave`, `archbishop`, `king`, `kaiser`  
**Expect:** ~10–20 min at healthy ~2 it/s on this GPU.  
**Verify:** each PNG > 1 KB; spot-check escalating ornamentation; delete one file → procedural fallback still shows a crest.

**Note (live):** as of writing this plan, several crest PNGs were already appearing under `public/art/crests/` while ComfyUI had a running job — likely another session already kicked off generation. **Do not double-queue.** Finish/monitor the existing run, then only regenerate missing or failed ranks:
```bash
npm run gen-art -- --filter crests --assets margrave,archbishop,king,kaiser
```
(adjust `--assets` to whatever is still missing)

**Deliverable:** commit on `cursor-graphics-crests`:
`graphics: rank crests + procedural crest fallback`

**Status (2026-08-02):** ComfyUI crests still ignore literal charges for most ranks.
Kept only readable PNGs (`prince`, `count`, `king`). Missing ranks use
`drawCrestProcedural` (correct plow/key/tower/mitre/eagle ladder). Further
Comfy re-rolls optional; not blocking.

---

## Phase G2 — Art QA / optional re-rolls (ComfyUI)

No engine or Phase 18 UI changes. Pure asset + prompt work.

| Priority | Item | Notes |
|---|---|---|
| High | Spot-check all 8 crests | Re-roll with `--seed-offset` if text/people/landscape leak in |
| Medium | `well.png` quality | Phase 11 accepted a cottage-looking well; optional re-roll |
| Medium | Flood / drought UI wiring | PNGs already exist (`public/art/events/flood.png`, `drought.png`). `app.ts`'s `EVENT_ICON_ID` still omits them — wire **only after** Claude finishes Phase A (touches `app.ts`) |
| Low | Palace stage ladder consistency | Visual pass across palace_1…16 if any look off |
| Low | Terrain / scene polish | Only if playtest asks; not blocking |

**Do not** regenerate the whole 40-asset set unless crests + targeted re-rolls fail — overnight full regen is optional and GPU-heavy.

---

## Phase G3 — Safe backlog (non-Claude, non-GPU)

Items Claude’s Phase 18 plan does **not** own. Prefer tiny PRs.

### G3a. B5 — Cathedral vs Archbishop population gate
- **Files:** `data/buildings.json` and/or `data/ranks.json` only
- **Choice (pick one, document in BACKLOG):**
  - Lower cathedral `requiresMinPopulation` to ≤2600, **or**
  - Raise Archbishop `populationMin` to 2800
- Prefer expressing cathedral gate in terms of the ranks it unlocks (lesson from B1)
- **Tests:** existing buildings/ranks tests; no golden fixture change expected
- **Risk:** low; no collision with Phase 18

### G3b. PLAN.md / BACKLOG.md sync (docs only)
- Document Phases 15–17 as done (tooltips, legibility, land-gate feedback)
- Point “next” at Phase 18 (Claude) + this Cursor graphics lane
- Do **not** rewrite Claude’s live Phase 18 plan; only sync committed docs after merges
- **Risk:** none if we don’t edit Claude’s `~/.claude/plans/*`

### G3c. D2 Commerce-path calibration — **defer until after Phase 18 C**
- Touches `data/ranks.json` / evaluator weights / `ai-bench`
- Claude’s Phase C changes war math and re-runs balance + ai-bench
- Running calibration now would fight their baseline diffs
- Revisit after Phase C merges

### Explicitly out of Cursor scope (Claude or deferred)

| Item | Why not now |
|---|---|
| Phase 18 A–D | Claude owns; file overlap |
| F2 inter-ruler trade | Deferred by decision; large |
| F7 fog of war | Deferred; would regress balance gate |
| Save/load | Would revive `deserializeGameState`; not requested |
| Positive event *copy* (~200) | Claude Phase D owns wiring; optional offline draft only if asked, no `year.ts` |

---

## Suggested execution order

1. **Now:** Confirm ComfyUI queue drains; finish crest set (G1); keep procedural fallback.
2. **Next:** Visual QA + targeted re-rolls (G2).
3. **Parallel / after crest PR:** B5 data fix (G3a) on its own tiny branch.
4. **After Claude merges Phase A (or whole 18):** optional `EVENT_ICON_ID` wiring for flood/drought if PNGs ready.
5. **After Claude merges Phase C:** D2 Commerce calibration (G3c).
6. **Anytime docs are quiet:** PLAN/BACKLOG sync (G3b).

---

## Verification checklist (every Cursor deliverable)

1. `npx tsc --noEmit`
2. `npx vitest run` (expect 225+; graphics-only should not change decisions → golden fixture untouched)
3. `npm run verify-art` after any gen-art run
4. Browser spot-check: Realm title shows crest (PNG or procedural); no console 404 spam that breaks play
5. Delete `public/art/crests/baron.png` temporarily → procedural crest still renders → restore
6. Confirm `git diff` does **not** include `app.ts` / `year.ts` / `war.ts` / `state.ts` / `dom.ts`

---

## Independence

Kaiser 3 only. No design carry-over from historyline. ComfyUI technique (deterministic seeds, category filters, verify script) is fine to reuse; art style and prompts stay project-local per `CLAUDE.md`.
