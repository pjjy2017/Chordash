// Platform implementation for the web version (https://chordash.app, ROADMAP Phase 11).
// Songs and setlists live in "내 곡 보관함" — the library folder (../library), which a browser
// keeps in its own storage (IndexedDB): no downloads on every save (DECISIONS 1.2). Each file can
// be exported, and the whole library backed up to one file and restored. PDFs come from the
// browser's print dialog. No AI: an API key cannot be kept safely in a public web page.

import { appTitle } from '../../core/version'
import {
  connectDrive,
  driveProfile,
  driveStore,
  isDriveConnected,
  onDriveChange,
  signOutDrive,
  warmUpDrive
} from './drive'
import {
  lastStore,
  libraryMethods,
  listFolder,
  localStore,
  readFromFolder,
  rememberStore,
  TEXT_CHARTS,
  writeToFolder,
  type LibraryStore
} from '../library'
import { download, pickWithInput, printTip, type PickerType } from '../shared'
import type { Account, Platform } from '../types'

const BACKUP: PickerType = {
  description: 'Chordash 보관함 백업',
  accept: { 'application/json': ['.json'] }
}

/** Prints a standalone HTML document from a hidden frame. */
async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  frame.srcdoc = html
  document.body.append(frame)
  await loaded
  const view = frame.contentWindow!
  // Embedded fonts must be ready, or the PDF would use fallback fonts.
  await view.document.fonts.ready
  view.focus()
  view.print()
  // Some browsers return from print() before the dialog closes.
  setTimeout(() => frame.remove(), 60_000)
}

// --- library backup ------------------------------------------------------------------------

/** One file holding every song and setlist in the library. */
interface Backup {
  app: 'chordash'
  version: 1
  exported: string
  files: { name: string; text: string }[]
}

async function exportBackup(): Promise<void> {
  const names = [...(await listFolder('.chord')), ...(await listFolder('.setlist'))].map(
    (f) => f.name
  )
  if (names.length === 0) {
    window.alert('보관함이 비어 있어요.')
    return
  }
  const files = await Promise.all(
    names.map(async (name) => ({ name, text: (await readFromFolder(name)) ?? '' }))
  )
  const backup: Backup = { app: 'chordash', version: 1, exported: new Date().toISOString(), files }
  const day = backup.exported.slice(0, 10)
  download(`chordash-보관함-${day}.json`, JSON.stringify(backup, null, 1), 'application/json')
}

async function importBackup(): Promise<void> {
  const [picked] = await pickWithInput(BACKUP, false)
  if (!picked) return
  let backup: Backup
  try {
    backup = JSON.parse(await picked.text()) as Backup
    if (backup.app !== 'chordash' || !Array.isArray(backup.files)) throw new Error()
  } catch {
    window.alert('Chordash 보관함 백업 파일이 아니에요.')
    return
  }
  const existing = new Set(
    [...(await listFolder('.chord')), ...(await listFolder('.setlist'))].map((f) => f.name)
  )
  const clashes = backup.files.filter((f) => existing.has(f.name)).length
  const replace =
    clashes === 0 ||
    window.confirm(
      `같은 이름의 파일이 ${clashes}개 있어요. 백업 내용으로 바꿔 쓸까요?\n(취소하면 그 파일들은 그대로 두고 나머지만 가져와요)`
    )
  let count = 0
  for (const file of backup.files) {
    if (!/\.(chord|setlist)$/i.test(file.name) || typeof file.text !== 'string') continue
    if (existing.has(file.name) && !replace) continue
    await writeToFolder(file.name, file.text)
    count++
  }
  window.alert(`${count}개를 보관함에 가져왔어요.`)
}

/** One file out of the library, to keep or move to another device. */
async function exportFile(name: string): Promise<void> {
  const text = await readFromFolder(name)
  if (text !== null) download(name, text)
}

/** The Google button at the right end (1.4): signing in also makes Drive the place to save. */
function driveAccount(local: LibraryStore): Account {
  const stores = [local, driveStore]
  return {
    connected: isDriveConnected,
    profile: driveProfile,
    async signIn() {
      const ok = await connectDrive()
      if (ok) rememberStore(driveStore)
      return ok
    },
    signOut() {
      signOutDrive()
      rememberStore(local)
    },
    warmUp: warmUpDrive,
    onChange: onDriveChange,
    places: stores.map(({ id, label }) => ({ id, label })),
    place: () => lastStore(stores).id,
    setPlace(id) {
      const store = stores.find((s) => s.id === id)
      if (store) rememberStore(store)
    }
  }
}

export function createWebPlatform(): Platform {
  let dirty = false
  const local = localStore({
    label: '이 브라우저',
    where: `내 곡 보관함 — 이 기기의 이 브라우저에만 저장돼요. 다른 기기로 옮기려면 백업을 내보내세요.`,
    saveTo: `내 곡 보관함(이 브라우저)에`,
    fileAction: { label: '내보내기', run: exportFile },
    footer: [
      { label: '백업 내보내기', run: exportBackup },
      { label: '백업 가져오기', run: importBackup }
    ]
  })
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault()
  })

  return {
    features: {
      ai: false,
      printPdf: true,
      setlistKeepsSongs: false,
      offersDesktopApp: true,
      legalLinks: true,
      libraryDialog: true
    },

    ...libraryMethods([local, driveStore], TEXT_CHARTS),
    account: driveAccount(local),

    async exportPdf(html) {
      printTip()
      await printHtml(html)
      return null
    },

    async confirmDiscard(name) {
      return window.confirm(`'${name}'의 바뀐 내용을 저장하지 않았어요.\n버리고 계속할까요?`)
        ? 'discard'
        : 'cancel'
    },

    setDocumentState(state) {
      dirty = state.dirty
      document.title = appTitle(state.name, state.dirty)
    },

    onBeforeClose() {
      // The browser can only warn before leaving (beforeunload above), not ask and save.
    },

    hasApiKey: async () => false,
    setApiKey: async () => '웹 버전에서는 AI 기능을 쓸 수 없어요. 데스크톱 앱을 써 주세요.',
    recognize: async () => ({ ok: false, failure: { kind: 'no-key' } }),
    cancelRecognize() {
      // Nothing is ever sent.
    }
  }
}
