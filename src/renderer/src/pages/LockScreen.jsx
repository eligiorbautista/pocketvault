import { useEffect, useState } from 'react'
import { useAuthStore } from '@renderer/store/authStore.js'
import { isCapacitor } from '@renderer/lib/platform.js'
import { Biometric } from '@renderer/lib/biometric.js'
import { AuthLayout } from '@renderer/components/layout/AuthLayout.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export default function LockScreen() {
  const user = useAuthStore((state) => state.user)
  const unlock = useAuthStore((state) => state.unlock)
  const logout = useAuthStore((state) => state.logout)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const authenticate = async (auto = false) => {
    setError(null)
    setBusy(true)
    try {
      await Biometric.authenticate()
      await unlock()
    } catch (err) {
      // A cancelled prompt is not an error worth shouting about.
      if (!/cancel/i.test(String(err?.message ?? ''))) {
        setError(err?.message || 'Device unlock was not completed')
      }
      if (auto) setError(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (isCapacitor) authenticate(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthLayout
      title="PocketVault is locked"
      subtitle={user?.username ? `Welcome back, ${user.username}` : 'Unlock to continue'}
      footer={
        <button
          type="button"
          onClick={logout}
          className="font-medium text-accent-700 hover:underline dark:text-accent-400"
        >
          Sign in with account password
        </button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {isCapacitor ? (
          <>
            <Button type="button" className="w-full" loading={busy} onClick={() => authenticate()}>
              Unlock with device biometric or screen lock
            </Button>
            <p className="text-center text-xs text-slate-500 dark:text-dark-faint">
              Uses your phone&rsquo;s screen lock. PocketVault does not keep a separate PIN.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-dark-faint">
            App lock is available on Android. Use your account password on this device.
          </p>
        )}
      </div>
    </AuthLayout>
  )
}
