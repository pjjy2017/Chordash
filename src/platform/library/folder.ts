// The song library: a "Chordash" folder that "열기" lists in a small dialog. On Android it is the
// phone's Documents/Chordash folder (DECISIONS Phase 12); in a web browser the same plugin keeps
// it in the browser's own storage (IndexedDB) — the web "내 곡 보관함" (DECISIONS 1.2).
// Files from elsewhere come in through the system file picker instead.

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export const FOLDER = 'Chordash'
const directory = Directory.Documents

export interface FolderFile {
  name: string
  mtime: number
}

/** How a platform presents its library. */
export interface LibraryPlace {
  /** Where the files are, shown in the file list. */
  where: string
  /** Where a save goes, for the name dialog: "휴대폰의 문서/Chordash 폴더에". */
  saveTo: string
  /** A button on each listed file (Android: 공유, web: 내보내기). */
  fileAction: { label: string; run(name: string): Promise<void> }
  /** More buttons under the list (web: 백업 내보내기 / 가져오기). */
  footer?: { label: string; run(): Promise<void> }[]
}

let ready: Promise<void> | null = null

/** Asks for storage access (older Android only) and makes the folder once. */
function prepare(): Promise<void> {
  ready ??= (async () => {
    try {
      const status = await Filesystem.checkPermissions()
      if (status.publicStorage !== 'granted') await Filesystem.requestPermissions()
    } catch {
      // Newer Android needs no permission for the app's own files.
    }
    try {
      await Filesystem.mkdir({ path: FOLDER, directory, recursive: true })
    } catch {
      // Already there.
    }
  })()
  return ready
}

export async function listFolder(extension: string): Promise<FolderFile[]> {
  await prepare()
  const { files } = await Filesystem.readdir({ path: FOLDER, directory })
  return files
    .filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith(extension))
    .map((f) => ({ name: f.name, mtime: f.mtime }))
    .sort((a, b) => b.mtime - a.mtime)
}

export async function readFromFolder(name: string): Promise<string | null> {
  await prepare()
  try {
    const { data } = await Filesystem.readFile({
      path: `${FOLDER}/${name}`,
      directory,
      encoding: Encoding.UTF8
    })
    return typeof data === 'string' ? data.replace(/^\uFEFF/, '') : null
  } catch {
    return null
  }
}

export async function existsInFolder(name: string): Promise<boolean> {
  await prepare()
  try {
    await Filesystem.stat({ path: `${FOLDER}/${name}`, directory })
    return true
  } catch {
    return false
  }
}

export async function writeToFolder(name: string, text: string): Promise<void> {
  await prepare()
  await Filesystem.writeFile({
    path: `${FOLDER}/${name}`,
    directory,
    data: text,
    encoding: Encoding.UTF8,
    recursive: true
  })
}

/** Android: hands a file to another app (KakaoTalk, Drive, …). */
export async function shareFile(name: string): Promise<void> {
  const { uri } = await Filesystem.getUri({ path: `${FOLDER}/${name}`, directory })
  await Share.share({ title: name, files: [uri] })
}

/** A file name the phone accepts, with the extension. */
export function safeName(name: string, extension: string): string {
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const plain = base.toLowerCase().endsWith(extension) ? base.slice(0, -extension.length) : base
  return `${plain || '제목 없음'}${extension}`
}

/** What the user chose in the folder dialog. */
export type FolderChoice = { names: string[] } | 'elsewhere' | null

const formatDate = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Lists the folder's files of one kind; the user picks one (or several), or goes elsewhere. */
export async function chooseInFolder(
  title: string,
  extension: string,
  multiple: boolean,
  place: LibraryPlace
): Promise<FolderChoice> {
  const files = await listFolder(extension)
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'import-dialog folder-dialog'
    const heading = document.createElement('h2')
    heading.textContent = title
    const where = document.createElement('p')
    where.textContent = place.where
    const list = document.createElement('ol')
    list.className = 'setlist-songs folder-files'
    const chosen = new Set<string>()
    let result: FolderChoice = null

    for (const file of files) {
      const li = document.createElement('li')
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'setlist-row-name folder-file'
      name.textContent = file.name.slice(0, -extension.length)
      const date = document.createElement('small')
      date.textContent = formatDate(file.mtime)
      const share = document.createElement('button')
      share.type = 'button'
      share.textContent = place.fileAction.label
      share.addEventListener('click', () => void place.fileAction.run(file.name))
      name.addEventListener('click', () => {
        if (!multiple) {
          result = { names: [file.name] }
          dialog.close()
          return
        }
        if (chosen.has(file.name)) chosen.delete(file.name)
        else chosen.add(file.name)
        li.classList.toggle('chosen', chosen.has(file.name))
        open.textContent = `${chosen.size}개 넣기`
        open.disabled = chosen.size === 0
      })
      li.append(name, date, share)
      list.append(li)
    }

    const empty = document.createElement('p')
    empty.className = 'setlist-empty'
    empty.textContent = '아직 저장한 파일이 없어요.'
    empty.hidden = files.length > 0

    const actions = document.createElement('div')
    actions.className = 'import-actions'
    const elsewhere = document.createElement('button')
    elsewhere.type = 'button'
    elsewhere.textContent = '다른 곳에서 가져오기…'
    elsewhere.addEventListener('click', () => {
      result = 'elsewhere'
      dialog.close()
    })
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '취소'
    cancel.addEventListener('click', () => dialog.close())
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'primary'
    open.textContent = '0개 넣기'
    open.disabled = true
    open.addEventListener('click', () => {
      result = { names: [...chosen] }
      dialog.close()
    })
    const extra = (place.footer ?? []).map(({ label, run }) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => {
        dialog.close()
        void run()
      })
      return button
    })
    actions.append(elsewhere, ...extra, spacer, cancel, ...(multiple ? [open] : []))

    dialog.append(heading, where, list, empty, actions)
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(result)
    })
    document.body.append(dialog)
    dialog.showModal()
  })
}

/**
 * Asks for a file name in the app's own dialog: Android's built-in prompt leaves out the
 * suggested name. Enter saves; the name comes back without changes, null when cancelled.
 */
export function askFileName(
  suggested: string,
  extension: string,
  saveTo: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'import-dialog folder-dialog'
    const form = document.createElement('form')
    form.method = 'dialog'
    const heading = document.createElement('h2')
    heading.textContent = '파일 이름'
    const note = document.createElement('p')
    note.textContent = `${saveTo} ${extension} 파일로 저장해요.`
    const input = document.createElement('input')
    input.className = 'file-name-input'
    input.value = suggested
    input.spellcheck = false
    input.enterKeyHint = 'done'
    const actions = document.createElement('div')
    actions.className = 'import-actions'
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '취소'
    const save = document.createElement('button')
    save.className = 'primary'
    save.textContent = '저장'
    actions.append(spacer, cancel, save)
    form.append(heading, note, input, actions)
    dialog.append(form)

    let result: string | null = null
    cancel.addEventListener('click', () => dialog.close())
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (!input.value.trim()) return input.focus()
      result = input.value
      dialog.close()
    })
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(result)
    })
    document.body.append(dialog)
    dialog.showModal()
    input.select()
  })
}
