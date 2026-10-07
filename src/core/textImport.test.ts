// Text import (ROADMAP Phase 7): one test per sample format, plus the rules behind them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from './document'
import { decodeText } from './encoding'
import { importText, normalizeChord } from './textImport'

const sample = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(__dirname, '../../examples/import', name)))

/** The imported text must be valid Chordash: no errors, only the ? marks we put in. */
const errorsOf = (text: string): string[] =>
  parse(text)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message)

describe('decodeText', () => {
  it('reads CP949 (Korean ANSI) files', () => {
    const { text, encoding } = decodeText(sample('bars-cp949.txt'))
    expect(encoding).toBe('cp949')
    expect(text.split('\n')[0]).toBe('고엽 연습 - 마디선 예제')
  })
  it('reads UTF-8, with or without BOM', () => {
    expect(decodeText(new TextEncoder().encode('가사')).encoding).toBe('utf-8')
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('가사')])
    expect(decodeText(bom)).toEqual({ text: '가사', encoding: 'utf-8-bom' })
  })
})

describe('normalizeChord', () => {
  it.each([
    ['Am7', 'Am7'],
    ['bm', 'Bm'],
    ['b7', 'B7'],
    ['Am(maj7)', 'AmM7'],
    ['C(add9)', 'Cadd9'],
    ['C6/9', 'C69'],
    ['Cm7-5', 'Cm7b5'],
    ['C7+9', 'C7#9'],
    ['Cmin7', 'Cm7'],
    ['C△7', 'C^7'],
    ['B♭maj7', 'Bbmaj7'],
    ['N.C.', 'nc'],
    ['G/B', 'G/B']
  ])('%s → %s', (input, expected) => expect(normalizeChord(input)).toBe(expected))
  it.each(['the', 'Love', 'A-ha!', '가사', '7'])('%s is not a chord', (word) =>
    expect(normalizeChord(word)).toBeNull()
  )
})

describe('sample: bar-line text (CP949)', () => {
  const result = importText(decodeText(sample('bars-cp949.txt')).text, 'bars-cp949.txt')
  it('converts bars, repeats, % and the lyric under a bar line', () => {
    expect(result.format).toBe('bars')
    expect(result.text).toBe(
      [
        'title: 고엽 연습 - 마디선 예제',
        'key: Gm',
        '',
        '[A]',
        '.: Cm7, F7, Bbmaj7, Ebmaj7',
        'Am7b5, D7, Gm6, :.',
        '_ 여기는 가사 첫 줄 연습용',
        '[B]',
        'Am7b5, D7(b9), Gm, Gm',
        'Cm7, F7, Bbmaj7, Ebmaj7',
        ''
      ].join('\n')
    )
    expect(result.uncertain).toBe(0)
    expect(errorsOf(result.text)).toEqual([])
  })
})

describe('sample: chords over lyrics', () => {
  const result = importText(decodeText(sample('chords-over-lyrics.txt')).text)
  it('makes one bar per chord, marks the line ?, and keeps the lyric start as a cue', () => {
    expect(result.format).toBe('chords-over-lyrics')
    expect(result.text).toBe(
      [
        'title: 연습곡 - 2줄 형식 예제',
        'key: F',
        '',
        '[Verse]',
        'Bbmaj7, Am7 ?',
        '_ 여기는 첫 번째 줄 가사예요',
        'Bbmaj7, F, B7 ?',
        '_ 두 번째 줄도 연습용 가사',
        'Gm7, C7sus4, C7 ?',
        '_ 세 번째 줄',
        '',
        '[Chorus]',
        'Dm7, Gm7, C7, Fmaj7 ?',
        '_ 후렴 첫 줄 연습용 가사입니다',
        'Bbmaj7, E7(b9), A7 ?',
        '_ 후렴 두 번째 줄',
        ''
      ].join('\n')
    )
    expect(result.uncertain).toBe(5)
    expect(errorsOf(result.text)).toEqual([])
  })
})

describe('sample: ChordPro', () => {
  const result = importText(decodeText(sample('song.cho')).text, 'song.cho')
  it('reads directives, sections and inline chords', () => {
    expect(result.format).toBe('chordpro')
    expect(result.text).toBe(
      [
        'title: Practice Song',
        'key: G',
        '',
        '// ChordPro sample with invented lyrics',
        '[Verse]',
        'G, Em ?',
        '_ Walking down…',
        'C, D7 ?',
        '_ Thinking of the…',
        '',
        '[Chorus]',
        'C, D, G, Em ?',
        '_ Sing along now',
        'Am7, D7sus4, G ?',
        '_ Everybody',
        '"Repeat chorus"',
        ''
      ].join('\n')
    )
    expect(errorsOf(result.text)).toEqual([])
  })
})

describe('importText rules', () => {
  it('marks chords it cannot read with ? instead of dropping them', () => {
    const { text, uncertain } = importText('| C | Xyz7 | G |')
    expect(text).toBe('C, ?Xyz7, G\n')
    expect(uncertain).toBe(1)
  })
  it('keeps unknown text as comments so nothing is lost', () => {
    expect(importText('Title\nC G\nla la\nsome note\n').text).toBe(
      'title: Title\n\nC, G ?\n_ la la\n// some note\n'
    )
  })
  it('keeps a lyric with commas as one lyric, not one per bar', () => {
    expect(importText('C G\n아, 그대여\n').text).toBe('C, G ?\n_ 아 그대여\n')
  })
  it('does not take a lyric line that starts with a section word as a heading', () => {
    expect(importText('C G\n후렴 같은 가사가 길게 이어지는 줄\n').text).toBe(
      'C, G ?\n_ 후렴 같은 가사가 길게…\n'
    )
  })
  it('says unknown when there is no music', () => {
    expect(importText('just some words\nand more').format).toBe('unknown')
  })
})
