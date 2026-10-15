// Text PDFs → chart text (1.7): the words a PDF holds (not a scan), with where each piece sits
// on the page, put back into lines — so a chord chart printed from another app or website reads
// like text copied from it, and the text importer (textImport.ts) takes it from there.
//
// Chords over lyrics depend on columns. PDF pieces carry positions, not columns, and Korean
// letters are about twice as wide as chord letters, so a chord line is placed by where each
// chord sits over the actual letters of the line below it.

import { normalizeChord } from './textImport'

/** One piece of text as pdf.js reports it: its string and its box (PDF units, y upwards). */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

interface Line {
  y: number
  items: PdfTextItem[]
}

const median = (values: number[], fallback: number): number => {
  if (values.length === 0) return fallback
  const sorted = [...values].sort((a, b) => a - b)
  // The lower middle: with few lines, the usual gap rather than the one wide gap.
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** Pieces at about the same height make one line, top to bottom, each left to right. */
/**
 * Pieces of one line, left to right, put together the way they look:
 *   - a piece drawn over another (a ♭ laid over the gap in "B −7") goes into that gap;
 *   - pieces that touch (one letter per piece, common for Korean) join without a space.
 */
/** A gap narrower than this is no space: a fraction of the smaller of the two pieces' letters. */
const touching = (a: PdfTextItem, b: PdfTextItem): number =>
  0.15 * Math.min(a.width / Math.max(1, a.str.length), b.width / Math.max(1, b.str.length))

function merged(items: PdfTextItem[], letter: number): PdfTextItem[] {
  const out: PdfTextItem[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    const end = last ? last.x + last.width : 0
    if (last && item.x < end - letter * 0.3 && last.str.length > 0) {
      const at = Math.min(
        last.str.length,
        Math.max(0, Math.round((item.x - last.x) / (last.width / last.str.length)))
      )
      const str =
        last.str[at] === ' '
          ? last.str.slice(0, at) + item.str + last.str.slice(at + 1)
          : last.str.slice(0, at) + item.str + last.str.slice(at)
      out[out.length - 1] = { ...last, str, width: Math.max(end, item.x + item.width) - last.x }
    } else if (last && item.x - end < touching(last, item)) {
      out[out.length - 1] = {
        ...last,
        str: last.str + item.str,
        width: item.x + item.width - last.x
      }
    } else out.push({ ...item })
  }
  return out
}

function linesOf(items: PdfTextItem[], letter: number): Line[] {
  const tolerance =
    median(
      items.map((i) => i.height),
      10
    ) * 0.5
  const lines: Line[] = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance)
    if (line) line.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }
  for (const line of lines)
    line.items = merged(
      line.items.sort((a, b) => a.x - b.x),
      letter
    )
  return lines.sort((a, b) => b.y - a.y)
}

/** Every word is a chord (or a barline): such a line is laid out over the line below it. */
function isChordLine(line: Line): boolean {
  const words = line.items.flatMap((i) => i.str.split(/\s+/)).filter((w) => w !== '')
  return words.length > 0 && words.every((w) => /^[|:]+$/.test(w) || normalizeChord(w) !== null)
}

/** A piece's string, and where it starts in the line's text. */
interface Placed {
  item: PdfTextItem
  start: number
}

/** Writes pieces at columns; a piece never runs into the one before it. */
function writeLine(pieces: { text: string; column: number }[]): string {
  let out = ''
  for (const { text, column } of pieces) {
    if (column > out.length) out += ' '.repeat(column - out.length)
    else if (out !== '' && !out.endsWith(' ') && !text.startsWith(' ')) out += ' '
    out += text
  }
  return out.replace(/\s+$/, '')
}

/** A plain line: each piece at its column, by the page's typical letter width. */
function plainLine(line: Line, left: number, letter: number): { text: string; placed: Placed[] } {
  const placed: Placed[] = []
  let text = ''
  for (const item of line.items) {
    const column = Math.max(0, Math.round((item.x - left) / letter))
    const before = text
    text = writeLine([
      { text: before, column: 0 },
      { text: item.str, column }
    ])
    placed.push({ item, start: text.length - item.str.length })
  }
  return { text, placed }
}

/** A piece holding several words ("C     G7") → one piece per word, each at its own x. */
function wordsOf(item: PdfTextItem): PdfTextItem[] {
  const perLetter = item.str.length > 0 ? item.width / item.str.length : 0
  return [...item.str.matchAll(/\S+/g)].map((m) => ({
    ...item,
    str: m[0],
    x: item.x + m.index * perLetter,
    width: m[0].length * perLetter
  }))
}

/** The column in the line below that sits under `x`. */
function columnOver(x: number, below: Placed[], left: number, letter: number): number {
  let best: Placed | null = null
  for (const p of below) if (p.item.x <= x + 0.5) best = p
  if (!best) return Math.max(0, Math.round((x - left) / letter))
  const { item, start } = best
  const perLetter = item.str.length > 0 ? item.width / item.str.length : letter
  const offset = (x - item.x) / (perLetter || letter)
  // Past the end of that piece: carry on in plain letters.
  if (offset > item.str.length) {
    return start + item.str.length + Math.round((x - item.x - item.width) / letter)
  }
  return start + Math.round(offset)
}

/** One page's pieces → lines of text. Wide gaps between lines become blank lines. */
function pageText(items: PdfTextItem[]): string[] {
  const words = items.filter((i) => i.str.trim() !== '')
  if (words.length === 0) return []
  const letter = median(
    words.filter((i) => i.width > 0).map((i) => i.width / i.str.length),
    5
  )
  const left = Math.min(...words.map((i) => i.x))
  const lines = linesOf(words, letter)
  const plain = lines.map((line) => plainLine(line, left, letter))
  const gap = median(
    lines.slice(1).map((l, i) => lines[i].y - l.y),
    12
  )
  const out: string[] = []
  lines.forEach((line, i) => {
    if (i > 0 && lines[i - 1].y - line.y > gap * 1.8) out.push('')
    const below = plain[i + 1]
    if (below && isChordLine(line) && !isChordLine(lines[i + 1])) {
      out.push(
        writeLine(
          line.items.flatMap(wordsOf).map((word) => ({
            text: word.str,
            column: columnOver(word.x, below.placed, left, letter)
          }))
        )
      )
    } else out.push(plain[i].text)
  })
  return out
}

/** All pages' text; pages are kept apart by a blank line. Empty for a PDF without text (a scan). */
export function pdfPagesToText(pages: PdfTextItem[][]): string {
  return pages
    .map(pageText)
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join('\n'))
    .join('\n\n')
}
