// First-run tour (1.3): four short picture slides — what Chordash is, bars with commas, lyrics
// with _, and where the sheet, PDF and help are. Shown once per device, then the example song;
// "둘러보기" in the ⋯ menu shows it again.

import { DEFAULT_THEME } from '../../core'
import { keycapsHtml } from './keyNames'
import { snippetHtml } from './preview'

interface Slide {
  title: string
  /** Picture: keys pressed, then the sheet they make. */
  keys?: string[]
  sheet?: string
  /** One or two short lines. */
  text: string
  /** Extra picture HTML (icons), instead of keys and sheet. */
  html?: string
}

const sheet = (text: string, slots = 4): string =>
  snippetHtml(`key: F\n${text}`, DEFAULT_THEME, slots)

const SLIDES: Slide[] = [
  {
    title: 'Chordash에 오신 걸 환영해요',
    html: '<img class="tour-logo" src="./favicon.svg" alt="" width="72" height="72" />',
    text: '코드 악보를 글자로 빠르게 쓰고, A4 악보로 바로 뽑아요. 곡 제목과 키는 위의 두 칸에 써요.'
  },
  {
    title: '마디는 쉼표로',
    keys: ['C', ',', 'A', '-', ',', 'F', ',', 'G', '7', '.'],
    sheet: 'C, A-, F, G7.',
    text: '쉼표(,)를 치면 마디선, 마침표(.)는 곡 끝. 한 마디에 코드 둘은 띄어쓰기로 써요.'
  },
  {
    title: '가사는 _ 로',
    keys: ['_'],
    sheet: 'C, A-, F, G7\n_ 첫 소절, 가사는, 마디마다, 이렇게',
    text: '마디 줄 아래에 _ 로 시작하면 가사, 쉼표로 나누면 마디마다. 줄 위 글자는 ^ 로 써요.'
  },
  {
    title: '악보와 PDF, 그리고 도움말',
    html:
      '<div class="tour-tools">' +
      '<span class="tour-tool"><span class="icon" data-icon="layout-sidebar-right"></span>미리보기</span>' +
      '<span class="tour-tool strong"><span class="icon" data-icon="file-type-pdf"></span>PDF</span>' +
      '<span class="tour-tool"><span class="icon" data-icon="dots"></span>도움말 F1</span>' +
      '</div>',
    text: '오른쪽(휴대폰은 "악보" 탭)에 A4 악보가 바로 보여요. 모든 입력법은 ⋯ → 입력법 도움말에 그림으로 있어요.'
  }
]

const dialog = document.getElementById('tour-dialog') as HTMLDialogElement
const stage = document.getElementById('tour-stage') as HTMLElement
const dots = document.getElementById('tour-dots') as HTMLElement
const back = document.getElementById('tour-back') as HTMLButtonElement
const next = document.getElementById('tour-next') as HTMLButtonElement
let index = 0
let installIcons: (root: ParentNode) => void = () => undefined

function show(i: number): void {
  index = i
  const slide = SLIDES[i]
  stage.innerHTML =
    `<h2>${slide.title}</h2>` +
    `<div class="tour-picture">` +
    (slide.html ??
      `<div class="help-keys">${keycapsHtml(slide.keys ?? [])}<span class="help-arrow">↓</span></div>` +
        `<div class="help-sheet tour-sheet">${sheet(slide.sheet ?? '')}</div>`) +
    `</div><p>${slide.text}</p>`
  installIcons(stage)
  dots.replaceChildren(
    ...SLIDES.map((_, j) => {
      const dot = document.createElement('span')
      dot.className = j === i ? 'tour-dot current' : 'tour-dot'
      return dot
    })
  )
  back.hidden = i === 0
  next.textContent = i === SLIDES.length - 1 ? '시작하기' : '다음'
}

back.addEventListener('click', () => show(Math.max(0, index - 1)))
next.addEventListener('click', () => {
  if (index === SLIDES.length - 1) dialog.close()
  else show(index + 1)
})

/** Shows the tour from the start; resolves when it is closed. */
export function openTour(icons: (root: ParentNode) => void): Promise<void> {
  installIcons = icons
  show(0)
  dialog.showModal()
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(), { once: true }))
}
