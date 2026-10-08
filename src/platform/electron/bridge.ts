// The IPC bridge the Electron preload script exposes as `window.chordashBridge`.
// Only the Electron platform implementation (./index.ts) may use it.

import type {
  DiscardChoice,
  DocumentState,
  FileRef,
  OpenResult,
  OpenedSetlist,
  RecognizeRequest,
  RecognizeResult,
  Setlist
} from '../types'

export interface ElectronBridge {
  openFile(): Promise<OpenResult | null>
  saveFile(file: FileRef | null, text: string): Promise<FileRef | null>
  saveFileAs(file: FileRef | null, text: string): Promise<FileRef | null>
  exportPdf(html: string, suggestedName: string): Promise<FileRef | null>
  confirmDiscard(name: string): Promise<DiscardChoice>
  setDocumentState(state: DocumentState): void
  /** Main asks before closing a window with unsaved changes. */
  onCloseRequested(callback: () => void): void
  /** Closes the window without asking again. */
  closeWindow(): void
  pickSongs(): Promise<FileRef[]>
  readSong(file: FileRef): Promise<string | null>
  openSetlist(): Promise<OpenedSetlist | null>
  saveSetlist(file: FileRef | null, setlist: Setlist): Promise<FileRef | null>
  hasApiKey(): Promise<boolean>
  setApiKey(key: string | null): Promise<string | null>
  recognize(request: RecognizeRequest): Promise<RecognizeResult>
  cancelRecognize(): void
}

export const IPC = {
  open: 'file:open',
  save: 'file:save',
  saveAs: 'file:saveAs',
  exportPdf: 'file:exportPdf',
  confirmDiscard: 'doc:confirmDiscard',
  documentState: 'doc:state',
  closeRequested: 'app:closeRequested',
  close: 'app:close',
  pickSongs: 'setlist:pickSongs',
  readSong: 'setlist:readSong',
  openSetlist: 'setlist:open',
  saveSetlist: 'setlist:save',
  hasApiKey: 'ai:hasKey',
  setApiKey: 'ai:setKey',
  recognize: 'ai:recognize',
  cancelRecognize: 'ai:cancel'
} as const
