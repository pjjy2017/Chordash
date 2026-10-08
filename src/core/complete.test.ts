import { describe, expect, it } from 'vitest'
import { completionsAt, type CompletionContext } from './complete'

const header: CompletionContext = { inHeader: true, sectionNames: [] }
const body: CompletionContext = { inHeader: false, sectionNames: ['Guitar', 'Verse 2'] }

const labels = (line: string, context = body, column = line.length): string[] | null =>
  completionsAt(line, column, context)?.options.map((o) => o.label) ?? null

describe('completionsAt', () => {
  it('does not suggest title:, key: or lyric: (fields and _ replace them, 1.3)', () => {
    expect(labels('t', header)).toBeNull()
    expect(labels('k', header)).toBeNull()
    expect(labels('l')).toBeNull()
  })

  it('stays out of chord typing', () => {
    for (const chord of ['c', 'b', 'd', 'e', 'Bb', 'g-7', 'C, D', '3']) {
      expect(labels(chord, header), chord).toBeNull()
    }
  })

  it('suggests section names after [', () => {
    expect(labels('[')).toContain('Chorus')
    expect(labels('[ve')).toEqual(['Verse', 'Verse 2'])
    expect(labels('[G')).toEqual(['Guitar'])
    expect(completionsAt('[Ch', 3, body)?.options[0]).toEqual({
      label: 'Chorus',
      insert: 'Chorus]'
    })
  })

  it('suggests memo colours after {', () => {
    expect(labels('{t')).toEqual(['teal'])
    expect(completionsAt('{r', 2, body)).toEqual({
      from: 1,
      options: [{ label: 'red', insert: 'red: ' }]
    })
  })

  it('leaves key values to the user (typed freely, no list)', () => {
    for (const line of ['key: ', 'key: c', 'key: F#m', '[Vocal] key: ']) {
      expect(labels(line, header), line).toBeNull()
    }
  })

  it('suggests key: after a section label', () => {
    expect(completionsAt('[Vocal] k', 9, body)).toEqual({
      from: 8,
      options: [{ label: 'key:', insert: 'key: ', detail: '이 섹션부터 키 변경' }]
    })
  })

  it('looks only at the text before the cursor', () => {
    expect(labels('[Ve xyz', body, 3)).toEqual(['Verse', 'Verse 2'])
  })
})
