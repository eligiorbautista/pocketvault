import { api } from '@renderer/lib/api.js'
import { create } from 'zustand'
import { DEFAULT_CURRENCY } from '@shared/currency.js'

export const useSettingsStore = create((set) => ({
  currency: DEFAULT_CURRENCY,
  requirePasswordOnStart: false,
  loaded: false,

  async load() {
    const settings = await api.settings.get()
    set({
      currency: settings.currency,
      requirePasswordOnStart: settings.requirePasswordOnStart,
      loaded: true
    })
    return settings
  },

  async update(patch) {
    const settings = await api.settings.update(patch)
    set({
      currency: settings.currency,
      requirePasswordOnStart: settings.requirePasswordOnStart
    })
    return settings
  },

  reset() {
    set({ currency: DEFAULT_CURRENCY, requirePasswordOnStart: false, loaded: false })
  }
}))
