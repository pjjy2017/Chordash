// Splits a chord into the pieces a theme draws: root, inline quality, superscript, bass (SYNTAX 6).

import { formatAccidental, formatNote } from './key'
import type { Chord } from './chord'
import type { ChordStyle } from './theme'

export interface ChordParts {
  /** `B♭` */
  root: string
  /** Written on the baseline after the root, e.g. `-` or `°`. */
  inline: string
  /** Written as superscript (empty when the theme writes extensions inline). */
  sup: string
  /** `/C♯`, or empty. */
  bass: string
}

export function chordParts(chord: Chord, style: ChordStyle): ChordParts {
  const ext = chord.extension === '69' ? '6/9' : (chord.extension ?? '')
  const maj = style.symbols ? '△' : 'maj'
  let inline = ''
  let sup = ''

  switch (chord.quality) {
    case 'major':
      sup = ext
      break
    case 'minor':
      inline = style.minorSymbol
      sup = ext
      break
    case 'maj7':
      sup = maj + (ext || '7')
      break
    case 'minorMaj7':
      inline = style.minorSymbol
      sup = maj + (ext || '7')
      break
    case 'halfDiminished':
      if (style.symbols) sup = 'ø' + (ext || '7')
      else {
        inline = style.minorSymbol
        sup = (ext || '7') + '♭5'
      }
      break
    case 'diminished':
      inline = style.symbols ? '°' : 'dim'
      sup = ext
      break
    case 'augmented':
      inline = style.symbols ? '+' : 'aug'
      sup = ext
      break
    case 'sus4':
    case 'sus2':
      sup = ext + chord.quality
      break
  }

  if (chord.altered) sup += 'alt'
  if (chord.add) sup += 'add' + chord.add
  let alterations = chord.alterations
    .map((a) => formatAccidental(a[0] === '#' ? 1 : -1) + a.slice(1))
    .join('')
  // Same rule as the normal form: C(♭9), not C♭9.
  if (alterations && !/[0-9]/.test(sup)) alterations = `(${alterations})`
  sup += alterations

  if (style.extensionStyle === 'inline') {
    inline += sup
    sup = ''
  }
  return {
    root: formatNote(chord.root),
    inline,
    sup,
    bass: chord.bass ? '/' + formatNote(chord.bass) : ''
  }
}
