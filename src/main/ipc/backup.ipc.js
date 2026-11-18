import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { handle } from './handle.js'
import { checkpointDatabase, getDatabase } from '../db/connection.js'
import {
  applyUserBackup,
  assertBackupMatchesAccount,
  buildUserBackup,
  parseUserBackup
} from '../services/backup.js'
import { receiptsDir } from '../services/receipts.js'
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../../shared/backupCrypto.js'

function stamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`
}

function currentUser(db, userId) {
  return db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) ?? null
}

export function registerBackupHandlers() {
  handle('backup:export', async ({ userId, passphrase }) => {
    const db = getDatabase()
    const user = currentUser(db, userId)
    if (!user) throw new Error('Account not found')
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('A backup password is required')
    }

    const { buffer, counts } = await buildUserBackup(db, userId, receiptsDir())
    // Fold the WAL back into the main DB so the exported snapshot is complete.
    checkpointDatabase()

    const encrypted = await encryptBackup(buffer, passphrase)
    const result = await dialog.showSaveDialog({
      title: 'Export encrypted account backup',
      defaultPath: `pocketvault-${user.username}-backup-${stamp()}.pvbak`,
      filters: [{ name: 'PocketVault encrypted backup', extensions: ['pvbak'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }

    writeFileSync(result.filePath, encrypted)
    return { saved: true, path: result.filePath, counts, encrypted: true }
  })

  handle('backup:import', async ({ userId, passphrase }) => {
    const db = getDatabase()
    const user = currentUser(db, userId)
    if (!user) throw new Error('Account not found')

    const picked = await dialog.showOpenDialog({
      title: 'Import account backup',
      properties: ['openFile'],
      filters: [
        { name: 'PocketVault backup', extensions: ['pvbak', 'zip'] },
        { name: 'Encrypted PocketVault backup', extensions: ['pvbak'] },
        { name: 'Legacy ZIP backup', extensions: ['zip'] }
      ]
    })
    if (picked.canceled || picked.filePaths.length === 0) return { imported: false }

    const file = readFileSync(picked.filePaths[0])
    let buffer = file
    if (isEncryptedBackup(file)) {
      buffer = Buffer.from(await decryptBackup(file, passphrase ?? ''))
    }
    const parsed = await parseUserBackup(buffer)

    // Authoritative, account-locked check (also enforced inside applyUserBackup).
    assertBackupMatchesAccount(parsed.account.username, user.username)

    const result = applyUserBackup(db, userId, parsed, receiptsDir(), user.username)
    return { imported: true, counts: result.counts, username: result.username }
  })
}
