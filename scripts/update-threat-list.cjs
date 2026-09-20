// Builds build/threats.bin (+ threats.meta.json): the malware / phishing host list bundled with F2PX.
//   npm run threats:update
//
// Sources (both open):
//   - abuse.ch URLhaus host file   (CC0)  https://urlhaus.abuse.ch/downloads/hostfile/
//   - Phishing.Database, ACTIVE    (MIT)  https://github.com/mitchellkrogza/Phishing.Database
//
// Format: a sorted little-endian Float64Array of 53-bit host hashes. It is compact (8 bytes per host) and can be
// searched without parsing. `hashHost` MUST stay identical to src/main/privacy/threatList.ts (a unit test checks it).
const fs = require('node:fs')
const path = require('node:path')

const SOURCES = [
  { name: 'urlhaus', url: 'https://urlhaus.abuse.ch/downloads/hostfile/' },
  { name: 'phishing-database', url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt' }
]

/** 53-bit hash from two FNV-1a variants; exact in a double so a Float64Array can be sorted natively. */
function hashHost(host) {
  let a = 0x811c9dc5
  let b = 0x9747b28c
  for (let i = 0; i < host.length; i++) {
    const c = host.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x85ebca6b) ^ (b >>> 13)
  }
  return (a >>> 0) * 2097152 + ((b >>> 0) & 0x1fffff)
}

const HOST = /^(?=.{4,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{1,62}$/

/** Extracts hostnames from a hosts-file or a plain domain list. */
function parseHosts(text) {
  const out = new Set()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase()
    if (!line || line.startsWith('#')) continue
    const host = line.split(/\s+/).pop().replace(/\.$/, '')
    if (HOST.test(host) && !/^\d+(\.\d+){3}$/.test(host)) out.add(host)
  }
  return out
}

function encode(hosts) {
  const hashes = new Float64Array(hosts.size)
  let i = 0
  for (const h of hosts) hashes[i++] = hashHost(h)
  hashes.sort()
  // drop duplicates (hash collisions or repeated hosts)
  let n = 0
  for (let k = 0; k < hashes.length; k++) if (k === 0 || hashes[k] !== hashes[k - 1]) hashes[n++] = hashes[k]
  return hashes.subarray(0, n)
}

module.exports = { hashHost, parseHosts, encode, SOURCES }

if (require.main === module) {
  ;(async () => {
    const all = new Set()
    const counts = {}
    for (const source of SOURCES) {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(90_000) })
      if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`)
      const hosts = parseHosts(await res.text())
      counts[source.name] = hosts.size
      for (const h of hosts) all.add(h)
      console.log(`${source.name}: ${hosts.size} hosts`)
    }
    const data = encode(all)
    const outDir = path.join(__dirname, '..', 'build')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'threats.bin'), Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    fs.writeFileSync(
      path.join(outDir, 'threats.meta.json'),
      JSON.stringify({ count: data.length, generatedAt: new Date().toISOString(), sources: counts }, null, 2)
    )
    console.log(`wrote build/threats.bin  ${data.length} hosts  ${(data.byteLength / 1048576).toFixed(1)} MB`)
  })().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
