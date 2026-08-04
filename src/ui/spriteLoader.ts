// DOM image helper for art under public/art/ (via data/tileset.json).
// Missing files fall back to procedural renderers so the game stays playable.

import {
  drawBuildingProcedural,
  drawPortraitProcedural,
  drawEventIconProcedural,
  drawTerrainProcedural,
  drawCrestProcedural,
  drawUiIconProcedural
} from './render.ts'
import tilesetData from '../../data/tileset.json'

const STATIC_TILESET = tilesetData as unknown as Record<string, Record<string, string>>

const FALLBACK_RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, id: string) => void> = {
  buildings: drawBuildingProcedural,
  portraits: drawPortraitProcedural,
  eventIcons: drawEventIconProcedural,
  terrain: drawTerrainProcedural,
  crests: drawCrestProcedural,
  uiIcons: drawUiIconProcedural,
  scenes: (ctx, w, h, id) => {
    ctx.fillStyle = '#e8dab8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1a1008'
    ctx.font = '14px "EB Garamond", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(`[Scene: ${id}]`, w / 2, h / 2)
  },
  eventScenes: (ctx, w, h, id) => {
    ctx.fillStyle = '#e8dab8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1a1008'
    ctx.font = '14px "EB Garamond", Georgia, serif'
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
  crests: [256, 256],
  uiIcons: [96, 96]
}

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
