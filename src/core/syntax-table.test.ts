// SYNTAX.md section 7 tables, run row by row. Editing a table row changes the tests (CLAUDE.md rule 3).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatChord, parseChord } from './chord'
import { parseKey, type Key } from './key'

const syntax = readFileSync(resolve(__dirname, '../../docs/SYNTAX.md'), 'utf8')

/** Rows of the markdown table under the `### <heading>` that starts with `prefix`. */
function tableRows(prefix: string): string[][] {
  const start = syntax.indexOf(`### ${prefix}`)
  if (start < 0) throw new Error(`SYNTAX.md: section ${prefix} not found`)
  const next = syntax.indexOf('\n#', start + 1)
  const block = syntax.slice(start, next < 0 ? undefined : next)
  return block
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .slice(2) // header + separator
    .map((l) =>
      l
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
    )
}

const code = (cell: string): string => {
  const m = /`([^`]*)`/.exec(cell)
  if (!m) throw new Error(`no code in cell: ${cell}`)
  return m[1]
}

function show(input: string, key: Key | null): string {
  const r = parseChord(input, key)
  return r.ok ? formatChord(r.value) : `오류: ${r.error.message}`
}

const chordTables: [string, string | null, number][] = [
  ['7.1', null, 35],
  ['7.2', 'E', 15],
  ['7.3', 'F', 4]
]

for (const [section, keyName, count] of chordTables) {
  describe(`SYNTAX ${section}${keyName ? ` (key: ${keyName})` : ''}`, () => {
    const rows = tableRows(section)
    it('has the expected number of rows', () => expect(rows).toHaveLength(count))
    const key = keyName ? parseKey(keyName) : null
    for (const [input, expected] of rows) {
      it(`${code(input)} → ${expected}`, () => expect(show(code(input), key)).toBe(expected))
    }
  })
}

describe('SYNTAX 7.4 오류', () => {
  const rows = tableRows('7.4')
  it('has the expected number of rows', () => expect(rows).toHaveLength(4))
  for (const [input, expected] of rows) {
    // `(key 없음)` rows are parsed without a key; the others have no degrees in range anyway.
    it(`${input} → ${expected}`, () => expect(show(code(input), null)).toBe(expected))
  }
})

describe('SYNTAX 7.5 조옮김', () => {
  const rows = tableRows('7.5')
  it('has the expected number of rows', () => expect(rows).toHaveLength(4))
  // Transposition is Phase 5 (ROADMAP); rows are listed here so none get forgotten.
  for (const [source, op, expected] of rows) it.todo(`${source} ${op} → ${expected}`)
})
