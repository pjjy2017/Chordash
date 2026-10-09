// Two small dialogs (1.5): "코드 바꾸기" — one chord replaced everywhere (or on the selected
// lines) — and "새 곡 틀" — a new song from this one or from a common form.

import {
  applyChange,
  chordReplaceEdits,
  type ChordReplace,
  readHeaderLine,
  setHeaderLine,
  SONG_TEMPLATES,
  structureOnly
} from '../../core'
import type { ChordEditor } from './editor'
import exampleSong from '../../../examples/Chordash.chord?raw'

function dialogShell(
  title: string,
  note: string
): {
  dialog: HTMLDialogElement
  body: HTMLElement
  actions: HTMLElement
} {
  const dialog = document.createElement('dialog')
  dialog.className = 'import-dialog song-dialog'
  const heading = document.createElement('h2')
  heading.textContent = title
  const p = document.createElement('p')
  p.textContent = note
  const body = document.createElement('div')
  const actions = document.createElement('div')
  actions.className = 'import-actions'
  dialog.append(heading, p, body, actions)
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  return { dialog, body, actions }
}

const button = (text: string, className = ''): HTMLButtonElement => {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  if (className) b.className = className
  return b
}

/** "코드 바꾸기": live count while typing, then one undoable change. */
export function openChordReplace(editor: ChordEditor): void {
  const { from, to } = editor.selection()
  const lines = editor.view.state.doc
  const range =
    from === to ? null : { from: lines.lineAt(from).number, to: lines.lineAt(to).number }
  const where = range ? `${range.from}~${range.to}줄에서` : '곡 전체에서'
  const { dialog, body, actions } = dialogShell(
    '코드 바꾸기',
    `${where} 바꿔요. Dm7과 D-7처럼 뜻이 같은 코드, 그 키의 도수 코드도 함께 찾아요.`
  )
  const field = (label: string): HTMLInputElement => {
    const wrap = document.createElement('label')
    wrap.className = 'replace-field'
    const span = document.createElement('span')
    span.textContent = label
    const input = document.createElement('input')
    input.spellcheck = false
    input.autocomplete = 'off'
    wrap.append(span, input)
    body.append(wrap)
    return input
  }
  const find = field('찾을 코드')
  const replacement = field('바꿀 코드')
  replacement.enterKeyHint = 'done'
  const status = document.createElement('p')
  status.className = 'replace-status'
  body.append(status)
  const spacer = document.createElement('span')
  spacer.className = 'spacer'
  const cancel = button('취소')
  const apply = button('모두 바꾸기', 'primary')
  actions.append(spacer, cancel, apply)

  const result = (): ChordReplace =>
    chordReplaceEdits(
      editor.getText(),
      editor.parsed().document,
      find.value,
      replacement.value,
      range
    )
  const say = (message: string, bad = false): void => {
    status.textContent = message
    status.classList.toggle('bad', bad)
  }
  const refresh = (): void => {
    apply.disabled = true
    const wanted = find.value.trim()
    if (!wanted) return say('')
    // How many there are, before the new chord is typed.
    const found = chordReplaceEdits(
      editor.getText(),
      editor.parsed().document,
      wanted,
      wanted,
      range
    )
    if (found.error) return say(found.error, true)
    if (!replacement.value.trim()) return say(`${found.changed}곳에 있어요.`)
    const r = result()
    if (r.error) return say(r.error, true)
    say(r.changed ? `${r.changed}곳을 바꿔요.` : '바꿀 코드가 없어요.')
    apply.disabled = r.changed === 0
  }
  const run = (): void => {
    const r = result()
    if (r.error || r.changed === 0) return
    editor.change(r.edits)
    dialog.close()
    editor.view.focus()
  }
  find.addEventListener('input', refresh)
  replacement.addEventListener('input', refresh)
  for (const input of [find, replacement])
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (input === find) replacement.focus()
      else run()
    })
  cancel.addEventListener('click', () => dialog.close())
  apply.addEventListener('click', run)
  // The chord at the cursor is the likely one to replace.
  const at = editor
    .parsed()
    .document.sections.flatMap((s) => s.items)
    .flatMap((item) => (item.type === 'bars' ? [item] : []))
    .find((item) => item.line === lines.lineAt(from).number)
  const offset = from - lines.lineAt(from).from
  const chord = at?.bars
    .flatMap((b) => b.chords)
    .find((c) => c.from <= offset && offset <= c.from + c.source.length)
  find.value = chord?.source ?? ''
  refresh()
  dialog.showModal()
  ;(find.value ? replacement : find).focus()
}

/** "새 곡 틀": picks a starting text; the caller opens it as a new, unsaved song. */
export function chooseTemplate(currentText: string): Promise<string | null> {
  const title = readHeaderLine(currentText, 'title')
  const choices: { label: string; note: string; text: () => string }[] = [
    {
      label: '이 곡 복제',
      note: '지금 곡을 그대로 새 곡으로',
      text: () =>
        title
          ? applyChange(currentText, setHeaderLine(currentText, 'title', `${title} (사본)`))
          : currentText
    },
    {
      label: '이 곡 구조만',
      note: '섹션·파트·반복·마디 수만 남기고 코드와 가사는 비움',
      text: () => structureOnly(currentText)
    },
    ...SONG_TEMPLATES.map((t) => ({
      label: t.label,
      note: t.id === 'aaba' ? '빈 마디 8개씩 A A B A' : '도수로 써서 키 칸만 바꾸면 그 키로',
      text: () => t.text
    })),
    { label: '예제 곡 (Chordash)', note: '모든 입력법이 들어 있는 곡', text: () => exampleSong }
  ]
  return new Promise((resolve) => {
    const { dialog, body, actions } = dialogShell(
      '새 곡 틀',
      '고른 틀로 저장 안 된 새 곡을 만들어요.'
    )
    let picked: string | null = null
    const list = document.createElement('div')
    list.className = 'template-list'
    for (const choice of choices) {
      const b = button('', 'template-choice')
      const strong = document.createElement('strong')
      strong.textContent = choice.label
      const small = document.createElement('small')
      small.textContent = choice.note
      b.append(strong, small)
      b.addEventListener('click', () => {
        picked = choice.text()
        dialog.close()
      })
      list.append(b)
    }
    body.append(list)
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    const cancel = button('취소')
    cancel.addEventListener('click', () => dialog.close())
    actions.append(spacer, cancel)
    dialog.addEventListener('close', () => resolve(picked))
    dialog.showModal()
  })
}
