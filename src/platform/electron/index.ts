// Platform implementation for the Electron desktop app, on top of the preload bridge.

import type { Platform } from '../types'
import type { ElectronBridge } from './bridge'

declare global {
  interface Window {
    chordashBridge: ElectronBridge
  }
}

export function createElectronPlatform(): Platform {
  const bridge = window.chordashBridge
  // One listener for download progress; each install says where it goes.
  let onProgress: (percent: number) => void = () => undefined
  bridge.onUpdateProgress((percent) => onProgress(percent))
  return {
    features: {
      ai: true,
      printPdf: false,
      setlistKeepsSongs: false,
      offersDesktopApp: false,
      legalLinks: false,
      libraryDialog: false
    },
    openFile: () => bridge.openFile(),
    recentFiles: () => bridge.recentFiles(),
    openRecent: (file) => bridge.openRecent(file),
    saveFile: (file, text) => bridge.saveFile(file, text),
    saveFileAs: (file, text) => bridge.saveFileAs(file, text),
    exportPdf: (html, suggestedName) => bridge.exportPdf(html, suggestedName),
    confirmDiscard: (name) => bridge.confirmDiscard(name),
    setDocumentState: (state) => bridge.setDocumentState(state),
    onBeforeClose: (handler) => {
      bridge.onCloseRequested(async () => {
        if (await handler()) bridge.closeWindow()
      })
    },
    pickSongs: () => bridge.pickSongs(),
    readSong: (file) => bridge.readSong(file),
    openSetlist: () => bridge.openSetlist(),
    saveSetlist: (file, setlist) => bridge.saveSetlist(file, setlist),
    hasApiKey: () => bridge.hasApiKey(),
    setApiKey: (key) => bridge.setApiKey(key),
    recognize: (request) => bridge.recognize(request),
    cancelRecognize: () => bridge.cancelRecognize(),
    updates: {
      check: () => bridge.checkUpdate(),
      install: async (progress) => {
        onProgress = progress
        await bridge.installUpdate()
      },
      installLabel: '업데이트'
    }
  }
}
