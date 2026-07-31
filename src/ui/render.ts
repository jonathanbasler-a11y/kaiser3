// Procedural banner rendering — Canvas 2D, no assets. Per CLAUDE.md's art rule,
// this is the permanent fallback that art (Phase 10) layers on top of, not a
// placeholder to be deleted later. Honours devicePixelRatio so it isn't blurry on
// Retina/iOS displays, which a naive canvas fill would be.

import { WEATHER_TONES, DEFAULT_TONE } from './theme.ts'

export function sizeCanvasForDisplay(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

export function drawBanner(canvas: HTMLCanvasElement, weatherId: string | undefined, rankName: string): void {
  const ctx = sizeCanvasForDisplay(canvas)
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height
  const tone = (weatherId && WEATHER_TONES[weatherId]) || DEFAULT_TONE

  const gradient = ctx.createLinearGradient(0, 0, w, 0)
  gradient.addColorStop(0, tone.from)
  gradient.addColorStop(1, tone.to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // A simple silhouette skyline so the banner reads as "a realm", not just a
  // color swatch — cheap to draw, no assets required.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  const towers = 7
  for (let i = 0; i < towers; i++) {
    const tw = w / towers
    const th = h * (0.35 + ((i * 37) % 40) / 100)
    ctx.fillRect(i * tw, h - th, tw * 0.7, th)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '600 15px -apple-system, BlinkMacSystemFont, Georgia, serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(rankName, 12, h / 2)
}

// Procedural fallbacks for generated art. Each renders its asset type
// using Canvas 2D only, no loaded images. Used when public/art/* is missing.

export function drawPortraitProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, assetId: string): void {
  // Simple portrait: colored square with initials
  const colors: Record<string, string> = {
    builder: '#6b4423',
    expansionist: '#b8860b',
    merchant: '#4a5f8f',
    schemer: '#2a1a0a',
    raider: '#8b2e2e'
  }
  const color = colors[assetId] || '#666'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#f1e6d3'
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(assetId[0].toUpperCase(), w / 2, h / 2)
}

export function drawBuildingProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, assetId: string): void {
  // Simple isometric building: rectangular shape with shading
  const baseColor = assetId.includes('palace') ? '#a0826d' : assetId === 'cathedral' ? '#c0c0c0' : '#8b7355'
  const isDarkBg = assetId.includes('garrison') || assetId.includes('schemer')

  ctx.fillStyle = isDarkBg ? '#3a2818' : '#e8dcc4'
  ctx.fillRect(0, 0, w, h)

  // Isometric box: draw front face and two sides
  const x = w * 0.15, y = h * 0.35
  const boxW = w * 0.5, boxH = h * 0.5

  ctx.fillStyle = baseColor
  ctx.fillRect(x, y, boxW, boxH)

  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(x + boxW, y + boxH * 0.2, boxW * 0.3, boxH * 0.5)

  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x, y - boxH * 0.25, boxW * 0.4, boxH * 0.25)

  // Roof
  ctx.fillStyle = '#8b5a2b'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + boxW / 2, y - boxH * 0.3)
  ctx.lineTo(x + boxW, y)
  ctx.fill()

  ctx.fillStyle = '#f1e6d3'
  ctx.font = '8px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(assetId, w / 2, h - 3)
}

export function drawEventIconProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, assetId: string): void {
  // Event icons: simple symbolic shapes
  const iconBg: Record<string, string> = {
    plague_flag: '#1a1a1a',
    fire_smoke: '#2a1a0a',
    famine_sign: '#8b6914',
    revolt_banner: '#1a0a0a',
    bandit_skull: '#2a2a2a',
    flood_wave: '#1a3a5a',
    drought_sun: '#5a4a0a'
  }
  const bg = iconBg[assetId] || '#333'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#f1e6d3'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const emoji: Record<string, string> = {
    plague_flag: '💀',
    fire_smoke: '🔥',
    famine_sign: '🌾',
    revolt_banner: '⚔️',
    bandit_skull: '☠️',
    flood_wave: '🌊',
    drought_sun: '☀️'
  }
  ctx.fillText(emoji[assetId] || '?', w / 2, h / 2)
}

export function drawTerrainProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, assetId: string): void {
  // Terrain hex tiles: isometric with different ground textures
  const terrainColor: Record<string, string> = {
    farmland_fallow: '#9b8b6b',
    farmland_planted: '#6b8b4b',
    farmland_ripe: '#c9b859',
    farmland_blighted: '#7b6b4b',
    forest: '#3a5a2a',
    river: '#4a7a9a'
  }
  const color = terrainColor[assetId] || '#8b8b7b'

  // Isometric hex hexagon: simplified as a diamond
  ctx.fillStyle = color
  const cx = w / 2, cy = h / 2, rx = w * 0.4, ry = h * 0.4
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // Add a gradient for 3D effect
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, 'rgba(255,255,255,0.15)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.15)')
  ctx.fillStyle = gradient
  ctx.fill()

  // Small label
  ctx.fillStyle = 'rgba(241, 230, 211, 0.6)'
  ctx.font = '6px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(assetId.split('_')[0], w / 2, h * 0.85)
}
