import { app } from 'electron'
import { DNS_PROVIDERS } from '../../shared/settings'
import type { Settings } from '../../shared/types'

/** DNS-over-HTTPS: the lookup of every site name is encrypted, so your provider cannot log which sites you visit. */
export function applySecureDns(settings: Pick<Settings, 'secureDns' | 'dnsProvider' | 'dnsCustomUrl'>): void {
  const server = settings.dnsProvider === 'custom' ? settings.dnsCustomUrl : DNS_PROVIDERS[settings.dnsProvider].url
  const usable = settings.secureDns !== 'off' && /^https:\/\//.test(server)
  try {
    app.configureHostResolver({
      enableBuiltInResolver: true,
      // "automatic": try the encrypted resolver first and fall back to the system one if it is blocked.
      // "secure": never fall back (a network that blocks DoH then cannot resolve names at all).
      secureDnsMode: !usable ? 'off' : settings.secureDns === 'strict' ? 'secure' : 'automatic',
      secureDnsServers: usable ? [server] : []
    })
  } catch (error) {
    console.error('[dns] could not configure the resolver', error)
  }
}
