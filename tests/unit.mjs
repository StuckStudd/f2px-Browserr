import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { check, summary, PROJECT, TMP } from './helpers/harness.mjs'

const ROOT = PROJECT
const require = createRequire(`${ROOT}/package.json`)
const esbuild = require('esbuild')

const out = await esbuild.build({
  stdin: {
    contents: `export * from './src/shared/url'; export * from './src/shared/shortcuts'; export * from './src/main/bookmarks/netscape'; export * from './src/shared/settings'; export * from './src/main/privacy/hosts'; export * from './src/main/privacy/trackerList'; export * from './src/main/privacy/lookalike'; export * from './src/main/privacy/threatHash'; export { isNewerVersion } from './src/main/system/version'; export { isDisguisedExecutable } from './src/main/utils/fsUtils'`,
    resolveDir: ROOT,
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['electron'],
  write: false
})
const file = path.join(TMP, 'unit-bundle.mjs')
fs.writeFileSync(file, out.outputFiles[0].text)
const m = await import(pathToFileURL(file).href)

// ── omnibox rules
const r = (t) => m.resolveInput(t, 'google')
check('https URL opens as-is', r('https://youtube.com').url === 'https://youtube.com/' && r('https://youtube.com').kind === 'url')
check('bare domain gets https://', r('youtube.com').url === 'https://youtube.com/')
check('single word is a search', r('youtube').kind === 'search' && r('youtube').url === 'https://www.google.com/search?q=youtube')
check('sentence (cyrillic) is a search', r('как приготовить пасту').kind === 'search' && r('как приготовить пасту').url.includes('%D0%BA%D0%B0%D0%BA'))
check('localhost:port uses http', r('localhost:3000').url === 'http://localhost:3000/')
check('IP address uses http', r('192.168.0.1/admin').url === 'http://192.168.0.1/admin')
check('domain with path + query', r('github.com/anthropics?tab=repos').url === 'https://github.com/anthropics?tab=repos')
check('javascript: is never navigated to (becomes a search)', r('javascript:alert(1)').kind === 'search')
check('data: is never navigated to', r('data:text/html,<script>alert(1)</script>').kind === 'search')
check('file:// URLs are allowed', r('file:///C:/Windows/win.ini').kind === 'url')
check('f2px:// pages are allowed', r('f2px://history').url === 'f2px://history')
check('empty input yields nothing', r('   ') === null)
check('search engines are switchable', m.resolveInput('cats', 'duckduckgo').url === 'https://duckduckgo.com/?q=cats' && m.resolveInput('cats', 'bing').url === 'https://www.bing.com/search?q=cats' && m.resolveInput('cats', 'brave').url === 'https://search.brave.com/search?q=cats')
check('normalizeWebUrl rejects non-http', m.normalizeWebUrl('javascript:alert(1)') === null && m.normalizeWebUrl('ftp://x.com') === null && m.normalizeWebUrl('example.com') === 'https://example.com/')
check('displayUrl hides home + unwraps error pages', m.displayUrlFor('f2px://home/') === '' && m.displayUrlFor(m.errorPageUrl('dns', 'https://a.b/')) === 'https://a.b/')

// ── hotkeys
const k = (key, mods = {}) => m.matchShortcut({ key, control: !!mods.c, shift: !!mods.s, alt: !!mods.a, meta: false })
const expect = { newTab: k('t', { c: 1 }), closeTab: k('w', { c: 1 }), reopenTab: k('T', { c: 1, s: 1 }), focusAddress: k('l', { c: 1 }), bookmark: k('d', { c: 1 }), history: k('h', { c: 1 }), downloads: k('j', { c: 1 }), reload: k('r', { c: 1 }), hardReload: k('R', { c: 1, s: 1 }), nextTab: k('Tab', { c: 1 }), prevTab: k('Tab', { c: 1, s: 1 }), newWindow: k('n', { c: 1 }), privateWindow: k('N', { c: 1, s: 1 }), back: k('ArrowLeft', { a: 1 }), forward: k('ArrowRight', { a: 1 }) }
for (const [action, got] of Object.entries(expect)) check(`hotkey -> ${action}`, got === action, String(got))
check('plain letters are not hotkeys', k('t') === null && k('n') === null)
check('Ctrl+Shift+Tab is NOT Ctrl+Tab', k('Tab', { c: 1, s: 1 }) === 'prevTab')
check('zoom keys', k('=', { c: 1 }) === 'zoomIn' && k('+', { c: 1, s: 1 }) === 'zoomIn' && k('-', { c: 1 }) === 'zoomOut' && k('0', { c: 1 }) === 'zoomReset')
check('AltGr-style Ctrl+Alt+T does not fire', k('t', { c: 1, a: 1 }) === null)
check('Ctrl+1..9 switch tabs', k('1', { c: 1 }) === 'tab1' && k('9', { c: 1 }) === 'lastTab')

// ── bookmark import / export
const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/?a=1&amp;b=2" ADD_DATE="1">Example &amp; Co</A>
        <DT><H3 ADD_DATE="2">Dev</H3>
        <DL><p>
            <DT><A HREF="https://github.com/">GitHub</A>
            <DT><A HREF="javascript:alert(1)">Bad</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://top.level/">Top</A>
</DL><p>`
const nodes = m.parseNetscape(chromeExport)
check('netscape: parses folders and links', nodes.length === 6, JSON.stringify(nodes.map((n) => n.type[0] + ':' + n.title)))
check('netscape: decodes entities', nodes[1].url === 'https://example.com/?a=1&b=2' && nodes[1].title === 'Example & Co')
check('netscape: nesting is preserved', nodes[2].type === 'folder' && nodes[2].parent === 0 && nodes[3].parent === 2 && nodes[5].parent === null, JSON.stringify(nodes.map((n) => n.parent)))
const tree = [
  { id: 'f', parentId: null, type: 'folder', title: 'Work & Play', url: '', favicon: null, position: 0, createdAt: 1000 },
  { id: 'b', parentId: 'f', type: 'bookmark', title: 'A <b>', url: 'https://a.com/?x=1&y="2"', favicon: null, position: 0, createdAt: 2000 }
]
const html = m.exportNetscape(tree)
const back = m.parseNetscape(html)
check('netscape: export -> import round trip', back.length === 2 && back[0].title === 'Work & Play' && back[1].title === 'A <b>' && back[1].url === 'https://a.com/?x=1&y="2"' && back[1].parent === 0, JSON.stringify(back))

// ── layout
check('chrome layout heights', m.chromeLayout({ compactMode: false, showBookmarksBar: false }).total === 80 && m.chromeLayout({ compactMode: false, showBookmarksBar: true }).total === 110 && m.chromeLayout({ compactMode: true, showBookmarksBar: false }).total === 68)
// ── privacy helpers
check('registrable domain (eTLD+1)', m.registrableDomain('a.b.example.co.uk') === 'example.co.uk' && m.registrableDomain('www.google.com') === 'google.com' && m.registrableDomain('127.0.0.1') === '127.0.0.1')
check('first-party vs third-party', !m.isThirdParty('cdn.example.com', 'example.com') && m.isThirdParty('doubleclick.net', 'news.example.org'))
check('local hosts are exempt from HTTPS upgrades', ['localhost', 'foo.localhost', '127.0.0.1', '192.168.1.5', '10.0.0.7', '172.20.0.1', 'nas', 'printer.local'].every(m.isLocalHost))
check('public hosts are not local', ['example.com', '8.8.8.8', '172.32.0.1', '11.0.0.1'].every((h) => !m.isLocalHost(h)))
check('tracker list is sane (no duplicates, strict list is separate)', new Set(m.TRACKER_HOSTS).size === m.TRACKER_HOSTS.length && m.TRACKER_HOSTS.length > 100 && !m.TRACKER_HOSTS.includes('connect.facebook.net') && m.STRICT_TRACKER_HOSTS.includes('connect.facebook.net'), String(m.TRACKER_HOSTS.length))
check('privacy-first defaults', m.DEFAULT_SETTINGS.searchEngine === 'duckduckgo' && m.DEFAULT_SETTINGS.trackerBlocking === 'standard' && m.DEFAULT_SETTINGS.httpsOnly && m.DEFAULT_SETTINGS.doNotTrack && !m.DEFAULT_SETTINGS.searchSuggestions && !m.DEFAULT_SETTINGS.spellcheck)

// ── threat protection
const threatScript = require(`${ROOT}/scripts/update-threat-list.cjs`)
const sampleHosts = ['evil.example', 'paypa1-login.xyz', 'a.b.c.malware-host.ru', 'xn--80ak6aa92e.com', 'x_y.test-site.info']
check('threat hash: build script and app agree', sampleHosts.every((h) => threatScript.hashHost(h) === m.hashHost(h)))
check('threat hash: fits in 53 bits', sampleHosts.every((h) => Number.isSafeInteger(m.hashHost(h))))
const parsed = m.parseHosts('# comment\n127.0.0.1 evil.example\n0.0.0.0\tbad.site.ru\nplain.net\n1.2.3.4\nnot a host\n\nEVIL.example')
check('threat list parser: hosts file + plain lines, no IPs/comments', [...parsed].sort().join(',') === 'bad.site.ru,evil.example,plain.net', [...parsed].join(','))
const enc = m.encodeHosts(['b.example', 'a.example', 'a.example'])
check('threat list encoder: sorted and de-duplicated', enc.length === 2 && enc[0] < enc[1])
const bundled = fs.readFileSync(`${ROOT}/build/threats.bin`)
check('bundled threat list is present and sane', bundled.length % 8 === 0 && bundled.length / 8 > 50_000, String(bundled.length / 8))
const bundledHashes = new Float64Array(bundled.buffer.slice(bundled.byteOffset, bundled.byteOffset + bundled.length))
check('bundled threat list is sorted', bundledHashes.every((v, i) => i === 0 || bundledHashes[i - 1] < v))

const look = (h) => m.checkLookalike(h)
for (const bad of ['paypa1.com', 'g00gle.com', 'paypal.com.evil.xyz', 'paypal-login.com', 'faceboook.com', 'micros0ft.com', 'arnazon.com', 'secure-google.net']) {
  check(`look-alike flagged: ${bad}`, look(bad)?.kind === 'lookalike', JSON.stringify(look(bad)))
}
check('look-alike names the imitated brand', look('paypa1.com')?.brand === 'paypal.com' && look('paypal.com.evil.xyz')?.brand === 'paypal.com')
check('mixed-alphabet host flagged (IDN)', look('gооgle.com')?.kind === 'idn' || look('xn--ggle-55da.com') !== null, JSON.stringify(look('gооgle.com')))
check('all-Cyrillic homograph of a brand flagged', look('аррӏе.com')?.kind === 'lookalike', JSON.stringify(look('аррӏе.com')))
for (const good of ['google.com', 'www.google.com', 'mail.google.com', 'github.io', 'yahoo.co.jp', 'live.com', 'example.com', 'paypay.ne.jp', 'twitch.tv', 'ru.wikipedia.org', '192.168.0.1', 'localhost', 'мой-сайт.рф']) {
  check(`not flagged: ${good}`, look(good) === null, JSON.stringify(look(good)))
}
check('withinOneEdit', m.withinOneEdit('paypal', 'paypa1') && m.withinOneEdit('google', 'gogle') && m.withinOneEdit('google', 'gooogle') && m.withinOneEdit('amazon', 'amazno') && !m.withinOneEdit('paypal', 'pepsi') && !m.withinOneEdit('google', 'goggles'))

// ── update notification + downloads
check('version comparison', m.isNewerVersion('1.0.1', '1.0.0') && m.isNewerVersion('1.2.10', '1.2.9') && m.isNewerVersion('2.0.0', '1.9.9') && !m.isNewerVersion('1.0.0', '1.0.0') && !m.isNewerVersion('0.9.9', '1.0.0'))
check('version comparison ignores garbage', !m.isNewerVersion('latest', '1.0.0') && !m.isNewerVersion('1.0', '1.0.0') && !m.isNewerVersion('1.0.1-beta', '1.0.0') && !m.isNewerVersion('1.0.1', 'x'))
check('disguised executables', m.isDisguisedExecutable('invoice.pdf.exe') && m.isDisguisedExecutable('Photo.JPG.scr') && m.isDisguisedExecutable('report.docx.js') && !m.isDisguisedExecutable('setup.exe') && !m.isDisguisedExecutable('archive.zip') && !m.isDisguisedExecutable('notes.pdf'))
check('threat protection defaults', m.DEFAULT_SETTINGS.threatProtection === true && m.DEFAULT_SETTINGS.protectionUpdates === false && m.DEFAULT_SETTINGS.checkUpdates === false && m.DEFAULT_SETTINGS.dnsProvider === 'quad9')
summary()
