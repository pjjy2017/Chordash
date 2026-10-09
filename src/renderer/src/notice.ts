// A thin bar under the toolbar for things that can wait for the user (1.5): an unsaved song to
// bring back, a new version to install. One at a time; a newer one replaces the older.

export interface NoticeAction {
  label: string
  primary?: boolean
  /** Runs on click; the bar closes unless it returns false. */
  run(): unknown
}

const bar = document.getElementById('notice') as HTMLElement

/** Shows a message with buttons; "닫기"(✕) is always there. */
export function showNotice(message: string, actions: NoticeAction[]): void {
  const text = document.createElement('span')
  text.className = 'notice-text'
  text.textContent = message
  const buttons = actions.map((action) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = action.label
    if (action.primary) b.className = 'primary'
    b.addEventListener('click', async () => {
      if ((await action.run()) !== false) hideNotice()
    })
    return b
  })
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'notice-close'
  close.textContent = '✕'
  close.title = '닫기'
  close.addEventListener('click', hideNotice)
  bar.replaceChildren(text, ...buttons, close)
  bar.hidden = false
}

/** Changes the message of the bar on screen (e.g. download progress). */
export function updateNotice(message: string): void {
  const text = bar.querySelector('.notice-text')
  if (text) text.textContent = message
}

export function hideNotice(): void {
  bar.hidden = true
  bar.replaceChildren()
}
