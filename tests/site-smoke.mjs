// Opens website/ (served locally) in F2PX itself, downloads the installer through the page and verifies the checksum.
//   npm run site:prepare && npm run test:site
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { launch, shellConn, waitFor, check, summary, sleep, targets, connect, browserClose, killAll, TMP, PROJECT } from './helpers/harness.mjs'

const PORT = 9390
const userData = path.join(TMP, 'ud-site')
const dlDir = path.join(TMP, 'site-dl')
fs.rmSync(userData, { recursive: true, force: true })
fs.rmSync(dlDir, { recursive: true, force: true })
fs.mkdirSync(dlDir, { recursive: true })

const server = spawn('node', ['scripts/serve-site.cjs'], { cwd: PROJECT, env: { ...process.env, PORT: '8090' }, stdio: 'ignore' })
await sleep(800)
const app = launch(userData, PORT)
const shell = await waitFor(async () => shellConn(), 25000, 500)
const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
const activeTab = async () => { const s = await rpc('shell.state'); return s.tabs.find((t) => t.id === s.activeId) }
const page = async () => { const u = (await activeTab()).url; return connect((await targets()).find((x) => x.type === 'page' && x.url === u)) }
try {
  await waitFor(async () => (await rpc('shell.state')).tabs.length)
  await rpc('settings.update', { downloadMode: 'custom', downloadPath: dlDir })

  await rpc('nav.go', 'http://localhost:8090/')
  await waitFor(async () => /F2PX Browser/.test((await activeTab()).title) && !(await activeTab()).loading, 20000)
  await sleep(1500)
  const pc = await page()
  const info = JSON.parse(await pc.eval(`JSON.stringify({
    meta: document.querySelector('#dl-meta').textContent,
    hs: document.querySelector('#hash-setup').textContent,
    hp: document.querySelector('#hash-portable').textContent,
    fonts: document.fonts.check('16px "IBM Plex Mono"'),
    privacyFirst: document.querySelector('main > section:nth-of-type(2)').id,
    cells: document.querySelectorAll('#privacy .cell').length,
    honest: !!document.querySelector('.box--honest'),
    shots: [...document.querySelectorAll('[data-shot]')].map((b) => b.dataset.shot).join(',')
  })`))
  check('page loads with local fonts', info.fonts === true)
  check('download meta shows version + size', /v1\.0\.0/.test(info.meta) && /MB/.test(info.meta), info.meta)
  check('SHA-256 values are filled in', /^[0-9a-f]{64}$/.test(info.hs) && /^[0-9a-f]{64}$/.test(info.hp))
  check('privacy is the first content section, with 9 points', info.privacyFirst === 'privacy' && info.cells === 9, `${info.privacyFirst}/${info.cells}`)
  check('the honest "what F2PX does not do" box is present', info.honest === true)
  check('privacy screenshot tab exists', info.shots.includes('privacy'), info.shots)

  const checksums = fs.readFileSync(path.join(PROJECT, 'website', 'SHA256SUMS.txt'), 'utf8')
  check('page hashes match SHA256SUMS.txt', checksums.includes(info.hs) && checksums.includes(info.hp))

  await pc.eval(`document.querySelector('#dl-setup').click()`)
  const done = await waitFor(async () => (await rpc('downloads.list')).find((d) => d.state === 'completed'), 60000, 500)
  check('installer downloads from the site', !!done && done.filename === 'F2PX-Browser-Setup.exe', done?.filename)
  if (done) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(done.savePath)).digest('hex')
    check('downloaded file matches the SHA-256 shown on the page', hash === info.hs, hash.slice(0, 16))
  }

  await pc.eval(`document.querySelector('[data-lang=en]').click()`)
  await sleep(300)
  check('English: hero + privacy copy switch', (await pc.eval(`document.querySelector('#dl-setup span').textContent`)) === 'Download for Windows' && /Zero requests/.test(await pc.eval(`document.querySelector('#privacy .cell h3').textContent`)))
  await pc.eval(`document.querySelector('[data-shot=privacy]').click(); document.querySelector('#shot').scrollIntoView()`) // lazy images only load near the viewport
  const loaded = await waitFor(async () => (await pc.eval(`document.querySelector('#shot').src.endsWith('privacy.png') && document.querySelector('#shot').complete && document.querySelector('#shot').naturalWidth`)) > 1000, 8000, 300)
  check('privacy screenshot loads', !!loaded)
  await pc.eval(`document.querySelector('[data-lang=ru]').click(); document.querySelector('[data-shot=home]').click()`)
  await sleep(600)

  const full = async (name, w, h) => {
    await pc.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 })
    await sleep(1200)
    const { contentSize } = await pc.send('Page.getLayoutMetrics')
    const r = await pc.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.ceil(contentSize.height), scale: 1 } })
    fs.writeFileSync(path.join(TMP, name), Buffer.from(r.data, 'base64'))
    return pc.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`)
  }
  check('no horizontal scroll on desktop', (await full('site-desktop.png', 1280, 900)) <= 0)
  check('no horizontal scroll on phone width', (await full('site-mobile.png', 390, 844)) <= 0)
  pc.close()
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { shell.close() } catch {}
  await browserClose(PORT).catch(() => {})
  server.kill()
  killAll()
  process.exit(process.exitCode || 0)
}
