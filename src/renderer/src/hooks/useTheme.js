import { useEffect } from 'react'
import { useThemeStore } from '@renderer/store/themeStore.js'

// Watches the OS colour scheme and keeps the `dark` class on <html> in sync
// with the user's preference. Call once near the app root.
export function useTheme() {
  const preference = useThemeStore((state) => state.preference)
  const resolved = useThemeStore((state) => state.resolved)
  const setPreference = useThemeStore((state) => state.setPreference)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => useThemeStore.getState().syncSystem()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  useEffect(() => {
    useThemeStore.getState().syncSystem()
  }, [preference])

  return { preference, resolved, setPreference }
}
