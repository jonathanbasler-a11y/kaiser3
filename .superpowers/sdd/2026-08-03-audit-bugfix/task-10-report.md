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
