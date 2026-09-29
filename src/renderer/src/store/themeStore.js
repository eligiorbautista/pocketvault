import { create } from 'zustand'

// Theme preference is purely a client concern (no DB row), persisted to
// localStorage so it survives restarts on both Electron and Capacitor.
const STORAGE_KEY = 'pocketvault.theme'
export const THEME_OPTIONS = ['light', 'dark', 'system']
const DEFAULT_PREFERENCE = 'system'

const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined'

function readStoredPreference() {
  if (!canUseDOM) return DEFAULT_PREFERENCE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return THEME_OPTIONS.includes(stored) ? stored : DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

export function systemPrefersDark() {
  if (!canUseDOM || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(preference) {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

// Applies the resolved theme to <html> and returns it.
export function applyTheme(preference) {
  const resolved = resolveTheme(preference)
  if (!canUseDOM) return resolved
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  return resolved
}

// Apply immediately at module load so the first paint already has the right
// background (avoids a light flash before React mounts).
applyTheme(readStoredPreference())

export const useThemeStore = create((set, get) => ({
  preference: readStoredPreference(),
  resolved: resolveTheme(readStoredPreference()),

  setPreference(preference) {
    if (!THEME_OPTIONS.includes(preference)) return
    if (canUseDOM) {
      try {
        window.localStorage.setItem(STORAGE_KEY, preference)
      } catch {
        // ignore storage failures (private mode, etc.)
      }
    }
    set({ preference, resolved: applyTheme(preference) })
  },

  // Re-resolve only when following the OS setting; manual choices stick.
  syncSystem() {
    if (get().preference !== 'system') return
    set({ resolved: applyTheme('system') })
  }
}))
