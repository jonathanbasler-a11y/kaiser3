// Worker-thread parallelisation for the balance harness (Phase 13, BACKLOG D4).
// Separated from scripts/balance.ts (a thin CLI entry point) so this logic is
// importable and testable on its own — in particular, so a test can assert
// its output is IDENTICAL to the serial src/ai/balance.ts#analyseBalance for
// the same config, not just "probably fine."
//
// Each match is an independent seeded simulation (src/ai/sim.ts#runMatch),
// so splitting matches across threads is pure scheduling, not a determinism
// risk — see generateTimelines()'s own comment in balance.ts for how the
// seed-to-match-index mapping stays identical between the two paths.

import { Worker } from 'node:worker_threads'
import { aggregateTimelines, BalanceConfig, BalanceReport, MatchTimeline } from './balance.ts'

export interface WorkerResult {
  startIndex: number
  timelines: MatchTimeline[]
}

// Splits `total` matches into `workerCount` CONTIGUOUS, ascending-order
// slices. Contiguous and ordered so re-concatenating them reproduces the
// exact match-index-to-seed assignment the serial path uses — this is what
// makes the parallel report comparable to (not merely similar to) the
// serial one, rather than a different-but-plausible sample of the same
// distribution.
export function planSlices(total: number, workerCount: number): Array<{ startIndex: number; count: number }> {
  const slices: Array<{ startIndex: number; count: number }> = []
  const base = Math.floor(total / workerCount)
  const remainder = total % workerCount
  let cursor = 0
  for (let w = 0; w < workerCount; w++) {
    const count = base + (w < remainder ? 1 : 0)
    if (count > 0) slices.push({ startIndex: cursor, count })
    cursor += count
  }
  return slices
}

export function runBalanceWorker(workerPath: string, config: BalanceConfig, startIndex: number, count: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { config, startIndex, count },
      // The worker entry point is a .ts file that imports JSON data
      // (data/*.json via resolveJsonModule). Whichever runtime spawned the
      // PARENT process (the tsx CLI for `npm run balance`, vite-node for the
      // test suite) does NOT automatically propagate its loader hooks into a
      // raw node:worker_threads Worker — explicitly registering tsx's loader
      // here makes the worker behave identically regardless of what spawned
      // it, rather than working under one caller and failing under the other.
      execArgv: [...process.execArgv, '--import', 'tsx']
    })
    worker.once('message', (result: WorkerResult) => {
      resolve(result)
      worker.terminate()
    })
    worker.once('error', reject)
  })
}

export async function analyseBalanceParallel(
  workerPath: string,
  config: BalanceConfig,
  workerCount: number
): Promise<BalanceReport> {
  const slices = planSlices(config.matches, workerCount)
  const results = await Promise.all(slices.map((s) => runBalanceWorker(workerPath, config, s.startIndex, s.count)))
  // Re-sort defensively even though Promise.all preserves input order —
  // the ordering guarantee this depends on is explicit here, not implicit
  // in an unrelated Promise API detail someone could later "simplify" away.
  results.sort((a, b) => a.startIndex - b.startIndex)
  const timelines = results.flatMap((r) => r.timelines)
  return aggregateTimelines(config, timelines)
}
