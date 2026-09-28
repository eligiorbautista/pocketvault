import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '@renderer/store/authStore.js'
import { AuthLayout } from '@renderer/components/layout/AuthLayout.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export default function Login() {
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
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

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your PocketVault"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-accent-700 hover:underline">
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
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
            {...register('password', { required: 'Password is required' })}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
