import { describe, expect, it } from 'vitest'
import { appTitle, isNewerVersion } from './version'

describe('appTitle', () => {
  it('returns the app name when no file is open', () => {
    expect(appTitle()).toBe('Chordash')
  })

  it('prefixes the file name when a file is open', () => {
    expect(appTitle('Chordash.chord')).toBe('Chordash.chord — Chordash')
  })

  it('marks unsaved changes with *', () => {
    expect(appTitle('제목 없음', true)).toBe('*제목 없음 — Chordash')
  })
})

describe('isNewerVersion', () => {
  it('compares numbers, not text', () => {
    expect(isNewerVersion('1.10.0', '1.9.2')).toBe(true)
    expect(isNewerVersion('v1.5.0', '1.4.0')).toBe(true)
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false)
    expect(isNewerVersion('1.3.9', '1.4.0')).toBe(false)
  })

  it('does not trust versions it cannot read', () => {
    expect(isNewerVersion('latest', '1.4.0')).toBe(false)
  })
})
