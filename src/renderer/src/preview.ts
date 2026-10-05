// Page model → HTML. The preview and the PDF use this same HTML.

import {
  chordParts,
  type Bar,
  type Chord,
  type ChordItem,
  type PageBlock,
  type PageModel,
  type RowBlock,
  type Theme
} from '../../core'
import { embeddedFontCss } from './fonts'
import previewCss from './preview.css?inline'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** ♯/♭ get their own span so the theme can size and space them. */
const withAccidentals = (text: string): string =>
  escapeHtml(text).replace(
    /[♯♭]/g,
    (a) => `<span class="acc ${a === '♭' ? 'flat' : 'sharp'}">${a}</span>`
  )

/** The parts of a chord as the theme draws them; shared by the pages and the editor. */
export function chordInnerHtml(chord: Chord, theme: Theme): string {
  const p = chordParts(chord, theme.chord)
  return (
    `<span class="root">${withAccidentals(p.root)}</span>` +
    (p.inline ? `<span class="inline">${escapeHtml(p.inline)}</span>` : '') +
    (p.sup ? `<sup>${withAccidentals(p.sup)}</sup>` : '') +
    (p.bass ? `<span class="bass">${withAccidentals(p.bass)}</span>` : '')
  )
}

/** A chord with its marks: `'` breath (V), `*` accent (>), `?` needs checking, `nc` → N.C. */
function chordHtml(item: ChordItem, theme: Theme): string {
  const classes = ['chord']
  let body: string
  if (item.noChord) {
    classes.push('no-chord')
    body = 'N.C.'
  } else if (!item.chord) {
    classes.push('chord-error')
    body = escapeHtml(item.source)
  } else {
    body = chordInnerHtml(item.chord, theme)
  }
  if (item.uncertain) classes.push('uncertain')
  const marks =
    (item.breath ? '<span class="breath" title="브레스">V</span>' : '') +
    (item.accent ? '<span class="accent" title="악센트">&gt;</span>' : '')
  return `<span class="${classes.join(' ')}">${marks}${body}</span>`
}

type BarlineKind = 'plain' | 'final' | 'repeat-start' | 'repeat-end' | 'none'

/**
 * Each bar draws its left barline, plus its right one when it is the last bar or the right side
 * is special (final, repeat end). A bar after a final or repeat end leaves its left side to it.
 */
function barHtml(bar: Bar, index: number, bars: Bar[], theme: Theme): string {
  const previous = index > 0 ? bars[index - 1] : null
  const left: BarlineKind = bar.repeatStart
    ? 'repeat-start'
    : previous && (previous.final || previous.repeatEnd)
      ? 'none'
      : 'plain'
  const right: BarlineKind = bar.final
    ? 'final'
    : bar.repeatEnd
      ? 'repeat-end'
      : index === bars.length - 1
        ? 'plain'
        : 'none'
  const dots =
    (bar.repeatStart ? '<span class="dots start"></span>' : '') +
    (bar.repeatEnd ? '<span class="dots end"></span>' : '')
  const chords = bar.chords.map((c) => chordHtml(c, theme)).join('')
  return `<div class="bar" data-left="${left}" data-right="${right}">${dots}${chords}</div>`
}

/** A song-form part (`a)` → A) in a square box. */
export const partHtml = (label: string): string => `<span class="part">${escapeHtml(label)}</span>`

/** Band above the bars: the ending bracket (`1.`) and texts over bars (`"Break"`). */
function aboveHtml(block: RowBlock): string {
  const { line, slots } = block
  const ending =
    line.ending !== null
      ? `<div class="ending" style="width:calc(100% * ${line.bars.length} / ${slots})">${line.ending}.</div>`
      : ''
  const cells = line.bars
    .map((b) => `<div class="above-cell">${b.texts.map(escapeHtml).join(' · ')}</div>`)
    .join('')
  const kind = line.ending !== null ? 'above has-ending' : 'above'
  return `<div class="${kind}" style="--slots:${slots}">${ending}${cells}</div>`
}

function blockHtml(block: PageBlock, theme: Theme): string {
  if (block.type === 'label') {
    const directive = block.directive
      ? ` <span class="label-directive">${escapeHtml(block.directive)}</span>`
      : ''
    const key = block.keyChange
      ? ` <span class="key-change">Key ${withAccidentals(block.keyChange)}</span>`
      : ''
    return `<div class="label">${escapeHtml(block.name)}${directive}${key}</div>`
  }
  if (block.type === 'form') {
    return `<div class="form">${block.parts.map((p) => partHtml(p.label)).join('')}</div>`
  }
  if (block.type === 'directive') {
    return `<div class="directive">${escapeHtml(block.text)}</div>`
  }
  const { line } = block
  const memos = line.memos
    .map((m) => `<div class="memo memo-${m.color}">${escapeHtml(m.text)}</div>`)
    .join('')
  const cue = line.cue !== null ? `<div class="cue">${escapeHtml(line.cue)}</div>` : ''
  const bars = line.bars.map((b, i, all) => barHtml(b, i, all, theme)).join('')
  return (
    `<div class="row" style="height:${block.height}mm">` +
    memos +
    (block.above ? aboveHtml(block) : '') +
    `<div class="bar-row">` +
    (line.part ? partHtml(line.part.label) : '') +
    `<div class="bars" style="--slots:${block.slots}">${bars}</div>` +
    `</div>` +
    cue +
    `</div>`
  )
}

/** CSS variables carrying the theme's layout numbers, so the page matches layout(). */
function metricVars(theme: Theme): string {
  const m = theme.metrics
  const vars: Record<string, number> = {
    'page-w': m.pageWidth,
    'page-h': m.pageHeight,
    'margin-top': m.marginTop,
    'margin-bottom': m.marginBottom,
    'margin-x': m.marginX,
    'title-h': m.titleHeight,
    'heading-h': m.headingHeight,
    'section-gap': m.sectionGap,
    'label-h': m.sectionLabelHeight,
    'row-h': m.rowHeight,
    'cue-h': m.cueHeight,
    'form-h': m.formHeight,
    'memo-h': m.memoHeight,
    'above-h': m.aboveHeight,
    'directive-h': m.directiveHeight
  }
  return Object.entries(vars)
    .map(([k, v]) => `--${k}:${v}mm`)
    .join(';')
}

export function renderPages(model: PageModel, theme: Theme): string {
  const pages = model.pages.map(
    (page) =>
      `<section class="page">` +
      `<header class="${page.number === 1 ? 'title' : 'heading'}">${escapeHtml(page.heading)}` +
      (page.key ? `<span class="song-key">Key ${withAccidentals(page.key)}</span>` : '') +
      `</header>` +
      `<div class="blocks">${page.blocks.map((b) => blockHtml(b, theme)).join('')}</div>` +
      `</section>`
  )
  return `<div class="pages theme-${theme.id}" style="${metricVars(theme)}">${pages.join('')}</div>`
}

/**
 * A standalone HTML document of the pages — styles and fonts embedded — for platform.exportPdf.
 * Same HTML as the preview, so the PDF matches what is on screen.
 */
export async function buildPrintDocument(
  model: PageModel,
  theme: Theme,
  title: string
): Promise<string> {
  const fonts = await embeddedFontCss()
  return (
    `<!doctype html><html lang="ko" class="print"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${fonts}\n${previewCss}</style></head>` +
    `<body>${renderPages(model, theme)}</body></html>`
  )
}
