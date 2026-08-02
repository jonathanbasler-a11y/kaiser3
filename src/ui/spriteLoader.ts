// Load art from public/art/ manifest (tileset.json). Falls back to procedural
// rendering if a file is missing or fails to load. Usage:
//
//   const sprite = await loadSprite('buildings', 'market', canvas)
//   sprite.drawOn(ctx, x, y)

import {
  drawBuildingProcedural,
  drawPortraitProcedural,
  drawEventIconProcedural,
  drawTerrainProcedural,
  drawCrestProcedural
} from './render.ts'
import tilesetData from '../../data/tileset.json'

const STATIC_TILESET = tilesetData as unknown as Record<string, Record<string, string>>

let tilesetManifest: Record<string, Record<string, string>> | null = null

export interface Sprite {
  image: HTMLImageElement | null
  category: string
  assetId: string
  width: number
  height: number
  drawOn(ctx: CanvasRenderingContext2D, x: number, y: number): void
}

// Load the manifest once
async function loadManifest(): Promise<Record<string, Record<string, string>>> {
  if (tilesetManifest !== null) return tilesetManifest
  try {
    const res = await fetch('/data/tileset.json')
    if (!res.ok) throw new Error(`Failed to load tileset.json: ${res.status}`)
    tilesetManifest = await res.json() as Record<string, Record<string, string>>
    return tilesetManifest
  } catch (err) {
    console.warn(`Could not load tileset manifest, using procedural-only rendering: ${err}`)
    return {}
  }
}

// Attempt to load an image from a URL. Returns null if it fails.
async function tryLoadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timeout = setTimeout(() => {
      img.src = '' // cancel loading
      resolve(null)
    }, 5000) // 5 second timeout

    img.onload = () => {
      clearTimeout(timeout)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timeout)
      resolve(null)
    }
    img.src = url
  })
}

// Procedural fallback renderers, one per category
const FALLBACK_RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, id: string) => void> = {
  buildings: drawBuildingProcedural,
  portraits: drawPortraitProcedural,
  eventIcons: drawEventIconProcedural,
  terrain: drawTerrainProcedural,
  crests: drawCrestProcedural,
  scenes: (ctx, w, h, id) => {
    // Scenes are too large for a simple procedural fallback; just fill with a color
    ctx.fillStyle = '#2f2318'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f1e6d3'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`[Scene: ${id}]`, w / 2, h / 2)
  },
  eventScenes: (ctx, w, h, id) => {
    ctx.fillStyle = '#2a1810'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f1e6d3'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`[Event: ${id}]`, w / 2, h / 2)
  }
}

const RESOLUTIONS: Record<string, [number, number]> = {
  buildings: [128, 96],
  portraits: [256, 256],
  eventIcons: [96, 96],
  terrain: [128, 96],
  scenes: [1280, 720],
  eventScenes: [1280, 720],
  crests: [256, 256]
}

export async function loadSprite(category: string, assetId: string, sourceCanvas?: HTMLCanvasElement): Promise<Sprite> {
  const manifest = await loadManifest()
  const filePath = manifest[category]?.[assetId]
  const [width, height] = RESOLUTIONS[category] ?? [128, 96]

  let image: HTMLImageElement | null = null

  if (filePath) {
    image = await tryLoadImage(filePath)
  }

  if (!image) {
    // Fallback: draw procedurally into an off-screen canvas
    const canvas = sourceCanvas ?? document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const renderer = FALLBACK_RENDERERS[category]
      if (renderer) {
        renderer(ctx, width, height, assetId)
      } else {
        // Catch-all: gray placeholder
        ctx.fillStyle = '#999'
        ctx.fillRect(0, 0, width, height)
      }
    }
    // Procedural fallback sprite
    const procSprite: Sprite = {
      image: null,
      category,
      assetId,
      width,
      height,
      drawOn(ctx: CanvasRenderingContext2D, x: number, y: number) {
        if (canvas) ctx.drawImage(canvas, x, y)
      }
    }
    return procSprite
  }

  // Art-loaded sprite
  const artSprite: Sprite = {
    image,
    category,
    assetId,
    width,
    height,
    drawOn(ctx: CanvasRenderingContext2D, x: number, y: number) {
      if (image) ctx.drawImage(image, x, y, width, height)
    }
  }
  return artSprite
}

// Preload commonly-used sprites (portraits especially) for faster rendering
const spriteCache = new Map<string, Sprite>()

export async function preloadSprites(category: string, assetIds: string[]): Promise<void> {
  for (const id of assetIds) {
    const key = `${category}/${id}`
    if (!spriteCache.has(key)) {
      spriteCache.set(key, await loadSprite(category, id))
    }
  }
}

export function getCachedSprite(category: string, assetId: string): Sprite | undefined {
  return spriteCache.get(`${category}/${assetId}`)
}

// ---------------------------------------------------------------------------
// DOM image helper — for plain <img> usage outside canvas (setup screen,
// standings, build tab, event log). Uses the build-time-imported manifest
// (synchronous, no fetch round-trip) since the paths never change at runtime.
// If a file is missing or fails to load, the wrapper gets a `.sprite-fallback`
// class instead of throwing — the game must stay playable either way.
// ---------------------------------------------------------------------------

function proceduralDataUrl(category: string, assetId: string): string | null {
  const renderer = FALLBACK_RENDERERS[category]
  if (!renderer) return null
  const [width, height] = RESOLUTIONS[category] ?? [96, 96]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  renderer(ctx, width, height, assetId)
  return canvas.toDataURL('image/png')
}

export function spriteImg(category: string, assetId: string, alt: string, className?: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = `sprite-thumb${className ? ' ' + className : ''}`

  const filePath = STATIC_TILESET[category]?.[assetId]
  const applyProcedural = (): void => {
    const dataUrl = proceduralDataUrl(category, assetId)
    if (!dataUrl) {
      wrapper.classList.add('sprite-fallback')
      return
    }
    const img = document.createElement('img')
    img.src = dataUrl
    img.alt = alt
    wrapper.appendChild(img)
  }

  if (!filePath) {
    applyProcedural()
    return wrapper
  }

  const img = document.createElement('img')
  img.src = `/${filePath}`
  img.alt = alt
  img.loading = 'lazy'
  img.onerror = () => {
    img.remove()
    applyProcedural()
  }
  wrapper.appendChild(img)
  return wrapper
}
