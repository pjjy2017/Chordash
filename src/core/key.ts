// Note names, keys, and letter-based spelling (SYNTAX 5).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type Letter = (typeof LETTERS)[number]

const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11]
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

/** A spelled note. accidental: -1 = ♭, 0 = natural, +1 = ♯. */
export interface Note {
  letter: Letter
  accidental: number
}

export interface Key {
  tonic: Note
  minor: boolean
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12
}

/** Signed distance in semitones, folded into -6..5. */
function signedInterval(from: number, to: number): number {
  return mod12(to - from + 6) - 6
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter)
}

export function pitchClass(note: Note): number {
  return mod12(LETTER_PITCH[letterIndex(note.letter)] + note.accidental)
}

/** Spell a pitch class on a given letter; double sharps/flats move to the neighbouring letter. */
export function spellOnLetter(pitch: number, index: number): Note {
  let i = ((index % 7) + 7) % 7
  let accidental = signedInterval(LETTER_PITCH[i], pitch)
  if (accidental > 1) {
    i = (i + 1) % 7
    accidental = signedInterval(LETTER_PITCH[i], pitch)
  } else if (accidental < -1) {
    i = (i + 6) % 7
    accidental = signedInterval(LETTER_PITCH[i], pitch)
  }
  return { letter: LETTERS[i], accidental }
}

/** Scale degree (1..7) of a key, raised/lowered by `accidental` semitones. */
export function degreeToNote(key: Key, degree: number, accidental: number): Note {
  const scale = key.minor ? NATURAL_MINOR_SCALE : MAJOR_SCALE
  const pitch = pitchClass(key.tonic) + scale[degree - 1] + accidental
  return spellOnLetter(mod12(pitch), letterIndex(key.tonic.letter) + degree - 1)
}

/** Parses a key name such as `F`, `Bb`, `C#`, `Am`, `F#m`. Returns null if invalid. */
export function parseKey(text: string): Key | null {
  const m = /^([A-Ga-g])([#b]?)(m?)$/.exec(text.trim())
  if (!m) return null
  return {
    tonic: {
      letter: m[1].toUpperCase() as Letter,
      accidental: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
    },
    minor: m[3] === 'm'
  }
}

export function formatAccidental(accidental: number): string {
  if (accidental > 0) return '♯'.repeat(accidental)
  if (accidental < 0) return '♭'.repeat(-accidental)
  return ''
}

export function formatNote(note: Note): string {
  return note.letter + formatAccidental(note.accidental)
}

export function formatKey(key: Key): string {
  return formatNote(key.tonic) + (key.minor ? 'm' : '')
}
