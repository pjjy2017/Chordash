import { defineConfig } from 'electron-vite'
import { pdfjsAssets } from './vite.pdfjs'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [pdfjsAssets()]
  }
})
