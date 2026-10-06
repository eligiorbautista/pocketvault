import { app, shell, BrowserWindow, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { closeDatabase, createDatabase, getDatabase } from './db/connection.js'
import { clearSession } from './db/session.js'
import { registerIpcHandlers } from './ipc/index.js'
import { receiptsDir } from './services/receipts.js'
import { reconcileReceipts } from './services/receiptCleanup.js'
import { clearReminders } from './services/reminders.js'
import { log } from './services/logger.js'

const isDev = !app.isPackaged

// Required for Windows to show notifications under the right app identity.
app.setAppUserModelId('com.pocketvault.app')

// Only one instance may own the SQLite database at a time.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })
}

// Crash safety nets: log and, where possible, keep the user informed instead of
// dying silently.
process.on('uncaughtException', (error) => {
  log.error('uncaughtException', error)
  try {
    dialog.showErrorBox('PocketVault hit an unexpected error', String(error?.message ?? error))
  } catch {
    // ignore
  }
})
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', reason)
})

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])

function isSafeExternal(url) {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 667,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    icon: isDev ? join(__dirname, '../../build/icon.png') : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const webContentsId = mainWindow.webContents.id

  mainWindow.once('ready-to-show', () => {
    // Open maximized (fills the screen) while keeping the standard frame with
    // the title bar, minimize and close buttons.
    mainWindow.maximize()
    mainWindow.show()
  })

  // Only allow known-safe external links; never hand arbitrary schemes to the OS.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternal(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Block top-level navigation away from the app bundle.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
      if (isSafeExternal(url)) shell.openExternal(url)
    }
  })

  // The app needs no device permissions of its own.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('render-process-gone', details)
    clearSession(webContentsId)
  })

  mainWindow.webContents.on('destroyed', () => {
    clearSession(webContentsId)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (gotLock) {
  app.whenReady().then(() => {
    if (!isDev) Menu.setApplicationMenu(null)
    try {
      createDatabase(join(app.getPath('userData'), 'pocketvault.db'))
      registerIpcHandlers()
      // Clean up abandoned receipt uploads left by cancelled forms/crashes.
      reconcileReceipts(getDatabase(), receiptsDir())
    } catch (error) {
      log.error('startup failed', error)
      dialog.showErrorBox(
        'PocketVault could not start',
        `The local database failed to initialize.\n\n${error?.message ?? error}`
      )
      app.quit()
      return
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try {
    clearReminders()
    closeDatabase()
  } catch (error) {
    log.error('shutdown cleanup failed', error)
  }
})
