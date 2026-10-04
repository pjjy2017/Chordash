// Electron side of platform.exportPdf: print the page HTML in a hidden window with printToPDF.

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { IPC } from '../platform/electron/bridge'
import { refFor, windowOf } from './files'

/** Renders a standalone HTML document to PDF bytes. Page size and margins come from its CSS. */
async function renderPdf(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'chordash-'))
  const file = join(dir, 'print.html')
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await writeFile(file, html, 'utf8')
    await printWindow.loadFile(file)
    // Embedded fonts must be ready, or the PDF would use fallback fonts.
    await printWindow.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    return await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  } finally {
    printWindow.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

export function registerPdfHandlers(): void {
  ipcMain.handle(IPC.exportPdf, async (e, html: string, suggestedName: string) => {
    // Automated checks set this to skip the native save dialog; normal use never does.
    const testPath = process.env.CHORDASH_TEST_PDF_PATH
    const result = testPath
      ? { canceled: false, filePath: testPath }
      : await dialog.showSaveDialog(windowOf(e.sender), {
          defaultPath: suggestedName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, await renderPdf(html))
    return refFor(result.filePath)
  })
}
