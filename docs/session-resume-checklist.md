# Session Resume Checklist (After Overnight Generation)

**When you resume after the overnight ComfyUI run, follow this checklist to verify and finalize Phase 10.**

## Step 1: Check Generation Status (5 min)

```bash
cd C:\Users\Joni\Documents\cc\kaiser3
npm run verify-art
```

**Expected output:**
- ✓ All 32 real assets present (5 portraits, 7 events, 11 buildings, 6 terrain, 3 scenes)
- ✗ Some or all missing: procedural fallback renders them (game still playable)
- Summary should show: "Present: 32/32" or close to it

**If <80% complete:**
- See `docs/overnight-gen-guide.md` § "If Generation Failed Partway"
- Consider re-running gen-art for missing categories

## Step 2: Run Full Test Suite (90 sec)

```bash
npm run test
```

**Expected:** All 154 tests pass (no new failures from art integration)

## Step 3: Build & Spot-Check (5 min)

```bash
npm run build
npm run dev
```

Open browser to `http://localhost:5173`:
- Play a quick setup → ~5 years → game over
- Visually spot-check at least one from each category:
  - **Portrait:** setup screen, rival ruler face visible (should show character icon)
  - **Building:** build a market or palace, should render as isometric shape (not just text)
  - **Event:** wait for a plague/fire to occur, icon should show in log (not just text)
  - **Terrain:** hex tiles on the map background (if visible in UI; currently procedural fallback only)
  - **Scene:** complete a game to see coronation tableau (final victory screen)

**If any asset doesn't load:**
- Check browser DevTools (F12) → Network tab for 404s
- Check Console tab for errors
- If 404: art file wasn't generated, procedural fallback is rendering instead (this is fine)

## Step 4: Verify Deployment Readiness (5 min)

```bash
git status
```

**Expected:**
- `public/art/` directory exists with PNG files
- Everything else clean (no untracked files except art)

```bash
git log --oneline -1
```

**Expected:** Your last commit is `phase-10: ComfyUI art pass...` from prep

## Step 5: Commit Art & Deploy (5 min)

If art generation succeeded:

```bash
git add public/art/
git commit -m "phase-10: ComfyUI art pass — all 42 assets generated and verified"
git push
```

GitHub webhook will auto-deploy to Vercel (check [kaiser3-opal.vercel.app](https://kaiser3-opal.vercel.app) in ~2 min).

If generation is incomplete but >50%:

```bash
git add public/art/
git commit -m "phase-10: ComfyUI art pass — partial generation, procedural fallback active"
git push
```

(Game remains fully playable with procedural fallback for missing assets.)

## Step 6: Declare Phase 10 Complete

Update `PLAN.md`:

1. Find the Phase 10 section
2. Change `**Status:** Fully prepared, awaiting generation` to `**Status:** Complete`
3. Add a results summary:
   ```
   ### Results
   Generated 32/42 assets (or whatever number succeeded).
   Verified in-browser: all assets load without error.
   Deployed to Vercel. Procedural fallback active for missing assets.
   Game remains 100% playable; art is enhancement, not blocker.
   ```
4. Commit: `git add PLAN.md && git commit -m "phase-10: marked complete"`
5. Push

## Next: Phase 11 (QA/Hardening) OR Phase 11b (Warfare + Succession)

See `PLAN.md` § Phase 11 for next steps. Both are ready; pick based on priority:
- **Phase 11:** Full regression, difficulty presets, final balance validation
- **Phase 11b:** Implement warfare + succession if gameplay depth is still highest priority

---

## Troubleshooting

### "npm run verify-art shows 0 assets present"
- Gen-art may not have completed. Check `ls -la public/art/` to see what's there.
- Try re-running: `npm run gen-art` (will overwrite any partial files)
- If ComfyUI was down: restart it and re-run

### "Tests fail after I added the art"
- Art integration shouldn't break tests (tests don't load images)
- If tests fail, check if gen-art script accidentally modified game code
- Revert to known-good: `git checkout scripts/gen-art.ts scripts/verify-art.ts`

### "Browser shows procedural placeholders instead of art"
- This is expected if art generation didn't complete
- Procedural fallback is permanent and intentional (per CLAUDE.md)
- Game is still fully playable; art is cosmetic

### "Vercel deployment hasn't updated after 5 minutes"
- Check GitHub Actions (repo → Actions tab) for build log
- If build failed, check console output for TypeScript/build errors
- If build succeeded but site didn't update: GitHub webhook may need re-trigger

---

## Time Budget

Total for this checklist: **~15 minutes**

- Verify: 5 min
- Tests: 90 sec
- Build & spot-check: 5 min
- Deploy: 5 min
- Update PLAN.md: 2 min

If everything passes, Phase 10 is done and Phase 11 begins immediately.

