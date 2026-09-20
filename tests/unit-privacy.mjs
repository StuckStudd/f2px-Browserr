// Unit tests for the privacy modules (filter engine, presets, request policy helpers).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { check, summary, PROJECT, TMP } from './helpers/harness.mjs'

const require = createRequire(`${PROJECT}/package.json`)
const esbuild = require('esbuild')

const out = await esbuild.build({
  stdin: {
    contents: [
      "export * from './src/main/privacy/filterEngine'",
      "export * from './src/shared/privacy'",
      "export * from './src/shared/settings'",
      "export * from './src/main/privacy/hosts'",
      "export * from './src/main/privacy/policy'",
      "export * from './src/main/privacy/siteRules'",
      "export * from './src/main/privacy/counters'",
      "export * from './src/main/network/route'",
      "export * from './src/main/network/torService'",
      "export * from './src/main/network/faviconService'"
    ].join(';'),
    resolveDir: PROJECT,
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['electron'],
  write: false
})
const file = path.join(TMP, 'unit-privacy-bundle.mjs')
fs.writeFileSync(file, out.outputFiles[0].text)
const m = await import(pathToFileURL(file).href)

// ── filter engine ────────────────────────────────────────────────────────────
function engineOf(...lines) {
  const e = new m.FilterEngine()
  for (const l of lines) e.addLine(l)
  e.finish()
  return e
}
const req = (url, type = 'script', page = 'example.com') => {
  const u = new URL(url)
  const host = u.hostname
  const tp = m.registrableDomain(host) !== m.registrableDomain(page)
  return { url, host, type: m.T[type], pageHost: page, thirdParty: tp }
}

let e = engineOf('||ads.example.net^')
check('filter: host-anchored rule blocks the host', e.match(req('https://ads.example.net/x.js')) === 'block')
check('filter: host-anchored rule blocks subdomains', e.match(req('https://a.b.ads.example.net/x.js')) === 'block')
check('filter: host-anchored rule does not match a longer name', e.match(req('https://notads.example.net/x.js')) === null && e.match(req('https://ads.example.network/x.js')) === null)
check('filter: separator ^ ends at path/query', e.match(req('https://ads.example.net:8080/x')) === 'block' && e.match(req('https://ads.example.net?x=1')) === 'block')

e = engineOf('||tracker.test^$third-party')
check('filter: $third-party only blocks third-party', e.match(req('https://tracker.test/p.gif', 'image', 'site.com')) === 'block' && e.match(req('https://tracker.test/p.gif', 'image', 'tracker.test')) === null)

e = engineOf('/banner/*/img^')
check('filter: wildcard + separator', e.match(req('https://x.com/banner/300/img?a')) === 'block' && e.match(req('https://x.com/banner/300/imgx')) === null)

e = engineOf('/adframe.', '|https://cdn.', 'swf|')
check(
  'filter: plain substring, start anchor, end anchor',
  e.match(req('https://a.com/adframe.html')) === 'block' &&
    e.match(req('https://cdn.a.com/x')) === 'block' &&
    e.match(req('http://cdn.a.com/x')) === null &&
    e.match(req('https://a.com/movie.swf')) === 'block' &&
    e.match(req('https://a.com/movie.swf?x')) === null
)

e = engineOf('||example.org^$script,image')
check('filter: resource type options', e.match(req('https://example.org/a.js', 'script')) === 'block' && e.match(req('https://example.org/a.css', 'stylesheet')) === null)
e = engineOf('||example.org^$~script')
check('filter: negated type', e.match(req('https://example.org/a.js', 'script')) === null && e.match(req('https://example.org/a.png', 'image')) === 'block')

e = engineOf('||ads.example.net^', '@@||ads.example.net/allowed^')
check('filter: exception rules win', e.match(req('https://ads.example.net/allowed/x.js')) === 'allow' && e.match(req('https://ads.example.net/other.js')) === 'block')
e = engineOf('||ads.example.net^$important', '@@||ads.example.net^')
check('filter: $important beats a plain exception', e.match(req('https://ads.example.net/a.js')) === 'block')

e = engineOf('||promo.example.com^$domain=news.com|~sports.news.com')
check(
  'filter: $domain include / exclude',
  e.match(req('https://promo.example.com/a', 'script', 'news.com')) === 'block' &&
    e.match(req('https://promo.example.com/a', 'script', 'other.com')) === null &&
    e.match(req('https://promo.example.com/a', 'script', 'sports.news.com')) === null
)

e = engineOf('/^https?:\\/\\/[a-z]{5}\\.evil\\.test\\//')
check('filter: regex rules', e.match(req('https://abcde.evil.test/x')) === 'block' && e.match(req('https://abc.evil.test/x')) === null)

e = engineOf('||cdn.example.com^$denyallow=static.example.com')
check('filter: denyallow', e.match(req('https://cdn.example.com/a.js')) === 'block')

e = engineOf('||blocked.test^$removeparam=x', '||b2.test^$csp=script-src none', '||b3.test^$unknown-option', '||b4.test^$redirect=noopjs')
check(
  'filter: rules needing rewriting are skipped, redirects become blocks',
  e.match(req('https://blocked.test/a')) === null && e.match(req('https://b2.test/a')) === null && e.match(req('https://b3.test/a')) === null && e.match(req('https://b4.test/a')) === 'block'
)

e = engineOf('||main.test^')
check('filter: ordinary rules never block the page itself', e.match(req('https://main.test/', 'document', 'main.test')) === null)
e = engineOf('||main.test^$document')
check('filter: $document rules do block navigations', e.match(req('https://main.test/', 'document', 'main.test')) === 'block')

e = engineOf('||site.test^$badfilter', '||site.test^')
check('filter: $badfilter cancels the rule', e.match(req('https://site.test/a')) === null)

e = engineOf('@@||friendly.test^$document', '||ads.example.net^')
check('filter: $document exceptions exempt a page', e.isPageAllowed('https://friendly.test/', 'friendly.test') && !e.isPageAllowed('https://other.test/', 'other.test'))

e = engineOf('! comment', '[Adblock Plus 2.0]', '', '   ', '#', '||')
check('filter: comments and junk are ignored', e.stats.network === 0)

// cosmetic
e = engineOf('##.ad-banner', 'example.com##.sponsored', 'example.com#@#.ad-banner', '##div:has-text(Ad)', '##+js(aopr, x)', '##a[href="x"]')
const generic = e.cosmeticCssFor('other.com', true)
check('cosmetic: generic selectors apply everywhere', generic.includes('.ad-banner{display:none!important}') && generic.includes('a[href="x"]'))
check('cosmetic: procedural selectors and scriptlets are skipped', !generic.includes('has-text') && !generic.includes('aopr'))
const specific = e.cosmeticCssFor('www.example.com', true)
check('cosmetic: site rules apply to subdomains, exceptions remove generic ones', specific.includes('.sponsored{display:none!important}') && !specific.includes('.ad-banner'))
check('cosmetic: generic can be switched off', !e.cosmeticCssFor('other.com', false).includes('.ad-banner'))
e = engineOf('##.ad', '@@||nohide.test^$generichide')
check('cosmetic: $generichide exempts a site', e.cosmeticCssFor('nohide.test', true) === '' && e.cosmeticCssFor('x.test', true).includes('.ad'))
e = engineOf('##a{color:red}', '##div[onclick="x"', '##)(')
check('cosmetic: selectors that could break the stylesheet are dropped', e.cosmeticCssFor('x.test', true) === '')

// a realistic mini-list
e = engineOf(
  '||doubleclick.net^',
  '||googlesyndication.com^$third-party',
  '/ads/*$image,script,third-party',
  '||example.com/ads/',
  '-banner-ad-',
  '@@||example.com/ads/allowed.js$script',
  '||pagead2.googlesyndication.com^$important'
)
check(
  'filter: realistic mix',
  e.match(req('https://securepubads.g.doubleclick.net/gampad/ads?x', 'script', 'news.com')) === 'block' &&
    e.match(req('https://example.com/ads/allowed.js', 'script', 'example.com')) === 'allow' &&
    e.match(req('https://example.com/ads/other.js', 'script', 'example.com')) === 'block' &&
    e.match(req('https://cdn.site.com/a-banner-ad-1.png', 'image', 'site.com')) === 'block' &&
    e.match(req('https://cdn.site.com/readme.png', 'image', 'site.com')) === null
)

// ── privacy levels ───────────────────────────────────────────────────────────
const base = { ...m.DEFAULT_SETTINGS }
check('levels: defaults are the standard level', m.detectPrivacyLevel(base) === 'standard')
const strict = { ...base, ...m.privacyLevelPatch(base, 'strict') }
check('levels: strict preset is detected', m.detectPrivacyLevel(strict) === 'strict' && strict.blockThirdPartyCookies && strict.fingerprintProtection === 'strict')
const anon = { ...base, ...m.privacyLevelPatch(base, 'anonymous') }
check('levels: anonymous routes through Tor and clears data on exit', m.detectPrivacyLevel(anon) === 'anonymous' && anon.proxyMode === 'tor' && anon.clearCookiesOnExit && anon.clearHistoryOnExit)
check('levels: leaving anonymous restores the system proxy', m.privacyLevelPatch(anon, 'standard').proxyMode === 'system' && m.privacyLevelPatch(base, 'strict').proxyMode === undefined)
check('levels: changing one switch makes the level custom', m.detectPrivacyLevel({ ...strict, adBlocking: false }) === 'custom' && m.detectPrivacyLevel({ ...base, httpsOnly: false }) === 'custom')
check('levels: a custom proxy does not change the level', m.detectPrivacyLevel({ ...base, proxyMode: 'custom' }) === 'standard')
check('levels: strict + Tor without strict DNS is custom, not anonymous', m.detectPrivacyLevel({ ...strict, proxyMode: 'tor' }) === 'custom')

// ── settings / search engines
check(
  'search engines: privacy engines exist and use https',
  ['duckduckgo', 'brave', 'startpage', 'qwant', 'mojeek'].every((id) => m.SEARCH_ENGINES[id]?.searchUrl.startsWith('https://') && m.SEARCH_ENGINES[id].searchUrl.includes('%s'))
)
check('settings: new privacy defaults', base.adBlocking && base.cosmeticFiltering && base.fingerprintProtection === 'standard' && base.proxyMode === 'system' && !base.blockThirdPartyCookies)

// ── request policy per session kind
const pol = (over = {}, kind = 'normal') => m.policyFor({ ...base, ...over }, kind)
check('policy: "Block trackers: Off" switches filter lists and element hiding off too', pol({ trackerBlocking: 'off' }).ads === false && pol({ trackerBlocking: 'off' }).cosmetic === false && pol({ trackerBlocking: 'standard' }).ads === true)
check('policy: normal windows follow the settings', pol({ adBlocking: false }).ads === false && pol({ fingerprintProtection: 'off' }).fingerprint === 'off' && pol().sendDnt === true)
const tor = pol({ adBlocking: false, fingerprintProtection: 'off', blockThirdPartyCookies: false, trackerBlocking: 'off' }, 'tor')
check('policy: Tor windows are always strict, whatever the settings say', tor.ads && tor.fingerprint === 'strict' && tor.blockThirdPartyCookies && tor.stripReferrer && tor.trackers === 'strict' && tor.webrtc === 'proxy-only')
check('policy: Tor windows send no DNT/GPC (fewer distinguishing headers) and ignore site exceptions', tor.sendDnt === false && tor.allowExceptions === false && pol().allowExceptions === true)

// ── network route configuration (fail closed)
const fakeSettings = (over) => ({ get: () => ({ ...base, ...over }), onChange: { on: () => () => undefined } })
const fakeTor = (proxy) => ({ proxy: () => proxy, require: () => undefined, release: () => undefined, onChange: { on: () => () => undefined } })
const routeOf = (over, proxy = null) => new m.NetworkRoute(fakeSettings(over), fakeTor(proxy))
check('route: system and direct', routeOf({}).configFor('normal').mode === 'system' && routeOf({ proxyMode: 'direct' }).configFor('normal').mode === 'direct')
check('route: custom proxy is used as typed', routeOf({ proxyMode: 'custom', proxyUrl: 'socks5://10.0.0.2:1080' }).configFor('normal').proxyRules === 'socks5://10.0.0.2:1080')
check('route: custom proxy without an address never means direct', routeOf({ proxyMode: 'custom', proxyUrl: '' }).configFor('normal').proxyRules === m.DEAD_PROXY)
check(
  'route: Tor mode uses the Tor proxy and does not bypass loopback',
  routeOf({ proxyMode: 'tor' }, 'socks5://127.0.0.1:9150').configFor('normal').proxyRules === 'socks5://127.0.0.1:9150' &&
    routeOf({ proxyMode: 'tor' }, 'socks5://127.0.0.1:9150').configFor('normal').proxyBypassRules === '<-loopback>'
)
check('route: Tor mode without a Tor client fails closed', routeOf({ proxyMode: 'tor' }, null).configFor('normal').proxyRules === m.DEAD_PROXY)
check(
  'route: a Tor window is Tor even when the main route is direct',
  routeOf({ proxyMode: 'direct' }, 'socks5://127.0.0.1:9050').configFor('tor').proxyRules === 'socks5://127.0.0.1:9050' && routeOf({ proxyMode: 'system' }, null).configFor('tor').proxyRules === m.DEAD_PROXY
)
check('route: status describes the mode', routeOf({ proxyMode: 'custom', proxyUrl: 'http://p:8080' }).status().route === 'custom' && routeOf({}).status().route === 'system')

// ── site rules / permissions (in-memory fake of the vault database)
const fakeDb = () => {
  const kv = new Map()
  return { getKv: (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), setKv: (k, v) => kv.set(k, JSON.stringify(v)) }
}
let db = fakeDb()
let rules = new m.SiteRules(db)
check('site rules: nothing is excepted by default', !rules.shieldsOff('www.example.com') && !rules.cookiesAllowed('example.com'))
rules.setShields('news.example.co.uk', false)
check('site rules: exceptions apply to the whole site (registrable domain)', rules.shieldsOff('www.news.example.co.uk') && rules.shieldsOff('example.co.uk') && !rules.shieldsOff('other.co.uk'))
rules.setCookiesAllowed('login.example.com', true)
check('site rules: cookie exception is per site', rules.cookiesAllowed('example.com') && !rules.cookiesAllowed('example.org'))
rules.setShields('example.co.uk', true)
check('site rules: turning the shield back on removes the exception', !rules.shieldsOff('example.co.uk') && rules.exceptions().every((e) => e.site !== 'example.co.uk'))
rules.setPermission('https://meet.example.com', 'media', 'allow', true)
rules.setPermission('https://meet.example.com', 'notifications', 'block', true)
rules.setPermission('https://private.example.com', 'media', 'allow', false)
check(
  'permissions: remembered answers are returned, unknown ones are not',
  rules.permission('https://meet.example.com', 'media', true) === 'allow' && rules.permission('https://meet.example.com', 'notifications', true) === 'block' && rules.permission('https://other.example.com', 'media', true) === undefined
)
check('permissions: private answers are kept in memory only', rules.permission('https://private.example.com', 'media', false) === 'allow' && rules.listPermissions().every((p) => p.origin !== 'https://private.example.com'))
rules = new m.SiteRules(db)
check('permissions & exceptions survive a restart', rules.permission('https://meet.example.com', 'media', true) === 'allow' && rules.cookiesAllowed('example.com') && rules.permission('https://private.example.com', 'media', false) === undefined)
rules.resetPermission('https://meet.example.com', 'media')
check('permissions: a single answer can be reset', rules.permission('https://meet.example.com', 'media', true) === undefined && rules.permission('https://meet.example.com', 'notifications', true) === 'block')
rules.clear({ permissions: true, exceptions: false })
check('permissions: clear removes them but keeps exceptions', rules.listPermissions().length === 0 && rules.cookiesAllowed('example.com'))
const corrupt = fakeDb()
corrupt.setKv('siteRules', { 'ok.example': { shieldsOff: true }, '<script>': { shieldsOff: true }, 'bad.example': 'x' })
corrupt.setKv('sitePermissions', { 'https://a.example': { media: 'allow', evil: 'maybe' }, 'javascript:1': { media: 'allow' } })
const clean = new m.SiteRules(corrupt)
check('site rules: corrupt stored data is sanitised', clean.shieldsOff('ok.example') && clean.exceptions().length === 1 && clean.listPermissions().length === 1)

// ── counters
db = fakeDb()
db.setKv('blockedTotal', 41)
let counters = new m.PrivacyCounters(db)
check('counters: the older single tracker counter is carried over', counters.total.trackers === 41 && counters.blockedTotal() === 41)
counters.add('ads')
counters.add('ads')
counters.add('fingerprint')
check('counters: session and total both count, blockedTotal = ads + trackers', counters.session.ads === 2 && counters.total.ads === 2 && counters.blockedTotal() === 43 && counters.total.fingerprint === 1)
counters.flush()
counters = new m.PrivacyCounters(db)
check('counters: totals persist, the session restarts', counters.total.ads === 2 && counters.session.ads === 0)
counters.reset()
check('counters: reset', counters.total.ads === 0 && new m.PrivacyCounters(db).total.trackers === 0)

// ── Tor helpers
const probe = (await import('node:net')).createServer().listen(0, '127.0.0.1')
await new Promise((r) => probe.once('listening', r))
const openPort = probe.address().port
check('tor: reachability probe sees an open port and a closed one', (await m.isReachable(`socks5://127.0.0.1:${openPort}`)) === true && (await m.isReachable('socks5://127.0.0.1:9')) === false && (await m.isReachable('nonsense')) === false)
probe.close()

// ── favicon service
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
let fetches = 0
const fakeSession = (handler) => ({
  fetch: async (url, init) => {
    fetches++
    return handler(url, init)
  }
})
const okImage = (type = 'image/gif', body = gif) => new Response(body, { status: 200, headers: { 'Content-Type': type } })
const fav = new m.FaviconService()
const icon = await fav.data(fakeSession(() => okImage()), 'normal', 'https://a.example/favicon.ico')
check('favicons: an image becomes a data URL', typeof icon === 'string' && icon.startsWith('data:image/gif;base64,'))
await fav.data(fakeSession(() => okImage()), 'normal', 'https://a.example/favicon.ico')
check('favicons: results are cached', fetches === 1)
await fav.data(fakeSession(() => okImage()), 'tor', 'https://a.example/favicon.ico')
check('favicons: the cache is separate per kind of window (a Tor icon is fetched through Tor)', fetches === 2)
check('favicons: non-images are refused', (await fav.data(fakeSession(() => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })), 'normal', 'https://b.example/x')) === null)
check('favicons: oversized files are refused', (await fav.data(fakeSession(() => okImage('image/png', Buffer.alloc(200 * 1024))), 'normal', 'https://c.example/big.png')) === null)
check(
  'favicons: only http(s) and data images are handled',
  (await fav.data(fakeSession(() => okImage()), 'normal', 'file:///C:/x.ico')) === null &&
    (await fav.data(fakeSession(() => okImage()), 'normal', 'javascript:alert(1)')) === null &&
    (await fav.data(fakeSession(() => okImage()), 'normal', 'data:image/png;base64,AAAA')) === 'data:image/png;base64,AAAA'
)
check(
  'favicons: a failing server gives null, not an exception',
  (await fav.data(
    fakeSession(() => {
      throw new Error('boom')
    }),
    'normal',
    'https://d.example/x.ico'
  )) === null
)

// ── hardening: a filter list must not be able to hurt the browser
e = engineOf('/(a+)+$/', '/(x*)*y/', '/' + 'a'.repeat(400) + '/', '||safe.test^')
check('filter: catastrophic and oversized regex rules are refused', e.stats.network === 1)
e = engineOf('##@import url(https://evil.test/x.css)', '##a[href^="x"]', '##div{background:url(x)}', '##b /* c */', '##.ok-selector')
const hardened = e.cosmeticCssFor('x.test', true)
check('cosmetic: at-rules, url() and comments never reach the stylesheet', !/@import|url\(|evil|\/\*/.test(hardened) && hardened.includes('.ok-selector') && hardened.includes('a[href^="x"]'), hardened)

summary()
