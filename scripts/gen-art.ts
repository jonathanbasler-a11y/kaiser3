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
    palace_stage_1: `Excavated plot with a few stone blocks, simple wooden scaffold. Bare earth around. Foundation of a great building.`,
    palace_stage_2: `Ground floor complete, one story of walls, wooden framing for floors above.`,
    palace_stage_16: `Full five-story grand palace with four corner towers, central spire with flag, heraldic banners, manicured courtyard and gardens, ornate gates. Seat of power, complete.`,
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

const RESOLUTIONS: Record<string, [number, number]> = {
  buildings: [128, 96],
  portraits: [256, 256],
  eventIcons: [96, 96],
  terrain: [128, 96],
  scenes: [1280, 720]
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

  const comfyUIUrl = 'http://localhost:8188'
  const [width, height] = RESOLUTIONS[job.category] ?? [128, 96]

  try {
    // Minimal ComfyUI txt2img workflow - test if basic structure works
    const seed = Math.abs(job.id.charCodeAt(0) * 1000 + Math.random() * 10000)
    const workflow: Record<string, any> = {
      '1': {
        inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' },
        class_type: 'CheckpointLoaderSimple'
      },
      '2': {
        inputs: { text: job.prompt, clip: ['1', 1] },
        class_type: 'CLIPTextEncode'
      },
      '3': {
        inputs: { text: '', clip: ['1', 1] },
        class_type: 'CLIPTextEncode'
      },
      '4': {
        inputs: { width, height, batch_size: 1 },
        class_type: 'EmptyLatentImage'
      },
      '5': {
        inputs: {
          seed: seed,
          steps: 10,
          cfg: 7.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1.0,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0]
        },
        class_type: 'KSampler'
      },
      '6': {
        inputs: { samples: ['5', 0], vae: ['1', 2] },
        class_type: 'VAEDecode'
      },
      '7': {
        inputs: { filename_prefix: job.id, images: ['6', 0] },
        class_type: 'SaveImage'
      }
    }

    // POST to ComfyUI
    const response = await fetch(`${comfyUIUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow })
    })

    if (!response.ok) {
      return { ok: false, file: job.outputPath, error: `ComfyUI HTTP ${response.status}` }
    }

    const result = await response.json() as { prompt_id: string }
    const promptId = result.prompt_id

    // Poll for completion (timeout 5 min)
    let completed = false
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise(r => setTimeout(r, 1000))

      try {
        const histRes = await fetch(`${comfyUIUrl}/history/${promptId}`)
        if (histRes.ok) {
          const hist = await histRes.json() as Record<string, any>
          if (hist[promptId]?.outputs) {
            completed = true
            break
          }
        }
      } catch {
        // Keep polling
      }
    }

    if (!completed) {
      return { ok: false, file: job.outputPath, error: 'Generation timeout (5 min)' }
    }

    // Fetch history to get image filename
    const histRes = await fetch(`${comfyUIUrl}/history/${promptId}`)
    if (!histRes.ok) {
      return { ok: false, file: job.outputPath, error: 'History fetch failed' }
    }

    const hist = await histRes.json() as Record<string, any>
    const outputs = hist[promptId]?.outputs
    const images = outputs?.['7']?.images ?? []

    if (!images.length) {
      return { ok: false, file: job.outputPath, error: 'No output images' }
    }

    const imageFilename = images[0].filename
    const imageUrl = `${comfyUIUrl}/view?filename=${encodeURIComponent(imageFilename)}&type=output`

    // Download image
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) {
      return { ok: false, file: job.outputPath, error: `Image download ${imgRes.status}` }
    }

    const buffer = await imgRes.arrayBuffer()

    // Save to disk
    const dir = path.dirname(job.outputPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(job.outputPath, Buffer.from(buffer))

    return { ok: true, file: job.outputPath }
  } catch (err) {
    return { ok: false, file: job.outputPath, error: String(err).slice(0, 50) }
  }
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
