// The Google button at the right end of the toolbar (web only, 1.4), like other Google-backed
// sites: "로그인" while signed out, the profile picture once signed in. The picture stays (dimmed)
// when the hour-long sign-in runs out; one click signs in again. Its menu shows who it is, where
// new songs are saved, and 로그아웃.

import type { Account, Profile } from '../../platform'
import { installIcons } from './icons'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

function avatar(profile: Profile, className: string): HTMLElement {
  if (profile.photo) {
    const img = document.createElement('img')
    img.className = className
    img.src = profile.photo
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    return img
  }
  const letter = document.createElement('span')
  letter.className = `${className} avatar-letter`
  letter.textContent = (profile.name || profile.email || '?').slice(0, 1).toUpperCase()
  return letter
}

export function installAccount(account: Account): void {
  const wrap = $<HTMLElement>('account')
  const button = $<HTMLButtonElement>('account-button')
  const menu = $<HTMLElement>('account-menu')
  wrap.hidden = false
  // Someone signed in here before: get Google's sign-in ready, so one click is enough.
  if (account.profile()) account.warmUp()
  for (const event of ['pointerenter', 'focus', 'touchstart'])
    button.addEventListener(event, () => account.warmUp(), { once: true, passive: true })

  function closeMenu(): void {
    menu.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }

  function showButton(): void {
    const profile = account.profile()
    const connected = account.connected()
    button.replaceChildren()
    button.classList.toggle('signed-in', Boolean(profile))
    button.classList.toggle('away', Boolean(profile) && !connected)
    if (!profile) {
      const icon = document.createElement('span')
      icon.className = 'icon'
      icon.dataset.icon = 'user-circle'
      const label = document.createElement('span')
      label.className = 'account-label'
      label.textContent = '로그인'
      button.append(icon, label)
      button.title = '구글로 로그인 — 곡을 구글 드라이브에 저장해요'
      installIcons(button)
    } else {
      button.append(avatar(profile, 'avatar'))
      button.title = connected
        ? `${profile.name} (${profile.email})`
        : `${profile.name} — 로그인이 끝났어요. 누르면 다시 연결해요`
    }
    if (!profile) closeMenu()
  }

  function showMenu(): void {
    const profile = account.profile()
    if (!profile) return
    const head = document.createElement('div')
    head.className = 'account-head'
    const who = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = profile.name
    const email = document.createElement('small')
    email.textContent = profile.email
    who.append(name, email)
    head.append(avatar(profile, 'avatar large'), who)

    const placeTitle = document.createElement('p')
    placeTitle.className = 'account-note'
    placeTitle.textContent = '새 곡 저장 위치'
    const places = document.createElement('div')
    places.className = 'store-switch'
    for (const place of account.places) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = place.label
      b.setAttribute('aria-pressed', String(account.place() === place.id))
      b.addEventListener('click', () => {
        account.setPlace(place.id)
        places
          .querySelectorAll('button')
          .forEach((other) => other.setAttribute('aria-pressed', String(other === b)))
      })
      places.append(b)
    }

    const signOut = document.createElement('button')
    signOut.type = 'button'
    signOut.className = 'account-sign-out'
    signOut.textContent = '로그아웃'
    signOut.addEventListener('click', () => {
      closeMenu()
      account.signOut()
    })
    menu.replaceChildren(head, document.createElement('hr'), placeTitle, places, signOut)
    menu.hidden = false
    button.setAttribute('aria-expanded', 'true')
  }

  button.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (!menu.hidden) return closeMenu()
    // Signed out (or the hour ran out): the click itself opens Google's popup.
    if (!account.connected()) {
      await account.signIn()
      return
    }
    showMenu()
  })
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !wrap.contains(e.target as Node)) closeMenu()
  })
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu()
      button.focus()
    }
  })

  account.onChange(showButton)
  showButton()
}
