import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { VaultMode } from '../../shared/types'

/**
 * Encrypted-at-rest storage for everything F2PX keeps in its database and settings.
 *
 *   data file   f2px.vault  = MAGIC | iv(12) | authTag(16) | AES-256-GCM(JSON snapshot)
 *   key file    vault.json  = the random 256-bit data key, "wrapped" one of two ways:
 *                 dpapi     -> Electron safeStorage (Windows DPAPI: only this Windows user on this PC can unwrap it)
 *                 password  -> AES-256-GCM under a key derived from the user's password with scrypt
 *
 * Changing or removing the password only re-wraps the data key; the data file is untouched.
 */

const MAGIC = Buffer.from('F2PXV1')
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }

interface VaultMeta {
  v: 1
  mode: VaultMode
  /** dpapi: safeStorage ciphertext (base64). plain: the raw key (base64, NOT protected). password: iv.tag.ct (base64 parts). */
  wrapped: string
  salt?: string
}

function gcmEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { iv, tag: cipher.getAuthTag(), ct }
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

export class Vault {
  private dek: Buffer | null = null
  private meta: VaultMeta | null = null
  private readonly metaFile: string
  private readonly dataFile: string

  constructor(private readonly dir: string) {
    this.metaFile = path.join(dir, 'vault.json')
    this.dataFile = path.join(dir, 'f2px.vault')
    this.meta = this.loadMeta()
  }

  private loadMeta(): VaultMeta | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.metaFile, 'utf8')) as VaultMeta
      return raw && raw.v === 1 && typeof raw.wrapped === 'string' && ['dpapi', 'password', 'plain'].includes(raw.mode) ? raw : null
    } catch {
      return null
    }
  }

  exists(): boolean {
    return this.meta !== null
  }

  get mode(): VaultMode {
    return this.meta?.mode ?? 'plain'
  }

  get encrypted(): boolean {
    return this.mode !== 'plain'
  }

  get unlocked(): boolean {
    return this.dek !== null
  }

  needsPassword(): boolean {
    return this.meta?.mode === 'password'
  }

  // ── creation / unlocking ────────────────────────────────────────────────
  /** First run: new random data key, protected by Windows DPAPI when available. */
  create(): void {
    this.dek = crypto.randomBytes(32)
    this.writeMeta(this.wrapDpapiOrPlain(this.dek))
  }

  private wrapDpapiOrPlain(dek: Buffer): VaultMeta {
    if (safeStorage.isEncryptionAvailable()) {
      return { v: 1, mode: 'dpapi', wrapped: safeStorage.encryptString(dek.toString('base64')).toString('base64') }
    }
    // Without an OS credential store the key can only sit next to the data: report it honestly as not protected.
    return { v: 1, mode: 'plain', wrapped: dek.toString('base64') }
  }

  /** Returns false when the key cannot be recovered (other Windows user / other PC / corrupted file). */
  unlockAutomatic(): boolean {
    if (!this.meta || this.meta.mode === 'password') return false
    try {
      this.dek =
        this.meta.mode === 'plain'
          ? Buffer.from(this.meta.wrapped, 'base64')
          : Buffer.from(safeStorage.decryptString(Buffer.from(this.meta.wrapped, 'base64')), 'base64')
      return this.dek.length === 32
    } catch {
      this.dek = null
      return false
    }
  }

  unlockPassword(password: string): boolean {
    if (!this.meta || this.meta.mode !== 'password' || !this.meta.salt) return false
    try {
      const [iv, tag, ct] = this.meta.wrapped.split('.').map((p) => Buffer.from(p, 'base64'))
      const kek = crypto.scryptSync(password.normalize('NFKC'), Buffer.from(this.meta.salt, 'base64'), 32, SCRYPT)
      this.dek = gcmDecrypt(kek, iv, tag, ct)
      return this.dek.length === 32
    } catch {
      this.dek = null
      return false
    }
  }

  /** Verifies a password without touching the unlocked state (used before changing / removing it). */
  checkPassword(password: string): boolean {
    if (!this.meta || this.meta.mode !== 'password' || !this.meta.salt) return false
    try {
      const [iv, tag, ct] = this.meta.wrapped.split('.').map((p) => Buffer.from(p, 'base64'))
      const kek = crypto.scryptSync(password.normalize('NFKC'), Buffer.from(this.meta.salt, 'base64'), 32, SCRYPT)
      return gcmDecrypt(kek, iv, tag, ct).length === 32
    } catch {
      return false
    }
  }

  // ── password management (vault must be unlocked) ────────────────────────
  setPassword(password: string): void {
    if (!this.dek) throw new Error('Vault is locked')
    if (password.length < 8) throw new Error('Password must be at least 8 characters')
    const salt = crypto.randomBytes(16)
    const kek = crypto.scryptSync(password.normalize('NFKC'), salt, 32, SCRYPT)
    const { iv, tag, ct } = gcmEncrypt(kek, this.dek)
    this.writeMeta({
      v: 1,
      mode: 'password',
      salt: salt.toString('base64'),
      wrapped: [iv, tag, ct].map((b) => b.toString('base64')).join('.')
    })
  }

  removePassword(): void {
    if (!this.dek) throw new Error('Vault is locked')
    this.writeMeta(this.wrapDpapiOrPlain(this.dek))
  }

  /** Forgot password: everything encrypted with the old key becomes unreadable, so it is deleted. */
  erase(): void {
    this.dek = null
    this.meta = null
    for (const f of [this.metaFile, this.dataFile]) fs.rmSync(f, { force: true })
  }

  // ── data ────────────────────────────────────────────────────────────────
  read(): unknown | null {
    if (!this.dek) throw new Error('Vault is locked')
    let buf: Buffer
    try {
      buf = fs.readFileSync(this.dataFile)
    } catch {
      return null
    }
    if (buf.length < MAGIC.length + 28 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unrecognised vault file')
    const o = MAGIC.length
    const plain = gcmDecrypt(this.dek, buf.subarray(o, o + 12), buf.subarray(o + 12, o + 28), buf.subarray(o + 28))
    return JSON.parse(plain.toString('utf8'))
  }

  write(value: unknown): void {
    if (!this.dek) throw new Error('Vault is locked')
    const { iv, tag, ct } = gcmEncrypt(this.dek, Buffer.from(JSON.stringify(value), 'utf8'))
    const tmp = `${this.dataFile}.tmp`
    fs.writeFileSync(tmp, Buffer.concat([MAGIC, iv, tag, ct]))
    fs.renameSync(tmp, this.dataFile)
  }

  private writeMeta(meta: VaultMeta): void {
    fs.mkdirSync(this.dir, { recursive: true })
    const tmp = `${this.metaFile}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(meta))
    fs.renameSync(tmp, this.metaFile)
    this.meta = meta
  }
}
