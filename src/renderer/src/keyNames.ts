// What each typing key means, in a word — shared by the help cards and the phone chord keyboard,
// so both call a key the same thing (1.3).

export const KEY_NAMES: Record<string, string> = {
  ',': '마디',
  '.': '끝',
  '.:': '반복 시작',
  ':.': '반복 끝',
  '-': 'm',
  '^': 'maj',
  '-^': 'm maj',
  '%': 'ø',
  o: 'dim',
  '+': 'aug',
  s: 'sus',
  s2: 'sus2',
  "'": '브레스',
  '*': '악센트',
  '?': '확인',
  _: '가사',
  nc: 'N.C.',
  '/': '베이스'
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Keys drawn as keycaps: the symbol, and its name small underneath. */
export function keycapsHtml(keys: string[]): string {
  return keys
    .map((k) => {
      const name = KEY_NAMES[k]
      return (
        `<span class="keycap"><span class="keycap-main">${escapeHtml(k)}</span>` +
        (name && name !== k ? `<span class="keycap-sub">${escapeHtml(name)}</span>` : '') +
        `</span>`
      )
    })
    .join('')
}
