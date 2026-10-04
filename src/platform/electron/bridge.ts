// The IPC bridge the Electron preload script exposes as `window.chordashBridge`.
// Only the Electron platform implementation (./index.ts) may use it.

import type { DiscardChoice, DocumentState, FileRef, OpenedFile } from '../types'

export interface ElectronBridge {
  openFile(): Promise<OpenedFile | null>
  saveFile(file: FileRef | null, text: string): Promise<FileRef | null>
  saveFileAs(file: FileRef | null, text: string): Promise<FileRef | null>
  exportPdf(html: string, suggestedName: string): Promise<FileRef | null>
  confirmDiscard(name: string): Promise<DiscardChoice>
  setDocumentState(state: DocumentState): void
  /** Main asks before closing a window with unsaved changes. */
  onCloseRequested(callback: () => void): void
  /** Closes the window without asking again. */
  closeWindow(): void
}

export const IPC = {
  open: 'file:open',
  save: 'file:save',
  saveAs: 'file:saveAs',
  exportPdf: 'file:exportPdf',
  confirmDiscard: 'doc:confirmDiscard',
  documentState: 'doc:state',
  closeRequested: 'app:closeRequested',
  close: 'app:close'
} as const
