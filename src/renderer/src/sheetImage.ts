// Sheet pages → JPEG pictures (1.7.3), for the JPG button and for sharing. Each page (or booklet
// spread) is drawn the same way on every device: its HTML, with the sheet's styles and fonts
// embedded, put into an SVG picture, drawn on a canvas, saved as JPEG.

import { embeddedFontCss } from './fonts'
import previewCss from './preview.css?inline'

export interface SheetPicture {
  jpeg: Uint8Array
  width: number
  height: number
  pageWidthMm: number
  pageHeightMm: number
}

/** Pixels per millimetre: 200 dpi, sharp enough to print and small enough to send. */
const PX_PER_MM = 200 / 25.4
const CSS_PX_PER_MM = 96 / 25.4
const QUALITY = 0.9

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('악보 그림을 만들지 못했어요.'))
    img.src = url
  })
}

async function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('악보 그림을 만들지 못했어요.')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * The pictures of the pages in `pagesHtml` (from renderPages / renderSetlistPages): one per
 * page, or per spread when it is a booklet.
 */
export async function sheetPictures(pagesHtml: string): Promise<SheetPicture[]> {
  const holder = document.createElement('div')
  holder.innerHTML = pagesHtml
  const pages = holder.firstElementChild as HTMLElement
  const booklet = pages.classList.contains('booklet')
  const sheets = [...pages.children] as HTMLElement[]
  const [pageWidthMm, pageHeightMm] = booklet ? [297, 210] : [210, 297]
  const css = `${await embeddedFontCss(pagesHtml)}\n${previewCss}`
  const width = Math.round(pageWidthMm * PX_PER_MM)
  const height = Math.round(pageHeightMm * PX_PER_MM)
  const scale = PX_PER_MM / CSS_PX_PER_MM
  const serializer = new XMLSerializer()
  const pictures: SheetPicture[] = []
  for (const sheet of sheets) {
    // The page alone, inside the same .pages wrapper (it carries the sizes and the theme).
    const wrapper = pages.cloneNode(false) as HTMLElement
    wrapper.style.padding = '0'
    wrapper.style.gap = '0'
    wrapper.append(sheet.cloneNode(true))
    const xhtml = serializer.serializeToString(wrapper)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" class="print" ` +
      `style="transform:scale(${scale});transform-origin:0 0;width:${pageWidthMm}mm;background:#fff">` +
      `<style><![CDATA[${css}]]></style>${xhtml}</div></foreignObject></svg>`
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(img, 0, 0)
    pictures.push({ jpeg: await toJpeg(canvas), width, height, pageWidthMm, pageHeightMm })
  }
  return pictures
}

/** All pictures one under the other in a single JPEG (a whole song to send as one image). */
export async function stackedJpeg(pictures: SheetPicture[]): Promise<Uint8Array> {
  if (pictures.length === 1) return pictures[0].jpeg
  const gap = Math.round(4 * PX_PER_MM)
  const width = Math.max(...pictures.map((p) => p.width))
  const height = pictures.reduce((h, p) => h + p.height, 0) + gap * (pictures.length - 1)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#e6e6e6'
  context.fillRect(0, 0, width, height)
  let y = 0
  for (const p of pictures) {
    const img = await loadImage(
      URL.createObjectURL(new Blob([p.jpeg as BlobPart], { type: 'image/jpeg' }))
    )
    context.drawImage(img, 0, y)
    URL.revokeObjectURL(img.src)
    y += p.height + gap
  }
  return toJpeg(canvas)
}
