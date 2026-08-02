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

// Rank crest fallback — escalating ornamentation so promotions still read
// visually when public/art/crests/*.png is missing (Phase 16 prepped the
// ComfyUI pipeline; PNGs are optional under the art-fallback invariant).
const CREST_RANK: Record<string, number> = {
  baron: 0, duke: 1, prince: 2, count: 3,
  margrave: 4, archbishop: 5, king: 6, kaiser: 7
}

const CREST_PALETTE: Record<string, { field: string; charge: string; metal: string }> = {
  baron: { field: '#3a3f4a', charge: '#9aa3b2', metal: '#8a9099' },
  duke: { field: '#2f4a3a', charge: '#c9a84a', metal: '#b8953a' },
  prince: { field: '#3a2f5a', charge: '#e0c86a', metal: '#d4b84a' },
  count: { field: '#5a2a2a', charge: '#e8c85a', metal: '#d4a84a' },
  margrave: { field: '#4a1f1f', charge: '#f0d060', metal: '#e0b040' },
  archbishop: { field: '#2a1848', charge: '#e8d070', metal: '#d4b050' },
  king: { field: '#1a2040', charge: '#f5d76a', metal: '#e8c040' },
  kaiser: { field: '#1a1028', charge: '#ffe080', metal: '#f0c848' }
}

export function drawCrestProcedural(ctx: CanvasRenderingContext2D, w: number, h: number, assetId: string): void {
  const rank = CREST_RANK[assetId] ?? 0
  const palette = CREST_PALETTE[assetId] ?? CREST_PALETTE.baron
  const cx = w / 2
  const cy = h / 2 + h * 0.06

  // Parchment / dark field
  ctx.fillStyle = rank >= 6 ? '#1a1410' : '#2a2218'
  ctx.fillRect(0, 0, w, h)

  // Optional radiant glow behind the highest ranks
  if (rank >= 6) {
    const glow = ctx.createRadialGradient(cx, cy - h * 0.1, 2, cx, cy - h * 0.1, w * 0.55)
    glow.addColorStop(0, 'rgba(240, 200, 80, 0.35)')
    glow.addColorStop(1, 'rgba(240, 200, 80, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy - h * 0.1, w * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }

  // Shield
  const sw = w * 0.48
  const sh = h * 0.52
  const sx = cx - sw / 2
  const sy = cy - sh * 0.45
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + sw, sy)
  ctx.lineTo(sx + sw, sy + sh * 0.55)
  ctx.quadraticCurveTo(cx, sy + sh * 1.15, sx, sy + sh * 0.55)
  ctx.closePath()
  ctx.fillStyle = palette.field
  ctx.fill()
  ctx.strokeStyle = palette.metal
  ctx.lineWidth = Math.max(1.5, w * (0.02 + rank * 0.004))
  ctx.stroke()

  // Inner gold filigree from Prince up
  if (rank >= 2) {
    ctx.beginPath()
    const inset = w * 0.04
    ctx.moveTo(sx + inset, sy + inset)
    ctx.lineTo(sx + sw - inset, sy + inset)
    ctx.lineTo(sx + sw - inset, sy + sh * 0.5)
    ctx.quadraticCurveTo(cx, sy + sh * 1.0, sx + inset, sy + sh * 0.5)
    ctx.closePath()
    ctx.strokeStyle = `rgba(232, 200, 80, ${0.35 + rank * 0.05})`
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Charge — distinct per rank so the ladder is honest even without Comfy PNGs
  ctx.fillStyle = palette.charge
  const chargeY = sy + sh * 0.32
  if (rank === 0) {
    // Plow
    ctx.fillRect(cx - w * 0.12, chargeY, w * 0.24, h * 0.035)
    ctx.fillRect(cx - w * 0.02, chargeY - h * 0.1, w * 0.04, h * 0.12)
  } else if (rank === 1) {
    // Key
    ctx.beginPath()
    ctx.arc(cx, chargeY - h * 0.06, w * 0.055, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(cx - w * 0.015, chargeY - h * 0.02, w * 0.03, h * 0.14)
    ctx.fillRect(cx - w * 0.015, chargeY + h * 0.08, w * 0.06, h * 0.025)
  } else if (rank === 2) {
    // Fleur
    ctx.beginPath()
    ctx.moveTo(cx, chargeY - h * 0.14)
    ctx.lineTo(cx + w * 0.08, chargeY)
    ctx.lineTo(cx, chargeY + h * 0.14)
    ctx.lineTo(cx - w * 0.08, chargeY)
    ctx.closePath()
    ctx.fill()
  } else if (rank === 3) {
    // Lion-ish upright wedge
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.04, chargeY + h * 0.12)
    ctx.lineTo(cx - w * 0.02, chargeY - h * 0.1)
    ctx.lineTo(cx + w * 0.08, chargeY - h * 0.04)
    ctx.lineTo(cx + w * 0.02, chargeY + h * 0.12)
    ctx.closePath()
    ctx.fill()
  } else if (rank === 4) {
    // Watchtower
    ctx.fillRect(cx - w * 0.07, chargeY - h * 0.02, w * 0.14, h * 0.16)
    ctx.fillRect(cx - w * 0.09, chargeY - h * 0.08, w * 0.18, h * 0.06)
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - w * 0.09 + i * w * 0.07, chargeY - h * 0.12, w * 0.04, h * 0.05)
    }
  } else if (rank === 5) {
    // Mitre
    ctx.beginPath()
    ctx.moveTo(cx, chargeY - h * 0.16)
    ctx.lineTo(cx + w * 0.1, chargeY + h * 0.06)
    ctx.lineTo(cx - w * 0.1, chargeY + h * 0.06)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(cx - w * 0.08, chargeY + h * 0.06, w * 0.16, h * 0.03)
  } else if (rank === 6) {
    // Single lion wedge
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.05, chargeY + h * 0.14)
    ctx.lineTo(cx, chargeY - h * 0.14)
    ctx.lineTo(cx + w * 0.1, chargeY)
    ctx.lineTo(cx + w * 0.02, chargeY + h * 0.14)
    ctx.closePath()
    ctx.fill()
  } else {
    // Double-headed eagle suggestion
    ctx.beginPath()
    ctx.moveTo(cx, chargeY + h * 0.04)
    ctx.lineTo(cx - w * 0.14, chargeY - h * 0.12)
    ctx.lineTo(cx - w * 0.02, chargeY + h * 0.14)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx, chargeY + h * 0.04)
    ctx.lineTo(cx + w * 0.14, chargeY - h * 0.12)
    ctx.lineTo(cx + w * 0.02, chargeY + h * 0.14)
    ctx.closePath()
    ctx.fill()
  }

  // Coronet above the shield — absent for Baron, grows with rank
  if (rank >= 1) {
    const crownY = sy - h * 0.02
    const crownW = sw * (0.55 + rank * 0.03)
    ctx.fillStyle = palette.metal
    ctx.fillRect(cx - crownW / 2, crownY - h * 0.04, crownW, h * 0.05)
    const points = Math.min(3 + rank, 7)
    for (let i = 0; i < points; i++) {
      const px = cx - crownW / 2 + (crownW * (i + 0.5)) / points
      const ph = h * (0.05 + (i % 2 === 0 ? 0.04 : 0.02) + (rank >= 6 ? 0.02 : 0))
      ctx.beginPath()
      ctx.moveTo(px - w * 0.02, crownY - h * 0.04)
      ctx.lineTo(px, crownY - h * 0.04 - ph)
      ctx.lineTo(px + w * 0.02, crownY - h * 0.04)
      ctx.closePath()
      ctx.fill()
    }
    if (rank >= 7) {
      // Imperial cross atop the crown
      ctx.fillRect(cx - w * 0.015, crownY - h * 0.18, w * 0.03, h * 0.08)
      ctx.fillRect(cx - w * 0.04, crownY - h * 0.16, w * 0.08, h * 0.025)
    }
  }

  // Mantling / side drapes from Count up
  if (rank >= 3) {
    ctx.strokeStyle = `rgba(200, 60, 50, ${0.4 + rank * 0.05})`
    ctx.lineWidth = Math.max(1.5, w * 0.03)
    ctx.beginPath()
    ctx.moveTo(sx, sy + h * 0.05)
    ctx.quadraticCurveTo(sx - w * 0.12, cy, sx - w * 0.02, cy + h * 0.25)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx + sw, sy + h * 0.05)
    ctx.quadraticCurveTo(sx + sw + w * 0.12, cy, sx + sw + w * 0.02, cy + h * 0.25)
    ctx.stroke()
  }
}
