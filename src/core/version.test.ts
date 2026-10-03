import { describe, expect, it } from 'vitest'
import { appTitle } from './version'

describe('appTitle', () => {
  it('returns the app name when no file is open', () => {
    expect(appTitle()).toBe('chordpad')
  })

  it('prefixes the file name when a file is open', () => {
    expect(appTitle('샴푸의요정.chord')).toBe('샴푸의요정.chord — chordpad')
  })
})
