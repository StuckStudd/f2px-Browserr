import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { launch, shellConn, waitFor, check, checkNet, summary, sleep, startServer, targets, connect, isShell, browserClose, killAll, TMP } from '../helpers/harness.mjs'

const PORT = 9355
const server = await startServer()
const A = path.join(TMP, 'ud-sec-a')
const B = path.join(TMP, 'ud-sec-b')
for (const d of [A, B]) fs.rmSync(d, { recursive: true, force: true })
fs.mkdirSync(B, { recursive: true })

const conns = []
const track = (c) => { conns.push(c); return c }
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
const pageRpc = (c) => (m, ...a) => c.eval(`window.f2px.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`
const clickText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); if (!el) return false; el.click(); return true })()`
const setValue = (sel, value) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`

let shell
async function start(userData, env = {}) {
  const app = launch(userData, PORT, undefined, [], env)
  return app
}
async function shellReady() {
  shell = await waitFor(async () => shellConn(), 30000, 500)
  await waitFor(async () => (await rpcOf(shell)('shell.state')).tabs.length)
  return rpcOf(shell)
}
async function stop() {
  conns.splice(0).forEach((c) => { try { c.close() } catch {} })
  try { shell?.close() } catch {}
  shell = undefined
  await browserClose(PORT).catch(() => {})
  await waitFor(async () => { try { await targets(); return false } catch { return true } }, 15000, 400)
  killAll()
  await sleep(1200)
}
const internal = async (name) => {
  const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith(`f2px://${name}`)), 20000)
  if (!t) throw new Error('no internal page ' + name)
  await sleep(700)
  return track(await connect(t))
}
const activeTab = async (rpc) => { const s = await rpc('shell.state'); return s.tabs.find((t) => t.id === s.activeId) }

try {
  // ───────── A. first-run wizard (real UI) ─────────────────────────────────
  await start(A, { F2PX_SKIP_ONBOARDING: '' })
  let rpc = await shellReady()
  check('first run opens the welcome wizard', (await activeTab(rpc)).url.startsWith('f2px://welcome'), (await activeTab(rpc)).url)
  const w = await internal('welcome')
  await w.send('Page.enable')
  await w.eval(clickText('.welcome__nav .btn', 'Get started'))
  await sleep(500)
  await w.eval(setValue('.welcome__field .input', 'Ivan'))
  await w.eval(clickText('.welcome__nav .btn', 'Continue'))
  await sleep(500)
  await w.eval(clickText('.opt', 'Light'))
  await sleep(400)
  check('theme choice applies immediately', (await rpc('settings.get')).theme === 'light')
  await w.eval(clickText('.welcome__nav .btn', 'Continue'))
  await sleep(500)
  const searchText = await w.eval('document.body.innerText')
  check('DuckDuckGo is marked as recommended and preselected', /RECOMMENDED/i.test(searchText) && (await w.eval(`document.querySelector('.opt.is-selected .opt__name').textContent`)).startsWith('DuckDuckGo'))
  await w.shot(path.join(TMP, 'wizard-search.png'))
  await w.eval(clickText('.opt', 'Brave'))
  await w.eval(clickText('.opt', 'DuckDuckGo'))
  await w.eval(clickText('.welcome__nav .btn', 'Continue'))
  await sleep(500)
  await w.eval(clickText('.welcome__nav .btn', 'Continue'))
  await sleep(500)
  await w.eval(clickText('.opt', 'GitHub')) // ask to open a sign-in page
  await w.eval(clickText('.welcome__nav .btn', 'Start browsing'))
  await waitFor(async () => (await rpc('settings.get')).onboarded === true)
  const s = await rpc('settings.get')
  check('wizard saves the profile and choices', s.userName === 'Ivan' && s.theme === 'light' && s.searchEngine === 'duckduckgo' && s.trackerBlocking === 'standard' && s.onboarded, JSON.stringify({ n: s.userName, t: s.theme, e: s.searchEngine }))
  check('wizard: phishing protection on; list + update checks enabled by the (disclosed) default', s.threatProtection === true && s.protectionUpdates === true && s.checkUpdates === true, JSON.stringify({ t: s.threatProtection, p: s.protectionUpdates, u: s.checkUpdates }))
  const opened = await waitFor(async () => (await rpc('shell.state')).tabs.some((t) => /github\.com\/login/.test(t.url)), 15000)
  check('chosen sign-in page is opened in a new tab', !!opened)
  await rpc('bookmarks.add', { title: 'VaultSecretTitle', url: 'https://vault-secret.example/' })
  await sleep(3500) // encrypted snapshot is written a couple of seconds after a change
  await stop()

  // ───────── B. encrypted at rest ──────────────────────────────────────────
  const files = fs.readdirSync(A)
  check('vault + key file exist, no plaintext database or settings', files.includes('f2px.vault') && files.includes('vault.json') && !files.includes('f2px.db') && !files.includes('settings.json'), files.join(','))
  const raw = fs.readFileSync(path.join(A, 'f2px.vault'))
  const asText = raw.toString('latin1') + raw.toString('utf8')
  check('vault file contains none of the stored text and no SQLite header', !/VaultSecretTitle|vault-secret|Ivan|SQLite format|github\.com/.test(asText))
  const meta = fs.readFileSync(path.join(A, 'vault.json'), 'utf8')
  check('key file holds only a protected (wrapped) key', /"mode":"dpapi"/.test(meta) && !/Ivan|VaultSecret/.test(meta), meta.slice(0, 60))

  // ───────── C. restart keeps data; strip params; DoH wiring ───────────────
  await start(A)
  rpc = await shellReady()
  check('data survives a restart, wizard is not shown again', (await activeTab(rpc)).url.startsWith('f2px://home') && (await rpc('bookmarks.tree')).some((b) => b.title === 'VaultSecretTitle') && (await rpc('settings.get')).userName === 'Ivan')
  await rpc('nav.go', 'http://127.0.0.1:8899/?utm_source=news&fbclid=abc123&keep=1&gclid=zzz')
  const cleaned = await waitFor(async () => { const t = await activeTab(rpc); return t.title === 'Local Test Page' && !t.loading ? t : null })
  check('tracking parameters are removed from links, real ones stay', cleaned?.url === 'http://127.0.0.1:8899/?keep=1', cleaned?.url)
  await rpc('settings.update', { stripTrackingParams: false })
  await rpc('nav.go', 'http://127.0.0.1:8899/?utm_source=x&q=1')
  const kept = await waitFor(async () => { const t = await activeTab(rpc); return /utm_source=x/.test(t.url) && !t.loading ? t : null })
  check('parameter cleaning can be switched off', !!kept, kept?.url)
  await rpc('settings.update', { stripTrackingParams: true })

  // encrypted DNS is really used: strict mode with an unreachable resolver cannot resolve names, "off" can
  await rpc('settings.update', { secureDns: 'strict', dnsProvider: 'custom', dnsCustomUrl: 'https://127.0.0.1:9/dns-query' })
  await sleep(500)
  await rpc('nav.go', 'https://www.iana.org/')
  const blocked = await waitFor(async () => { const t = await activeTab(rpc); return t.url.startsWith('f2px://error') && /type=(dns|offline|connection)/.test(t.url) ? t : null }, 25000)
  checkNet('strict encrypted DNS with an unreachable resolver fails to resolve names', !!blocked, blocked?.url)
  await rpc('settings.update', { secureDns: 'off' })
  await sleep(500)
  await rpc('nav.go', 'https://example.org/')
  const resolved = await waitFor(async () => { const t = await activeTab(rpc); return /Example Domain/.test(t.title) && !t.loading ? t : null }, 25000)
  checkNet('with encrypted DNS off the same network resolves normally', !!resolved, resolved?.title)
  await rpc('settings.update', { secureDns: 'automatic', dnsProvider: 'cloudflare', dnsCustomUrl: '' })

  // set a startup password
  const settingsPage = await (async () => { await rpc('ui.openPage', 'settings'); return internal('settings') })()
  const prpc = pageRpc(settingsPage)
  check('status reports DPAPI-encrypted data before a password is set', (await prpc('security.status')).mode === 'dpapi')
  let status = await prpc('security.setPassword', '', 'correct horse 1')
  check('setting a startup password switches the vault to password mode', status.mode === 'password' && status.encrypted === true)
  const shortPw = await prpc('security.setPassword', 'correct horse 1', 'short').then(() => 'accepted', (e) => String(e.message || e))
  check('short passwords are rejected', /at least 8/.test(shortPw), shortPw)
  await sleep(3500)
  await stop()

  // ───────── D. password window ────────────────────────────────────────────
  await start(A)
  const lock = await internal('unlock')
  check('with a password set, only the unlock window appears', (await targets()).filter(isShell).length === 0)
  check('unlock window has its dedicated bridge (and not the F2PX API)', (await lock.eval(`typeof window.f2pxUnlock + '|' + typeof window.f2px + '|' + typeof window.f2pxShell`)) === 'object|undefined|undefined')
  await lock.send('Page.enable')
  await lock.shot(path.join(TMP, 'unlock.png'))
  check('wrong password is refused', (await lock.eval(`window.f2pxUnlock.submit('not the password')`)) === false)
  check('data is still locked after a wrong attempt', (await targets()).filter(isShell).length === 0)
  await lock.eval(setValue('input[type=password]', 'nope nope nope'))
  await lock.eval(click('button[type=submit]'))
  await sleep(2500)
  check('the UI shows an error for a wrong password', /Wrong password/.test(await lock.eval('document.body.innerText')))
  check('correct password unlocks', (await lock.eval(`window.f2pxUnlock.submit('correct horse 1')`)) === true)
  rpc = await shellReady()
  check('after unlocking, the encrypted data is available', (await rpc('bookmarks.tree')).some((b) => b.title === 'VaultSecretTitle') && (await rpc('settings.get')).userName === 'Ivan')

  const sp = await (async () => { await rpc('ui.openPage', 'settings'); return internal('settings') })()
  const sprpc = pageRpc(sp)
  const wrongCurrent = await sprpc('security.setPassword', 'wrong', null).then(() => 'accepted', (e) => String(e.message || e))
  check('removing the password requires the current password', /incorrect/.test(wrongCurrent), wrongCurrent)
  status = await sprpc('security.setPassword', 'correct horse 1', null)
  check('password removal falls back to the Windows-account key', status.mode === 'dpapi')
  await sleep(3500)
  await stop()

  await start(A)
  rpc = await shellReady()
  check('no password prompt after the password is removed; data intact', (await rpc('bookmarks.tree')).some((b) => b.title === 'VaultSecretTitle'))

  // forgot password -> erase and start fresh
  const sp2 = await (async () => { await rpc('ui.openPage', 'settings'); return internal('settings') })()
  await pageRpc(sp2)('security.setPassword', '', 'another secret 22')
  await sleep(3500)
  await stop()
  await start(A)
  const lock2 = await internal('unlock')
  await lock2.eval(clickText('.lock__link', 'Forgot'))
  await sleep(400)
  check('forgot-password screen warns that data cannot be recovered', /cannot be recovered/i.test(await lock2.eval('document.body.innerText')))
  await lock2.eval(`window.f2pxUnlock.reset()`)
  rpc = await shellReady()
  check('erase-and-start-fresh gives an empty profile', (await rpc('bookmarks.tree')).length === 0 && (await rpc('settings.get')).userName === '')
  await stop()

  // ───────── E. migration from a pre-encryption profile ───────────────────
  const legacy = new DatabaseSync(path.join(B, 'f2px.db'))
  legacy.exec(`
    CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', favicon TEXT, visited_at INTEGER NOT NULL);
    CREATE TABLE bookmarks (id TEXT PRIMARY KEY, parent_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', favicon TEXT, position INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE quick_access (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    CREATE TABLE downloads (id TEXT PRIMARY KEY, url TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', filename TEXT NOT NULL, save_path TEXT NOT NULL DEFAULT '', total_bytes INTEGER NOT NULL DEFAULT 0, received_bytes INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, mime TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, ended_at INTEGER, error TEXT);
    CREATE TABLE favicons (host TEXT PRIMARY KEY, url TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO history(url, title, visited_at) VALUES ('https://legacy.example/page', 'Legacy History Entry', ${Date.now()});
    INSERT INTO bookmarks VALUES ('legacy-1', NULL, 'bookmark', 'Legacy Bookmark', 'https://legacy.example/', NULL, 0, ${Date.now()});
    INSERT INTO kv VALUES ('quickAccessSeeded', 'true');
  `)
  legacy.close()
  fs.writeFileSync(path.join(B, 'settings.json'), JSON.stringify({ theme: 'light', searchEngine: 'bing', userName: 'Legacy' }))
  await start(B)
  rpc = await shellReady()
  check('old plaintext bookmarks are migrated', (await rpc('bookmarks.tree')).some((b) => b.title === 'Legacy Bookmark'))
  const set = await rpc('settings.get')
  check('old plaintext settings are migrated', set.theme === 'light' && set.searchEngine === 'bing' && set.userName === 'Legacy', JSON.stringify({ t: set.theme, e: set.searchEngine }))
  await rpc('ui.openPage', 'history')
  const hp = await internal('history')
  check('old history is migrated', (await pageRpc(hp)('history.list', {})).some((h) => h.title === 'Legacy History Entry'))
  await sleep(3500)
  await stop()
  const after = fs.readdirSync(B)
  check('plaintext database and settings are destroyed after migration', !after.includes('f2px.db') && !after.includes('settings.json') && after.includes('f2px.vault'), after.join(','))
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { await stop() } catch {}
  server.close()
  killAll()
  process.exit(process.exitCode || 0)
}
