import fs from 'node:fs'

/**
 * Mark-of-the-Web: tags a downloaded file as coming from the Internet (NTFS "Zone.Identifier" stream, zone 3), so
 * Windows SmartScreen, Defender and Office Protected View treat it with suspicion. Chromium usually does this itself;
 * this makes sure the tag is there and never fails a download.
 */
export function markOfTheWeb(file: string, downloadUrl: string, referrer: string): void {
  if (process.platform !== 'win32') return
  const stream = `${file}:Zone.Identifier`
  try {
    if (fs.readFileSync(stream, 'utf8').includes('ZoneId=')) return // already tagged
  } catch {
    /* no stream yet */
  }
  const clean = (s: string): string => s.replace(/[\r\n]/g, '').slice(0, 500)
  try {
    fs.writeFileSync(stream, `[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=${clean(referrer)}\r\nHostUrl=${clean(downloadUrl)}\r\n`)
  } catch (error) {
    console.warn('[downloads] could not tag the file as downloaded from the Internet', error)
  }
}

export function hasMarkOfTheWeb(file: string): boolean {
  try {
    return fs.readFileSync(`${file}:Zone.Identifier`, 'utf8').includes('ZoneId=3')
  } catch {
    return false
  }
}
