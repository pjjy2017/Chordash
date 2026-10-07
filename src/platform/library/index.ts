// Songs and setlists kept in the library folder (./folder.ts), shared by the Android app and the
// web version: opening from the folder list, saving under a name, setlists that read their songs
// from the folder again. Files picked from elsewhere are kept in memory; saving them puts them in
// the folder, and a setlist keeps copies of them inside (Phase 11 format).

import { readHeaderLine } from '../../core/header'
import { formatSetlist, parseSetlist } from '../../core/setlist'
import { pickWithInput, withoutBom, type PickerType } from '../shared'
import type { FileRef, Platform, SetlistSong } from '../types'
import {
  askFileName,
  chooseInFolder,
  existsInFolder,
  readFromFolder,
  safeName,
  writeToFolder,
  type LibraryPlace
} from './folder'

export { FOLDER, listFolder, readFromFolder, writeToFolder, shareFile } from './folder'
export type { LibraryPlace } from './folder'

const SONG = '.chord'
const SETLIST = '.setlist'

const PICK: Record<'song' | 'setlist', PickerType> = {
  song: { description: 'Chordash 악보', accept: { 'text/plain': ['.chord'] } },
  setlist: { description: 'Chordash 셋리스트', accept: { 'text/plain': ['.setlist'] } }
}

/**
 * A FileRef id is `folder:<name>` for files in the library folder, or `copy:<n>` for files picked
 * from elsewhere, which are only kept in memory (saving them goes to the folder).
 */
const inFolder = (file: FileRef): string | null =>
  file.id.startsWith('folder:') ? file.id.slice('folder:'.length) : null
const folderRef = (name: string): FileRef => ({ id: `folder:${name}`, name })
const copies = new Map<string, string>()
let nextCopy = 1
function copyRef(name: string, text: string): FileRef {
  const ref = { id: `copy:${nextCopy++}`, name }
  copies.set(ref.id, text)
  return ref
}

async function readText(file: FileRef): Promise<string | null> {
  const name = inFolder(file)
  return name ? readFromFolder(name) : (copies.get(file.id) ?? null)
}

const songTitle = (text: string): string => readHeaderLine(text, 'title') || '제목 없음'

type LibraryMethods = Pick<
  Platform,
  'openFile' | 'saveFile' | 'saveFileAs' | 'pickSongs' | 'readSong' | 'openSetlist' | 'saveSetlist'
>

export function libraryMethods(place: LibraryPlace): LibraryMethods {
  /** Asks for a file name in the folder; confirms before replacing another file. */
  async function askName(suggested: string, extension: string): Promise<string | null> {
    for (;;) {
      const typed = await askFileName(suggested, extension, place.saveTo)
      if (typed === null) return null
      const name = safeName(typed, extension)
      if (!(await existsInFolder(name))) return name
      if (window.confirm(`'${name}'이(가) 이미 있어요. 바꿔 쓸까요?`)) return name
      suggested = name.slice(0, -extension.length)
    }
  }

  async function saveText(
    file: FileRef | null,
    text: string,
    suggested: string,
    extension: string,
    asNew: boolean
  ): Promise<FileRef | null> {
    const current = file && !asNew ? inFolder(file) : null
    const name = current ?? (await askName(suggested, extension))
    if (!name) return null
    await writeToFolder(name, text)
    return folderRef(name)
  }

  const choose = (
    title: string,
    extension: string,
    multiple: boolean
  ): ReturnType<typeof chooseInFolder> => chooseInFolder(title, extension, multiple, place)

  return {
    async openFile() {
      const choice = await choose('곡 열기', SONG, false)
      if (!choice) return null
      if (choice !== 'elsewhere') {
        const name = choice.names[0]
        const text = await readFromFolder(name)
        return text === null ? null : { file: folderRef(name), text }
      }
      const [picked] = await pickWithInput(PICK.song, false)
      if (!picked) return null
      const text = withoutBom(await picked.text())
      return { file: copyRef(picked.name, text), text }
    },

    saveFile: (file, text) => saveText(file, text, file?.name ?? songTitle(text), SONG, false),
    saveFileAs: (file, text) => saveText(file, text, file?.name ?? songTitle(text), SONG, true),

    async pickSongs() {
      const choice = await choose('셋리스트에 넣을 곡', SONG, true)
      if (!choice) return []
      if (choice !== 'elsewhere') return choice.names.map(folderRef)
      const picked = await pickWithInput(PICK.song, true)
      return Promise.all(picked.map(async (f) => copyRef(f.name, withoutBom(await f.text()))))
    },

    readSong: readText,

    async openSetlist() {
      const choice = await choose('셋리스트 열기', SETLIST, false)
      if (!choice) return null
      let file: FileRef
      let text: string | null
      if (choice === 'elsewhere') {
        const [picked] = await pickWithInput(PICK.setlist, false)
        if (!picked) return null
        text = await picked.text()
        file = copyRef(picked.name, text)
      } else {
        file = folderRef(choice.names[0])
        text = await readFromFolder(choice.names[0])
        if (text === null) return null
      }
      const { title, entries, songs } = parseSetlist(text)
      const fromFolder = inFolder(file) !== null
      return {
        file,
        setlist: {
          title,
          songs: await Promise.all(
            entries.map(async (entry): Promise<SetlistSong> => {
              const kept = songs?.[entry.path]
              const name = entry.path.split(/[\\/]/).pop() || entry.path
              // Songs next to the setlist are read from the folder; others from kept copies.
              if (fromFolder && kept === undefined && (await existsInFolder(name)))
                return { file: folderRef(name), key: entry.key, found: true }
              if (kept !== undefined)
                return { file: copyRef(name, kept), key: entry.key, found: true }
              return { file: copyRef(name, ''), key: entry.key, found: false }
            })
          )
        }
      }
    },

    async saveSetlist(file, setlist) {
      // Songs in the folder are listed by name; songs from elsewhere are kept inside.
      const entries: { path: string; key: string | null }[] = []
      const songs: Record<string, string> = {}
      for (const song of setlist.songs) {
        const name = inFolder(song.file)
        entries.push({ path: name ?? song.file.name, key: song.key })
        if (!name) {
          const text = await readText(song.file)
          if (text) songs[song.file.name] = text
        }
      }
      const text = formatSetlist({
        title: setlist.title,
        entries,
        ...(Object.keys(songs).length ? { songs } : {})
      })
      return saveText(file, text, setlist.title || '셋리스트', SETLIST, file === null)
    }
  }
}
