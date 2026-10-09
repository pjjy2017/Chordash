// Autosave (1.5): while a song has unsaved changes, a copy is kept on this device every few
// seconds. If the app closes before it is saved (crash, closed tab, phone killing the app), the
// next start offers it back. Saving, or going back to the saved text, removes the copy.

import type { FileRef } from '../../platform'

const KEY = 'chordash.draft'

export interface Draft {
  text: string
  /** The text as last saved, so a restored song still shows what is unsaved. */
  saved: string
  /** Where it was saved; null for a new song (or one only held in memory). */
  file: FileRef | null
  time: number
}

/** Files held only in memory (picked from elsewhere) cannot be found again after a restart. */
const lasting = (file: FileRef | null): FileRef | null =>
  file && !/^(copy|import):/.test(file.id) ? file : null

export function keepDraft(text: string, saved: string, file: FileRef | null): void {
  try {
    const draft: Draft = { text, saved, file: lasting(file), time: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Full or blocked storage: nothing kept.
  }
}

export function dropDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to remove.
  }
}

export function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Draft | null
    return draft && typeof draft.text === 'string' && draft.text.trim() ? draft : null
  } catch {
    return null
  }
}
