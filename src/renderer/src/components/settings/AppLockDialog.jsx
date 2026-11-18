import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { PasswordInput } from '@renderer/components/ui/Input.jsx'
import { toast } from '@renderer/store/uiStore.js'

export function AppLockDialog({ open, enabled, onClose, onSaved }) {
  const [mode, setMode] = useState('on')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('on')
    setPassword('')
    setError(null)
  }, [open])

  const save = async (event) => {
    event.preventDefault()
    setError(null)
    if (!password) return setError('Enter your account password')
    setSaving(true)
    try {
      if (mode === 'on') await api.auth.setAppLock(password)
      else await api.auth.disableAppLock(password)
      toast(mode === 'on' ? 'Device lock enabled' : 'Device lock removed', 'success')
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
      title={mode === 'off' ? 'Turn off device lock' : enabled ? 'Manage device lock' : 'Enable device lock'}
      description="Uses your phone's biometric or screen lock. The app never sees your device PIN."
      footer={
        <div className="flex justify-end gap-2">
          {enabled ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMode(mode === 'off' ? 'on' : 'off')
                setError(null)
              }}
            >
              {mode === 'off' ? 'Keep device lock' : 'Turn off instead'}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="app-lock-form" loading={saving}>
            {mode === 'off' ? 'Turn off device lock' : enabled ? 'Keep device lock' : 'Enable device lock'}
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
        <p className="text-sm text-slate-500 dark:text-dark-faint">
          {mode === 'off'
            ? 'The device lock will be removed. You can still sign in with your account password.'
            : 'On Android, PocketVault will ask for your device biometric or screen lock when it reopens.'}
        </p>
      </form>
    </Modal>
  )
}
