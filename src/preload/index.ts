// Exposes the Electron IPC bridge used by src/platform/electron. Nothing else is exposed
// to the page: the renderer reaches the device only through the platform interface.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ElectronBridge } from '../platform/electron/bridge'

const bridge: ElectronBridge = {
  openFile: () => ipcRenderer.invoke(IPC.open),
  saveFile: (file, text) => ipcRenderer.invoke(IPC.save, file, text),
  saveFileAs: (file, text) => ipcRenderer.invoke(IPC.saveAs, file, text),
  exportPdf: (html, suggestedName) => ipcRenderer.invoke(IPC.exportPdf, html, suggestedName),
  confirmDiscard: (name) => ipcRenderer.invoke(IPC.confirmDiscard, name),
  setDocumentState: (state) => ipcRenderer.send(IPC.documentState, state),
  onCloseRequested: (callback) => {
    ipcRenderer.on(IPC.closeRequested, () => callback())
  },
  closeWindow: () => ipcRenderer.send(IPC.close),
  pickSongs: () => ipcRenderer.invoke(IPC.pickSongs),
  readSong: (file) => ipcRenderer.invoke(IPC.readSong, file),
  openSetlist: () => ipcRenderer.invoke(IPC.openSetlist),
  saveSetlist: (file, setlist) => ipcRenderer.invoke(IPC.saveSetlist, file, setlist),
  hasApiKey: () => ipcRenderer.invoke(IPC.hasApiKey),
  setApiKey: (key) => ipcRenderer.invoke(IPC.setApiKey, key),
  recognize: (request) => ipcRenderer.invoke(IPC.recognize, request),
  cancelRecognize: () => ipcRenderer.send(IPC.cancelRecognize)
}

contextBridge.exposeInMainWorld('chordashBridge', bridge)
