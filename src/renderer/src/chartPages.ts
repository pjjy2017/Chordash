// Image/PDF import: turns the picked file into page images, for the AI and for the "원본" view.
// PDFs are drawn page by page with pdf.js; photos are scaled down. Everything happens in the
// page itself, so the Android version can do the same in its web view.

import type { ChartImage, ImportedFile } from '../../platform'

export interface ChartPages {
  pages: ChartPage[]
  /** Pages in the file; more than `pages` when a long PDF was cut. */
  total: number
}

export interface ChartPage {
  /** What is sent to the AI. */
  image: ChartImage
  /** The same picture, for <img>. */
  url: string
}

/**
 * Longest side of a page image in pixels: enough to read small handwriting (about 170 dpi on
 * A4), small enough to keep each page well under the API's size limit.
 */
const MAX_SIDE = 2000
const JPEG_QUALITY = 0.88

export const isPdf = (file: ImportedFile): boolean =>
  /\.pdf$/i.test(file.file.name) || String.fromCharCode(...file.data.slice(0, 5)) === '%PDF-'

/** A photo or PDF (for the AI), not a text chart: by name, or by the first bytes (1.4). */
export const isChartFile = (file: ImportedFile): boolean => {
  const [a, b] = file.data
  return (
    isPdf(file) ||
    /\.(png|jpe?g|webp|heic|gif)$/i.test(file.file.name) ||
    (a === 0x89 && b === 0x50) || // PNG
    (a === 0xff && b === 0xd8) // JPEG
  )
}

/** The picture on a canvas → a JPEG page. White underneath, so transparent PNGs stay readable. */
function pageFrom(canvas: HTMLCanvasElement): ChartPage {
  const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return { image: { mediaType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) }, url }
}

function canvasFor(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('그림을 그릴 수 없어요.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  return [canvas, context]
}

async function imagePages(file: ImportedFile): Promise<ChartPages> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([file.data as BlobPart]), {
      imageOrientation: 'from-image'
    })
  } catch {
    throw new Error('그림 파일을 읽을 수 없어요. PNG나 JPG 파일인지 확인해 주세요.')
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const [canvas, context] = canvasFor(bitmap.width * scale, bitmap.height * scale)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { pages: [pageFrom(canvas)], total: 1 }
}

async function pdfPages(file: ImportedFile, maxPages: number): Promise<ChartPages> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  // Fonts, character maps and image decoders pdf.js loads on demand (copied by the build).
  const assets = new URL('pdfjs/', location.href).href
  const task = pdfjs.getDocument({
    // pdf.js takes the buffer over; give it a copy.
    data: file.data.slice(),
    cMapUrl: `${assets}cmaps/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`
  })
  try {
    let pdf: Awaited<typeof task.promise>
    try {
      pdf = await task.promise
    } catch {
      throw new Error('PDF를 열 수 없어요. 암호가 걸렸거나 손상된 파일인지 확인해 주세요.')
    }
    const pages: ChartPage[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) })
      const [canvas, context] = canvasFor(viewport.width, viewport.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      pages.push(pageFrom(canvas))
      page.cleanup()
    }
    return { pages, total: pdf.numPages }
  } finally {
    await task.destroy()
  }
}

/** All pages of the file (PDFs: at most `maxPages`), as JPEG page images. */
export function chartPages(file: ImportedFile, maxPages: number): Promise<ChartPages> {
  return isPdf(file) ? pdfPages(file, maxPages) : imagePages(file)
}
