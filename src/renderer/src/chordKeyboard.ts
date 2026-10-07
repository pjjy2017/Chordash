// Phone chord keyboard (ROADMAP 1.2): on touch screens, typing into the editor brings up the app's
// own keys for chords instead of the phone keyboard, which hides most of these symbols.
// Lines of free text — lyrics (_), text above (^), title/key, sections, memos, comments — get the
// phone keyboard back by themselves; "가" switches to it by hand for the current line.

import { deleteCharBackward } from '@codemirror/commands'
import { diatonicChords, type Key } from '../../core'
import type { ChordEditor } from './editor'

const ENABLED = 'chordash.chordKeyboard'

/** Lines (or the rest of a line after ` _` / ` ^ `) where words are typed, not chords. */
const TEXT_LINE = /^\s*(?:_|\^|l:|lyric:|title:|key:|\[|\{|\/\/|")/i

/** Key rows. A key is [label, text to type] or a named action. */
type KeyDef = [label: string, text: string] | { action: Action; label: string; wide?: number }
type Action = 'text' | 'backspace' | 'space' | 'bar' | 'enter' | 'lyrics'

const ROWS: KeyDef[][] = [
  ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((n): KeyDef => [n, n]),
  [
    ['♭', 'b'],
    ['♯', '#'],
    ['m(-)', '-'],
    ['maj(^)', '^'],
    ['ø(%)', '%'],
    ['dim(o)', 'o'],
    ['aug(+)', '+']
  ],
  [
    ['7', '7'],
    ['9', '9'],
    ['6', '6'],
    ['11', '11'],
    ['13', '13'],
    ['sus(s)', 's'],
    ['/', '/']
  ],
  [
    ["브레스 '", "'"],
    ['악센트 *', '*'],
    ['(', '('],
    [')', ')'],
    [':', ':'],
    ['N.C.', 'nc'],
    { action: 'lyrics', label: '가사 _' }
  ],
  [
    { action: 'text', label: '가' },
    { action: 'backspace', label: '⌫' },
    { action: 'space', label: '띄움', wide: 1.4 },
    { action: 'bar', label: ', 마디', wide: 2.2 },
    ['. 끝', '.'],
    { action: 'enter', label: '⏎' }
  ]
]

export function installChordKeyboard(editor: ChordEditor, songKey: () => Key | null): void {
  const touch = window.matchMedia('(pointer: coarse)')
  const app = document.getElementById('app')!
  const toggle = document.getElementById('chord-keyboard-toggle') as HTMLInputElement
  const panel = document.createElement('div')
  panel.className = 'chord-keyboard'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', '코드 키보드')
  panel.hidden = true
  const suggestions = document.createElement('div')
  suggestions.className = 'ck-suggestions'
  panel.append(suggestions)
  document.querySelector('.view-tabs')!.before(panel)

  let enabled = true
  try {
    enabled = localStorage.getItem(ENABLED) !== 'off'
  } catch {
    // Default: on.
  }
  toggle.checked = enabled
  /** Line where "가" asked for the phone keyboard; cleared when the cursor leaves it. */
  let textLine: number | null = null

  const { view } = editor
  const type = (text: string): void => {
    view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true })
  }

  /** Re-focusing makes the phone show or hide its keyboard for the new input mode. */
  function refocus(): void {
    view.contentDOM.blur()
    view.focus()
  }

  function act(def: KeyDef): void {
    if (Array.isArray(def)) return type(def[1])
    const line = view.state.doc.lineAt(view.state.selection.main.head)
    switch (def.action) {
      case 'backspace':
        deleteCharBackward(view)
        return
      case 'space':
        return type(' ')
      case 'bar':
        return type(', ')
      case 'enter':
        return type('\n')
      case 'lyrics':
        type(line.text.trim() ? ' _ ' : '_ ')
        textLine = line.number
        return update(true)
      case 'text':
        textLine = line.number
        return update(true)
    }
  }

  for (const row of ROWS) {
    const rowEl = document.createElement('div')
    rowEl.className = 'ck-row'
    for (const def of row) {
      const key = document.createElement('button')
      key.type = 'button'
      key.textContent = Array.isArray(def) ? def[0] : def.label
      if (!Array.isArray(def)) {
        key.classList.add('ck-' + def.action)
        if (def.wide) key.style.flexGrow = String(def.wide)
      }
      // Keep the editor focused: act on pointer down and stop the button taking focus.
      key.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        act(def)
        if (!Array.isArray(def) && def.action === 'backspace') {
          // Hold to keep deleting: after a short pause, one character every 70 ms.
          let repeat = 0
          const start = window.setTimeout(() => {
            repeat = window.setInterval(() => deleteCharBackward(view), 70)
          }, 400)
          const stop = (): void => {
            window.clearTimeout(start)
            window.clearInterval(repeat)
          }
          for (const type of ['pointerup', 'pointerleave', 'pointercancel'])
            key.addEventListener(type, stop, { once: true })
        }
      })
      key.addEventListener('click', (e) => e.preventDefault())
      rowEl.append(key)
    }
    panel.append(rowEl)
  }

  let shownKey = ''
  function showSuggestions(): void {
    const key = songKey()
    const id = key ? JSON.stringify(key) : ''
    if (id === shownKey) return
    shownKey = id
    suggestions.replaceChildren(
      ...(key ? diatonicChords(key) : []).map((s) => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.textContent = s.label
        chip.addEventListener('pointerdown', (e) => {
          e.preventDefault()
          type(s.input)
        })
        return chip
      })
    )
    suggestions.hidden = !key
  }

  /**
   * Chord keys for chord lines, the phone keyboard for text; nothing without focus.
   * Out of focus the editor stays in "none", so a tap never pops the phone keyboard up first;
   * when the tapped line wants words, the phone keyboard is asked for after the fact.
   */
  function update(force = false): void {
    const active = enabled && touch.matches
    const focused = view.hasFocus
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    if (textLine !== null && textLine !== line.number) textLine = null
    const beforeCursor = line.text.slice(0, head - line.from)
    const wordsHere =
      TEXT_LINE.test(line.text) || /(?:^|\s)[_^]\s/.test(beforeCursor) || textLine !== null
    const mode = !active ? 'text' : !focused ? 'none' : wordsHere ? 'text' : 'none'
    const changed = mode !== currentMode
    currentMode = mode
    editor.setInputMode(mode)
    if (focused && (changed || force)) refocus()
    const open = active && mode === 'none' && focused
    panel.hidden = !open
    app.classList.toggle('chord-keys-open', open)
    if (open) showSuggestions()
  }
  let currentMode: 'none' | 'text' = 'text'

  // Never change the editor from inside its own update: wait for it to finish.
  const later = (): void => void Promise.resolve().then(() => update())
  editor.onUpdate(later)
  touch.addEventListener('change', () => update())
  update()
  toggle.addEventListener('change', () => {
    enabled = toggle.checked
    try {
      localStorage.setItem(ENABLED, enabled ? 'on' : 'off')
    } catch {
      // Only for this session.
    }
    update(true)
  })
  // Leaving the editor (e.g. tapping the title field) closes the keys.
  view.contentDOM.addEventListener('blur', () => window.setTimeout(() => update(), 0))
}
