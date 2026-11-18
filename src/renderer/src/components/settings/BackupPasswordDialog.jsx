import { useEffect, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { PasswordInput } from '@renderer/components/ui/Input.jsx'

const MIN_LENGTH = 8

export function BackupPasswordDialog({ open, mode = 'export', loading, onClose, onConfirm }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const isExport = mode === 'export'

  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirm('')
    setError(null)
  }, [open, mode])

  const submit = (event) => {
    event.preventDefault()
    if (isExport) {
      if (password.length < MIN_LENGTH) {
        return setError(`Use at least ${MIN_LENGTH} characters`)
      }
      if (password !== confirm) return setError('Passwords do not match')
    }
    setError(null)
    onConfirm(password)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isExport ? 'Protect the backup' : 'Import backup?'}
      description={
        isExport
          ? 'Encrypt this account backup with a password. You will need it to restore the file.'
          : 'Importing replaces all data in this account with the backup. Other accounts are not affected.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="backup-password-form"
            onClick={(event) => {
              event.preventDefault()
              submit(event)
            }}
            loading={loading}
          >
            {isExport ? 'Encrypt & export' : 'Replace account data'}
          </Button>
        </div>
      }
    >
      <form id="backup-password-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-dark-surface-2 dark:text-dark-muted">
          <LockKeyhole size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {isExport
              ? 'There is no recovery key. If you forget this password, the backup cannot be opened.'
              : 'Enter the backup password. Leave it empty only for an older .zip backup.'}
          </span>
        </div>

        <Field
          label={isExport ? 'Backup password' : 'Backup password (if encrypted)'}
          htmlFor="backup-password"
          error={error || undefined}
          hint={isExport ? `At least ${MIN_LENGTH} characters.` : undefined}
        >
          <PasswordInput
            id="backup-password"
            autoComplete={isExport ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hasError={Boolean(error)}
          />
        </Field>

        {isExport ? (
          <Field label="Confirm password" htmlFor="backup-password-confirm">
            <PasswordInput
              id="backup-password-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  )
}
