import { describe, expect, it } from 'vitest'
import { parse } from './document'
import {
  cleanRecognizedText,
  DEFAULT_RECOGNIZE_MODEL,
  RECOGNIZE_EXAMPLE,
  RECOGNIZE_MODELS,
  RECOGNIZE_SYSTEM_PROMPT,
  recognizeErrorMessage
} from './recognize'

const errors = (text: string): string[] =>
  parse(text)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.line}: ${d.message}`)

describe('recognize prompt', () => {
  it('has an example that is valid Chordash text', () => {
    expect(errors(RECOGNIZE_EXAMPLE)).toEqual([])
    expect(RECOGNIZE_SYSTEM_PROMPT).toContain(RECOGNIZE_EXAMPLE)
  })

  it('shows the example song in its document model', () => {
    const { document } = parse(RECOGNIZE_EXAMPLE)
    expect(document.title).toBe('샴푸의 요정')
    expect(document.sections.map((s) => s.name)).toEqual([
      'Intro',
      'Verse',
      'Chorus',
      'Vocal',
      'Outro'
    ])
  })

  it('defaults to the first model', () => {
    expect(DEFAULT_RECOGNIZE_MODEL).toBe(RECOGNIZE_MODELS[0].id)
  })
})

describe('cleanRecognizedText', () => {
  it('drops a code fence and the sentence around it', () => {
    const answer = '여기 결과입니다:\n```\ntitle: A\nkey: C\n\nC, F\n```\n확인해 주세요.'
    expect(cleanRecognizedText(answer)).toBe('title: A\nkey: C\n\nC, F\n')
  })

  it('turns chord symbols into the keyboard spelling', () => {
    expect(cleanRecognizedText('key: B♭\nB♭△7, E♭°7, F♯−7')).toBe('key: Bb\nBb^7, Ebo7, F#-7\n')
  })

  it('keeps symbols in lyrics, memos, comments and quoted text', () => {
    const text = 'l: 도♯ 레\n{teal: ♭ 메모}\n// ♯\nC, "♭ 표시" F'
    expect(cleanRecognizedText(text)).toBe(text + '\n')
  })

  it('normalizes line breaks', () => {
    expect(cleanRecognizedText('C, F\r\nG\r\n')).toBe('C, F\nG\n')
  })
})

describe('recognizeErrorMessage', () => {
  it('explains common failures in plain words', () => {
    expect(recognizeErrorMessage({ kind: 'no-key' })).toContain('설정')
    expect(recognizeErrorMessage({ kind: 'api', status: 401, message: '' })).toContain(
      '키가 맞지 않아요'
    )
    expect(recognizeErrorMessage({ kind: 'api', status: 529, message: '' })).toContain('붐벼요')
    expect(
      recognizeErrorMessage({ kind: 'api', status: 400, message: 'Your credit balance is too low' })
    ).toContain('크레딧')
    expect(recognizeErrorMessage({ kind: 'api', status: 400, message: 'bad image' })).toContain(
      'bad image'
    )
  })
})
