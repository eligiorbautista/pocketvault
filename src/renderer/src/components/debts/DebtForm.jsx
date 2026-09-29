import { api } from '@renderer/lib/api.js'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { DEBT_PAYMENT_TYPES } from '@shared/constants.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select, Textarea } from '@renderer/components/ui/Input.jsx'
import { todayInput } from '@renderer/lib/format.js'
import { toast } from '@renderer/store/uiStore.js'

export function DebtForm({ open, initial, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm()

  useEffect(() => {
    if (open) {
      reset({
        creditor: initial?.creditor ?? '',
        total_amount: initial?.total_amount ?? '',
        payment_type: initial?.payment_type ?? 'no-schedule',
        due_date: initial?.due_date ?? todayInput(),
        monthly_amount: initial?.monthly_amount ?? '',
        payment_day: initial?.payment_day ?? 1,
        notes: initial?.notes ?? ''
      })
    }
  }, [open, initial, reset])

  const paymentType = watch('payment_type')

  const onSubmit = async (values) => {
    const payload = {
      creditor: values.creditor,
      total_amount: Number(values.total_amount),
      payment_type: values.payment_type,
      due_date: values.payment_type === 'fixed-date' ? values.due_date : null,
      monthly_amount: values.payment_type === 'monthly' ? Number(values.monthly_amount) : null,
      payment_day: values.payment_type === 'monthly' ? Number(values.payment_day) : null,
      notes: values.notes
    }
    try {
      if (initial) await api.debts.update(initial.id, payload)
      else await api.debts.create(payload)
      toast(initial ? 'Debt updated' : 'Debt added', 'success')
      onSaved()
      onClose()
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit debt' : 'Add debt'}
      description="Track money you owe with a flexible payment schedule."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="debt-form" loading={isSubmitting}>
            {initial ? 'Save changes' : 'Add debt'}
          </Button>
        </div>
      }
    >
      <form id="debt-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Creditor" htmlFor="creditor" error={errors.creditor?.message} required>
          <Input
            id="creditor"
            placeholder="e.g. Bank, friend, landlord"
            hasError={Boolean(errors.creditor)}
            {...register('creditor', { required: 'Creditor is required' })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total amount" htmlFor="total_amount" error={errors.total_amount?.message} required>
            <Input
              id="total_amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              hasError={Boolean(errors.total_amount)}
              {...register('total_amount', {
                required: 'Total amount is required',
                validate: (value) => Number(value) > 0 || 'Must be greater than zero'
              })}
            />
          </Field>
          <Field label="Payment type" htmlFor="payment_type">
            <Select id="payment_type" {...register('payment_type')}>
              {DEBT_PAYMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {paymentType === 'fixed-date' ? (
          <Field label="Due date" htmlFor="due_date" error={errors.due_date?.message} required>
            <Input
              id="due_date"
              type="date"
              hasError={Boolean(errors.due_date)}
              {...register('due_date', { required: 'Due date is required for fixed-date debts' })}
            />
          </Field>
        ) : null}

        {paymentType === 'monthly' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly amount" htmlFor="monthly_amount" error={errors.monthly_amount?.message} required>
              <Input
                id="monthly_amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                hasError={Boolean(errors.monthly_amount)}
                {...register('monthly_amount', {
                  required: 'Monthly amount is required',
                  validate: (value) => Number(value) > 0 || 'Must be greater than zero'
                })}
              />
            </Field>
            <Field label="Payment day" htmlFor="payment_day" error={errors.payment_day?.message} required>
              <Input
                id="payment_day"
                type="number"
                min="1"
                max="31"
                hasError={Boolean(errors.payment_day)}
                {...register('payment_day', {
                  required: 'Payment day is required',
                  min: { value: 1, message: 'Between 1 and 31' },
                  max: { value: 31, message: 'Between 1 and 31' }
                })}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Optional details" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
