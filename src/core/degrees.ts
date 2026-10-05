// Note names ↔ scale degrees (ROADMAP Phase 9): rewrites chord roots and basses in the text,
// e.g. key F: `Bb^7, A-7, C7/E` ↔ `4^7, 3-7, 57/7`. Chords keep the shape they were typed in.
// Degrees follow the letters (SYNTAX 5): B in key F is `#4` (F G A B), C♯ in key F is `#5`.

import type { ChordDocument } from './document'
import type { TextChange } from './header'
import { degreeToNote, letterIndex, pitchClass, type Key, type Note } from './key'
import { noteText, type LineRange } from './transpose'

export type ChordSpelling = 'degrees' | 'notes'

const mod = (n: number, m: number): number => ((n % m) + m) % m

/** `b7`, `#4`, `1` — how a note is typed as a degree of `key`. */
export function degreeText(key: Key, note: Note): string {
  const write = (degree: number, accidental: number): string =>
    (accidental > 0 ? '#' : accidental < 0 ? 'b' : '') + degree
  const degree = mod(letterIndex(note.letter) - letterIndex(key.tonic.letter), 7) + 1
  const accidental = mod(pitchClass(note) - pitchClass(degreeToNote(key, degree, 0)) + 6, 12) - 6
  if (Math.abs(accidental) <= 1) return write(degree, accidental)
  // Two accidentals away (F♯ in key C♭): the nearest plain, then flat, then sharp degree.
  for (const acc of [0, -1, 1]) {
    for (let d = 1; d <= 7; d++) {
      if (pitchClass(degreeToNote(key, d, acc)) === pitchClass(note)) return write(d, acc)
    }
  }
  return write(degree, 0)
}

export interface SpellingEdits {
  edits: TextChange[]
  /** Chords that could not be written as degrees: their section has no `key:`. */
  withoutKey: number
  /** Chords that changed. */
  changed: number
}

/**
 * Text edits that write chords as degrees or as note names, on the given lines or everywhere.
 * Only the root and the slash bass change; everything else is kept as typed.
 */
export function spellingEdits(
  text: string,
  doc: ChordDocument,
  to: ChordSpelling,
  range: LineRange | null = null
): SpellingEdits {
  const lineStart: number[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    lineStart.push(offset)
    offset += line.length + 1
  }
  const result: SpellingEdits = { edits: [], withoutKey: 0, changed: 0 }
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type !== 'bars') continue
      if (range && (item.line < range.from || item.line > range.to)) continue
      const start = lineStart[item.line - 1]
      for (const chord of item.bars.flatMap((b) => b.chords)) {
        if (!chord.chord || !chord.spec) continue
        const { root, bass } = chord.spec
        // Parts already in the wanted spelling stay as they are.
        const wants = (kind: 'note' | 'degree'): boolean => (to === 'degrees') === (kind === 'note')
        const changeRoot = wants(root.kind)
        const changeBass = bass !== null && chord.chord.bass !== null && wants(bass.kind)
        if (!changeRoot && !changeBass) continue
        if (to === 'degrees' && !section.key) {
          result.withoutKey++
          continue
        }
        const write = (note: Note): string =>
          to === 'degrees' ? degreeText(section.key!, note) : noteText(note)
        const at = start + chord.from
        if (changeRoot) {
          // Root text: letter + accidental for notes; `b`/`#` + digit for degrees.
          const accidental = root.kind === 'note' ? root.note.accidental : root.accidental
          result.edits.push({
            from: at,
            to: at + (accidental !== 0 ? 2 : 1),
            insert: write(chord.chord.root)
          })
        }
        if (changeBass) {
          const from = at + chord.source.lastIndexOf('/') + 1
          result.edits.push({
            from,
            to: at + chord.source.length,
            insert: write(chord.chord.bass!)
          })
        }
        result.changed++
      }
    }
  }
  result.edits.sort((a, b) => a.from - b.from)
  return result
}
