import { dialog } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { handle } from './handle.js'
import {
  checkpointDatabase,
  closeDatabase,
  createDatabase,
  getDatabasePath
} from '../db/connection.js'
import { clearSession } from '../db/session.js'
import { buildBackup, parseBackup, writeBackupContents } from '../services/backup.js'
import { receiptsDir } from '../services/receipts.js'

function stamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`
}

export function registerBackupHandlers() {
  handle('backup:export', async () => {
    checkpointDatabase()
    const dbPath = getDatabasePath()
    const buffer = await buildBackup(dbPath, receiptsDir())

    const result = await dialog.showSaveDialog({
      title: 'Export PocketVault backup',
      defaultPath: `pocketvault-backup-${stamp()}.zip`,
      filters: [{ name: 'PocketVault Backup', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }

    writeFileSync(result.filePath, buffer)
    return { saved: true, path: result.filePath }
  })

  handle('backup:import', async ({ event }) => {
    const picked = await dialog.showOpenDialog({
      title: 'Import PocketVault backup',
      properties: ['openFile'],
      filters: [{ name: 'PocketVault Backup', extensions: ['zip'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return { imported: false }

    const buffer = readFileSync(picked.filePaths[0])
    const { manifest, dbBuffer, receipts } = await parseBackup(buffer)

    const dbPath = getDatabasePath()
    const dir = receiptsDir()

    closeDatabase()
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${dbPath}${suffix}`
      if (existsSync(sidecar)) rmSync(sidecar, { force: true })
    }
    writeBackupContents({ dbPath, receiptsDir: dir, dbBuffer, receipts })
    createDatabase(dbPath)

    clearSession(event.sender.id)
    return {
      imported: true,
      manifest,
      receipts: receipts.length
    }
  })
}
