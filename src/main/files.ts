// Electron side of the platform: file dialogs, disk access, window title and close guard.

import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { appTitle } from '../core/version'
import { IPC } from '../platform/electron/bridge'
import type { DiscardChoice, DocumentState, FileRef, OpenResult } from '../platform/types'

const FILTERS = [
  { name: 'Chordash 악보', extensions: ['chord'] },
  { name: '모든 파일', extensions: ['*'] }
]

/** "열기" takes any chart (1.4): Chordash songs open as they are, the rest are converted. */
const OPEN_FILTERS: Electron.FileFilter[] = [
  {
    name: '악보 (Chordash, 텍스트, ChordPro, 사진, PDF)',
    extensions: [
      'chord',
      'txt',
      'cho',
      'chopro',
      'chordpro',
      'crd',
      'pro',
      'png',
      'jpg',
      'jpeg',
      'pdf'
    ]
  },
  ...FILTERS
]

const dirtyWindows = new WeakSet<BrowserWindow>()
const closing = new WeakSet<BrowserWindow>()

export const windowOf = (sender: WebContents): BrowserWindow => {
  const win = BrowserWindow.fromWebContents(sender)
  if (!win) throw new Error('no window for sender')
  return win
}

/** On desktop a file's id is its path. */
export const refFor = (path: string): FileRef => ({ id: path, name: basename(path) })

async function saveAs(
  win: BrowserWindow,
  file: FileRef | null,
  text: string
): Promise<FileRef | null> {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: file?.id ?? '제목 없음.chord',
    filters: FILTERS
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, text, 'utf8')
  return refFor(result.filePath)
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC.open, async (e): Promise<OpenResult | null> => {
    // Automated checks set this to skip the dialog; normal use never does.
    let path = process.env.CHORDASH_TEST_IMPORT_PATH
    if (!path) {
      const result = await dialog.showOpenDialog(windowOf(e.sender), {
        filters: OPEN_FILTERS,
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      path = result.filePaths[0]
    }
    if (/\.chord$/i.test(path)) {
      const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
      return { kind: 'song', file: refFor(path), text }
    }
    const data = new Uint8Array(await readFile(path))
    return { kind: 'import', picked: { file: refFor(path), data } }
  })

  ipcMain.handle(IPC.save, async (e, file: FileRef | null, text: string) => {
    if (!file) return saveAs(windowOf(e.sender), null, text)
    await writeFile(file.id, text, 'utf8')
    return file
  })

  ipcMain.handle(IPC.saveAs, (e, file: FileRef | null, text: string) =>
    saveAs(windowOf(e.sender), file, text)
  )

  ipcMain.handle(IPC.confirmDiscard, (e, name: string): DiscardChoice => {
    const choice = dialog.showMessageBoxSync(windowOf(e.sender), {
      type: 'warning',
      title: 'Chordash',
      message: `'${name}'의 바뀐 내용을 저장할까요?`,
      detail: '저장하지 않으면 바뀐 내용이 사라집니다.',
      buttons: ['저장', '저장 안 함', '취소'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    return (['save', 'discard', 'cancel'] as const)[choice]
  })

  ipcMain.on(IPC.documentState, (e, state: DocumentState) => {
    const win = windowOf(e.sender)
    if (state.dirty) dirtyWindows.add(win)
    else dirtyWindows.delete(win)
    win.setTitle(appTitle(state.name, state.dirty))
  })

  ipcMain.on(IPC.close, (e) => {
    const win = windowOf(e.sender)
    closing.add(win)
    win.close()
  })
}

/** With unsaved changes, closing is handed to the page, which asks and then closes. */
export function guardClose(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (closing.has(win) || !dirtyWindows.has(win)) return
    e.preventDefault()
    win.webContents.send(IPC.closeRequested)
  })
}
