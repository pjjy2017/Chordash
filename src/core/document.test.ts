import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatChord } from './chord'
import { parse, type BarLine, type ChordDocument } from './document'

const barLines = (doc: ChordDocument): BarLine[] =>
  doc.sections.flatMap((s) => s.items.filter((i): i is BarLine => i.type === 'bars'))

const chordNames = (line: BarLine): string[][] =>
  line.bars.map((b) => b.chords.map((c) => (c.chord ? formatChord(c.chord) : `!${c.source}`)))

const errors = (text: string): string[] =>
  parse(text)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message)

describe('header', () => {
  it('reads title and key', () => {
    const { document } = parse('title: 샴푸의 요정\nkey: F\n')
    expect(document.title).toBe('샴푸의 요정')
    expect(document.key).toEqual({ tonic: { letter: 'F', accidental: 0 }, minor: false })
  })
  it('rejects an unknown key', () => {
    expect(errors('key: H')).toEqual(['알 수 없는 키: H'])
  })
  it('rejects key: after the header', () => {
    expect(errors('[A]\nkey: G')[0]).toMatch(/파일 맨 위에만/)
  })
  it('ignores blank lines, comments and a BOM', () => {
    expect(parse('\uFEFF// note\n\ntitle: X\n').diagnostics).toEqual([])
  })
})

describe('sections', () => {
  it('reads name, key change and directive', () => {
    const { document, diagnostics } = parse('key: F\n[Intro] "드럼 4마디"\n[Vocal] key: G\n| 1 |')
    expect(diagnostics).toEqual([])
    const [intro, vocal] = document.sections
    expect(intro).toMatchObject({ name: 'Intro', directive: '드럼 4마디', keyChange: null })
    expect(intro.key?.tonic.letter).toBe('F')
    expect(vocal).toMatchObject({ name: 'Vocal', keyChange: { tonic: { letter: 'G' } } })
    expect(chordNames(barLines(document)[0])).toEqual([['G']])
  })
  it('keeps the key until the next key change', () => {
    const { document } = parse('key: E\n[A] key: G\n[B]\n| 5 |')
    expect(chordNames(barLines(document)[0])).toEqual([['D']])
  })
  it('puts content before the first label in an unnamed section', () => {
    const { document } = parse('| C |')
    expect(document.sections[0].name).toBeNull()
  })
  it('rejects other text after the label', () => {
    expect(errors('[A] foo')[0]).toMatch(/key: 또는 "지시문"/)
  })
})

describe('bar lines', () => {
  it('splits bars and chords', () => {
    const { document } = parse('| Bb^7 | A- D- | | F B7* |')
    const line = barLines(document)[0]
    expect(chordNames(line)).toEqual([['B♭maj7'], ['Am', 'Dm'], [], ['F', 'B7']])
    expect(line.bars[3].chords[1]).toMatchObject({ source: 'B7', accent: true })
  })
  it('reads breath and uncertain marks', () => {
    const chords = barLines(parse("| 'E-9 ?'C#7* |").document)[0].bars[0].chords
    expect(chords[0]).toMatchObject({ source: 'E-9', breath: true, uncertain: false })
    expect(chords[1]).toMatchObject({ source: 'C#7', breath: true, uncertain: true, accent: true })
  })
  it('reads repeats and endings', () => {
    const lines = barLines(
      parse('||: C | A- | F | G7 |\n1.| C | A- | F | G7 :||\n2.| C | A- | F G | C |').document
    )
    expect(lines.map((l) => l.ending)).toEqual([null, 1, 2])
    expect(lines[0].bars[0].repeatStart).toBe(true)
    expect(lines[1].bars[3].repeatEnd).toBe(true)
    expect(lines[1].bars).toHaveLength(4)
  })
  it('flags a whole line with a trailing ?', () => {
    const line = barLines(parse('| C | A- |?').document)[0]
    expect(line.uncertain).toBe(true)
    expect(line.bars).toHaveLength(2)
  })
  it('accepts a missing closing barline', () => {
    expect(chordNames(barLines(parse('| C | D').document)[0])).toEqual([['C'], ['D']])
  })
  it('reports bad chords with their column', () => {
    const { diagnostics } = parse('| C | h7 |')
    expect(diagnostics).toEqual([
      { line: 1, from: 6, to: 8, severity: 'error', message: '알 수 없는 루트' }
    ])
  })
  it('reads sentence-style lines with commas and a final period', () => {
    const line = barLines(parse("Bb^7, A-7, Bb^7, F B7*\nE-9, 'E-9.").document)
    expect(chordNames(line[0])).toEqual([['B♭maj7'], ['Am7'], ['B♭maj7'], ['F', 'B7']])
    expect(chordNames(line[1])).toEqual([['Em9'], ['Em9']])
    expect(line[1].bars.map((b) => b.final)).toEqual([false, true])
  })
  it('treats a trailing comma and a leading comma as optional', () => {
    const names = (t: string): string[][] => chordNames(barLines(parse(t).document)[0])
    expect(names('C, D,')).toEqual([['C'], ['D']])
    expect(names(', C , D ,')).toEqual([['C'], ['D']])
    expect(names('C, , D')).toEqual([['C'], [], ['D']])
  })
  it('mixes | , and . in one line', () => {
    const line = barLines(parse('| C , D | G7 .').document)[0]
    expect(chordNames(line)).toEqual([['C'], ['D'], ['G7']])
    expect(line.bars[2].final).toBe(true)
  })
  it('keeps commas inside parentheses as part of the chord', () => {
    expect(chordNames(barLines(parse('C7(b9,#11), F').document)[0])).toEqual([['C7♭9♯11'], ['F']])
  })
  it('reads endings in sentence style', () => {
    const lines = barLines(parse('1. C, A-, F, G7 :||\n2. C, F G, C.').document)
    expect(lines.map((l) => l.ending)).toEqual([1, 2])
    expect(lines[0].bars[3].repeatEnd).toBe(true)
    expect(chordNames(lines[1])).toEqual([['C'], ['F', 'G'], ['C']])
  })
  it('reads a lone "1." as degree 1 with a final barline, not an ending', () => {
    const line = barLines(parse('key: C\n1.').document)[0]
    expect(line.ending).toBeNull()
    expect(chordNames(line)).toEqual([['C']])
    expect(line.bars[0].final).toBe(true)
  })
  it('flags a sentence-style line with a trailing ?', () => {
    expect(barLines(parse('C, A- ?').document)[0].uncertain).toBe(true)
    expect(barLines(parse('C, A-,?').document)[0].uncertain).toBe(true)
  })
  it('hints that 6/9 is typed as 69', () => {
    expect(errors('| C6/9 |')).toEqual(['6/9 코드는 69로 입력 (예: C69)'])
  })
  it('reports degrees without a key', () => {
    expect(errors('| 3 |')).toEqual(['key가 지정되지 않음'])
  })
  it('rejects a bare ||', () => {
    expect(errors('| C || D |')[0]).toMatch(/\|\|/)
  })
})

describe('cues, memos, directives, page breaks', () => {
  it('attaches a lyric cue to the bar line above', () => {
    expect(barLines(parse('| C |\n> 첫 소절').document)[0].cue).toBe('첫 소절')
  })
  it('warns when a cue has no bar line above', () => {
    expect(parse('[A]\n> x').diagnostics[0]).toMatchObject({ severity: 'warning' })
  })
  it('attaches colour memos to the bar line below', () => {
    const line = barLines(parse('{teal: 따-닷 따-닷}\n| C |').document)[0]
    expect(line.memos).toEqual([{ color: 'teal', text: '따-닷 따-닷', line: 1 }])
  })
  it('rejects unknown colours', () => {
    expect(errors('{pink: x}\n| C |')[0]).toMatch(/알 수 없는 색/)
  })
  it('warns about a memo with no bar line below', () => {
    expect(parse('{red: x}\n[B]').diagnostics[0]).toMatchObject({ line: 1, severity: 'warning' })
  })
  it('reads standalone directives and page breaks', () => {
    const items = parse('[A]\n"break"\n---').document.sections[0].items
    expect(items).toEqual([
      { type: 'directive', line: 2, text: 'break' },
      { type: 'pageBreak', line: 3 }
    ])
  })
  it('reads any other line as a bar line, so stray text shows up as chord errors', () => {
    expect(errors('hello')).toEqual(['알 수 없는 루트'])
  })
})

describe('examples/샴푸의요정.chord', () => {
  const text = readFileSync(resolve(__dirname, '../../examples/샴푸의요정.chord'), 'utf8')
  const { document, diagnostics } = parse(text)

  it('parses without errors or warnings', () => expect(diagnostics).toEqual([]))
  it('has the expected structure', () => {
    expect(document.title).toBe('샴푸의 요정')
    expect(document.sections.map((s) => s.name)).toEqual([
      'Intro',
      'Verse',
      'Chorus',
      'Guitar',
      'Verse 2',
      'Chorus 2',
      'Bridge',
      'Vocal',
      'Chorus 3',
      'Outro'
    ])
    expect(barLines(document)).toHaveLength(27)
  })
  it('keeps empty bars and ends with a final barline', () => {
    const chorus = document.sections[2].items as BarLine[]
    expect(chordNames(chorus[1])).toEqual([['B♭maj7'], ['E7♭9'], ['A7'], []])
    const last = barLines(document).at(-1)!
    expect(last.bars.map((b) => b.final)).toEqual([false, true])
  })
  it('reads the outro memos and breath mark', () => {
    const outro = document.sections.at(-1)!.items as BarLine[]
    expect(outro[0].memos[0]).toMatchObject({ color: 'teal', text: '스캣' })
    expect(outro[2].bars[1].chords[0]).toMatchObject({ source: 'E-9', breath: true })
  })
})
