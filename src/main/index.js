import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import { closeDatabase, createDatabase, getDatabase } from './db/connection.js'
import { clearSession } from './db/session.js'
import { registerIpcHandlers } from './ipc/index.js'
import { receiptsDir } from './services/receipts.js'
import { reconcileReceipts } from './services/receiptCleanup.js'
import { clearReminders } from './services/reminders.js'

const isDev = !app.isPackaged

// Required for Windows to show notifications under the right app identity.
app.setAppUserModelId('com.pocketvault.app')

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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

app.whenReady().then(() => {
  try {
    createDatabase(join(app.getPath('userData'), 'pocketvault.db'))
    registerIpcHandlers()
    // Clean up abandoned receipt uploads left by cancelled forms/crashes.
    reconcileReceipts(getDatabase(), receiptsDir())
  } catch (error) {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  clearReminders()
  closeDatabase()
})
