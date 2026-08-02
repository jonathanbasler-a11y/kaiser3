// Minimal DOM helpers — no framework, per CLAUDE.md ("no game engine"). Building
// blocks small enough that app.ts stays readable without one.

type Child = Node | string | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value as string
    else (node as unknown as Record<string, unknown>)[key] = value
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}

// Tap-to-toggle info bubble — the touch-friendly alternative to a hover title
// tooltip, since this UI is mobile-first and most players have no hover at
// all (the bug reports this exists to answer were filed from an iPhone).
// Only one bubble is open at a time; tapping anywhere else closes it.
let closeOpenTooltip: (() => void) | null = null

export function tooltip(text: string): HTMLElement {
  const bubble = el('div', { class: 'tooltip-bubble hidden' }, text)
  const dot = el('button', {
    type: 'button',
    class: 'tooltip-dot',
    textContent: 'ⓘ',
    ariaLabel: 'More info'
  } as never)

  const close = () => bubble.classList.add('hidden')

  dot.addEventListener('click', (e) => {
    e.stopPropagation()
    const wasHidden = bubble.classList.contains('hidden')
    closeOpenTooltip?.()
    if (wasHidden) {
      bubble.classList.remove('hidden')
      closeOpenTooltip = close
    } else {
      closeOpenTooltip = null
    }
  })

  return el('span', { class: 'tooltip-wrap' }, dot, bubble)
}

// Module-level listener (registered once) so every tooltip closes on an
// outside tap without each instance adding its own document listener.
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => { closeOpenTooltip?.(); closeOpenTooltip = null })
}

// Groups label text with its optional info dot so the pair stays adjacent
// inside a `.field-label` — that row is `justify-content: space-between`
// (label vs. value), and a bare 3-child layout would space the dot away
// from its label instead of hugging it.
function labelText(text: string, tooltipText?: string): HTMLElement {
  return el('span', { class: 'field-label-text' }, text, tooltipText ? tooltip(tooltipText) : null)
}

// A +/- stepper: the touch-friendly replacement for typing a number. Steps by
// `step`, long-press-free (repeated taps), clamped to [min, max].
export function stepper(opts: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (value: number) => void
  tooltip?: string
}): HTMLElement {
  const format = opts.format ?? ((v: number) => String(v))
  const valueEl = el('span', { class: 'stepper-value' }, format(opts.value))

  const clampSet = (v: number) => {
    const clamped = Math.min(opts.max, Math.max(opts.min, v))
    opts.onChange(clamped)
    valueEl.textContent = format(clamped)
  }

  let current = opts.value
  const minus = el('button', {
    type: 'button',
    textContent: '−',
    onclick: () => { current = Math.max(opts.min, current - opts.step); clampSet(current) }
  })
  const plus = el('button', {
    type: 'button',
    textContent: '+',
    onclick: () => { current = Math.min(opts.max, current + opts.step); clampSet(current) }
  })

  return el('div', { class: 'field' },
    el('div', { class: 'field-label' }, labelText(opts.label, opts.tooltip)),
    el('div', { class: 'stepper' }, minus, valueEl, plus)
  )
}

// A labelled range slider, for 0-100 rates where a stepper would need too many taps.
export function sliderField(opts: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
  tooltip?: string
}): HTMLElement {
  const valueLabel = el('span', { class: 'field-value' }, `${opts.value}${opts.suffix ?? ''}`)
  const input = el('input', {
    type: 'range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step ?? 1),
    value: String(opts.value)
  })
  input.addEventListener('input', () => {
    const v = Number(input.value)
    valueLabel.textContent = `${v}${opts.suffix ?? ''}`
    opts.onChange(v)
  })
  return el('div', { class: 'field' },
    el('div', { class: 'field-label' }, labelText(opts.label, opts.tooltip), valueLabel),
    input
  )
}

// `title` is a heading shown above the segmented control when a tooltip is
// wanted — segmented() has no other place to anchor one (unlike stepper/
// sliderField, which already render a .field-label row).
export function segmented<T extends string>(opts: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  title?: string
  tooltip?: string
}): HTMLElement {
  const container = el('div', { class: 'segmented' })
  const buttons = opts.options.map((option) => {
    const btn = el('button', {
      type: 'button',
      textContent: option.label,
      className: option.value === opts.value ? 'active' : ''
    })
    btn.addEventListener('click', () => {
      opts.onChange(option.value)
      for (const b of Array.from(container.children)) b.classList.remove('active')
      btn.classList.add('active')
    })
    return btn
  })
  container.append(...buttons)
  if (!opts.title) return container
  return el('div', { class: 'field' },
    el('div', { class: 'field-label' }, labelText(opts.title, opts.tooltip)),
    container
  )
}

export function statTile(label: string, value: string, tone?: 'good' | 'bad'): HTMLElement {
  return el('div', { class: 'stat' },
    el('div', { class: 'label' }, label),
    el('div', { class: `value${tone ? ' ' + tone : ''}` }, value)
  )
}
