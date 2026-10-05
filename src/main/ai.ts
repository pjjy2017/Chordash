// Electron side of the AI platform calls: the Anthropic API key, kept encrypted with
// safeStorage in the user's app data folder, and chart recognition with the Claude API.
// The key never goes back to the page and is never written anywhere unencrypted.

import Anthropic from '@anthropic-ai/sdk'
import { app, ipcMain, safeStorage, type WebContents } from 'electron'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { RecognizeFailure } from '../core/recognize'
import { IPC } from '../platform/electron/bridge'
import type { RecognizeRequest, RecognizeResult } from '../platform/types'

/** Long enough for many pages of chords; short enough to answer without streaming. */
const MAX_OUTPUT_TOKENS = 16000

const keyFile = (): string => join(app.getPath('userData'), 'anthropic-api-key.bin')

async function loadKey(): Promise<string | null> {
  try {
    return safeStorage.decryptString(await readFile(keyFile()))
  } catch {
    return null
  }
}

/** Always pass the key: without it the SDK would fall back to the ANTHROPIC_API_KEY variable. */
const clientFor = (apiKey: string): Anthropic =>
  new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 })

function failureOf(error: unknown): RecognizeFailure {
  if (error instanceof Anthropic.APIUserAbortError) return { kind: 'cancelled' }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { kind: 'timeout' }
  if (error instanceof Anthropic.APIConnectionError) return { kind: 'connection' }
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    const body = error.error as { error?: { message?: string } } | undefined
    return { kind: 'api', status: error.status, message: body?.error?.message ?? error.message }
  }
  return { kind: 'api', status: 0, message: String(error) }
}

/** Stores the key after checking it with a free request (listing models). */
async function setKey(key: string | null): Promise<string | null> {
  if (key === null) {
    await rm(keyFile(), { force: true })
    return null
  }
  const trimmed = key.trim()
  if (!trimmed) return '키를 입력해 주세요.'
  if (!safeStorage.isEncryptionAvailable()) return '이 컴퓨터에서는 키를 안전하게 저장할 수 없어요.'
  try {
    await clientFor(trimmed).models.list({ limit: 1 })
  } catch (error) {
    const failure = failureOf(error)
    if (failure.kind === 'api' && failure.status === 401)
      return 'API 키가 맞지 않아요. 다시 확인해 주세요.'
    if (failure.kind === 'connection' || failure.kind === 'timeout')
      return '인터넷에 연결할 수 없어서 키를 확인하지 못했어요.'
    return `키를 확인하지 못했어요: ${failure.kind === 'api' ? failure.message : failure.kind}`
  }
  await writeFile(keyFile(), safeStorage.encryptString(trimmed))
  return null
}

/** Running requests by page, so the page can cancel its own. */
const running = new Map<WebContents, AbortController>()

async function recognize(sender: WebContents, request: RecognizeRequest): Promise<RecognizeResult> {
  running.get(sender)?.abort()
  const controller = new AbortController()
  running.set(sender, controller)
  try {
    // Automated checks set this to answer from a file instead of calling the API.
    const testAnswer = process.env.CHORDASH_TEST_RECOGNIZE_ANSWER
    if (testAnswer) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (controller.signal.aborted) return { ok: false, failure: { kind: 'cancelled' } }
      return { ok: true, text: await readFile(testAnswer, 'utf8'), truncated: false }
    }
    const apiKey = await loadKey()
    if (!apiKey) return { ok: false, failure: { kind: 'no-key' } }
    const message = await clientFor(apiKey).messages.create(
      {
        model: request.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: request.system,
        messages: [
          {
            role: 'user',
            content: [
              ...request.images.map((image) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: image.mediaType, data: image.data }
              })),
              { type: 'text' as const, text: request.prompt }
            ]
          }
        ]
      },
      { signal: controller.signal }
    )
    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    return { ok: true, text, truncated: message.stop_reason === 'max_tokens' }
  } catch (error) {
    return { ok: false, failure: failureOf(error) }
  } finally {
    if (running.get(sender) === controller) running.delete(sender)
  }
}

export function registerAiHandlers(): void {
  // With a test answer (automated checks) no key is needed.
  ipcMain.handle(
    IPC.hasApiKey,
    async () => !!process.env.CHORDASH_TEST_RECOGNIZE_ANSWER || (await loadKey()) !== null
  )
  ipcMain.handle(IPC.setApiKey, (_e, key: string | null) => setKey(key))
  ipcMain.handle(IPC.recognize, (e, request: RecognizeRequest) => recognize(e.sender, request))
  ipcMain.on(IPC.cancelRecognize, (e) => running.get(e.sender)?.abort())
}
