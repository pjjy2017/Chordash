// Themes decide how chords are shown and how big things are on the page (SYNTAX 6, PRD 4).
// Fonts and colours live in the preview CSS under `.theme-<id>`.

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
  /** A line of song-form part boxes (`a) a) b) a)`). */
  formHeight: number
  /** Each colour memo line above a row. */
  memoHeight: number
  /** Band above a row for an ending bracket and texts over bars (`"Break"`). */
  aboveHeight: number
  /** A standalone directive line (`"드럼 4마디"`). */
  directiveHeight: number
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

/**
 * The look of the sheet. There is one theme, "플레인" (user decision 2026-10-05); the structure stays
 * so chord notation and sizes live in one place.
 */
export interface Theme {
  id: string
  name: string
  chord: ChordStyle
  metrics: LayoutMetrics
}

const A4_METRICS: LayoutMetrics = {
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
  formHeight: 9,
  memoHeight: 4.5,
  aboveHeight: 5,
  directiveHeight: 6,
  minBarsPerRow: 4
}

/** Regular weight, everything on one line: C−7, Cmaj7, C−7♭5, Cdim7. */
export const PLAIN_THEME: Theme = {
  id: 'plain',
  name: '플레인',
  chord: { minorSymbol: '−', symbols: false, extensionStyle: 'inline' },
  metrics: A4_METRICS
}

export const DEFAULT_THEME = PLAIN_THEME
