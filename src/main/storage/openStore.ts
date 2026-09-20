import { dialog } from 'electron'
import { Database, type Snapshot } from './database'
import { readLegacyDatabase, wipeLegacyFiles } from './legacy'
import { Vault } from './vault'

export interface OpenedStore {
  vault: Vault
  db: Database
}

export type UnlockResult = 'unlocked' | 'reset' | 'cancel'

/**
 * Opens (or creates) the encrypted store.
 *  - existing vault: unlocked with the Windows credential store, or with the user's password via `askPassword`;
 *  - no vault yet: creates one and migrates plaintext data left by older versions, then destroys the plaintext files;
 *  - data that cannot be decrypted (other Windows user, damaged file): the user chooses to start fresh or quit.
 * Returns null when the user cancels, in which case the app should quit.
 */
export async function openStore(userData: string, askPassword: (vault: Vault) => Promise<UnlockResult>): Promise<OpenedStore | null> {
  const vault = new Vault(userData)
  let snapshot: Snapshot | null = null

  if (vault.exists()) {
    let ok = false
    if (vault.needsPassword()) {
      const result = await askPassword(vault)
      if (result === 'cancel') return null
      if (result === 'reset') vault.erase()
      else ok = true
    } else {
      ok = vault.unlockAutomatic()
    }

    if (vault.exists() && ok) {
      try {
        snapshot = vault.read() as Snapshot | null
      } catch (error) {
        console.error('[vault] cannot read the data file', error)
        ok = false
      }
    }
    if (vault.exists() && !ok) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Quit', 'Start fresh'],
        defaultId: 0,
        cancelId: 0,
        title: 'F2PX Browser',
        message: 'Your saved data cannot be decrypted.',
        detail:
          'It was encrypted for a different Windows user or computer, or the file is damaged. You can quit and try again from the right account, or start fresh (the old data will be deleted).'
      })
      if (response === 0) return null
      vault.erase()
    }
  }

  if (!vault.exists()) {
    // First run (or start fresh): pick up data from versions that stored it unencrypted.
    const legacy = readLegacyDatabase(userData)
    vault.create()
    const db = safeDatabase(vault, legacy)
    db.persistNow()
    if (vault.read() !== null) wipeLegacyFiles(userData) // only after the encrypted copy is verified on disk
    return { vault, db }
  }

  return { vault, db: safeDatabase(vault, snapshot) }
}

/** A snapshot that fails to restore must never stop the browser from starting. */
function safeDatabase(vault: Vault, snapshot: Snapshot | null): Database {
  try {
    return new Database(vault, snapshot)
  } catch (error) {
    console.error('[db] snapshot could not be restored, starting with an empty database', error)
    return new Database(vault, null)
  }
}
