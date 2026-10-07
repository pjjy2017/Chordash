// Web version (GitHub Pages, ROADMAP Phase 11): the same page as the desktop app, built as a
// plain website. The Android app (Capacitor, Phase 12) is made from the same build. The page
// picks its platform at start (src/platform).

import { resolve } from 'path'
import { defineConfig } from 'vite'
import { pdfjsAssets } from './vite.pdfjs'

export default defineConfig({
  root: resolve('src/renderer'),
  // Relative paths, so the site works under https://<user>.github.io/<repo>/.
  base: './',
  // pdf.js files for the Android app's image/PDF import (the website itself has no AI).
  plugins: [pdfjsAssets()],
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
