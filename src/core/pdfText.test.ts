import { describe, expect, it } from 'vitest'
import { pdfPagesToText, type PdfTextItem } from './pdfText'
import { importText } from './textImport'

/** A piece of text at (x, y); `perLetter` is how wide each letter is drawn. */
const at = (str: string, x: number, y: number, perLetter = 6, height = 10): PdfTextItem => ({
  str,
  x,
  y,
  width: str.length * perLetter,
  height
})

describe('pdfPagesToText', () => {
  it('puts pieces back into lines, top to bottom, left to right', () => {
    const page = [at('F', 120, 700), at('| C', 40, 700), at('| G7 | C |', 40, 680)]
    // F at x 120: (120 − 40) / 6 ≈ column 13.
    expect(pdfPagesToText([page])).toBe('| C          F\n| G7 | C |')
  })

  it('places chords over the letters they sit on, even over wide Korean letters', () => {
    // 그대는 어디에: Korean letters drawn 12 wide; 어 starts at 40 + 4 × 12 = 88.
    const page = [at('C', 40, 700), at('G7', 88, 700), at('그대는 어디에', 40, 686, 12)]
    expect(pdfPagesToText([page])).toBe('C   G7\n그대는 어디에')
  })

  it('splits a chord line given as one piece into its chords', () => {
    // One piece "C       G7" drawn 6 wide per letter: G7 at 40 + 8 × 6 = 88, over 어.
    const page = [at('C       G7', 40, 700), at('그대는 어디에', 40, 686, 12)]
    expect(pdfPagesToText([page])).toBe('C   G7\n그대는 어디에')
  })

  it('joins letters given one piece each, keeping the spaces between words', () => {
    // 드 럼 touch; a word gap (3 = a quarter of a 12-wide letter) stays a space.
    const page = [
      at('드', 40, 700, 12),
      at('럼', 52, 700, 12),
      at('2', 67, 700, 6),
      at('마디', 73, 700, 12)
    ]
    expect(pdfPagesToText([page])).toBe('드럼 2마디')
  })

  it('puts a sign drawn over a gap into that gap (B♭−7 printed as "B −7" plus ♭)', () => {
    const page = [at('B −7', 40, 700, 6), at('♭', 46.5, 702, 5)]
    expect(pdfPagesToText([page])).toBe('B♭−7')
  })

  it('keeps wide gaps as blank lines and pages apart', () => {
    const page1 = [at('[Verse]', 40, 700), at('| C | F |', 40, 686), at('[Chorus]', 40, 620)]
    const page2 = [at('| G | C |', 40, 700)]
    expect(pdfPagesToText([page1, page2])).toBe('[Verse]\n| C | F |\n\n[Chorus]\n\n| G | C |')
  })

  it('gives nothing for a page without text (a scan)', () => {
    expect(pdfPagesToText([[], [at('   ', 0, 0)]])).toBe('')
  })

  it('feeds the text importer: chords over Korean lyrics become bars with lyrics', () => {
    const page = [
      at('C', 40, 700),
      at('G7', 88, 700),
      at('그대는 어디에', 40, 686, 12),
      at('F', 40, 660),
      at('C', 88, 660),
      at('나는 여기에', 40, 646, 12)
    ]
    const result = importText(pdfPagesToText([page]), 'song.pdf')
    expect(result.format).toBe('chords-over-lyrics')
    expect(result.text).toContain('C, G7')
    expect(result.text).toContain('그대는 어디에')
  })
})
