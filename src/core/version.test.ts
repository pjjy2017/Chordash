import { describe, expect, it } from 'vitest'
import { appTitle } from './version'

describe('appTitle', () => {
  it('returns the app name when no file is open', () => {
    expect(appTitle()).toBe('Chordash')
  })

  it('prefixes the file name when a file is open', () => {
    expect(appTitle('샴푸의요정.chord')).toBe('샴푸의요정.chord — Chordash')
  })

  it('marks unsaved changes with *', () => {
    expect(appTitle('제목 없음', true)).toBe('*제목 없음 — Chordash')
  })
})
