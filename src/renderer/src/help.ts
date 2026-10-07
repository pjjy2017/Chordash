// Input help (ROADMAP Phase 13): every shorthand, line kind and command in one place.
// Chord examples are run through the real parser, so the results shown are what the app does.

import { DEFAULT_THEME, parse } from '../../core'
import { chordInnerHtml } from './preview'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** A chord as the sheet draws it; `key` for degree examples. */
function chordResult(input: string, key = 'C'): string {
  const { document: doc } = parse(`key: ${key}\n${input}`)
  const bars = doc.sections.flatMap((s) => s.items).find((i) => i.type === 'bars')
  const chord = bars && bars.type === 'bars' ? bars.bars[0]?.chords[0]?.chord : null
  return chord
    ? `<span class="help-chord">${chordInnerHtml(chord, DEFAULT_THEME)}</span>`
    : '<span class="help-bad">읽을 수 없음</span>'
}

type Row = [input: string, meaning: string, result?: string]

interface Part {
  title: string
  note?: string
  rows: Row[]
}

const chords = (rows: [string, string][], key?: string): Row[] =>
  rows.map(([input, meaning]) => [input, meaning, chordResult(input, key)])

const PARTS: Part[] = [
  {
    title: '파일 맨 위',
    rows: [
      ['title: Chordash', '곡 제목 (위 제목 칸과 같음)'],
      ['key: F', '곡의 키. 단조는 c- · Cm · C minor · c단조 모두 됨']
    ]
  },
  {
    title: '마디 줄',
    note: '한 줄 = 악보의 한 줄. 쉼표로 칸을 닫으면 그 칸이 바로 악보 모양으로 바뀌어요(다시 누르면 글자로).',
    rows: [
      ['C, A-, F, G7', ', 또는 | 는 마디선 (줄 맨 앞·끝은 생략 가능)'],
      ['A- D-', '한 마디에 코드 여러 개는 띄어쓰기'],
      ['C, , F', '빈 마디 = 앞 코드가 계속됨'],
      ['F, G7, C.', '. = 마침줄(곡 끝)'],
      ['.: C, F :.', '반복 시작 .: (또는 ||:), 반복 끝 :. (또는 :||)'],
      ['1. C, F :.', '줄 맨 앞 1. 2. (또는 1end · end1) = 엔딩 괄호'],
      ['F7, nc, Bb7', 'nc = 코드 없음 (악보에 N.C.)'],
      ['F7, "Break" nc', '마디 안 "글자" = 그 마디 위에 작게'],
      ['C, F ?', '줄 끝 ? = 이 줄 전체 확인 필요']
    ]
  },
  {
    title: '가사와 위쪽 글자',
    note: '_ 는 마디 줄 아래, ^ 는 마디 줄 위. 쉼표(,)나 | 로 나누면 마디마다 하나씩.',
    rows: [
      ['_ 그대는 어디에', '바로 위 마디 줄 아래에 가사 (l: 도 같음)'],
      ['_ 그대는, , 어디에', '마디마다 가사 (빈칸은 그 마디 없음)'],
      ['^ 따-닷 따-닷', '바로 아래 마디 줄 위에 글자'],
      ['^ Break, , Fill', '마디마다 위에 글자'],
      ['C, F _ 가사 ^ 글자', '코드 줄 끝에 이어 써도 됨 (^ 는 앞에 띄어쓰기)'],
      ['{teal: 스캣}', '색 메모 (teal red blue green orange purple gray)']
    ]
  },
  {
    title: '줄 종류',
    rows: [
      ['[Verse]', '섹션 이름'],
      ['[Vocal] key: G', '이 섹션부터 키 바뀜'],
      ['[Intro] "드럼 4마디"', '섹션 옆 지시문'],
      ['"기타 솔로 8마디"', '따옴표만 있는 줄 = 지시문 한 줄'],
      ['a) C, F, G7, C', '줄 맨 앞 a) b2) ㄱ) = 송폼 파트 (네모 상자)'],
      ['a) a) b) a)', '파트만 있는 줄 = 송폼 한눈에 보기'],
      ['---', '여기서 쪽 넘김'],
      ['// 메모', '주석 (악보에 안 나옴)']
    ]
  },
  {
    title: '코드 줄임말',
    note: '소문자도 됨(c#7 → C♯7). 토큰 맨 앞 소문자 b + 숫자는 ♭도수(b7), B7 코드는 대문자로.',
    rows: chords([
      ['C-7', '- 또는 m = 마이너'],
      ['C^7', '^ 또는 maj, M = 메이저7'],
      ['C-^7', '-^ 또는 mM = 마이너 메이저7'],
      ['C%', '% 또는 ø, m7b5 = 하프 디미니시'],
      ['Co7', 'o 또는 dim = 디미니시'],
      ['C+7', '+ 또는 aug = 오그멘티드'],
      ['C7s', 's 또는 sus4 (s2 = sus2)'],
      ['C69', '6/9 코드'],
      ['C7b9', '변형 b5 #5 b9 #9 #11 b13'],
      ['C(b9)', '숫자 없는 변형은 괄호'],
      ['G7alt', '알터드'],
      ['A7/C#', '슬래시 베이스']
    ])
  },
  {
    title: '도수 (key: F 예시)',
    note: '숫자만 쓰면 메이저, 마이너는 -. 첫 숫자만 도수이고 나머지는 확장음(57 = 5도의 7).',
    rows: chords(
      [
        ['1', '1도'],
        ['2-7', '2도 마이너7'],
        ['57', '5도 7'],
        ['b7', '♭7도'],
        ['#4o7', '♯4도 디미니시7'],
        ['5/7', '베이스도 도수로']
      ],
      'F'
    )
  },
  {
    title: '코드 앞뒤 표시',
    rows: [
      ['B7*', '* = 악센트(킥) — 코드 위에 >'],
      ["'E-9", "' = 브레스 — 코드 왼쪽 위에 V"],
      ['?C#7', '? = 확인 필요 (PDF 전에 알려 줌)']
    ]
  },
  {
    title: '도구와 단축키',
    rows: [
      ['코드 풀이', '입력 중인 칸의 줄임말을 어떻게 읽었는지 회색으로 보여 줌 (bb^ → B♭maj7)'],
      ['조옮김', '목표 키를 쓰거나 ▼▲. 줄을 선택하고 하면 그 줄만. "원본에 적용"으로 글자도 바꿈'],
      ['123 / CDE', '코드 이름 ↔ 도수 바꾸기 (선택한 줄만, 없으면 전체)'],
      [
        '코드 키보드',
        '휴대폰에서 코드 입력용 키. 맨 위는 곡 키에 맞는 코드, 가사·제목 줄은 휴대폰 키보드'
      ],
      ['예제 곡', '⋯ 메뉴 → 예제 곡 열기'],
      ['Ctrl+N / O / S', '새 파일 / 열기 / 저장'],
      ['Ctrl+Shift+S', '다른 이름으로 저장'],
      ['Ctrl+P', 'PDF'],
      ['F1', '이 도움말']
    ]
  }
]

function partHtml(part: Part): string {
  const rows = part.rows
    .map(
      ([input, meaning, result]) =>
        `<tr><td><code>${escapeHtml(input)}</code></td><td>${escapeHtml(meaning)}</td>` +
        `<td class="help-result">${result ?? ''}</td></tr>`
    )
    .join('')
  return (
    `<section><h3>${escapeHtml(part.title)}</h3>` +
    (part.note ? `<p>${escapeHtml(part.note)}</p>` : '') +
    `<table><tbody>${rows}</tbody></table></section>`
  )
}

const dialog = document.getElementById('help-dialog') as HTMLDialogElement
const body = document.getElementById('help-body') as HTMLElement

export function openHelp(): Promise<void> {
  if (!body.childElementCount) body.innerHTML = PARTS.map(partHtml).join('')
  dialog.showModal()
  return Promise.resolve()
}
