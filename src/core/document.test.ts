import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatChord } from './chord'
import { countUncertain, parse, type BarLine, type ChordDocument } from './document'

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
    const { document } = parse('title: 가을 연습곡\nkey: F\n')
    expect(document.title).toBe('가을 연습곡')
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
  it('reads .: and :. as repeat start and end', () => {
    const line = barLines(parse('.: C, A-, F, G7 :.').document)[0]
    expect(chordNames(line)).toEqual([['C'], ['Am'], ['F'], ['G7']])
    expect(line.bars[0].repeatStart).toBe(true)
    expect(line.bars[3].repeatEnd).toBe(true)
    expect(line.bars[3].final).toBe(false)
  })
  it('mixes .: :. with commas and still reads a lone . as the final barline', () => {
    const line = barLines(parse('C, D .: E, F :. G.').document)[0]
    expect(line.bars.map((b) => [b.repeatStart, b.repeatEnd, b.final])).toEqual([
      [false, false, false],
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [false, false, true]
    ])
  })
  it('reads 1end, 2end, end1, end2 as endings', () => {
    const endings = (t: string): (number | null)[] =>
      barLines(parse(t).document).map((l) => l.ending)
    expect(endings('1end C, D :.\n2end C, D.')).toEqual([1, 2])
    expect(endings('end1 C, D :.\nEND2 | C | D |')).toEqual([1, 2])
    expect(chordNames(barLines(parse('end1 C, D').document)[0])).toEqual([['C'], ['D']])
  })
  it('marks the whole ending word for colouring', () => {
    const t = 'end2 C'
    expect(parse(t).spans.map((s) => `${s.kind}:${t.slice(s.from, s.to)}`)).toEqual([
      'ending:end2',
      'chord:C'
    ])
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
  it('records where each bar sits in the line', () => {
    const bars = barLines(parse('C, A- D-,').document)[0].bars
    expect(bars.map((b) => [b.from, b.to])).toEqual([
      [0, 1],
      [2, 8]
    ])
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
    expect(barLines(parse('| C |\nl: 첫 소절').document)[0].cue).toBe('첫 소절')
  })
  it('also reads the long form lyric:', () => {
    expect(barLines(parse('C, D\nlyric: 첫 소절').document)[0].cue).toBe('첫 소절')
  })
  it('reserves > for a later feature and points to l:', () => {
    expect(errors('C\n> 가사')).toEqual(['>는 아직 쓰지 않는 기호예요. 가사 큐는 l: 로 쓰세요'])
  })
  it('warns when a cue has no bar line above', () => {
    expect(parse('[A]\nl: x').diagnostics[0]).toMatchObject({ severity: 'warning' })
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

describe('syntax spans', () => {
  const kinds = (text: string): string[] =>
    parse(text).spans.map((s) => `${s.kind}:${text.split('\n')[s.line - 1].slice(s.from, s.to)}`)

  it('marks header, section, directive and key change', () => {
    expect(kinds('title: X\n[Vocal] key: G "slow"')).toEqual([
      'meta:title: X',
      'section:[Vocal]',
      'meta:key: G',
      'directive:"slow"'
    ])
  })
  it('marks barlines, chords and chord marks', () => {
    expect(kinds("1. 'C, B7*.")).toEqual([
      'ending:1.',
      "mark:'",
      'chord:C',
      'barline:,',
      'chord:B7',
      'mark:*',
      'barline:.'
    ])
  })
  it('marks comments, cues, memos and page breaks', () => {
    expect(kinds('// x\n| C |\nl: cue\n{teal: y}\n---').map((k) => k.split(':')[0])).toEqual([
      'comment',
      'barline',
      'chord',
      'barline',
      'cue',
      'memo',
      'pageBreak'
    ])
  })
})

describe('examples/Chordash.chord', () => {
  const text = readFileSync(resolve(__dirname, '../../examples/Chordash.chord'), 'utf8')
  const { document, diagnostics } = parse(text)

  it('parses without errors or warnings', () => expect(diagnostics).toEqual([]))
  it('has the expected structure', () => {
    expect(document.title).toBe('Chordash')
    expect(document.sections.map((s) => s.name)).toEqual([null, 'Intro', 'A', 'B', 'A'])
    expect(barLines(document)).toHaveLength(8)
  })
  it('shows the input features a first user meets', () => {
    const [, intro, a, bridge, last] = document.sections
    expect(intro.directive).toBe('드럼 2마디')
    const rows = a.items as BarLine[]
    expect(rows[0].part?.label).toBe('A')
    expect(rows[0].bars[0].repeatStart).toBe(true)
    expect(rows[0].memos[0]).toMatchObject({ color: 'ink' })
    expect(rows[0].bars.map((b) => b.lyric)).toEqual(['첫 소절', '가사는', '마디마다', '이렇게'])
    expect(rows[1].ending).toBe(1)
    expect(rows[1].bars.at(-1)!.repeatEnd).toBe(true)
    expect(rows[2].bars[3].chords.map((c) => [c.breath, c.accent])).toEqual([
      [true, false],
      [false, true]
    ])
    expect(chordNames((bridge.items as BarLine[])[0])).toEqual([
      ['B♭m7'],
      ['E♭7'],
      ['A♭maj7'],
      ['Fm7']
    ])
    expect((bridge.items as BarLine[])[0].memos[0]).toMatchObject({ color: 'teal' })
    const end = (last.items as BarLine[]).at(-1)!
    expect(end.bars[1]).toMatchObject({ texts: ['Break'] })
    expect(end.bars[1].chords[0].noChord).toBe(true)
    expect(end.bars.at(-1)!.final).toBe(true)
  })
})

describe('countUncertain', () => {
  it('counts ? chords and ? lines', () => {
    expect(countUncertain(parse('?C, D, ?E\nF, G ?').document)).toBe(3)
    expect(countUncertain(parse('C, D').document)).toBe(0)
  })
})

describe('song-form parts', () => {
  it('reads a part marker at the start of a bar line', () => {
    const line = barLines(parse('a) Bb^7, A-7').document)[0]
    expect(line.part).toEqual({ label: 'A', from: 0, to: 2 })
    expect(chordNames(line)).toEqual([['B♭maj7'], ['Am7']])
  })
  it('uppercases Latin letters and keeps digits and Hangul', () => {
    const label = (t: string): string | undefined => barLines(parse(t).document)[0].part?.label
    expect(label('b2) C')).toBe('B2')
    expect(label('ㄱ4) C')).toBe('ㄱ4')
    expect(label('ㄴ) C')).toBe('ㄴ')
    expect(label('| C |')).toBeUndefined()
  })
  it('works with | barlines and endings after the part', () => {
    const line = barLines(parse('b) 1. | C | D :||').document)[0]
    expect(line.part?.label).toBe('B')
    expect(line.ending).toBe(1)
    expect(line.bars).toHaveLength(2)
  })
  it('reads a line of parts only as the song form', () => {
    const { document, diagnostics } = parse('a) a) b) a) ㄱ)')
    expect(diagnostics).toEqual([])
    expect(document.sections[0].items[0]).toMatchObject({
      type: 'form',
      parts: [{ label: 'A' }, { label: 'A' }, { label: 'B' }, { label: 'A' }, { label: 'ㄱ' }]
    })
  })
  it('is not confused with chords', () => {
    expect(barLines(parse('c(b9), b2, a').document)[0].part).toBeNull()
    expect(chordNames(barLines(parse('key: E\nb2, a').document)[0])).toEqual([['F'], ['A']])
  })
  it('rejects a part in the middle of a line', () => {
    expect(errors('C, a) D')).toEqual(['파트 표시는 줄 맨 앞에만 쓸 수 있어요'])
  })
  it('marks parts for colouring', () => {
    expect(parse('a) C').spans.map((s) => s.kind)).toEqual(['part', 'chord'])
  })
})

describe('no chord and bar texts (Phase 6)', () => {
  it('reads nc as N.C. (no chord), in any case', () => {
    const chords = barLines(parse('F7, nc, NC, Bb7').document)[0].bars.flatMap((b) => b.chords)
    expect(chords.map((c) => [c.source, c.noChord, c.error])).toEqual([
      ['F7', false, null],
      ['nc', true, null],
      ['NC', true, null],
      ['Bb7', false, null]
    ])
    expect(parse('F7, nc').diagnostics).toEqual([])
  })
  it('reads quoted text inside a bar as a mark shown above that bar', () => {
    const bars = barLines(parse('F7, "Break" nc, "Drum fill, 2박" Bb7').document)[0].bars
    expect(bars.map((b) => b.texts)).toEqual([[], ['Break'], ['Drum fill, 2박']])
    expect(bars.map((b) => b.chords.map((c) => c.source))).toEqual([['F7'], ['nc'], ['Bb7']])
  })
  it('still reads a line that is only a quoted text as a directive', () => {
    expect(parse('[A]\n"드럼 4마디"').document.sections[0].items[0]).toMatchObject({
      type: 'directive',
      text: '드럼 4마디'
    })
  })
  it('reads a bar line that starts with a quoted text as bars', () => {
    const line = barLines(parse('"Break" nc, F7').document)[0]
    expect(line.bars.map((b) => b.texts)).toEqual([['Break'], []])
  })
  it('reports an unclosed quote in a bar', () => {
    expect(errors('F7, "Break nc')).toEqual(['닫는 따옴표(")가 없음'])
  })
})

describe('text below (_) and above (^) a bar line (Phase 13)', () => {
  const bars = (text: string): BarLine => {
    const items = parse(text).document.sections.flatMap((s) => s.items)
    return items.find((i): i is BarLine => i.type === 'bars')!
  }
  const warnings = (text: string): string[] =>
    parse(text)
      .diagnostics.filter((d) => d.severity === 'warning')
      .map((d) => d.message)

  it('puts a _ line under the whole bar line', () => {
    expect(bars('C, F\n_ 그대는 어디에').cue).toBe('그대는 어디에')
  })

  it('splits a _ line into bars with commas or |, empty cells left out', () => {
    const line = bars('C, F, G\n_ 그대는, , 있나')
    expect(line.bars.map((b) => b.lyric)).toEqual(['그대는', null, '있나'])
    expect(bars('C | F\n_ 가 | 나').bars.map((b) => b.lyric)).toEqual(['가', '나'])
  })

  it('keeps l: as the same as _', () => {
    expect(bars('C, F\nl: 첫 소절').cue).toBe('첫 소절')
    expect(bars('C, F\nl: 가, 나').bars.map((b) => b.lyric)).toEqual(['가', '나'])
  })

  it('puts a ^ line over the next bar line, whole or per bar', () => {
    expect(bars('^ 따-닷 따-닷\nC, F').memos).toEqual([
      { color: 'ink', text: '따-닷 따-닷', line: 1 }
    ])
    const line = bars('^ Break, , Fill\nC, F, G')
    expect(line.bars.map((b) => b.texts)).toEqual([['Break'], [], ['Fill']])
  })

  it('reads _ and ^ at the end of a bar line', () => {
    const line = bars('Bb^7, A-7 _ 그대는, 어디에')
    expect(line.bars.map((b) => b.chords.map((c) => c.source))).toEqual([['Bb^7'], ['A-7']])
    expect(line.bars.map((b) => b.lyric)).toEqual(['그대는', '어디에'])
    const both = bars('C, G7. ^ 따-닷 _ 끝')
    expect(both.bars[1].final).toBe(true)
    expect(both.memos.map((m) => m.text)).toEqual(['따-닷'])
    expect(both.cue).toBe('끝')
  })

  it('keeps ^ stuck to a chord as major 7th, and warns about F ^7', () => {
    expect(bars('F^7').bars[0].chords[0].chord).not.toBeNull()
    expect(bars('F^7').memos).toEqual([])
    expect(bars('F ^7').memos.map((m) => m.text)).toEqual(['7'])
    expect(warnings('F ^7')).toEqual(['메이저7이라면 F^7처럼 띄우지 말고 붙여 쓰세요'])
  })

  it('leaves _ inside quoted text alone', () => {
    expect(bars('"a_b" C').bars[0].texts).toEqual(['a_b'])
  })

  it('warns about too many cells and text without a bar line', () => {
    expect(warnings('C\n_ 가, 나')).toEqual(['가사 칸(2)이 마디(1)보다 많음'])
    expect(warnings('_ 가사')).toEqual(['가사(_) 바로 위에 마디 줄이 없음'])
    expect(warnings('^ 글자')).toEqual(['위쪽 글자(^) 아래에 마디 줄이 없음'])
    expect(warnings('C\n_ 가\n_ 나')).toEqual(['이 마디 줄에는 이미 가사가 있음'])
  })
})
