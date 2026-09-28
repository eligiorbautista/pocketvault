import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { USERNAME_PATTERN } from '@shared/constants.js'
import { useAuthStore } from '@renderer/store/authStore.js'
import { AuthLayout } from '@renderer/components/layout/AuthLayout.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export default function Register() {
  const registerUser = useAuthStore((state) => state.register)
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm({ defaultValues: { username: '', password: '', confirm: '' } })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await registerUser(values.username.trim(), values.password)
      navigate('/', { replace: true })
    } catch (error) {
      setServerError(error.message)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up a local PocketVault profile"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="Username"
          htmlFor="username"
          error={errors.username?.message}
          hint="3-30 characters: letters, numbers, underscore or dot."
          required
        >
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            hasError={Boolean(errors.username)}
            {...register('username', {
              required: 'Username is required',
              pattern: {
                value: USERNAME_PATTERN,
                message: 'Use 3-30 letters, numbers, _ or .'
              }
            })}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.password)}
            {...register('password', {
              required: 'Password is required'
            })}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message} required>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.confirm)}
            {...register('confirm', {
              required: 'Please confirm your password',
              validate: (value) => value === getValues('password') || 'Passwords do not match'
            })}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
