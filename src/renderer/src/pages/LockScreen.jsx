import { useState } from 'react'
import { useAuthStore } from '@renderer/store/authStore.js'
import { AuthLayout } from '@renderer/components/layout/AuthLayout.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export default function LockScreen() {
  const user = useAuthStore((state) => state.user)
  const unlock = useAuthStore((state) => state.unlock)
  const logout = useAuthStore((state) => state.logout)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit PIN')
      return
    }
    setBusy(true)
    try {
      await unlock(pin)
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="PocketVault is locked"
      subtitle={user?.username ? `Welcome back, ${user.username}` : 'Enter your PIN to continue'}
      footer={
        <button type="button" onClick={logout} className="font-medium text-accent-700 hover:underline dark:text-accent-400">
          Sign in with password instead
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="PIN" htmlFor="app-lock-pin" error={error}>
          <Input
            id="app-lock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            hasError={Boolean(error)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          Unlock
        </Button>
      </form>
    </AuthLayout>
  )
}
