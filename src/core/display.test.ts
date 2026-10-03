// Default theme chord display (SYNTAX 6 table, minor shown as − per user choice).
import { describe, expect, it } from 'vitest'
import { parseChord } from './chord'
import { chordParts } from './display'
import { BOLD_GOTHIC, type ChordStyle } from './theme'

function show(input: string, style: ChordStyle = BOLD_GOTHIC.chord): string {
  const r = parseChord(input, null)
  if (!r.ok) throw new Error(r.error.message)
  const p = chordParts(r.value, style)
  return p.root + p.inline + (p.sup ? `^(${p.sup})` : '') + p.bass
}

describe('bold gothic', () => {
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

describe('style options', () => {
  const plain: ChordStyle = { minorSymbol: 'm', symbols: false, extensionStyle: 'inline' }
  it.each([
    ['Bb^7', 'B♭maj7'],
    ['E%', 'Em7♭5'],
    ['go7', 'Gdim7'],
    ['C-7', 'Cm7']
  ])('plain %s → %s', (input, expected) => expect(show(input, plain)).toBe(expected))
})
