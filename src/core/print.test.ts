import { describe, expect, it } from 'vitest'
import { parse } from './document'
import { DEFAULT_PRINT, joinRows, MIN_SCALE, printLayout, scaledMetrics } from './print'
import { DEFAULT_THEME } from './theme'

const base = DEFAULT_THEME.metrics
const rows = (text: string): string[] =>
  joinRows(parse(text).document)
    .sections.flatMap((s) => s.items)
    .flatMap((i) =>
      i.type === 'bars' ? [`${i.bars.length}@${(i.barLines ?? [i.line]).join(',')}`] : []
    )

/** A song of `lines` four-bar lines. */
const long = (lines: number): string =>
  'title: Long\nkey: C\n' + Array.from({ length: lines }, () => 'C, F, G7, C').join('\n')

describe('scaledMetrics', () => {
  it('lays out bigger pages for smaller text, keeping the margins on paper', () => {
    const m = scaledMetrics(base, 0.5, 1)
    expect(m.pageWidth).toBe(base.pageWidth * 2)
    expect(m.marginX * 0.5).toBe(base.marginX)
    expect(m.rowHeight).toBe(base.rowHeight)
  })

  it('spaces rows and section gaps', () => {
    const m = scaledMetrics(base, 1, 1.5)
    expect(m.rowHeight).toBe(base.rowHeight * 1.5)
    expect(m.sectionGap).toBe(base.sectionGap * 1.5)
  })
})

describe('joinRows', () => {
  it('joins pairs of lines up to 8 bars, remembering each bar’s line', () => {
    expect(rows('C, F, G, C\nD, E, F, G\nA, B, C, D')).toEqual(['8@1,1,1,1,2,2,2,2', '4@3'])
  })

  it('keeps lines with their own part box, memos, endings or lyric line apart', () => {
    expect(rows('C, F\na) G, C')).toEqual(['2@1', '2@2'])
    expect(rows('C, F\n{teal: 메모}\nG, C')).toEqual(['2@1', '2@3'])
    expect(rows('1. C, F :.\n2. G, C')).toEqual(['2@1', '2@2'])
    expect(rows('C, F\nl: 가사\nG, C')).toEqual(['2@1', '2@3'])
    expect(rows('C, F, G, C, D\nG, C, D, E')).toEqual(['5@1', '4@2'])
  })

  it('does not join across sections', () => {
    expect(rows('[A]\nC, F\n[B]\nG, C')).toEqual(['2@2', '2@4'])
  })
})

describe('printLayout', () => {
  it('as designed by default', () => {
    const doc = parse(long(10)).document
    const result = printLayout(doc, base, DEFAULT_PRINT)
    expect(result.scale).toBe(1)
    expect(result.metrics.pageWidth).toBe(base.pageWidth)
  })

  it('fits a two-page song on one page with the biggest scale that works', () => {
    const doc = parse(long(30)).document
    expect(printLayout(doc, base, DEFAULT_PRINT).model.pages.length).toBe(2)
    const fit = printLayout(doc, base, { ...DEFAULT_PRINT, fitOnePage: true })
    expect(fit.model.pages.length).toBe(1)
    expect(fit.scale).toBeLessThan(1)
    expect(fit.scale).toBeGreaterThan(MIN_SCALE)
    // A little bigger would not fit.
    const bigger = printLayout(doc, base, { ...DEFAULT_PRINT, scale: fit.scale + 0.02 })
    expect(bigger.model.pages.length).toBe(2)
  })

  it('leaves a song that already fits alone', () => {
    const doc = parse(long(5)).document
    expect(printLayout(doc, base, { ...DEFAULT_PRINT, fitOnePage: true }).scale).toBe(1)
  })

  it('gives up at the smallest scale for very long songs', () => {
    const doc = parse(long(200)).document
    const fit = printLayout(doc, base, { ...DEFAULT_PRINT, fitOnePage: true })
    expect(fit.scale).toBe(MIN_SCALE)
    expect(fit.model.pages.length).toBeGreaterThan(1)
  })
})
