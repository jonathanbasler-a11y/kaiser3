#!/usr/bin/env tsx
// Generate all Kaiser 3 art assets via local ComfyUI.
// Usage: npm run gen-art [--dry-run] [--filter <category>] [--seed-offset <n>]

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const tilesetPath = path.join(projectRoot, 'data', 'tileset.json')

interface TilesetJson {
  [category: string]: Record<string, string>
}

interface AssetJob {
  id: string
  category: string
  prompt: string
  outputPath: string
}

const SHARED_PREAMBLES: Record<string, string> = {
  portraits: `Medieval Holy Roman Empire, oil painting style, late 15th century. Character portrait, three-quarter view, rich clothing and regalia befitting their rank. Natural lighting, slight warm tone. Painterly brushwork, fine detail in faces. No text, no modern elements.`,
  buildings: `Medieval architecture, isometric three-quarter view, semi-transparent shadow beneath. Painterly texture, earth tones (ochre, sienna, grays). Slight depth of field. Single building per image, no people, no text. Roof and facing visible, shading suggests 3D form.`,
  eventIcons: `Medieval icon style, symbolic rather than realistic. Bold, clear silhouette. Warm or dark background to suggest the event's tone. Oil painting texture, gold leaf accents where appropriate. Fits in a square, centered. No text.`,
  scenes: `Medieval illustration, oil painting style, rich detail, warm lighting.`,
  terrain: `Medieval landscape hexagon, isometric three-quarter view, semi-transparent shadow beneath. Painterly, textured. Natural palette. No people, no buildings (those overlay). Shows land fertility/state via color/pattern.`
}

const ASSET_SPECS: Record<string, Record<string, string>> = {
  portraits: {
    builder: `Stern, disciplined, middle-aged merchant-prince in fur-trimmed coat. Hands show calluses. Books and architectural plans in background blur. Serious, methodical expression.`,
    expansionist: `Young, confident, bright-eyed noble in velvet doublet. Golden jewels catch light. Maps and banners visible behind. Expansive gesture, optimistic bearing.`,
    merchant: `Shrewd, weathered trader in fine silk and saffron tones. Scales, coins, spice jars on nearby table. Sharp eyes, knowing smile. Prosperous but cautious.`,
    schemer: `Shadowed, calculating face in dark silks. Single candle illuminates one side. Dagger hilt visible. Knowing, almost amused expression. Murky background.`,
    raider: `Wild-eyed, scarred, muscular warrior in leather and iron. Wind-blown hair, weapon nearby. Fierce, predatory expression. Stormy sky behind.`
  },
  buildings: {
    market: `Stone marketplace with a covered arcade, barrels and crates stacked outside. Tiled roof, wooden shutters. Prosperous, busy appearance despite being empty of people.`,
    mill: `Stone watermill with a large wooden wheel on one side, stream below. Thatched or tiled roof. Gears visible inside the open side. Sturdy, functional design.`,
    palace_1: `Excavated plot with a few stone blocks, simple wooden scaffold. Bare earth around. Foundation of a great building.`,
    palace_2: `Ground floor complete, one story of walls, wooden framing for floors above.`,
    palace_3: `Two stories, windows installed, roof frame visible.`,
    palace_4: `Three stories, ornamental stonework beginning, towers starting to rise.`,
    palace_5: `Three and a half stories, decorative arches visible, corner tower rising.`,
    palace_6: `Four stories, windows ornate with stone frames, towers prominent.`,
    palace_7: `Four stories with decorative crenellations, central tower rising higher.`,
    palace_8: `Four stories nearly complete, crenellations full, two towers visible.`,
    palace_9: `Four stories with two full corner towers, heraldic shields on facade.`,
    palace_10: `Four stories, two corner towers complete, central spire beginning.`,
    palace_11: `Four stories, two towers with crenellations, spire rising.`,
    palace_12: `Four stories, four towers (one at each corner), spire halfway complete.`,
    palace_13: `Four and a half stories, all four towers prominent, spire three-quarters complete.`,
    palace_14: `Four and a half stories, elaborate stonework, spire nearly complete.`,
    palace_15: `Five stories, four towers with flags, spire complete but gardens unfinished.`,
    palace_16: `Full five-story grand palace with four corner towers, central spire with flag, heraldic banners, manicured courtyard and gardens, ornate gates. Seat of power, complete.`,
    cathedral: `Grand Gothic cathedral with a high central spire, flying buttresses, rose window visible. Lighter stone (pale gray/cream). Intricate masonry. Sacred, imposing, complete.`,
    hospital: `Stone building with a red cross banner, large windows (suggesting light, cleanliness), herb garden boxes outside. Smaller than palace, clearly civic/care-oriented.`,
    well: `Circular stone well with a wooden pulley mechanism and rope. Bucket nearby. Simple, functional, rustic appearance.`,
    granary: `Large timber-frame building with sloped roof, multiple small windows for ventilation, external stairs. Grain sacks stacked outside. Clearly a storage building.`,
    garrison: `Fortified stone structure, narrower windows (defensive), guard tower on corner, small catapult or cannon visible. Flags with shields. Martial, defensive appearance.`,
    trading_house: `Ornate merchant's house with imported luxuries evident: fancy tiles, silk banners, exotic goods in display. Smaller than palace but ostentatiously wealthy.`
  },
  eventIcons: {
    plague_flag: `Quarantine flag with skull/crossbones, sickly green mist wisps around it. Dark background. Ominous, diseased tone.`,
    fire_smoke: `Flames and thick orange/red smoke rising from a building silhouette. Yellow and orange tones. Urgent, destructive energy.`,
    famine_sign: `Empty bread loaf, wilted wheat sheaf, bare earth. Brown and gray tones. Desperate, starving feeling.`,
    revolt_banner: `Raised fist or pitchfork, torn banner, angry red and black tones. Chaotic energy. Revolutionary tone.`,
    bandit_skull: `Skull with crossed swords or daggers behind it. Dark tones with metallic glint. Dangerous, plunder-focused.`,
    flood_wave: `Large blue/gray wave crashing, swallowing buildings/land in silhouette. Churning, destructive. Cool, overwhelming tone.`,
    drought_sun: `Harsh, oversized sun beating down on cracked earth and wilted plants. Yellows and browns, parched feeling. Relentless heat.`
  },
  scenes: {
    coronation_tableau: `Grand coronation scene in a cathedral: a crowned figure kneeling or standing before an altar, surrounded by bishops and nobles in ceremonial dress. Golden light streaming through stained glass. Opulent, triumphant, ceremonial tone.`,
    battlefield_backdrop: `Aerial view of a medieval battlefield: rolling hills, fortified town in the distance, cavalry and foot soldiers positioned across fields. Tents, banners, smoke from siege weapons. Strategic, tactical feeling. Early morning or late afternoon light.`,
    chronicle_parchment: `Aged parchment or vellum texture with faded wax seal, torn edges, calligraphic script (illegible but decorative). Warm beige/cream tones, slight age staining.`
  },
  terrain: {
    farmland_fallow: `Bare earth, turned soil, some rocks. Brown, gray tones. Ready but not planted.`,
    farmland_planted: `Rows of young green shoots, fresh soil. Hopeful green and brown. Early growth.`,
    farmland_ripe: `Golden wheat or grain at full height, ready for harvest. Rich golden-brown. Abundant, prosperous.`,
    farmland_blighted: `Diseased or drought-affected crops: yellowed, withered, sparse. Dull khaki and brown. Desperate, poor yield.`,
    forest: `Dense trees, dark green canopy, tree trunks visible beneath. Cool, shadowed tones. Wild, untamed.`,
    river: `Flowing water, blue-gray tones, banks on either side. Slight current suggested by water flow. Splits/divides hexagons on a map.`
  }
}

function buildPrompt(assetId: string, category: string): string {
  const preamble = SHARED_PREAMBLES[category] ?? ''
  const spec = ASSET_SPECS[category]?.[assetId] ?? ''
  if (!spec) {
    console.error(`No spec found for ${category}/${assetId}`)
    return ''
  }
  return `${preamble} ${spec}. Style: painterly, semi-isometric, natural medieval palette, fine detail, no text, no modern elements.`
}

async function generateAsset(job: AssetJob, dryRun: boolean): Promise<{ ok: boolean; file: string; error?: string }> {
  if (dryRun) {
    console.log(`[dry-run] Would generate: ${job.id}`)
    console.log(`  Prompt: ${job.prompt.slice(0, 100)}...`)
    return { ok: true, file: job.outputPath }
  }

  // TODO: dispatch to ComfyUI via MCP mcp__comfyui__generate_image
  // This is a placeholder; the actual integration uses the ComfyUI MCP connection.
  console.log(`[TODO] Generate ${job.id} (${job.category}): ${job.outputPath}`)
  console.log(`  Prompt: ${job.prompt}`)

  // Simulated delay (in real impl, this is ComfyUI queue time + generation)
  await new Promise(r => setTimeout(r, 100))

  // For now, create a placeholder file so we can verify the rest of the pipeline
  const dir = path.dirname(job.outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(job.outputPath, Buffer.alloc(1)) // 1-byte placeholder
  return { ok: true, file: job.outputPath }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filterIdx = args.indexOf('--filter')
  const filterCategory = filterIdx !== -1 ? args[filterIdx + 1] : null
  const seedOffsetIdx = args.indexOf('--seed-offset')
  const seedOffset = seedOffsetIdx !== -1 ? parseInt(args[seedOffsetIdx + 1], 10) : 0

  console.log(`\n=== Kaiser 3 Art Generation ===\n`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Filter: ${filterCategory ?? 'all'}`)
  console.log(`Seed offset: ${seedOffset}\n`)

  const tileset: TilesetJson = JSON.parse(fs.readFileSync(tilesetPath, 'utf-8'))
  const jobs: AssetJob[] = []

  for (const [category, assets] of Object.entries(tileset)) {
    if (category.startsWith('_')) continue // skip metadata fields
    if (filterCategory && category !== filterCategory) continue

    for (const [assetId, filePath] of Object.entries(assets)) {
      const prompt = buildPrompt(assetId, category)
      if (!prompt) continue

      const outputPath = path.join(projectRoot, 'public', filePath)
      jobs.push({ id: assetId, category, prompt, outputPath })
    }
  }

  console.log(`Queued ${jobs.length} assets for generation\n`)

  // Sequential generation (can parallelize via Promise.all if ComfyUI queue supports it)
  let generated = 0
  let failed = 0

  for (const job of jobs) {
    process.stdout.write(`[${generated + failed + 1}/${jobs.length}] ${job.id}...`)
    const result = await generateAsset(job, dryRun)
    if (result.ok) {
      console.log(' ✓')
      generated++
    } else {
      console.log(` ✗ ${result.error}`)
      failed++
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Generated: ${generated}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${generated + failed}/${jobs.length}`)

  if (generated > 0) {
    console.log(`\nNext: npm run verify-art`)
  }
}

main().catch(console.error)
