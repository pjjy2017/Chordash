// Themes decide how chords are shown and how big things are on the page (SYNTAX 6, PRD 4).

/** Heights in millimetres. The preview CSS uses the same numbers, so layout() and the page agree. */
export interface LayoutMetrics {
  pageWidth: number
  pageHeight: number
  marginTop: number
  marginBottom: number
  marginX: number
  /** Song title block on page 1. */
  titleHeight: number
  /** "제목 N" heading on pages 2+. */
  headingHeight: number
  /** Space above a section label (not at the top of a page). */
  sectionGap: number
  sectionLabelHeight: number
  rowHeight: number
  /** Extra height for a lyric cue under a row. */
  cueHeight: number
  /** A row is at least this many bars wide; shorter rows leave the right side empty. */
  minBarsPerRow: number
}

export interface ChordStyle {
  /** Shown after the root for minor chords: `−` (C−7) or `m` (Cm7). */
  minorSymbol: string
  /** △ ø ° instead of maj, m7♭5, dim. */
  symbols: boolean
  extensionStyle: 'superscript' | 'inline'
}

export interface Theme {
  id: string
  name: string
  chord: ChordStyle
  metrics: LayoutMetrics
}

export const BOLD_GOTHIC: Theme = {
  id: 'bold-gothic',
  name: '굵은 고딕',
  chord: { minorSymbol: '−', symbols: true, extensionStyle: 'superscript' },
  metrics: {
    pageWidth: 210,
    pageHeight: 297,
    marginTop: 10,
    marginBottom: 10,
    marginX: 12,
    titleHeight: 15,
    headingHeight: 9,
    sectionGap: 3,
    sectionLabelHeight: 6.5,
    rowHeight: 12,
    cueHeight: 4,
    minBarsPerRow: 4
  }
}

export const DEFAULT_THEME = BOLD_GOTHIC
