import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Banknote, History, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Card, CardBody, CardHeader, CardIcon, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { Badge, statusVariant } from '@renderer/components/ui/Badge.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { formatCurrency, formatDate, paymentTypeLabel, todayInput } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

function LedgerForm({ mode, debtId, defaultAmount, onDone }) {
  const [busy, setBusy] = useState(false)
  const suggested = mode === 'payment' && defaultAmount ? defaultAmount : null
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: { amount: suggested ? String(suggested) : '', date: todayInput(), notes: '' }
  })

  useEffect(() => {
    reset({ amount: suggested ? String(suggested) : '', date: todayInput(), notes: '' })
  }, [mode, suggested, reset])

  const onSubmit = async (values) => {
    setBusy(true)
    try {
      const payload = {
        amount: Number(values.amount),
        date: values.date,
        notes: values.notes
      }
      if (mode === 'reborrow') await api.debts.reborrow(debtId, payload)
      else await api.debts.addPayment(debtId, payload)
      toast(mode === 'reborrow' ? 'Re-borrow recorded' : 'Payment recorded', 'success')
      reset({ amount: suggested ? String(suggested) : '', date: todayInput(), notes: '' })
      onDone()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field
        label="Amount"
        htmlFor={`${mode}-amount`}
        error={errors.amount?.message}
        hint={suggested ? 'Prefilled from your monthly installment' : undefined}
        required
      >
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
      <Field label="Notes" htmlFor={`${mode}-notes`}>
        <Input id={`${mode}-notes`} placeholder="Optional" {...register('notes')} />
      </Field>
      <Button
        type="submit"
        className="w-full"
        loading={busy}
        variant={mode === 'reborrow' ? 'secondary' : 'primary'}
      >
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
    () => (debtId ? api.debts.get(debtId) : Promise.resolve(null)),
    [debtId, open]
  )
  const paymentsQuery = useApiData(
    () => (debtId ? api.debts.payments(debtId) : Promise.resolve([])),
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
      await api.debts.removePayment(pendingPayment.id)
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
  const monthlyDefault =
    debt?.payment_type === 'monthly' && debt?.monthly_amount ? debt.monthly_amount : null

  const segmentClass = (active) =>
    cn(
      'h-9 cursor-pointer rounded-md text-sm font-medium transition-colors',
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    )

  return (
    <Modal open={open} onClose={onClose} title="Debt details" size="xl">
      {debtQuery.loading || !debt ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900">{debt.creditor}</p>
                <p className="text-xs text-slate-500">{paymentTypeLabel(debt.payment_type)}</p>
              </div>
              <Badge variant={statusVariant(debt.effective_status)}>{debt.effective_status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(debt.total_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Paid</p>
                <p className="text-sm font-semibold text-accent-700">
                  {formatCurrency(debt.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Remaining</p>
                <p className="text-sm font-semibold text-red-600">
                  {formatCurrency(debt.remaining_amount)}
                </p>
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
                {monthlyDefault
                  ? ` \u00b7 ${formatCurrency(debt.monthly_amount)} due every month on day ${debt.payment_day}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            <aside className="lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1">
              <Card>
                <CardHeader>
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      mode === 'reborrow'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-accent-50 text-accent-700'
                    )}
                  >
                    {mode === 'reborrow' ? (
                      <RotateCcw size={18} aria-hidden="true" />
                    ) : (
                      <Banknote size={18} aria-hidden="true" />
                    )}
                  </span>
                  <CardTitle>{mode === 'reborrow' ? 'Re-borrow' : 'Make a payment'}</CardTitle>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('payment')}
                      className={segmentClass(mode === 'payment')}
                    >
                      Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('reborrow')}
                      className={segmentClass(mode === 'reborrow')}
                    >
                      Re-borrow
                    </button>
                  </div>
                  <LedgerForm
                    mode={mode}
                    debtId={debt.id}
                    defaultAmount={monthlyDefault}
                    onDone={refresh}
                  />
                </CardBody>
              </Card>
            </aside>

            <section className="lg:col-start-1 lg:row-start-1">
              <Card>
                <CardHeader>
                  <CardIcon icon={History} />
                  <CardTitle>Activity log</CardTitle>
                </CardHeader>
                <CardBody>
                  {paymentsQuery.loading ? (
                    <LoadingBlock />
                  ) : payments.length === 0 ? (
                    <EmptyState
                      icon={History}
                      title="No activity yet"
                      description="Payments and re-borrows for this debt will appear here."
                    />
                  ) : (
                    <ol>
                      {payments.map((payment, index) => {
                        const isReborrow = payment.payment_type === 'reborrow'
                        const Icon = isReborrow ? RotateCcw : Banknote
                        const isLast = index === payments.length - 1
                        return (
                          <li key={payment.id} className="group relative flex gap-3 pb-5 last:pb-0">
                            {!isLast ? (
                              <span
                                className="absolute left-4 top-9 h-[calc(100%-1.75rem)] w-px -translate-x-1/2 bg-slate-200"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span
                              className={cn(
                                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                                isReborrow
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-accent-100 text-accent-700'
                              )}
                            >
                              <Icon size={15} aria-hidden="true" />
                            </span>
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                                  <span className="font-medium text-slate-900">
                                    {isReborrow ? 'Re-borrow' : 'Payment'}
                                  </span>
                                  <span
                                    className={cn(
                                      'font-semibold',
                                      isReborrow ? 'text-amber-700' : 'text-accent-700'
                                    )}
                                  >
                                    {isReborrow ? '+' : '\u2212'}
                                    {formatCurrency(payment.amount)}
                                  </span>
                                </p>
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
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </CardBody>
              </Card>
            </section>
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
