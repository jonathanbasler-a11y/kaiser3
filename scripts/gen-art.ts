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
  portraits: `Medieval Holy Roman Empire, oil painting style, late 15th century. Solo character portrait of exactly ONE person, alone in frame, three-quarter view, rich clothing and regalia befitting their rank. Natural lighting, slight warm tone. Painterly brushwork, fine detail in faces. No text, no modern elements.`,
  buildings: `Medieval architecture, isometric three-quarter view, semi-transparent shadow beneath. Painterly texture, earth tones (ochre, sienna, grays). A single isolated building standing alone on plain ground with no town, village, or skyline behind it — just the one structure and open grass/earth around it. No people, no text. Roof and facing visible, shading suggests 3D form.`,
  eventIcons: `Medieval icon style, symbolic rather than realistic. Bold, clear silhouette of the literal described object/symbol, not a portrait of a person. Warm or dark background to suggest the event's tone. Oil painting texture, gold leaf accents where appropriate. Fits in a square, centered. No text, no human figures unless explicitly described.`,
  scenes: `Medieval illustration, oil painting style, rich detail, warm lighting.`,
  terrain: `Top-down/isometric single farmland plot tile, close overhead view of soil and crops filling the frame — not a wide landscape, not a distant town or castle. Semi-transparent shadow beneath. Painterly, textured. Natural palette. No people, no buildings. Shows land fertility/state via color/pattern.`,
  crests: `Heraldic coat-of-arms crest, painted illuminated-manuscript style, centered on a plain dark parchment background, symmetrical, no people, no landscape, no buildings, no text or letters of any kind — only heraldic shapes, a shield outline, and rank-appropriate ornamentation. Gold leaf accents, rich medieval pigments.`
}

const ASSET_SPECS: Record<string, Record<string, string>> = {
  portraits: {
    builder: `Stern, disciplined, middle-aged merchant-prince in fur-trimmed coat. Hands show calluses. Books and architectural plans in background blur. Serious, methodical expression.`,
    expansionist: `Young, confident, bright-eyed noble in velvet doublet. Golden jewels catch light. Maps and banners visible behind. Expansive gesture, optimistic bearing.`,
    merchant: `Solo portrait of one shrewd, weathered trader in fine silk and saffron tones, alone at his table. Scales, coins, spice jars nearby. Sharp eyes, knowing smile. Prosperous but cautious. Only this one man in the painting.`,
    schemer: `Solo portrait of one shadowed, calculating figure in dark silks, alone in the frame. Single candle illuminates one side of his face. Dagger hilt visible at his belt. Knowing, almost amused expression. Murky background with no other people.`,
    raider: `Wild-eyed, scarred, muscular warrior in leather and iron. Wind-blown hair, weapon nearby. Fierce, predatory expression. Stormy sky behind.`
  },
  buildings: {
    market: `A single stone marketplace building with a covered arcade out front, barrels and crates stacked beside its entrance. Tiled roof, wooden shutters. One building only, standing alone, nothing else in the background.`,
    mill: `A single stone watermill building with one large wooden wheel on its side, a small stream passing beneath it. Thatched roof. Gears visible through the open side. One isolated building, nothing else around it.`,
    palace_stage_1: `A raw construction site on bare dirt: loose piles of cut stone blocks scattered on the ground, wooden scaffold poles standing upright, string lines marking a foundation outline. Absolutely NO walls exist yet, no roof, no finished structure of any kind — this must NOT look like a completed building, cottage, or village. Just building materials on an empty dirt lot.`,
    palace_stage_2: `A half-built ruin-like construction site: four low stone wall stubs forming a rectangle outline, each wall only about waist-to-shoulder height, with jagged uneven tops where the masonry simply stops — like a building that was never finished. Completely open to the sky, no roof structure of any kind, no towers, no spires, no flags. Wooden scaffold poles and a ladder lean against the walls. Loose stone blocks and rubble scattered inside the unfinished rectangle. Must look like a stalled construction site, never a complete or nearly-complete building.`,
    palace_stage_16: `Full five-story grand palace with four corner towers, central spire with flag, heraldic banners, manicured courtyard and gardens, ornate gates. Seat of power, complete.`,
    cathedral: `Grand Gothic cathedral with a high central spire, flying buttresses, rose window visible. Lighter stone (pale gray/cream). Intricate masonry. Sacred, imposing, complete.`,
    hospital: `A single simple rectangular building with ONE gabled roof (not a castle, not towers, not battlements), plain stone walls, a red cross flag mounted above its single front door, a few large windows. Small herb garden boxes at its base. Nothing else in the frame — just this one plain civic building alone on grass.`,
    well: `A tiny prop-scale object study of a village wishing-well: a short circular ring of stacked round stones no taller than knee-height, topped by two thin wooden posts holding up a small peaked wood shingle roof no bigger than an umbrella, with a rope and wooden bucket hanging beneath it. The whole object is small and simple like a garden ornament — it has no walls, no door, no windows, no floor, no interior, nothing a person could stand inside. Sitting alone on plain grass.`,
    granary: `A single large timber-frame building with a sloped roof, small ventilation windows along its side, an external staircase, and grain sacks stacked at its door. One isolated storage building, nothing else in the background.`,
    garrison: `A single fortified stone structure with narrow defensive windows, one guard tower on its corner, and a small catapult beside it. One isolated martial building standing alone, nothing else in the background.`,
    trading_house: `A single ornate merchant's house with fancy tiled walls, silk banners hanging from its front, and imported goods displayed at its entrance. One isolated, ostentatiously wealthy building standing alone, nothing else in the background.`
  },
  eventIcons: {
    plague_flag: `Quarantine flag with skull/crossbones, sickly green mist wisps around it. Dark background. Ominous, diseased tone.`,
    fire_smoke: `Flames and thick orange/red smoke rising from a building silhouette. Yellow and orange tones. Urgent, destructive energy.`,
    famine_sign: `An icon of an empty broken bread loaf beside a wilted, drooping wheat sheaf, lying on cracked bare earth. No people. Brown and gray tones. Desperate, starving feeling.`,
    revolt_banner: `An icon of a raised fist gripping a pitchfork, crossed with a torn tattered banner behind it. No faces, just the fist/pitchfork/banner symbols. Angry red and black tones. Chaotic, revolutionary energy.`,
    bandit_skull: `Skull with crossed swords or daggers behind it. Dark tones with metallic glint. Dangerous, plunder-focused.`,
    flood_wave: `Large blue/gray wave crashing, swallowing buildings/land in silhouette. Churning, destructive. Cool, overwhelming tone.`,
    drought_sun: `A daytime icon showing one large, blazing bright-yellow sun high in a pale hot sky, radiating heat lines down onto a close-up field of deeply cracked, bone-dry earth with a few wilted brown plants. Bright daylight scene, NOT nighttime, no moon, no stars, no dark sky, no buildings, no houses, no castles. Yellows and browns, parched and relentless heat.`
  },
  scenes: {
    coronation_tableau: `Grand coronation scene in a cathedral: a crowned figure kneeling or standing before an altar, surrounded by bishops and nobles in ceremonial dress. Golden light streaming through stained glass. Opulent, triumphant, ceremonial tone.`,
    battlefield_backdrop: `Aerial view of a medieval battlefield: rolling hills, fortified town in the distance, cavalry and foot soldiers positioned across fields. Tents, banners, smoke from siege weapons. Strategic, tactical feeling. Early morning or late afternoon light.`,
    chronicle_parchment: `Extreme close-up macro photograph-style texture of blank old paper, like the empty page of an ancient diary. The ENTIRE image must be filled edge-to-edge with paper texture only — fibrous grain, water stains, small creases, one small wax seal blob in a corner, a thin decorative line border near the edges. There must be NO castle, NO building, NO landscape, NO scenery, NO horizon, NO illustration of any object or place — this is purely a flat background material texture, like fabric or wood-grain reference photography, not a picture of a scene.`
  },
  terrain: {
    farmland_fallow: `Close overhead view of bare turned soil filling the frame, furrow rows, a few scattered rocks. No town, no castle, no buildings. Brown, gray tones. Ready but not planted.`,
    farmland_planted: `Rows of young green shoots, fresh soil. Hopeful green and brown. Early growth.`,
    farmland_ripe: `Close overhead view of golden wheat at full height filling the frame, ready for harvest. No town, no castle, no distant valley. Rich golden-brown. Abundant, prosperous.`,
    farmland_blighted: `Diseased or drought-affected crops: yellowed, withered, sparse. Dull khaki and brown. Desperate, poor yield.`,
    forest: `Dense trees, dark green canopy, tree trunks visible beneath. Cool, shadowed tones. Wild, untamed.`,
    river: `Flowing water, blue-gray tones, banks on either side. Slight current suggested by water flow. Splits/divides hexagons on a map.`
  },
  // Escalating ornamentation with rank — the same 8-tier ladder as data/ranks.json
  // (Baron -> Kaiser), each crest visibly grander than the last so the title
  // change on promotion reads at a glance, not just via the text label.
  crests: {
    baron: `A plain single-color shield, one simple charge (a single tower or plow), no crown, no mantling, unadorned iron rim. Modest, minor-nobility crest.`,
    duke: `A quartered shield with two charges, a simple circlet coronet above it, light gold trim beginning to appear at the edges. Ambitious but still restrained.`,
    prince: `A shield with three charges and a fleur-de-lis motif, a princely coronet with visible points above it, gold filigree bordering the shield. Youthful, rising nobility.`,
    count: `An ornate shield split diagonally with a rampant beast (lion or eagle) charge, a count's coronet with pearls above it, heavier gold scrollwork bordering the whole crest.`,
    margrave: `A shield bearing a fortified tower or border-march motif (this rank guards a frontier), a wide banded coronet above it, twin supporter banners flanking the shield, rich gold and crimson.`,
    archbishop: `A shield combined with a bishop's mitre above it and a crozier crossed behind it, deep purple and gold, small radiating halo-like gold rays behind the mitre. Sacred and civil authority combined.`,
    king: `A large elaborate shield with a rampant lion or double-headed eagle, a full jeweled royal crown with arches above it, heavy gold mantling draping down both sides, red velvet lining visible.`,
    kaiser: `The grandest possible crest: a large shield bearing an imperial double-headed eagle, a closed imperial crown with a cross atop it, an orb and sceptre crossed behind the shield, elaborate gold mantling and jewels covering the whole frame, radiant gold background glow. Absolute summit of splendor.`
  }
}

// Final in-game asset sizes.
const RESOLUTIONS: Record<string, [number, number]> = {
  buildings: [128, 96],
  portraits: [256, 256],
  eventIcons: [96, 96],
  terrain: [128, 96],
  scenes: [1280, 720],
  crests: [96, 96]
}

// SDXL is trained at ~1024²; sampling straight to a 96×96 latent yields noise, not
// a small picture. Generate at the nearest native bucket, then downscale in-graph.
const GEN_SIZES: Record<string, [number, number]> = {
  buildings: [1152, 896],
  portraits: [1024, 1024],
  crests: [1024, 1024],
  eventIcons: [1024, 1024],
  terrain: [1152, 896],
  scenes: [1344, 768]
}

const COMFYUI_URL = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'
const CHECKPOINT = process.env.COMFYUI_CKPT ?? 'sd_xl_base_1.0.safetensors'
const NEGATIVE_PROMPT =
  'text, watermark, signature, logo, caption, letters, ui, frame, border, ' +
  'photograph, 3d render, cgi, anime, blurry, low quality, deformed, collage, multiple subjects'

// Extra negative terms layered on for categories/assets where the base negative isn't enough
// (buildings/terrain need "no surrounding village"; portraits need "no group shots").
const EXTRA_NEGATIVE: Record<string, string> = {
  portraits: 'multiple people, group portrait, crowd, several figures, two people, three people, four people',
  buildings: 'village, town, city, skyline, many buildings, rooftops, distant buildings, multiple structures',
  terrain: 'village, town, city, castle, wide landscape, valley view, distant buildings, horizon',
  crests: 'people, face, portrait, figure, landscape, building, castle, sky, horizon, photo, realistic texture, text, letters, numbers'
}

// Per-asset negative overrides for cases the category-level rule doesn't fit
// (e.g. chronicle_parchment is a "scenes" asset but, unlike its siblings, must
// have NO scenery at all).
const EXTRA_NEGATIVE_BY_ASSET: Record<string, string> = {
  chronicle_parchment: 'castle, building, house, tower, landscape, scenery, horizon, illustration, painting of a place, river, hills, trees',
  drought_sun: 'night, moon, stars, dark sky, house, building, castle',
  well: 'house, cottage, building, walls, roof, door, windows, silo, tower, structure, hut, cabin, large roof, thatched roof covering, farmhouse',
  hospital: 'castle, towers, battlements, fortress, multiple towers',
  palace_stage_1: 'finished building, complete building, roof, walls, cottage, chapel, village',
  palace_stage_2: 'finished building, complete roof, chapel, cottage, village, castle, towers, spires, flags, battlements, complete walls, tall walls',
  farmland_fallow: 'house, shed, building, hut, structure'
}

// Deterministic per-asset seed so reruns reproduce and --seed-offset actually varies output.
function seedFor(category: string, assetId: string, offset: number): number {
  let h = 2166136261
  const key = `${category}/${assetId}`
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 1_000_000_000) + offset
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

async function generateAsset(job: AssetJob, dryRun: boolean, seedOffset: number): Promise<{ ok: boolean; file: string; error?: string }> {
  if (dryRun) {
    console.log(`[dry-run] Would generate: ${job.id}`)
    console.log(`  Prompt: ${job.prompt.slice(0, 100)}...`)
    return { ok: true, file: job.outputPath }
  }

  const comfyUIUrl = COMFYUI_URL
  const [targetW, targetH] = RESOLUTIONS[job.category] ?? [128, 96]
  const [genW, genH] = GEN_SIZES[job.category] ?? [1024, 1024]

  try {
    const workflow: Record<string, any> = {
      '1': {
        inputs: { ckpt_name: CHECKPOINT },
        class_type: 'CheckpointLoaderSimple'
      },
      '2': {
        inputs: { text: job.prompt, clip: ['1', 1] },
        class_type: 'CLIPTextEncode'
      },
      '3': {
        inputs: {
          text: [NEGATIVE_PROMPT, EXTRA_NEGATIVE[job.category], EXTRA_NEGATIVE_BY_ASSET[job.id]].filter(Boolean).join(', '),
          clip: ['1', 1]
        },
        class_type: 'CLIPTextEncode'
      },
      '4': {
        inputs: { width: genW, height: genH, batch_size: 1 },
        class_type: 'EmptyLatentImage'
      },
      '5': {
        inputs: {
          seed: seedFor(job.category, job.id, seedOffset),
          steps: 28,
          cfg: 7.0,
          sampler_name: 'dpmpp_2m',
          scheduler: 'karras',
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
      // Downscale the native-resolution render to the in-game asset size.
      '7': {
        inputs: {
          image: ['6', 0],
          upscale_method: 'lanczos',
          width: targetW,
          height: targetH,
          crop: 'center'
        },
        class_type: 'ImageScale'
      },
      '8': {
        inputs: { filename_prefix: `kaiser3/${job.category}/${job.id}`, images: ['7', 0] },
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
      const body = await response.text().catch(() => '')
      return { ok: false, file: job.outputPath, error: `HTTP ${response.status}: ${body.slice(0, 300)}` }
    }

    const result = await response.json() as { prompt_id: string }
    const promptId = result.prompt_id

    // Poll for completion (timeout 10 min per asset)
    let entry: any = null
    for (let attempt = 0; attempt < 600; attempt++) {
      await new Promise(r => setTimeout(r, 1000))

      try {
        const histRes = await fetch(`${comfyUIUrl}/history/${promptId}`)
        if (histRes.ok) {
          const hist = await histRes.json() as Record<string, any>
          const e = hist[promptId]
          if (e?.status?.completed || e?.status?.status_str === 'error') {
            entry = e
            break
          }
        }
      } catch {
        // Server busy mid-sample; keep polling.
      }
    }

    if (!entry) {
      return { ok: false, file: job.outputPath, error: 'Generation timeout (10 min)' }
    }

    if (entry.status?.status_str === 'error') {
      const errMsg = (entry.status.messages ?? [])
        .filter((m: any) => m[0] === 'execution_error')
        .map((m: any) => m[1]?.exception_message)[0] ?? 'unknown execution error'
      return { ok: false, file: job.outputPath, error: String(errMsg).slice(0, 200) }
    }

    const images = entry.outputs?.['8']?.images ?? []

    if (!images.length) {
      return { ok: false, file: job.outputPath, error: 'No output images' }
    }

    // filename_prefix puts outputs in a subfolder; /view needs it as its own param.
    const img = images[0]
    const query = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder ?? '',
      type: img.type ?? 'output'
    })
    const imageUrl = `${comfyUIUrl}/view?${query.toString()}`

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
  const assetsIdx = args.indexOf('--assets')
  const filterAssets = assetsIdx !== -1 ? args[assetsIdx + 1].split(',').map(s => s.trim()) : null
  const seedOffsetIdx = args.indexOf('--seed-offset')
  const seedOffset = seedOffsetIdx !== -1 ? parseInt(args[seedOffsetIdx + 1], 10) : 0

  console.log(`\n=== Kaiser 3 Art Generation ===\n`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Filter: ${filterCategory ?? 'all'}`)
  console.log(`Assets: ${filterAssets ? filterAssets.join(', ') : 'all'}`)
  console.log(`Seed offset: ${seedOffset}\n`)

  const tileset: TilesetJson = JSON.parse(fs.readFileSync(tilesetPath, 'utf-8'))
  const jobs: AssetJob[] = []

  for (const [category, assets] of Object.entries(tileset)) {
    if (category.startsWith('_')) continue // skip metadata fields
    if (filterCategory && category !== filterCategory) continue

    for (const [assetId, filePath] of Object.entries(assets)) {
      if (filterAssets && !filterAssets.includes(assetId)) continue
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
    const result = await generateAsset(job, dryRun, seedOffset)
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
