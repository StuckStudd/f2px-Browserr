import { net } from 'electron'
import type { ErrorKind } from '../../shared/url'

/** Chromium net error codes we treat specially. See net/base/net_error_list.h. */
const ABORTED = -3

export function isIgnorableLoadError(code: number): boolean {
  return code === ABORTED
}

export function classifyLoadError(code: number): ErrorKind {
  if (code <= -200 && code >= -299) return 'certificate'
  if (code === -106) return 'offline'
  if (code === -105 || code === -137) return net.isOnline() ? 'dns' : 'offline'
  if ([-100, -101, -102, -104, -109, -118, -7, -21, -324, -110, -111].includes(code)) {
    return net.isOnline() ? 'connection' : 'offline'
  }
  return 'generic'
}
