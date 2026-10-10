// Bundled fonts (all SIL OFL). One list feeds both the app and the PDF document.
//   Geist        — Latin letters and digits (chord names)
//   Pretendard   — Korean, plus △ which Geist lacks
//   Noto Music   — ♭ ♯ ♮ 𝄪 𝄫, which neither of the above has
// The browser picks each character from the first font in the stack that has it.
//
// Pretendard comes in its "dynamic subset" form (1.6.1): 92 small files, each for a range of
// characters. The browser downloads only the ones whose characters are on screen (instead of
// the whole 2 MB font), and a PDF embeds only the ones its song uses.

import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import geistLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url'
import notoMusic from '@fontsource/noto-music/files/noto-music-music-400-normal.woff2?url'
import pretendardCss from 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css?raw'

interface FontFace {
  family: string
  url: string
  weight: string
  unicodeRange?: string
}

const pretendardFiles = import.meta.glob<string>(
  '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/*.woff2',
  { query: '?url', import: 'default', eager: true }
)

/** One face per Pretendard subset file, with the characters it covers (from Pretendard's CSS). */
function pretendardFaces(): FontFace[] {
  const urls = new Map(
    Object.entries(pretendardFiles).map(([path, url]) => [path.split('/').pop()!, url])
  )
  const faces: FontFace[] = []
  for (const block of pretendardCss.split('@font-face').slice(1)) {
    const file = /url\(\.\/woff2-dynamic-subset\/([^)]+)\)/.exec(block)?.[1]
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1]
    const url = file && urls.get(file)
    if (url && range) {
      faces.push({
        family: 'Chordash Pretendard',
        url,
        weight: '45 920',
        unicodeRange: range.trim()
      })
    }
  }
  return faces
}

const FACES: FontFace[] = [
  {
    family: 'Chordash Geist',
    url: geistLatin,
    weight: '100 900',
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  },
  {
    family: 'Chordash Geist',
    url: geistLatinExt,
    weight: '100 900',
    unicodeRange:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  },
  ...pretendardFaces(),
  {
    family: 'Chordash Music',
    url: notoMusic,
    // Only a regular weight exists; bold text gets a synthesized bold.
    weight: '400',
    unicodeRange: 'U+266D-266F,U+1D12A-1D12B'
  }
]

const absolute = (url: string): string => new URL(url, document.baseURI).href

function faceCss(face: FontFace, src: string): string {
  return (
    `@font-face{font-family:'${face.family}';font-style:normal;font-display:block;` +
    `font-weight:${face.weight};src:url(${src}) format('woff2');` +
    (face.unicodeRange ? `unicode-range:${face.unicodeRange};` : '') +
    '}'
  )
}

/** Adds the @font-face rules to the app page. */
export function installFonts(): void {
  const style = document.createElement('style')
  style.textContent = FACES.map((f) => faceCss(f, absolute(f.url))).join('\n')
  document.head.append(style)
}

/** `U+AC00-D7A3, U+3131` → number ranges. */
function ranges(unicodeRange: string): [number, number][] {
  return unicodeRange.split(',').map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-')
    return [parseInt(from, 16), parseInt(to ?? from, 16)]
  })
}

/** Whether any character of `text` is in the face's range (faces without a range always are). */
function usedIn(face: FontFace, codes: number[]): boolean {
  if (!face.unicodeRange) return true
  const spans = ranges(face.unicodeRange)
  return codes.some((code) => spans.some(([from, to]) => code >= from && code <= to))
}

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(new Blob([blob], { type: 'font/woff2' }))
  })
}

/**
 * @font-face rules with the fonts embedded, for a standalone document such as the PDF.
 * Only the fonts for characters in `text` are embedded.
 */
export async function embeddedFontCss(text: string): Promise<string> {
  const codes = [...new Set([...text].map((ch) => ch.codePointAt(0)!))]
  const needed = FACES.filter((face) => usedIn(face, codes))
  const css = await Promise.all(needed.map(async (f) => faceCss(f, await dataUrl(f.url))))
  return css.join('\n')
}
