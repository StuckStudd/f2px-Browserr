import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { BrowserWindow, Notification, dialog, shell, type DownloadItem, type Session, type WebContents } from 'electron'
import type { DownloadRecord } from '../../shared/types'
import type { EventHub } from '../ipc/eventHub'
import { paths } from '../paths'
import type { SettingsService } from '../settings/settingsService'
import type { Database } from '../storage/database'
import { ensureDir, isDangerousFile, isDisguisedExecutable, sanitizeFilename, uniquePath } from '../utils/fsUtils'
import { markOfTheWeb } from './motw'

interface LiveDownload {
  item: DownloadItem
  session: Session
  started: boolean
  lastBytes: number
  lastTime: number
  lastEmit: number
}

interface DownloadRow {
  id: string
  url: string
  source: string
  filename: string
  save_path: string
  total_bytes: number
  received_bytes: number
  state: DownloadRecord['state']
  mime: string
  started_at: number
  ended_at: number | null
  error: string | null
}

const EMIT_INTERVAL_MS = 250

export class DownloadManager {
  private readonly records = new Map<string, DownloadRecord>()
  private readonly live = new Map<string, LiveDownload>()
  private readonly sessions = new WeakSet<Session>()
  /** Called when a download starts so the UI can reveal the downloads panel. */
  onStarted: (isPrivate: boolean) => void = () => {}

  constructor(
    private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly hub: EventHub
  ) {
    this.load()
  }

  private load(): void {
    const rows = this.db.all<DownloadRow>('SELECT * FROM downloads ORDER BY started_at DESC LIMIT 1000')
    for (const r of rows) {
      const interrupted = r.state === 'downloading' || r.state === 'paused'
      this.records.set(r.id, {
        id: r.id,
        url: r.url,
        source: r.source,
        filename: r.filename,
        savePath: r.save_path,
        totalBytes: r.total_bytes,
        receivedBytes: r.received_bytes,
        speed: 0,
        state: interrupted ? 'failed' : r.state,
        mime: r.mime,
        startedAt: r.started_at,
        endedAt: r.ended_at ?? (interrupted ? Date.now() : null),
        error: interrupted ? 'Interrupted: F2PX was closed during the download' : r.error,
        isPrivate: false
      })
      if (interrupted) this.persist(this.records.get(r.id) as DownloadRecord)
    }
  }

  /** Hooks the session so every download (link, blob, script-initiated) lands in the manager. */
  attach(ses: Session, isPrivate: boolean): void {
    if (this.sessions.has(ses)) return
    this.sessions.add(ses)
    ses.on('will-download', (_event, item, webContents) => this.handleNew(ses, item, webContents, isPrivate))
  }

  private downloadDir(): string {
    const s = this.settings.get()
    const dir = s.downloadMode === 'custom' && s.downloadPath ? s.downloadPath : paths.defaultDownloads()
    try {
      ensureDir(dir)
      return dir
    } catch {
      const fallback = paths.defaultDownloads()
      ensureDir(fallback)
      return fallback
    }
  }

  private handleNew(ses: Session, item: DownloadItem, webContents: WebContents | undefined, isPrivate: boolean): void {
    const id = randomUUID()
    const filename = sanitizeFilename(item.getFilename())
    const mode = this.settings.get().downloadMode
    let savePath = ''

    if (mode === 'ask') {
      // Without setSavePath Electron shows the native "Save as" dialog.
      item.setSaveDialogOptions({ title: 'Save file', defaultPath: uniquePath(this.downloadDir(), filename) })
    } else {
      savePath = uniquePath(this.downloadDir(), filename)
      item.setSavePath(savePath)
    }

    let source = ''
    try {
      source = webContents && !webContents.isDestroyed() ? webContents.getURL() : ''
    } catch {
      /* ignore */
    }

    const record: DownloadRecord = {
      id,
      url: item.getURL(),
      source,
      filename: savePath ? path.basename(savePath) : filename,
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      speed: 0,
      state: 'downloading',
      mime: item.getMimeType(),
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      isPrivate
    }
    const live: LiveDownload = { item, session: ses, started: false, lastBytes: 0, lastTime: Date.now(), lastEmit: 0 }
    this.records.set(id, record)
    this.live.set(id, live)
    // A retry must use the session the download started in (a Tor download must never be retried directly).
    this.sessionOfRecord.set(id, ses)
    if (savePath) this.persist(record)
    this.emit(record, true)
    this.onStarted(isPrivate)

    item.on('updated', (_e, state) => {
      const now = Date.now()
      live.started = true
      const current = item.getSavePath()
      if (current) {
        record.savePath = current
        record.filename = path.basename(current)
      }
      record.totalBytes = item.getTotalBytes()
      record.receivedBytes = item.getReceivedBytes()

      if (state === 'interrupted') {
        record.state = 'failed'
        record.error = 'Connection interrupted'
        record.speed = 0
        this.persist(record)
      } else {
        record.state = item.isPaused() ? 'paused' : 'downloading'
        record.error = null
        const dt = now - live.lastTime
        if (dt >= 400) {
          const instant = ((record.receivedBytes - live.lastBytes) / dt) * 1000
          record.speed = record.speed > 0 ? record.speed * 0.6 + instant * 0.4 : instant
          live.lastBytes = record.receivedBytes
          live.lastTime = now
        }
        if (record.state === 'paused') record.speed = 0
      }
      this.emit(record)
    })

    item.once('done', (_e, state) => {
      this.live.delete(id)
      record.endedAt = Date.now()
      record.speed = 0
      record.receivedBytes = item.getReceivedBytes()
      record.totalBytes = item.getTotalBytes() || record.receivedBytes
      const finalPath = item.getSavePath()
      if (finalPath) {
        record.savePath = finalPath
        record.filename = path.basename(finalPath)
      }

      if (state === 'completed') {
        record.state = 'completed'
        record.error = null
        markOfTheWeb(record.savePath, record.url, record.source)
        this.notifyDone(record)
      } else if (state === 'cancelled') {
        // The "Save as" dialog was dismissed before anything was written: leave no trace.
        if (!live.started && mode === 'ask') {
          this.records.delete(id)
          this.hub.emit('downloads:remove', id, { isPrivate })
          return
        }
        record.state = 'cancelled'
      } else {
        record.state = 'failed'
        record.error = record.error ?? 'Download failed'
      }
      this.persist(record)
      this.emit(record, true)
    })
  }

  private notifyDone(record: DownloadRecord): void {
    if (!this.settings.get().downloadNotifications || !Notification.isSupported()) return
    const note = new Notification({
      title: 'Download complete',
      body: record.isPrivate ? 'Private download finished' : record.filename,
      silent: false
    })
    note.on('click', () => this.show(record.id))
    note.show()
  }

  private persist(r: DownloadRecord): void {
    if (r.isPrivate) return
    this.db.run(
      `INSERT INTO downloads(id,url,source,filename,save_path,total_bytes,received_bytes,state,mime,started_at,ended_at,error)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, save_path=excluded.save_path,
         total_bytes=excluded.total_bytes, received_bytes=excluded.received_bytes, state=excluded.state,
         ended_at=excluded.ended_at, error=excluded.error`,
      r.id, r.url, r.source, r.filename, r.savePath, r.totalBytes, r.receivedBytes, r.state, r.mime, r.startedAt, r.endedAt, r.error
    )
  }

  private emit(record: DownloadRecord, force = false): void {
    const live = this.live.get(record.id)
    const now = Date.now()
    if (!force && live && now - live.lastEmit < EMIT_INTERVAL_MS) return
    if (live) live.lastEmit = now
    this.hub.emit('downloads:upsert', { ...record }, { isPrivate: record.isPrivate })
  }

  list(isPrivate: boolean): DownloadRecord[] {
    return [...this.records.values()]
      .filter((r) => r.isPrivate === isPrivate)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((r) => ({ ...r }))
  }

  pause(id: string): void {
    const live = this.live.get(id)
    if (live && !live.item.isPaused()) live.item.pause()
  }

  resume(id: string): void {
    const live = this.live.get(id)
    if (live?.item.canResume()) live.item.resume()
  }

  cancel(id: string): void {
    this.live.get(id)?.item.cancel()
  }

  retry(id: string): void {
    const record = this.records.get(id) ?? null
    if (!record || record.state === 'downloading' || record.state === 'completed') return
    const live = this.live.get(id)
    if (live?.item.canResume()) {
      live.item.resume()
      return
    }
    const ses = live?.session ?? this.sessionOfRecord.get(id) ?? (record.isPrivate ? null : this.sessionFor(false))
    if (!ses) return
    this.remove(id)
    ses.downloadURL(record.url)
  }

  private readonly sessionOfRecord = new Map<string, Session>()

  /** Sessions currently known to the manager, used to re-issue a download after a restart. */
  private sessionProvider: (isPrivate: boolean) => Session | null = () => null
  setSessionProvider(provider: (isPrivate: boolean) => Session | null): void {
    this.sessionProvider = provider
  }
  private sessionFor(isPrivate: boolean): Session | null {
    return this.sessionProvider(isPrivate)
  }

  async open(id: string): Promise<string> {
    const record = this.records.get(id) ?? null
    if (!record || record.state !== 'completed') return 'Download is not finished'
    if (!existsSync(record.savePath)) return 'File was moved or deleted'
    if (isDangerousFile(record.savePath)) {
      const parent = BrowserWindow.getFocusedWindow() ?? undefined
      const options = {
        type: 'warning' as const,
        buttons: ['Cancel', 'Run anyway'],
        defaultId: 0,
        cancelId: 0,
        title: 'Open downloaded file',
        message: isDisguisedExecutable(record.savePath)
          ? `“${record.filename}” is a program pretending to be a document.`
          : `“${record.filename}” is an executable file.`,
        detail: isDisguisedExecutable(record.savePath)
          ? 'Its name ends in a document type followed by a program extension — a common trick used by malware. Do not run it unless you are sure.'
          : 'Files from the internet can harm your computer. Only open it if you trust the source.'
      }
      const { response } = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)
      if (response !== 1) return ''
    }
    return shell.openPath(record.savePath)
  }

  show(id: string): void {
    const record = this.records.get(id) ?? null
    if (!record) return
    if (record.savePath && existsSync(record.savePath)) shell.showItemInFolder(record.savePath)
    else if (record.savePath) void shell.openPath(path.dirname(record.savePath))
  }

  remove(id: string): void {
    const record = this.records.get(id)
    if (!record) return
    this.live.get(id)?.item.cancel()
    this.records.delete(id)
    this.sessionOfRecord.delete(id)
    if (!record.isPrivate) this.db.run('DELETE FROM downloads WHERE id = ?', id)
    this.hub.emit('downloads:remove', id, { isPrivate: record.isPrivate })
  }

  clearFinished(isPrivate: boolean): void {
    for (const r of [...this.records.values()]) {
      if (r.isPrivate === isPrivate && !this.live.has(r.id)) this.remove(r.id)
    }
  }

  /** Privacy > "Clear download history": removes records, never the files themselves. */
  clearHistory(): void {
    this.clearFinished(false)
    this.db.run("DELETE FROM downloads WHERE state NOT IN ('downloading','paused')")
  }

  /** Called when the last private window closes. */
  purgePrivate(): void {
    for (const r of [...this.records.values()]) {
      if (r.isPrivate) this.remove(r.id)
    }
  }

  hasActive(): boolean {
    return this.live.size > 0
  }
}
