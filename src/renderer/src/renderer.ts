// Renderer entry: toolbar, editor, live A4 preview. Device access only through `platform`.
import './preview.css'
import './app.css'
import {
  countUncertain,
  decodeText,
  ENCODING_LABELS,
  IMPORT_FORMAT_LABELS,
  importText,
  type TextEncodingName,
  DEFAULT_THEME,
  formatNote,
  layout,
  parseKey,
  readHeaderLine,
  setHeaderLine,
  intervalBetween,
  isUnison,
  keyBySemitones,
  keyText,
  semitonesBetween,
  transposeDocument,
  transpositionEdits,
  type Key,
  type LineRange,
  type ChordDocument
} from '../../core'
import { platform, type FileRef } from '../../platform'
import { createEditor } from './editor'
import { installFonts } from './fonts'
import { buildPrintDocument, renderPages } from './preview'

installFonts()

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const app = $<HTMLElement>('app')
const preview = $<HTMLElement>('preview')
const pagesHost = $<HTMLElement>('pages-host')
const status = $<HTMLElement>('status')
const titleField = $<HTMLInputElement>('field-title')
const keyField = $<HTMLInputElement>('field-key')
const keyReading = $<HTMLElement>('field-key-reading')

const UNTITLED = '제목 없음'
let file: FileRef | null = null
let savedText = ''

const isDirty = (): boolean => editor.getText() !== savedText
const documentName = (): string => file?.name ?? UNTITLED

function reportState(): void {
  platform.setDocumentState({ name: documentName(), dirty: isDirty() })
}

// --- preview -----------------------------------------------------------------

let renderTimer: number | undefined

function renderPreview(): void {
  const { document: doc, diagnostics } = editor.parsed()
  const theme = DEFAULT_THEME
  pagesHost.innerHTML = renderPages(layout(shownDocument(), theme.metrics), theme)
  syncHeaderFields(doc)
  showTransposition()
  fitPreview()
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  status.textContent = [errors && `오류 ${errors}`, warnings && `경고 ${warnings}`]
    .filter(Boolean)
    .join(' · ')
  status.classList.toggle('has-errors', errors > 0)
}

/** Scales the A4 pages down to the pane width (never up). */
function fitPreview(): void {
  const pages = preview.querySelector<HTMLElement>('.pages')
  if (!pages || preview.clientWidth === 0) return
  const pageWidthPx = (DEFAULT_THEME.metrics.pageWidth / 25.4) * 96
  const available = preview.clientWidth - 24
  pages.style.zoom = String(Math.min(1, available / pageWidthPx))
}
new ResizeObserver(fitPreview).observe(preview)

const editor = createEditor($('editor'), (changes) => {
  // Keep a transposed line range on the same lines while text around it changes.
  if (transposeScope) {
    transposeScope = changes
      ? { from: changes.mapPos(transposeScope.from, -1), to: changes.mapPos(transposeScope.to, 1) }
      : null
  }
  reportState()
  window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(renderPreview, 80)
})

// --- narrow screens: editor / preview tabs -------------------------------------

function showView(view: 'editor' | 'preview'): void {
  app.dataset.view = view
  document.querySelectorAll<HTMLButtonElement>('.view-tabs [data-view]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view))
  })
  if (view === 'editor') editor.view.focus()
}

document.querySelectorAll<HTMLButtonElement>('.view-tabs [data-view]').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.view as 'editor' | 'preview'))
})

// --- file commands -----------------------------------------------------------

/** Opens a document. An imported result opens unsaved, with its original kept for review. */
function load(text: string, newFile: FileRef | null, imported: ImportSource | null = null): void {
  transposeTo = null
  transposeScope = null
  transposeField.value = ''
  file = newFile
  savedText = imported ? '' : text
  showImportSource(imported)
  editor.setText(text)
  reportState()
  showView('editor')
}

async function saveWith(write: typeof platform.saveFile): Promise<boolean> {
  const text = editor.getText()
  const saved = await write(file, text)
  if (!saved) return false
  file = saved
  savedText = text
  reportState()
  return true
}

const save = (): Promise<boolean> => saveWith(platform.saveFile)
const saveAs = (): Promise<boolean> => saveWith(platform.saveFileAs)

/** true when it is fine to replace or close the current document. */
async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true
  const choice = await platform.confirmDiscard(documentName())
  if (choice === 'save') return save()
  return choice === 'discard'
}

const commands: Record<string, () => Promise<unknown>> = {
  new: async () => {
    if (await confirmDiscard()) load('', null)
  },
  open: async () => {
    if (!(await confirmDiscard())) return
    const opened = await platform.openFile()
    if (opened) load(opened.text, opened.file)
  },
  save,
  saveAs,
  exportPdf,
  import: async () => {
    importText_.value = ''
    importDialog.showModal()
  }
}

// --- import: text from other formats → a new document; the original stays viewable -------

interface ImportSource {
  name: string
  text: string
}

const importDialog = $<HTMLDialogElement>('import-dialog')
const importText_ = $<HTMLTextAreaElement>('import-text')
const previewSwitch = $<HTMLElement>('preview-switch')
const originalView = $<HTMLElement>('original')
const originalInfo = $<HTMLElement>('original-info')

/** Converts the text and opens the result, after asking about unsaved changes. */
async function runImport(
  text: string,
  name: string,
  encoding: TextEncodingName | null
): Promise<void> {
  const result = importText(text, name)
  if (result.format === 'unknown') {
    window.alert(
      '코드 악보로 보이는 줄을 찾지 못했어요. 코드 줄, 마디선(|), ChordPro 중 하나인지 확인해 주세요.'
    )
    return
  }
  importDialog.close()
  if (!(await confirmDiscard())) return
  load(result.text, null, { name, text })
  const details = [IMPORT_FORMAT_LABELS[result.format]]
  if (encoding) details.push(ENCODING_LABELS[encoding])
  details.push(result.uncertain ? `확인 필요(?) ${result.uncertain}곳` : '확인 필요 없음')
  originalInfo.textContent = `${name} · ${details.join(' · ')}`
  status.textContent = `가져옴: ${details.join(' · ')}`
}

$<HTMLButtonElement>('import-paste').addEventListener('click', () => {
  const text = importText_.value
  if (text.trim()) void runImport(text, '붙여넣은 글', null)
})

$<HTMLButtonElement>('import-from-file').addEventListener('click', async () => {
  const picked = await platform.importFile()
  if (!picked) return
  const { text, encoding } = decodeText(picked.data)
  await runImport(text, picked.file.name, encoding)
})

function showImportSource(source: ImportSource | null): void {
  previewSwitch.hidden = !source
  originalView.textContent = source?.text ?? ''
  showOriginal(false)
}

function showOriginal(on: boolean): void {
  originalView.hidden = !on
  pagesHost.hidden = on
  previewSwitch.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) => {
    b.setAttribute('aria-pressed', String((b.dataset.show === 'original') === on))
  })
}

previewSwitch.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) => {
  b.addEventListener('click', () => showOriginal(b.dataset.show === 'original'))
})

/** PDF of the current pages; warns first about errors and `?` marks. */
async function exportPdf(): Promise<void> {
  const { document: doc, diagnostics } = editor.parsed()
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const uncertain = countUncertain(doc)
  if (errors + uncertain > 0) {
    const problems = [errors && `오류 ${errors}개`, uncertain && `확인 필요(?) ${uncertain}개`]
      .filter(Boolean)
      .join(', ')
    if (!window.confirm(`${problems}가 있어요. 그래도 PDF로 내보낼까요?`)) return
  }
  const title = doc.title || documentName().replace(/\.chord$/i, '')
  const theme = DEFAULT_THEME
  const html = await buildPrintDocument(layout(shownDocument(), theme.metrics), theme, title)
  const saved = await platform.exportPdf(html, `${title}.pdf`)
  if (saved) status.textContent = `PDF 저장: ${saved.name}`
}

// --- header fields (title / key / theme) mirror the header lines of the file ------------

/** Shows the header values as typed; a field being typed in is left alone. */
function syncHeaderFields(doc: ChordDocument): void {
  if (document.activeElement !== titleField) titleField.value = doc.title ?? ''
  const typedKey = readHeaderLine(editor.getText(), 'key') ?? ''
  if (document.activeElement !== keyField) keyField.value = typedKey
  showKeyReading(typedKey)
}

/** "C 단조" beside the key field, so a loosely typed key (`c-`) can be checked at a glance. */
function showKeyReading(typed: string): void {
  const key = typed ? parseKey(typed) : null
  keyReading.textContent = key
    ? `${formatNote(key.tonic)} ${key.minor ? '단조' : '장조'}`
    : typed
      ? '알 수 없는 키'
      : ''
  keyReading.classList.toggle('bad', Boolean(typed) && !key)
}

titleField.addEventListener('input', () => {
  editor.change(setHeaderLine(editor.getText(), 'title', titleField.value.trim() || null))
})
keyField.addEventListener('input', () => {
  editor.change(setHeaderLine(editor.getText(), 'key', keyField.value.trim() || null))
})
for (const field of [titleField, keyField]) {
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') editor.view.focus()
  })
}

// --- transposition: the sheet in another key; the text changes only on "원본에 적용" ---------

const transposeField = $<HTMLInputElement>('transpose-key')
const transposeReading = $<HTMLElement>('transpose-reading')
const transposeApply = $<HTMLButtonElement>('transpose-apply')
const transposeCancel = $<HTMLButtonElement>('transpose-cancel')

/** Target key, or null when the sheet shows the song as written. */
let transposeTo: Key | null = null
/** Document offsets of the selected lines it applies to; null = the whole song. */
let transposeScope: { from: number; to: number } | null = null

function scopeLines(): LineRange | null {
  if (!transposeScope) return null
  const doc = editor.view.state.doc
  return { from: doc.lineAt(transposeScope.from).number, to: doc.lineAt(transposeScope.to).number }
}

/** What the preview and PDF show: the song, transposed if a target key is set. */
function shownDocument(): ChordDocument {
  const { document: doc } = editor.parsed()
  if (!transposeTo || !doc.key) return doc
  return transposeDocument(doc, intervalBetween(doc.key, transposeTo), scopeLines())
}

function showTransposition(): void {
  const songKey = editor.parsed().document.key
  const active = transposeTo !== null
  transposeApply.hidden = transposeCancel.hidden = !active || !songKey
  if (!active) {
    transposeReading.textContent = ''
  } else if (!songKey) {
    transposeReading.textContent = '곡에 key:가 있어야 조옮김할 수 있어요'
  } else {
    const steps = semitonesBetween(songKey, transposeTo!)
    const lines = scopeLines()
    transposeReading.textContent =
      `${formatNote(songKey.tonic)} → ${formatNote(transposeTo!.tonic)} (${steps > 0 ? '+' : ''}${steps}) · ` +
      (lines ? `${lines.from}~${lines.to}줄만` : '전체')
  }
  transposeReading.classList.toggle('bad', active && !songKey)
  preview.classList.toggle('transposed', active && Boolean(songKey))
}

/** Starts or changes the transposition. A selection in the editor, if any, becomes its range. */
function setTransposition(to: Key | null): void {
  const songKey = editor.parsed().document.key
  if (to && songKey && isUnison(intervalBetween(songKey, to)) && !transposeScope) to = null
  if (to && !transposeTo) {
    const { from, to: end } = editor.selection()
    transposeScope = from === end ? null : { from, to: end }
  }
  transposeTo = to
  if (!to) transposeScope = null
  renderPreview()
}

transposeField.addEventListener('input', () => {
  const typed = transposeField.value.trim()
  const key = typed ? parseKey(typed) : null
  if (typed && !key) {
    transposeReading.textContent = '알 수 없는 키'
    transposeReading.classList.add('bad')
    return
  }
  setTransposition(key)
})

function step(semitones: number): void {
  const songKey = editor.parsed().document.key
  const base = transposeTo ?? songKey
  if (!base) {
    transposeReading.textContent = '곡에 key:가 있어야 조옮김할 수 있어요'
    transposeReading.classList.add('bad')
    return
  }
  const next = keyBySemitones(base, semitones)
  transposeField.value = keyText(next)
  setTransposition(next)
  if (!transposeTo) transposeField.value = ''
}
$<HTMLButtonElement>('transpose-down').addEventListener('click', () => step(-1))
$<HTMLButtonElement>('transpose-up').addEventListener('click', () => step(1))

function cancelTransposition(): void {
  transposeField.value = ''
  setTransposition(null)
}
transposeCancel.addEventListener('click', cancelTransposition)

/** Writes the transposition into the text (roots, basses and key lines), then shows it as written. */
transposeApply.addEventListener('click', () => {
  const { document: doc } = editor.parsed()
  if (!transposeTo || !doc.key) return
  const edits = transpositionEdits(
    editor.getText(),
    doc,
    intervalBetween(doc.key, transposeTo),
    scopeLines()
  )
  cancelTransposition()
  editor.change(edits)
})

// --- print preview: shown beside the editor on wide screens, can be hidden ---------------

const previewToggle = $<HTMLButtonElement>('toggle-preview')
const PREVIEW_KEY = 'chordash.previewHidden'

function setPreviewHidden(hidden: boolean): void {
  app.classList.toggle('preview-hidden', hidden)
  previewToggle.setAttribute('aria-pressed', String(!hidden))
  try {
    localStorage.setItem(PREVIEW_KEY, hidden ? '1' : '0')
  } catch {
    // Remembering the choice is only a convenience.
  }
}

previewToggle.addEventListener('click', () => {
  setPreviewHidden(!app.classList.contains('preview-hidden'))
})
try {
  setPreviewHidden(localStorage.getItem(PREVIEW_KEY) === '1')
} catch {
  setPreviewHidden(false)
}

/** Runs a toolbar command; failures are shown in the status area instead of disappearing. */
function run(command: string): void {
  commands[command]().catch((error: unknown) => {
    console.error(error)
    status.textContent = `실패: ${error instanceof Error ? error.message : String(error)}`
    status.classList.add('has-errors')
  })
}

document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
  button.addEventListener('click', () => run(button.dataset.command!))
})

// Keyboard shortcuts (desktop, or Android with a hardware keyboard).
const SHORTCUTS: Record<string, string> = {
  n: 'new',
  o: 'open',
  s: 'save',
  'shift+s': 'saveAs',
  p: 'exportPdf'
}
window.addEventListener(
  'keydown',
  (e) => {
    if (!e.ctrlKey || e.altKey) return
    const command = SHORTCUTS[(e.shiftKey ? 'shift+' : '') + e.key.toLowerCase()]
    if (!command) return
    e.preventDefault()
    run(command)
  },
  { capture: true }
)

platform.onBeforeClose(confirmDiscard)

$<HTMLInputElement>('hints').addEventListener('change', (e) => {
  editor.setHints((e.target as HTMLInputElement).checked)
})

load('', null)
renderPreview()
