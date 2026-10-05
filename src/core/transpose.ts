// Transposition (SYNTAX 5, 7.5). Notes move by an interval counted in letters and semitones, so
// spelling follows the target key's letters: F♯ in G → E in F, F in C → A♭ in E♭.

import type { Chord } from './chord'
import type { ChordDocument } from './document'
import { letterIndex, pitchClass, spellOnLetter, type Key, type Note } from './key'
import type { TextChange } from './header'

export interface Interval {
  /** Letter steps, 0–6 (C→E = 2). */
  steps: number
  /** Semitones, 0–11 (C→E = 4). */
  semitones: number
}

const mod = (n: number, m: number): number => ((n % m) + m) % m

export function intervalBetween(from: Key, to: Key): Interval {
  return {
    steps: mod(letterIndex(to.tonic.letter) - letterIndex(from.tonic.letter), 7),
    semitones: mod(pitchClass(to.tonic) - pitchClass(from.tonic), 12)
  }
}

export const isUnison = (i: Interval): boolean => i.steps === 0 && i.semitones === 0

export function transposeNote(note: Note, interval: Interval): Note {
  return spellOnLetter(
    mod(pitchClass(note) + interval.semitones, 12),
    letterIndex(note.letter) + interval.steps
  )
}

export function transposeKey(key: Key, interval: Interval): Key {
  return { tonic: transposeNote(key.tonic, interval), minor: key.minor }
}

export function transposeChord(chord: Chord, interval: Interval): Chord {
  return {
    ...chord,
    root: transposeNote(chord.root, interval),
    bass: chord.bass ? transposeNote(chord.bass, interval) : null
  }
}

/** Common names used when stepping by semitones (▲▼): index = pitch class of the tonic. */
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

/** The key `semitones` away from `key`, spelled the way it is usually written (D♭, not C♯). */
export function keyBySemitones(key: Key, semitones: number): Key {
  const pc = mod(pitchClass(key.tonic) + semitones, 12)
  const name = (key.minor ? MINOR_NAMES : MAJOR_NAMES)[pc]
  return {
    tonic: {
      letter: name[0] as Note['letter'],
      accidental: name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0
    },
    minor: key.minor
  }
}

/** Signed semitones from `from` to `to`, in -5..+6 (the shorter way round). */
export function semitonesBetween(from: Key, to: Key): number {
  return mod(pitchClass(to.tonic) - pitchClass(from.tonic) + 5, 12) - 5
}

/** Lines (1-based, inclusive) a transposition applies to; null means the whole song. */
export interface LineRange {
  from: number
  to: number
}

const inRange = (line: number, range: LineRange | null): boolean =>
  !range || (line >= range.from && line <= range.to)

/**
 * The document as it looks in another key, for the preview and PDF. The text is not touched.
 * Whole song: every key moves. A line range: only chords on those lines move.
 */
export function transposeDocument(
  doc: ChordDocument,
  interval: Interval,
  range: LineRange | null = null
): ChordDocument {
  const moveKey = (key: Key | null): Key | null =>
    key && !range ? transposeKey(key, interval) : key
  return {
    ...doc,
    key: moveKey(doc.key),
    sections: doc.sections.map((section) => ({
      ...section,
      key: moveKey(section.key),
      keyChange:
        section.keyChange && (!range || (section.line !== null && inRange(section.line, range)))
          ? transposeKey(section.keyChange, interval)
          : section.keyChange,
      items: section.items.map((item) =>
        item.type !== 'bars' || !inRange(item.line, range)
          ? item
          : {
              ...item,
              bars: item.bars.map((bar) => ({
                ...bar,
                chords: bar.chords.map((c) =>
                  c.chord ? { ...c, chord: transposeChord(c.chord, interval) } : c
                )
              }))
            }
      )
    }))
  }
}

/** `F#`, `Bb`, `Cm` — how a key or note is typed in a file. */
export const noteText = (note: Note): string =>
  note.letter + (note.accidental > 0 ? '#'.repeat(note.accidental) : 'b'.repeat(-note.accidental))
export const keyText = (key: Key): string => noteText(key.tonic) + (key.minor ? 'm' : '')

/** Where a key value sits on a header or section line (`key: c-` → the `c-`). */
const KEY_VALUE = /(^|\]\s*|\s)key\s*:\s*(\S+)/

/**
 * Text edits that write a transposition into the file ("원본에 적용"). Chords keep the shape they
 * were typed in — only the root and bass letters change (`Bb^7` → `C^7`). Degree chords stay
 * as degrees when the whole song moves (its `key:` lines change instead); inside a line range
 * the keys stay, so degrees there are written out as notes.
 */
export function transpositionEdits(
  text: string,
  doc: ChordDocument,
  interval: Interval,
  range: LineRange | null = null
): TextChange[] {
  const lines = text.split('\n')
  const lineStart: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStart.push(offset)
    offset += line.length + 1
  }
  const edits: TextChange[] = []
  const keyEdit = (lineNo: number, key: Key): void => {
    const m = KEY_VALUE.exec(lines[lineNo - 1])
    if (!m) return
    const from = lineStart[lineNo - 1] + m.index + m[0].length - m[2].length
    edits.push({ from, to: from + m[2].length, insert: keyText(transposeKey(key, interval)) })
  }

  if (!range && doc.key) {
    const headerLine = lines.findIndex((l) => /^\s*key\s*:/.test(l))
    if (headerLine >= 0) keyEdit(headerLine + 1, doc.key)
  }
  for (const section of doc.sections) {
    if (section.keyChange && section.line !== null && inRange(section.line, range)) {
      keyEdit(section.line, section.keyChange)
    }
    for (const item of section.items) {
      if (item.type !== 'bars' || !inRange(item.line, range)) continue
      const start = lineStart[item.line - 1]
      for (const chord of item.bars.flatMap((b) => b.chords)) {
        if (!chord.chord || !chord.spec) continue
        const at = start + chord.from
        const { root, bass } = chord.spec
        if (root.kind === 'note' || range) {
          // Root text: letter + accidental for notes; `b`/`#` + digit for degrees.
          const length =
            root.kind === 'note'
              ? 1 + (root.note.accidental !== 0 ? 1 : 0)
              : root.accidental !== 0
                ? 2
                : 1
          edits.push({
            from: at,
            to: at + length,
            insert: noteText(transposeNote(chord.chord.root, interval))
          })
        }
        if (bass && chord.chord.bass && (bass.kind === 'note' || range)) {
          const slash = chord.source.lastIndexOf('/')
          const from = at + slash + 1
          edits.push({
            from,
            to: at + chord.source.length,
            insert: noteText(transposeNote(chord.chord.bass, interval))
          })
        }
      }
    }
  }
  return edits.sort((a, b) => a.from - b.from)
}
