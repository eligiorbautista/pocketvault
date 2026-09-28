import JSZip from 'jszip'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { RECEIPT_FILE_PATTERN } from '../../shared/constants.js'

const RECEIPTS_PREFIX = 'receipts/'

export async function buildBackup(dbPath, receiptsDir) {
  if (!existsSync(dbPath)) throw new Error('Database file not found')
  const zip = new JSZip()
  zip.file(
    'manifest.json',
    JSON.stringify(
      { app: 'PocketVault', format: 1, createdAt: new Date().toISOString() },
      null,
      2
    )
  )
  zip.file('pocketvault.db', readFileSync(dbPath))

  if (existsSync(receiptsDir)) {
    const folder = zip.folder('receipts')
    for (const name of readdirSync(receiptsDir)) {
      const full = join(receiptsDir, name)
      if (existsSync(full)) folder.file(name, readFileSync(full))
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function parseBackup(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Invalid backup file: not a readable ZIP archive')
  }

  const dbEntry = zip.file('pocketvault.db')
  if (!dbEntry) throw new Error('Invalid backup: pocketvault.db is missing')
  const dbBuffer = await dbEntry.async('nodebuffer')
  if (dbBuffer.length === 0) throw new Error('Invalid backup: database file is empty')

  let manifest = null
  const manifestEntry = zip.file('manifest.json')
  if (manifestEntry) {
    try {
      manifest = JSON.parse(await manifestEntry.async('string'))
    } catch {
      manifest = null
    }
  }

  const receipts = []
  const names = Object.keys(zip.files).filter(
    (path) => path.startsWith(RECEIPTS_PREFIX) && !zip.files[path].dir
  )
  for (const path of names) {
    const name = basename(path)
    if (!RECEIPT_FILE_PATTERN.test(name)) continue
    receipts.push({ name, buffer: await zip.files[path].async('nodebuffer') })
  }

  return { manifest, dbBuffer, receipts }
}

export function writeBackupContents({ dbPath, receiptsDir, dbBuffer, receipts }) {
  mkdirSync(receiptsDir, { recursive: true })
  for (const receipt of receipts) {
    writeFileSync(join(receiptsDir, receipt.name), receipt.buffer)
  }
  writeFileSync(dbPath, dbBuffer)
}
