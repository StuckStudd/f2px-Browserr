/**
 * Known malware / phishing hosts (URLhaus + Phishing.Database), stored as a sorted Float64Array of 53-bit hashes:
 * ~8 bytes per host instead of tens of MB of strings. The hash MUST match scripts/update-threat-list.cjs.
 */
export function hashHost(host: string): number {
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

export function parseHosts(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase()
    if (!line || line.startsWith('#')) continue
    const host = (line.split(/\s+/).pop() ?? '').replace(/\.$/, '')
    if (HOST.test(host) && !/^\d+(\.\d+){3}$/.test(host)) out.add(host)
  }
  return out
}

export function encodeHosts(hosts: Iterable<string>): Float64Array {
  const list = [...hosts]
  const hashes = new Float64Array(list.length)
  list.forEach((h, i) => (hashes[i] = hashHost(h)))
  hashes.sort()
  let n = 0
  for (let k = 0; k < hashes.length; k++) if (k === 0 || hashes[k] !== hashes[k - 1]) hashes[n++] = hashes[k]
  return hashes.slice(0, n)
}
