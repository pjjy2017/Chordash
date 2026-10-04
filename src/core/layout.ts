// Document model → pages (PRD 4: page breaks, page titles).

import type { BarLine, ChordDocument, Part, Section } from './document'
import { formatKey } from './key'
import type { LayoutMetrics } from './theme'

export interface SectionLabelBlock {
  type: 'label'
  name: string
  directive: string | null
  /** `[Vocal] key: G` → `G`, shown beside the label. */
  keyChange: string | null
  height: number
}

export interface RowBlock {
  type: 'row'
  line: BarLine
  /** Grid columns: bars in the row, but at least `minBarsPerRow`. */
  slots: number
  height: number
}

/** Song form at a glance: a row of part boxes. */
export interface FormBlock {
  type: 'form'
  parts: Part[]
  height: number
}

export type PageBlock = SectionLabelBlock | RowBlock | FormBlock

export interface Page {
  /** 1-based. */
  number: number
  /** Page 1: the song title. Pages 2+: "제목 N". */
  heading: string
  /** The song's key (`F`, `F♯m`), shown on page 1 only. */
  key: string | null
  blocks: PageBlock[]
}

export interface PageModel {
  pages: Page[]
}

function rowBlock(line: BarLine, m: LayoutMetrics): RowBlock {
  return {
    type: 'row',
    line,
    slots: Math.max(m.minBarsPerRow, line.bars.length),
    height: m.rowHeight + (line.cue !== null ? m.cueHeight : 0)
  }
}

const heightOf = (blocks: PageBlock[]): number => blocks.reduce((h, b) => h + b.height, 0)

/** Each section becomes runs of blocks; a `---` splits a section into separate runs. */
function sectionRuns(
  section: Section,
  m: LayoutMetrics
): { blocks: PageBlock[]; forceBreak: boolean }[] {
  const runs: { blocks: PageBlock[]; forceBreak: boolean }[] = [{ blocks: [], forceBreak: false }]
  if (section.name !== null) {
    runs[0].blocks.push({
      type: 'label',
      name: section.name,
      directive: section.directive,
      keyChange: section.keyChange ? formatKey(section.keyChange) : null,
      height: m.sectionLabelHeight
    })
  }
  for (const item of section.items) {
    if (item.type === 'pageBreak') runs.push({ blocks: [], forceBreak: true })
    else if (item.type === 'bars') runs[runs.length - 1].blocks.push(rowBlock(item, m))
    else if (item.type === 'form') {
      runs[runs.length - 1].blocks.push({ type: 'form', parts: item.parts, height: m.formHeight })
    }
    // Standalone directives are drawn in Phase 6.
  }
  return runs
}

export function layout(doc: ChordDocument, m: LayoutMetrics): PageModel {
  const title = doc.title ?? ''
  const contentHeight = m.pageHeight - m.marginTop - m.marginBottom
  const pages: Page[] = []
  let page!: Page
  let used = 0

  const newPage = (): void => {
    const number = pages.length + 1
    page = {
      number,
      heading: number === 1 ? title : `${title} ${number}`.trim(),
      key: number === 1 && doc.key ? formatKey(doc.key) : null,
      blocks: []
    }
    pages.push(page)
    used = number === 1 ? m.titleHeight : m.headingHeight
  }
  const capacity = (): number => contentHeight - used
  // A section label gets a gap above it unless it starts the page.
  const gapFor = (blocks: PageBlock[]): number =>
    blocks[0]?.type === 'label' && page.blocks.length > 0 ? m.sectionGap : 0
  const place = (blocks: PageBlock[]): void => {
    used += gapFor(blocks) + heightOf(blocks)
    page.blocks.push(...blocks)
  }
  const fresh = (): number => contentHeight - m.headingHeight

  newPage()
  let pendingBreak = false

  for (const section of doc.sections) {
    for (const run of sectionRuns(section, m)) {
      if (run.forceBreak) pendingBreak = true
      if (run.blocks.length === 0) continue
      if (pendingBreak && page.blocks.length > 0) newPage()
      pendingBreak = false

      const whole = heightOf(run.blocks)
      const startsSection = run.blocks[0].type === 'label'
      if (whole + gapFor(run.blocks) <= capacity()) {
        place(run.blocks)
        continue
      }
      // Doesn't fit here: move the whole section if it fits on a new page.
      if (startsSection && whole <= fresh() && page.blocks.length > 0) {
        newPage()
        place(run.blocks)
        continue
      }
      // Too long for one page: flow row by row, keeping the label with its first row.
      const first = startsSection ? 2 : 1
      const chunks = [run.blocks.slice(0, first), ...run.blocks.slice(first).map((b) => [b])]
      for (const chunk of chunks) {
        if (gapFor(chunk) + heightOf(chunk) > capacity() && page.blocks.length > 0) newPage()
        place(chunk)
      }
    }
  }
  return { pages }
}
