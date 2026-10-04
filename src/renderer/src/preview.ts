// Page model → HTML. The preview and the PDF use this same HTML.

import {
  chordParts,
  type Bar,
  type Chord,
  type ChordItem,
  type PageBlock,
  type PageModel,
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

function chordHtml(item: ChordItem, theme: Theme): string {
  if (!item.chord) return `<span class="chord chord-error">${escapeHtml(item.source)}</span>`
  return `<span class="chord">${chordInnerHtml(item.chord, theme)}</span>`
}

/** Each bar draws its left barline; the last bar (or one ending in `.`) also draws its right one. */
function barHtml(bar: Bar, index: number, bars: Bar[], theme: Theme): string {
  const classes = ['bar']
  if (index > 0 && bars[index - 1].final) classes.push('after-final')
  if (bar.final) classes.push('final')
  else if (index === bars.length - 1) classes.push('end')
  const chords = bar.chords.map((c) => chordHtml(c, theme)).join('')
  return `<div class="${classes.join(' ')}">${chords}</div>`
}

/** A song-form part (`a)` → A) in a square box. */
export const partHtml = (label: string): string => `<span class="part">${escapeHtml(label)}</span>`

function blockHtml(block: PageBlock, theme: Theme): string {
  if (block.type === 'label') {
    const key = block.keyChange
      ? ` <span class="key-change">Key ${withAccidentals(block.keyChange)}</span>`
      : ''
    return `<div class="label">${escapeHtml(block.name)}${key}</div>`
  }
  if (block.type === 'form') {
    return `<div class="form">${block.parts.map((p) => partHtml(p.label)).join('')}</div>`
  }
  const { line } = block
  const cue = line.cue !== null ? `<div class="cue">${escapeHtml(line.cue)}</div>` : ''
  return (
    `<div class="row${cue ? ' has-cue' : ''}">` +
    (line.part ? partHtml(line.part.label) : '') +
    `<div class="bars" style="--slots:${block.slots}">${line.bars.map((b, i, all) => barHtml(b, i, all, theme)).join('')}</div>` +
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
    'form-h': m.formHeight
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
