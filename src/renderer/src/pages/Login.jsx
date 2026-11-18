import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '@renderer/store/authStore.js'
import { AuthLayout } from '@renderer/components/layout/AuthLayout.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, PasswordInput } from '@renderer/components/ui/Input.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export default function Login() {
  const login = useAuthStore((state) => state.login)
  const restoreBackup = useAuthStore((state) => state.restoreBackup)
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [restoreError, setRestoreError] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm({ defaultValues: { username: '', password: '' } })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await login(values.username.trim(), values.password)
      navigate('/', { replace: true })
    } catch (error) {
      setServerError(error.message)
    }
  }

  const onRestore = async (event) => {
    event.preventDefault()
    setRestoreError(null)
    if (!restorePassphrase) return setRestoreError('Enter the backup password')
    if (!restorePassword) return setRestoreError('Enter the account password')
    setRestoring(true)
    try {
      const restored = await restoreBackup(restorePassphrase, restorePassword)
      if (restored) navigate('/', { replace: true })
    } catch (error) {
      setRestoreError(error.message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your PocketVault"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-accent-700 hover:underline dark:text-accent-400">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Username" htmlFor="username" error={errors.username?.message} required>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            hasError={Boolean(errors.username)}
            {...register('username', { required: 'Username is required' })}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
            {...register('password', { required: 'Password is required' })}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-dark-border">
        <button
          type="button"
          onClick={() => setRestoreOpen((value) => !value)}
          className="w-full cursor-pointer text-sm font-medium text-accent-700 hover:underline dark:text-accent-400"
        >
          {restoreOpen ? 'Cancel restore' : 'Restore from backup'}
        </button>

        {restoreOpen ? (
          <form onSubmit={onRestore} className="mt-4 space-y-3">
            <p className="text-xs text-slate-500 dark:text-dark-faint">
              Choose an encrypted PocketVault backup. On a new device the account password
              becomes the password for the restored account.
            </p>
            <Field label="Backup password" htmlFor="restore-passphrase">
              <PasswordInput
                id="restore-passphrase"
                autoComplete="off"
                value={restorePassphrase}
                onChange={(event) => setRestorePassphrase(event.target.value)}
              />
            </Field>
            <Field label="Account password" htmlFor="restore-password">
              <PasswordInput
                id="restore-password"
                autoComplete="current-password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
              />
            </Field>
            {restoreError ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {restoreError}
              </p>
            ) : null}
            <Button type="submit" variant="secondary" className="w-full" loading={restoring}>
              Choose backup and restore
            </Button>
          </form>
        ) : null}
      </div>
    </AuthLayout>
  )
}
