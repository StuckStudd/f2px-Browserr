import { net } from 'electron'
import type { ErrorKind } from '../../shared/url'

/** Chromium net error codes we treat specially. See net/base/net_error_list.h. */
const ABORTED = -3

export function isIgnorableLoadError(code: number): boolean {
  return code === ABORTED
}

export function classifyLoadError(code: number): ErrorKind {
  if (code <= -200 && code >= -299) return 'certificate'
  // proxy / SOCKS failures (Tor not running, wrong proxy address): never mistaken for "no internet"
  if ([-130, -120, -121, -111, -131, -132, -133, -134, -135, -136].includes(code)) return 'proxy'
  if (code === -106) return 'offline'
  if (code === -105 || code === -137) return net.isOnline() ? 'dns' : 'offline'
  if ([-100, -101, -102, -104, -109, -118, -7, -21, -324, -110].includes(code)) {
    return net.isOnline() ? 'connection' : 'offline'
  }
  return 'generic'
}
