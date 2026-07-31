# Phase 10: ComfyUI Art Pass — Complete Plan

**Status:** Ready to Execute

This document describes the complete workflow for generating all Kaiser 3 art assets via local ComfyUI. Everything needed to proceed is now prepared: asset specifications, generation scripts, verification pipeline, and procedural fallbacks.

---

## What Will Be Built

**45 art assets** across 5 categories, replacing the current procedural-only rendering:

| Category | Count | Size | Purpose |
|----------|-------|------|---------|
| **Portraits** | 5 | 256×256 | Ruler character icons, one per archetype |
| **Buildings** | 21 | 128×96 | Market, mill, palace (16 stages), cathedral, hospital, well, granary, garrison, trading house |
| **Event Icons** | 7 | 96×96 | Plague, fire, famine, revolt, banditry, flood, drought |
| **Terrain** | 6 | 128×96 | Farmland (4 states), forest, river |
| **Scenes** | 3 | 1280×720 | Coronation tableau, battlefield, chronicle parchment |
| **TOTAL** | **42** | Varies | ~500 KB–1 MB final |

Each asset has a detailed specification in `docs/art-spec.md`, including a shared visual preamble (painterly, semi-isometric, medieval palette) and per-asset unique prompt language.

---

## Workflow

### Step 1: Pre-Generation Setup (Already Done)

- ✅ `docs/art-spec.md` — full asset catalog with preambles and prompts
- ✅ `data/tileset.json` — manifest mapping asset IDs → `public/art/` paths
- ✅ `src/ui/spriteLoader.ts` — loader that tries disk art, falls back to procedural
- ✅ `src/ui/render.ts` — procedural fallback renderers for all 5 categories
- ✅ `scripts/gen-art.ts` — orchestration script (reads specs, dispatches to ComfyUI, saves PNGs)
- ✅ `scripts/verify-art.ts` — post-generation check (file sizes, load test, fallback validation)
- ✅ `package.json` — npm scripts added: `npm run gen-art` and `npm run verify-art`

### Step 2: ComfyUI Integration

**What needs to happen next** (this is where human + multi-agent orchestration kicks in):

1. **Agent A (ComfyUI Coordinator):** Execute `scripts/gen-art.ts` against the local ComfyUI MCP connection, using the prompts from `art-spec.md`:
   - Start with **portraits** (highest characterization value, 5 assets, ~1.5 min parallelized)
   - Then **event icons** (high legibility value, 7 assets, ~2 min)
   - Then **buildings** (21 assets, multiple stages — ~6–8 min, can parallelize)
   - Then **terrain** (6 assets, fast, ~2 min)
   - Last: **scenes** (3 large assets, ~1 min each, 3 min total)

2. **Parallel generation (if ComfyUI queue allows):** Agents B–E can work on independent asset categories concurrently:
   - **Agent B:** Portraits
   - **Agent C:** Event icons
   - **Agent D:** Buildings (can split into stages or by building type)
   - **Agent E:** Terrain
   - (Scenes remain sequential due to size; can start while others finish)

3. **Verification & Integration:** After generation, run `npm run verify-art` to confirm:
   - All 45 files saved with > 0 bytes
   - Procedural fallback still works (test by deleting art, re-running verify, restoring)
   - Game loads without console errors

### Step 3: Testing & Commit

1. Run `npm run build` to confirm TypeScript + bundling clean
2. Run `npm run test` to confirm all 154 tests still pass
3. Start `npm run dev` and play a full game (setup → ~20 years → game-over) with art loaded
4. Verify no horizontal overflow, no console errors, art renders legibly at all viewport sizes (test at 375×812 iOS size)
5. Commit all generated PNG files to `public/art/` (no `.gitignore` exclusion — art is checked in)
6. Push and deploy to Vercel

---

## Generation Parameters

**Per `docs/art-spec.md`:**

- **Base model:** A robust general-purpose diffusion model (e.g., `juggernaut-xl`, `dreamshaper-8`, `deliberately-xl`)
- **Sampler:** DPM++ 2M Karras or Euler (deterministic, consistent quality)
- **Steps:** 30–40 (balance speed vs. quality)
- **CFG scale:** 7–8 (follow prompts closely)
- **Seed:** Derived from asset ID (hash-based, deterministic reproducibility)
- **Upscaling (optional):** ESRGAN 4× only for portraits (improves face detail); skip for smaller tiles

---

## Success Criteria

After generation and verification:

- [ ] All 45 PNG files exist in `public/art/` with file sizes > 1 KB (indicating actual image content)
- [ ] `npm run verify-art` lists all as "present" and reports total size
- [ ] No fetch errors or 404s in browser console when loading the game
- [ ] Visual spot-check: portraits have recognizable faces, buildings have clear isometric silhouettes, event icons are readable at 96×96, terrain tiles are distinct
- [ ] Game plays end-to-end with generated art (setup → full game → end)
- [ ] Procedural fallback verification: game still renders correctly if art is temporarily deleted
- [ ] Commit history shows one clean "phase-10" commit with all art files
- [ ] Deployed to [kaiser3-opal.vercel.app](https://kaiser3-opal.vercel.app) with art live

---

## Token Budget & Model Assignments

This phase is lightweight on judgment — it's mechanical image generation + load testing. Recommended:

| Task | Model | Effort | Notes |
|------|-------|--------|-------|
| Portraits (5 assets) | Haiku | Low | Independent generation, no cross-asset logic |
| Event icons (7) | Haiku | Low | Same |
| Buildings (21) | Haiku | Low | Can parallelize by building type or stage range |
| Terrain (6) | Haiku | Low | Same |
| Scenes (3) | Haiku | Low | Larger images but same mechanical process |
| Verification + testing | Sonnet | Medium | Load testing, browser verification, edge cases |

**Total expected token usage:** ~20–30% of available budget (mostly in agent prompts + ComfyUI dispatch logs). Leave headroom for re-runs or fixes if any generation fails.

---

## Fallback & Recovery

If ComfyUI generation fails or is interrupted:

1. **Partial art:** The procedural fallback covers all missing assets. Game remains fully playable.
2. **Retry specific assets:** `npm run gen-art --filter buildings` regenerates only the buildings category.
3. **Dry-run mode:** `npm run gen-art --dry-run` shows all prompts without actually generating (useful for prompt review).
4. **Known issues to watch:**
   - Prompts mentioning "no text" — ensure generated images actually have no visible text
   - Palace stages — earlier stages should look obviously smaller/less complete than later ones
   - Scene sizes (1280×720) may take longer or require different upsampling

---

## Post-Art Roadmap

After Phase 10 completes:

- **Phase 11: QA/Hardening** — full regression sweep, difficulty-preset validation, final balance check
- **(Optional) Phase 11b: Warfare + Succession** — if gameplay depth is still prioritized (BACKLOG F4/F5)
- **Launch:** Game is complete, tested, deployed, playable on iOS + desktop

---

## Reference Docs

- `docs/art-spec.md` — full asset specifications with prompts
- `data/tileset.json` — manifest of asset ID → path mappings
- `src/ui/spriteLoader.ts` — loader implementation (art + procedural fallback)
- `src/ui/render.ts` — procedural fallback renderers
- `scripts/gen-art.ts` — generation orchestration script
- `scripts/verify-art.ts` — verification & validation script

---

## Next: Begin Generation

Once this plan is reviewed and approved:

1. Start ComfyUI if not already running
2. Run `npm run gen-art` (or `npm run gen-art --dry-run` to preview prompts first)
3. Monitor output; if any generation fails, check ComfyUI logs and retry with `--filter <category>`
4. Once complete, run `npm run verify-art` and `npm run test`
5. Commit and push

Estimated wall-clock time: **20–30 minutes for full generation** (parallelizable to ~10 min if ComfyUI queue supports 5+ concurrent jobs).

