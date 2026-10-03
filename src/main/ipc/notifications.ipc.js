import { handle } from './handle.js'
import { clearReminders, scheduleReminders, showReminder } from '../services/reminders.js'

export function registerNotificationsHandlers() {
  handle('notifications:schedule', ({ payload }) => scheduleReminders(payload.plan))
  handle('notifications:show', ({ payload }) => showReminder(payload))
  handle('notifications:clear', () => {
    clearReminders()
    return { cleared: true }
  })
}
