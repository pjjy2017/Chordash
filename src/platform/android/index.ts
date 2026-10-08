// Platform implementation for the Android app (Capacitor, ROADMAP Phase 12).
// Songs live in Documents/Chordash (../library); files from elsewhere come in through the
// system file picker. PDFs go through Android's print screen ("PDF로 저장"). The AI is called
// natively (no browser CORS limits) with the key kept in the Android Keystore.

import { App } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Printer } from '@capgo/capacitor-printer'
import type { RecognizeFailure } from '../../core/recognize'
import { FOLDER, libraryMethods, localStore, shareFile } from '../library'
import { pickWithInput, printTip, type PickerType } from '../shared'
import type { ImportKind, Platform, RecognizeResult } from '../types'

const KEY_NAME = 'anthropic-api-key'
const API = 'https://api.anthropic.com/v1'

const PICK: Record<ImportKind, PickerType> = {
  text: {
    description: '텍스트 악보, ChordPro',
    accept: { 'text/plain': ['.txt', '.cho', '.chopro', '.chordpro', '.crd', '.pro'] }
  },
  // Images include the camera in Android's chooser.
  chart: { description: '악보 사진, PDF', accept: { 'image/*': [], 'application/pdf': ['.pdf'] } }
}

/** Files picked for import are read once and not kept. */
let nextImport = 1

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
    features: { ai: true, printPdf: true, setlistKeepsSongs: false, offersDesktopApp: false },

    ...libraryMethods([
      localStore({
        label: '휴대폰',
        where: `휴대폰의 문서/${FOLDER} 폴더`,
        saveTo: `휴대폰의 문서/${FOLDER} 폴더에`,
        fileAction: { label: '공유', run: shareFile }
      })
    ]),

    async importFile(kind) {
      const [picked] = await pickWithInput(PICK[kind], false)
      if (!picked) return null
      return {
        file: { id: `import:${nextImport++}`, name: picked.name },
        data: new Uint8Array(await picked.arrayBuffer())
      }
    },

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
