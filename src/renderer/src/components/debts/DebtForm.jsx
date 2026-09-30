import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { DEBT_PAYMENT_TYPES } from '@shared/constants.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select, Textarea } from '@renderer/components/ui/Input.jsx'
import { ReceiptField } from '@renderer/components/ui/ReceiptField.jsx'
import { todayInput } from '@renderer/lib/format.js'
import { toast } from '@renderer/store/uiStore.js'

export function DebtForm({ open, initial, onClose, onSaved }) {
  const [receiptPath, setReceiptPath] = useState(null)
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
        first_payment_date: initial?.first_payment_date ?? todayInput(),
        notes: initial?.notes ?? ''
      })
      setReceiptPath(initial?.receipt_path ?? null)
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
      first_payment_date: values.payment_type === 'monthly' ? values.first_payment_date : null,
      receipt_path: receiptPath,
      notes: values.notes
    }
    try {
      const saved = initial
        ? await api.debts.update(initial.id, payload)
        : await api.debts.create(payload)

      if (
        initial?.receipt_path &&
        initial.receipt_path !== saved.receipt_path &&
        initial.receipt_path !== receiptPath
      ) {
        api.files.deleteReceipt(initial.receipt_path).catch(() => {})
      }

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
        <Field label="Creditor" htmlFor="creditor" error={errors.creditor?.message}>
          <Input
            id="creditor"
            placeholder="e.g. Bank, friend, landlord"
            hasError={Boolean(errors.creditor)}
            {...register('creditor', { required: 'Creditor is required' })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total amount" htmlFor="total_amount" error={errors.total_amount?.message}>
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
          <Field label="Due date" htmlFor="due_date" error={errors.due_date?.message}>
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
            <Field
              label="Monthly amount"
              htmlFor="monthly_amount"
              error={errors.monthly_amount?.message}
            >
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
            <Field
              label="First payment date"
              htmlFor="first_payment_date"
              error={errors.first_payment_date?.message}
            >
              <Input
                id="first_payment_date"
                type="date"
                hasError={Boolean(errors.first_payment_date)}
                {...register('first_payment_date', {
                  required: 'First payment date is required'
                })}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Proof" htmlFor="debt-receipt" hint="Optional. Attach a photo or PDF.">
          <ReceiptField id="debt-receipt" value={receiptPath} onChange={setReceiptPath} />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Optional details" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
