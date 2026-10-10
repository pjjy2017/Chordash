// Input help: one sheet of keys. Each key that puts a sign on the sheet shows it — the key, an
// arrow, and a tiny piece of sheet drawn by the real sheet renderer (1.6.2), so the help cannot
// drift from what the app draws — with a few words beside it. Keys that leave nothing on the
// sheet (// memo, --- page turn) only have the words. One example line at the bottom.
// Shown once on first run, then from F1 or ⋯ → 입력법.

import { DEFAULT_THEME } from '../../core'
import { snippetHtml } from './preview'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

interface Row {
  /** Keys pressed, each drawn as a keycap. */
  keys: string[]
  meaning: string
  /** Chordash text whose drawing shows the result (in key C); none = nothing on the sheet. */
  show?: string
  /** How many bars wide the drawing is. */
  slots?: number
}

interface Group {
  title: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    title: '마디',
    rows: [
      { keys: [','], meaning: '마디선', show: '| , |', slots: 2 },
      { keys: ['.'], meaning: '끝 (마침줄)', show: '| , .', slots: 2 },
      { keys: ['.:'], meaning: '반복 시작', show: '.: , |', slots: 2 },
      { keys: [':.'], meaning: '반복 끝', show: '| , :.', slots: 2 },
      { keys: ['1.'], meaning: '1번 엔딩 (줄 맨 앞)', show: '1. | , :.', slots: 2 },
      { keys: ['␣'], meaning: '한 마디에 코드 둘', show: 'C F', slots: 1 },
      { keys: [',', ','], meaning: '빈 마디 (앞 코드 계속)', show: 'C, , F', slots: 3 },
      { keys: ['nc'], meaning: '코드 없음', show: 'nc', slots: 1 }
    ]
  },
  {
    title: '코드 (근음 뒤에)',
    rows: [
      { keys: ['-'], meaning: '마이너', show: 'C-7', slots: 1 },
      { keys: ['^'], meaning: '메이저', show: 'C^7', slots: 1 },
      { keys: ['%'], meaning: '하프 디미니시', show: 'C%', slots: 1 },
      { keys: ['o'], meaning: '디미니시', show: 'Co7', slots: 1 },
      { keys: ['+'], meaning: '오그멘티드', show: 'C+', slots: 1 },
      { keys: ['s'], meaning: 'sus4 (s2 = sus2)', show: 'C7s', slots: 1 },
      { keys: ['b', '#'], meaning: '플랫 · 샵', show: 'Bb, F#', slots: 2 },
      { keys: ['/'], meaning: '베이스 음', show: 'C/E', slots: 1 },
      { keys: ['1~7'], meaning: '도수 (C 키에서)', show: '2-7, 57', slots: 2 }
    ]
  },
  {
    title: '글자',
    rows: [
      { keys: ['_'], meaning: '가사 (쉼표로 마디마다)', show: '| , |\n_ 가사, 마디마다', slots: 2 },
      { keys: ['^'], meaning: '줄 위 글자 (줄 맨 앞)', show: '^ 위에 쓰는 글자\n| , |', slots: 2 },
      { keys: ['"'], meaning: '마디 위 글자', show: '| "Break" |', slots: 1 },
      { keys: ['*'], meaning: '악센트 (코드 뒤)', show: 'C7*', slots: 1 },
      { keys: ["'"], meaning: '브레스 (코드 앞)', show: "'C7", slots: 1 },
      { keys: ['{'], meaning: '색 메모', show: '{teal: 색 메모}\n| , |', slots: 2 }
    ]
  },
  {
    title: '줄',
    rows: [
      { keys: ['['], meaning: '섹션 이름', show: '[Verse]\n| , |', slots: 2 },
      { keys: ['key:'], meaning: '섹션 뒤: 키 바뀜', show: '[B] key: G\n| , |', slots: 2 },
      { keys: ['a)'], meaning: '송폼 파트 (줄 맨 앞)', show: 'a) | , |', slots: 2 },
      { keys: ['"'], meaning: '섹션 뒤: 지시문', show: '[Intro] "드럼 4마디"\n| , |', slots: 2 },
      { keys: ['?'], meaning: '확인 필요 표시', show: '?C7', slots: 1 },
      { keys: ['//'], meaning: '메모 — 악보에 안 나옴' },
      { keys: ['---'], meaning: '여기서 다음 쪽으로' }
    ]
  }
]

/** The one example: what is typed, and the sheet it makes. */
const EXAMPLE = '[Verse]\nC^7, A-7, D-7 G7, C^7.\n_ 가사는, 마디마다, 이렇게, 써요'

/** Width of one bar in a small drawing, in sheet millimetres. */
const PIC_BAR_MM = 22

const keycap = (key: string): string =>
  `<span class="keycap"><span class="keycap-main">${escapeHtml(key)}</span></span>`

function rowHtml(row: Row): string {
  const keys = row.keys.map(keycap).join('')
  const picture = row.show
    ? `<span class="key-arrow">→</span>` +
      `<span class="key-pic" style="--pic-w:${(row.slots ?? 1) * PIC_BAR_MM + (row.show.includes(')') ? 15 : 6)}mm">` +
      snippetHtml(`key: C\n${row.show}`, DEFAULT_THEME, row.slots ?? 1) +
      `</span>`
    : ''
  return (
    `<div class="key-row${row.show ? '' : ' no-pic'}">` +
    `<span class="key-keys">${keys}</span>${picture}` +
    `<span class="key-meaning">${escapeHtml(row.meaning)}</span></div>`
  )
}

function bodyHtml(): string {
  const groups = GROUPS.map(
    (g) =>
      `<section class="key-group"><h3>${escapeHtml(g.title)}</h3>` +
      g.rows.map(rowHtml).join('') +
      `</section>`
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
