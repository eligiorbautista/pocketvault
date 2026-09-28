import { app, dialog, shell } from 'electron'
import { basename, extname, join } from 'node:path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_EXTENSIONS,
  RECEIPT_FILE_PATTERN
} from '../../shared/constants.js'

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
}

export function receiptsDir() {
  const dir = join(app.getPath('userData'), 'receipts')
  mkdirSync(dir, { recursive: true })
  return dir
}

function safePath(filename) {
  if (typeof filename !== 'string' || !RECEIPT_FILE_PATTERN.test(filename)) {
    throw new Error('Invalid receipt reference')
  }
  return join(receiptsDir(), filename)
}

export async function selectAndImportReceipt() {
  const result = await dialog.showOpenDialog({
    title: 'Select a receipt',
    properties: ['openFile'],
    filters: [
      { name: 'Receipts', extensions: RECEIPT_EXTENSIONS.map((e) => e.replace('.', '')) },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importReceipt(result.filePaths[0])
}

export function importReceipt(sourcePath) {
  const ext = extname(sourcePath).toLowerCase()
  if (!RECEIPT_EXTENSIONS.includes(ext)) {
    throw new Error('Unsupported receipt file type')
  }
  if (!existsSync(sourcePath)) throw new Error('Receipt file not found')
  const size = statSync(sourcePath).size
  if (size > MAX_RECEIPT_BYTES) throw new Error('Receipt exceeds the 10 MB limit')

  const filename = `${randomUUID()}${ext}`
  copyFileSync(sourcePath, join(receiptsDir(), filename))
  return filename
}

export function readReceipt(filename) {
  const path = safePath(filename)
  if (!existsSync(path)) throw new Error('Receipt not found')
  const buffer = readFileSync(path)
  const mime = MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
  return {
    filename,
    name: basename(path),
    mime,
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
  }
}

export async function openReceipt(filename) {
  const path = safePath(filename)
  if (!existsSync(path)) throw new Error('Receipt not found')
  const error = await shell.openPath(path)
  if (error) throw new Error(error)
  return true
}

export function deleteReceipt(filename) {
  const path = safePath(filename)
  if (existsSync(path)) unlinkSync(path)
  return true
}
