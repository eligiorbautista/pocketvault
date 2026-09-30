import { Notification } from 'electron'

// Desktop reminders only fire while the app is running (Electron has no
// background scheduler). The renderer builds the plan (shared logic) and hands
// it over; we keep one chained timer that always points at the next reminder.
const MAX_DELAY_MS = 2_000_000_000 // Node setTimeout ceiling (~24.8 days)

let pending = []
let fired = new Set()
let timer = null

function show(item) {
  if (!Notification.isSupported()) return
  try {
    new Notification({ title: item.title, body: item.body }).show()
  } catch {
    // Never let a notification failure crash the main process.
  }
}

function armNext() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!Notification.isSupported()) return
  const now = Date.now()

  // Deliver anything already due (e.g. overdue reminders) exactly once.
  let index = 0
  while (index < pending.length && pending[index].at <= now) {
    const { item } = pending[index]
    if (!fired.has(item.key)) {
      fired.add(item.key)
      show(item)
    }
    index += 1
  }

  const next = pending[index]
  if (!next) return
  timer = setTimeout(armNext, Math.min(next.at - now, MAX_DELAY_MS))
  if (typeof timer.unref === 'function') timer.unref()
}

function resetTimers() {
  if (timer) clearTimeout(timer)
  timer = null
  pending = []
}

export function clearReminders() {
  resetTimers()
  fired = new Set()
}

export function scheduleReminders(plan = []) {
  // Keep `fired` so overdue reminders are not repeated on every resync; it is
  // only reset by clearReminders (logout / disabling reminders / app quit).
  resetTimers()
  pending = (Array.isArray(plan) ? plan : [])
    .map((item) => ({ item, at: new Date(item?.at).getTime() }))
    .filter((entry) => Number.isFinite(entry.at) && entry.item?.key)
    .sort((a, b) => a.at - b.at)
  armNext()
  return { scheduled: pending.length, supported: Notification.isSupported() }
}
