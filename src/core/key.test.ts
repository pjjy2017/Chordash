// Spelling cases from SYNTAX 5 that are not in the section 7 tables.
import { describe, expect, it } from 'vitest'
import { degreeToNote, formatKey, formatNote, parseKey, type Key } from './key'

const key = (name: string): Key => {
  const k = parseKey(name)
  if (!k) throw new Error(name)
  return k
}
const spell = (k: string, degree: number, accidental = 0): string =>
  formatNote(degreeToNote(key(k), degree, accidental))

describe('degree spelling', () => {
  it('key E: b7 → D, #4 → A♯, b3 → G', () => {
    expect(spell('E', 7, -1)).toBe('D')
    expect(spell('E', 4, 1)).toBe('A♯')
    expect(spell('E', 3, -1)).toBe('G')
  })
  it('key F: 4 → B♭, #4 → B', () => {
    expect(spell('F', 4)).toBe('B♭')
    expect(spell('F', 4, 1)).toBe('B')
  })
  it('simplifies double sharps: key C# #4 → G', () => {
    expect(spell('C#', 4, 1)).toBe('G')
  })
  it('simplifies double flats: key Gb b3 → A (not B𝄫)', () => {
    expect(spell('Gb', 3, -1)).toBe('A')
  })
  it('minor keys use the natural minor scale: key Am 3 → C, 7 → G', () => {
    expect(spell('Am', 3)).toBe('C')
    expect(spell('Am', 7)).toBe('G')
  })
})

describe('parseKey', () => {
  it.each(['C', 'C#', 'Db', 'Eb', 'F#', 'Gb', 'Ab', 'Bb', 'B', 'Am', 'F#m', 'Ebm'])(
    '%s',
    (name) => {
      expect(parseKey(name)).not.toBeNull()
    }
  )
  it('formats with ♯/♭', () => expect(formatKey(key('Ebm'))).toBe('E♭m'))
  it.each(['H', 'C##', 'Cmaj', '', 'Am7'])('rejects %j', (name) =>
    expect(parseKey(name)).toBeNull()
  )
})
