import { describe, expect, it } from 'vitest'
import { formatSetlist, parseSetlist, planSetlist } from './setlist'

describe('setlist file', () => {
  it('reads title, songs and keys', () => {
    const text =
      '\uFEFF// Chordash 셋리스트\r\ntitle: 10월 공연\n샴푸의요정.chord\n\nsongs/Autumn Leaves.chord | key: G\n'
    expect(parseSetlist(text)).toEqual({
      title: '10월 공연',
      entries: [
        { path: '샴푸의요정.chord', key: null },
        { path: 'songs/Autumn Leaves.chord', key: 'G' }
      ]
    })
  })

  it('accepts keys written loosely and ignores comments', () => {
    expect(parseSetlist('// 앙코르\na.chord |KEY:e-').entries).toEqual([
      { path: 'a.chord', key: 'e-' }
    ])
  })

  it('writes what it reads', () => {
    const setlist = {
      title: '10월 공연',
      entries: [
        { path: '샴푸의요정.chord', key: null },
        { path: '../곡/B.chord', key: 'Bb' }
      ]
    }
    const text = formatSetlist(setlist)
    expect(text).toBe(
      '// Chordash 셋리스트\ntitle: 10월 공연\n샴푸의요정.chord\n../곡/B.chord | key: Bb\n'
    )
    expect(parseSetlist(text)).toEqual(setlist)
  })

  it('leaves the title out when there is none', () => {
    expect(formatSetlist({ title: null, entries: [] })).toBe('// Chordash 셋리스트\n')
  })
})

describe('planSetlist', () => {
  it('starts every song on a new page after the contents page', () => {
    expect(planSetlist([3, 1, 2])).toEqual({ contentsPages: 1, starts: [2, 5, 6], total: 7 })
  })

  it('uses more contents pages for long setlists', () => {
    expect(planSetlist([1, 1, 1], 2)).toEqual({ contentsPages: 2, starts: [3, 4, 5], total: 5 })
  })

  it('still has a contents page without songs', () => {
    expect(planSetlist([])).toEqual({ contentsPages: 1, starts: [], total: 1 })
  })
})
