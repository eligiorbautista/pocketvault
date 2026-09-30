import { handle } from './handle.js'
import { clearReminders, scheduleReminders } from '../services/reminders.js'

export function registerNotificationsHandlers() {
  handle('notifications:schedule', ({ payload }) => scheduleReminders(payload.plan))
  handle('notifications:clear', () => {
    clearReminders()
    return { cleared: true }
  })
}
