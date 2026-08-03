# S/T Audit Cleanup Report

Branch: `cursor-audit-s-t-cleanup`

## Scope Completed

- S1: Added `landTransferAmount()` and used it in engine/UI/AI pricing so `maxLandTransferShare` is the effective safety ceiling when `landTransferFraction` is raised above it.
- S3/S6/S7/S8/S9: Replaced duplicated data constants and total-land arithmetic, split the war aggression reserve threshold from the declaration gate, preserved a saboteur seed at a standing force of two, and fixed the stale planner/year/war comments touched by this scope.
- S4: Removed only the verified dead `buildings.json` keys: production `laborRequirement`, palace `completeAtStage`, and mitigation `mitigates`.
- T1/T2/R2: Extended malformed-sheet war/dike coverage, converted the two single-seed AI checks to multi-seed assertions, and made succession/zero-commit strike RNG draws unconditional. Succession now runs after hostile actions so the required draw does not perturb strike/war outcomes.
- P3: Added minimal per-IP in-memory rate limiting for `/api/bug-report` (5 POSTs per 10 minutes) and honeypot rejection for non-empty `website`.
- BACKLOG: Marked fixed items with this branch, left S2 and deep S5 open as deferred, and documented the R2 ally-join residual as still open.

## Verification

- `npx tsc --noEmit` passed.
- `npx vitest run` passed: 29 files, 285 tests.
- Focused red/green regression subset passed after implementation: `tests/war.test.ts`, `tests/espionage.test.ts`, `tests/succession.test.ts`, `tests/malformedInput.test.ts`, `tests/ai.test.ts`, `tests/bugReportApi.test.ts`.

## Deferred / Residual

- S2 remains open: full hardcoded starter/model-stat data extraction was explicitly out of scope.
- Deep S5 remains open: full UI reimplementation cleanup was explicitly out of scope.
- R2 ally-join variable-length loop remains open by instruction.
