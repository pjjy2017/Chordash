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
    saveFile: (file, text) => bridge.saveFile(file, text),
    saveFileAs: (file, text) => bridge.saveFileAs(file, text),
    confirmDiscard: (name) => bridge.confirmDiscard(name),
    setDocumentState: (state) => bridge.setDocumentState(state),
    onBeforeClose: (handler) => {
      bridge.onCloseRequested(async () => {
        if (await handler()) bridge.closeWindow()
      })
    }
  }
}
