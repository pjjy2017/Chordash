// The song library: places where songs and setlists are kept, listed in a small "열기" dialog.
//   - local: a "Chordash" folder — on Android the phone's Documents/Chordash folder (Phase 12); in a
//     web browser the same plugin keeps it in the browser's own storage, IndexedDB (1.2).
//   - Google Drive (web, 1.3): the Chordash folder in the user's own Drive (../web/drive.ts).
// With more than one place, the dialogs show a switch between them. Files from elsewhere come in
// through the system file picker instead.

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export const FOLDER = 'Chordash'
const directory = Directory.Documents

export interface FolderFile {
  name: string
  mtime: number
}

/** One place songs can be kept. */
export interface LibraryStore {
  /** Short id, used in FileRef ids (`local:곡.chord`, `drive:곡.chord`). */
  id: string
  /** Name on the switch: "이 브라우저", "구글 드라이브". */
  label: string
  /** Where the files are, shown above the list. */
  where: string
  /** Where a save goes, for the name dialog: "휴대폰의 문서/Chordash 폴더에". */
  saveTo: string
  list(extension: string): Promise<FolderFile[]>
  read(name: string): Promise<string | null>
  exists(name: string): Promise<boolean>
  write(name: string, text: string): Promise<void>
  /** Places that need signing in: whether it is ready, and how to get ready (false = cancelled). */
  isConnected?(): boolean
  connect?(): Promise<boolean>
  /** Shown with the sign-in button while not connected. */
  connectNote?: string
  /** Gets sign-in ready early, so the sign-in popup opens straight from the click. */
  warmUp?(): void
  /** A button on each listed file (Android: 공유, web: 내보내기). */
  fileAction?: { label: string; run(name: string): Promise<void> }
  /** More buttons under the list (web: 백업 내보내기 / 가져오기). */
  footer?: { label: string; run(): Promise<void> }[]
}

// --- the local folder ------------------------------------------------------------------------

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

/** The local folder as a library place; the platform says how to describe it. */
export function localStore(
  how: Pick<LibraryStore, 'label' | 'where' | 'saveTo' | 'fileAction' | 'footer'>
): LibraryStore {
  return {
    id: 'local',
    ...how,
    list: listFolder,
    read: readFromFolder,
    exists: existsInFolder,
    write: writeToFolder
  }
}

/** A file name the phone (and Drive) accepts, with the extension. */
export function safeName(name: string, extension: string): string {
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const plain = base.toLowerCase().endsWith(extension) ? base.slice(0, -extension.length) : base
  return `${plain || '제목 없음'}${extension}`
}

// --- choosing a place -------------------------------------------------------------------------

const LAST_STORE = 'chordash.libraryStore'

/** The place used last (new saves go there), or the first one. */
export function lastStore(stores: LibraryStore[]): LibraryStore {
  let id: string | null = null
  try {
    id = localStorage.getItem(LAST_STORE)
  } catch {
    // First place.
  }
  return stores.find((s) => s.id === id) ?? stores[0]
}

export function rememberStore(store: LibraryStore): void {
  try {
    localStorage.setItem(LAST_STORE, store.id)
  } catch {
    // Not remembered.
  }
}

/** "이 브라우저 | 구글 드라이브" — nothing when there is only one place. */
function storeSwitch(
  stores: LibraryStore[],
  current: LibraryStore,
  pick: (store: LibraryStore) => void
): HTMLElement | null {
  if (stores.length < 2) return null
  const bar = document.createElement('div')
  bar.className = 'store-switch'
  for (const store of stores) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = store.label
    button.setAttribute('aria-pressed', String(store === current))
    button.addEventListener('click', () => {
      bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'))
      button.setAttribute('aria-pressed', 'true')
      pick(store)
    })
    bar.append(button)
  }
  return bar
}

const button = (text: string, className = ''): HTMLButtonElement => {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  if (className) b.className = className
  return b
}

/** What the user chose in the folder dialog. */
export type FolderChoice = { store: LibraryStore; names: string[] } | 'elsewhere' | 'paste' | null

const formatDate = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const SORT = 'chordash.librarySort'

/**
 * Search box and sort order over a file list (1.5). Sorting is remembered on this device;
 * a search matches any part of the name, ignoring case and spaces.
 */
function listTools(
  rows: { file: FolderFile; li: HTMLLIElement }[],
  list: HTMLElement,
  empty: HTMLElement
): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'folder-tools'
  if (rows.length < 2) return bar
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = '이름으로 찾기'
  search.className = 'folder-search'
  search.enterKeyHint = 'search'
  const sort = document.createElement('select')
  sort.className = 'folder-sort'
  sort.setAttribute('aria-label', '정렬')
  for (const [value, label] of [
    ['recent', '최근순'],
    ['name', '이름순']
  ]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    sort.append(option)
  }
  try {
    sort.value = localStorage.getItem(SORT) === 'name' ? 'name' : 'recent'
  } catch {
    // Newest first.
  }
  const plain = (text: string): string => text.toLowerCase().replace(/\s+/g, '')
  const refresh = (): void => {
    const wanted = plain(search.value)
    const ordered = [...rows].sort((a, b) =>
      sort.value === 'name'
        ? a.file.name.localeCompare(b.file.name, 'ko', { numeric: true })
        : b.file.mtime - a.file.mtime
    )
    let shown = 0
    for (const { file, li } of ordered) {
      li.hidden = !plain(file.name).includes(wanted)
      if (!li.hidden) shown++
      list.append(li)
    }
    empty.hidden = shown > 0
    empty.textContent = '찾는 이름이 없어요.'
  }
  search.addEventListener('input', refresh)
  sort.addEventListener('change', () => {
    try {
      localStorage.setItem(SORT, sort.value)
    } catch {
      // Not remembered.
    }
    refresh()
  })
  refresh()
  bar.append(search, sort)
  return bar
}

/**
 * Lists one kind of file in a place; the user picks one (or several), or goes elsewhere.
 * `paste` adds "복사한 악보 붙여넣기…" (the song "열기", 1.4).
 */
export function chooseInFolder(
  title: string,
  extension: string,
  multiple: boolean,
  stores: LibraryStore[],
  paste = false
): Promise<FolderChoice> {
  return new Promise((resolve) => {
    let store = lastStore(stores)
    const dialog = document.createElement('dialog')
    dialog.className = 'import-dialog folder-dialog'
    const heading = document.createElement('h2')
    heading.textContent = title
    const where = document.createElement('p')
    const body = document.createElement('div')
    body.className = 'folder-body'
    const chosen = new Set<string>()
    let result: FolderChoice = null

    const actions = document.createElement('div')
    actions.className = 'import-actions'
    const elsewhere = button('다른 파일…')
    elsewhere.addEventListener('click', () => {
      result = 'elsewhere'
      dialog.close()
    })
    const pasteText = button('복사한 악보 붙여넣기…')
    pasteText.addEventListener('click', () => {
      result = 'paste'
      dialog.close()
    })
    const footer = document.createElement('span')
    footer.className = 'folder-footer'
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    const cancel = button('취소')
    cancel.addEventListener('click', () => dialog.close())
    const open = button('0개 넣기', 'primary')
    open.disabled = true
    open.addEventListener('click', () => {
      result = { store, names: [...chosen] }
      dialog.close()
    })
    actions.append(
      elsewhere,
      ...(paste ? [pasteText] : []),
      footer,
      spacer,
      cancel,
      ...(multiple ? [open] : [])
    )

    /** Shows the current place: its files, or a sign-in button. */
    async function show(): Promise<void> {
      where.textContent = store.where
      chosen.clear()
      open.textContent = '0개 넣기'
      open.disabled = true
      footer.replaceChildren(
        ...(store.footer ?? []).map(({ label, run }) => {
          const b = button(label)
          b.addEventListener('click', () => {
            dialog.close()
            void run()
          })
          return b
        })
      )
      if (store.isConnected && !store.isConnected()) {
        store.warmUp?.()
        const note = document.createElement('p')
        note.className = 'setlist-empty'
        note.textContent = store.connectNote ?? ''
        const connect = button('구글로 로그인', 'connect-button')
        connect.addEventListener('click', async () => {
          if (await store.connect?.()) void show()
        })
        body.replaceChildren(note, connect)
        return
      }
      const loading = document.createElement('p')
      loading.className = 'setlist-empty'
      loading.textContent = '불러오는 중…'
      body.replaceChildren(loading)
      let files: FolderFile[]
      try {
        files = await store.list(extension)
      } catch (error) {
        loading.textContent = `목록을 불러오지 못했어요: ${error instanceof Error ? error.message : String(error)}`
        return
      }
      const list = document.createElement('ol')
      list.className = 'setlist-songs folder-files'
      const rows: { file: FolderFile; li: HTMLLIElement }[] = []
      for (const file of files) {
        const li = document.createElement('li')
        rows.push({ file, li })
        const name = button(file.name.slice(0, -extension.length), 'setlist-row-name folder-file')
        const date = document.createElement('small')
        date.textContent = formatDate(file.mtime)
        name.addEventListener('click', () => {
          if (!multiple) {
            result = { store, names: [file.name] }
            dialog.close()
            return
          }
          if (chosen.has(file.name)) chosen.delete(file.name)
          else chosen.add(file.name)
          li.classList.toggle('chosen', chosen.has(file.name))
          open.textContent = `${chosen.size}개 넣기`
          open.disabled = chosen.size === 0
        })
        li.append(name, date)
        if (store.fileAction) {
          const action = button(store.fileAction.label)
          const run = store.fileAction.run
          action.addEventListener('click', () => void run(file.name))
          li.append(action)
        }
        list.append(li)
      }
      const empty = document.createElement('p')
      empty.className = 'setlist-empty'
      empty.textContent = '아직 저장한 파일이 없어요.'
      empty.hidden = files.length > 0
      body.replaceChildren(listTools(rows, list, empty), list, empty)
    }

    const switcher = storeSwitch(stores, store, (picked) => {
      store = picked
      rememberStore(store)
      void show()
    })
    dialog.append(heading, ...(switcher ? [switcher] : []), where, body, actions)
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(result)
    })
    document.body.append(dialog)
    dialog.showModal()
    void show()
  })
}

/**
 * Asks for a file name — and, with more than one place, where to keep it. The app's own dialog:
 * Android's built-in prompt leaves out the suggested name. Enter saves; null when cancelled.
 */
export function askFileName(
  suggested: string,
  extension: string,
  stores: LibraryStore[]
): Promise<{ name: string; store: LibraryStore } | null> {
  return new Promise((resolve) => {
    let store = lastStore(stores)
    const dialog = document.createElement('dialog')
    dialog.className = 'import-dialog folder-dialog'
    const form = document.createElement('form')
    form.method = 'dialog'
    const heading = document.createElement('h2')
    heading.textContent = '파일 이름'
    const note = document.createElement('p')
    const describe = (): void => {
      note.textContent = `${store.saveTo} ${extension} 파일로 저장해요.`
    }
    describe()
    stores.forEach((s) => s.warmUp?.())
    const switcher = storeSwitch(stores, store, (picked) => {
      store = picked
      describe()
    })
    const input = document.createElement('input')
    input.className = 'file-name-input'
    input.value = suggested
    input.spellcheck = false
    input.enterKeyHint = 'done'
    const actions = document.createElement('div')
    actions.className = 'import-actions'
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    const cancel = button('취소')
    const save = document.createElement('button')
    save.className = 'primary'
    save.textContent = '저장'
    actions.append(spacer, cancel, save)
    form.append(heading, ...(switcher ? [switcher] : []), note, input, actions)
    dialog.append(form)

    let result: { name: string; store: LibraryStore } | null = null
    cancel.addEventListener('click', () => dialog.close())
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!input.value.trim()) return input.focus()
      // A place that needs signing in asks now; cancelling keeps the dialog open.
      if (store.isConnected && !store.isConnected() && !(await store.connect?.())) return
      rememberStore(store)
      result = { name: input.value, store }
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
