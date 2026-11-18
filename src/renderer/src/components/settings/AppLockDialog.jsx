import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, PasswordInput } from '@renderer/components/ui/Input.jsx'
import { toast } from '@renderer/store/uiStore.js'

export function AppLockDialog({ open, enabled, onClose, onSaved }) {
  const [mode, setMode] = useState('set')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('set')
    setPassword('')
    setPin('')
    setConfirm('')
    setError(null)
  }, [open])

  const save = async (event) => {
    event.preventDefault()
    setError(null)
    if (!password) return setError('Enter your account password')
    if (mode === 'set') {
      if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 digits')
      if (pin !== confirm) return setError('PINs do not match')
    }
    setSaving(true)
    try {
      if (mode === 'set') await api.auth.setAppLock(password, pin)
      else await api.auth.disableAppLock(password)
      toast(mode === 'set' ? 'App lock updated' : 'App lock removed', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'off' ? 'Turn off app lock' : enabled ? 'Change app lock PIN' : 'Set app lock PIN'}
      description="The PIN is checked in the main process and hashed before it is stored."
      footer={
        <div className="flex justify-end gap-2">
          {enabled ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMode(mode === 'off' ? 'set' : 'off')
                setError(null)
              }}
            >
              {mode === 'off' ? 'Keep app lock' : 'Turn off instead'}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="app-lock-form" loading={saving}>
            {mode === 'off' ? 'Turn off app lock' : 'Save PIN'}
          </Button>
        </div>
      }
    >
      <form id="app-lock-form" onSubmit={save} className="space-y-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <Field label="Account password" htmlFor="app-lock-password">
          <PasswordInput
            id="app-lock-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {mode === 'set' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New PIN" htmlFor="app-lock-new-pin" hint="4 to 6 digits.">
              <Input
                id="app-lock-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <Field label="Confirm PIN" htmlFor="app-lock-confirm-pin">
              <Input
                id="app-lock-confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-dark-faint">
            The saved PIN will be removed. You can still sign in with your account password.
          </p>
        )}
      </form>
    </Modal>
  )
}
