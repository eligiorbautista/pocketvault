import { api } from '@renderer/lib/api.js'
import { create } from 'zustand'
import { DEFAULT_CURRENCY } from '@shared/currency.js'
import { DEFAULT_LEAD_DAYS } from '@shared/reminders.js'

const DEFAULTS = {
  currency: DEFAULT_CURRENCY,
  requirePasswordOnStart: false,
  remindersEnabled: false,
  reminderLeadDays: DEFAULT_LEAD_DAYS
}

export const useSettingsStore = create((set) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    const settings = await api.settings.get()
    set({
      currency: settings.currency,
      requirePasswordOnStart: settings.requirePasswordOnStart,
      remindersEnabled: settings.remindersEnabled,
      reminderLeadDays: settings.reminderLeadDays,
      loaded: true
    })
    return settings
  },

  async update(patch) {
    const settings = await api.settings.update(patch)
    set({
      currency: settings.currency,
      requirePasswordOnStart: settings.requirePasswordOnStart,
      remindersEnabled: settings.remindersEnabled,
      reminderLeadDays: settings.reminderLeadDays
    })
    return settings
  },

  reset() {
    set({ ...DEFAULTS, loaded: false })
  }
}))
