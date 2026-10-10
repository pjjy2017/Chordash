// Document parser: .chord text → document model + diagnostics (SYNTAX 1–3).

import { parseChordSpec, resolveChord, type Chord, type ChordSpec } from './chord'
import { parseKey, type Key } from './key'

export interface Diagnostic {
  /** 1-based line number. */
  line: number
  /** 0-based column range within the line. */
  from: number
  to: number
  severity: 'error' | 'warning'
  message: string
}

export interface ChordItem {
  /** Token text without marks, e.g. `B7` for `'B7*`. */
  source: string
  from: number
  to: number
  /** `*` after the chord. */
  accent: boolean
  /** `'` before the chord (breath mark). */
  breath: boolean
  /** `?` before the chord (needs checking). */
  uncertain: boolean
  /** `nc`: no chord (N.C.) — the band rests. */
  noChord: boolean
  spec: ChordSpec | null
  chord: Chord | null
  error: string | null
}

export interface Bar {
  /** Empty means the previous chord continues (drawn blank). */
  chords: ChordItem[]
  repeatStart: boolean
  repeatEnd: boolean
  /** Final barline (`.`) after this bar. */
  final: boolean
  /** Texts shown above the bar: quoted in it (`"Break"`) or from a `^` line split into bars. */
  texts: string[]
  /** Lyric under this bar, from a `_` line split into bars (`_ 그대는, 어디에`). */
  lyric: string | null
  /** 0-based column range of the bar's content (between its barlines). */
  from: number
  to: number
}

export const MEMO_COLORS = ['teal', 'red', 'blue', 'green', 'orange', 'purple', 'gray'] as const
export type MemoColor = (typeof MEMO_COLORS)[number]

export interface ColorMemo {
  /** `ink`: plain text from a `^` line; the others from `{색: …}`. */
  color: MemoColor | 'ink'
  text: string
  line: number
}

export interface BarLine {
  type: 'bars'
  line: number
  /** `1.` / `2.` ending bracket over this line. */
  ending: number | null
  bars: Bar[]
  /** `?` after the last barline: the whole line needs checking. */
  uncertain: boolean
  /** Lyric under the whole line (`_ 가사`, `l: 가사`). Per-bar lyrics are in `Bar.lyric`. */
  cue: string | null
  /** Texts above the whole line: colour memos (`{teal: …}`) and `^ 글자` lines. */
  memos: ColorMemo[]
  /** Song-form part marker at the start of the line (`a) Bb^7, ...`), drawn boxed in the margin. */
  part: Part | null
  /** Set when print settings join two lines into one row (print.ts): each bar's own line. */
  barLines?: number[]
  /** This row already holds two typed lines. */
  joined?: boolean
}

/** A song-form part such as `a)`, `b2)`, `ㄱ4)`. */
export interface Part {
  /** Shown in the box: Latin letters uppercased (`a)` → `A`, `b2)` → `B2`). */
  label: string
  /** 0-based column range of the typed marker, `)` included. */
  from: number
  to: number
}

/** A line of part markers only (`a) a) b) a)`): the song form at a glance. */
export interface FormLine {
  type: 'form'
  line: number
  parts: Part[]
}

export interface Directive {
  type: 'directive'
  line: number
  text: string
}

export interface PageBreak {
  type: 'pageBreak'
  line: number
}

export type SectionItem = BarLine | FormLine | Directive | PageBreak

export interface Section {
  /** null for content before the first `[label]`. */
  name: string | null
  line: number | null
  /** Key in effect for this section. */
  key: Key | null
  /** `key:` written on this section's label. */
  keyChange: Key | null
  directive: string | null
  items: SectionItem[]
}

export interface ChordDocument {
  title: string | null
  key: Key | null
  sections: Section[]
}

export interface ParseResult {
  document: ChordDocument
  diagnostics: Diagnostic[]
  /** What each part of the text is, for syntax colouring in the editor. */
  spans: SyntaxSpan[]
}

export type SyntaxKind =
  | 'comment'
  | 'part'
  | 'meta'
  | 'section'
  | 'directive'
  | 'cue'
  | 'memo'
  | 'pageBreak'
  | 'ending'
  | 'barline'
  | 'chord'
  | 'mark'

export interface SyntaxSpan {
  /** 1-based line number. */
  line: number
  /** 0-based column range within the line. */
  from: number
  to: number
  kind: SyntaxKind
}

const SECTION = /^\[([^\]]*)\]/
/** Song-form part marker: one letter (or Hangul), optional digits, `)` — `a)`, `b2)`, `ㄱ4)`. */
const PART = /^([A-Za-z\u3131-\u314E\uAC00-\uD7A3])(\d*)\)$/
const HEADER = /^(title|key|theme)\s*:\s*(.*)$/
/** Lyric cue: `l: 첫 소절` or `lyric: 첫 소절` (same as `_ 첫 소절`). `>` is kept free. */
const LYRIC = /^(?:l|lyric)\s*:\s*(.*)$/

/** Text for under (`_`) or over (`^`) a bar line, from its own line or the end of the line. */
interface Annotation {
  place: 'below' | 'above'
  /** The text after the marker. */
  text: string
  /** Column of the text (after the marker). */
  at: number
  /** Column of the `_` or `^` itself. */
  marker: number
}

/**
 * `그대는 어디에` → the whole line; `그대는, 어디에` or `그대는 | 어디에` → one cell per bar
 * (empty cells leave a bar without text).
 */
export function annotationCells(text: string): { whole: string } | { cells: string[] } {
  return /[,|]/.test(text)
    ? { cells: text.split(/[,|]/).map((c) => c.trim()) }
    : { whole: text.trim() }
}
const MEMO = /^\{\s*([^:{}\s]*)\s*:\s*(.*?)\s*\}$/
/** `|` and `,` are plain barlines, `.` is a final barline. */
type Barline = 'plain' | 'repeatStart' | 'repeatEnd' | 'final'

// Ending at the start of a line, followed by more on the line: `1.`, `2.`, or the words `1end`,
// `end1` (any case). A lone `1.` is a bar of degree 1 with a final barline; `1.:` is degree 1
// then a repeat start, so a `.` followed by `.` or `:` is not an ending.
const ENDING = /^(?:(\d)\.(?![.:])|(?:(\d)end|end(\d))(?=[\s|,]))(?=\s*\S)\s*/i

class Parser {
  readonly doc: ChordDocument = { title: null, key: null, sections: [] }
  readonly diagnostics: Diagnostic[] = []
  readonly spans: SyntaxSpan[] = []
  private lineNo = 0
  private headerOpen = true
  private pendingMemos: ColorMemo[] = []
  /** A `^` line split into bars, waiting for the bar line below it. */
  private pendingAbove: { cells: string[]; line: number; at: number; end: number } | null = null

  report(severity: Diagnostic['severity'], from: number, to: number, message: string): void {
    this.diagnostics.push({ line: this.lineNo, from, to, severity, message })
  }

  private mark(kind: SyntaxKind, from: number, to: number): void {
    if (to > from) this.spans.push({ line: this.lineNo, from, to, kind })
  }

  private get section(): Section | undefined {
    return this.doc.sections[this.doc.sections.length - 1]
  }

  private currentSection(): Section {
    if (!this.section) {
      this.doc.sections.push({
        name: null,
        line: null,
        key: this.doc.key,
        keyChange: null,
        directive: null,
        items: []
      })
    }
    return this.section!
  }

  private get currentKey(): Key | null {
    return this.section ? this.section.key : this.doc.key
  }

  parse(text: string): void {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
    lines.forEach((raw, i) => {
      this.lineNo = i + 1
      this.parseLine(raw)
    })
    this.flushMemos()
  }

  private parseLine(raw: string): void {
    const trimmed = raw.trim()
    const start = raw.length - raw.trimStart().length
    const end = start + trimmed.length
    if (trimmed === '') return
    if (trimmed.startsWith('//')) return this.mark('comment', start, end)

    const header = HEADER.exec(trimmed)
    if (header) {
      this.mark('meta', start, end)
      return this.parseHeader(header[1], header[2], start, end)
    }
    this.headerOpen = false

    if (trimmed.startsWith('[')) return this.parseSection(raw, start)
    const lyric = LYRIC.exec(trimmed)
    if (lyric) {
      this.mark('cue', start, end)
      return this.parseCue(lyric[1], start, end)
    }
    if (trimmed.startsWith('_') || trimmed.startsWith('^')) {
      const place = trimmed[0] === '_' ? 'below' : 'above'
      this.mark(place === 'below' ? 'cue' : 'memo', start, end)
      const at = start + 1 + (trimmed.slice(1).length - trimmed.slice(1).trimStart().length)
      const note = { place, text: trimmed.slice(1), at, marker: start } as const
      if (place === 'below') return this.attachBelow(this.lastBarLine(), note, start, end)
      return this.holdAbove(note, start, end)
    }
    if (trimmed.startsWith('>')) {
      return this.report('error', start, end, '>는 아직 쓰지 않는 기호예요. 가사 큐는 l: 로 쓰세요')
    }
    if (trimmed.startsWith('{')) {
      this.mark('memo', start, end)
      return this.parseMemo(trimmed, start, end)
    }
    if (trimmed === '---') {
      this.mark('pageBreak', start, end)
      this.currentSection().items.push({ type: 'pageBreak', line: this.lineNo })
      return
    }
    if (/^"[^"]*"$/.test(trimmed)) {
      this.mark('directive', start, end)
      this.currentSection().items.push({
        type: 'directive',
        line: this.lineNo,
        text: trimmed.slice(1, -1)
      })
      return
    }
    // A line of part markers only: `a) a) b) a)`.
    const tokens = [...raw.matchAll(/\S+/g)]
    if (tokens.every((t) => PART.test(t[0]))) {
      const parts = tokens.map((t) => this.parsePart(t[0], t.index!))
      this.currentSection().items.push({ type: 'form', line: this.lineNo, parts })
      return
    }
    // Anything else is a bar line: `| C | D |` or `C, D, E.`
    this.parseBarLine(raw, start, end)
  }

  private parsePart(text: string, at: number): Part {
    const m = PART.exec(text)!
    this.mark('part', at, at + text.length)
    return { label: m[1].toUpperCase() + m[2], from: at, to: at + text.length }
  }

  private parseHeader(name: string, value: string, start: number, end: number): void {
    if (!this.headerOpen) {
      const hint = name === 'key' ? ' (키 변경은 섹션 라벨 뒤에: [이름] key: G)' : ''
      return this.report('error', start, end, `${name}: 는 파일 맨 위에만 쓸 수 있음${hint}`)
    }
    if (name === 'title') {
      if (this.doc.title !== null) this.report('warning', start, end, 'title: 이 두 번 있음')
      this.doc.title = value.trim()
      return
    }
    if (name === 'theme') {
      // Older files may still have it; there is only one theme now.
      return this.report('warning', start, end, 'theme: 줄은 이제 쓰지 않아요 (테마는 플레인 하나)')
    }
    const key = parseKey(value)
    if (!key) return this.report('error', start, end, `알 수 없는 키: ${value.trim()}`)
    this.doc.key = key
  }

  private parseSection(raw: string, start: number): void {
    const m = SECTION.exec(raw.slice(start))
    if (!m)
      return this.report('error', start, raw.trimEnd().length, '섹션 라벨의 닫는 괄호(])가 없음')
    this.flushMemos()

    const section: Section = {
      name: m[1].trim(),
      line: this.lineNo,
      key: this.currentKey,
      keyChange: null,
      directive: null,
      items: []
    }
    let pos = start + m[0].length
    this.mark('section', start, pos)
    for (;;) {
      while (pos < raw.length && /\s/.test(raw[pos])) pos++
      if (pos >= raw.length) break
      const rest = raw.slice(pos)
      const keyMatch = /^key\s*:\s*(\S*)/.exec(rest)
      if (keyMatch) {
        this.mark('meta', pos, pos + keyMatch[0].length)
        const key = parseKey(keyMatch[1])
        if (key) section.key = section.keyChange = key
        else
          this.report(
            'error',
            pos,
            pos + keyMatch[0].length,
            `알 수 없는 키: ${keyMatch[1] || '(비어 있음)'}`
          )
        pos += keyMatch[0].length
        continue
      }
      if (rest.startsWith('"')) {
        const close = raw.indexOf('"', pos + 1)
        if (close < 0) {
          this.report('error', pos, raw.length, '지시문의 닫는 따옴표(")가 없음')
          break
        }
        section.directive = raw.slice(pos + 1, close)
        this.mark('directive', pos, close + 1)
        pos = close + 1
        continue
      }
      this.report(
        'error',
        pos,
        raw.trimEnd().length,
        '섹션 라벨 뒤에는 key: 또는 "지시문"만 쓸 수 있음'
      )
      break
    }
    this.doc.sections.push(section)
  }

  private parseBarLine(raw: string, start: number, lineEnd: number): void {
    let end = lineEnd
    const line: BarLine = {
      type: 'bars',
      line: this.lineNo,
      ending: null,
      bars: [],
      uncertain: false,
      cue: null,
      memos: this.pendingMemos,
      part: null
    }
    this.pendingMemos = []
    const pendingAbove = this.pendingAbove
    this.pendingAbove = null

    // `_ 가사` and ` ^ 글자` at the end of the line belong to this line, not to its bars.
    const notes = this.inlineAnnotations(raw, start, end)
    if (notes.length) end = raw.slice(0, notes[0].marker).trimEnd().length

    let pos = start
    const first = /^\S+/.exec(raw.slice(start))
    if (first && PART.test(first[0])) {
      line.part = this.parsePart(first[0], start)
      pos += first[0].length
      while (pos < end && /\s/.test(raw[pos])) pos++
    }
    const ending = ENDING.exec(raw.slice(pos))
    if (ending) {
      line.ending = Number(ending[1] ?? ending[2] ?? ending[3])
      this.mark('ending', pos, pos + ending[0].trimEnd().length)
      pos += ending[0].length
    }

    // A `?` after the last barline (or after a space) flags the whole line.
    let stop = end
    if (/(?:[|,.:]|\s)\?$/.test(raw.slice(pos, end))) {
      line.uncertain = true
      stop = end - 1
      this.mark('mark', stop, end)
    }

    // Split into barlines and the content between them. Commas inside `( )` belong to the chord.
    let left: Barline | null = null
    let contentStart = pos
    let depth = 0
    const closeBar = (right: Barline | null, contentEnd: number): void => {
      // The leading barline is optional: `C, D` = `| C | D`.
      if (left === null && !raw.slice(contentStart, contentEnd).trim()) return
      line.bars.push(this.parseBar(raw, contentStart, contentEnd, left, right))
    }
    for (let i = pos; i < stop;) {
      let barline: Barline | null = null
      let width = 1
      const c = raw[i]
      if (c === '"') {
        // Quoted text inside a bar (`"Drum fill, 2박"`): commas and dots in it are not barlines.
        const close = raw.indexOf('"', i + 1)
        if (close < 0 || close >= stop) {
          this.report('error', i, stop, '닫는 따옴표(")가 없음')
          i = stop
        } else i = close + 1
        continue
      } else if (c === '(') depth++
      else if (c === ')') depth = Math.max(0, depth - 1)
      else if (depth > 0) {
        // inside an alteration list such as (b9,#11)
      } else if (raw.startsWith(':||', i)) [barline, width] = ['repeatEnd', 3]
      else if (raw.startsWith('||:', i)) [barline, width] = ['repeatStart', 3]
      // `.` is the final barline, so `.:` (bar then dots) starts a repeat and `:.` ends one.
      else if (raw.startsWith(':.', i)) [barline, width] = ['repeatEnd', 2]
      else if (raw.startsWith('.:', i)) [barline, width] = ['repeatStart', 2]
      else if (raw.startsWith('||', i)) {
        this.report('error', i, i + 2, '알 수 없는 마디선 || (반복은 ||: 와 :||)')
        ;[barline, width] = ['plain', 2]
      } else if (c === '|' || c === ',') barline = 'plain'
      else if (c === '.') barline = 'final'

      if (barline !== null) {
        this.mark('barline', i, i + width)
        closeBar(barline, i)
        left = barline
        contentStart = i + width
      }
      i += width
    }
    // Content after the last barline (no closing `|` or `,`) still forms a bar.
    if (raw.slice(contentStart, stop).trim()) closeBar(null, stop)

    if (pendingAbove) this.attachAbove(line, pendingAbove.cells, pendingAbove.line)
    for (const note of notes) {
      const noteEnd = note.at + note.text.length
      if (note.place === 'below') this.attachBelow(line, note, note.marker, noteEnd)
      else {
        // `F ^7`: a space before the 7 makes it a text, which is almost always a typo.
        if (/^\d/.test(note.text.trim()))
          this.report(
            'warning',
            note.marker,
            noteEnd,
            '메이저7이라면 F^7처럼 띄우지 말고 붙여 쓰세요'
          )
        const parts = annotationCells(note.text)
        if ('whole' in parts)
          line.memos.push({ color: 'ink', text: parts.whole, line: this.lineNo })
        else this.attachAbove(line, parts.cells, this.lineNo)
      }
    }
    this.currentSection().items.push(line)
  }

  /**
   * Where `_` (anywhere) or `^` (after a space) starts text at the end of a bar line, outside
   * quotes and `( )`. A `^` stuck to a chord is its major 7th (`F^7`).
   */
  private inlineAnnotations(raw: string, start: number, end: number): Annotation[] {
    const found: { place: Annotation['place']; marker: number }[] = []
    let depth = 0
    for (let i = start; i < end; i++) {
      const c = raw[i]
      if (c === '"') {
        const close = raw.indexOf('"', i + 1)
        if (close < 0) break
        i = close
      } else if (c === '(') depth++
      else if (c === ')') depth = Math.max(0, depth - 1)
      else if (depth === 0 && c === '_') found.push({ place: 'below', marker: i })
      else if (depth === 0 && c === '^' && i > start && /\s/.test(raw[i - 1]))
        found.push({ place: 'above', marker: i })
    }
    // Only the first marker of each kind starts a text; later ones are part of the text.
    const first = (place: Annotation['place']): number | undefined =>
      found.find((f) => f.place === place)?.marker
    const marks = [first('below'), first('above')].filter((m): m is number => m !== undefined)
    marks.sort((a, b) => a - b)
    return marks.map((marker, i) => {
      const textEnd = i + 1 < marks.length ? marks[i + 1] : end
      const body = raw.slice(marker + 1, textEnd)
      const lead = body.length - body.trimStart().length
      this.mark(raw[marker] === '_' ? 'cue' : 'memo', marker, textEnd)
      return {
        place: raw[marker] === '_' ? 'below' : 'above',
        text: body.trimEnd().trimStart(),
        at: marker + 1 + lead,
        marker
      }
    })
  }

  /** The bar line a `_` or `l:` line belongs to: the one right above it. */
  private lastBarLine(): BarLine | null {
    const last = this.section?.items[this.section.items.length - 1]
    return last && last.type === 'bars' ? last : null
  }

  /** Lyrics under a bar line: under the whole line, or one per bar. */
  private attachBelow(line: BarLine | null, note: Annotation, from: number, to: number): void {
    if (!line) return this.report('warning', from, to, '가사(_) 바로 위에 마디 줄이 없음')
    if (line.cue !== null || line.bars.some((b) => b.lyric !== null))
      return this.report('warning', from, to, '이 마디 줄에는 이미 가사가 있음')
    const parts = annotationCells(note.text)
    if ('whole' in parts) {
      line.cue = parts.whole
      return
    }
    if (parts.cells.length > line.bars.length)
      this.report(
        'warning',
        from,
        to,
        `가사 칸(${parts.cells.length})이 마디(${line.bars.length})보다 많음`
      )
    parts.cells.forEach((cell, i) => {
      if (i < line.bars.length && cell) line.bars[i].lyric = cell
    })
  }

  /** A `^` line: over the whole next bar line (like a memo), or split over its bars. */
  private holdAbove(note: Annotation, start: number, end: number): void {
    const parts = annotationCells(note.text)
    if ('whole' in parts) {
      this.pendingMemos.push({ color: 'ink', text: parts.whole, line: this.lineNo })
      return
    }
    if (this.pendingAbove) this.report('warning', start, end, '마디마다 나눈 ^ 줄이 두 번 있음')
    this.pendingAbove = { cells: parts.cells, line: this.lineNo, at: start, end }
  }

  private attachAbove(line: BarLine, cells: string[], from: number): void {
    if (cells.length > line.bars.length)
      this.diagnostics.push({
        line: from,
        from: 0,
        to: 0,
        severity: 'warning',
        message: `위쪽 글자 칸(${cells.length})이 마디(${line.bars.length})보다 많음`
      })
    cells.forEach((cell, i) => {
      if (i < line.bars.length && cell) line.bars[i].texts.unshift(cell)
    })
  }

  private parseBar(
    raw: string,
    from: number,
    to: number,
    left: Barline | null,
    right: Barline | null
  ): Bar {
    const chords: ChordItem[] = []
    const texts: string[] = []
    const token = /"[^"]*"?|\S+/g
    const content = raw.slice(from, to)
    for (let m = token.exec(content); m; m = token.exec(content)) {
      if (m[0].startsWith('"')) {
        // An unclosed quote was already reported while splitting the bars.
        if (m[0].length > 1 && m[0].endsWith('"')) {
          this.mark('directive', from + m.index, from + m.index + m[0].length)
          texts.push(m[0].slice(1, -1).trim())
        }
        continue
      }
      chords.push(this.parseChordToken(m[0], from + m.index))
    }
    return {
      chords,
      texts,
      lyric: null,
      repeatStart: left === 'repeatStart',
      repeatEnd: right === 'repeatEnd',
      final: right === 'final',
      from,
      to
    }
  }

  private parseChordToken(text: string, at: number): ChordItem {
    if (PART.test(text)) {
      const error = '파트 표시는 줄 맨 앞에만 쓸 수 있어요'
      this.report('error', at, at + text.length, error)
      return {
        source: text,
        from: at,
        to: at + text.length,
        accent: false,
        breath: false,
        uncertain: false,
        noChord: false,
        spec: null,
        chord: null,
        error
      }
    }
    let breath = false
    let uncertain = false
    let s = 0
    let e = text.length
    for (;;) {
      if (text[s] === "'" && !breath) breath = true
      else if (text[s] === '?' && !uncertain) uncertain = true
      else break
      s++
    }
    const accent = text[e - 1] === '*'
    if (accent) e--

    const source = text.slice(s, e)
    this.mark('mark', at, at + s)
    this.mark('chord', at + s, at + e)
    this.mark('mark', at + e, at + text.length)
    const item: ChordItem = {
      source,
      from: at + s,
      to: at + e,
      accent,
      breath,
      uncertain,
      noChord: /^nc$/i.test(source),
      spec: null,
      chord: null,
      error: null
    }
    if (item.noChord) return item
    const spec = parseChordSpec(source)
    const resolved = spec.ok ? resolveChord(spec.value, this.currentKey) : spec
    if (spec.ok) item.spec = spec.value
    if (resolved.ok) item.chord = resolved.value
    else {
      item.error = resolved.error.message
      this.report('error', item.from, Math.max(item.to, item.from + 1), resolved.error.message)
    }
    return item
  }

  /** `l: 가사` works like `_ 가사`. */
  private parseCue(text: string, start: number, end: number): void {
    this.attachBelow(
      this.lastBarLine(),
      { place: 'below', text, at: start, marker: start },
      start,
      end
    )
  }

  private parseMemo(trimmed: string, start: number, end: number): void {
    const m = MEMO.exec(trimmed)
    if (!m) return this.report('error', start, end, '색 메모 형식: {색: 내용}')
    if (!(MEMO_COLORS as readonly string[]).includes(m[1])) {
      return this.report('error', start, end, `알 수 없는 색: ${m[1]} (${MEMO_COLORS.join(', ')})`)
    }
    this.pendingMemos.push({ color: m[1] as MemoColor, text: m[2], line: this.lineNo })
  }

  /** Memos and `^` lines must be followed by a bar line in the same section. */
  private flushMemos(): void {
    const lost = [
      ...this.pendingMemos.map((m) => ({ line: m.line, ink: m.color === 'ink' })),
      ...(this.pendingAbove ? [{ line: this.pendingAbove.line, ink: true }] : [])
    ]
    for (const { line, ink } of lost) {
      this.diagnostics.push({
        line,
        from: 0,
        to: 0,
        severity: 'warning',
        message: ink ? '위쪽 글자(^) 아래에 마디 줄이 없음' : '색 메모 아래에 마디 줄이 없음'
      })
    }
    this.pendingMemos = []
    this.pendingAbove = null
  }
}

/** Parses a .chord document. Never throws; problems are returned as diagnostics. */
export function parse(text: string): ParseResult {
  const parser = new Parser()
  parser.parse(text)
  const spans = parser.spans.sort((a, b) => a.line - b.line || a.from - b.from)
  return { document: parser.doc, diagnostics: parser.diagnostics, spans }
}

/** Chords and lines marked `?` (needs checking); the PDF export warns about these. */
export function countUncertain(doc: ChordDocument): number {
  let count = 0
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type !== 'bars') continue
      if (item.uncertain) count++
      for (const bar of item.bars) count += bar.chords.filter((c) => c.uncertain).length
    }
  }
  return count
}
