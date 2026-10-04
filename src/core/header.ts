// Edits a header line (`title:`, `key:`, `theme:`) in the source text, e.g. when the
// toolbar changes the theme. Returns a minimal text change so the editor keeps undo.

export interface TextChange {
  from: number
  to: number
  insert: string
}

const HEADER_LINE = /^\s*(title|key|theme)\s*:/

/** Change that sets `name: value`: replaces the existing header line or adds one after the header. */
export function setHeaderLine(text: string, name: string, value: string): TextChange {
  const line = `${name}: ${value}`
  const lines = text.split('\n')
  let offset = 0
  let afterHeader = 0
  for (const raw of lines) {
    const end = offset + raw.length
    const trimmed = raw.trim()
    const header = HEADER_LINE.exec(raw)
    if (header && header[1] === name) return { from: offset, to: end, insert: line }
    if (header) afterHeader = end + 1
    else if (trimmed !== '' && !trimmed.startsWith('//')) break
    offset = end + 1
  }
  if (afterHeader === 0) return { from: 0, to: 0, insert: line + '\n' }
  if (afterHeader > text.length) return { from: text.length, to: text.length, insert: '\n' + line }
  return { from: afterHeader, to: afterHeader, insert: line + '\n' }
}

export function applyChange(text: string, change: TextChange): string {
  return text.slice(0, change.from) + change.insert + text.slice(change.to)
}
