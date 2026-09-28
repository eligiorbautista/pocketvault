import { ipcMain } from 'electron'
import { requireUserId } from '../db/session.js'

export function handle(channel, fn, { auth = true } = {}) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, payload = {}) => {
    try {
      const userId = auth ? requireUserId(event.sender.id) : null
      const data = await fn({ event, userId, payload: payload ?? {} })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: error?.message || 'Unexpected error' }
    }
  })
}
