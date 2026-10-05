// Image/PDF import (PRD 이미지·PDF 임포트, ROADMAP Phase 8): the instructions sent to the Claude
// vision model, and cleanup of what it answers. The call itself goes through the platform
// (desktop: main process), so this file stays pure.

/** Models to choose from in the settings. The first one is the default (DECISIONS Phase 8). */
export const RECOGNIZE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — 가장 정확함 (손글씨 추천)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — 정확도와 요금의 중간' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — 가장 싸고 빠름' }
] as const

export const DEFAULT_RECOGNIZE_MODEL: string = RECOGNIZE_MODELS[0].id

/** Pages per request, so a stray 100-page PDF does not turn into one huge bill. */
export const MAX_RECOGNIZE_PAGES = 20

/** A worked example, also checked by the tests to be valid Chordash text without errors. */
export const RECOGNIZE_EXAMPLE = `title: 샴푸의 요정
key: F

[Intro] "드럼 4마디"

[Verse]
a) Bb^7, A-7, Bb^7, F B7*
l: 그대는 어디에
Bb, A- D-, G-, Cs B7
l: 내 맘을 두고
Bb, ?A-, Bb, F B7 ?

[Chorus]
.: D-7, G-7, C7, F^7
l: 언제나 꿈꾸듯
Bb^7, E7b9, A7, ,
1. D-, G-, C7, F :.
2. D-, G-, "Break" nc, nc

[Vocal] key: G
E-, A-7, D7, G
C, F#7b9, B7, B7/D#

[Outro]
{teal: 스캣}
E-9, E-9 F-9, E-9, 'E-9.`

/** System prompt: what Chordash text looks like (a summary of docs/SYNTAX.md). */
export const RECOGNIZE_SYSTEM_PROMPT = `You transcribe chord charts (handwritten or printed lead sheets and chord sheets, from photos, scans or copied text) into Chordash, a plain-text chord chart format. Answer with the Chordash text only: no explanation, no code fences.

# Chordash format

Header at the top:
title: <song title>   (leave the line out if no title is visible)
key: <key>            e.g. F, Bb, F#m, C-  (minor key: m or -)
If the key is not written, infer it from the chords and add the line "// key 추정" after it.

Sections: a line "[Name]", e.g. [Intro] [Verse] [Verse 2] [Chorus] [Bridge] [Outro]. Use the names written on the chart, in the same language.
- A key change from a section on: "[Vocal] key: G"
- An instruction written next to a section, in double quotes: [Intro] "드럼 4마디"

Rows: one line per row of the chart, keeping the chart's rows and bar counts.
- Separate bars with ",". Do not start a line with a bar line and do not end it with ",".
- Several chords in one bar: separated by spaces, "A- D-".
- Empty bar (the previous chord continues, a "%" or slash repeat): leave it empty, "A7, ,".
- Final double bar line (end of the song): "." right after the last chord, "E-9, 'E-9."
- Repeats: ".:" starts, ":." ends: ".: C, A-, F, G7 :."
- Endings (1st/2nd ending brackets): start the line with "1." or "2." and a space.
- No chord (N.C.): nc
- A word written above a bar (Break, Stop, Fill, Tutti, rit., solo…): in double quotes before the chord of that bar, F7, "Break" nc, Bb7
- A line with only a quoted text is an instruction line: "기타 솔로 8마디"
- Lyrics written under a row: the next line "l: <first few words>", at most about 15 characters.
- A note in colored pen above a row: the line before the row, "{teal: 스캣}". Colors: teal red blue green orange purple gray (pick the nearest).
- Song form letters in boxes (A, B, B2, 가…): start the row with "a) ", "b2) ". A line of only such letters is a form overview: "a) a) b) a)".
- Anything else worth keeping that does not fit: a comment line "// …".
- Ignore page numbers, page breaks and staff lines.

Chords: root A–G (uppercase) with b or #, then:
- minor "-" (Am7 → A-7), major 7 "^7" (Cmaj7, CM7, C△7 → C^7; C△ → C^), minor-major 7 "-^7"
- half-diminished "%" (Bm7b5, Bø → B%), diminished "o" (Cdim7, C°7 → Co7), augmented "+" (C+7)
- sus4 "s" (Csus4 → Cs, C7sus4 → C7s), sus2 "s2"
- extensions 6 7 9 11 13, six-nine "69", "add9"; alterations b5 #5 b9 #9 #11 b13 (E7b9, C7(b9,#11)); altered "alt" (G7alt)
- slash bass: A7/C#
- Accent or kick (">" or "^" written over a chord): "*" after the chord, B7*
- Breath mark ("V" or "'" before a chord): "'" before the chord, 'E-9
- If the chart is written in numbers (1 4 5, Nashville), keep the numbers (b/# before, "-" for minor, 2-7) and make sure key: is set.

Uncertainty — this matters most, the user reviews your answer:
- A chord you cannot read with confidence: write your best guess with "?" in front, ?C#7
- A row whose bars or order you are unsure of: add " ?" at the end of the line.
- Never invent bars or chords that are not on the chart, and do not leave out anything you can see.
- Read every page in order and continue the song across pages.

# Example

${RECOGNIZE_EXAMPLE}`

/** The user message that goes with the page images. */
export function recognizeImagesPrompt(fileName: string, pages: number): string {
  return `${fileName} (${pages}쪽) 악보를 Chordash 텍스트로 옮겨 주세요.`
}

/** The user message for a text that the rule-based import could not read. */
export function recognizeTextPrompt(fileName: string, text: string): string {
  return `${fileName}: 아래 글은 다른 형식으로 쓴 코드 악보입니다. Chordash 텍스트로 옮겨 주세요.\n\n${text}`
}

/** Symbols the model may copy from the page → what the keyboard syntax uses. */
const SYMBOLS: [RegExp, string][] = [
  [/♭/g, 'b'],
  [/♯/g, '#'],
  [/[△Δ]/g, '^'],
  [/°/g, 'o'],
  [/−/g, '-']
]

/** Lines whose text is free (lyrics, memos, comments, header values): no symbol cleanup. */
const FREE_TEXT = /^\s*(l:|lyric:|\/\/|\{|title:)/i

/**
 * The model's answer → Chordash text: drops a code fence or a stray first sentence around it,
 * and turns chord symbols copied from the page into the keyboard spelling.
 */
export function cleanRecognizedText(answer: string): string {
  let text = answer.replace(/\r\n?/g, '\n').trim()
  const fenced = /```[a-z]*\n([\s\S]*?)\n```/i.exec(text)
  if (fenced) text = fenced[1].trim()
  const lines = text.split('\n').map((line) => {
    if (FREE_TEXT.test(line)) return line
    // Quoted texts keep their symbols too.
    return line
      .split(/("[^"]*")/)
      .map((part) =>
        part.startsWith('"') ? part : SYMBOLS.reduce((s, [from, to]) => s.replace(from, to), part)
      )
      .join('')
  })
  return lines.join('\n') + '\n'
}

/** What went wrong with an AI request, as far as the app can tell. */
export type RecognizeFailure =
  | { kind: 'no-key' }
  | { kind: 'cancelled' }
  | { kind: 'connection' }
  | { kind: 'timeout' }
  | { kind: 'api'; status: number; message: string }

/** A failure → a message for the user. Nothing is overwritten when a request fails. */
export function recognizeErrorMessage(failure: RecognizeFailure): string {
  switch (failure.kind) {
    case 'no-key':
      return 'API 키가 없어요. 설정에서 Anthropic API 키를 넣어 주세요.'
    case 'cancelled':
      return '취소했어요.'
    case 'connection':
      return '인터넷에 연결할 수 없어요. 연결을 확인하고 다시 해 주세요.'
    case 'timeout':
      return '응답이 너무 오래 걸려서 멈췄어요. 쪽 수를 줄여서 다시 해 보세요.'
    case 'api':
      switch (failure.status) {
        case 401:
          return 'API 키가 맞지 않아요. 설정에서 키를 다시 넣어 주세요.'
        case 403:
          return '이 API 키로는 이 기능을 쓸 수 없어요. Anthropic 콘솔에서 키 권한을 확인해 주세요.'
        case 404:
          return '선택한 AI 모델을 찾을 수 없어요. 설정에서 다른 모델을 골라 주세요.'
        case 413:
          return '보낼 그림이 너무 커요. 쪽 수를 줄여서 다시 해 보세요.'
        case 429:
          return '요청이 너무 많거나 사용 한도에 닿았어요. 잠시 후 다시 하거나 Anthropic 콘솔에서 크레딧을 확인해 주세요.'
        case 529:
          return 'AI 서버가 지금 붐벼요. 잠시 후 다시 해 주세요.'
        default:
          if (failure.status >= 500) return 'AI 서버에 문제가 생겼어요. 잠시 후 다시 해 주세요.'
          if (/credit balance/i.test(failure.message))
            return 'API 크레딧이 부족해요. Anthropic 콘솔에서 충전해 주세요.'
          return `AI 요청이 거절됐어요 (${failure.status}): ${failure.message}`
      }
  }
}
