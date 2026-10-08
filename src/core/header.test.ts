import { describe, expect, it } from 'vitest'
import {
  applyChange,
  headerEndLine,
  readHeaderLine,
  setHeaderLine,
  headerLineNumbers
} from './header'
import { parse } from './document'

const set = (text: string, value = 'c-'): string =>
  applyChange(text, setHeaderLine(text, 'key', value))

describe('setHeaderLine', () => {
  it('replaces an existing line', () => {
    expect(set('title: A\nkey: F\n\n[V]')).toBe('title: A\nkey: c-\n\n[V]')
  })
  it('adds the line after the other header lines', () => {
    expect(set('title: A\n\n[V]\n| C |')).toBe('title: A\nkey: c-\n\n[V]\n| C |')
  })
  it('skips comments at the top', () => {
    expect(set('// note\ntitle: A\n[V]')).toBe('// note\ntitle: A\nkey: c-\n[V]')
  })
  it('adds it at the top when there is no header', () => {
    expect(set('[V]\n| C |')).toBe('key: c-\n[V]\n| C |')
    expect(set('')).toBe('key: c-\n')
  })
  it('handles a file that is only a header without a final newline', () => {
    expect(set('title: A')).toBe('title: A\nkey: c-')
  })
  it('does not touch key-like text after the header', () => {
    expect(set('[V]\nkey: F')).toBe('key: c-\n[V]\nkey: F')
  })
})

describe('removing a header line', () => {
  const remove = (text: string): string => applyChange(text, setHeaderLine(text, 'title', null))
  it('removes the line and its line break', () => {
    expect(remove('title: A\nkey: F\n[V]')).toBe('key: F\n[V]')
    expect(remove('key: F\ntitle: A')).toBe('key: F')
  })
  it('does nothing when there is no such line', () => {
    expect(remove('key: F\n[V]')).toBe('key: F\n[V]')
  })
})

describe('readHeaderLine', () => {
  it('returns the value exactly as typed', () => {
    expect(readHeaderLine('// x\ntitle: 가을 연습곡\nkey:  c- \n[V]', 'key')).toBe('c-')
    expect(readHeaderLine('title: A', 'title')).toBe('A')
  })
  it('is null without the line, and ignores lines after the header', () => {
    expect(readHeaderLine('title: A\n[V]\nkey: F', 'key')).toBeNull()
  })
})

describe('headerEndLine', () => {
  it('is the first line that is not header, blank or comment', () => {
    expect(headerEndLine('// x\ntitle: A\n\nkey: F\n[V]\nC')).toBe(4)
    expect(headerEndLine('[V]')).toBe(0)
    expect(headerEndLine('title: A')).toBe(1)
  })
})

describe('old theme: lines', () => {
  it('are ignored with a gentle warning', () => {
    const { diagnostics, document } = parse('title: A\ntheme: bold\n[V]\nC')
    expect(diagnostics).toEqual([expect.objectContaining({ line: 2, severity: 'warning' })])
    expect(document.sections).toHaveLength(1)
  })
})

describe('lenient key header', () => {
  it('reads key: c- as C minor', () => {
    expect(parse('key: c-').document.key).toEqual({
      tonic: { letter: 'C', accidental: 0 },
      minor: true
    })
  })
})

describe('headerLineNumbers', () => {
  it('finds title and key lines at the top, past comments and blanks', () => {
    expect(headerLineNumbers('// 메모\ntitle: A\n\nkey: F\n[A]\nC')).toEqual([2, 4])
  })
  it('ignores key: lines after the header', () => {
    expect(headerLineNumbers('C, F\nkey: G')).toEqual([])
    expect(headerLineNumbers('')).toEqual([])
  })
})
