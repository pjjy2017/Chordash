// Chord token parser, resolver and normal-form formatter (SYNTAX 4, 6).

import { degreeToNote, formatAccidental, formatNote, type Key, type Letter, type Note } from './key'

export type Quality =
  | 'major'
  | 'minor'
  | 'maj7'
  | 'minorMaj7'
  | 'halfDiminished'
  | 'diminished'
  | 'augmented'
  | 'sus4'
  | 'sus2'

export type Extension = '6' | '69' | '7' | '9' | '11' | '13'

/** Root or bass as typed: an absolute note or a scale degree relative to the key. */
export type PitchSpec =
  { kind: 'note'; note: Note } | { kind: 'degree'; degree: number; accidental: number }

/** A parsed chord token whose root/bass may still be scale degrees. */
export interface ChordSpec {
  root: PitchSpec
  quality: Quality
  extension: Extension | null
  add: string | null
  /** Alterations as typed, normalized to `b`/`#` + number, e.g. `b9`, `#11`. */
  alterations: string[]
  /** `alt` (altered dominant). */
  altered: boolean
  bass: PitchSpec | null
}

/** A chord with root and bass spelled as notes. */
export interface Chord extends Omit<ChordSpec, 'root' | 'bass'> {
  root: Note
  bass: Note | null
}

export type ChordErrorCode = 'empty' | 'unknown-root' | 'degree-range' | 'no-key' | 'unexpected'

export interface ChordError {
  code: ChordErrorCode
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ChordError }

const MESSAGES: Record<Exclude<ChordErrorCode, 'unexpected'>, string> = {
  empty: '코드가 비어 있음',
  'unknown-root': '알 수 없는 루트',
  'degree-range': '도수는 1~7',
  'no-key': 'key가 지정되지 않음'
}

function fail<T>(code: ChordErrorCode, message?: string): Result<T> {
  return { ok: false, error: { code, message: message ?? MESSAGES[code as keyof typeof MESSAGES] } }
}

// Longest alternatives first; matched case-sensitively at the cursor.
const QUALITY_TOKENS: [string, Quality][] = [
  ['m7b5', 'halfDiminished'],
  ['-maj', 'minorMaj7'],
  ['mmaj', 'minorMaj7'],
  ['maj', 'maj7'],
  ['-^', 'minorMaj7'],
  ['m^', 'minorMaj7'],
  ['mM', 'minorMaj7'],
  ['-M', 'minorMaj7'],
  ['m', 'minor'],
  ['-', 'minor'],
  ['^', 'maj7'],
  ['M', 'maj7'],
  ['%', 'halfDiminished'],
  ['ø', 'halfDiminished'],
  ['dim', 'diminished'],
  ['o', 'diminished'],
  ['aug', 'augmented'],
  ['+', 'augmented']
]

const SUS_TOKENS: [string, Quality][] = [
  ['sus4', 'sus4'],
  ['sus2', 'sus2'],
  ['sus', 'sus4'],
  ['s2', 'sus2'],
  ['s4', 'sus4'],
  ['s', 'sus4']
]

const EXTENSIONS: Extension[] = ['13', '11', '69', '9', '7', '6']
const ADD_DEGREES = ['13', '11', '9', '4', '2']
const ALTERATION = /^([b#])(13|11|9|5)/

class Cursor {
  pos = 0
  constructor(readonly text: string) {}
  get rest(): string {
    return this.text.slice(this.pos)
  }
  peek(offset = 0): string {
    return this.text[this.pos + offset] ?? ''
  }
  eat(token: string): boolean {
    if (this.text.startsWith(token, this.pos)) {
      this.pos += token.length
      return true
    }
    return false
  }
  eatAny<T>(table: [string, T][]): T | null {
    for (const [token, value] of table) if (this.eat(token)) return value
    return null
  }
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9'

/** Root or bass: an absolute note or a scale degree. */
function parsePitch(c: Cursor): Result<PitchSpec> {
  const first = c.peek()
  // Degree: optional b/# then one digit. Lowercase `b` + digit is a flat degree (SYNTAX 4.1).
  if (isDigit(first) || ((first === 'b' || first === '#') && isDigit(c.peek(1)))) {
    let accidental = 0
    if (first === 'b') accidental = -1
    if (first === '#') accidental = 1
    if (accidental !== 0) c.pos++
    const degree = Number(c.peek())
    c.pos++
    if (degree < 1 || degree > 7) return fail('degree-range')
    return { ok: true, value: { kind: 'degree', degree, accidental } }
  }
  if (/^[A-Ga-g]$/.test(first)) {
    c.pos++
    let accidental = 0
    if (c.eat('#')) accidental = 1
    else if (c.eat('b')) accidental = -1
    return {
      ok: true,
      value: { kind: 'note', note: { letter: first.toUpperCase() as Letter, accidental } }
    }
  }
  return fail('unknown-root')
}

function parseAlterations(c: Cursor, out: string[]): Result<null> {
  for (;;) {
    if (c.peek() === '(') {
      const close = c.text.indexOf(')', c.pos)
      if (close < 0) return fail('unexpected', "닫는 괄호 ')'가 없음")
      const inner = c.text.slice(c.pos + 1, close)
      const parts = inner.split(',')
      for (const part of parts) {
        const m = ALTERATION.exec(part)
        if (!m || m[0] !== part) return fail('unexpected', `알 수 없는 변형: (${inner})`)
        out.push(m[0])
      }
      c.pos = close + 1
      continue
    }
    const m = ALTERATION.exec(c.rest)
    if (!m) return { ok: true, value: null }
    out.push(m[0])
    c.pos += m[0].length
  }
}

/** Parses a chord token (without `'`, `?`, `*` marks). */
export function parseChordSpec(text: string): Result<ChordSpec> {
  if (text.length === 0) return fail('empty')
  const c = new Cursor(text)

  const root = parsePitch(c)
  if (!root.ok) return root

  let quality: Quality = c.eatAny(QUALITY_TOKENS) ?? 'major'
  let sus = quality === 'major' ? c.eatAny(SUS_TOKENS) : null

  let extension = EXTENSIONS.find((e) => c.eat(e)) ?? null

  // `c7s`, `C7sus4`: sus may follow the extension.
  if (quality === 'major' && sus === null) sus = c.eatAny(SUS_TOKENS)
  if (sus) quality = sus

  // `B7alt`; a bare `Calt` means C7alt.
  const altered = c.eat('alt')
  if (altered && quality !== 'major')
    return fail('unexpected', 'alt는 도미넌트 코드에만 (예: B7alt)')
  if (altered && extension === null) extension = '7'

  let add: string | null = null
  if (c.eat('add')) {
    add = ADD_DEGREES.find((d) => c.eat(d)) ?? null
    if (add === null) return fail('unexpected', `알 수 없는 add: ${c.rest || '(숫자 없음)'}`)
  }

  const alterations: string[] = []
  const alt = parseAlterations(c, alterations)
  if (!alt.ok) return alt

  let bass: PitchSpec | null = null
  if (c.eat('/')) {
    if (extension === '6' && c.rest.startsWith('9')) {
      return fail('unexpected', '6/9 코드는 69로 입력 (예: C69)')
    }
    const b = parsePitch(c)
    if (!b.ok)
      return b.error.code === 'unknown-root'
        ? fail('unexpected', `알 수 없는 베이스: /${c.rest}`)
        : b
    bass = b.value
  }

  if (c.rest.length > 0) return fail('unexpected', `알 수 없는 기호: ${c.rest}`)

  // m7b5 written out (`Em7b5`) is a half-diminished chord.
  if (quality === 'minor' && extension === '7' && alterations.includes('b5')) {
    quality = 'halfDiminished'
    alterations.splice(alterations.indexOf('b5'), 1)
  }

  return {
    ok: true,
    value: { root: root.value, quality, extension, add, alterations, altered, bass }
  }
}

function resolvePitch(spec: PitchSpec, key: Key | null): Result<Note> {
  if (spec.kind === 'note') return { ok: true, value: spec.note }
  if (!key) return fail('no-key')
  return { ok: true, value: degreeToNote(key, spec.degree, spec.accidental) }
}

/** Spells degree roots/basses against the key. */
export function resolveChord(spec: ChordSpec, key: Key | null): Result<Chord> {
  const root = resolvePitch(spec.root, key)
  if (!root.ok) return root
  let bass: Note | null = null
  if (spec.bass) {
    const b = resolvePitch(spec.bass, key)
    if (!b.ok) return b
    bass = b.value
  }
  return { ok: true, value: { ...spec, root: root.value, bass } }
}

/** Parses and resolves in one step. */
export function parseChord(text: string, key: Key | null): Result<Chord> {
  const spec = parseChordSpec(text)
  return spec.ok ? resolveChord(spec.value, key) : spec
}

function formatExtension(ext: Extension | null): string {
  return ext === '69' ? '6/9' : (ext ?? '')
}

/** Chord quality + extension in normal form, e.g. `m7`, `maj9`, `7sus4`. */
export function formatQuality(chord: Pick<Chord, 'quality' | 'extension'>): string {
  const ext = formatExtension(chord.extension)
  switch (chord.quality) {
    case 'major':
      return ext
    case 'minor':
      return 'm' + ext
    case 'maj7':
      return 'maj' + (ext || '7')
    case 'minorMaj7':
      return 'mM' + (ext || '7')
    case 'halfDiminished':
      return 'm' + (ext || '7') + '♭5'
    case 'diminished':
      return 'dim' + ext
    case 'augmented':
      return 'aug' + ext
    case 'sus4':
      return ext + 'sus4'
    case 'sus2':
      return ext + 'sus2'
  }
}

function formatAlteration(alt: string): string {
  return formatAccidental(alt[0] === '#' ? 1 : -1) + alt.slice(1)
}

/** Normal form (SYNTAX 7): `B♭maj7`, `E7♭9`, `A7/C♯`. */
export function formatChord(chord: Chord): string {
  const quality = formatQuality(chord)
  let alterations = chord.alterations.map(formatAlteration).join('')
  // Without a number before them, alterations would read as part of the root: C(♭9), not C♭9.
  if (alterations && !/[0-9]/.test(quality)) alterations = `(${alterations})`
  return (
    formatNote(chord.root) +
    quality +
    (chord.altered ? 'alt' : '') +
    (chord.add ? 'add' + chord.add : '') +
    alterations +
    (chord.bass ? '/' + formatNote(chord.bass) : '')
  )
}
