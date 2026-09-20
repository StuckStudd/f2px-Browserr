import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, sleep, startServer, targets, browserClose, killAll, mainProcess, TMP } from '../helpers/harness.mjs'

const PORT = 9393
const INSPECT = 9276
const userData = path.join(TMP, 'ud-e2e-key')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()
launch(userData, PORT, INSPECT)
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
try {
  const shell = await waitFor(async () => shellConn(), 25000, 500)
  const main = await mainProcess(INSPECT)
  const rpc = rpcOf(shell)
  await waitFor(async () => (await rpc('shell.state')).tabs.length)
  const send = (target, key, mods) => main.eval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => ${target}); w.focus(); w.sendInputEvent({type:'keyDown', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); w.sendInputEvent({type:'keyUp', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); return w.getURL() })()`)
  const tabsNow = async () => (await rpc('shell.state')).tabs.map((t) => t.url)
  console.log('start', await tabsNow())
  console.log('sent to', await send(`w.getURL().startsWith('f2px://home')`, 'P', ['control', 'shift']))
  await sleep(1500)
  console.log('after page key', await tabsNow())
  console.log('sent to', await send(`w.getURL().includes('/out/renderer/index.html')`, 'P', ['control', 'shift']))
  await sleep(1500)
  console.log('after shell key', await tabsNow())
  try { main.close() } catch {}
} catch (e) {
  console.log('ERR', e.stack)
} finally {
  try { await browserClose(PORT) } catch {}
  killAll(); server.close(); process.exit(0)
}
