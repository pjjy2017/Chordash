// In-app updates for the desktop app (1.5): electron-updater with GitHub Releases. The release
// carries latest.yml (made by electron-builder) beside the installer; the app asks for it,
// downloads the new installer when the user says so, and restarts into it.

import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../platform/electron/bridge'
import type { UpdateInfo } from '../platform/types'

export function registerUpdateHandlers(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // Failures reach the page through the calls below; an unheard 'error' event would crash.
  autoUpdater.on('error', () => undefined)

  ipcMain.handle(IPC.checkUpdate, async (): Promise<UpdateInfo | null> => {
    // Only installed copies update; `npm run dev` would look for files that are not there.
    if (!app.isPackaged) return null
    // Offline or no answer: the error goes to the page, which says so only when asked.
    const result = await autoUpdater.checkForUpdates()
    return result?.isUpdateAvailable ? { version: result.updateInfo.version } : null
  })

  ipcMain.handle(IPC.installUpdate, async (e) => {
    const onProgress = (p: { percent: number }): void => {
      if (!e.sender.isDestroyed()) e.sender.send(IPC.updateProgress, p.percent)
    }
    autoUpdater.on('download-progress', onProgress)
    try {
      await autoUpdater.downloadUpdate()
    } finally {
      autoUpdater.off('download-progress', onProgress)
    }
    // Quietly, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  })
}
