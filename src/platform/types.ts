// What the app needs from the device it runs on. The renderer talks only to this interface
// (CLAUDE.md 구조 원칙); Electron is one implementation, Capacitor (Android) will be another.

/** A file chosen by the user. `id` is opaque: a path on desktop, a content URI on Android. */
export interface FileRef {
  id: string
  /** File name to show, e.g. `샴푸의요정.chord`. */
  name: string
}

export interface OpenedFile {
  file: FileRef
  text: string
}

export type DiscardChoice = 'save' | 'discard' | 'cancel'

export interface DocumentState {
  /** Name to show, e.g. `샴푸의요정.chord` or `제목 없음`. */
  name: string
  dirty: boolean
}

export interface Platform {
  /** Asks the user for a file to open. null when cancelled. */
  openFile(): Promise<OpenedFile | null>
  /** Saves to `file`, or asks where when it is null. Returns where it saved, null when cancelled. */
  saveFile(file: FileRef | null, text: string): Promise<FileRef | null>
  /** Always asks where to save. Returns where it saved, null when cancelled. */
  saveFileAs(file: FileRef | null, text: string): Promise<FileRef | null>
  /** Asks whether to save unsaved changes to the named document. */
  confirmDiscard(name: string): Promise<DiscardChoice>
  /** Shows the document name and unsaved state where the platform can (desktop: window title). */
  setDocumentState(state: DocumentState): void
  /**
   * Runs before the app or window closes while there are unsaved changes.
   * The handler resolves true to let it close.
   */
  onBeforeClose(handler: () => Promise<boolean>): void
}
