// Renderer entry: toolbar, editor, live A4 preview. Device access only through `platform`.
import './preview.css'
import './app.css'
import {
  countUncertain,
  DEFAULT_THEME,
  formatNote,
  layout,
  parseKey,
  readHeaderLine,
  setHeaderLine,
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
  preview.innerHTML = renderPages(layout(doc, theme.metrics), theme)
  syncHeaderFields(doc)
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

const editor = createEditor($('editor'), () => {
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

function load(text: string, newFile: FileRef | null): void {
  file = newFile
  savedText = text
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
  exportPdf
}

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
  const html = await buildPrintDocument(layout(doc, theme.metrics), theme, title)
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
