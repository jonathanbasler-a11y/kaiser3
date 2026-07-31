#!/usr/bin/env tsx
// Verify that generated art loads correctly and procedural fallback still works.
// Usage: npm run verify-art

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const tilesetPath = path.join(projectRoot, 'data', 'tileset.json')

interface TilesetJson {
  [category: string]: Record<string, string>
}

async function main() {
  console.log(`\n=== Verifying Kaiser 3 Art ===\n`)

  const tileset: TilesetJson = JSON.parse(fs.readFileSync(tilesetPath, 'utf-8'))
  let missing = 0
  let present = 0
  let totalBytes = 0

  for (const [category, assets] of Object.entries(tileset)) {
    for (const [assetId, filePath] of Object.entries(assets)) {
      const fullPath = path.join(projectRoot, 'public', filePath)
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath)
        totalBytes += stat.size
        if (stat.size > 0) {
          console.log(`✓ ${category}/${assetId} (${stat.size} bytes)`)
          present++
        } else {
          console.log(`✗ ${category}/${assetId} (empty file)`)
          missing++
        }
      } else {
        console.log(`✗ ${category}/${assetId} (not found — procedural fallback will render)`)
        missing++
      }
    }
  }

  const total = present + missing
  console.log(`\n=== Summary ===`)
  console.log(`Present: ${present}/${total}`)
  console.log(`Missing (fallback): ${missing}/${total}`)
  console.log(`Total art size: ${(totalBytes / 1024).toFixed(2)} KB`)

  if (missing === 0) {
    console.log(`\n✓ All art generated and loaded successfully!`)
  } else if (present === 0) {
    console.log(`\n⚠ No art generated yet. Procedural rendering will be used.`)
  } else {
    console.log(`\n⚠ Partial art set. Missing assets will render via procedural fallback.`)
  }

  console.log(`\nTest: Try running 'npm run dev' and playing a game.`)
  console.log(`If art doesn't load, check console for 404s or CORS errors.`)
}

main().catch(console.error)
