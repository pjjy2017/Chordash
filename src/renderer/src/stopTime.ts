// Stop-time panel (1.8.1): the bar under the cursor as 16 boxes above the editor. Tap a box, then
// type x (a hit) or a chord name; the bar is written as `<1C7, 7x, 13F7>`.

import { stopSteps, stopTimeText, type Bar, type StopStep } from '../../core'
import type { ChordEditor } from './editor'

interface Found {
  bar: Bar
  /** Where the bar's line starts in the document. */
  lineFrom: number
}

export function initStopTime(
  editor: ChordEditor,
  toggle: HTMLButtonElement,
  panel: HTMLElement
): void {
  const where = panel.querySelector<HTMLElement>('.stop-where')!
  const grid = panel.querySelector<HTMLElement>('.stop-grid')!
  const chordInput = panel.querySelector<HTMLInputElement>('.stop-chord')!
  const cells: HTMLButtonElement[] = []
  for (let beat = 0; beat < 4; beat++) {
    const group = document.createElement('div')
    group.className = 'stop-beat'
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'stop-cell'
      cell.dataset.step = String(beat * 4 + i)
      cell.title = `${beat * 4 + i + 1}번 칸`
      group.append(cell)
      cells.push(cell)
    }
    grid.append(group)
  }

  let open = false
  let selected = 0
  let found: Found | null = null
  let steps: StopStep[] = Array(16).fill(null)

  function barAtCursor(): Found | null {
    const { from } = editor.selection()
    const line = editor.view.state.doc.lineAt(from)
    const column = from - line.from
    for (const section of editor.parsed().document.sections) {
      for (const item of section.items) {
        if (item.type !== 'bars' || item.line !== line.number) continue
        const bar = item.bars.find((b) => column >= b.from && column <= b.to)
        if (bar) return { bar, lineFrom: line.from }
      }
    }
    return null
  }

  function render(): void {
    found = barAtCursor()
    steps = found ? stopSteps(found.bar) : Array(16).fill(null)
    panel.classList.toggle('no-bar', !found)
    where.textContent = found
      ? found.bar.rhythm
        ? '스톱타임 마디'
        : '보통 마디 — 칸을 고치면 스톱타임이 돼요'
      : '악보 줄의 마디에 커서를 두세요'
    cells.forEach((cell, i) => {
      const s = steps[i]
      cell.textContent = s ?? ''
      cell.classList.toggle('hit', s === 'x')
      cell.classList.toggle('has-chord', s !== null && s !== 'x')
      cell.classList.toggle('selected', i === selected)
      cell.disabled = !found
    })
    const s = steps[selected]
    if (document.activeElement !== chordInput) chordInput.value = s && s !== 'x' ? s : ''
    chordInput.disabled = !found
  }

  /** Writes the bar again: its quoted texts, then the steps (or plain chords when `plain`). */
  function write(next: StopStep[], plain = false): void {
    if (!found) return
    const { bar, lineFrom } = found
    const texts = bar.texts.map((t) => `"${t}" `).join('')
    const body = plain
      ? next.filter((s): s is string => s !== null && s !== 'x').join(' ')
      : stopTimeText(next)
    const lead = bar.from > 0 ? ' ' : ''
    const text = `${lead}${texts}${body}`
    const from = lineFrom + bar.from
    editor.view.dispatch({
      changes: { from, to: lineFrom + bar.to, insert: text },
      // The cursor stays in this bar, so the panel keeps showing it.
      selection: { anchor: from + lead.length + texts.length + (plain ? 0 : 1) }
    })
    render()
  }

  function setStep(i: number, s: StopStep): void {
    const next = [...steps]
    next[i] = s
    write(next)
  }

  function select(i: number, focus = true): void {
    selected = Math.max(0, Math.min(15, i))
    render()
    if (focus) cells[selected].focus()
  }

  grid.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLButtonElement>('.stop-cell')
    if (!cell) return
    const i = Number(cell.dataset.step)
    // Tapping the chosen box again turns it on (x) or off.
    if (i === selected) setStep(i, steps[i] === null ? 'x' : null)
    else select(i)
  })

  grid.addEventListener('keydown', (e) => {
    if (!(e.target as HTMLElement).classList.contains('stop-cell') || e.ctrlKey || e.metaKey) return
    const key = e.key
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      select(selected + (key === 'ArrowLeft' ? -1 : 1))
    } else if (key === 'x' || key === 'X') {
      setStep(selected, 'x')
      select(selected + 1)
    } else if (key === '.' || key === 'Delete' || key === 'Backspace') {
      setStep(selected, null)
    } else if (/^[a-gA-G]$/.test(key)) {
      // A chord name: carry on typing it in the box below.
      chordInput.value = key.toUpperCase()
      chordInput.focus()
    } else return
    e.preventDefault()
  })

  chordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const name = chordInput.value.trim().replace(/[\s,<>]/g, '')
      chordInput.blur()
      setStep(selected, name || null)
      select(selected + 1)
    } else if (e.key === 'Escape') {
      chordInput.blur()
      select(selected)
    }
  })

  panel.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset.stop
    if (action === 'x') setStep(selected, 'x')
    else if (action === 'erase') setStep(selected, null)
    else if (action === 'plain') write(steps, true)
    else if (action === 'close') setOpen(false)
  })

  function setOpen(on: boolean): void {
    open = on
    panel.hidden = !on
    toggle.setAttribute('aria-pressed', String(on))
    if (on) render()
    else editor.view.focus()
  }

  toggle.addEventListener('click', () => setOpen(!open))
  // Follows the cursor, but not while a box or the chord field is being used.
  editor.onUpdate(() => {
    if (open && !panel.contains(document.activeElement)) render()
  })
}
