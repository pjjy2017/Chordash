import { describe, expect, it } from 'vitest'
import { parse } from './document'
import { diatonicChords } from './diatonic'
import { parseKey } from './key'

const inputs = (key: string): string[] => diatonicChords(parseKey(key)!).map((s) => s.input)

describe('diatonicChords', () => {
  it('gives the seventh chords of a major key, spelled for the key', () => {
    expect(inputs('F')).toEqual(['F^7', 'G-7', 'A-7', 'Bb^7', 'C7', 'D-7', 'E%'])
    expect(inputs('E')).toEqual(['E^7', 'F#-7', 'G#-7', 'A^7', 'B7', 'C#-7', 'D#%'])
  })

  it('gives a minor key with a dominant V7', () => {
    expect(inputs('c-')).toEqual(['C-7', 'D%', 'Eb^7', 'F-7', 'G7', 'Ab^7', 'Bb7'])
  })

  it('labels them as the sheet shows them', () => {
    expect(diatonicChords(parseKey('Bb')!).map((s) => s.label)).toEqual([
      'B♭maj7',
      'Cm7',
      'Dm7',
      'E♭maj7',
      'F7',
      'Gm7',
      'Am7♭5'
    ])
  })

  it('types chords the parser reads', () => {
    for (const key of ['F', 'Db', 'F#m', 'c-']) {
      const text = `key: ${key}\n${inputs(key).join(', ')}`
      expect(parse(text).diagnostics).toEqual([])
    }
  })
})
