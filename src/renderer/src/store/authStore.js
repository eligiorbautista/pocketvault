import { api } from '@renderer/lib/api.js'
import { create } from 'zustand'
import { SESSION_STORAGE_KEY } from '@shared/constants.js'
import { clearDebtReminders } from '@renderer/lib/notifications.js'

function persistSession(user) {
  // Persisting is a convenience for the next launch; a storage-restricted
  // environment must not turn a successful login into a failure.
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id: user.id, username: user.username })
    )
  } catch {
    // ignore — the main-process session is already established
  }
}

function clearPersistedSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const useAuthStore = create((set) => ({
  user: null,
  status: 'loading',
  error: null,
  // True when the session was resumed automatically (no password this launch).
  viaRestore: false,

  async bootstrap() {
    // An in-app refresh (Ctrl+R) keeps the main-process session for this
    // renderer alive, so resume silently without treating it as a fresh launch.
    try {
      const existing = await api.auth.current()
      if (existing?.user) {
        set({ user: existing.user, status: 'authenticated', error: null, viaRestore: false })
        return
      }
    } catch {
      // fall through to the persisted-session restore below
    }

    let raw = null
    try {
      raw = localStorage.getItem(SESSION_STORAGE_KEY)
    } catch {
      raw = null
    }
    if (!raw) {
      set({ status: 'unauthenticated', user: null, viaRestore: false })
      return
    }
    try {
      const parsed = JSON.parse(raw)
      const { user } = await api.auth.restore(parsed.id)
      set({ user, status: 'authenticated', error: null, viaRestore: true })
    } catch {
      clearPersistedSession()
      set({ user: null, status: 'unauthenticated', error: null, viaRestore: false })
    }
  },

  async login(username, password) {
    const { user } = await api.auth.login(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null, viaRestore: false })
  },

  async register(username, password) {
    const { user } = await api.auth.register(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null, viaRestore: false })
  },

  async logout() {
    try {
      await clearDebtReminders()
    } catch {
      // ignore — clearing reminders must never block sign-out
    }
    try {
      await api.auth.logout()
    } finally {
      clearPersistedSession()
      set({ user: null, status: 'unauthenticated', error: null, viaRestore: false })
    }
  }
}))
