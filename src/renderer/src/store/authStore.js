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
  locked: false,
  // True when the session was resumed automatically (no password this launch).
  viaRestore: false,

  async bootstrap() {
    // An in-app refresh (Ctrl+R) keeps the main-process session for this
    // renderer alive, so resume silently without treating it as a fresh launch.
    try {
      const existing = await api.auth.current()
      if (existing?.user) {
        set({ user: existing.user, status: 'authenticated', error: null, locked: false, viaRestore: false })
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
      set({ status: 'unauthenticated', user: null, locked: false, viaRestore: false })
      return
    }
    try {
      const parsed = JSON.parse(raw)
      const result = await api.auth.restore(parsed.id)
      if (result.locked) {
        set({ user: result.user, status: 'locked', error: null, locked: true, viaRestore: true })
        return
      }
      const { user } = result
      set({ user, status: 'authenticated', error: null, locked: false, viaRestore: true })
    } catch {
      clearPersistedSession()
      set({ user: null, status: 'unauthenticated', error: null, locked: false, viaRestore: false })
    }
  },

  async unlock() {
    const { user } = await api.auth.unlock()
    persistSession(user)
    set({ user, status: 'authenticated', error: null, locked: false, viaRestore: true })
  },

  async login(username, password) {
    const { user } = await api.auth.login(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null, locked: false, viaRestore: false })
  },

  async restoreBackup(passphrase, password) {
    const result = await api.backup.restoreLogin(passphrase, password)
    if (!result.restored) return false
    persistSession(result.user)
    set({ user: result.user, status: 'authenticated', error: null, locked: false, viaRestore: false })
    return true
  },

  async register(username, password) {
    const { user } = await api.auth.register(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null, locked: false, viaRestore: false })
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
      set({ user: null, status: 'unauthenticated', error: null, locked: false, viaRestore: false })
    }
  }
}))
