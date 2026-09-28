import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { toast } from '@renderer/store/uiStore.js'

export function ChangePasswordForm({ open, onClose }) {
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors }
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })

  useEffect(() => {
    if (open) {
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' })
    }
  }, [open, reset])

  const onSubmit = async (values) => {
    setBusy(true)
    try {
      await window.api.auth.changePassword(values.currentPassword, values.newPassword)
      toast('Password updated', 'success')
      onClose()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Enter your current password to set a new one."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="change-password-form" loading={busy}>
            Update password
          </Button>
        </div>
      }
    >
      <form
        id="change-password-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={errors.currentPassword?.message}
          required
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            hasError={Boolean(errors.currentPassword)}
            {...register('currentPassword', { required: 'Current password is required' })}
          />
        </Field>

        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message} required>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.newPassword)}
            {...register('newPassword', { required: 'New password is required' })}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
          required
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.confirmPassword)}
            {...register('confirmPassword', {
              required: 'Please confirm the new password',
              validate: (value) => value === getValues('newPassword') || 'Passwords do not match'
            })}
          />
        </Field>
      </form>
    </Modal>
  )
}
