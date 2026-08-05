// WCAG AA contrast regression guard for src/ui/style.css (Phase 20 follow-up).
//
// Origin: the Phase 19B parchment reskin shipped a `.rank-progress-row.leading
// .rank-progress-label` rule using --accent-bright — a token whose own comment
// says "not body text" — for exactly that. Measured in-browser: 1.99:1 on the
// worst offender. No test caught it because nothing checked token USAGE
// against WCAG thresholds; this script/test is that check.
//
// Approach: parse :root custom-property hex values, parse every CSS rule's
// `color` and `background`/`background-color` declarations, and for a rule
// that sets color without its own background, walk the selector's
// whitespace-separated segments outward (".stat .value.good" -> ".stat") to
// find the nearest ancestor rule that DOES set one — the same resolution a
// browser does for inherited/painted backgrounds, approximated from selector
// text since this codebase nests purely by selector convention, never by
// actual CSS nesting syntax. Falls back to the page background (--bg).
//
// Deliberately conservative: any declaration this parser can't resolve to a
// flat hex (gradients, rgba() overlays, unresolved vars) is SKIPPED, not
// failed — false negatives here are cheaper than false positives that would
// make the gate untrustworthy. Run standalone: `npm run contrast-check`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface ContrastFailure {
  selector: string
  color: string
  colorToken: string
  background: string
  backgroundToken: string
  ratio: number
  required: number
  fontSize: number
  large: boolean
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Flattens @media blocks in place (deletes only the wrapper, keeps inner
// rules at top level) via brace-depth tracking — this file has no other
// nesting, so this is sufficient without a full CSS parser.
function unwrapMediaBlocks(css: string): string {
  let out = css
  let mediaIdx = out.indexOf('@media')
  while (mediaIdx !== -1) {
    const openBrace = out.indexOf('{', mediaIdx)
    if (openBrace === -1) break
    let depth = 1
    let i = openBrace + 1
    while (i < out.length && depth > 0) {
      if (out[i] === '{') depth++
      else if (out[i] === '}') depth--
      i++
    }
    const closeBrace = i - 1
    const inner = out.slice(openBrace + 1, closeBrace)
    out = out.slice(0, mediaIdx) + inner + out.slice(closeBrace + 1)
    mediaIdx = out.indexOf('@media')
  }
  return out
}

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/)
  if (!rootMatch) return tokens
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rootMatch[1])) !== null) {
    tokens.set(m[1], m[2])
  }
  return tokens
}

function expandHex(hex: string): string {
  if (hex.length === 4) {
    return '#' + [...hex.slice(1)].map((c) => c + c).join('')
  }
  return hex
}

/** Resolves a CSS color value (hex literal or var(--token)) to a 6-digit hex, or null if unresolvable. */
function resolveColor(raw: string, tokens: Map<string, string>): string | null {
  const value = raw.trim()
  const varMatch = value.match(/^var\(\s*--([\w-]+)\s*(?:,\s*(.+))?\)$/)
  if (varMatch) {
    const fromToken = tokens.get(varMatch[1])
    if (fromToken) return expandHex(fromToken).toLowerCase()
    if (varMatch[2]) return resolveColor(varMatch[2], tokens)
    return null
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return expandHex(value).toLowerCase()
  return null // rgba()/gradients/keyword colors — skipped, not failed
}

interface RuleDecl {
  color: string | null
  background: string | null
  fontSize: number | null
  fontWeight: number | null
}

function parseRules(css: string): Map<string, RuleDecl> {
  const bySelector = new Map<string, RuleDecl>()
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRe.exec(css)) !== null) {
    const selectorList = m[1].trim()
    const body = m[2]
    if (!selectorList || selectorList.startsWith('@') || selectorList.startsWith(':root')) continue

    const colorMatch = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)
    const bgMatch = body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/)
    const sizeMatch = body.match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)(px|rem|em)/)
    const weightMatch = body.match(/(?:^|;)\s*font-weight\s*:\s*(\d+|bold)/)

    const decl: RuleDecl = {
      color: colorMatch ? colorMatch[1].trim() : null,
      background: bgMatch ? bgMatch[1].trim() : null,
      fontSize: sizeMatch ? parseFloat(sizeMatch[1]) * (sizeMatch[2] === 'px' ? 1 : 16) : null,
      fontWeight: weightMatch ? (weightMatch[1] === 'bold' ? 700 : parseInt(weightMatch[1], 10)) : null
    }

    for (const selector of selectorList.split(',').map((s) => s.trim())) {
      if (!selector) continue
      const existing = bySelector.get(selector)
      // Later rule wins per declaration (approximates cascade for this
      // codebase's flat, non-conflicting-specificity selector style).
      bySelector.set(selector, {
        color: decl.color ?? existing?.color ?? null,
        background: decl.background ?? existing?.background ?? null,
        fontSize: decl.fontSize ?? existing?.fontSize ?? null,
        fontWeight: decl.fontWeight ?? existing?.fontWeight ?? null
      })
    }
  }
  return bySelector
}

/** Walks selector segments outward (".a .b.c" -> ".a") to find an ancestor's background. */
function resolveBackground(selector: string, rules: Map<string, RuleDecl>, tokens: Map<string, string>): { hex: string; token: string } {
  const segments = selector.split(/\s+/)
  for (let end = segments.length; end >= 1; end--) {
    const prefix = segments.slice(0, end).join(' ')
    const decl = rules.get(prefix)
    if (decl?.background) {
      const resolved = resolveColor(decl.background, tokens)
      if (resolved) return { hex: resolved, token: decl.background }
    }
  }
  const pageBg = tokens.get('bg')
  return { hex: pageBg ? expandHex(pageBg).toLowerCase() : '#ffffff', token: 'var(--bg) [page default]' }
}

function relativeLuminance(hex: string): number {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05)
}

export function checkContrast(cssText: string): ContrastFailure[] {
  const flat = unwrapMediaBlocks(stripComments(cssText))
  const tokens = parseTokens(flat)
  const rules = parseRules(flat)
  const failures: ContrastFailure[] = []

  for (const [selector, decl] of rules) {
    if (!decl.color) continue
    const colorHex = resolveColor(decl.color, tokens)
    if (!colorHex) continue

    const { hex: bgHex, token: bgToken } = resolveBackground(selector, rules, tokens)
    const ratio = contrastRatio(colorHex, bgHex)

    const fontSize = decl.fontSize ?? 17 // body default, style.css:39
    const bold = (decl.fontWeight ?? 400) >= 700
    const large = fontSize >= 24 || (fontSize >= 18.66 && bold)
    const required = large ? 3 : 4.5

    if (ratio < required) {
      failures.push({
        selector, color: colorHex, colorToken: decl.color, background: bgHex, backgroundToken: bgToken,
        ratio: Math.round(ratio * 100) / 100, required, fontSize, large
      })
    }
  }
  return failures
}

// CLI entry point — only runs when invoked directly (`npm run contrast-check`),
// not when imported by the test.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const cssPath = path.resolve(import.meta.dirname, '../src/ui/style.css')
  const css = readFileSync(cssPath, 'utf-8')
  const failures = checkContrast(css)
  if (failures.length === 0) {
    console.log('✓ No contrast failures found.')
  } else {
    console.log(`✗ ${failures.length} contrast failure(s):\n`)
    for (const f of failures) {
      console.log(`  ${f.selector}`)
      console.log(`    ${f.colorToken} (${f.color}) on ${f.backgroundToken} (${f.background})`)
      console.log(`    ratio ${f.ratio}:1, needs ${f.required}:1 ${f.large ? '(large text)' : ''}\n`)
    }
    process.exitCode = 1
  }
}
