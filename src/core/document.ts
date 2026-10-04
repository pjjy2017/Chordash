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
  /** 0-based column range of the bar's content (between its barlines). */
  from: number
  to: number
}

export const MEMO_COLORS = ['teal', 'red', 'blue', 'green', 'orange', 'purple', 'gray'] as const
export type MemoColor = (typeof MEMO_COLORS)[number]

export interface ColorMemo {
  color: MemoColor
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
  /** Lyric cue (`l:` / `lyric:`) shown under this line. */
  cue: string | null
  /** Colour memos shown above this line. */
  memos: ColorMemo[]
  /** Song-form part marker at the start of the line (`a) Bb^7, ...`), drawn boxed in the margin. */
  part: Part | null
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
/** Lyric cue: `l: 첫 소절` or `lyric: 첫 소절`. (`>` is kept free for a later feature.) */
const LYRIC = /^(?:l|lyric)\s*:\s*(.*)$/
const MEMO = /^\{\s*([^:{}\s]*)\s*:\s*(.*?)\s*\}$/
/** `|` and `,` are plain barlines, `.` is a final barline. */
type Barline = 'plain' | 'repeatStart' | 'repeatEnd' | 'final'

// `1.` / `2.` followed by more on the line. A lone `1.` is a bar of degree 1 with a final barline.
const ENDING = /^(\d)\.(?=\s*\S)\s*/

class Parser {
  readonly doc: ChordDocument = { title: null, key: null, sections: [] }
  readonly diagnostics: Diagnostic[] = []
  readonly spans: SyntaxSpan[] = []
  private lineNo = 0
  private headerOpen = true
  private pendingMemos: ColorMemo[] = []

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
    if (trimmed.startsWith('"')) {
      this.mark('directive', start, end)
      if (trimmed.length < 2 || !trimmed.endsWith('"')) {
        return this.report('error', start, end, '지시문의 닫는 따옴표(")가 없음')
      }
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

  private parseBarLine(raw: string, start: number, end: number): void {
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

    let pos = start
    const first = /^\S+/.exec(raw.slice(start))
    if (first && PART.test(first[0])) {
      line.part = this.parsePart(first[0], start)
      pos += first[0].length
      while (pos < end && /\s/.test(raw[pos])) pos++
    }
    const ending = ENDING.exec(raw.slice(pos))
    if (ending) {
      line.ending = Number(ending[1])
      this.mark('ending', pos, pos + 2)
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
      if (c === '(') depth++
      else if (c === ')') depth = Math.max(0, depth - 1)
      else if (depth > 0) {
        // inside an alteration list such as (b9,#11)
      } else if (raw.startsWith(':||', i)) [barline, width] = ['repeatEnd', 3]
      else if (raw.startsWith('||:', i)) [barline, width] = ['repeatStart', 3]
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

    this.currentSection().items.push(line)
  }

  private parseBar(
    raw: string,
    from: number,
    to: number,
    left: Barline | null,
    right: Barline | null
  ): Bar {
    const chords: ChordItem[] = []
    const token = /\S+/g
    const content = raw.slice(from, to)
    for (let m = token.exec(content); m; m = token.exec(content)) {
      chords.push(this.parseChordToken(m[0], from + m.index))
    }
    return {
      chords,
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
      spec: null,
      chord: null,
      error: null
    }
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

  private parseCue(text: string, start: number, end: number): void {
    const last = this.section?.items[this.section.items.length - 1]
    if (!last || last.type !== 'bars')
      return this.report('warning', start, end, '가사 큐(>) 바로 위에 마디 줄이 없음')
    if (last.cue !== null)
      return this.report('warning', start, end, '이 마디 줄에는 이미 가사 큐가 있음')
    last.cue = text
  }

  private parseMemo(trimmed: string, start: number, end: number): void {
    const m = MEMO.exec(trimmed)
    if (!m) return this.report('error', start, end, '색 메모 형식: {색: 내용}')
    if (!(MEMO_COLORS as readonly string[]).includes(m[1])) {
      return this.report('error', start, end, `알 수 없는 색: ${m[1]} (${MEMO_COLORS.join(', ')})`)
    }
    this.pendingMemos.push({ color: m[1] as MemoColor, text: m[2], line: this.lineNo })
  }

  /** Memos must be followed by a bar line in the same section. */
  private flushMemos(): void {
    for (const memo of this.pendingMemos) {
      this.diagnostics.push({
        line: memo.line,
        from: 0,
        to: 0,
        severity: 'warning',
        message: '색 메모 아래에 마디 줄이 없음'
      })
    }
    this.pendingMemos = []
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
