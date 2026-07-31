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
