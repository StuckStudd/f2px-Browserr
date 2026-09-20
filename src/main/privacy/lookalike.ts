import { domainToUnicode } from 'node:url'
import { registrableDomain } from './hosts'

/** Popular sites that phishers imitate. Only the registrable domain is listed. */
const BRAND_DOMAINS = [
  'google.com', 'youtube.com', 'gmail.com', 'facebook.com', 'instagram.com', 'whatsapp.com', 'messenger.com', 'microsoft.com',
  'live.com', 'outlook.com', 'office.com', 'microsoftonline.com', 'apple.com', 'icloud.com', 'amazon.com', 'paypal.com',
  'ebay.com', 'netflix.com', 'twitter.com', 'linkedin.com', 'github.com', 'gitlab.com', 'dropbox.com', 'adobe.com',
  'yahoo.com', 'telegram.org', 'discord.com', 'steamcommunity.com', 'steampowered.com', 'binance.com', 'coinbase.com',
  'blockchain.com', 'metamask.io', 'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com', 'hsbc.com',
  'americanexpress.com', 'capitalone.com', 'sberbank.ru', 'vk.com', 'yandex.ru', 'mail.ru', 'gosuslugi.ru', 'tinkoff.ru',
  'alfabank.ru', 'avito.ru', 'ozon.ru', 'wildberries.ru', 'aliexpress.com', 'alibaba.com', 'spotify.com', 'twitch.tv',
  'reddit.com', 'tiktok.com', 'snapchat.com', 'zoom.us', 'slack.com', 'docusign.com', 'wetransfer.com', 'dhl.com',
  'fedex.com', 'booking.com', 'airbnb.com', 'uber.com', 'walmart.com', 'roblox.com', 'epicgames.com', 'ubisoft.com',
  'wikipedia.org', 'cloudflare.com', 'godaddy.com', 'namecheap.com', 'stripe.com', 'shopify.com', 'openai.com', 'chatgpt.com'
]
const BRAND_LABELS = new Map(BRAND_DOMAINS.map((d) => [d.split('.')[0], d]))

/** Real, unrelated sites whose names happen to sit one edit away from a brand. */
const KNOWN_LEGIT = new Set(['paypay.ne.jp', 'paypay.jp', 'twitch.com', 'appleid.com', 'gmail.ru'])

const PHISH_WORDS = new Set(['login', 'signin', 'secure', 'verify', 'account', 'support', 'update', 'wallet', 'billing', 'auth', 'service', 'help', 'id'])

/** Characters that look like Latin letters but come from other alphabets (or digits used as letters). */
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', к: 'k', м: 'm', т: 't', в: 'b', н: 'h',
  ӏ: 'l', ɩ: 'l', ⅼ: 'l', ｏ: 'o',
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', ε: 'e', ι: 'i', κ: 'k', τ: 't', υ: 'u', β: 'b', ɡ: 'g', ı: 'i', ό: 'o'
}
const DIGIT_LOOKALIKES: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '5': 's', $: 's' }

function normalize(label: string): string {
  let out = ''
  for (const ch of label) out += CONFUSABLES[ch] ?? DIGIT_LOOKALIKES[ch] ?? ch
  return out.replace(/rn/g, 'm').replace(/vv/g, 'w')
}

/** True when the strings differ by at most one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (a.slice(i + 1) === b.slice(i + 1)) return true // one substitution
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2) // adjacent swap
  }
  const [short, long] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1)
}

const LATIN = /[a-z]/
const NON_LATIN_LETTER = /[Ͱ-ϿЀ-ԯ]/ // Greek + Cyrillic

export type LookalikeReason = { kind: 'lookalike'; brand: string } | { kind: 'idn' }

/**
 * Heuristics for deceptive addresses: typo-squatting ("paypa1.com"), brand names inside longer hosts
 * ("paypal.com.secure-login.xyz", "paypal-login.com") and mixed-alphabet internationalised names.
 */
export function checkLookalike(rawHost: string): LookalikeReason | null {
  const host = rawHost.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host) || host.includes(':')) return null
  const unicode = host.includes('xn--') ? domainToUnicode(host) : host
  const registrable = registrableDomain(unicode)
  if (KNOWN_LEGIT.has(registrable) || BRAND_DOMAINS.includes(registrable)) return null

  const label = registrable.split('.')[0]
  const brandFor = (candidate: string): string | undefined => BRAND_LABELS.get(candidate)

  // mixed alphabets inside one label (Latin + Cyrillic/Greek) are almost never legitimate
  for (const part of unicode.split('.')) {
    if (LATIN.test(part) && NON_LATIN_LETTER.test(part)) return { kind: 'idn' }
  }

  // a non-Latin label that renders like a brand ("аррӏе.com")
  const normalized = normalize(label)
  const exact = brandFor(normalized)
  if (exact && normalized !== label) return { kind: 'lookalike', brand: exact }

  // one typo away from a well-known brand
  if (normalized.length >= 6) {
    for (const [brandLabel, brandDomain] of BRAND_LABELS) {
      if (brandLabel.length >= 6 && brandLabel !== normalized && withinOneEdit(normalized, brandLabel)) return { kind: 'lookalike', brand: brandDomain }
    }
  }

  // the brand's domain used as a subdomain of something else: paypal.com.evil.xyz
  for (const brandDomain of BRAND_DOMAINS) {
    if (host.startsWith(`${brandDomain}.`) || host.includes(`.${brandDomain}.`)) return { kind: 'lookalike', brand: brandDomain }
  }

  // brand + a "trust" word: paypal-login.com, secure-google.net
  const tokens = label.split('-')
  if (tokens.length > 1) {
    const brandToken = tokens.map((t) => brandFor(t)).find(Boolean)
    if (brandToken && tokens.some((t) => PHISH_WORDS.has(t))) return { kind: 'lookalike', brand: brandToken }
  }
  return null
}
