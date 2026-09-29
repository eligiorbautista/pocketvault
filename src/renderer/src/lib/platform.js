import { Capacitor } from '@capacitor/core'

// Electron exposes the preload bridge on window.api; Capacitor native has no
// such bridge, so the renderer routes through the Capacitor adapter instead.
export const isElectron =
  typeof window !== 'undefined' && Boolean(window.api && window.api.auth)

export const isCapacitor = !isElectron && Capacitor.isNativePlatform()

export const platform = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web'
