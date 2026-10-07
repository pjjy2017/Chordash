import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { degreeText, spellingEdits, type ChordSpelling } from './degrees'
import { parse } from './document'
import { applyChange } from './header'
import { parseKey, type Note } from './key'
import type { LineRange } from './transpose'

const note = (text: string): Note => parseKey(text)!.tonic

const convert = (text: string, to: ChordSpelling, range: LineRange | null = null): string =>
  spellingEdits(text, parse(text).document, to, range)
    .edits.slice()
    .reverse()
    .reduce(applyChange, text)

/** Every chord as resolved (root, bass and the rest), to compare two spellings of a song. */
const chords = (text: string): unknown[] =>
  parse(text).document.sections.flatMap((s) =>
    s.items.flatMap((i) =>
      i.type === 'bars' ? i.bars.flatMap((b) => b.chords.map((c) => c.chord)) : []
    )
  )

describe('degreeText', () => {
  it.each([
    ['F', 'F', '1'],
    ['F', 'Bb', '4'],
    ['F', 'B', '#4'],
    ['F', 'C#', '#5'],
    ['F', 'Db', 'b6'],
    ['F', 'Eb', 'b7'],
    ['F', 'E', '7'],
    ['E', 'D', 'b7'],
    ['E', 'A#', '#4'],
    ['E', 'G', 'b3'],
    ['Am', 'C', '3'],
    ['Am', 'G', '7'],
    ['Am', 'G#', '#7'],
    ['Am', 'F#', '#6'],
    // Two accidentals away by letter: the nearest degree instead (F♯ = G♭ in C♭).
    ['Cb', 'F#', '5']
  ])('key %s: %s → %s', (key, n, expected) => {
    expect(degreeText(parseKey(key)!, note(n))).toBe(expected)
  })
})

describe('spellingEdits', () => {
  it('writes notes as degrees, keeping the typed shape', () => {
    const text = "key: F\nBb^7, A-7, Bb^7, F B7*\n'Cs C#s*, A7/C# E% A7."
    expect(convert(text, 'degrees')).toBe("key: F\n4^7, 3-7, 4^7, 1 #47*\n'5s #5s*, 37/#5 7% 37.")
  })

  it('writes degrees as notes', () => {
    expect(convert('key: E\n1, 2-7, 57/7, b7, ?#4%', 'notes')).toBe(
      'key: E\nE, F#-7, B7/D#, D, ?A#%'
    )
  })

  it('uses the key of each section', () => {
    const text = 'key: F\n[A]\nBb, C7\n[B] key: G\nC, D7'
    expect(convert(text, 'degrees')).toBe('key: F\n[A]\n4, 57\n[B] key: G\n4, 57')
  })

  it('changes only the given lines', () => {
    expect(convert('key: C\nC, F\nG, C', 'degrees', { from: 3, to: 3 })).toBe('key: C\nC, F\n5, 1')
  })

  it('leaves chords alone without a key, and counts them', () => {
    const text = 'C, F'
    const result = spellingEdits(text, parse(text).document, 'degrees')
    expect(result.edits).toEqual([])
    expect(result.withoutKey).toBe(2)
  })

  it('round-trips the example song without changing a chord', () => {
    // The example mixes note names and degrees; start from all note names.
    const song = convert(
      readFileSync(join(__dirname, '../../examples/Chordash.chord'), 'utf8'),
      'notes'
    )
    const degrees = convert(song, 'degrees')
    expect(degrees).not.toBe(song)
    expect(parse(degrees).diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(chords(degrees)).toEqual(chords(song))
    expect(convert(degrees, 'notes')).toBe(song)
  })
})
