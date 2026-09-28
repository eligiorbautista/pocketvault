import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { toast } from '@renderer/store/uiStore.js'

const CONFIRM_PHRASE = 'delete all my data'

export function DeleteDataForm({ open, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm({ defaultValues: { phrase: '', password: '' } })

  useEffect(() => {
    if (open) reset({ phrase: '', password: '' })
  }, [open, reset])

  const phrase = watch('phrase') ?? ''
  const password = watch('password') ?? ''
  const phraseConfirmed = phrase.trim().toLowerCase() === CONFIRM_PHRASE

  const onSubmit = async (values) => {
    setBusy(true)
    try {
      await window.api.account.deleteData(values.password)
      toast('All data deleted', 'success', { description: 'Your account is still active.' })
      onDeleted?.()
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
      title="Delete all data"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="delete-data-form"
            loading={busy}
            disabled={!phraseConfirmed || password.length === 0}
          >
            Delete all data
          </Button>
        </div>
      }
    >
      <form id="delete-data-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          This permanently deletes all of your income, expenses, debts, budgets and savings records,
          including their receipts. Your account and password stay the same. This cannot be undone.
        </div>

        <Field
          label={
            <>
              Type <span className="font-semibold">delete all my data</span> to confirm
            </>
          }
          htmlFor="delete-phrase"
          error={errors.phrase?.message}
          required
        >
          <Input
            id="delete-phrase"
            autoComplete="off"
            autoFocus
            placeholder="delete all my data"
            hasError={Boolean(errors.phrase)}
            {...register('phrase', { required: 'Please type the confirmation phrase' })}
          />
        </Field>

        <Field label="Password" htmlFor="delete-password" error={errors.password?.message} required>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
            {...register('password', { required: 'Password is required' })}
          />
        </Field>
      </form>
    </Modal>
  )
}
