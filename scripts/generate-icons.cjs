// Renders the F2PX mark to build/icon.png, build/icon.ico and build/tray.png.
// Run with: npm run icons   (uses Electron itself as the rasteriser, no extra dependencies)
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const OUT = path.join(__dirname, '..', 'build')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="46" fill="#080808"/>
  <rect x="2.5" y="2.5" width="251" height="251" rx="44" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>
  <path d="M54 88V54h34M202 88V54h-34M54 168v34h34M202 168v34h-34" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="square"/>
  <path d="M90 90l26 26M140 140l26 26M166 90l-26 26M116 140l-26 26" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="square"/>
  <rect x="121" y="121" width="14" height="14" fill="#fff"/>
</svg>`

async function renderMaster(size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg(size)}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 400))
  let image = await win.webContents.capturePage()
  if (image.getSize().width !== size) image = image.resize({ width: size, height: size, quality: 'best' })
  win.destroy()
  return image
}

function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + pngs.length * 16
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const master = await renderMaster(512)
  const rendered = SIZES.map((size) => ({
    size,
    data: master.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }))
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(rendered))
  fs.writeFileSync(path.join(OUT, 'tray.png'), rendered.find((r) => r.size === 32).data)
  fs.writeFileSync(path.join(OUT, 'icon.png'), master.toPNG())
  console.log('Icons written to', OUT)
  app.quit()
})
