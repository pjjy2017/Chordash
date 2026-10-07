import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from './document'
import { layout, type Page } from './layout'
import { PLAIN_THEME, type LayoutMetrics } from './theme'

// Round numbers so the tests are easy to follow.
// Content height per page = 100 - 0 - 0 = 100; page 1 title 10, later headings 10.
const M: LayoutMetrics = {
  pageWidth: 100,
  pageHeight: 100,
  marginTop: 0,
  marginBottom: 0,
  marginX: 0,
  titleHeight: 10,
  headingHeight: 10,
  sectionGap: 0,
  sectionLabelHeight: 10,
  rowHeight: 10,
  cueHeight: 5,
  formHeight: 10,
  memoHeight: 4,
  aboveHeight: 6,
  directiveHeight: 7,
  minBarsPerRow: 4
}

const rows = (n: number): string => Array.from({ length: n }, () => '| C |').join('\n')

/** Page summary: labels as `[Name]`, rows as `r`. */
const summary = (pages: Page[]): string[] =>
  pages.map((p) => p.blocks.map((b) => (b.type === 'label' ? `[${b.name}]` : 'r')).join(' '))

const pagesOf = (text: string, m = M): Page[] => layout(parse(text).document, m).pages

describe('layout', () => {
  it('fills one page when everything fits', () => {
    expect(summary(pagesOf(`title: T\n[A]\n${rows(3)}`))).toEqual(['[A] r r r'])
  })

  it('moves a whole section to the next page when it fits there', () => {
    // Page 1: title 10 + A (10 + 50) = 70. B needs 10 + 30 = 40 > 30 left → whole B moves.
    const pages = pagesOf(`[A]\n${rows(5)}\n[B]\n${rows(3)}`)
    expect(summary(pages)).toEqual(['[A] r r r r r', '[B] r r r'])
  })

  it('splits a section longer than a page, keeping the label with its first row', () => {
    // A: label + 10 rows = 110 > 90 on a fresh page → flows. Page 1 room 90 → label + 8 rows.
    const pages = pagesOf(`[A]\n${rows(10)}`)
    expect(summary(pages)).toEqual(['[A] r r r r r r r r', 'r r'])
  })

  it('never leaves a label alone at the bottom', () => {
    // Page 1: title 10 + A (10 + 60) = 80, 20 left. B is too long to move whole, so it flows,
    // but label + first row (20) fits → stays. With 10 left it must move.
    const tight = pagesOf(`[A]\n${rows(6)}\n[B]\n${rows(12)}`)
    expect(summary(tight)[0]).toBe('[A] r r r r r r [B] r')
    const tighter = pagesOf(`[A]\n${rows(7)}\n[B]\n${rows(12)}`)
    expect(summary(tighter)[0]).toBe('[A] r r r r r r r')
    expect(summary(tighter)[1].startsWith('[B] r')).toBe(true)
  })

  it('starts a new page at ---', () => {
    expect(summary(pagesOf(`[A]\n| C |\n---\n| D |\n[B]\n| E |`))).toEqual(['[A] r', 'r [B] r'])
  })

  it('ignores --- at the very top of a page', () => {
    expect(summary(pagesOf(`---\n[A]\n| C |`))).toEqual(['[A] r'])
  })

  it('titles pages 2+ as "title N"', () => {
    const pages = pagesOf(`title: 가을 연습곡\n[A]\n${rows(5)}\n[B]\n${rows(5)}\n[C]\n${rows(5)}`)
    expect(pages.map((p) => p.heading)).toEqual(['가을 연습곡', '가을 연습곡 2', '가을 연습곡 3'])
  })

  it('counts lyric cues in the row height', () => {
    const [page] = pagesOf('| C |\nl: cue\n| D |')
    expect(page.blocks.map((b) => b.height)).toEqual([15, 10])
  })

  it('gives short rows at least minBarsPerRow slots', () => {
    const [page] = pagesOf('| C | D |\n| C | D | E | F | G |')
    expect(page.blocks.map((b) => (b.type === 'row' ? b.slots : 0))).toEqual([4, 5])
  })

  it('lays out the example song without overflowing any page', () => {
    const text = readFileSync(resolve(__dirname, '../../examples/Chordash.chord'), 'utf8')
    const m = PLAIN_THEME.metrics
    const pages = layout(parse(text).document, m).pages
    const room = m.pageHeight - m.marginTop - m.marginBottom
    for (const page of pages) {
      const used =
        (page.number === 1 ? m.titleHeight : m.headingHeight) +
        page.blocks.reduce(
          (h, b, i) => h + b.height + (b.type === 'label' && i > 0 ? m.sectionGap : 0),
          0
        )
      expect(used).toBeLessThanOrEqual(room)
    }
    expect(pages.flatMap((p) => p.blocks).filter((b) => b.type === 'row')).toHaveLength(8)
  })
})

describe('key on the sheet', () => {
  it('shows the song key on page 1 only', () => {
    const pages = pagesOf(`key: F#m\n[A]\n${rows(8)}\n[B]\n${rows(8)}`)
    expect(pages.map((p) => p.key)).toEqual(['F♯m', null])
  })
  it('marks key changes on section labels', () => {
    const [page] = pagesOf('key: F\n[A]\n| C |\n[B] key: Bb\n| C |')
    expect(page.blocks.flatMap((b) => (b.type === 'label' ? [b.keyChange] : []))).toEqual([
      null,
      'B♭'
    ])
  })
})

describe('song-form parts on the page', () => {
  it('lays out a form line as its own block', () => {
    const [page] = pagesOf('a) a) b) a)\n[A]\na) C, D')
    expect(page.blocks.map((b) => b.type)).toEqual(['form', 'label', 'row'])
    expect(page.blocks[0].height).toBe(10)
  })
})

describe('Phase 6 heights', () => {
  const heights = (text: string): number[] => pagesOf(text)[0].blocks.map((b) => b.height)
  it('adds a line per colour memo, a band for endings and texts over bars', () => {
    // row 10, cue 5, memo 4 each, above 6
    expect(heights('{teal: a}\n{red: b}\n| C |')).toEqual([18])
    expect(heights('1. C, D')).toEqual([16])
    expect(heights('C, "Break" nc')).toEqual([16])
    expect(heights('{teal: a}\n1. C\nl: cue')).toEqual([25])
  })
  it('gives standalone directives their own block', () => {
    expect(pagesOf('[A]\n"드럼 4마디"\n| C |')[0].blocks.map((b) => b.type)).toEqual([
      'label',
      'directive',
      'row'
    ])
  })
})

describe('rows with _ and ^ text (Phase 13)', () => {
  const rowHeight = (text: string): number => {
    const block = layout(parse(text).document, M).pages[0].blocks[0]
    return block.height
  }

  it('makes room for lyrics under bars and ^ text over the line', () => {
    expect(rowHeight('C, F')).toBe(10)
    expect(rowHeight('C, F\n_ 가, 나')).toBe(15)
    expect(rowHeight('C, F _ 그대는 어디에')).toBe(15)
    expect(rowHeight('^ 따-닷\nC, F')).toBe(14)
    expect(rowHeight('^ Break, Fill\nC, F')).toBe(16)
  })
})
