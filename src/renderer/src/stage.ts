// Performance mode (1.6): the sheet filling the screen, for a tablet or phone on a music stand.
// One page at a time, or two side by side when the screen is wide enough. Turning pages: tap the
// right or left side, swipe, or a Bluetooth page-turner pedal (→ ↓ PageDown Space / ← ↑ PageUp).
// The screen stays on while it is open, where the device allows it. A setlist runs on into the
// next song.

import { DEFAULT_THEME, type PrintLayout } from '../../core'
import { renderPages } from './preview'

export interface StageSong {
  title: string
  song: PrintLayout
}

/** A4 at 96 dpi, the size the zoom works from. */
const PAGE_W = (210 / 25.4) * 96
const PAGE_H = (297 / 25.4) * 96

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
const BACK = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

interface WakeLock {
  release(): Promise<void>
}

export function openStage(songs: StageSong[]): void {
  if (songs.every((s) => s.song.model.pages.length === 0)) return
  const stage = document.createElement('div')
  stage.className = 'stage'
  stage.tabIndex = -1
  const holder = document.createElement('div')
  holder.className = 'stage-sheet'
  const info = document.createElement('div')
  info.className = 'stage-info'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'stage-close'
  close.textContent = '✕'
  close.title = '공연 모드 끝내기 (Esc)'
  stage.append(holder, info, close)

  // Every page of every song, each remembering its song.
  const pages: { element: HTMLElement; song: number; page: number; of: number }[] = []
  songs.forEach((s, songIndex) => {
    const box = document.createElement('div')
    box.innerHTML = renderPages(s.song, DEFAULT_THEME)
    const container = box.firstElementChild as HTMLElement
    container.classList.add('stage-pages')
    const own = [...container.querySelectorAll<HTMLElement>('.page')]
    own.forEach((element, i) =>
      pages.push({ element, song: songIndex, page: i + 1, of: own.length })
    )
    holder.append(container)
  })

  let at = 0
  let perView = 1
  let hideInfo: number | undefined

  function show(): void {
    // Two pages side by side when they would still be as big as one page fitted by height.
    const twoUp = window.innerWidth / (2 * PAGE_W) >= (window.innerHeight / PAGE_H) * 0.95
    perView = twoUp ? 2 : 1
    at = Math.max(0, Math.min(at - (at % perView), pages.length - 1))
    const zoom = Math.min(window.innerHeight / PAGE_H, window.innerWidth / (perView * PAGE_W))
    pages.forEach((p, i) => {
      p.element.hidden = i < at || i >= at + perView
    })
    holder.querySelectorAll<HTMLElement>('.stage-pages').forEach((c) => {
      c.style.zoom = String(zoom)
      c.hidden = ![...c.querySelectorAll<HTMLElement>('.page')].some((page) => !page.hidden)
    })
    const current = pages[at]
    const title = songs[current.song].title
    info.textContent =
      (songs.length > 1 ? `${current.song + 1}/${songs.length} ${title} · ` : '') +
      `${current.page}/${current.of}쪽`
    info.classList.add('shown')
    window.clearTimeout(hideInfo)
    hideInfo = window.setTimeout(() => info.classList.remove('shown'), 2500)
  }

  const turn = (by: number): void => {
    const next = at + by * perView
    if (next < 0 || next >= pages.length) return
    at = next
    show()
  }

  let wake: WakeLock | null = null
  const keepAwake = async (): Promise<void> => {
    try {
      const lock = (
        navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }
      ).wakeLock
      wake = (await lock?.request('screen')) ?? null
    } catch {
      // Not allowed here: the screen follows the device's own timeout.
    }
  }
  // The lock ends when the app goes to the background; take it again on return.
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void keepAwake()
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') return end()
    if (NEXT.has(e.key)) turn(1)
    else if (BACK.has(e.key)) turn(-1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  let swipeX: number | null = null
  stage.addEventListener('pointerdown', (e) => {
    swipeX = e.clientX
  })
  stage.addEventListener('pointerup', (e) => {
    if (e.target === close || swipeX === null) return
    const moved = e.clientX - swipeX
    swipeX = null
    if (Math.abs(moved) > 40) return turn(moved < 0 ? 1 : -1)
    // A tap: right two thirds forward, left third back.
    turn(e.clientX > window.innerWidth / 3 ? 1 : -1)
  })

  function end(): void {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', show)
    document.removeEventListener('visibilitychange', onVisible)
    void wake?.release().catch(() => undefined)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    stage.remove()
  }

  close.addEventListener('click', end)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', show)
  document.addEventListener('visibilitychange', onVisible)
  document.body.append(stage)
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  void keepAwake()
  stage.focus()
  show()
}
