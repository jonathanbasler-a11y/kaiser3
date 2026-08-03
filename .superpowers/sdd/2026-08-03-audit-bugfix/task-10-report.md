# Task 10 Report: B8 — War odds from YearPreview military snapshot

## Status
Done.

## Changes
- Extended `YearPreview` with `guardsAfter`, `garrisonAfter`, `trainingLevelAfter`, and `equipmentLevelAfter` from the human post-preview state.
- Replaced War tab's hand-rolled pending army spend simulation with a display attacker built from the `previewYear` snapshot, using `populationAfter` for levy strength.
- Updated War tab training/equipment refresh to recompute `previewYear` and rewrite strength tiles and the odds line from that snapshot.
- Replaced the old duplicated-spend UI coherence test with preview snapshot tests for affordable training and zero-taler clamp.

## TDD
- Red: `npm test -- tests/uiCoherence.test.ts` failed because `preview.trainingLevelAfter` was `undefined`.
- Green: implemented preview snapshot fields and War tab snapshot consumption.

## Verification
- `npx tsc --noEmit` passed.
- `npm test -- tests/uiCoherence.test.ts` passed.
- `npm test` passed: 27 files, 270 tests.

## Concerns
- Commands emit the existing npm warning: `Unknown env config "devdir"`.
- No golden regeneration performed.

## Review Fix: Pre-war War-tab Army Snapshot

### Finding
War tab odds were calling `previewYear` with the live draft while `declareWar` and `warTargetPlayerId` were set, so the preview could read `humanAfter` after war casualties, transfers, and reparations.

### Fix
- Added `warSnapshotDraft()` to preserve all spend decisions but clear war resolution fields before the War tab asks `previewYear` for its army snapshot.
- Updated initial War tab army render and training/equipment refresh to call `previewYear(..., warSnapshotDraft(draft), ...)`.
- Added a regression test proving the selected-war snapshot army fields match the no-war preview for training, guards, and population.

### TDD / Commands
- Red: `npm test -- tests/uiCoherence.test.ts`
  - Failed as expected: `warSnapshotDraft is not a function`.
- Green: `npm test -- tests/uiCoherence.test.ts`
  - Passed: 1 file, 10 tests.
- Type check: `npx tsc --noEmit`
  - Passed.

### Concerns
- Commands still emit the existing npm warning: `Unknown env config "devdir"`.
- No golden regeneration performed.
