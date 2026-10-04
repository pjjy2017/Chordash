// Every character a chord chart can show must exist in one of the bundled fonts (ROADMAP Phase 4).
import { openSync, type Font } from 'fontkit'
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
