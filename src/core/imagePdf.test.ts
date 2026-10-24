import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { jpegsToPdf } from './imagePdf'

/** A 1 × 1 white JPEG. */
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
  ),
  (c) => c.charCodeAt(0)
)

const page = { jpeg: JPEG, width: 1, height: 1, pageWidthMm: 210, pageHeightMm: 297 }

describe('jpegsToPdf', () => {
  it('makes a PDF that a PDF reader opens, one A4 page per picture', async () => {
    const bytes = jpegsToPdf([page, page])
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe('%PDF-1.4')
    const pdf = await pdfjs.getDocument({ data: bytes }).promise
    expect(pdf.numPages).toBe(2)
    const [, , w, h] = (await pdf.getPage(1)).view
    expect(Math.round(w)).toBe(595)
    expect(Math.round(h)).toBe(842)
  })

  it('keeps landscape pages landscape (booklet)', async () => {
    const pdf = await pdfjs.getDocument({
      data: jpegsToPdf([{ ...page, pageWidthMm: 297, pageHeightMm: 210 }])
    }).promise
    const [, , w, h] = (await pdf.getPage(1)).view
    expect(w).toBeGreaterThan(h)
  })
})
