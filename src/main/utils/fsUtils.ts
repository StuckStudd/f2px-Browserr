import { existsSync, mkdirSync, promises as fs } from 'node:fs'
import path from 'node:path'

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/** Strips path separators and characters that Windows forbids in file names. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')).trim().replace(/[. ]+$/, '')
  return base.length > 0 ? base.slice(0, 200) : 'download'
}

/** `file.zip` -> `file (1).zip` when the target already exists. */
export function uniquePath(dir: string, filename: string): string {
  const ext = path.extname(filename)
  const stem = filename.slice(0, filename.length - ext.length)
  let candidate = path.join(dir, filename)
  for (let i = 1; existsSync(candidate) && i < 10_000; i++) {
    candidate = path.join(dir, `${stem} (${i})${ext}`)
  }
  return candidate
}

/** Atomic write: temp file + rename, so a crash never leaves a half-written JSON file. */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.hta', '.lnk', '.reg', '.jar', '.cpl', '.msc', '.dll', '.appx', '.msix'
])

export function isDangerousFile(file: string): boolean {
  return DANGEROUS_EXTENSIONS.has(path.extname(file).toLowerCase())
}

const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|rtf|jpe?g|png|gif|bmp|zip|rar|7z|mp3|mp4|avi|mkv)$/i

/** "invoice.pdf.exe": a program dressed up as a document — the classic trick to make people run malware. */
export function isDisguisedExecutable(file: string): boolean {
  const name = path.basename(file)
  const ext = path.extname(name)
  return DANGEROUS_EXTENSIONS.has(ext.toLowerCase()) && DOCUMENT_EXTENSIONS.test(name.slice(0, name.length - ext.length))
}
