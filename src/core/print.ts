// Print settings (1.6): text size, row spacing, 8-bar rows, fitting a song on one page, and the
// booklet (two pages side by side on landscape A4).
//
// Size works by laying the page out bigger or smaller and zooming the drawn page back to A4:
// at 80 % the page is laid out 210/0.8 mm wide, so every font, line and gap shrinks together.

import type { BarLine, ChordDocument, Section } from './document'
import { layout, type PageModel } from './layout'
import type { LayoutMetrics } from './theme'

export interface PrintOptions {
  /** Text and everything with it, 1 = as designed. */
  scale: number
  /** Height of bar rows and gaps between sections, 1 = as designed. */
  spacing: number
  /** Two lines in a row when they fit in 8 bars. */
  joinRows: boolean
  /** Shrinks a longer song until it fits on one page (never below MIN_SCALE). */
  fitOnePage: boolean
  /** Two pages side by side on landscape A4, like an open book. */
  booklet: boolean
}

export const DEFAULT_PRINT: PrintOptions = {
  scale: 1,
  spacing: 1,
  joinRows: false,
  fitOnePage: false,
  booklet: false
}

/** Width a part box needs in the left margin, in layout millimetres (preview.css `.part`). */
export const PART_ROOM = 9.5

export const MIN_SCALE = 0.45
export const MAX_SCALE = 1.5
/** Bars in a joined row. */
export const JOINED_BARS = 8

/** Metrics for laying out at `scale` (the drawn page is zoomed by `scale` back to A4). */
export function scaledMetrics(m: LayoutMetrics, scale: number, spacing: number): LayoutMetrics {
  return {
    ...m,
    pageWidth: m.pageWidth / scale,
    pageHeight: m.pageHeight / scale,
    // Margins stay the same on paper.
    marginTop: m.marginTop / scale,
    marginBottom: m.marginBottom / scale,
    // …but always room for the part boxes drawn in the left margin (`a)` → A).
    marginX: Math.max(m.marginX / scale, PART_ROOM),
    rowHeight: m.rowHeight * spacing,
    sectionGap: m.sectionGap * spacing
  }
}

/** A line that can share a row with the next: plain bars, nothing hanging over the whole line. */
const joinable = (line: BarLine): boolean => line.ending === null && line.cue === null

/**
 * Pairs of lines in a section become one row when together they are at most 8 bars. The second
 * line must carry nothing of its own over the whole line (part box, memos, ending, lyric line).
 * Each bar remembers the line it was typed on, for the sheet ↔ editor link.
 */
export function joinRows(doc: ChordDocument): ChordDocument {
  const sections: Section[] = doc.sections.map((section) => {
    const items: Section['items'] = []
    for (const item of section.items) {
      const last = items[items.length - 1]
      if (
        item.type === 'bars' &&
        last?.type === 'bars' &&
        !last.joined &&
        joinable(last) &&
        joinable(item) &&
        item.part === null &&
        item.memos.length === 0 &&
        last.bars.length + item.bars.length <= JOINED_BARS
      ) {
        items[items.length - 1] = {
          ...last,
          bars: [...last.bars, ...item.bars],
          barLines: [
            ...(last.barLines ?? last.bars.map(() => last.line)),
            ...item.bars.map(() => item.line)
          ],
          uncertain: last.uncertain || item.uncertain,
          joined: true
        }
      } else items.push(item)
    }
    return { ...section, items }
  })
  return { ...doc, sections }
}

export interface PrintLayout {
  model: PageModel
  metrics: LayoutMetrics
  /** The zoom that brings the laid-out page back to A4. */
  scale: number
}

/** Lays a song out with the print settings; `fitOnePage` searches for the biggest scale that fits. */
export function printLayout(
  doc: ChordDocument,
  base: LayoutMetrics,
  options: PrintOptions
): PrintLayout {
  const song = options.joinRows ? joinRows(doc) : doc
  const at = (scale: number): PrintLayout => {
    const metrics = scaledMetrics(base, scale, options.spacing)
    // Joined rows line up on an 8-bar grid; a line left alone takes half a row.
    if (options.joinRows) metrics.minBarsPerRow = JOINED_BARS
    return { model: layout(song, metrics), metrics, scale }
  }
  const wanted = Math.min(MAX_SCALE, Math.max(MIN_SCALE, options.scale))
  const first = at(wanted)
  if (!options.fitOnePage || first.model.pages.length <= 1) return first
  const smallest = at(MIN_SCALE)
  if (smallest.model.pages.length > 1) return smallest
  // The biggest scale between MIN_SCALE and the chosen one that still gives one page.
  let low = MIN_SCALE
  let high = wanted
  let best = smallest
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2
    const tried = at(mid)
    if (tried.model.pages.length <= 1) {
      best = tried
      low = mid
    } else high = mid
  }
  return best
}
