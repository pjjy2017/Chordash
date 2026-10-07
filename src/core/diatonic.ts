// The seventh chords of a key, for the phone chord keyboard's suggestion row (1.2).
// Major: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø. Minor: i7 iiø bIIImaj7 iv7 V7 bVImaj7 bVII7 —
// the dominant V7 rather than the natural minor's v7, as jazz charts usually have it.

import { degreeToNote, formatNote, type Key } from './key'
import { noteText } from './transpose'

export interface Suggestion {
  /** What the key types, e.g. `Bb^7`. */
  input: string
  /** What the key shows, e.g. `B♭maj7`. */
  label: string
}

/** Typed shorthand → shown name. */
const QUALITY: Record<string, string> = { '^7': 'maj7', '-7': 'm7', '7': '7', '%': 'm7♭5' }

const MAJOR = ['^7', '-7', '-7', '^7', '7', '-7', '%']
const MINOR = ['-7', '%', '^7', '-7', '7', '^7', '7']

export function diatonicChords(key: Key): Suggestion[] {
  const qualities = key.minor ? MINOR : MAJOR
  return qualities.map((quality, i) => {
    const root = degreeToNote(key, i + 1, 0)
    return { input: noteText(root) + quality, label: formatNote(root) + QUALITY[quality] }
  })
}
