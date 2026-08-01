// Worker thread for the parallel balance harness (Phase 13, BACKLOG D4).
// Generates match timelines for one assigned SLICE of the original match
// indices, using generateTimelines()'s startIndex/count params — the exact
// same simulation function and seed formula the serial path
// (src/ai/balance.ts's analyseBalance) uses, so this worker's output for a
// given match index is byte-identical to what the serial path would have
// produced for that same index.
//
// Deliberately dumb: no aggregation happens here. This worker's only job is
// the expensive part (simulating full seeded games); aggregation stays in
// one place (aggregateTimelines(), src/ai/balance.ts) so the parallel and
// serial paths can never compute "balanced" two different ways.

import { parentPort, workerData } from 'node:worker_threads'
import { generateTimelines, BalanceConfig } from '../src/ai/balance.ts'

interface WorkerRequest {
  config: BalanceConfig
  startIndex: number
  count: number
}

if (!parentPort) {
  throw new Error('balance-worker.ts must be run as a worker_threads Worker, not directly')
}

const { config, startIndex, count } = workerData as WorkerRequest
const timelines = generateTimelines(config, startIndex, count)
parentPort.postMessage({ startIndex, timelines })
