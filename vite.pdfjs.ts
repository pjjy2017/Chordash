// Files pdf.js loads on demand when it reads a PDF (image decoders, fonts, character maps),
// served at `pdfjs/<folder>/` next to the page: by the dev server, and copied by the build.
// Used by the desktop build and the web build (which the Android app is made from).

import { createReadStream, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { Plugin } from 'vite'

const PDFJS_DIR = resolve('node_modules/pdfjs-dist')
const PDFJS_FOLDERS = ['wasm', 'standard_fonts', 'cmaps', 'iccs']

export function pdfjsAssets(): Plugin {
  return {
    name: 'chordash-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const [folder, name] = decodeURIComponent((req.url ?? '').split('?')[0])
          .replace(/^\//, '')
          .split('/')
        const file = join(PDFJS_DIR, folder ?? '', name ?? '')
        if (!PDFJS_FOLDERS.includes(folder) || !name || name.includes('..')) return next()
        try {
          if (!statSync(file).isFile()) return next()
        } catch {
          return next()
        }
        if (name.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const folder of PDFJS_FOLDERS) {
        for (const name of readdirSync(join(PDFJS_DIR, folder))) {
          if (name.startsWith('LICENSE')) continue
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${folder}/${name}`,
            source: readFileSync(join(PDFJS_DIR, folder, name))
          })
        }
      }
    }
  }
}
