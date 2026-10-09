import { describe, expect, it } from 'vitest'
import { formatChord } from './chord'
import { parse } from './document'
import { applyChange } from './header'
import { chordReplaceEdits, SONG_TEMPLATES, structureOnly } from './songTools'

const replaceAll = (text: string, find: string, replacement: string): string => {
  const { edits, error } = chordReplaceEdits(text, parse(text).document, find, replacement)
  if (error) throw new Error(error)
  return [...edits].reverse().reduce(applyChange, text)
}

/** Each bar line as "bars:chords", with r/R/F for repeats and the final barline. */
const shape = (text: string): string =>
  parse(text)
    .document.sections.flatMap((s) => s.items)
    .flatMap((i) => (i.type === 'bars' ? [i] : []))
    .map(
      (l) =>
        `${l.bars.length}:${l.bars.reduce((n, b) => n + b.chords.length, 0)}` +
        (l.bars.some((b) => b.repeatStart) ? 'r' : '') +
        (l.bars.some((b) => b.repeatEnd) ? 'R' : '') +
        (l.bars.some((b) => b.final) ? 'F' : '')
    )
    .join(' ')

describe('chordReplaceEdits', () => {
  it('replaces a chord by meaning, keeping marks around it', () => {
    expect(replaceAll("key: C\nDm7, D-7 G7, 'D-7*", 'Dm7', 'D-9')).toBe(
      "key: C\nD-9, D-9 G7, 'D-9*"
    )
  })

  it('finds degree chords in their section key', () => {
    expect(replaceAll('key: C\n2-7, 57\n[B] key: F\n2-7', 'Dm7', 'D-9')).toBe(
      'key: C\nD-9, 57\n[B] key: F\n2-7'
    )
  })

  it('counts and keeps to the given lines', () => {
    const text = 'C7, C7\nC7'
    const result = chordReplaceEdits(text, parse(text).document, 'C7', 'C9', { from: 2, to: 2 })
    expect(result.changed).toBe(1)
  })

  it('says when a chord cannot be read', () => {
    const text = 'C7'
    expect(chordReplaceEdits(text, parse(text).document, 'H7', 'C9').error).toContain('H7')
    expect(chordReplaceEdits(text, parse(text).document, 'C7', '').error).not.toBeNull()
  })
})

describe('structureOnly', () => {
  it('keeps sections, parts, repeats, endings and bar counts; drops chords and words', () => {
    const song =
      'title: Song\nkey: F\n[A] "intro"\na) .: F^7, "Break" G-7 C7, F6, F6\n_ 가사, 가사\n' +
      '1. A-7, D7 :.\n2. G-7, C7 _ 끝\n^ 위\n{teal: 메모}\n[B]\nB-7, E7, A^7, .'
    const out = structureOnly(song)
    expect(out).not.toMatch(/title|가사|Break|위|메모|F\^7|끝/)
    expect(out).toContain('key: F')
    expect(out).toContain('[A] "intro"')
    expect(out).toContain('a) ')
    expect(shape(out)).toBe('4:0r 2:0R 2:0 4:0F')
    expect(shape(song).replace(/:\d/g, ':0')).toBe(shape(out))
    expect(parse(out).diagnostics).toEqual([])
  })
})

describe('SONG_TEMPLATES', () => {
  it('parse cleanly', () => {
    for (const t of SONG_TEMPLATES) expect(parse(t.text).diagnostics, t.id).toEqual([])
  })

  it('AABA has 32 empty bars ending with a final barline', () => {
    const aaba = SONG_TEMPLATES.find((t) => t.id === 'aaba')!.text
    expect(shape(aaba)).toBe('4:0 4:0 4:0 4:0 4:0 4:0 4:0 4:0F')
  })

  it('the jazz blues reads as written in F', () => {
    const blues = SONG_TEMPLATES.find((t) => t.id === 'jazz-blues')!.text
    const chords = parse(blues)
      .document.sections.flatMap((s) => s.items)
      .flatMap((i) => (i.type === 'bars' ? i.bars : []))
      .map((b) => b.chords.map((c) => formatChord(c.chord!)).join(' '))
    expect(chords).toEqual([
      'F7',
      'B♭7',
      'F7',
      'Cm7 F7',
      'B♭7',
      'Bdim7',
      'F7',
      'D7',
      'Gm7',
      'C7',
      'F7 D7',
      'Gm7 C7'
    ])
  })
})
