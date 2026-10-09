// Song tools (1.5): replacing one chord everywhere, and new songs from a pattern — the current
// song's structure without its chords, or a common form (AABA, blues).

import { formatChord, parseChord } from './chord'
import { parse, type ChordDocument } from './document'
import { applyChange, readHeaderLine, setHeaderLine, type TextChange } from './header'
import type { LineRange } from './transpose'

export interface ChordReplace {
  edits: TextChange[]
  /** Chords that will change. */
  changed: number
  /** Why it cannot run: the chord to find or the new one could not be read. */
  error: string | null
}

const lineStarts = (text: string): number[] => {
  const starts: number[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    starts.push(offset)
    offset += line.length + 1
  }
  return starts
}

/**
 * Edits that replace every chord meaning `find` with `replacement` as typed, on the given lines
 * or everywhere. Chords match by what they mean in their section's key, so `Dm7` also finds
 * `D-7`, and in key C the degree chord `2-7`. Marks around a chord (`'` `*` `?`) stay.
 */
export function chordReplaceEdits(
  text: string,
  doc: ChordDocument,
  find: string,
  replacement: string,
  range: LineRange | null = null
): ChordReplace {
  const none = (error: string): ChordReplace => ({ edits: [], changed: 0, error })
  const wanted = find.trim()
  const insert = replacement.trim()
  if (!wanted) return none('찾을 코드를 써 주세요.')
  if (!insert) return none('바꿀 코드를 써 주세요.')
  if (!parseChord(insert, doc.key ?? { tonic: { letter: 'C', accidental: 0 }, minor: false }).ok)
    return none(`'${insert}'를 코드로 읽을 수 없어요.`)
  const starts = lineStarts(text)
  const result: ChordReplace = { edits: [], changed: 0, error: null }
  let readable = false
  for (const section of doc.sections) {
    const target = parseChord(wanted, section.key)
    if (!target.ok) continue
    readable = true
    const name = formatChord(target.value)
    for (const item of section.items) {
      if (item.type !== 'bars') continue
      if (range && (item.line < range.from || item.line > range.to)) continue
      for (const chord of item.bars.flatMap((b) => b.chords)) {
        if (!chord.chord || formatChord(chord.chord) !== name) continue
        const at = starts[item.line - 1] + chord.from
        result.edits.push({ from: at, to: at + chord.source.length, insert })
        result.changed++
      }
    }
  }
  if (!readable) return none(`'${wanted}'를 코드로 읽을 수 없어요.`)
  return result
}

/** Lines that only carry this song's words: lyrics, texts above, colour memos. */
const WORDS_LINE = /^\s*(_|\^|l:|\{)/

/**
 * A new song with this one's shape: sections, form lines, parts, endings, repeats and the
 * number of bars stay; chords, lyrics and texts go. The key stays, the title is emptied.
 */
export function structureOnly(text: string): string {
  const { document: doc } = parse(text)
  const lines = text.split('\n')
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type !== 'bars' || item.bars.length === 0) continue
      const index = item.line - 1
      const line = lines[index]
      const first = item.bars[0]
      const last = item.bars[item.bars.length - 1]
      // Everything after the last bar but the barline marks (`:.`, `.`), not `_`/`^` words.
      const tail = line.slice(last.to).replace(/\s+[_^].*$/, '')
      let rebuilt = ''
      let at = 0
      for (const bar of item.bars) {
        rebuilt += line.slice(at, bar.from).replace(/"[^"]*"/g, '') + ' '
        at = bar.to
      }
      // A blank last bar needs a barline after it too.
      rebuilt += tail.trim() ? tail : '|'
      // A blank first bar needs a barline in front, or it would not count.
      const head = line.slice(0, first.from)
      if (!/[|:]/.test(head))
        rebuilt = rebuilt.slice(0, head.length) + '| ' + rebuilt.slice(head.length)
      lines[index] = rebuilt.replace(/\s+$/, '')
    }
  }
  const kept = lines.filter((line) => !WORDS_LINE.test(line)).join('\n')
  return readHeaderLine(kept, 'title') !== null
    ? applyChange(kept, setHeaderLine(kept, 'title', null))
    : kept
}

export interface SongTemplate {
  id: string
  label: string
  text: string
}

/** Common forms to start from. Degrees, so the key field sets the chords. */
export const SONG_TEMPLATES: SongTemplate[] = [
  {
    id: 'aaba',
    label: 'AABA 32마디 (빈 마디)',
    text:
      'key: C\n' +
      'a) a) b) a)\n\n' +
      ['A', 'A', 'B', 'A']
        .map((name, i) => {
          const end = i === 3 ? '.' : '|'
          return `[${name}]\n${name.toLowerCase()}) | , , , |\n| , , , ${end}`
        })
        .join('\n\n') +
      '\n'
  },
  {
    id: 'blues',
    label: '블루스 12마디',
    text: 'key: F\n[Blues]\n17, 47, 17, 17\n47, 47, 17, 17\n57, 47, 17, 57.\n'
  },
  {
    id: 'jazz-blues',
    label: '재즈 블루스 12마디',
    text: 'key: F\n[Blues]\n17, 47, 17, 5-7 17\n47, #4o7, 17, 67\n2-7, 57, 17 67, 2-7 57.\n'
  },
  {
    id: 'minor-blues',
    label: '마이너 블루스 12마디',
    text: 'key: c-\n[Blues]\n1-7, 4-7, 1-7, 1-7\n4-7, 4-7, 1-7, 1-7\n67, 57, 1-7, 2% 57.\n'
  }
]
