import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { handle } from './handle.js'
import * as receipts from '../services/receipts.js'

function toBuffer(data) {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (Array.isArray(data)) return Buffer.from(data)
  return null
}

export function registerFilesHandlers() {
  handle('files:selectReceipt', () => receipts.selectAndImportReceipt())

  handle('files:readReceipt', ({ payload }) => receipts.readReceipt(payload.filename))

  handle('files:openReceipt', ({ payload }) => receipts.openReceipt(payload.filename))

  handle('files:deleteReceipt', ({ payload }) => receipts.deleteReceipt(payload.filename))

  handle('files:saveExport', async ({ payload }) => {
    const buffer = toBuffer(payload.data)
    if (!buffer || buffer.length === 0) throw new Error('Nothing to export')

    const defaultName = basename(String(payload.defaultName ?? 'export'))
    const filters = Array.isArray(payload.filters)
      ? payload.filters
          .filter((f) => f && typeof f.name === 'string' && Array.isArray(f.extensions))
          .map((f) => ({ name: f.name, extensions: f.extensions.map(String) }))
      : []

    const result = await dialog.showSaveDialog({
      title: 'Save export',
      defaultPath: defaultName,
      filters
    })
    if (result.canceled || !result.filePath) return { saved: false }

    writeFileSync(result.filePath, buffer)
    return { saved: true, path: result.filePath }
  })
}
