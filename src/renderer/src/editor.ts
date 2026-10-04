// CodeMirror 6 editor: colouring, grey chord hints, error underlines — all driven by core parse().

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { linter, lintGutter, type Diagnostic as LintDiagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
  Compartment,
  EditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
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
import { chordHint, parse, type BarLine, type ParseResult, type TextChange } from '../../core'

const PLACEHOLDER = `title: 곡 제목
key: F

[Verse]
Bb^7, A-7, Bb^7, F B7*
> 가사 큐

[Chorus]
2-7, 5-7, 17, 4^7.`

/** Column positions from the parser → document offsets. */
const offset = (doc: Text, line: number, column: number): number =>
  Math.min(doc.line(line).from + column, doc.line(line).to)

/** Parse once per document version; colouring, hints and lint all share it. */
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

function hintDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { document: doc } = state.field(parsed)
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type !== 'bars') continue
      for (const chord of (item as BarLine).bars.flatMap((b) => b.chords)) {
        if (!chord.chord) continue
        const hint = chordHint(chord.source, chord.chord)
        if (!hint) continue
        const at = offset(state.doc, item.line, chord.to)
        builder.add(at, at, Decoration.widget({ widget: new HintWidget(hint), side: 1 }))
      }
    }
  }
  return builder.finish()
}

const hints = StateField.define<DecorationSet>({
  create: hintDecorations,
  update: (value, tr) => (tr.docChanged ? hintDecorations(tr.state) : value),
  provide: (f) => EditorView.decorations.from(f)
})

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

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px' },
  '.cm-scroller': {
    fontFamily: "'D2Coding', 'Consolas', 'Chordash Pretendard', 'Chordash Music', monospace"
  },
  '.cm-content': { padding: '8px 0' }
})

export interface ChordEditor {
  view: EditorView
  getText(): string
  /** Replaces the whole document and resets undo history. */
  setText(text: string): void
  /** Applies one edit as a normal, undoable change. */
  change(change: TextChange): void
  setHints(on: boolean): void
  parsed(): ParseResult
}

export function createEditor(parent: HTMLElement, onChange: () => void): ChordEditor {
  const hintSlot = new Compartment()
  let hintsOn = true
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
    hintSlot.of(hintsOn ? hints : []),
    chordLint,
    lintGutter(),
    theme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange()
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
      onChange()
    },
    change: (change) => view.dispatch({ changes: change }),
    setHints: (on) => {
      hintsOn = on
      view.dispatch({ effects: hintSlot.reconfigure(on ? hints : []) })
    },
    parsed: () => view.state.field(parsed)
  }
}
