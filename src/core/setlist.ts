// Setlists (ROADMAP Phase 10): a `.setlist` file lists song files in order, each optionally
// printed in another key, and the songs become one PDF with a contents page.
//
//   // Chordash 셋리스트
//   title: 10월 공연
//   Chordash.chord
//   songs/Autumn Leaves.chord | key: G
//
// Paths are relative to the setlist file when possible, so a folder can be moved as a whole.
// `|` cannot appear in Windows file names, so it safely separates the path from the key.
//
// The web version cannot find files again later, so it keeps the songs inside the setlist,
// after the list, each under a `=== 곡: <name>` line (Phase 11).

export interface SetlistEntry {
  /** Song file as written in the setlist (relative or absolute). */
  path: string
  /** Key to print the song in, as typed (`G`, `e-`); null = as written in the song. */
  key: string | null
}

export interface SetlistText {
  title: string | null
  entries: SetlistEntry[]
  /** Song texts kept inside the setlist, by entry path (web version). */
  songs?: Record<string, string>
}

const HEADER = '// Chordash 셋리스트'
const SONG_START = /^=== 곡:\s*(.+?)\s*$/

/** Song texts after the list, under `=== 곡: <name>` lines; null when there are none. */
function readSongs(lines: string[]): Record<string, string> | null {
  const first = lines.findIndex((l) => SONG_START.test(l))
  if (first < 0) return null
  const songs: Record<string, string> = {}
  let path = ''
  for (const line of lines.slice(first)) {
    const start = SONG_START.exec(line)
    if (start) path = start[1]
    songs[path] = start ? '' : songs[path] + line + '\n'
  }
  for (const p of Object.keys(songs)) songs[p] = songs[p].replace(/\n+$/, '\n')
  return songs
}

export function parseSetlist(text: string): SetlistText {
  const result: SetlistText = { title: null, entries: [] }
  const all = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const songs = readSongs(all)
  if (songs) result.songs = songs
  const listEnd = songs ? all.findIndex((l) => SONG_START.test(l)) : all.length
  for (const raw of all.slice(0, listEnd)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    const title = /^title\s*:\s*(.*)$/i.exec(line)
    if (title) {
      result.title = title[1].trim() || null
      continue
    }
    const [path, ...options] = line.split('|')
    const key = options.map((o) => /^\s*key\s*:\s*(.*)$/i.exec(o)).find(Boolean)
    result.entries.push({ path: path.trim(), key: key?.[1].trim() || null })
  }
  return result
}

export function formatSetlist(setlist: SetlistText): string {
  const lines = [HEADER]
  if (setlist.title) lines.push(`title: ${setlist.title}`)
  for (const entry of setlist.entries) {
    lines.push(entry.key ? `${entry.path} | key: ${entry.key}` : entry.path)
  }
  for (const [path, text] of Object.entries(setlist.songs ?? {})) {
    lines.push('', `=== 곡: ${path}`, text.replace(/\n+$/, ''))
  }
  return lines.join('\n') + '\n'
}

/** Rows that fit on one contents page (A4, see preview.css `.setlist-contents`). */
export const CONTENTS_ROWS_PER_PAGE = 24

export interface SetlistPlan {
  /** Pages the contents take (at least 1). */
  contentsPages: number
  /** First page of each song, 1-based, counting the contents pages. */
  starts: number[]
  total: number
}

/** Page numbers of a setlist PDF: contents first, then every song from a new page. */
export function planSetlist(
  songPages: number[],
  rowsPerPage = CONTENTS_ROWS_PER_PAGE
): SetlistPlan {
  const contentsPages = Math.max(1, Math.ceil(songPages.length / rowsPerPage))
  const starts: number[] = []
  let next = contentsPages + 1
  for (const pages of songPages) {
    starts.push(next)
    next += pages
  }
  return { contentsPages, starts, total: next - 1 }
}
