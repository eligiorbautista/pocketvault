import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import { applyUserBackup, buildUserBackup, parseUserBackup } from '../services/backup.js'
import { receiptsDir } from '../services/receipts.js'

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
  handle('backup:export', async ({ userId }) => {
    const db = getDatabase()
    const user = currentUser(db, userId)
    if (!user) throw new Error('Account not found')

    const { buffer, counts } = await buildUserBackup(db, userId, receiptsDir())

    const result = await dialog.showSaveDialog({
      title: 'Export account backup',
      defaultPath: `pocketvault-${user.username}-${stamp()}.zip`,
      filters: [{ name: 'PocketVault Backup', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }

    writeFileSync(result.filePath, buffer)
    return { saved: true, path: result.filePath, counts }
  })

  handle('backup:import', async ({ userId }) => {
    const db = getDatabase()
    const user = currentUser(db, userId)
    if (!user) throw new Error('Account not found')

    const picked = await dialog.showOpenDialog({
      title: 'Import account backup',
      properties: ['openFile'],
      filters: [{ name: 'PocketVault Backup', extensions: ['zip'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return { imported: false }

    const buffer = readFileSync(picked.filePaths[0])
    const parsed = await parseUserBackup(buffer)

    if (parsed.account.username !== user.username) {
      throw new Error(
        `This backup belongs to a different account ("${parsed.account.username}"). ` +
          `Sign in to that account to import it.`
      )
    }

    const result = applyUserBackup(db, userId, parsed, receiptsDir())
    return { imported: true, counts: result.counts }
  })
}
