import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { HandCoins, Trash2 } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Textarea } from '@renderer/components/ui/Input.jsx'
import { Badge, statusVariant } from '@renderer/components/ui/Badge.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { formatCurrency, formatDate, paymentTypeLabel, todayInput } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

function LedgerForm({ mode, debtId, onDone }) {
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({ defaultValues: { amount: '', date: todayInput(), notes: '' } })

  useEffect(() => {
    reset({ amount: '', date: todayInput(), notes: '' })
  }, [mode, reset])

  const onSubmit = async (values) => {
    setBusy(true)
    try {
      const payload = {
        amount: Number(values.amount),
        date: values.date,
        notes: values.notes
      }
      if (mode === 'reborrow') await window.api.debts.reborrow(debtId, payload)
      else await window.api.debts.addPayment(debtId, payload)
      toast(mode === 'reborrow' ? 'Re-borrow recorded' : 'Payment recorded', 'success')
      reset({ amount: '', date: todayInput(), notes: '' })
      onDone()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" htmlFor={`${mode}-amount`} error={errors.amount?.message} required>
          <Input
            id={`${mode}-amount`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            hasError={Boolean(errors.amount)}
            {...register('amount', {
              required: 'Amount is required',
              validate: (value) => Number(value) > 0 || 'Must be greater than zero'
            })}
          />
        </Field>
        <Field label="Date" htmlFor={`${mode}-date`} error={errors.date?.message} required>
          <Input
            id={`${mode}-date`}
            type="date"
            hasError={Boolean(errors.date)}
            {...register('date', { required: 'Date is required' })}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${mode}-notes`}>
        <Input id={`${mode}-notes`} placeholder="Optional" {...register('notes')} />
      </Field>
      <Button type="submit" size="sm" loading={busy} variant={mode === 'reborrow' ? 'secondary' : 'primary'}>
        {mode === 'reborrow' ? 'Add re-borrow' : 'Record payment'}
      </Button>
    </form>
  )
}

export function DebtDetail({ debtId, open, onClose, onChanged }) {
  const [mode, setMode] = useState('payment')
  const [pendingPayment, setPendingPayment] = useState(null)
  const [removing, setRemoving] = useState(false)

  const debtQuery = useApiData(
    () => (debtId ? window.api.debts.get(debtId) : Promise.resolve(null)),
    [debtId, open]
  )
  const paymentsQuery = useApiData(
    () => (debtId ? window.api.debts.payments(debtId) : Promise.resolve([])),
    [debtId, open]
  )

  const debt = debtQuery.data
  const payments = paymentsQuery.data ?? []

  const refresh = () => {
    debtQuery.reload()
    paymentsQuery.reload()
    onChanged?.()
  }

  const confirmRemovePayment = async () => {
    if (!pendingPayment) return
    setRemoving(true)
    try {
      await window.api.debts.removePayment(pendingPayment.id)
      toast('Ledger entry removed', 'success')
      setPendingPayment(null)
      refresh()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setRemoving(false)
    }
  }

  const paidPercent =
    debt && debt.total_amount > 0 ? (debt.paid_amount / debt.total_amount) * 100 : 0

  return (
    <Modal open={open} onClose={onClose} title="Debt details" size="lg">
      {debtQuery.loading || !debt ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-900">{debt.creditor}</p>
              <p className="text-xs text-slate-500">{paymentTypeLabel(debt.payment_type)}</p>
            </div>
            <Badge variant={statusVariant(debt.effective_status)}>{debt.effective_status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
              <p className="text-sm font-semibold text-slate-900">{formatCurrency(debt.total_amount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Paid</p>
              <p className="text-sm font-semibold text-accent-700">{formatCurrency(debt.paid_amount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Remaining</p>
              <p className="text-sm font-semibold text-red-600">{formatCurrency(debt.remaining_amount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Due date</p>
              <p className="text-sm font-semibold text-slate-900">{formatDate(debt.due_date)}</p>
            </div>
          </div>

          <div>
            <ProgressBar percent={paidPercent} />
            <p className="mt-1 text-xs text-slate-500">
              {Math.round(paidPercent)}% paid
              {debt.payment_type === 'monthly' && debt.monthly_amount
                ? ` \u00b7 ${formatCurrency(debt.monthly_amount)} due every month on day ${debt.payment_day}`
                : ''}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="flex gap-1 border-b border-slate-100 p-2">
              <Button
                size="sm"
                variant={mode === 'payment' ? 'subtle' : 'ghost'}
                onClick={() => setMode('payment')}
              >
                Payment
              </Button>
              <Button
                size="sm"
                variant={mode === 'reborrow' ? 'subtle' : 'ghost'}
                onClick={() => setMode('reborrow')}
              >
                Re-borrow
              </Button>
            </div>
            <div className="p-3">
              <LedgerForm mode={mode} debtId={debt.id} onDone={refresh} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Payment history</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={payment.payment_type === 'reborrow' ? 'warning' : 'success'}>
                          {payment.payment_type === 'reborrow' ? 'Re-borrow' : 'Payment'}
                        </Badge>
                        <span className="text-sm font-medium text-slate-900">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(payment.date)}
                        {payment.notes ? ` \u00b7 ${payment.notes}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove ledger entry"
                      onClick={() => setPendingPayment(payment)}
                    >
                      <Trash2 size={16} className="text-red-500" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingPayment)}
        title="Remove ledger entry?"
        message="Removing a payment or re-borrow recalculates the debt balance."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={confirmRemovePayment}
        onCancel={() => setPendingPayment(null)}
      />
    </Modal>
  )
}
