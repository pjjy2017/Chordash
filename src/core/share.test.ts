import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { readShareLink, shareLink, SHARE_ORIGIN } from './share'

describe('share links', () => {
  it('round-trips a song through the link', async () => {
    const song = readFileSync('examples/Chordash.chord', 'utf8')
    const link = await shareLink(song)
    expect(link.startsWith(`${SHARE_ORIGIN}#s=1.`)).toBe(true)
    // Only address-safe letters after the prefix.
    expect(link.split('#s=1.')[1]).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await readShareLink(new URL(link).hash)).toBe(song)
  })

  it('keeps the link short enough to send in a chat', async () => {
    const song = readFileSync('examples/Chordash.chord', 'utf8')
    // Shorter than the song written into the address as it is.
    expect((await shareLink(song)).length).toBeLessThan(encodeURIComponent(song).length)
  })

  it('ignores other addresses and broken links', async () => {
    expect(await readShareLink('')).toBeNull()
    expect(await readShareLink('#section')).toBeNull()
    expect(await readShareLink('#s=1.@@@')).toBeNull()
    expect(await readShareLink('#s=1.AAAA')).toBeNull()
  })
})
