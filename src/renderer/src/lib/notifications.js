import { api } from '@renderer/lib/api.js'
import { platform } from '@renderer/lib/platform.js'
import { useSettingsStore } from '@renderer/store/settingsStore.js'
import { buildReminderPlan, DEFAULT_LEAD_DAYS } from '@shared/reminders.js'

const CHANNEL_ID = 'debt-reminders'
const PAGE_SIZE = 500
const ID_BASE = 1_000_000_000

let inflight = null

async function buildPlan() {
  const leadDays = useSettingsStore.getState().reminderLeadDays ?? DEFAULT_LEAD_DAYS
  const debts = []
  for (let page = 1; ; page += 1) {
    const result = await api.debts.list({ page, pageSize: PAGE_SIZE })
    debts.push(...(result.rows ?? []))
    if (!result.totalPages || page >= result.totalPages) break
  }

  const paymentsByDebtId = {}
  for (const debt of debts) {
    paymentsByDebtId[debt.id] = (await api.debts.payments(debt.id)) ?? []
  }

  return buildReminderPlan(debts, paymentsByDebtId, { leadDays, now: new Date() })
}

// Stable positive int (Java int range) so our notifications can be found and
// cancelled without touching any other app's notifications.
function reminderId(reminder) {
  let hash = 0
  for (let index = 0; index < reminder.key.length; index += 1) {
    hash = (hash * 31 + reminder.key.charCodeAt(index)) | 0
  }
  return (Math.abs(hash) % 1_000_000_000) + ID_BASE
}

async function clearAndroid(plugin) {
  const pending = await plugin.getPending().catch(() => ({ notifications: [] }))
  const ours = (pending.notifications ?? []).filter((notification) => notification.id >= ID_BASE)
  if (ours.length) await plugin.cancel({ notifications: ours }).catch(() => {})
}

async function runAndroid(enabled) {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  if (!enabled) {
    await clearAndroid(LocalNotifications)
    return { scheduled: 0, disabled: true }
  }

  let permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') return { scheduled: 0, denied: true }

  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Debt reminders',
    description: 'Payment due and overdue reminders',
    importance: 4,
    visibility: 1
  }).catch(() => {})

  const plan = await buildPlan()
  await clearAndroid(LocalNotifications)
  if (plan.length) {
    await LocalNotifications.schedule({
      notifications: plan.map((reminder) => ({
        id: reminderId(reminder),
        title: reminder.title,
        body: reminder.body,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(reminder.at), allowWhileIdle: true }
      }))
    })
  }
  return { scheduled: plan.length }
}

async function runDesktop(enabled) {
  if (!enabled) {
    await api.notifications.clear()
    return { cleared: true }
  }
  const plan = await buildPlan()
  return api.notifications.schedule(
    plan.map((reminder) => ({ ...reminder, at: new Date(reminder.at).toISOString() }))
  )
}

// Rebuilds and (re)registers the reminder schedule for the current user. Safe
// to call repeatedly; overlapping calls are coalesced.
export async function syncDebtReminders() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { remindersEnabled } = useSettingsStore.getState()
      if (platform === 'electron') return await runDesktop(remindersEnabled)
      if (platform === 'capacitor') return await runAndroid(remindersEnabled)
      return { skipped: true }
    } catch (error) {
      console.error('Failed to sync debt reminders', error)
      return { error: true }
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Cancels every reminder we scheduled (called on logout / before re-syncing).
export async function clearDebtReminders() {
  try {
    if (platform === 'electron') await api.notifications.clear()
    else if (platform === 'capacitor') {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await clearAndroid(LocalNotifications)
    }
  } catch (error) {
    console.error('Failed to clear debt reminders', error)
  }
}
