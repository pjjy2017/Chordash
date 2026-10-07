// Platform implementation for the Android app (Capacitor, ROADMAP Phase 12).
// Songs live in Documents/Chordash (./folder.ts); files from elsewhere come in through the
// system file picker. PDFs go through Android's print screen ("PDF로 저장"). The AI is called
// natively (no browser CORS limits) with the key kept in the Android Keystore.

import { App } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Printer } from '@capgo/capacitor-printer'
import { readHeaderLine } from '../../core/header'
import type { RecognizeFailure } from '../../core/recognize'
import { formatSetlist, parseSetlist } from '../../core/setlist'
import type { FileRef, ImportKind, Platform, RecognizeResult, SetlistSong } from '../types'
import { pickWithInput, printTip, withoutBom, type PickerType } from '../web'
import { chooseInFolder, existsInFolder, readFromFolder, safeName, writeToFolder } from './folder'

const SONG = '.chord'
const SETLIST = '.setlist'
const KEY_NAME = 'anthropic-api-key'
const API = 'https://api.anthropic.com/v1'

const PICK: Record<'song' | 'setlist' | ImportKind, PickerType> = {
  song: { description: 'Chordash 악보', accept: { 'text/plain': ['.chord'] } },
  setlist: { description: 'Chordash 셋리스트', accept: { 'text/plain': ['.setlist'] } },
  text: {
    description: '텍스트 악보, ChordPro',
    accept: { 'text/plain': ['.txt', '.cho', '.chopro', '.chordpro', '.crd', '.pro'] }
  },
  // Images include the camera in Android's chooser.
  chart: { description: '악보 사진, PDF', accept: { 'image/*': [], 'application/pdf': ['.pdf'] } }
}

/**
 * A FileRef id is `folder:<name>` for files in Documents/Chordash, or `copy:<n>` for files
 * picked from elsewhere, which are only kept in memory (saving them goes to the folder).
 */
const inFolder = (file: FileRef): string | null =>
  file.id.startsWith('folder:') ? file.id.slice('folder:'.length) : null
const folderRef = (name: string): FileRef => ({ id: `folder:${name}`, name })
const copies = new Map<string, string>()
let nextCopy = 1
function copyRef(name: string, text: string): FileRef {
  const ref = { id: `copy:${nextCopy++}`, name }
  copies.set(ref.id, text)
  return ref
}

async function readText(file: FileRef): Promise<string | null> {
  const name = inFolder(file)
  return name ? readFromFolder(name) : (copies.get(file.id) ?? null)
}

/** Asks for a file name in the folder; confirms before replacing another file. */
async function askName(suggested: string, extension: string): Promise<string | null> {
  for (;;) {
    const typed = window.prompt(`파일 이름 (문서/Chordash 폴더에 저장)`, suggested)
    if (typed === null) return null
    const name = safeName(typed, extension)
    if (!(await existsInFolder(name))) return name
    if (window.confirm(`'${name}'이(가) 이미 있어요. 바꿔 쓸까요?`)) return name
    suggested = name.slice(0, -extension.length)
  }
}

async function saveText(
  file: FileRef | null,
  text: string,
  suggested: string,
  extension: string,
  asNew: boolean
): Promise<FileRef | null> {
  const current = file && !asNew ? inFolder(file) : null
  const name = current ?? (await askName(suggested, extension))
  if (!name) return null
  await writeToFolder(name, text)
  return folderRef(name)
}

const songTitle = (text: string): string => readHeaderLine(text, 'title') || '제목 없음'

// --- AI ---------------------------------------------------------------------------------

async function apiKey(): Promise<string | null> {
  try {
    const key = await SecureStorage.get(KEY_NAME)
    return typeof key === 'string' && key ? key : null
  } catch {
    return null
  }
}

const headers = (key: string): Record<string, string> => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json'
})

const apiFailure = (status: number, data: unknown): Extract<RecognizeFailure, { kind: 'api' }> => ({
  kind: 'api',
  status,
  message:
    (data as { error?: { message?: string } } | null)?.error?.message ??
    (typeof data === 'string' ? data : '')
})

/** The running request: cancelling settles it at once and drops the late answer. */
let cancelRunning: (() => void) | null = null

export function createAndroidPlatform(): Platform {
  let dirty = false
  let beforeClose: (() => Promise<boolean>) | null = null

  // Back button: closes an open dialog first, then leaves the app (asking about changes).
  void App.addListener('backButton', async () => {
    const open = [...document.querySelectorAll('dialog')].filter((d) => d.open).pop()
    if (open) {
      // Same as Esc: the dialog may refuse (e.g. stops the AI request instead).
      if (open.dispatchEvent(new Event('cancel', { cancelable: true }))) open.close()
      return
    }
    if (!dirty || !beforeClose || (await beforeClose())) await App.exitApp()
  })

  return {
    features: { ai: true, printPdf: true, setlistKeepsSongs: false },

    async openFile() {
      const choice = await chooseInFolder('곡 열기', SONG, false)
      if (!choice) return null
      if (choice !== 'elsewhere') {
        const name = choice.names[0]
        const text = await readFromFolder(name)
        return text === null ? null : { file: folderRef(name), text }
      }
      const [picked] = await pickWithInput(PICK.song, false)
      if (!picked) return null
      const text = withoutBom(await picked.text())
      return { file: copyRef(picked.name, text), text }
    },

    async importFile(kind) {
      const [picked] = await pickWithInput(PICK[kind], false)
      if (!picked) return null
      return { file: copyRef(picked.name, ''), data: new Uint8Array(await picked.arrayBuffer()) }
    },

    saveFile: (file, text) => saveText(file, text, file?.name ?? songTitle(text), SONG, false),
    saveFileAs: (file, text) => saveText(file, text, file?.name ?? songTitle(text), SONG, true),

    async exportPdf(html, suggestedName) {
      printTip()
      await Printer.printHtml({ name: suggestedName.replace(/\.pdf$/i, ''), html })
      return null
    },

    async confirmDiscard(name) {
      return window.confirm(`'${name}'의 바뀐 내용을 저장하지 않았어요.\n버리고 계속할까요?`)
        ? 'discard'
        : 'cancel'
    },

    setDocumentState(state) {
      dirty = state.dirty
    },

    onBeforeClose(handler) {
      beforeClose = handler
    },

    async pickSongs() {
      const choice = await chooseInFolder('셋리스트에 넣을 곡', SONG, true)
      if (!choice) return []
      if (choice !== 'elsewhere') return choice.names.map(folderRef)
      const picked = await pickWithInput(PICK.song, true)
      return Promise.all(picked.map(async (f) => copyRef(f.name, withoutBom(await f.text()))))
    },

    readSong: readText,

    async openSetlist() {
      const choice = await chooseInFolder('셋리스트 열기', SETLIST, false)
      if (!choice) return null
      let file: FileRef
      let text: string | null
      if (choice === 'elsewhere') {
        const [picked] = await pickWithInput(PICK.setlist, false)
        if (!picked) return null
        text = await picked.text()
        file = copyRef(picked.name, text)
      } else {
        file = folderRef(choice.names[0])
        text = await readFromFolder(choice.names[0])
        if (text === null) return null
      }
      const { title, entries, songs } = parseSetlist(text)
      const fromFolder = inFolder(file) !== null
      return {
        file,
        setlist: {
          title,
          songs: await Promise.all(
            entries.map(async (entry): Promise<SetlistSong> => {
              const kept = songs?.[entry.path]
              const name = entry.path.split(/[\\/]/).pop() || entry.path
              // Songs next to the setlist are read from the folder; others from kept copies.
              if (fromFolder && kept === undefined && (await existsInFolder(name)))
                return { file: folderRef(name), key: entry.key, found: true }
              if (kept !== undefined)
                return { file: copyRef(name, kept), key: entry.key, found: true }
              return { file: copyRef(name, ''), key: entry.key, found: false }
            })
          )
        }
      }
    },

    async saveSetlist(file, setlist) {
      // Songs in the folder are listed by name; songs from elsewhere are kept inside.
      const entries: { path: string; key: string | null }[] = []
      const songs: Record<string, string> = {}
      for (const song of setlist.songs) {
        const name = inFolder(song.file)
        entries.push({ path: name ?? song.file.name, key: song.key })
        if (!name) {
          const text = await readText(song.file)
          if (text) songs[song.file.name] = text
        }
      }
      const text = formatSetlist({
        title: setlist.title,
        entries,
        ...(Object.keys(songs).length ? { songs } : {})
      })
      return saveText(file, text, setlist.title || '셋리스트', SETLIST, file === null)
    },

    hasApiKey: async () => (await apiKey()) !== null,

    async setApiKey(key) {
      if (key === null) {
        await SecureStorage.remove(KEY_NAME)
        return null
      }
      const trimmed = key.trim()
      if (!trimmed) return '키를 입력해 주세요.'
      try {
        const res = await CapacitorHttp.get({
          url: `${API}/models?limit=1`,
          headers: headers(trimmed)
        })
        if (res.status === 401) return 'API 키가 맞지 않아요. 다시 확인해 주세요.'
        if (res.status >= 400)
          return `키를 확인하지 못했어요: ${apiFailure(res.status, res.data).message}`
      } catch {
        return '인터넷에 연결할 수 없어서 키를 확인하지 못했어요.'
      }
      await SecureStorage.set(KEY_NAME, trimmed)
      return null
    },

    async recognize(request): Promise<RecognizeResult> {
      cancelRunning?.()
      const key = await apiKey()
      if (!key) return { ok: false, failure: { kind: 'no-key' } }
      const cancelled = new Promise<RecognizeResult>((resolve) => {
        cancelRunning = () => resolve({ ok: false, failure: { kind: 'cancelled' } })
      })
      const call = (async (): Promise<RecognizeResult> => {
        try {
          const res = await CapacitorHttp.post({
            url: `${API}/messages`,
            headers: headers(key),
            connectTimeout: 30_000,
            readTimeout: 10 * 60_000,
            data: {
              model: request.model,
              max_tokens: 16000,
              system: request.system,
              messages: [
                {
                  role: 'user',
                  content: [
                    ...request.images.map((image) => ({
                      type: 'image',
                      source: { type: 'base64', media_type: image.mediaType, data: image.data }
                    })),
                    { type: 'text', text: request.prompt }
                  ]
                }
              ]
            }
          })
          if (res.status !== 200) return { ok: false, failure: apiFailure(res.status, res.data) }
          const body = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as {
            content: { type: string; text?: string }[]
            stop_reason: string
          }
          return {
            ok: true,
            text: body.content.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join(''),
            truncated: body.stop_reason === 'max_tokens'
          }
        } catch (error) {
          const timeout = /timeout|timed out/i.test(String(error))
          return { ok: false, failure: { kind: timeout ? 'timeout' : 'connection' } }
        }
      })()
      const result = await Promise.race([call, cancelled])
      cancelRunning = null
      return result
    },

    cancelRecognize() {
      cancelRunning?.()
    }
  }
}
