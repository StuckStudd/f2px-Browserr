import type { BookmarkService } from './bookmarks/bookmarkService'
import type { Omnibox } from './browser/omnibox'
import type { DownloadManager } from './downloads/downloadManager'
import type { HistoryService } from './history/historyService'
import type { PrivacyGuard } from './privacy/privacyGuard'
import type { EventHub } from './ipc/eventHub'
import type { UpdateChecker } from './system/updateChecker'
import type { QuickAccessService } from './quickaccess/quickAccessService'
import type { SettingsService } from './settings/settingsService'
import type { Database } from './storage/database'
import type { Vault } from './storage/vault'

/** Long-lived services created once at startup and injected wherever they are needed. */
export interface AppServices {
  db: Database
  vault: Vault
  settings: SettingsService
  history: HistoryService
  bookmarks: BookmarkService
  quickAccess: QuickAccessService
  downloads: DownloadManager
  omnibox: Omnibox
  privacy: PrivacyGuard
  updates: UpdateChecker
  hub: EventHub
}
