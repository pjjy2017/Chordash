// CodeMirror 6 editor — the single editing view (ROADMAP 4.5).
// Everything is driven by core: parse() for colours, errors and live chords; completionsAt() for
// autocomplete. The file keeps exactly what was typed; chords are only *shown* as sheet music.

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { linter, lintGutter, type Diagnostic as LintDiagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type ChangeSet,
  type Extension,
  type Range,
  type Text
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet
} from '@codemirror/view'
import {
  chordHint,
  completionsAt,
  headerEndLine,
  parse,
  DEFAULT_THEME,
  type ParseResult,
  type Part,
  type TextChange
} from '../../core'
import { chordInnerHtml } from './preview'

const PLACEHOLDER = `title: 곡 제목
key: F

[Verse]
Bb^7, A-7, Bb^7, F B7*
_ 가사, 마디마다

[Chorus]
2-7, 5-7, 17, 4^7.`

/** Column positions from the parser → document offsets. */
const offset = (doc: Text, line: number, column: number): number =>
  Math.min(doc.line(line).from + column, doc.line(line).to)

/** Parse once per document version; colouring, live chords and lint all share it. */
const parsed = StateField.define<ParseResult>({
  create: (state) => parse(state.doc.toString()),
  update: (value, tr) => (tr.docChanged ? parse(tr.state.doc.toString()) : value)
})

const syntaxColours = EditorView.decorations.compute([parsed], (state) => {
  const builder = new RangeSetBuilder<Decoration>()
  for (const span of state.field(parsed).spans) {
    builder.add(
      offset(state.doc, span.line, span.from),
      offset(state.doc, span.line, span.to),
      Decoration.mark({ class: `cd-${span.kind}` })
    )
  }
  return builder.finish()
})

// --- live chords: finished tokens are shown as sheet music ---------------------------

class ChordWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly themeId: string
  ) {
    super()
  }
  eq(other: ChordWidget): boolean {
    return other.html === this.html && other.themeId === this.themeId
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = `cd-live-chord theme-${this.themeId}`
    el.innerHTML = this.html
    return el
  }
  // Let clicks through so the cursor lands on the chord and it opens for editing.
  ignoreEvent(): boolean {
    return false
  }
}

/** Typed barline → symbol shown in the editor. */
const BARLINE_SYMBOLS: Record<string, string> = {
  ',': '|',
  '.': '‖',
  '.:': '‖:',
  '||:': '‖:',
  ':.': ':‖',
  ':||': ':‖'
}

class BarlineWidget extends WidgetType {
  constructor(readonly symbol: string) {
    super()
  }
  eq(other: BarlineWidget): boolean {
    return other.symbol === this.symbol
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = this.symbol === '|' ? 'cd-live-bar' : 'cd-live-bar strong'
    el.textContent = this.symbol
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

class PartWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }
  eq(other: PartWidget): boolean {
    return other.label === this.label
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cd-live-part'
    el.textContent = this.label
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

class HintWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(other: HintWidget): boolean {
    return other.text === this.text
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cd-hint'
    el.textContent = this.text
    return el
  }
}

export const setHintsEnabled = StateEffect.define<boolean>()

const hintsEnabled = StateField.define<boolean>({
  create: () => true,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setHintsEnabled) ? e.value : v), value)
})

/**
 * A bar (cell) is "being typed" while a cursor is in it or at its edges; its chords stay as typed,
 * with grey hints. Typing the comma that closes it — or moving to another cell or line — finishes
 * it, and its chords are shown as sheet music. Barlines are always shown as symbols (| ‖ ‖: :‖).
 * (1.1 tried whole lines instead; finding a chord to fix got hard, so 1.2 went back — DECISIONS.)
 */
function liveDecorations(state: EditorState): DecorationSet {
  const { document: doc, spans } = state.field(parsed)
  const theme = DEFAULT_THEME
  const touching = (from: number, to: number): boolean =>
    state.selection.ranges.some((r) => r.to >= from && r.from <= to)
  const decorations: Range<Decoration>[] = []

  /** A part marker (`a)`) is boxed once the cursor has left it. */
  const addPart = (lineNo: number, part: Part): void => {
    const from = offset(state.doc, lineNo, part.from)
    const to = offset(state.doc, lineNo, part.to)
    if (touching(from, to)) return
    decorations.push(Decoration.replace({ widget: new PartWidget(part.label) }).range(from, to))
  }

  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type === 'form') item.parts.forEach((part) => addPart(item.line, part))
      if (item.type !== 'bars') continue
      if (item.part) addPart(item.line, item.part)
      const line = state.doc.line(item.line)
      for (const bar of item.bars) {
        // A bar with no barline after it is still open up to the end of the line, trailing
        // spaces included — so a space alone never closes it; only `,` / `|` / `.` does.
        // Text after it (`_ 가사`, ` ^ 글자`) closes it too, so typing lyrics leaves it alone.
        const closed =
          /[,|.:]/.test(line.text.charAt(bar.to)) || /^\s*[_^]/.test(line.text.slice(bar.to))
        const editing = touching(
          offset(state.doc, item.line, bar.from),
          closed ? offset(state.doc, item.line, bar.to) : line.to
        )
        for (const chord of bar.chords) {
          if (chord.noChord && !editing) {
            const from = offset(state.doc, item.line, chord.from)
            const to = offset(state.doc, item.line, chord.to)
            decorations.push(
              Decoration.replace({ widget: new ChordWidget('N.C.', theme.id) }).range(from, to)
            )
            continue
          }
          if (!chord.chord) continue // errors stay as typed, with a red underline
          const from = offset(state.doc, item.line, chord.from)
          const to = offset(state.doc, item.line, chord.to)
          if (editing) {
            const hint = state.field(hintsEnabled) ? chordHint(chord.source, chord.chord) : null
            if (hint) {
              decorations.push(
                Decoration.widget({ widget: new HintWidget(hint), side: 1 }).range(to)
              )
            }
            continue
          }
          const html = chordInnerHtml(chord.chord, theme)
          decorations.push(
            Decoration.replace({ widget: new ChordWidget(html, theme.id) }).range(from, to)
          )
        }
      }
    }
  }

  for (const span of spans) {
    if (span.kind !== 'barline') continue
    const from = offset(state.doc, span.line, span.from)
    const to = offset(state.doc, span.line, span.to)
    const text = state.doc.sliceString(from, to)
    const symbol = BARLINE_SYMBOLS[text]
    if (!symbol) continue
    decorations.push(Decoration.replace({ widget: new BarlineWidget(symbol) }).range(from, to))
  }
  return Decoration.set(decorations, true)
}

const liveChords = StateField.define<DecorationSet>({
  create: liveDecorations,
  update: (value, tr) =>
    tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setHintsEnabled))
      ? liveDecorations(tr.state)
      : value,
  provide: (f) => EditorView.decorations.from(f)
})

// --- autocomplete ----------------------------------------------------------------------

function chordashCompletions(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const before = state.doc.sliceString(0, line.from)
  const result = completionsAt(line.text, pos - line.from, {
    inHeader: headerEndLine(before) >= line.number - 1,
    sectionNames: state.field(parsed).document.sections.flatMap((s) => (s.name ? [s.name] : []))
  })
  if (!result) return null
  return {
    from: line.from + result.from,
    filter: false,
    options: result.options.map((o) => ({ label: o.label, detail: o.detail, apply: o.insert }))
  }
}

// --- errors ----------------------------------------------------------------------------

const chordLint = linter(
  (view) => {
    const { doc } = view.state
    return view.state.field(parsed).diagnostics.map((d): LintDiagnostic => {
      const line = doc.line(d.line)
      // Diagnostics without a column range cover the whole line.
      const whole = d.to <= d.from
      return {
        from: whole ? line.from : offset(doc, d.line, d.from),
        to: whole ? line.to : offset(doc, d.line, d.to),
        severity: d.severity,
        message: d.message
      }
    })
  },
  { delay: 200 }
)

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '16px' },
  '.cm-scroller': {
    fontFamily: "'D2Coding', 'Consolas', 'Chordash Pretendard', 'Chordash Music', monospace",
    lineHeight: '1.75'
  },
  '.cm-content': { padding: '8px 0' }
})

export interface ChordEditor {
  view: EditorView
  getText(): string
  /** Replaces the whole document and resets undo history. */
  setText(text: string): void
  /** Applies one edit as a normal, undoable change. */
  change(change: TextChange | TextChange[]): void
  /** The current selection as document offsets (empty when nothing is selected). */
  selection(): { from: number; to: number }
  setHints(on: boolean): void
  parsed(): ParseResult
  /**
   * `none` keeps the phone's own keyboard down (the app shows its chord keyboard instead);
   * `text` brings it back.
   */
  setInputMode(mode: 'none' | 'text'): void
  /** Called after any change: text, cursor or focus. */
  onUpdate(listener: () => void): void
}

/** Called after every text change; `changes` maps old offsets to new ones (null on a full reset). */
export type ChangeListener = (changes: ChangeSet | null) => void

export function createEditor(parent: HTMLElement, onChange: ChangeListener): ChordEditor {
  let hintsOn = true
  let inputMode: 'none' | 'text' = 'text'
  const inputModeSlot = new Compartment()
  const inputModeAttr = (): Extension => EditorView.contentAttributes.of({ inputmode: inputMode })
  const updateListeners: (() => void)[] = []
  const extensions = (): Extension[] => [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    placeholder(PLACEHOLDER),
    EditorView.lineWrapping,
    parsed,
    syntaxColours,
    hintsEnabled.init(() => hintsOn),
    liveChords,
    autocompletion({ override: [chordashCompletions], icons: false }),
    chordLint,
    lintGutter(),
    editorTheme,
    inputModeSlot.of(inputModeAttr()),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.changes)
      if (u.docChanged || u.selectionSet || u.focusChanged) updateListeners.forEach((l) => l())
    })
  ]

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: '', extensions: extensions() })
  })
  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => {
      view.setState(EditorState.create({ doc: text, extensions: extensions() }))
      onChange(null)
    },
    change: (change) => view.dispatch({ changes: change }),
    selection: () => {
      const { from, to } = view.state.selection.main
      return { from, to }
    },
    setHints: (on) => {
      hintsOn = on
      view.dispatch({ effects: setHintsEnabled.of(on) })
    },
    parsed: () => view.state.field(parsed),
    setInputMode: (mode) => {
      if (mode === inputMode) return
      inputMode = mode
      view.dispatch({ effects: inputModeSlot.reconfigure(inputModeAttr()) })
    },
    onUpdate: (listener) => {
      updateListeners.push(listener)
    }
  }
}
