// Builds build/filters.txt.gz (+ filters.meta.json): the content-blocking lists bundled with F2PX.
//   npm run filters:update
//
// Sources are listed in src/main/privacy/filterSources.json (EasyList, EasyPrivacy, uBlock filters, RU AdList).
// Each line is written as "<tag>\t<rule>" (tag 1 = ads, 2 = trackers, 0 = exceptions for both), comments and rule kinds the
// engine cannot use (scriptlets, response rewriting …) are dropped so the bundle stays small and quick to parse.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SOURCES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'privacy', 'filterSources.json'), 'utf8'))

/** Kept in sync with the engine: rules containing these can never be used, so they are not shipped. */
const UNUSABLE = /(#\?#|#\$#|#%#|#@\?#|#@\$#|##\+js\(|##\^|\$(?:.*,)?(?:removeparam|queryprune|csp|replace|header|permissions|urltransform)\b|,(?:removeparam|csp|replace|header|permissions)\b)/i

function condense(text, tag) {
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('!') || line.startsWith('[Adblock') || line.length > 1000) continue
    if (UNUSABLE.test(line)) continue
    out.push(`${tag}\t${line}`)
  }
  return out
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

module.exports = { condense, SOURCES }

if (require.main === module) {
  ;(async () => {
    const seen = new Set()
    const lines = []
    const counts = {}
    for (const source of SOURCES) {
      process.stdout.write(`${source.name} … `)
      const text = await download(source.url)
      const list = condense(text, source.tag)
      let added = 0
      for (const l of list) {
        if (seen.has(l)) continue
        seen.add(l)
        lines.push(l)
        added++
      }
      counts[source.id] = added
      console.log(`${added.toLocaleString('en-US')} rules`)
    }
    if (lines.length < 50_000) throw new Error('Result looks incomplete, not writing it')
    const buildDir = path.join(__dirname, '..', 'build')
    fs.writeFileSync(path.join(buildDir, 'filters.txt.gz'), zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'), { level: 9 }))
    fs.writeFileSync(
      path.join(buildDir, 'filters.meta.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), rules: lines.length, sources: counts }, null, 2)
    )
    console.log(`\nWrote build/filters.txt.gz (${lines.length.toLocaleString('en-US')} rules)`)
  })().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
