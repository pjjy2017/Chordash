import { describe, expect, it } from 'vitest'
import { formatChord } from './chord'
import { parse, type BarLine, type ChordDocument } from './document'
import { applyChange } from './header'
import { formatKey, parseKey, type Key } from './key'
import {
  intervalBetween,
  keyBySemitones,
  keyText,
  semitonesBetween,
  transposeDocument,
  transpositionEdits
} from './transpose'

const key = (name: string): Key => parseKey(name)!

const names = (doc: ChordDocument): string[] =>
  doc.sections
    .flatMap((s) => s.items)
    .filter((i): i is BarLine => i.type === 'bars')
    .flatMap((l) =>
      l.bars.flatMap((b) => b.chords.map((c) => (c.chord ? formatChord(c.chord) : '?')))
    )

/** Applies "원본에 적용" edits to the text. */
function applyTo(
  text: string,
  to: string,
  range: { from: number; to: number } | null = null
): string {
  const { document } = parse(text)
  const edits = transpositionEdits(text, document, intervalBetween(document.key!, key(to)), range)
  return edits.reduceRight((t, e) => applyChange(t, e), text)
}

describe('keyBySemitones (▲▼)', () => {
  it('uses the usual key names', () => {
    expect(keyText(keyBySemitones(key('F'), 1))).toBe('F#')
    expect(keyText(keyBySemitones(key('C'), 1))).toBe('Db')
    expect(keyText(keyBySemitones(key('C'), -2))).toBe('Bb')
    expect(keyText(keyBySemitones(key('Am'), 1))).toBe('Bbm')
    expect(keyText(keyBySemitones(key('Em'), -1))).toBe('Ebm')
  })
  it('measures the shorter way round', () => {
    expect(semitonesBetween(key('F'), key('G'))).toBe(2)
    expect(semitonesBetween(key('F'), key('Eb'))).toBe(-2)
    expect(semitonesBetween(key('C'), key('F#'))).toBe(6)
  })
})

describe('transposeDocument (preview)', () => {
  const text = 'key: F\n[A]\nBb^7, 2-7, 57/7\n[B] key: G\nE-, 4^7'

  it('moves absolute chords, degrees and every key', () => {
    const { document } = parse(text)
    const moved = transposeDocument(document, intervalBetween(key('F'), key('G')))
    expect(names(moved)).toEqual(['Cmaj7', 'Am7', 'D7/F♯', 'F♯m', 'Dmaj7'])
    expect(formatKey(moved.key!)).toBe('G')
    expect(moved.sections.map((s) => s.keyChange && formatKey(s.keyChange))).toEqual([null, 'A'])
  })

  it('moves only the lines in range, keys stay', () => {
    const { document } = parse(text)
    const moved = transposeDocument(document, intervalBetween(key('F'), key('G')), {
      from: 3,
      to: 3
    })
    expect(names(moved)).toEqual(['Cmaj7', 'Am7', 'D7/F♯', 'Em', 'Cmaj7'])
    expect(formatKey(moved.key!)).toBe('F')
  })

  it('leaves the original document untouched', () => {
    const { document } = parse(text)
    transposeDocument(document, intervalBetween(key('F'), key('G')))
    expect(names(document)[0]).toBe('B♭maj7')
  })
})

describe('transpositionEdits (원본에 적용)', () => {
  it('keeps the typed shape and changes only roots, basses and keys', () => {
    expect(applyTo('key: F\n[A]\nBb^7, f#-7*, A7/C#, 2-7, 57/7\n[B] key: c-\nE-', 'G')).toBe(
      'key: G\n[A]\nC^7, G#-7*, B7/D#, 2-7, 57/7\n[B] key: Dm\nF#-'
    )
  })
  it('writes roots in capitals so a lowercase b never turns into a degree', () => {
    expect(applyTo('key: C\nc7', 'B')).toBe('key: B\nB7')
  })
  it('in a line range, writes degrees out as notes and keeps the keys', () => {
    expect(applyTo('key: F\nBb^7, 2-7\nBb^7, 2-7', 'G', { from: 3, to: 3 })).toBe(
      'key: F\nBb^7, 2-7\nC^7, A-7'
    )
  })
  it('keeps marks, parts and errors as they are', () => {
    expect(applyTo("key: C\na) 'C7*, ?F, h7", 'D')).toBe("key: D\na) 'D7*, ?G, h7")
  })
})
