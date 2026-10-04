// Reads and edits header lines (`title:`, `key:`) in the source text for the header fields.
// Edits are minimal text changes so the editor keeps undo. (`theme:` is only recognised so old
// files keep their header together; it is no longer a setting.)

export interface TextChange {
  from: number
  to: number
  insert: string
}

export const HEADER_NAMES = ['title', 'key'] as const
export type HeaderName = (typeof HEADER_NAMES)[number]

const HEADER_LINE = /^\s*(title|key|theme)\s*:/

const NO_CHANGE: TextChange = { from: 0, to: 0, insert: '' }

/**
 * Change that sets `name: value`: replaces the existing header line or adds one after the header.
 * A null value removes the line.
 */
export function setHeaderLine(text: string, name: HeaderName, value: string | null): TextChange {
  const line = `${name}: ${value}`
  const lines = text.split('\n')
  let offset = 0
  let afterHeader = 0
  for (const raw of lines) {
    const end = offset + raw.length
    const trimmed = raw.trim()
    const header = HEADER_LINE.exec(raw)
    if (header && header[1] === name) {
      if (value !== null) return { from: offset, to: end, insert: line }
      // Remove the line with its line break.
      return end < text.length
        ? { from: offset, to: end + 1, insert: '' }
        : { from: Math.max(0, offset - 1), to: end, insert: '' }
    }
    if (header) afterHeader = end + 1
    else if (trimmed !== '' && !trimmed.startsWith('//')) break
    offset = end + 1
  }
  if (value === null) return NO_CHANGE
  if (afterHeader === 0) return { from: 0, to: 0, insert: line + '\n' }
  if (afterHeader > text.length) return { from: text.length, to: text.length, insert: '\n' + line }
  return { from: afterHeader, to: afterHeader, insert: line + '\n' }
}

/** The value of a header line exactly as typed (`key: c-` → `c-`), or null if there is none. */
export function readHeaderLine(text: string, name: HeaderName): string | null {
  const lines = text.split('\n')
  for (const raw of lines.slice(0, headerEndLine(text))) {
    const m = /^\s*(title|key|theme)\s*:(.*)$/.exec(raw)
    if (m && m[1] === name) return m[2].trim()
  }
  return null
}

/** 0-based index of the first line after the header (title/key/theme, blanks and comments). */
export function headerEndLine(text: string): number {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//') || HEADER_LINE.test(lines[i])) continue
    return i
  }
  return lines.length
}

export function applyChange(text: string, change: TextChange): string {
  return text.slice(0, change.from) + change.insert + text.slice(change.to)
}
