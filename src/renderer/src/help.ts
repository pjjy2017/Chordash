// Input help (1.4): one sheet of keys — each key with what it means, nothing else — and one
// example line at the bottom, drawn by the real sheet renderer. Shown once on first run, then
// from F1 or ⋯ → 입력법. (It replaces 1.3's picture cards and the first-run tour.)

import { DEFAULT_THEME } from '../../core'
import { snippetHtml } from './preview'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Keys pressed (each a keycap), and what they mean. */
type Row = [keys: string[], meaning: string]

interface Group {
  title: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    title: '마디',
    rows: [
      [[','], '마디선'],
      [['.'], '끝 (마침줄)'],
      [['.:'], '반복 시작'],
      [[':.'], '반복 끝'],
      [['1.'], '1번 엔딩 (줄 맨 앞)'],
      [['␣'], '한 마디에 코드 둘'],
      [[',', ','], '빈 마디 (앞 코드 계속)'],
      [['nc'], 'N.C. 코드 없음']
    ]
  },
  {
    title: '코드 (근음 뒤에)',
    rows: [
      [['-'], 'm 마이너'],
      [['^'], 'maj 메이저'],
      [['%'], 'ø 하프 디미니시'],
      [['o'], 'dim 디미니시'],
      [['+'], 'aug 오그멘티드'],
      [['s'], 'sus4 (s2 = sus2)'],
      [['b', '#'], '♭ ♯'],
      [['/'], '베이스 음'],
      [['1~7'], '도수 (키의 몇 번째 음)']
    ]
  },
  {
    title: '글자',
    rows: [
      [['_'], '가사 (줄 아래, 쉼표로 마디마다)'],
      [['^'], '줄 위 글자 (줄 맨 앞)'],
      [['"'], '마디 위 글자 · 지시문'],
      [['*'], '악센트 (코드 뒤)'],
      [["'"], '브레스 (코드 앞)'],
      [['{'], '색 메모 {teal: …}']
    ]
  },
  {
    title: '줄',
    rows: [
      [['['], '섹션 이름 [Verse]'],
      [['key:'], '섹션 뒤에 쓰면 거기서 키 바뀜'],
      [['a)'], '송폼 파트 (줄 맨 앞)'],
      [['?'], '확인 필요 표시'],
      [['//'], '메모 (악보에 안 나옴)'],
      [['---'], '여기서 쪽 넘김']
    ]
  }
]

/** The one example: what is typed, and the sheet it makes. */
const EXAMPLE = '[Verse]\nC^7, A-7, D-7 G7, C^7.\n_ 가사는, 마디마다, 이렇게, 써요'

const keycap = (key: string): string =>
  `<span class="keycap"><span class="keycap-main">${escapeHtml(key)}</span></span>`

function bodyHtml(): string {
  const groups = GROUPS.map(
    (g) =>
      `<section class="key-group"><h3>${escapeHtml(g.title)}</h3><dl>` +
      g.rows
        .map(
          ([keys, meaning]) =>
            `<dt>${keys.map(keycap).join('')}</dt><dd>${escapeHtml(meaning)}</dd>`
        )
        .join('') +
      `</dl></section>`
  ).join('')
  const example =
    `<section class="key-example"><h3>이렇게 치면</h3>` +
    `<pre>${escapeHtml(EXAMPLE)}</pre>` +
    `<div class="help-sheet">${snippetHtml(`key: C\n${EXAMPLE}`, DEFAULT_THEME, 4)}</div></section>`
  const note =
    `<p class="key-note">m7, maj7, dim 같은 보통 표기도 그대로 돼요. ` +
    `곡 제목과 키는 편집 칸 위의 두 칸에 써요.</p>`
  return `<div class="key-sheet">${groups}</div>${example}${note}`
}

const dialog = document.getElementById('help-dialog') as HTMLDialogElement
const body = document.getElementById('help-body') as HTMLElement

export function openHelp(): Promise<void> {
  if (!body.childElementCount) body.innerHTML = bodyHtml()
  dialog.showModal()
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(), { once: true }))
}
