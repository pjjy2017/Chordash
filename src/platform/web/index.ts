// Platform implementation for the web version (GitHub Pages, ROADMAP Phase 11).
// Files go through the browser: Chrome and Edge can open and save the same file again
// (File System Access API); other browsers open with a file picker and save as a download.
// PDFs come from the browser's print dialog. No AI: an API key cannot be kept safely in a
// public web page, so that stays in the desktop app (DECISIONS Phase 11).

import { formatSetlist, parseSetlist } from '../../core/setlist'
import { appTitle } from '../../core/version'
import type { FileRef, OpenedFile, Platform, SetlistSong } from '../types'

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

/** The parts of the File System Access API used here (Chrome, Edge). */
interface FilePickers {
  showOpenFilePicker?(options: {
    types: PickerType[]
    multiple?: boolean
  }): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options: {
    suggestedName: string
    types: PickerType[]
  }): Promise<FileSystemFileHandle>
}

const pickers = window as unknown as FilePickers

const SONG: PickerType = { description: 'Chordash 악보', accept: { 'text/plain': ['.chord'] } }
const SETLIST: PickerType = {
  description: 'Chordash 셋리스트',
  accept: { 'text/plain': ['.setlist'] }
}
const IMPORT_TEXT: PickerType = {
  description: '텍스트 악보, ChordPro',
  accept: { 'text/plain': ['.txt', '.cho', '.chopro', '.chordpro', '.crd', '.pro'] }
}

/** Opened files by id: the browser's handle (to save again) and the text last read or saved. */
const handles = new Map<string, FileSystemFileHandle>()
const texts = new Map<string, string>()
let nextId = 1
const newRef = (name: string): FileRef => ({ id: `web-${nextId++}`, name })

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

const withoutBom = (text: string): string => text.replace(/^\uFEFF/, '')

/** A plain file picker, for browsers without the File System Access API. */
function pickWithInput(type: PickerType, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept = Object.values(type.accept).flat().join(',')
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

async function pick(
  type: PickerType,
  multiple = false
): Promise<{ file: File; handle?: FileSystemFileHandle }[]> {
  if (pickers.showOpenFilePicker) {
    try {
      const picked = await pickers.showOpenFilePicker({ types: [type], multiple })
      return Promise.all(picked.map(async (handle) => ({ file: await handle.getFile(), handle })))
    } catch (error) {
      if (isAbort(error)) return []
      // Not allowed here (e.g. inside a frame): fall back to the plain picker.
    }
  }
  return (await pickWithInput(type, multiple)).map((file) => ({ file }))
}

/** Remembers a picked file so it can be read or saved again. */
function remember(name: string, text: string, handle?: FileSystemFileHandle): FileRef {
  const ref = newRef(name)
  texts.set(ref.id, text)
  if (handle) handles.set(ref.id, handle)
  return ref
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Saves over the same file when the browser allows it; otherwise asks where, or downloads. */
async function save(
  file: FileRef | null,
  text: string,
  suggestedName: string,
  type: PickerType,
  asNew: boolean
): Promise<FileRef | null> {
  const handle = file && !asNew ? handles.get(file.id) : undefined
  if (handle) {
    const writer = await handle.createWritable()
    await writer.write(text)
    await writer.close()
    texts.set(file!.id, text)
    return file
  }
  if (pickers.showSaveFilePicker) {
    try {
      const chosen = await pickers.showSaveFilePicker({ suggestedName, types: [type] })
      const writer = await chosen.createWritable()
      await writer.write(text)
      await writer.close()
      return remember(chosen.name, text, chosen)
    } catch (error) {
      if (isAbort(error)) return null
    }
  }
  // Downloads folder; saving again makes another copy (the browser numbers it).
  download(suggestedName, text)
  if (file && !asNew) {
    texts.set(file.id, text)
    return file
  }
  return remember(suggestedName, text)
}

async function readSong(file: FileRef): Promise<string | null> {
  const handle = handles.get(file.id)
  if (handle) {
    try {
      return withoutBom(await (await handle.getFile()).text())
    } catch {
      // Moved or deleted since: use the copy below.
    }
  }
  return texts.get(file.id) ?? null
}

/** Shown before the first print of this browser: how to get a PDF out of the print dialog. */
const PRINT_TIP_SHOWN = 'chordash.printTipShown'
function printTip(): void {
  try {
    if (localStorage.getItem(PRINT_TIP_SHOWN)) return
    localStorage.setItem(PRINT_TIP_SHOWN, '1')
  } catch {
    // No storage: show the tip every time.
  }
  window.alert(
    '인쇄 창이 열려요.\n\n' +
      "• 대상(프린터)을 'PDF로 저장'으로 고르고 저장을 누르세요.\n" +
      "• 여백은 '기본' 또는 '없음'이면 돼요(악보에 여백이 들어 있어요).\n" +
      '• 종이 크기는 A4예요.'
  )
}

/** Prints a standalone HTML document from a hidden frame. */
async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  frame.srcdoc = html
  document.body.append(frame)
  await loaded
  const view = frame.contentWindow!
  // Embedded fonts must be ready, or the PDF would use fallback fonts.
  await view.document.fonts.ready
  view.focus()
  view.print()
  // Some browsers return from print() before the dialog closes.
  setTimeout(() => frame.remove(), 60_000)
}

export function createWebPlatform(): Platform {
  let dirty = false
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault()
  })

  return {
    features: { ai: false, printPdf: true, setlistKeepsSongs: true },

    async openFile(): Promise<OpenedFile | null> {
      const [picked] = await pick(SONG)
      if (!picked) return null
      const text = withoutBom(await picked.file.text())
      return { file: remember(picked.file.name, text, picked.handle), text }
    },

    async importFile(kind) {
      if (kind !== 'text') return null
      const [picked] = await pick(IMPORT_TEXT)
      if (!picked) return null
      return {
        file: newRef(picked.file.name),
        data: new Uint8Array(await picked.file.arrayBuffer())
      }
    },

    saveFile: (file, text) => save(file, text, file?.name ?? '제목 없음.chord', SONG, false),
    saveFileAs: (file, text) => save(file, text, file?.name ?? '제목 없음.chord', SONG, true),

    async exportPdf(html) {
      printTip()
      await printHtml(html)
      return null
    },

    async confirmDiscard(name) {
      return window.confirm(`'${name}'의 바뀐 내용을 저장하지 않았어요.\n버리고 계속할까요?`)
        ? 'discard'
        : 'cancel'
    },

    setDocumentState(state) {
      dirty = state.dirty
      document.title = appTitle(state.name, state.dirty)
    },

    onBeforeClose() {
      // The browser can only warn before leaving (beforeunload above), not ask and save.
    },

    async pickSongs() {
      const picked = await pick(SONG, true)
      return Promise.all(
        picked.map(async ({ file, handle }) =>
          remember(file.name, withoutBom(await file.text()), handle)
        )
      )
    },

    readSong,

    async openSetlist() {
      const [picked] = await pick(SETLIST)
      if (!picked) return null
      const text = await picked.file.text()
      const { title, entries, songs } = parseSetlist(text)
      return {
        file: remember(picked.file.name, text, picked.handle),
        setlist: {
          title,
          songs: entries.map((entry): SetlistSong => {
            const kept = songs?.[entry.path]
            const name = entry.path.split(/[\\/]/).pop() || entry.path
            return {
              file: kept === undefined ? newRef(name) : remember(name, kept),
              key: entry.key,
              found: kept !== undefined
            }
          })
        }
      }
    },

    async saveSetlist(file, setlist) {
      // Songs go inside the setlist under their file names, made unique when two are alike.
      const used = new Set<string>()
      const entries: { path: string; key: string | null }[] = []
      const songs: Record<string, string> = {}
      for (const song of setlist.songs) {
        let path = song.file.name
        for (let n = 2; used.has(path); n++) path = song.file.name.replace(/(\.\w+)?$/, ` (${n})$1`)
        used.add(path)
        entries.push({ path, key: song.key })
        const text = await readSong(song.file)
        if (text !== null) songs[path] = text
      }
      const text = formatSetlist({ title: setlist.title, entries, songs })
      return save(file, text, `${setlist.title || '셋리스트'}.setlist`, SETLIST, file === null)
    },

    hasApiKey: async () => false,
    setApiKey: async () => '웹 버전에서는 AI 기능을 쓸 수 없어요. 데스크톱 앱을 써 주세요.',
    recognize: async () => ({ ok: false, failure: { kind: 'no-key' } }),
    cancelRecognize() {
      // Nothing is ever sent.
    }
  }
}
