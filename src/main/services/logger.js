import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Minimal file logger for the main process. There is no log viewer in the UI,
// but the file lets production issues be diagnosed (app.getPath('logs') is the
// conventional, writable location).
let logFile = null

function file() {
  if (logFile) return logFile
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    logFile = join(dir, 'main.log')
  } catch {
    logFile = ''
  }
  return logFile
}

function write(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`
  try {
    // Mirror to stdout in dev for convenience.
    if (!app.isPackaged) process.stdout.write(line)
    const target = file()
    if (target) appendFileSync(target, line)
  } catch {
    // Logging must never throw and take the app down.
  }
}

export const log = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args)
}
