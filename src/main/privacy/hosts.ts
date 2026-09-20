/** Second-level public suffixes that need three labels to form a registrable domain (small, pragmatic list). */
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.hk', 'com.tw', 'com.tr', 'com.mx', 'com.ar', 'co.in', 'co.za', 'co.kr', 'com.ua', 'com.sg', 'com.my'
])

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** eTLD+1 approximation, good enough to tell first-party from third-party. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (IPV4.test(h) || h.includes(':')) return h
  const parts = h.split('.')
  if (parts.length <= 2) return h
  const lastTwo = parts.slice(-2).join('.')
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo
}

export function isThirdParty(requestHost: string, pageHost: string): boolean {
  return registrableDomain(requestHost) !== registrableDomain(pageHost)
}

/** Loopback, private ranges, `.local` and dot-less intranet names: HTTPS upgrades would only break these. */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true
  if (!h.includes('.') && !h.includes(':')) return true
  if (IPV4.test(h)) {
    const [a, b] = h.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')
}
