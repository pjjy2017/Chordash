import { describe, expect, it } from 'vitest'
import { applyChange, setHeaderLine } from './header'
import { parse } from './document'

const set = (text: string, value = 'plain'): string =>
  applyChange(text, setHeaderLine(text, 'theme', value))

describe('setHeaderLine', () => {
  it('replaces an existing line', () => {
    expect(set('title: A\ntheme: bold\n\n[V]')).toBe('title: A\ntheme: plain\n\n[V]')
  })
  it('adds the line after the other header lines', () => {
    expect(set('title: A\nkey: F\n\n[V]\n| C |')).toBe(
      'title: A\nkey: F\ntheme: plain\n\n[V]\n| C |'
    )
  })
  it('skips comments at the top', () => {
    expect(set('// note\ntitle: A\n[V]')).toBe('// note\ntitle: A\ntheme: plain\n[V]')
  })
  it('adds it at the top when there is no header', () => {
    expect(set('[V]\n| C |')).toBe('theme: plain\n[V]\n| C |')
    expect(set('')).toBe('theme: plain\n')
  })
  it('handles a file that is only a header without a final newline', () => {
    expect(set('title: A')).toBe('title: A\ntheme: plain')
  })
  it('does not touch theme-like text after the header', () => {
    expect(set('[V]\ntheme: bold')).toBe('theme: plain\n[V]\ntheme: bold')
  })
})

describe('theme header', () => {
  it('is read into the document', () => {
    expect(parse('theme: plain').document.theme).toBe('plain')
    expect(parse('title: A').document.theme).toBeNull()
  })
  it('rejects unknown themes', () => {
    expect(parse('theme: fancy').diagnostics[0].message).toBe(
      '알 수 없는 테마: fancy (bold, plain)'
    )
  })
})
