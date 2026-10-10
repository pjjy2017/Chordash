// Setlist dialog (ROADMAP Phase 10): song files in order, each optionally printed in another
// key, saved as a `.setlist` file and turned into one PDF with a contents page.
// The songs are read from their files every time, so edits show up in the next PDF.

import {
  countUncertain,
  DEFAULT_THEME,
  formatKey,
  intervalBetween,
  printLayout,
  parse,
  parseKey,
  planSetlist,
  transposeDocument,
  type ChordDocument,
  type Key
} from '../../core'
import { platform, type FileRef, type Setlist, type SetlistSong } from '../../platform'
import { buildPrintHtml, renderSetlistPages, type ContentsRow } from './preview'
import { printOptions } from './printSettings'
import { openStage } from './stage'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const dialog = $<HTMLDialogElement>('setlist-dialog')
const fileLabel = $<HTMLElement>('setlist-file')
const titleField = $<HTMLInputElement>('setlist-title')
const list = $<HTMLOListElement>('setlist-songs')
const empty = $<HTMLElement>('setlist-empty')
const message = $<HTMLElement>('setlist-message')

/** What the song file says about itself, read when it joins the list. */
interface SongInfo {
  title: string | null
  key: Key | null
}

interface Row extends SetlistSong {
  info: SongInfo | null
}

let setlistFile: FileRef | null = null
let rows: Row[] = []
let dirty = false
/** The open song in the editor, for "지금 곡 넣기". */
let currentSong: () => { file: FileRef | null; dirty: boolean } = () => ({
  file: null,
  dirty: false
})

const fileTitle = (file: FileRef): string => file.name.replace(/\.chord$/i, '')

function say(text: string, isError = false): void {
  message.hidden = !text
  message.textContent = text
  message.classList.toggle('is-error', isError)
}

function touch(): void {
  dirty = true
  showFile()
}

function showFile(): void {
  fileLabel.textContent = setlistFile
    ? `— ${setlistFile.name}${dirty ? ' *' : ''}`
    : dirty
      ? '*'
      : ''
}

async function readInfo(row: Row): Promise<void> {
  const text = row.found ? await platform.readSong(row.file) : null
  if (text === null) {
    row.found = false
    return
  }
  const { document: doc } = parse(text)
  row.info = { title: doc.title, key: doc.key }
}

function render(): void {
  empty.hidden = rows.length > 0
  list.replaceChildren(
    ...rows.map((row, i) => {
      const li = document.createElement('li')
      li.classList.toggle('missing', !row.found)
      const name = document.createElement('span')
      name.className = 'setlist-row-name'
      name.textContent = row.found
        ? `${row.info?.title || fileTitle(row.file)}${row.info?.key ? ` (${formatKey(row.info.key)})` : ''}`
        : `${row.file.name} — 파일을 찾을 수 없어요`
      name.title = row.file.id

      const key = document.createElement('input')
      key.className = 'setlist-row-key'
      key.placeholder = '키 그대로'
      key.title = '이 곡을 출력할 키 (예: G, e-). 비우면 곡에 적힌 키 그대로'
      key.value = row.key ?? ''
      key.spellcheck = false
      key.addEventListener('input', () => {
        const typed = key.value.trim()
        key.classList.toggle('bad', typed !== '' && !parseKey(typed))
        row.key = typed || null
        touch()
      })
      key.classList.toggle('bad', !!row.key && !parseKey(row.key))

      const button = (
        text: string,
        title: string,
        action: () => void,
        disabled = false
      ): HTMLButtonElement => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = text
        b.title = title
        b.disabled = disabled
        b.addEventListener('click', () => {
          action()
          touch()
          render()
        })
        return b
      }
      const move = (by: number) => () => rows.splice(i + by, 0, ...rows.splice(i, 1))
      li.append(
        name,
        key,
        button('▲', '위로', move(-1), i === 0),
        button('▼', '아래로', move(1), i === rows.length - 1),
        button('✕', '목록에서 빼기 (곡 파일은 지우지 않아요)', () => rows.splice(i, 1))
      )
      return li
    })
  )
}

async function addSongs(files: FileRef[]): Promise<void> {
  const added = files.map((file): Row => ({ file, key: null, found: true, info: null }))
  await Promise.all(added.map(readInfo))
  rows.push(...added)
  touch()
  render()
}

function setlistData(): Setlist {
  return {
    title: titleField.value.trim() || null,
    songs: rows.map(({ file, key, found }) => ({ file, key, found }))
  }
}

async function save(asNew: boolean): Promise<boolean> {
  const saved = await platform.saveSetlist(asNew ? null : setlistFile, setlistData())
  if (!saved) return false
  setlistFile = saved
  dirty = false
  showFile()
  say(`저장했어요: ${saved.name}`)
  return true
}

async function open(): Promise<void> {
  if (
    dirty &&
    !window.confirm('지금 셋리스트에 저장 안 한 내용이 있어요. 버리고 다른 셋리스트를 열까요?')
  )
    return
  const opened = await platform.openSetlist()
  if (!opened) return
  setlistFile = opened.file
  titleField.value = opened.setlist.title ?? ''
  rows = opened.setlist.songs.map((song) => ({ ...song, info: null }))
  await Promise.all(rows.map(readInfo))
  dirty = false
  showFile()
  render()
  const missing = rows.filter((r) => !r.found).length
  say(missing ? `찾을 수 없는 곡이 ${missing}개 있어요(빨간 줄).` : '', missing > 0)
}

/** One song, read fresh from its file and put in its printing key. */
interface PreparedSong {
  title: string
  doc: ChordDocument
  printedKey: Key | null
  originalKey: Key | null
  problems: string[]
}

async function prepare(row: Row): Promise<PreparedSong | null> {
  const text = row.found ? await platform.readSong(row.file) : null
  if (text === null) return null
  const { document: doc, diagnostics } = parse(text)
  const title = doc.title || fileTitle(row.file)
  const problems: string[] = []
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const uncertain = countUncertain(doc)
  if (errors) problems.push(`${title}: 오류 ${errors}개`)
  if (uncertain) problems.push(`${title}: 확인 필요(?) ${uncertain}개`)
  const target = row.key ? parseKey(row.key) : null
  if (row.key && !target) problems.push(`${title}: 키 "${row.key}"를 읽을 수 없어서 원래 키로`)
  if (target && !doc.key) problems.push(`${title}: 곡에 key:가 없어서 조옮김 못 함`)
  if (!target || !doc.key) return { title, doc, printedKey: doc.key, originalKey: null, problems }
  return {
    title,
    doc: transposeDocument(doc, intervalBetween(doc.key, target)),
    printedKey: target,
    originalKey: formatKey(target) === formatKey(doc.key) ? null : doc.key,
    problems
  }
}

/** The songs that can be read, after asking about problems; null when there is nothing to show. */
async function readySongs(doing: string): Promise<PreparedSong[] | null> {
  if (rows.length === 0) return (say('곡을 먼저 넣어 주세요.', true), null)
  const prepared = await Promise.all(rows.map(prepare))
  const songs = prepared.filter((s): s is PreparedSong => s !== null)
  const missing = rows.filter((_, i) => !prepared[i]).map((r) => r.file.name)
  const problems = [
    ...(missing.length ? [`찾을 수 없어서 빼는 곡: ${missing.join(', ')}`] : []),
    ...songs.flatMap((s) => s.problems)
  ]
  if (songs.length === 0) return (say('읽을 수 있는 곡이 없어요.', true), null)
  if (problems.length && !window.confirm(`${problems.join('\n')}\n\n그래도 ${doing}?`)) return null
  return songs
}

/** Performance mode through the whole setlist, each song in its printed key (1.6). */
async function startStage(): Promise<void> {
  const songs = await readySongs('공연 모드를 열까요')
  if (!songs) return
  dialog.close()
  openStage(
    songs.map((s) => ({
      title: s.title,
      song: printLayout(s.doc, DEFAULT_THEME.metrics, printOptions())
    }))
  )
}

async function exportPdf(): Promise<void> {
  const songs = await readySongs('PDF로 만들까요')
  if (!songs) return

  const theme = DEFAULT_THEME
  const layouts = songs.map((s) => printLayout(s.doc, theme.metrics, printOptions()))
  const plan = planSetlist(layouts.map((l) => l.model.pages.length))
  const contents: ContentsRow[] = songs.map((s, i) => ({
    title: s.title,
    key: s.printedKey ? formatKey(s.printedKey) : null,
    originalKey: s.originalKey ? formatKey(s.originalKey) : null,
    page: plan.starts[i]
  }))
  const title =
    titleField.value.trim() || setlistFile?.name.replace(/\.setlist$/i, '') || '셋리스트'
  const html = await buildPrintHtml(
    renderSetlistPages(
      title,
      contents,
      plan.contentsPages,
      layouts.map((layout, i) => ({ layout, firstPage: plan.starts[i] })),
      theme,
      printOptions().booklet
    ),
    title,
    printOptions().booklet
  )
  const saved = await platform.exportPdf(html, `${title}.pdf`)
  if (saved) say(`PDF 저장: ${saved.name} (${songs.length}곡, ${plan.total}쪽)`)
}

/** Reports failures in the dialog instead of losing them. */
const guarded = (action: () => Promise<unknown>) => async (): Promise<void> => {
  try {
    await action()
  } catch (error) {
    say(`실패: ${error instanceof Error ? error.message : String(error)}`, true)
  }
}

$<HTMLButtonElement>('setlist-add').addEventListener(
  'click',
  guarded(async () => {
    say('')
    await addSongs(await platform.pickSongs())
  })
)
$<HTMLButtonElement>('setlist-add-current').addEventListener(
  'click',
  guarded(async () => {
    const song = currentSong()
    if (!song.file) return say('지금 곡을 먼저 파일로 저장해 주세요.', true)
    await addSongs([song.file])
    say(song.dirty ? '저장 안 한 내용은 빠져요. 곡을 저장하면 다음 PDF에 들어가요.' : '')
  })
)
$<HTMLButtonElement>('setlist-open').addEventListener('click', guarded(open))
$<HTMLButtonElement>('setlist-save').addEventListener(
  'click',
  guarded(() => save(false))
)
$<HTMLButtonElement>('setlist-save-as').addEventListener(
  'click',
  guarded(() => save(true))
)
$<HTMLButtonElement>('setlist-pdf').addEventListener('click', guarded(exportPdf))
$<HTMLButtonElement>('setlist-stage').addEventListener('click', guarded(startStage))
titleField.addEventListener('input', touch)

/** Opens the setlist dialog. The list stays while the app runs, also after closing it. */
export async function openSetlist(
  current: () => { file: FileRef | null; dirty: boolean }
): Promise<void> {
  currentSong = current
  say('')
  showFile()
  render()
  dialog.showModal()
  // Song files may have changed since the list was shown.
  await Promise.all(rows.map(readInfo))
  render()
}
