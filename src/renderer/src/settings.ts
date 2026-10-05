// Settings dialog: the Anthropic API key (stored by the platform, never shown again) and the AI
// model. The model is a plain preference and stays in this browser's storage.

import { DEFAULT_RECOGNIZE_MODEL, RECOGNIZE_MODELS } from '../../core'
import { platform } from '../../platform'

const MODEL_STORAGE = 'chordash.recognizeModel'

export function recognizeModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE)
    if (RECOGNIZE_MODELS.some((m) => m.id === stored)) return stored as string
  } catch {
    // No storage: use the default.
  }
  return DEFAULT_RECOGNIZE_MODEL
}

/** Short model name, e.g. "Opus 5.5". */
export const modelName = (id: string): string =>
  RECOGNIZE_MODELS.find((m) => m.id === id)?.label.split(' — ')[0] ?? id

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const dialog = $<HTMLDialogElement>('settings-dialog')
const keyState = $<HTMLElement>('key-state')
const keyInput = $<HTMLInputElement>('key-input')
const keySave = $<HTMLButtonElement>('key-save')
const keyDelete = $<HTMLButtonElement>('key-delete')
const keyMessage = $<HTMLElement>('key-message')
const modelSelect = $<HTMLSelectElement>('model-select')

for (const model of RECOGNIZE_MODELS) modelSelect.add(new Option(model.label, model.id))

modelSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(MODEL_STORAGE, modelSelect.value)
  } catch {
    // Not remembered; the choice still holds until the app closes.
  }
})

function say(message: string, isError = false): void {
  keyMessage.hidden = !message
  keyMessage.textContent = message
  keyMessage.classList.toggle('is-error', isError)
}

async function showKeyState(): Promise<void> {
  const saved = await platform.hasApiKey()
  keyState.textContent = saved ? '저장됨 ✓' : '없음'
  keyState.classList.toggle('is-saved', saved)
  keyDelete.disabled = !saved
}

async function storeKey(key: string | null, busyText: string, doneText: string): Promise<void> {
  keySave.disabled = keyDelete.disabled = true
  say(busyText)
  try {
    const problem = await platform.setApiKey(key)
    if (problem) say(problem, true)
    else {
      keyInput.value = ''
      say(doneText)
    }
  } finally {
    keySave.disabled = false
    await showKeyState()
  }
}

keySave.addEventListener('click', () => {
  if (!keyInput.value.trim()) return say('키를 붙여넣어 주세요.', true)
  void storeKey(keyInput.value, '키를 확인하는 중…', '키를 확인하고 저장했어요.')
})
keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    keySave.click()
  }
})
keyDelete.addEventListener('click', () => {
  if (window.confirm('저장된 API 키를 지울까요?'))
    void storeKey(null, '지우는 중…', '키를 지웠어요.')
})
// The typed key never stays in the page after the dialog closes.
dialog.addEventListener('close', () => {
  keyInput.value = ''
})

/** Opens the settings; resolves when the dialog closes. */
export async function openSettings(): Promise<void> {
  say('')
  modelSelect.value = recognizeModel()
  await showKeyState()
  dialog.showModal()
  await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }))
}
