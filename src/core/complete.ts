// Autocomplete suggestions for the editor. Pure: given the line and cursor column, says what
// can be inserted. Suggestions never start with a chord letter, so they stay out of chord typing.

import { MEMO_COLORS } from './document'

export interface CompletionOption {
  label: string
  /** Text that replaces the typed part. */
  insert: string
  detail?: string
}

export interface Completions {
  /** Column where the replaced part starts. */
  from: number
  options: CompletionOption[]
}

export interface CompletionContext {
  /** The cursor line is still in the header (before any section or bar line). */
  inHeader: boolean
  /** Section names already used in the document. */
  sectionNames: string[]
}

export const COMMON_SECTIONS = [
  'Intro',
  'Verse',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Interlude',
  'Solo',
  'Outro',
  'Coda'
]

const startsWith = (value: string, typed: string): boolean =>
  value.toLowerCase().startsWith(typed.toLowerCase())

function result(from: number, options: CompletionOption[]): Completions | null {
  return options.length > 0 ? { from, options } : null
}

export function completionsAt(
  line: string,
  column: number,
  context: CompletionContext
): Completions | null {
  const before = line.slice(0, column)

  // `[Ve` → section names.
  let m = /^(\s*\[)([^\]]*)$/.exec(before)
  if (m) {
    const names = [...new Set([...COMMON_SECTIONS, ...context.sectionNames])]
    return result(
      m[1].length,
      names.filter((n) => startsWith(n, m![2])).map((n) => ({ label: n, insert: `${n}]` }))
    )
  }

  // `{te` → memo colours.
  m = /^(\s*\{)([a-z]*)$/.exec(before)
  if (m) {
    return result(
      m[1].length,
      MEMO_COLORS.filter((c) => c.startsWith(m![2])).map((c) => ({ label: c, insert: `${c}: ` }))
    )
  }

  // Key values are typed freely (`c-`, `Bb`, `F#m`, `C단조`); no list is offered for them.

  // `[Vocal] k` → `key:` (a key change on a section label).
  m = /^(\s*\[[^\]]*\]\s+)(k[a-z]*)$/.exec(before)
  if (m && 'key:'.startsWith(m[2])) {
    return {
      from: m[1].length,
      options: [{ label: 'key:', insert: 'key: ', detail: '이 섹션부터 키 변경' }]
    }
  }

  // Title and key have their own fields and lyrics start with _, so no keywords here (1.3).
  return null
}
