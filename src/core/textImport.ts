// Text import (PRD 텍스트 임포트, ROADMAP Phase 7): turns chord charts written in other text
// formats into Chordash text. Offline and rule-based. Every line is classified on its own, so
// mixed texts work too:
//   - bar-line text      `| C | Am | F G |`
//   - chords over lyrics  a line of chords above a lyric line (web chord sites)
//   - ChordPro           `{title: …}`, `{soc}`, `[C]lyrics`
// Guesses are marked with `?` for review: a `?` at the end of a line whose bars were guessed
// (one chord = one bar), and `?` before a chord that could not be read.

import { parseChordSpec } from './chord'
import { parseKey } from './key'

export type ImportFormat = 'bars' | 'chords-over-lyrics' | 'chordpro' | 'unknown'

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  bars: '마디선 텍스트',
  'chords-over-lyrics': '코드-가사 2줄',
  chordpro: 'ChordPro',
  unknown: '알 수 없음'
}

export interface ImportResult {
  /** Chordash text, ready to review. */
  text: string
  /** The format most of the lines were in. */
  format: ImportFormat
  /** Chords and lines marked `?`. */
  uncertain: number
}

// --- chords -------------------------------------------------------------------------------

/**
 * A chord as written elsewhere → Chordash input, or null if it is not a chord.
 * Fixes common spellings: `Am(maj7)`, `C(add9)`, `C6/9`, `Cm7-5`, `Cmin7`, `C△7`, `B♭`, `N.C.`.
 */
export function normalizeChord(token: string): string | null {
  if (/^n\.?c\.?$/i.test(token)) return 'nc'
  let t = token
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[△Δ]/g, '^')
    .replace(/°/g, 'o')
    .replace(/^([a-g])/, (c) => c.toUpperCase())
  if (!/^[A-G]/.test(t)) return null
  t = t
    .replace(/m\((?:maj|M|Δ|\^)7\)/, 'mM7')
    .replace(/\((add\d+)\)/, '$1')
    .replace(/6\/9/, '69')
    .replace(/min(?=\d|$|\/|\(|[b#])/, 'm')
    .replace(/(\d)-(5|9|13)/g, '$1b$2')
    .replace(/(\d)\+(5|9|11)/g, '$1#$2')
  const spec = parseChordSpec(t)
  return spec.ok && spec.value.root.kind === 'note' ? t : null
}

/** True when a word looks like a chord (used to tell chord lines from lyrics). */
const isChord = (word: string): boolean => normalizeChord(word) !== null

/** Chord token for the output: normalized, or the original marked `?` for review. */
function chordOut(word: string): { text: string; uncertain: boolean } {
  const normalized = normalizeChord(word)
  return normalized ? { text: normalized, uncertain: false } : { text: `?${word}`, uncertain: true }
}

// --- line kinds -----------------------------------------------------------------------------

/** A whole line that is just a section name: `Chorus:`, `Verse 1`, `후렴`, `2절`, `Pre-Chorus 2`. */
const SECTION_HEADING =
  /^((?:intro|verse|pre-?chorus|chorus|bridge|interlude|solo|outro|coda|ending|refrain|hook|instrumental|전주|간주|후주|후렴|브릿지|브리지|인트로|아웃트로|코러스|벌스)(?:\s*\d+)?|\d+\s*절)\s*:?$/i

/** `[Chorus]`, `[A]`, `Chorus:`, `Verse 1`, `후렴`, `2절` → section name. */
function sectionName(line: string): string | null {
  const t = line.trim()
  // A line that is only `[…]` is a section label, even `[A]` (a lone ChordPro chord is rare).
  const bracketed = /^\[([^\]]{1,30})\]$/.exec(t)
  if (bracketed) return bracketed[1].trim()
  const m = SECTION_HEADING.exec(t)
  return m ? m[1].trim() : null
}

/** `Key: G`, `Key of Bb`, `키: F#m`, `조: G` → the key as written. */
function keyLine(line: string): string | null {
  const m =
    /^\s*(?:key|키|조)\s*(?:of|:|=)?\s*([A-Ga-g][#b♯♭]?\s*(?:m|min|minor|major|maj)?)\s*$/i.exec(
      line
    )
  return m && parseKey(m[1]) ? m[1].replace(/\s+/g, '') : null
}

/** Words of a line that are not bar or beat marks. */
const words = (line: string): string[] => line.split(/\s+/).filter((w) => w && !/^[|/%-]+$/.test(w))

/** Most words are chords: a chord line above lyrics. */
function isChordLine(line: string): boolean {
  const w = words(line)
  return w.length > 0 && w.filter(isChord).length / w.length >= 0.75
}

/** Has barlines and its cells are mostly chords. */
function isBarLine(line: string): boolean {
  if (!line.includes('|')) return false
  const w = words(line.replace(/[|:]/g, ' '))
  return w.length > 0 && w.filter(isChord).length / w.length >= 0.6
}

const INLINE_CHORD = /\[([^\]]+)\]/g
const isInlineChordLine = (line: string): boolean =>
  [...line.matchAll(INLINE_CHORD)].some((m) => isChord(m[1]))

/** The start of a lyric line, used as the lyric cue. */
function cueOf(lyric: string): string {
  const t = lyric.replace(/\s+/g, ' ').trim()
  if (t.length <= 16) return t
  const cut = t.slice(0, 16)
  const space = cut.lastIndexOf(' ')
  return (space > 6 ? cut.slice(0, space) : cut) + '…'
}

// --- conversion ---------------------------------------------------------------------------

/** `| C | Am :|` → `C, Am :.` (repeats become `.:` / `:.`, `%` an empty bar, beat slashes dropped). */
function convertBarLine(line: string): { text: string; uncertain: number } {
  let uncertain = 0
  // Alternating [bar, barline, bar, barline, …, bar].
  const pieces = line.split(/(\|\|:|\|:|:\|\||:\||\|\||\|)/)
  const out = pieces.map((piece, i) => {
    if (i % 2 === 1) {
      if (piece === '||:' || piece === '|:') return '.:'
      if (piece === ':||' || piece === ':|') return ':.'
      return ','
    }
    return words(piece)
      .map((w) => {
        const c = chordOut(w)
        if (c.uncertain) uncertain++
        return c.text
      })
      .join(' ')
  })
  // A plain barline at either end only frames the line: `| C | D |` → `C, D`.
  while (out.length >= 2 && out[0] === '' && out[1] === ',') out.splice(0, 2)
  if (out[0] === '') out.shift()
  while (out.length >= 2 && out[out.length - 1] === '' && out[out.length - 2] === ',') {
    out.splice(-2, 2)
  }
  if (out[out.length - 1] === '') out.pop()
  // Commas stick to the bar before them; repeat marks stand apart: `.: C, Am :.`
  let text = ''
  for (const piece of out) text += piece === ',' ? ',' : (text ? ' ' : '') + piece
  // An empty bar (`%`, `| |`) stays as the gap between barlines: `Gm6, :.` = Gm6 | (empty) :|
  return { text: text.replace(/ {2,}/g, ' '), uncertain }
}

/** Chords of a chord line, one bar each. */
function chordsToBars(chords: string[]): { text: string; uncertain: number } {
  let uncertain = 0
  const bars = chords.map((w) => {
    const c = chordOut(w)
    if (c.uncertain) uncertain++
    return c.text
  })
  return { text: bars.join(', '), uncertain }
}

const CHORDPRO_SECTIONS: Record<string, string> = {
  soc: 'Chorus',
  start_of_chorus: 'Chorus',
  sov: 'Verse',
  start_of_verse: 'Verse',
  sob: 'Bridge',
  start_of_bridge: 'Bridge',
  start_of_intro: 'Intro',
  start_of_outro: 'Outro'
}

export function importText(source: string, fileName = ''): ImportResult {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const header: string[] = []
  const body: string[] = []
  const counts: Record<ImportFormat, number> = {
    bars: 0,
    'chords-over-lyrics': 0,
    chordpro: /\.(cho|chopro|chordpro|crd|pro)$/i.test(fileName) ? 1 : 0,
    unknown: 0
  }
  let uncertain = 0
  let title: string | null = null
  let key: string | null = null
  const isLyric = (line: string | undefined): boolean =>
    line !== undefined &&
    line.trim() !== '' &&
    !isChordLine(line) &&
    !isBarLine(line) &&
    !sectionName(line) &&
    !/^\s*[{#]/.test(line)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (t === '') {
      if (body.length > 0 && body[body.length - 1] !== '') body.push('')
      continue
    }

    // ChordPro directives and comments.
    const directive = /^\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}$/.exec(t)
    if (directive) {
      counts.chordpro++
      const [, name, value = ''] = directive
      const n = name.toLowerCase()
      if (n === 'title' || n === 't') title ??= value
      else if (n === 'key' && parseKey(value)) key ??= value
      else if (n === 'comment' || n === 'c' || n === 'ci' || n === 'comment_italic') {
        body.push(`"${value.replace(/"/g, "'")}"`)
      } else if (CHORDPRO_SECTIONS[n]) body.push(`[${value || CHORDPRO_SECTIONS[n]}]`)
      else if (n === 'start_of_part' || n === 'sop') body.push(`[${value || 'Part'}]`)
      else if (!/^(end_of_|eo)/.test(n)) body.push(`// ${t}`)
      continue
    }
    if (/^#/.test(t)) {
      body.push(`// ${t.slice(1).trim()}`)
      continue
    }

    const k = keyLine(t)
    if (k) {
      key ??= k
      continue
    }
    const section = sectionName(t)
    if (section) {
      body.push(`[${section}]`)
      continue
    }

    // ChordPro lyrics with inline chords: one chord = one bar, the lyric is the cue.
    if (isInlineChordLine(t)) {
      counts.chordpro++
      const chords = [...t.matchAll(INLINE_CHORD)].map((m) => m[1].trim())
      const bars = chordsToBars(chords)
      uncertain += bars.uncertain + 1
      body.push(`${bars.text} ?`)
      const lyric = t.replace(INLINE_CHORD, '').trim()
      if (lyric) body.push(`l: ${cueOf(lyric)}`)
      continue
    }

    if (isBarLine(t)) {
      counts.bars++
      const bars = convertBarLine(t)
      uncertain += bars.uncertain
      body.push(bars.text)
      if (isLyric(lines[i + 1])) body.push(`l: ${cueOf(lines[++i])}`)
      continue
    }

    if (isChordLine(t)) {
      counts['chords-over-lyrics']++
      const bars = chordsToBars(words(t))
      uncertain += bars.uncertain + 1
      body.push(`${bars.text} ?`)
      if (isLyric(lines[i + 1])) body.push(`l: ${cueOf(lines[++i])}`)
      continue
    }

    // Before any music, the first plain line is taken as the title; other text is kept as a
    // comment so nothing is lost.
    if (title === null && body.every((b) => b === '' || b.startsWith('//'))) {
      title = t
      continue
    }
    counts.unknown++
    body.push(`// ${t}`)
  }

  const format = (['chordpro', 'bars', 'chords-over-lyrics'] as const).reduce<ImportFormat>(
    (best, f) => (counts[f] > (best === 'unknown' ? 0 : counts[best]) ? f : best),
    'unknown'
  )
  if (title !== null) header.push(`title: ${title}`)
  if (key !== null) header.push(`key: ${key}`)
  while (body[0] === '') body.shift()
  while (body[body.length - 1] === '') body.pop()
  const text = [...header, ...(header.length ? [''] : []), ...body].join('\n') + '\n'
  return { text, format, uncertain }
}
