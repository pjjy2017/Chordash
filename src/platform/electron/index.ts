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
  return {
    openFile: () => bridge.openFile(),
    importFile: (kind) => bridge.importFile(kind),
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
    hasApiKey: () => bridge.hasApiKey(),
    setApiKey: (key) => bridge.setApiKey(key),
    recognize: (request) => bridge.recognize(request),
    cancelRecognize: () => bridge.cancelRecognize()
  }
}
