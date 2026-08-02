# Overnight ComfyUI Generation Guide

**Status (Phase 15, prepped but not started):** 32/40 assets already present.
Only the new `crests` category (8 assets — one per rank, `data/ranks.json`
Baron→Kaiser) is missing. ComfyUI (`sd_xl_base_1.0.safetensors`) is confirmed
running and healthy (`http://127.0.0.1:8188`), and a `--dry-run` of the full
40-asset list completed with zero prompt errors.

## Quick Start (Copy & Paste)

Just the missing crests (recommended — everything else is already generated):
```bash
cd C:\Users\Joni\Documents\cc\kaiser3
npm run gen-art -- --filter crests
```
8 assets at 28 steps/dpmpp_2m/karras. Expected duration: **10-20 minutes** at
normal GPU throughput — see the stall note below, this varied wildly tonight.

Full regeneration of everything (only if you want to re-roll existing art too):
```bash
npm run gen-art
```
40 assets. Expected duration: **30-60+ minutes**.

---

## What Happens

1. **Read prompt specs** from `data/tileset.json` and `docs/art-spec.md` (crest
   per-rank prompts live in `scripts/gen-art.ts`'s `ASSET_SPECS.crests` — see
   that doc's Crests section for why they aren't duplicated there)
2. **Generate each asset** via ComfyUI's HTTP API: portraits → events →
   buildings → terrain → scenes → crests
3. **Save PNGs** to `public/art/<category>/<assetId>.png`
4. **Verify** all files exist and load without error
5. **Report** summary: success count, failures, total size

## Known risk from tonight's run (read before starting)

A `--filter crests` run earlier tonight stalled badly: the first image's
sampling step logged `553.80s/it` (should be a few seconds/it on this GPU) and
never completed in 20+ minutes before being cancelled. Restarting the ComfyUI
process (kill the `python.exe` running `main.py`, relaunch, confirm
`health_check` shows VRAM free ~6.9/8.0 GB and an empty queue) fixed it — VRAM
was stuck near-zero even after a `clear_vram` call, which only a full process
restart cleared. If an overnight run seems to be making no progress after the
first ~2 minutes, don't just wait it out: cancel, restart ComfyUI, retry.

## If ComfyUI Generation Stalls

If the script appears to hang mid-generation:

1. **Check ComfyUI logs** — queue might be stuck
2. **Restart ComfyUI** if needed
3. **Resume generation** with a specific category:
   ```bash
   npm run gen-art -- --filter buildings
   ```
   (Supports `portraits`, `eventIcons`, `buildings`, `terrain`, `scenes`, `crests`)

4. **Retry a specific asset** (if one fails):
   ```bash
   npm run gen-art -- --filter buildings --seed-offset 1000
   ```
   (Changes seed so re-generation produces a different image)

## After Generation Completes

Once all PNGs are saved:

```bash
npm run verify-art
```

This checks:
- All 40 files exist (or procedural fallback is used for missing)
- File sizes are > 1 KB (actual images, not empty files)
- Summary: present count, missing count, total art size

Then test in-game:

```bash
npm run dev
```

Open browser to `http://localhost:5173` and play a full game. Check:
- Portrait frames show builder/expansionist/etc.
- Building icons render clearly at 128×96
- Event icons visible and readable
- The rank crest renders next to the "X of the Realm" title (Realm tab header)
  and looks visibly grander at higher ranks
- No horizontal overflow
- No console errors (check DevTools)

## Session Restart Handling

If your session times out or crashes **during overnight generation**:

### State is Preserved
- Generated PNGs stay in `public/art/` (won't be re-generated)
- Git status shows what's been created
- `npm run verify-art` shows which assets are done

### Resume Generation
1. Check current state: `npm run verify-art`
2. See which categories are complete (look for ✓ lines)
3. Continue with missing categories:
   ```bash
   npm run gen-art -- --filter eventIcons
   npm run gen-art -- --filter buildings
   # etc.
   ```
4. Or just re-run `npm run gen-art` (it will overwrite completed files, which is fine)

### Worst Case (If Generation Fails Partway)
- Delete the partially-generated file: `rm public/art/buildings/palace_1.png`
- Re-run: `npm run gen-art -- --filter buildings`
- Procedural fallback covers any missing assets, so game stays playable

---

## Token Budget for Next Session

When you resume after generation completes:

1. **Do NOT ask me to review all 8 crest images.** Just spot-check a few via `npm run dev`.
2. **Do run tests:** `npx vitest run` (~35-60 sec, confirms no regressions — art files aren't exercised by the test suite, this is a sanity check the change didn't break anything else)
3. **Commit once verified:** `git add public/art/crests/ && git commit -m "phase-15: ComfyUI art pass — rank crests generated"`
4. **Push, open a PR, merge** — same flow as every other phase in this repo (see CLAUDE.md workflow section)

### If Generation Failed Partway
- Use `npm run verify-art` to see which crest assets are missing
- Missing crests fall back to an empty `.sprite-fallback` box next to the rank
  title (`spriteImg()`'s standard behavior, `src/ui/spriteLoader.ts`) — cosmetic
  only, the game stays fully playable either way
- Re-run just the missing ones: `npm run gen-art -- --assets duke,count`
  (comma-separated asset ids, any category)

---

## After Crests Are Live

Once verified and merged, the Phase 15 UI-improvements branch is complete
(land-gate feedback + D2 rank-progress bars already merged in PR #8, crests
close out the "visual polish" scope from that session's options). Next steps
are whatever the user directs — nothing is blocked on this.

---

## Contact/Debug

If anything breaks:
- Check ComfyUI is running: `echo "ComfyUI status unknown, check logs"`
- Check disk space: `df -h` (art generation needs ~500 MB free)
- Check Node.js: `node --version` (should be 18+)
- Run in dry-run mode to preview prompts: `npm run gen-art -- --dry-run`

