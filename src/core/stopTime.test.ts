import { describe, expect, it } from 'vitest'
import { formatChord } from './chord'
import { parse, type Bar } from './document'
import { intervalBetween, transposeDocument } from './transpose'
import { parseKey } from './key'
import { stopSteps, stopTimeText } from './stopTime'

const bars = (text: string): Bar[] => {
  const items = parse(text).document.sections.flatMap((s) => s.items)
  return items.flatMap((i) => (i.type === 'bars' ? i.bars : []))
}

/** The 16 steps of a bar as text, beat by beat: . nothing, x a hit, [name] a chord. */
const shape = (bar: Bar): string =>
  (bar.rhythm ?? [])
    .map((beat) =>
      beat
        .map((s) =>
          s === 'rest' ? '.' : s === 'hit' ? 'x' : `[${formatChord(bar.chords[s].chord!)}]`
        )
        .join('')
    )
    .join(' ')

const messages = (text: string): string[] => parse(text).diagnostics.map((d) => d.message)

describe('stop time <1e, 5a, 15b> (1.8.1)', () => {
  it('puts each named chord on its step of the 16', () => {
    const [bar] = bars('<1e, 5a, 15b,>')
    expect(shape(bar)).toBe('[E]... [A]... .... ..[B].')
    expect(bar.chords.map((c) => c.source)).toEqual(['E', 'A', 'B'])
  })

  it('reads x, or a number alone, as a hit with no new chord', () => {
    const [bar] = bars('<1C7, 7x, 11, 13F7>')
    expect(shape(bar)).toBe('[C7]... ..x. ..x. [F7]...')
  })

  it('keeps time order whatever order the steps are written in', () => {
    const [bar] = bars('<9G7 1Dm7>')
    expect(bar.chords.map((c) => c.source)).toEqual(['Dm7', 'G7'])
  })

  it('reads full chord names, lower-case root or not', () => {
    const [bar] = bars('<1bbmaj7, 9A-7b5>')
    expect(shape(bar)).toBe('[B♭maj7]... .... [Am7♭5]... ....')
  })

  it('is not split by the commas and dots of the bar line', () => {
    const line = bars('<1e, 5a, 15b,>, F, G.')
    expect(line).toHaveLength(3)
    expect(line[0].rhythm).toHaveLength(4)
    expect(line[2].final).toBe(true)
  })

  it('has no problems when written right', () => {
    expect(messages('<1e, 5a, 15b,>')).toEqual([])
  })

  it('reports a step outside 1~16, a step twice, and chords outside the < >', () => {
    expect(messages('<17C>')).toEqual(['1~16 칸 번호 다음에 코드나 x 를 써요'])
    expect(messages('<1C, 1F>')).toEqual(['1번 칸이 두 번 있어요'])
    expect(messages('<1C> F')).toEqual(['스톱타임 마디의 코드는 < > 안에 써요'])
  })

  it('transposes the chords inside', () => {
    const doc = parse('key: C\n<1C7, 7x, 13G7>').document
    const moved = transposeDocument(doc, intervalBetween(parseKey('C')!, parseKey('D')!))
    const bar = moved.sections[0].items[0]
    if (bar.type !== 'bars') throw new Error('not bars')
    expect(shape(bar.bars[0])).toBe('[D7]... ..x. .... [A7]...')
  })

  it('leaves bars without < > alone', () => {
    expect(bars('C, F')[0].rhythm).toBeUndefined()
  })
})

describe('stop-time panel steps (1.8.1)', () => {
  const steps = (text: string): string => stopTimeText(stopSteps(bars(text)[0]))

  it('writes the steps back as numbers and chords (roots in capitals)', () => {
    expect(steps('<1e, 5a, 15b,>')).toBe('<1E, 5A, 15B>')
    expect(steps('<1C7, 7x, 11, 13F7>')).toBe('<1C7, 7x, 11x, 13F7>')
  })

  it('starts a normal bar with its chords on the beats', () => {
    expect(steps('C')).toBe('<1C>')
    expect(steps('C F')).toBe('<1C, 9F>')
    expect(steps('C F G')).toBe('<1C, 9F, 13G>')
    expect(steps('C F G A')).toBe('<1C, 5F, 9G, 13A>')
    expect(steps('C  F')).toBe('<1C, 13F>')
  })
})
