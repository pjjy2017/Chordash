// Renderer entry: toolbar, editor, live A4 preview. Device access only through `platform`.
import './preview.css'
import './app.css'
import {
  cleanRecognizedText,
  countUncertain,
  spellingEdits,
  type ChordSpelling,
  MAX_RECOGNIZE_PAGES,
  RECOGNIZE_SYSTEM_PROMPT,
  recognizeErrorMessage,
  recognizeImagesPrompt,
  recognizeTextPrompt,
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
  type ChordDocument,
  APP_VERSION,
  DONATE_URL
} from '../../core'
import { platform, type FileRef } from '../../platform'
import { chartPages, type ChartPage } from './chartPages'
import { createEditor } from './editor'
import { installFonts } from './fonts'
import { openHelp } from './help'
import { installIcons } from './icons'
import { buildPrintDocument, renderPages } from './preview'
import { modelName, openSettings, recognizeModel } from './settings'
import { openSetlist } from './setlist'

installFonts()
installIcons()

// Parts the platform cannot do (web version: AI import, settings) are not shown.
for (const [feature, on] of Object.entries(platform.features)) {
  document
    .querySelectorAll<HTMLElement>(`[data-needs="${feature}"]`)
    .forEach((e) => (e.hidden = !on))
}

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

const docName = $<HTMLElement>('doc-name')

function reportState(): void {
  const dirty = isDirty()
  platform.setDocumentState({ name: documentName(), dirty })
  docName.textContent = documentName().replace(/.chord$/i, '')
  docName.classList.toggle('dirty', dirty)
  docName.title = dirty ? '저장하지 않은 변경 있음' : documentName()
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
  },
  settings: openSettings,
  help: openHelp,
  about: openAbout,
  setlist: () => openSetlist(() => ({ file, dirty: isDirty() }))
}

// --- import: text from other formats → a new document; the original stays viewable -------

interface ImportSource {
  name: string
  /** The original text (text import). */
  text?: string
  /** The original pages as image URLs (image/PDF import). */
  images?: string[]
}

const importDialog = $<HTMLDialogElement>('import-dialog')
const importText_ = $<HTMLTextAreaElement>('import-text')
const previewSwitch = $<HTMLElement>('preview-switch')
const originalView = $<HTMLElement>('original')
const originalImages = $<HTMLElement>('original-images')
let importSource: ImportSource | null = null
const originalInfo = $<HTMLElement>('original-info')

/** Converts the text and opens the result, after asking about unsaved changes. */
async function runImport(
  text: string,
  name: string,
  encoding: TextEncodingName | null
): Promise<void> {
  const result = importText(text, name)
  if (result.format === 'unknown') {
    const notFound =
      '코드 악보로 보이는 줄을 찾지 못했어요. (코드 줄, 마디선 |, ChordPro 형식을 읽을 수 있어요.)'
    if (!platform.features.ai) {
      window.alert(notFound)
      return
    }
    const useAi = window.confirm(
      notFound + '\n\nAI에게 이 글을 읽혀 볼까요? 인터넷이 필요하고 API 요금이 나와요.'
    )
    if (useAi) {
      importDialog.close()
      openAiDialog({ name, text })
    }
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
  const picked = await platform.importFile('text')
  if (!picked) return
  const { text, encoding } = decodeText(picked.data)
  await runImport(text, picked.file.name, encoding)
})

function showImportSource(source: ImportSource | null): void {
  importSource = source
  previewSwitch.hidden = !source
  originalView.textContent = source?.text ?? ''
  originalImages.replaceChildren(
    ...(source?.images ?? []).map((url, i) => {
      const img = document.createElement('img')
      img.src = url
      img.alt = `원본 ${i + 1}쪽`
      return img
    })
  )
  showOriginal(false)
}

function showOriginal(on: boolean): void {
  originalView.hidden = !on || !importSource?.text
  originalImages.hidden = !on || !importSource?.images
  pagesHost.hidden = on
  previewSwitch.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) => {
    b.setAttribute('aria-pressed', String((b.dataset.show === 'original') === on))
  })
}

previewSwitch.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) => {
  b.addEventListener('click', () => showOriginal(b.dataset.show === 'original'))
})

// --- image/PDF import: page images → the AI → a new document to review ---------------------

/** What the AI is asked to read: page images, or a text the rules could not read. */
interface AiJob {
  name: string
  pages?: ChartPage[]
  text?: string
}

const aiDialog = $<HTMLDialogElement>('ai-dialog')
const aiSummary = $<HTMLElement>('ai-summary')
const aiPages = $<HTMLElement>('ai-pages')
const aiMessage = $<HTMLElement>('ai-message')
const aiSend = $<HTMLButtonElement>('ai-send')
const aiCancel = $<HTMLButtonElement>('ai-cancel')
let aiJob: AiJob | null = null
let aiBusy = false

function aiSay(message: string, isError = false): void {
  aiMessage.hidden = !message
  aiMessage.textContent = message
  aiMessage.classList.toggle('is-error', isError)
}

const checkedPages = (): ChartPage[] =>
  (aiJob?.pages ?? []).filter(
    (_, i) => aiPages.querySelector<HTMLInputElement>(`input[data-page="${i}"]`)?.checked
  )

/** Updates the send button: it opens the settings while there is no API key. */
async function refreshAiSend(): Promise<void> {
  if (!aiJob) return
  if (!(await platform.hasApiKey())) {
    aiSend.textContent = '설정 열기'
    aiSend.dataset.action = 'settings'
    aiSend.disabled = false
    aiSay('API 키가 없어요. 설정에서 Anthropic API 키를 넣은 뒤 보내 주세요.', true)
    return
  }
  aiSend.dataset.action = 'send'
  const count = checkedPages().length
  aiSend.textContent = aiJob.pages ? `${count}쪽 보내기` : '보내기'
  aiSend.disabled = !!aiJob.pages && count === 0
  aiSay('')
}

function setAiBusy(busy: boolean): void {
  aiBusy = busy
  aiCancel.textContent = busy ? '멈추기' : '취소'
  aiPages.querySelectorAll('input').forEach((box) => (box.disabled = busy))
  if (busy) {
    aiSend.disabled = true
    aiSend.textContent = '읽는 중…'
  }
}

function openAiDialog(job: AiJob): void {
  aiJob = job
  const model = modelName(recognizeModel())
  aiSummary.textContent = job.pages
    ? `체크한 쪽을 Anthropic 서버로 보내서 AI(${model})가 읽어요. 인터넷이 필요하고, 쓴 만큼 API 요금이 나와요.`
    : `이 글(${job.text?.length ?? 0}자)을 Anthropic 서버로 보내서 AI(${model})가 읽어요. 인터넷이 필요하고, 쓴 만큼 API 요금이 나와요.`
  aiPages.replaceChildren(
    ...(job.pages ?? []).map((page, i) => {
      const label = document.createElement('label')
      label.className = 'ai-page'
      label.innerHTML = `<img alt=""><span><input type="checkbox" checked data-page="${i}"> ${i + 1}쪽</span>`
      label.querySelector('img')!.src = page.url
      return label
    })
  )
  setAiBusy(false)
  if (!aiDialog.open) aiDialog.showModal()
  void refreshAiSend()
}

aiPages.addEventListener('change', () => void refreshAiSend())

async function sendToAi(): Promise<void> {
  const job = aiJob
  if (!job) return
  const pages = job.pages ? checkedPages() : []
  // Ask before paying for an answer that would then be thrown away.
  if (!(await confirmDiscard())) return
  const model = recognizeModel()
  setAiBusy(true)
  aiSay('AI가 악보를 읽고 있어요. 보통 30초~2분쯤 걸려요.')
  const result = await platform.recognize({
    model,
    system: RECOGNIZE_SYSTEM_PROMPT,
    images: pages.map((page) => page.image),
    prompt: job.pages
      ? recognizeImagesPrompt(job.name, pages.length)
      : recognizeTextPrompt(job.name, job.text ?? '')
  })
  setAiBusy(false)
  if (!result.ok) {
    await refreshAiSend()
    aiSay(recognizeErrorMessage(result.failure), result.failure.kind !== 'cancelled')
    return
  }
  let text = cleanRecognizedText(result.text)
  if (result.truncated)
    text += '// ? AI의 답이 길이 제한에서 끊겼어요. 끝부분을 원본과 비교해 주세요.\n'
  aiDialog.close()
  load(text, null, {
    name: job.name,
    images: job.pages && pages.map((page) => page.url),
    text: job.text
  })
  const uncertain = countUncertain(editor.parsed().document)
  const details = [
    `AI(${modelName(model)})`,
    ...(job.pages ? [`${pages.length}쪽`] : []),
    uncertain ? `확인 필요(?) ${uncertain}곳` : '확인 필요 없음'
  ]
  originalInfo.textContent = `${job.name} · ${details.join(' · ')}`
  status.textContent = `가져옴: ${details.join(' · ')}`
}

aiSend.addEventListener('click', async () => {
  if (aiSend.dataset.action === 'settings') {
    await openSettings()
    await refreshAiSend()
  } else void sendToAi()
})

aiCancel.addEventListener('click', () => {
  if (aiBusy) platform.cancelRecognize()
  else aiDialog.close()
})

// Esc while the AI is reading stops the request instead of hiding it.
aiDialog.addEventListener('cancel', (e) => {
  if (!aiBusy) return
  e.preventDefault()
  platform.cancelRecognize()
})

aiDialog.addEventListener('close', () => {
  aiJob = null
  aiPages.replaceChildren()
})

$<HTMLButtonElement>('import-chart').addEventListener('click', async () => {
  const picked = await platform.importFile('chart')
  if (!picked) return
  importDialog.close()
  aiJob = null
  aiSummary.textContent = `${picked.file.name}: 쪽 그림을 만드는 중…`
  aiPages.replaceChildren()
  aiSay('')
  aiSend.disabled = true
  aiDialog.showModal()
  try {
    const { pages, total } = await chartPages(picked, MAX_RECOGNIZE_PAGES)
    openAiDialog({ name: picked.file.name, pages })
    if (total > pages.length)
      aiSummary.textContent += ` (전체 ${total}쪽 중 앞 ${pages.length}쪽만 보낼 수 있어요.)`
  } catch (error) {
    aiSay(error instanceof Error ? error.message : String(error), true)
  }
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

// --- chord spelling: note names ↔ degrees, written into the text -------------------------

const spellingReading = $<HTMLElement>('spelling-reading')
let spellingTimer: number | undefined

function sayAboutSpelling(message: string, bad = false): void {
  spellingReading.textContent = message
  spellingReading.classList.toggle('bad', bad)
  window.clearTimeout(spellingTimer)
  spellingTimer = window.setTimeout(() => (spellingReading.textContent = ''), 5000)
}

/** Rewrites chords on the selected lines (or the whole song) as degrees or note names. */
function respell(to: ChordSpelling): void {
  if (transposeTo) {
    sayAboutSpelling('조옮김을 먼저 적용하거나 취소해 주세요', true)
    return
  }
  const { from, to: end } = editor.selection()
  const lines = editor.view.state.doc
  const range =
    from === end ? null : { from: lines.lineAt(from).number, to: lines.lineAt(end).number }
  const { edits, changed, withoutKey } = spellingEdits(
    editor.getText(),
    editor.parsed().document,
    to,
    range
  )
  if (edits.length) editor.change(edits)
  const where = range ? `${range.from}~${range.to}줄` : '전체'
  const done = changed ? `${where}: 코드 ${changed}개를 바꿨어요` : `${where}: 바꿀 코드가 없어요`
  sayAboutSpelling(
    withoutKey ? `${done} · key:가 없어서 못 바꾼 코드 ${withoutKey}개` : done,
    withoutKey > 0
  )
}

$<HTMLButtonElement>('to-degrees').addEventListener('click', () => respell('degrees'))
$<HTMLButtonElement>('to-notes').addEventListener('click', () => respell('notes'))

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
  button.addEventListener('click', () => {
    closeMenu()
    run(button.dataset.command!)
  })
})

// --- ⋯ menu ------------------------------------------------------------------------------

const menu = $<HTMLElement>('menu')
const menuButton = $<HTMLButtonElement>('menu-button')

function closeMenu(): void {
  menu.hidden = true
  menuButton.setAttribute('aria-expanded', 'false')
}

menuButton.addEventListener('click', (e) => {
  e.stopPropagation()
  const open = menu.hidden
  menu.hidden = !open
  menuButton.setAttribute('aria-expanded', String(open))
  if (open) menu.querySelector<HTMLElement>('[role=menuitem]:not([hidden])')?.focus()
})
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target as Node)) closeMenu()
})
menu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMenu()
    menuButton.focus()
  }
})
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))

// --- about ---------------------------------------------------------------------------------

const aboutDialog = $<HTMLDialogElement>('about-dialog')
$<HTMLElement>('about-version').textContent = `버전 ${APP_VERSION}`
if (DONATE_URL) {
  $<HTMLElement>('about-donate').hidden = false
  $<HTMLAnchorElement>('about-donate-link').href = DONATE_URL
}

async function openAbout(): Promise<void> {
  aboutDialog.showModal()
}

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
    if (e.key === 'F1') {
      e.preventDefault()
      run('help')
      return
    }
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
