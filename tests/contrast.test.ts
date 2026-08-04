// Regression guard for the WCAG AA contrast checker (scripts/contrast-check.ts).
// Runs against the real style.css so a future token/usage mismatch — like the
// --accent-bright body-text bug and the --warn-on-stat-tile bug this script
// caught — fails `npm test`, not just a manual browser probe.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkContrast } from '../scripts/contrast-check.ts'

describe('style.css contrast', () => {
  it('every resolvable color/background pair meets WCAG AA', () => {
    const cssPath = path.resolve(__dirname, '../src/ui/style.css')
    const css = readFileSync(cssPath, 'utf-8')
    const failures = checkContrast(css)
    if (failures.length > 0) {
      const summary = failures
        .map((f) => `${f.selector}: ${f.colorToken} on ${f.backgroundToken} — ${f.ratio}:1 (needs ${f.required}:1)`)
        .join('\n')
      expect.fail(`${failures.length} contrast failure(s):\n${summary}`)
    }
    expect(failures).toHaveLength(0)
  })
})
