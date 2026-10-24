// A PDF made of page pictures (1.7.3): for sharing a PDF file where the app can only draw the
// pages as JPEG pictures (web, phones — browsers print PDFs but cannot hand one over as a file).
// The smallest valid PDF: a catalog, the page list, and per page a JPEG image filling it.

export interface JpegPage {
  /** JPEG file bytes. */
  jpeg: Uint8Array
  /** Picture size in pixels. */
  width: number
  height: number
  /** Paper size in millimetres (A4 portrait: 210 × 297). */
  pageWidthMm: number
  pageHeightMm: number
}

const encoder = new TextEncoder()
const POINTS_PER_MM = 72 / 25.4

/** The PDF file for the pages, in order. */
export function jpegsToPdf(pages: JpegPage[]): Uint8Array {
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (chunk: string | Uint8Array): void => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    parts.push(bytes)
    length += bytes.length
  }
  /** Object number `n` starts here. */
  const begin = (n: number): void => {
    offsets[n] = length
    write(`${n} 0 obj\n`)
  }

  // Objects: 1 catalog, 2 page list, then 3 per page: page, its image, its drawing.
  const pageObject = (i: number): number => 3 + i * 3
  write('%PDF-1.4\n%âãÏÓ\n')
  begin(1)
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  begin(2)
  const kids = pages.map((_, i) => `${pageObject(i)} 0 R`).join(' ')
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`)

  pages.forEach((page, i) => {
    const w = (page.pageWidthMm * POINTS_PER_MM).toFixed(2)
    const h = (page.pageHeightMm * POINTS_PER_MM).toFixed(2)
    const [pageNo, imageNo, drawNo] = [pageObject(i), pageObject(i) + 1, pageObject(i) + 2]
    begin(pageNo)
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /P${i} ${imageNo} 0 R >> >> /Contents ${drawNo} 0 R >>\nendobj\n`
    )
    begin(imageNo)
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    )
    write(page.jpeg)
    write('\nendstream\nendobj\n')
    const draw = `q ${w} 0 0 ${h} 0 0 cm /P${i} Do Q`
    begin(drawNo)
    write(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`)
  })

  const count = 3 + pages.length * 3
  const xref = length
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) write(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
