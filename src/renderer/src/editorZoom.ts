// Editor text size (1.5): Ctrl + / Ctrl − / Ctrl 0 on a keyboard, two fingers on a touch screen.
// Only the typing area grows; the sheet keeps its own size. Remembered on this device.

const KEY = 'chordash.editorFont'
const DEFAULT = 16
const MIN = 12
const MAX = 30

let size = DEFAULT

function apply(next: number): void {
  size = Math.round(Math.min(MAX, Math.max(MIN, next)))
  document.documentElement.style.setProperty('--editor-font', `${size}px`)
  try {
    localStorage.setItem(KEY, String(size))
  } catch {
    // Only a convenience.
  }
}

/** Ctrl + / − / 0 (also Ctrl = and the number pad). true when the key was a zoom key. */
export function zoomKey(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') apply(size + 1)
  else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') apply(size - 1)
  else if (e.key === '0' || e.code === 'Numpad0') apply(DEFAULT)
  else return false
  return true
}

/** Restores the size and lets two fingers on the editor change it. */
export function installEditorZoom(editor: HTMLElement): void {
  let saved = DEFAULT
  try {
    saved = Number(localStorage.getItem(KEY)) || DEFAULT
  } catch {
    // Default size.
  }
  apply(saved)

  let start: { distance: number; size: number } | null = null
  const distance = (touches: TouchList): number =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  editor.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) start = { distance: distance(e.touches), size }
    },
    { passive: true }
  )
  editor.addEventListener(
    'touchmove',
    (e) => {
      if (!start || e.touches.length !== 2) return
      e.preventDefault()
      apply(start.size * (distance(e.touches) / start.distance))
    },
    { passive: false }
  )
  editor.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) start = null
  })
}
