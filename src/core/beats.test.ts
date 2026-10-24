import { describe, expect, it } from 'vitest'
import { parse } from './document'

/** The empty beats before each chord of the first bar. */
const rests = (text: string): number[] => {
  const line = parse(text).document.sections[0].items[0]
  if (line.type !== 'bars') throw new Error('not a bar line')
  return line.bars[0].chords.map((c) => c.restsBefore ?? 0)
}

describe('empty beats (two spaces = one empty beat)', () => {
  it('leaves beat 2 empty: C  F G', () => {
    expect(rests('C  F G')).toEqual([0, 1, 0])
  })

  it('counts each extra space as one beat', () => {
    expect(rests('C   G7')).toEqual([0, 2])
  })

  it('one space is just the next chord', () => {
    expect(rests('C F G Am')).toEqual([0, 0, 0, 0])
  })

  it('does not count the spaces around barlines', () => {
    expect(rests('|  C  |  F  |')).toEqual([0])
    expect(rests('C,   F')).toEqual([0])
  })

  it('a text between chords starts the count again', () => {
    expect(rests('C  "Break"  F')).toEqual([0, 0])
  })
})
