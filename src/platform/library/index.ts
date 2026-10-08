// Songs and setlists kept in library places (./folder.ts), shared by the Android app and the web
// version: opening from a place's list, saving under a name, setlists that read their songs from
// the same place again. Files picked from elsewhere are kept in memory; saving them puts them in a
// place, and a setlist keeps copies of them inside (Phase 11 format).

import { readHeaderLine } from '../../core/header'
import { formatSetlist, parseSetlist } from '../../core/setlist'
import { pickWithInput, withoutBom, type PickerType } from '../shared'
import type { FileRef, Platform, SetlistSong } from '../types'
import {
  askFileName,
  chooseInFolder,
  safeName,
  type FolderChoice,
  type LibraryStore
} from './folder'

export { FOLDER, listFolder, localStore, readFromFolder, shareFile, writeToFolder } from './folder'
export type { FolderFile, LibraryStore } from './folder'

const SONG = '.chord'
const SETLIST = '.setlist'

const PICK: Record<'song' | 'setlist', PickerType> = {
  song: { description: 'Chordash 악보', accept: { 'text/plain': ['.chord'] } },
  setlist: { description: 'Chordash 셋리스트', accept: { 'text/plain': ['.setlist'] } }
}

const copies = new Map<string, string>()
let nextCopy = 1
function copyRef(name: string, text: string): FileRef {
  const ref = { id: `copy:${nextCopy++}`, name }
  copies.set(ref.id, text)
  return ref
}

const songTitle = (text: string): string => readHeaderLine(text, 'title') || '제목 없음'

type LibraryMethods = Pick<
  Platform,
  'openFile' | 'saveFile' | 'saveFileAs' | 'pickSongs' | 'readSong' | 'openSetlist' | 'saveSetlist'
>

/** Library methods over the given places; the first is the default. */
export function libraryMethods(stores: LibraryStore[]): LibraryMethods {
  /** A FileRef id is `<place id>:<file name>`, or `copy:<n>` for files from elsewhere. */
  const refIn = (store: LibraryStore, name: string): FileRef => ({
    id: `${store.id}:${name}`,
    name
  })
  function placeOf(file: FileRef): { store: LibraryStore; name: string } | null {
    const colon = file.id.indexOf(':')
    const store = stores.find((s) => s.id === file.id.slice(0, colon))
    return store ? { store, name: file.id.slice(colon + 1) } : null
  }

  async function readText(file: FileRef): Promise<string | null> {
    const at = placeOf(file)
    return at ? at.store.read(at.name) : (copies.get(file.id) ?? null)
  }

  /** Asks for a name and a place; confirms before replacing another file. */
  async function askName(
    suggested: string,
    extension: string
  ): Promise<{ store: LibraryStore; name: string } | null> {
    for (;;) {
      const answer = await askFileName(suggested, extension, stores)
      if (answer === null) return null
      const name = safeName(answer.name, extension)
      if (!(await answer.store.exists(name))) return { store: answer.store, name }
      if (window.confirm(`'${name}'이(가) 이미 있어요. 바꿔 쓸까요?`))
        return { store: answer.store, name }
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
    const at = (file && !asNew ? placeOf(file) : null) ?? (await askName(suggested, extension))
    if (!at) return null
    await at.store.write(at.name, text)
    return refIn(at.store, at.name)
  }

  const choose = (title: string, extension: string, multiple: boolean): Promise<FolderChoice> =>
    chooseInFolder(title, extension, multiple, stores)

  return {
    async openFile() {
      const choice = await choose('곡 열기', SONG, false)
      if (!choice) return null
      if (choice !== 'elsewhere') {
        const name = choice.names[0]
        const text = await choice.store.read(name)
        return text === null ? null : { file: refIn(choice.store, name), text }
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
      if (choice !== 'elsewhere') return choice.names.map((name) => refIn(choice.store, name))
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
        file = refIn(choice.store, choice.names[0])
        text = await choice.store.read(choice.names[0])
        if (text === null) return null
      }
      const { title, entries, songs } = parseSetlist(text)
      const home = choice === 'elsewhere' ? null : choice.store
      return {
        file,
        setlist: {
          title,
          songs: await Promise.all(
            entries.map(async (entry): Promise<SetlistSong> => {
              const kept = songs?.[entry.path]
              const name = entry.path.split(/[\\/]/).pop() || entry.path
              // Songs next to the setlist are read from its place; others from kept copies.
              if (home && kept === undefined && (await home.exists(name)))
                return { file: refIn(home, name), key: entry.key, found: true }
              if (kept !== undefined)
                return { file: copyRef(name, kept), key: entry.key, found: true }
              return { file: copyRef(name, ''), key: entry.key, found: false }
            })
          )
        }
      }
    },

    async saveSetlist(file, setlist) {
      // Where the setlist goes decides which songs it can list by name.
      const at =
        (file ? placeOf(file) : null) ?? (await askName(setlist.title || '셋리스트', SETLIST))
      if (!at) return null
      // Songs in the same place are listed by name; others are kept inside.
      const entries: { path: string; key: string | null }[] = []
      const songs: Record<string, string> = {}
      for (const song of setlist.songs) {
        const songAt = placeOf(song.file)
        const samePlace = songAt !== null && songAt.store === at.store
        entries.push({ path: samePlace ? songAt.name : song.file.name, key: song.key })
        if (!samePlace) {
          const text = await readText(song.file)
          if (text) songs[song.file.name] = text
        }
      }
      const text = formatSetlist({
        title: setlist.title,
        entries,
        ...(Object.keys(songs).length ? { songs } : {})
      })
      await at.store.write(at.name, text)
      return refIn(at.store, at.name)
    }
  }
}
