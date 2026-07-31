# Overnight ComfyUI Generation Guide

**Status:** Pipeline tested and working. Ready for full 42-asset generation.

## Quick Start (Copy & Paste)

```bash
cd C:\Users\Joni\Documents\cc\kaiser3
npm run gen-art
```

This will generate all 42 assets sequentially. Expected duration: **15–30 minutes** depending on ComfyUI performance.

---

## What Happens

1. **Read prompt specs** from `data/tileset.json` and `docs/art-spec.md`
2. **Generate each asset** via ComfyUI MCP: portraits → events → buildings → terrain → scenes
3. **Save PNGs** to `public/art/<category>/<assetId>.png`
4. **Verify** all files exist and load without error
5. **Report** summary: success count, failures, total size

## If ComfyUI Generation Stalls

If the script appears to hang mid-generation:

1. **Check ComfyUI logs** — queue might be stuck
2. **Restart ComfyUI** if needed
3. **Resume generation** with a specific category:
   ```bash
   npm run gen-art -- --filter buildings
   ```
   (Supports `portraits`, `eventIcons`, `buildings`, `terrain`, `scenes`)

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
- All 42 files exist (or procedural fallback is used for missing)
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

1. **Do NOT ask me to review all 42 images.** Just spot-check a few via `npm run dev`.
2. **Do run tests:** `npm run test` (takes ~90 sec, confirms no regressions)
3. **Commit once verified:** `git add public/art/ && git commit -m "phase-10: ComfyUI art pass — all 42 assets generated"`
4. **Push:** `git push`
5. **Deploy to Vercel:** The GitHub webhook should auto-deploy on push

### If Generation Failed Partway
- Use `npm run verify-art` to see which assets are missing
- If ≥70% complete: commit what you have, re-run `npm run gen-art` to finish
- If <70% complete: delete all art (`rm -rf public/art/*`), procedural fallback is fine, move to Phase 11

---

## Phase 11 (After Art is Live)

Once art is verified and deployed:

1. **QA/Hardening** — full regression sweep, difficulty presets
2. *OR* **Warfare + Succession** — if gameplay depth is still the priority

Both options are ready; art completion unblocks either path.

---

## Contact/Debug

If anything breaks:
- Check ComfyUI is running: `echo "ComfyUI status unknown, check logs"`
- Check disk space: `df -h` (art generation needs ~500 MB free)
- Check Node.js: `node --version` (should be 18+)
- Run in dry-run mode to preview prompts: `npm run gen-art -- --dry-run`

