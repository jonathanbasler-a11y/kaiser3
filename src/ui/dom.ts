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
    el('div', { class: 'field-label' }, opts.label),
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
    el('div', { class: 'field-label' }, opts.label, valueLabel),
    input
  )
}

export function segmented<T extends string>(opts: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
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
  return container
}

export function statTile(label: string, value: string, tone?: 'good' | 'bad'): HTMLElement {
  return el('div', { class: 'stat' },
    el('div', { class: 'label' }, label),
    el('div', { class: `value${tone ? ' ' + tone : ''}` }, value)
  )
}
