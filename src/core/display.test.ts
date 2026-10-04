// Default theme chord display (SYNTAX 6 table, minor shown as − per user choice).
import { describe, expect, it } from 'vitest'
import { parseChord } from './chord'
import { chordHint, chordParts } from './display'
import { parseKey } from './key'
import { PLAIN_THEME, type ChordStyle } from './theme'

// Symbol style with superscripts (△ ø °). No theme uses it now, but chordParts still supports it.
const SYMBOLS: ChordStyle = { minorSymbol: '−', symbols: true, extensionStyle: 'superscript' }

function show(input: string, style: ChordStyle = SYMBOLS): string {
  const r = parseChord(input, null)
  if (!r.ok) throw new Error(r.error.message)
  const p = chordParts(r.value, style)
  return p.root + p.inline + (p.sup ? `^(${p.sup})` : '') + p.bass
}

describe('symbol style', () => {
  it.each([
    ['C', 'C'],
    ['C7', 'C^(7)'],
    ['C-7', 'C−^(7)'],
    ['C-', 'C−'],
    ['Bb^7', 'B♭^(△7)'],
    ['F^9', 'F^(△9)'],
    ['c#-^7', 'C♯−^(△7)'],
    ['E%', 'E^(ø7)'],
    ['Em7b5', 'E^(ø7)'],
    ['go7', 'G°^(7)'],
    ['c+7', 'C+^(7)'],
    ['e7b9', 'E^(7♭9)'],
    ['c(b9)', 'C^((♭9))'],
    ['Cs', 'C^(sus4)'],
    ['c7s', 'C^(7sus4)'],
    ['C69', 'C^(6/9)'],
    ['B7alt', 'B^(7alt)'],
    ['A7/C#', 'A^(7)/C♯']
  ])('%s → %s', (input, expected) => expect(show(input)).toBe(expected))
})

describe('chordHint', () => {
  const hint = (input: string, keyName: string | null = null): string | null => {
    const r = parseChord(input, keyName ? parseKey(keyName) : null)
    if (!r.ok) throw new Error(r.error.message)
    return chordHint(input, r.value)
  }
  it('shows the resolved name for degrees', () => expect(hint('3+7', 'E')).toBe('G♯aug7'))
  it('shows the normal form for shorthand', () => expect(hint('bb^')).toBe('B♭maj7'))
  it('stays quiet when only #/b or case differ', () => {
    expect(hint('f#7')).toBeNull()
    expect(hint('Bb7')).toBeNull()
    expect(hint('E7b9')).toBeNull()
  })
})

describe('plain theme (one line, minor as −)', () => {
  it.each([
    ['C-7', 'C−7'],
    ['Bb^7', 'B♭maj7'],
    ['c-^7', 'C−maj7'],
    ['E%', 'E−7♭5'],
    ['go7', 'Gdim7'],
    ['c+7', 'Caug7'],
    ['e7b9', 'E7♭9'],
    ['c7s', 'C7sus4'],
    ['A7/C#', 'A7/C♯']
  ])('%s → %s', (input, expected) => expect(show(input, PLAIN_THEME.chord)).toBe(expected))
})

describe('style options', () => {
  const plain: ChordStyle = { minorSymbol: 'm', symbols: false, extensionStyle: 'inline' }
  it.each([
    ['Bb^7', 'B♭maj7'],
    ['E%', 'Em7♭5'],
    ['go7', 'Gdim7'],
    ['C-7', 'Cm7']
  ])('plain %s → %s', (input, expected) => expect(show(input, plain)).toBe(expected))
})
