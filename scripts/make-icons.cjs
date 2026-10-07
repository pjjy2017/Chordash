// Draws every app icon from the logo (resources/logo.svg) — run with: npm run icons
// Uses Electron's own Chromium to turn the SVG into PNGs, so no extra image library is needed.
//   desktop: resources/icon.png, build/icon.png, build/icon.ico
//   Android: launcher icons (normal, round, adaptive foreground + background colour), splash
//   web:     src/renderer/public/favicon.svg (copied as is)

const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const logo = readFileSync(join(root, 'resources/logo.svg'), 'utf8')
const INK = '#23272f'

/** The barlines alone, from the logo. */
const bars = logo.match(/<g fill="#fff">[\s\S]*?<\/g>/)[0]
const svg = (inner, view = '0 0 140 140') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${inner}</svg>`

const SHAPES = {
  /** Rounded tile: desktop, web, older Android launchers. */
  tile: logo,
  /** Round launcher icon. */
  round: svg(`<circle cx="70" cy="70" r="70" fill="${INK}"/>${bars}`),
  /**
   * Adaptive icon foreground: barlines only, small enough for the launcher's mask
   * (the visible circle is the middle 2/3 of the 108dp canvas).
   */
  foreground: svg(`<g transform="translate(70 70) scale(0.6) translate(-70 -70)">${bars}</g>`),
  /** Splash screen: the barlines on charcoal, small in the middle (cropped to fit any screen). */
  splash: svg(`<rect x="-500" y="-500" width="1140" height="1140" fill="${INK}"/><g transform="translate(70 70) scale(0.35) translate(-70 -70)">${bars}</g>`)
}

async function render(win, shape, width, height = width) {
  const url = 'data:image/svg+xml;base64,' + Buffer.from(SHAPES[shape]).toString('base64')
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = ${width}; c.height = ${height}
      const ctx = c.getContext('2d')
      const side = Math.max(${width}, ${height})
      ctx.drawImage(img, (${width} - side) / 2, (${height} - side) / 2, side, side)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = ${JSON.stringify(url)}
  })`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO with PNG images inside (Windows Vista and later read these). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

/** Width and height of an existing PNG (from its header). */
function pngSize(file) {
  const b = readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<body></body>')
  const out = (path, png) => {
    writeFileSync(join(root, path), png)
    console.log(path)
  }

  out('resources/icon.png', await render(win, 'tile', 512))
  out('build/icon.png', await render(win, 'tile', 512))
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(
    join(root, 'build/icon.ico'),
    ico(await Promise.all(icoSizes.map(async (size) => ({ size, png: await render(win, 'tile', size) }))))
  )
  console.log('build/icon.ico')
  copyFileSync(join(root, 'resources/logo.svg'), join(root, 'src/renderer/public/favicon.svg'))

  const res = join(root, 'android/app/src/main/res')
  if (existsSync(res)) {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
    for (const [name, scale] of Object.entries(densities)) {
      const dir = `android/app/src/main/res/mipmap-${name}`
      out(`${dir}/ic_launcher.png`, await render(win, 'tile', 48 * scale))
      out(`${dir}/ic_launcher_round.png`, await render(win, 'round', 48 * scale))
      out(`${dir}/ic_launcher_foreground.png`, await render(win, 'foreground', 108 * scale))
    }
    writeFileSync(
      join(res, 'values/ic_launcher_background.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${INK.toUpperCase()}</color>\n</resources>\n`
    )
    for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
      const file = join(res, dir, 'splash.png')
      if (!existsSync(file)) continue
      const [w, h] = pngSize(file)
      out(`android/app/src/main/res/${dir}/splash.png`, await render(win, 'splash', w, h))
    }
  }
  app.quit()
})
