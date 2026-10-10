// Print settings panel (1.6): text size, row spacing, 8-bar rows, fit on one page, booklet.
// Kept on this device for every song; the sheet and the PDF follow at once.

import { DEFAULT_PRINT, MAX_SCALE, MIN_SCALE, type PrintOptions } from '../../core'

const KEY = 'chordash.print'

let options: PrintOptions = { ...DEFAULT_PRINT }
try {
  options = { ...DEFAULT_PRINT, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as object) }
} catch {
  // As designed.
}

export const printOptions = (): PrintOptions => options

/** The open panel's refresh, so it follows the song as it is typed. */
let refreshPanel: (() => void) | null = null

/** Called after the sheet is drawn again. */
export function printSettingsChanged(): void {
  refreshPanel?.()
}

function save(next: PrintOptions): void {
  options = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // For this visit only.
  }
}

const SPACINGS: [number, string][] = [
  [0.85, '좁게'],
  [1, '보통'],
  [1.25, '넓게']
]

/**
 * Opens the panel next to the sheet. `changed` redraws the sheet; `report` says how it came out
 * (e.g. "2쪽", "한 장에 맞춰 72%").
 */
export function openPrintSettings(changed: () => void, report: () => string): void {
  const dialog = document.createElement('dialog')
  dialog.className = 'import-dialog print-dialog'
  const heading = document.createElement('h2')
  heading.textContent = '출력 설정'
  const body = document.createElement('div')
  body.className = 'print-body'
  const status = document.createElement('p')
  status.className = 'print-status'

  const row = (label: string, ...controls: HTMLElement[]): HTMLElement => {
    const div = document.createElement('div')
    div.className = 'print-row'
    const span = document.createElement('span')
    span.textContent = label
    div.append(span, ...controls)
    return div
  }
  const button = (text: string, title = ''): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    if (title) b.title = title
    return b
  }
  const check = (
    label: string,
    key: 'joinRows' | 'fitOnePage' | 'booklet',
    note: string
  ): HTMLElement => {
    const wrap = document.createElement('label')
    wrap.className = 'print-check'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.dataset.key = key
    const text = document.createElement('span')
    const strong = document.createElement('strong')
    strong.textContent = label
    const small = document.createElement('small')
    small.textContent = note
    text.append(strong, small)
    wrap.append(box, text)
    box.addEventListener('change', () => update({ [key]: box.checked }))
    return wrap
  }

  const size = document.createElement('output')
  size.className = 'print-size'
  const smaller = button('−', '작게')
  const bigger = button('+', '크게')
  smaller.addEventListener('click', () => update({ scale: step(-0.05) }))
  bigger.addEventListener('click', () => update({ scale: step(0.05) }))
  const step = (by: number): number =>
    Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, options.scale + by)) * 100) / 100

  const spacing = document.createElement('div')
  spacing.className = 'store-switch'
  for (const [value, label] of SPACINGS) {
    const b = button(label)
    b.dataset.value = String(value)
    b.addEventListener('click', () => update({ spacing: value }))
    spacing.append(b)
  }

  body.append(
    row('글자 크기', smaller, size, bigger),
    row('줄 간격', spacing),
    check('8마디씩 한 줄로', 'joinRows', '이어지는 두 줄을 한 줄에 (합쳐서 8마디 이하일 때)'),
    check('한 장에 맞추기', 'fitOnePage', '넘치는 곡은 한 쪽에 들어갈 때까지 작게'),
    check('책자 (가로, 두 쪽씩)', 'booklet', 'A4 가로 한 장에 1|2, 3|4쪽을 나란히'),
    status
  )

  const actions = document.createElement('div')
  actions.className = 'import-actions'
  const reset = button('기본값으로')
  reset.addEventListener('click', () => update({ ...DEFAULT_PRINT }))
  const spacer = document.createElement('span')
  spacer.className = 'spacer'
  const close = button('닫기')
  close.className = 'primary'
  close.addEventListener('click', () => dialog.close())
  actions.append(reset, spacer, close)

  function show(): void {
    size.textContent = `${Math.round(options.scale * 100)}%`
    smaller.disabled = options.scale <= MIN_SCALE
    bigger.disabled = options.scale >= MAX_SCALE
    spacing
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.value) === options.spacing))
      )
    body.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((box) => {
      box.checked = Boolean(options[box.dataset.key as keyof PrintOptions])
    })
    status.textContent = report()
  }

  function update(change: Partial<PrintOptions>): void {
    save({ ...options, ...change })
    changed()
    show()
  }

  dialog.append(heading, body, actions)
  dialog.addEventListener('close', () => {
    refreshPanel = null
    dialog.remove()
  })
  refreshPanel = show
  document.body.append(dialog)
  show()
  dialog.show()
}
