// Electron side of setlists: picking song files, reading them, and the `.setlist` file itself.
// Song paths are stored relative to the setlist file, so a folder can be moved as a whole.

import { dialog, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import { formatSetlist, parseSetlist } from '../core/setlist'
import { IPC } from '../platform/electron/bridge'
import type { FileRef, OpenedSetlist, Setlist } from '../platform/types'
import { refFor, windowOf } from './files'

const SETLIST_FILTERS = [
  { name: 'Chordash 셋리스트', extensions: ['setlist'] },
  { name: '모든 파일', extensions: ['*'] }
]

/** Song path as written in the setlist: relative with `/`, or absolute on another drive. */
function songPath(setlistPath: string, songPath: string): string {
  const rel = relative(dirname(setlistPath), songPath)
  return rel && !isAbsolute(rel) ? rel.split(sep).join('/') : songPath
}

/**
 * Copies of songs kept inside setlists made by the web version, by resolved path. Used when
 * the song file itself is not there, and written back when such a setlist is saved again.
 */
const keptSongs = new Map<string, string>()

async function readSetlist(path: string): Promise<OpenedSetlist> {
  const { title, entries, songs } = parseSetlist(await readFile(path, 'utf8'))
  return {
    file: refFor(path),
    setlist: {
      title,
      songs: entries.map((entry) => {
        const song = resolve(dirname(path), entry.path)
        const kept = songs?.[entry.path]
        if (kept !== undefined) keptSongs.set(song, kept)
        return { file: refFor(song), key: entry.key, found: existsSync(song) || kept !== undefined }
      })
    }
  }
}

async function writeSetlist(path: string, setlist: Setlist): Promise<FileRef> {
  const entries = setlist.songs.map((song) => ({
    path: songPath(path, song.file.id),
    key: song.key
  }))
  // Songs that exist only as kept copies stay inside the setlist.
  const songs = Object.fromEntries(
    setlist.songs.flatMap((song, i) => {
      const kept = keptSongs.get(song.file.id)
      return kept !== undefined && !existsSync(song.file.id) ? [[entries[i].path, kept]] : []
    })
  )
  const text = formatSetlist({
    title: setlist.title,
    entries,
    ...(Object.keys(songs).length ? { songs } : {})
  })
  await writeFile(path, text, 'utf8')
  return refFor(path)
}

export function registerSetlistHandlers(): void {
  // Automated checks set these to skip the native dialogs; normal use never does.
  const testSongs = (): string[] | null =>
    process.env.CHORDASH_TEST_SONG_PATHS?.split(';').filter(Boolean) ?? null
  const testSetlist = (): string | null => process.env.CHORDASH_TEST_SETLIST_PATH ?? null

  ipcMain.handle(IPC.pickSongs, async (e): Promise<FileRef[]> => {
    const test = testSongs()
    if (test) return test.map(refFor)
    const result = await dialog.showOpenDialog(windowOf(e.sender), {
      title: '셋리스트에 넣을 곡',
      filters: [
        { name: 'Chordash 악보', extensions: ['chord'] },
        { name: '모든 파일', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths.map(refFor)
  })

  ipcMain.handle(IPC.readSong, async (_e, file: FileRef): Promise<string | null> => {
    try {
      return (await readFile(file.id, 'utf8')).replace(/^\uFEFF/, '')
    } catch {
      return keptSongs.get(file.id) ?? null
    }
  })

  ipcMain.handle(IPC.openSetlist, async (e): Promise<OpenedSetlist | null> => {
    const test = testSetlist()
    if (test) return existsSync(test) ? readSetlist(test) : null
    const result = await dialog.showOpenDialog(windowOf(e.sender), {
      filters: SETLIST_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return readSetlist(result.filePaths[0])
  })

  ipcMain.handle(
    IPC.saveSetlist,
    async (e, file: FileRef | null, setlist: Setlist): Promise<FileRef | null> => {
      if (file) return writeSetlist(file.id, setlist)
      const test = testSetlist()
      if (test) return writeSetlist(test, setlist)
      const result = await dialog.showSaveDialog(windowOf(e.sender), {
        defaultPath: `${setlist.title || '셋리스트'}.setlist`,
        filters: SETLIST_FILTERS
      })
      if (result.canceled || !result.filePath) return null
      return writeSetlist(result.filePath, setlist)
    }
  )
}
