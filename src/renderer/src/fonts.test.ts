// Every character a chord chart can show must exist in one of the bundled fonts (ROADMAP Phase 4).
import { openSync, type Font } from 'fontkit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const modules = resolve(__dirname, '../../../node_modules')
const open = (path: string): Font => openSync(resolve(modules, path)) as Font

// Same order as the CSS font stack: Geist, then Pretendard, then Noto Music.
const geist = open('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')
const pretendard = open('pretendard/dist/web/variable/woff2/PretendardVariable.woff2')
const music = open('@fontsource/noto-music/files/noto-music-music-400-normal.woff2')

const has = (font: Font, char: string): boolean => font.hasGlyphForCodePoint(char.codePointAt(0)!)

describe('bundled fonts', () => {
  it('Geist has chord letters, digits and the inline symbols', () => {
    for (const c of 'ABCDEFGmajdimaugsus0123456789−+/()ø°') expect(has(geist, c), c).toBe(true)
  })

  it('Pretendard has Korean and △', () => {
    for (const c of '샴푸의요정가사큐△') expect(has(pretendard, c), c).toBe(true)
  })

  it('Noto Music has the accidentals', () => {
    for (const c of ['♭', '♯', '♮', '𝄪', '𝄫']) expect(has(music, c), c).toBe(true)
  })

  it('covers every symbol the normal form and themes use', () => {
    const stack = [geist, pretendard, music]
    for (const c of ['♭', '♯', '△', 'ø', '°', '−']) {
      expect(
        stack.some((f) => has(f, c)),
        c
      ).toBe(true)
    }
  })
})

describe('Pretendard subsets', () => {
  // The app loads Pretendard in small pieces by character range (fonts.ts); together they must
  // still cover what the full font is used for.
  const css = readFileSync(
    resolve(modules, 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'),
    'utf8'
  )
  const spans = [...css.matchAll(/unicode-range:\s*([^;}]+)/g)].flatMap((m) =>
    m[1].split(',').map((part) => {
      const [from, to] = part.trim().replace(/^U\+/i, '').split('-')
      return [parseInt(from, 16), parseInt(to ?? from, 16)]
    })
  )
  const covered = (c: string): boolean =>
    spans.some(([from, to]) => c.codePointAt(0)! >= from && c.codePointAt(0)! <= to)

  it('cover Korean, jamo and △', () => {
    for (const c of '가힣뷁똠방각하ㄱㅎㅏ△') expect(covered(c), c).toBe(true)
  })
})
