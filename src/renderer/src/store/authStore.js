import { create } from 'zustand'
import { SESSION_STORAGE_KEY } from '@shared/constants.js'

function persistSession(user) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ id: user.id, username: user.username })
  )
}

function clearPersistedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

export const useAuthStore = create((set) => ({
  user: null,
  status: 'loading',
  error: null,

  async bootstrap() {
    let raw = null
    try {
      raw = localStorage.getItem(SESSION_STORAGE_KEY)
    } catch {
      raw = null
    }
    if (!raw) {
      set({ status: 'unauthenticated', user: null })
      return
    }
    try {
      const parsed = JSON.parse(raw)
      const { user } = await window.api.auth.restore(parsed.id)
      set({ user, status: 'authenticated', error: null })
    } catch {
      clearPersistedSession()
      set({ user: null, status: 'unauthenticated', error: null })
    }
  },

  async login(username, password) {
    const { user } = await window.api.auth.login(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null })
  },

  async register(username, password) {
    const { user } = await window.api.auth.register(username, password)
    persistSession(user)
    set({ user, status: 'authenticated', error: null })
  },

  async logout() {
    try {
      await window.api.auth.logout()
    } finally {
      clearPersistedSession()
      set({ user: null, status: 'unauthenticated', error: null })
    }
  }
}))
