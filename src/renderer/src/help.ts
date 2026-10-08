// Input help (1.3): picture cards — the keys to press, an arrow, and the sheet it makes. Every
// result is drawn by the real sheet renderer from a real input, so the help cannot drift from
// what the app does. Other spellings that also work are listed small under a card.

import { DEFAULT_THEME } from '../../core'
import { keycapsHtml } from './keyNames'
import { snippetHtml } from './preview'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

interface Card {
  /** Keys shown as keycaps. */
  keys: string[]
  /** Chordash text the result is drawn from (key F unless it has its own key line). */
  input: string
  /** Bars a row is wide in the drawing. */
  slots?: number
  caption: string
  /** Other ways to type the same thing. */
  also?: string
}

interface Group {
  title: string
  note?: string
  cards: Card[]
}

const GROUPS: Group[] = [
  {
    title: '마디 쓰기',
    note: '한 줄 = 악보의 한 줄. 마디는 쉼표로 닫으면 바로 악보 모양이 돼요.',
    cards: [
      { keys: [','], input: 'C, F', caption: '마디선', also: '| 도 마디선' },
      { keys: ['.'], input: 'C, F.', caption: '마침줄 (곡 끝)' },
      { keys: ['.', ':'], input: '.: C, F', caption: '반복 시작', also: '||:' },
      { keys: [':', '.'], input: 'C, F :.', caption: '반복 끝', also: ':||' },
      { keys: ['1', '.'], input: '1. C, F :.', caption: '1번 엔딩 (줄 맨 앞)', also: '1end, end1' },
      { keys: ['␣'], input: 'A- D-, G7', caption: '한 마디에 코드 둘 (띄어쓰기)' },
      { keys: [',', ','], input: 'C, , F', slots: 3, caption: '빈 마디 = 앞 코드 계속' },
      { keys: ['n', 'c'], input: 'F7, nc', caption: '코드 없음 N.C.' }
    ]
  },
  {
    title: '코드 기호',
    note: '근음(C~B, ♭은 b, ♯은 #) 뒤에 붙여요. 소문자도 돼요.',
    cards: [
      { keys: ['-'], input: 'C-7', slots: 1, caption: '마이너', also: 'm' },
      { keys: ['^'], input: 'C^7', slots: 1, caption: '메이저7', also: 'maj, M' },
      { keys: ['-', '^'], input: 'C-^7', slots: 1, caption: '마이너 메이저7', also: 'mM' },
      { keys: ['%'], input: 'C%', slots: 1, caption: '하프 디미니시', also: 'ø, m7b5' },
      { keys: ['o'], input: 'Co7', slots: 1, caption: '디미니시', also: 'dim' },
      { keys: ['+'], input: 'C+7', slots: 1, caption: '오그멘티드', also: 'aug' },
      { keys: ['s'], input: 'C7s', slots: 1, caption: 'sus4 (s2 = sus2)', also: 'sus, sus4' },
      {
        keys: ['b', '9'],
        input: 'C7b9',
        slots: 1,
        caption: '변형음 (b5 #9 #11 b13…)',
        also: 'C7(b9)'
      },
      { keys: ['/'], input: 'A7/C#', slots: 1, caption: '슬래시 베이스' },
      { keys: ['6', '9'], input: 'C69', slots: 1, caption: '6/9 코드' }
    ]
  },
  {
    title: '도수로 쓰기',
    note: '숫자 = 키의 몇 번째 음 (아래는 F 키). 마이너는 -, 첫 숫자만 도수예요.',
    cards: [
      { keys: ['2', '-', '7'], input: '2-7', slots: 1, caption: '2도 마이너7' },
      { keys: ['5', '7'], input: '57', slots: 1, caption: '5도 7' },
      { keys: ['b', '7'], input: 'b7', slots: 1, caption: '♭7도' }
    ]
  },
  {
    title: '가사와 글자',
    note: '_ 는 아래, ^ 는 위. 쉼표로 나누면 마디마다 하나씩. 코드 줄 끝에 이어 써도 돼요.',
    cards: [
      { keys: ['_'], input: 'C, F\n_ 그대는 어디에', caption: '가사 (줄 아래)', also: 'l:' },
      { keys: ['_', ','], input: 'C, F\n_ 그대는, 어디에', caption: '마디마다 가사' },
      { keys: ['^'], input: '^ 따-닷 따-닷\nC, F', caption: '줄 위 글자' },
      { keys: ['"'], input: 'F7, "Break" nc', caption: '마디 위 글자 (따옴표)' },
      {
        keys: ['{'],
        input: '{teal: 스캣}\nC, F',
        caption: '색 메모',
        also: 'red blue green orange purple gray'
      }
    ]
  },
  {
    title: '코드 앞뒤 표시',
    cards: [
      { keys: ['*'], input: 'B7*', slots: 1, caption: '악센트 (킥)' },
      { keys: ["'"], input: "'E-9", slots: 1, caption: '브레스' }
    ]
  },
  {
    title: '줄 종류',
    cards: [
      { keys: ['['], input: '[Verse]\nC, F', caption: '섹션 이름' },
      { keys: ['['], input: '[Bridge] key: G\nC, F', caption: '이 섹션부터 키 바뀜' },
      { keys: ['a', ')'], input: 'a) C, F', caption: '송폼 파트 (줄 맨 앞)', also: 'b2) ㄱ)' },
      { keys: ['a', ')', 'b', ')'], input: 'a) a) b) a)', caption: '송폼 한눈에' },
      { keys: ['"'], input: '[Intro] "드럼 4마디"\nC, F', caption: '지시문' }
    ]
  },
  {
    title: '더 알아보기',
    note: '줄 끝 ? = 이 줄 확인 필요(PDF 전에 알려 줌), // = 주석(악보에 안 나옴), --- = 여기서 쪽 넘김.',
    cards: [{ keys: ['?'], input: '?C#7, F', caption: '확인 필요 (가져오기 결과 등)' }]
  }
]

/** Tools and shortcuts: a short list, not cards. */
const TOOLS: [string, string][] = [
  ['제목 · 키 칸', '곡 제목과 키는 편집 칸 위의 두 칸에 써요. 단조는 c- · Cm · C minor 모두 돼요'],
  ['코드 풀이 (전구)', '입력 중인 칸의 줄임말을 어떻게 읽었는지 코드 위에 작게 보여 줘요'],
  ['조옮김', '목표 키를 쓰거나 ▼▲. 줄을 선택하고 하면 그 줄만. "원본에 적용"으로 글자도 바꿔요'],
  ['123 / CDE', '코드 이름 ↔ 도수 바꾸기 (선택한 줄만, 없으면 전체)'],
  [
    '코드 키보드',
    '휴대폰에서 코드 입력용 키. 맨 위는 곡 키에 맞는 코드, 가사·제목 줄은 휴대폰 키보드'
  ],
  ['⋯ 메뉴', '예제 곡 열기 · 가져오기 · 셋리스트 · 둘러보기 다시 보기'],
  ['Ctrl+N / O / S', '새 파일 / 열기 / 저장 (Ctrl+Shift+S 다른 이름으로)'],
  ['Ctrl+P · F1', 'PDF · 이 도움말']
]

function cardHtml(card: Card): string {
  const text = /^key:|\nkey:/.test(card.input) ? card.input : `key: F\n${card.input}`
  return (
    `<figure class="help-card">` +
    `<div class="help-keys">${keycapsHtml(card.keys)}<span class="help-arrow">→</span></div>` +
    `<div class="help-sheet">${snippetHtml(text, DEFAULT_THEME, card.slots ?? 2)}</div>` +
    `<figcaption><code>${escapeHtml(card.input.replace(/\n/g, ' ⏎ '))}</code>` +
    `<span>${escapeHtml(card.caption)}</span>` +
    (card.also ? `<small>이것도 됨: ${escapeHtml(card.also)}</small>` : '') +
    `</figcaption></figure>`
  )
}

function bodyHtml(): string {
  const groups = GROUPS.map(
    (g) =>
      `<section><h3>${escapeHtml(g.title)}</h3>` +
      (g.note ? `<p>${escapeHtml(g.note)}</p>` : '') +
      `<div class="help-cards">${g.cards.map(cardHtml).join('')}</div></section>`
  ).join('')
  const tools = TOOLS.map(
    ([name, what]) => `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(what)}</td></tr>`
  ).join('')
  return `${groups}<section><h3>도구와 단축키</h3><table class="help-tools">${tools}</table></section>`
}

const dialog = document.getElementById('help-dialog') as HTMLDialogElement
const body = document.getElementById('help-body') as HTMLElement

export function openHelp(): Promise<void> {
  if (!body.childElementCount) body.innerHTML = bodyHtml()
  dialog.showModal()
  return Promise.resolve()
}
