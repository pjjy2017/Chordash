// Renderer entry: toolbar, editor, live A4 preview. Device access only through `platform`.
import 'pretendard/dist/web/variable/pretendardvariable.css'
import './preview.css'
import './app.css'
import { DEFAULT_THEME, layout } from '../../core'
import { platform, type FileRef } from '../../platform'
import { createEditor } from './editor'
import { renderPages } from './preview'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const app = $<HTMLElement>('app')
const preview = $<HTMLElement>('preview')
const status = $<HTMLElement>('status')

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
  preview.innerHTML = renderPages(layout(doc, DEFAULT_THEME.metrics), DEFAULT_THEME)
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
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view))
  })
  if (view === 'editor') editor.view.focus()
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((tab) => {
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
  saveAs
}

document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
  button.addEventListener('click', () => commands[button.dataset.command!]())
})

// Keyboard shortcuts (desktop, or Android with a hardware keyboard).
const SHORTCUTS: Record<string, string> = { n: 'new', o: 'open', s: 'save', 'shift+s': 'saveAs' }
window.addEventListener(
  'keydown',
  (e) => {
    if (!e.ctrlKey || e.altKey) return
    const command = SHORTCUTS[(e.shiftKey ? 'shift+' : '') + e.key.toLowerCase()]
    if (!command) return
    e.preventDefault()
    commands[command]()
  },
  { capture: true }
)

platform.onBeforeClose(confirmDiscard)

$<HTMLInputElement>('hints').addEventListener('change', (e) => {
  editor.setHints((e.target as HTMLInputElement).checked)
})

load('', null)
renderPreview()
