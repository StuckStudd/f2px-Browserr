/**
 * A content-blocking engine for the Adblock Plus / uBlock Origin filter syntax (EasyList, EasyPrivacy, uBlock filters …).
 *
 * Supported: network rules (`||host^`, `|start`, `end|`, `*`, `^`, `/regex/`, `@@` exceptions) with the options
 * `third-party`, resource types, `domain=`, `important`, `match-case`, `badfilter`, `denyallow`, and element hiding
 * (`##selector`, `domain##selector`, `#@#` exceptions). Rules that need scripting or response rewriting
 * (`removeparam`, `csp`, `replace`, scriptlets, procedural cosmetics …) are skipped rather than approximated.
 *
 * Speed matters — `match` runs for every sub-resource request — so rules are indexed instead of scanned:
 * host-anchored rules by hostname, everything else by a rare URL token, and only tokenless rules are scanned linearly.
 */

export const T = {
  script: 1,
  image: 2,
  stylesheet: 4,
  xhr: 8,
  subdocument: 16,
  ping: 32,
  media: 64,
  font: 128,
  object: 256,
  websocket: 512,
  other: 1024,
  document: 2048
} as const

const ALL_SUBRESOURCES = T.script | T.image | T.stylesheet | T.xhr | T.subdocument | T.ping | T.media | T.font | T.object | T.websocket | T.other

const TYPE_NAMES: Record<string, number> = {
  script: T.script,
  image: T.image,
  stylesheet: T.stylesheet,
  css: T.stylesheet,
  xmlhttprequest: T.xhr,
  xhr: T.xhr,
  subdocument: T.subdocument,
  frame: T.subdocument,
  ping: T.ping,
  beacon: T.ping,
  media: T.media,
  font: T.font,
  object: T.object,
  'object-subrequest': T.object,
  websocket: T.websocket,
  other: T.other,
  'csp_report': T.other,
  document: T.document,
  doc: T.document
}

/** Electron `resourceType` → filter type. */
export function typeOfResource(resourceType: string): number {
  switch (resourceType) {
    case 'mainFrame':
      return T.document
    case 'subFrame':
      return T.subdocument
    case 'stylesheet':
      return T.stylesheet
    case 'script':
      return T.script
    case 'image':
      return T.image
    case 'font':
      return T.font
    case 'object':
      return T.object
    case 'xhr':
      return T.xhr
    case 'ping':
      return T.ping
    case 'media':
      return T.media
    case 'webSocket':
      return T.websocket
    default:
      return T.other
  }
}

interface NetRule {
  /** Lower-cased pattern without anchors (unless `matchCase`). */
  pattern: string
  literal: boolean
  hostAnchor: boolean
  startAnchor: boolean
  endAnchor: boolean
  regex: RegExp | null
  types: number
  /** 0 any, 1 third-party only, 2 first-party only */
  party: 0 | 1 | 2
  domains: string[] | null
  notDomains: string[] | null
  denyAllow: string[] | null
  important: boolean
  matchCase: boolean
  /** Which list the rule came from (1 ads, 2 trackers, 0 unknown) — only used for statistics. */
  tag: number
}

export interface MatchRequest {
  url: string
  /** Lower-cased hostname of the requested URL. */
  host: string
  type: number
  /** Lower-cased hostname of the top-level page ('' when unknown). */
  pageHost: string
  thirdParty: boolean
}

export type Verdict = 'block' | 'allow' | null

const SEPARATOR = '(?:[^\\w\\-.%\\u0080-\\uFFFF]|$)'
const HOST_PREFIX = '^[a-z][a-z0-9+.-]*:\\/\\/(?:[^/?#]*\\.)?'

function escapeRegex(text: string): string {
  return text.replace(/[.+?${}()|[\]\\]/g, '\\$&')
}

function patternToRegex(pattern: string, hostAnchor: boolean, startAnchor: boolean, endAnchor: boolean, matchCase: boolean): RegExp | null {
  let body = ''
  for (const ch of pattern) {
    if (ch === '*') body += '.*'
    else if (ch === '^') body += SEPARATOR
    else body += escapeRegex(ch)
  }
  const source = `${hostAnchor ? HOST_PREFIX : startAnchor ? '^' : ''}${body}${endAnchor ? '$' : ''}`
  try {
    return new RegExp(source, matchCase ? '' : 'i')
  } catch {
    return null
  }
}

/** Picks a token that must appear as a whole alphanumeric run in every URL the pattern can match. */
function pickToken(rule: NetRule): string | null {
  const p = rule.pattern
  let best: string | null = null
  const re = /[a-z0-9]{3,}/g
  for (let m = re.exec(p); m; m = re.exec(p)) {
    const start = m.index
    const end = start + m[0].length
    const before = start === 0 ? (rule.startAnchor ? '|' : '*') : p[start - 1]
    const after = end === p.length ? (rule.endAnchor ? '|' : '*') : p[end]
    // A wildcard next to the token means the URL's own run may be longer than the token.
    if (before === '*' || after === '*') continue
    if (!best || m[0].length > best.length) best = m[0]
  }
  return best
}

const URL_TOKEN = /[a-z0-9]+/g

function urlTokens(url: string): string[] {
  const out = new Set<string>()
  const matches = url.match(URL_TOKEN)
  if (!matches) return []
  for (const token of matches) {
    if (token.length >= 3) out.add(token)
    if (out.size >= 96) break
  }
  return [...out]
}

function hostMatchesList(host: string, list: string[]): boolean {
  for (const d of list) if (host === d || host.endsWith(`.${d}`)) return true
  return false
}

class RuleIndex {
  private readonly hosts = new Map<string, NetRule[]>()
  private readonly tokens = new Map<string, NetRule[]>()
  private readonly generic: NetRule[] = []
  count = 0

  add(rule: NetRule): void {
    this.count++
    if (rule.hostAnchor) {
      const domain = /^[a-z0-9.-]+/.exec(rule.pattern)?.[0] ?? ''
      const next = rule.pattern[domain.length]
      // `||example.com^`, `||example.com/path`, `||example.com:8080` — the host is a complete label sequence
      if (domain.includes('.') && (next === undefined || next === '^' || next === '/' || next === ':' || next === '?' || next === '*') && !domain.endsWith('.')) {
        // '*' right after the host (`||example.com*ad`) still pins the host, but `||ex*.com` never gets here
        const list = this.hosts.get(domain)
        if (list) list.push(rule)
        else this.hosts.set(domain, [rule])
        return
      }
    }
    const token = rule.regex ? null : pickToken(rule)
    if (token) {
      const list = this.tokens.get(token)
      if (list) list.push(rule)
      else this.tokens.set(token, [rule])
    } else {
      this.generic.push(rule)
    }
  }

  /** First rule that matches, or null. `wantImportant` restricts the search to `$important` rules. */
  find(req: MatchRequest, lowerUrl: string, wantImportant = false): NetRule | null {
    // host-anchored rules: walk the hostname's suffixes
    for (let h = req.host; h; ) {
      const list = this.hosts.get(h)
      if (list) for (const r of list) if ((!wantImportant || r.important) && ruleMatches(r, req, lowerUrl)) return r
      const dot = h.indexOf('.')
      if (dot < 0) break
      h = h.slice(dot + 1)
    }
    for (const token of urlTokens(lowerUrl)) {
      const list = this.tokens.get(token)
      if (list) for (const r of list) if ((!wantImportant || r.important) && ruleMatches(r, req, lowerUrl)) return r
    }
    for (const r of this.generic) if ((!wantImportant || r.important) && ruleMatches(r, req, lowerUrl)) return r
    return null
  }
}

function ruleMatches(r: NetRule, req: MatchRequest, lowerUrl: string): boolean {
  if ((r.types & req.type) === 0) return false
  if (r.party === 1 && !req.thirdParty) return false
  if (r.party === 2 && req.thirdParty) return false
  if (r.domains && !(req.pageHost && hostMatchesList(req.pageHost, r.domains))) return false
  if (r.notDomains && req.pageHost && hostMatchesList(req.pageHost, r.notDomains)) return false
  if (r.denyAllow && hostMatchesList(req.host, r.denyAllow)) return false

  const url = r.matchCase ? req.url : lowerUrl
  if (r.literal && !r.hostAnchor) {
    const p = r.pattern
    if (r.startAnchor && r.endAnchor) return url === p
    if (r.startAnchor) return url.startsWith(p)
    if (r.endAnchor) return url.endsWith(p)
    return url.includes(p)
  }
  if (!r.regex) {
    r.regex = patternToRegex(r.pattern, r.hostAnchor, r.startAnchor, r.endAnchor, r.matchCase)
    if (!r.regex) {
      r.types = 0 // unusable pattern: never matches again
      return false
    }
  }
  return r.regex.test(url)
}

// ── parsing ─────────────────────────────────────────────────────────────────

const OPTIONS_TAIL = /\$(~?[a-z][\w-]*(?:=[^,]*)?(?:,~?[a-z][\w-]*(?:=[^,]*)?)*)$/i

/** Options that only make sense with scripting / response rewriting: the rule is skipped. */
const UNSUPPORTED_OPTIONS = new Set([
  'removeparam', 'queryprune', 'csp', 'replace', 'header', 'permissions', 'urltransform', 'cname', 'inline-script', 'inline-font',
  'popup', 'popunder', 'elemhide', 'ehide', 'specifichide', 'generichide', 'ghide', 'content', 'urlblock', 'jsinject', 'extension',
  'genericblock', 'webrtc', 'websocket-only', 'stealth', 'to', 'from', 'method', 'app', 'network', 'rewrite', 'xmlhttprequest-only'
])
/** Options that name a neutered replacement resource; blocking outright is the closest equivalent we have. */
const REDIRECT_OPTIONS = new Set(['redirect', 'redirect-rule', 'empty', 'mp4', 'noop', 'important-redirect'])

interface ParsedNet {
  rule: NetRule
  exception: boolean
  badfilter: boolean
  /** `@@…$document`: switches filtering off for the matching page. */
  documentException: boolean
}

function parseNetworkRule(line: string): ParsedNet | null {
  let text = line
  let exception = false
  if (text.startsWith('@@')) {
    exception = true
    text = text.slice(2)
  }

  let options: string[] = []
  const m = OPTIONS_TAIL.exec(text)
  if (m) {
    options = m[1].split(',')
    text = text.slice(0, m.index)
  }

  let types = 0
  let notTypes = 0
  let party: 0 | 1 | 2 = 0
  let domains: string[] | null = null
  let notDomains: string[] | null = null
  let denyAllow: string[] | null = null
  let important = false
  let matchCase = false
  let badfilter = false
  let all = false

  for (const raw of options) {
    let name = raw.toLowerCase()
    let value = ''
    const eq = name.indexOf('=')
    if (eq >= 0) {
      value = raw.slice(eq + 1)
      name = name.slice(0, eq)
    }
    const negated = name.startsWith('~')
    if (negated) name = name.slice(1)

    if (name === 'third-party' || name === '3p') party = negated ? 2 : 1
    else if (name === 'first-party' || name === '1p') party = negated ? 1 : 2
    else if (name === 'strict3p') party = 1
    else if (name === 'strict1p') party = 2
    else if (name === 'important') important = true
    else if (name === 'match-case') matchCase = true
    else if (name === 'badfilter') badfilter = true
    else if (name === 'all') all = true
    else if (name === 'domain' || name === 'from') {
      for (const d of value.toLowerCase().split('|')) {
        if (!d) continue
        if (d.startsWith('~')) (notDomains ??= []).push(d.slice(1))
        else (domains ??= []).push(d)
      }
    } else if (name === 'denyallow') {
      denyAllow = value.toLowerCase().split('|').filter(Boolean)
    } else if (name in TYPE_NAMES) {
      if (negated) notTypes |= TYPE_NAMES[name]
      else types |= TYPE_NAMES[name]
    } else if (REDIRECT_OPTIONS.has(name)) {
      /* treated as a plain block */
    } else if (UNSUPPORTED_OPTIONS.has(name)) {
      return null
    } else {
      return null // unknown option: never guess
    }
  }

  const documentException = exception && (types & T.document) !== 0 && (types & ~T.document) === 0
  if (all) types = ALL_SUBRESOURCES | T.document
  else if (types === 0) types = ALL_SUBRESOURCES & ~notTypes
  else types &= ~notTypes
  if (types === 0 && !badfilter) return null

  let hostAnchor = false
  let startAnchor = false
  let endAnchor = false
  let isRegex = false
  let pattern = text
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    isRegex = true
    pattern = pattern.slice(1, -1)
  } else {
    if (pattern.startsWith('||')) {
      hostAnchor = true
      pattern = pattern.slice(2)
    } else if (pattern.startsWith('|')) {
      startAnchor = true
      pattern = pattern.slice(1)
    }
    if (pattern.endsWith('|')) {
      endAnchor = true
      pattern = pattern.slice(0, -1)
    }
    // a trailing `^` right at the end also matches "end of address"; keep it as a separator
  }
  if (!matchCase) pattern = pattern.toLowerCase()
  if (!isRegex) {
    // Patterns that carry (almost) no text would match nearly every address — never accept those.
    const significant = pattern.replace(/[*^]/g, '').length
    if (significant === 0 || (significant < 3 && !hostAnchor && !startAnchor)) return null
  }

  let regex: RegExp | null = null
  let literal = false
  if (isRegex) {
    // A list must not be able to freeze the browser with a catastrophic pattern: nested quantifiers and huge patterns are refused.
    if (pattern.length > 300 || /\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /\\[1-9]/.test(pattern)) return null
    try {
      regex = new RegExp(pattern, matchCase ? '' : 'i')
    } catch {
      return null
    }
  } else {
    literal = !/[*^]/.test(pattern) && !hostAnchor
  }

  return {
    exception,
    badfilter,
    documentException,
    rule: { pattern, literal, hostAnchor, startAnchor, endAnchor, regex, types, party, domains, notDomains, denyAllow, important, matchCase, tag: 0 }
  }
}

// ── cosmetic filters ────────────────────────────────────────────────────────

const UNSUPPORTED_SELECTOR = /:(?:has-text|-abp-[\w-]+|xpath|matches-css(?:-[\w-]+)?|matches-media|matches-path|matches-attr|matches-prop|upward|nth-ancestor|remove|style|watch-attr|min-text-length|contains|properties|-ms-input-placeholder|others|if|if-not|not-selector)\(/i

function isSafeSelector(sel: string): boolean {
  if (sel.length === 0 || sel.length > 400) return false
  if (UNSUPPORTED_SELECTOR.test(sel)) return false
  if (sel.includes('{') || sel.includes('}') || sel.includes(';') || sel.includes('\\0')) return false
  // at-rules, external resources and comments have no place in an element-hiding selector
  if (sel.startsWith('@') || /url\(|image-set\(|expression\(|\/\*|<|javascript:/i.test(sel)) return false
  if (/[^\x20-\x7E -￿]/.test(sel)) return false
  // unbalanced brackets would swallow the rest of the stylesheet
  let round = 0
  let square = 0
  for (const c of sel) {
    if (c === '(') round++
    else if (c === ')') round--
    else if (c === '[') square++
    else if (c === ']') square--
    if (round < 0 || square < 0) return false
  }
  return round === 0 && square === 0
}

export interface EngineStats {
  network: number
  cosmetic: number
}

export class FilterEngine {
  private readonly block = new RuleIndex()
  private readonly allow = new RuleIndex()
  private readonly documentAllow = new RuleIndex()
  private readonly badfilters = new Set<string>()
  private genericSelectors = new Set<string>()
  private readonly genericExceptions = new Set<string>()
  private readonly specific = new Map<string, Set<string>>()
  private readonly specificExceptions = new Map<string, Set<string>>()
  private readonly genericHideOff = new Set<string>()
  private cosmeticCount = 0
  private genericCss: string | null = null
  private readonly hostCache = new Map<string, string>()

  get stats(): EngineStats {
    return { network: this.block.count + this.allow.count + this.documentAllow.count, cosmetic: this.cosmeticCount }
  }

  /** Tag of the rule behind the last `block` verdict from `match`. */
  lastTag = 0

  /** Adds one line of a filter list. Comments, headers and unsupported rules are ignored. */
  addLine(rawLine: string, tag = 0): void {
    const line = rawLine.trim()
    if (!line || line.length > 2000) return
    const first = line.charCodeAt(0)
    if (first === 33 /* ! */ || (first === 91 /* [ */ && line.startsWith('[Adblock'))) return

    // cosmetic:  domains ## selector   /   domains #@# selector
    const cosmetic = /^([^\s#$]*?)(#@#|##)(.+)$/.exec(line)
    if (cosmetic) {
      if (cosmetic[3].startsWith('+js(') || cosmetic[3].startsWith('^')) return
      this.addCosmetic(cosmetic[1], cosmetic[2] === '#@#', cosmetic[3])
      return
    }
    if (line.includes('#?#') || line.includes('#$#') || line.includes('#%#') || line.includes('#@?#') || line.includes('#@$#')) return

    // `@@||site^$generichide` etc. only concern element hiding
    const generichide = /^@@(.*?)\$(?:.*,)?(?:generichide|ghide|elemhide|ehide)(?:,.*)?$/i.exec(line)
    if (generichide) {
      const host = /^\|\|([a-z0-9.-]+)/i.exec(generichide[1])?.[1]
      if (host) this.genericHideOff.add(host.toLowerCase())
      return
    }

    const parsed = parseNetworkRule(line)
    if (!parsed) return
    if (parsed.badfilter) {
      this.badfilters.add(line.replace(/,?badfilter/i, '').replace(/\$$/, ''))
      return
    }
    const key = line
    if (this.badfilters.has(key)) return
    parsed.rule.tag = tag
    if (parsed.documentException) this.documentAllow.add(parsed.rule)
    else if (parsed.exception) this.allow.add(parsed.rule)
    else this.block.add(parsed.rule)
  }

  private addCosmetic(domainPart: string, exception: boolean, selector: string): void {
    if (!isSafeSelector(selector)) return
    const domains = domainPart ? domainPart.toLowerCase().split(',') : []
    const include = domains.filter((d) => d && !d.startsWith('~'))
    const exclude = domains.filter((d) => d.startsWith('~')).map((d) => d.slice(1))
    this.cosmeticCount++
    if (include.length === 0) {
      if (exception) this.genericExceptions.add(selector)
      else if (exclude.length === 0) this.genericSelectors.add(selector)
      return // generic rules that exclude only some domains are rare; they are skipped
    }
    for (const d of include) {
      const map = exception ? this.specificExceptions : this.specific
      const set = map.get(d)
      if (set) set.add(selector)
      else map.set(d, new Set([selector]))
    }
  }

  /** Should this request be blocked? `allow` means a rule explicitly permits it. */
  match(req: MatchRequest): Verdict {
    const lowerUrl = req.url.toLowerCase()
    const hit = this.block.find(req, lowerUrl)
    if (!hit) return null
    this.lastTag = hit.tag
    if (hit.important) return 'block'
    return this.allow.find(req, lowerUrl) ? 'allow' : 'block'
  }

  /** `@@||site^$document`: the page is exempt from all filtering. */
  isPageAllowed(pageUrl: string, pageHost: string): boolean {
    if (this.documentAllow.count === 0) return false
    return (
      this.documentAllow.find(
        { url: pageUrl, host: pageHost, type: T.document, pageHost, thirdParty: false },
        pageUrl.toLowerCase()
      ) !== null
    )
  }

  /** CSS that hides ads on `host`: generic selectors (unless the site opted out) plus that site's own. */
  cosmeticCssFor(host: string, includeGeneric: boolean): string {
    const key = `${includeGeneric ? 1 : 0}|${host}`
    const cached = this.hostCache.get(key)
    if (cached !== undefined) return cached

    const labels = host.split('.')
    const suffixes: string[] = []
    for (let i = 0; i < labels.length - 1; i++) suffixes.push(labels.slice(i).join('.'))

    const rules: string[] = []
    const excepted = new Set<string>(this.genericExceptions)
    for (const s of suffixes) for (const sel of this.specificExceptions.get(s) ?? []) excepted.add(sel)
    for (const s of suffixes) {
      for (const sel of this.specific.get(s) ?? []) if (!excepted.has(sel)) rules.push(`${sel}{display:none!important}`)
    }
    if (includeGeneric && !suffixes.some((s) => this.genericHideOff.has(s))) rules.push(this.buildGenericCss(excepted))

    const css = rules.join('\n')
    if (this.hostCache.size > 200) this.hostCache.clear()
    this.hostCache.set(key, css)
    return css
  }

  private buildGenericCss(excepted: Set<string>): string {
    if (this.genericCss === null) {
      // one rule per selector: a selector the browser cannot parse must not take its neighbours down with it
      this.genericCss = [...this.genericSelectors].map((s) => `${s}{display:none!important}`).join('\n')
    }
    if (excepted.size === 0) return this.genericCss
    return [...this.genericSelectors]
      .filter((s) => !excepted.has(s))
      .map((s) => `${s}{display:none!important}`)
      .join('\n')
  }

  /** Invalidates cached CSS after more lines were added. */
  finish(): void {
    this.genericCss = null
    this.hostCache.clear()
  }
}
