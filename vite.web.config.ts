// Web version (GitHub Pages, ROADMAP Phase 11): the same page as the desktop app, built as a
// plain website. Without the desktop bridge the page picks the web platform (src/platform).

import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('src/renderer'),
  // Relative paths, so the site works under https://<user>.github.io/<repo>/.
  base: './',
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
