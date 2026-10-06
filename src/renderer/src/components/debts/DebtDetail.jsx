import { api } from '@renderer/lib/api.js'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Banknote, CircleMinus, FileText, History } from 'lucide-react'
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
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { ReceiptViewer } from '@renderer/components/income/ReceiptViewer.jsx'
import { ReceiptField } from '@renderer/components/ui/ReceiptField.jsx'
import { buildInstallments, installmentStatus } from '@renderer/lib/installments.js'
import { formatCurrency, formatDate, paymentTypeLabel, todayInput } from '@renderer/lib/format.js'
import { toCents } from '@shared/money.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const SCHEDULE_VARIANT = {
  paid: 'success',
  partial: 'info',
  overdue: 'danger',
  upcoming: 'neutral'
}
const SCHEDULE_LABEL = { paid: 'Paid', partial: 'Partial', overdue: 'Overdue', upcoming: 'Upcoming' }

// Records one payment (a free-form payment, or one tied to a schedule row).
function LedgerForm({ idPrefix, debtId, installment, defaultAmount, onDone }) {
  const [receiptPath, setReceiptPath] = useState(null)
  const suggested = defaultAmount != null ? String(defaultAmount) : ''
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm({ defaultValues: { amount: suggested, date: todayInput(), notes: '' } })

  const onSubmit = async (values) => {
    try {
      await api.debts.addPayment(debtId, {
        amount: Number(values.amount),
        date: values.date,
        notes: values.notes,
        installment_due: installment?.due_date ?? null,
        receipt_path: receiptPath
      })
      toast('Payment recorded', 'success')
      reset({ amount: suggested, date: todayInput(), notes: '' })
      setReceiptPath(null)
      onDone()
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Amount" htmlFor={`${idPrefix}-amount`} error={errors.amount?.message}>
        <Input
          id={`${idPrefix}-amount`}
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
      <Field label="Date" htmlFor={`${idPrefix}-date`} error={errors.date?.message}>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          hasError={Boolean(errors.date)}
          {...register('date', { required: 'Date is required' })}
        />
      </Field>
      <Field label="Proof" htmlFor={`${idPrefix}-receipt`}>
        <ReceiptField id={`${idPrefix}-receipt`} value={receiptPath} onChange={setReceiptPath} />
      </Field>
      <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
        <Input id={`${idPrefix}-notes`} placeholder="Optional" {...register('notes')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {installment ? 'Record payment' : 'Add payment'}
      </Button>
    </form>
  )
}

function DebtSchedule({ debt, payments, onChanged, onViewProof }) {
  const today = todayInput()
  const installments = buildInstallments(debt)
  const [payTarget, setPayTarget] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  const byDue = new Map()
  for (const payment of payments) {
    if (!payment.installment_due) continue
    const list = byDue.get(payment.installment_due) ?? []
    list.push(payment)
    byDue.set(payment.installment_due, list)
  }

  const removeInstallment = async () => {
    if (!pendingRemove) return
    setRemoving(true)
    try {
      for (const payment of pendingRemove.payments) {
        await api.debts.removePayment(payment.id)
        if (payment.receipt_path) api.files.deleteReceipt(payment.receipt_path).catch(() => {})
      }
      toast('Payment removed', 'success')
      setPendingRemove(null)
      onChanged()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardIcon icon={History} />
        <CardTitle>Payment schedule</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {installments.length === 0 ? (
          <EmptyState
            icon={History}
            title="No schedule"
            description="Set a monthly amount and a first payment date to generate the installments."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-800">
            {installments.map((installment) => {
              const linked = byDue.get(installment.due_date) ?? []
              const paidCents = linked.reduce((sum, payment) => sum + toCents(payment.amount), 0)
              const amountCents = toCents(installment.amount)
              const status = installmentStatus(paidCents, amountCents, installment.due_date, today)
              const remainingPesos = Math.max(0, amountCents - paidCents) / 100
              const proof = linked.find((payment) => payment.receipt_path)
              return (
                <li
                  key={installment.index}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-gray-100">
                      {installment.due_date ? formatDate(installment.due_date) : 'No date'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
                      {formatCurrency(installment.amount)}
                      {status === 'partial' ? ` · ${formatCurrency(remainingPesos)} left` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SCHEDULE_VARIANT[status]}>{SCHEDULE_LABEL[status]}</Badge>
                    {proof ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewProof(proof.receipt_path)}
                      >
                        <FileText size={15} aria-hidden="true" />
                        Proof
                      </Button>
                    ) : null}
                    {status !== 'paid' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPayTarget({ ...installment, paid: paidCents })}
                      >
                        <Banknote size={15} aria-hidden="true" />
                        Pay
                      </Button>
                    ) : null}
                    {linked.length ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Undo payment for ${installment.due_date}`}
                        onClick={() => setPendingRemove({ payments: linked })}
                      >
                        <CircleMinus size={16} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Record payment"
        description={
          payTarget?.due_date ? `Installment due ${formatDate(payTarget.due_date)}` : undefined
        }
      >
        {payTarget ? (
          <LedgerForm
            idPrefix={`sched-${payTarget.index}`}
            debtId={debt.id}
            installment={payTarget}
            defaultAmount={Math.max(0, toCents(payTarget.amount) - payTarget.paid) / 100}
            onDone={() => {
              setPayTarget(null)
              onChanged()
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Undo this payment?"
        message="This removes the payment(s) recorded for this installment and recalculates the balance."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={removeInstallment}
        onCancel={() => setPendingRemove(null)}
      />
    </Card>
  )
}

function TransactionLedger({ payments, onViewProof, onRemove }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No transactions yet"
        description="Payments recorded for this debt will appear here."
      />
    )
  }
  return (
    <ol>
      {payments.map((payment, index) => {
        const isLast = index === payments.length - 1
        return (
          <li key={payment.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-4 top-9 h-[calc(100%-1.75rem)] w-px -translate-x-1/2 bg-slate-200 dark:bg-gray-700"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-300">
              <Banknote size={15} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-medium text-slate-900 dark:text-gray-100">Payment</span>
                  <span className="font-semibold text-accent-700 dark:text-accent-400">
                    {formatCurrency(payment.amount)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
                  {formatDate(payment.date)}
                  {payment.notes ? ` · ${payment.notes}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {payment.receipt_path ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="View payment proof"
                    onClick={() => onViewProof(payment.receipt_path)}
                  >
                    <FileText size={16} aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove payment"
                  onClick={() => onRemove(payment)}
                >
                  <CircleMinus size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function DebtDetail({ debtId, open, onClose, onChanged }) {
  const [viewReceipt, setViewReceipt] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
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
    if (!pendingRemove) return
    setRemoving(true)
    try {
      await api.debts.removePayment(pendingRemove.id)
      if (pendingRemove.receipt_path) {
        api.files.deleteReceipt(pendingRemove.receipt_path).catch(() => {})
      }
      toast('Payment removed', 'success')
      setPendingRemove(null)
      refresh()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setRemoving(false)
    }
  }

  const paidPercent =
    debt && debt.total_amount > 0 ? (debt.paid_amount / debt.total_amount) * 100 : 0
  const isMonthly = debt?.payment_type === 'monthly'

  return (
    <Modal open={open} onClose={onClose} title="Debt details" size="xl">
      {debtQuery.loading ? (
        <LoadingBlock />
      ) : debtQuery.error ? (
        <ErrorState message={debtQuery.error} onRetry={debtQuery.reload} />
      ) : !debt ? (
        <ErrorState message="This debt could not be found." />
      ) : (
        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-gray-700 dark:bg-[#2f2f2f] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                  {debt.creditor}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {paymentTypeLabel(debt.payment_type)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {debt.receipt_path ? (
                  <Button variant="secondary" size="sm" onClick={() => setViewReceipt(debt.receipt_path)}>
                    <FileText size={15} aria-hidden="true" />
                    View proof
                  </Button>
                ) : null}
                <Badge variant={statusVariant(debt.effective_status)}>
                  {debt.effective_status}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-gray-500">Total</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {formatCurrency(debt.total_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-gray-500">Paid</p>
                <p className="text-sm font-semibold text-accent-700 dark:text-green-400">
                  {formatCurrency(debt.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-gray-500">Remaining</p>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(debt.remaining_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-gray-500">
                  {isMonthly ? 'First payment' : 'Due date'}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {formatDate(isMonthly ? debt.first_payment_date : debt.due_date)}
                </p>
              </div>
            </div>

            <div>
              <ProgressBar percent={paidPercent} />
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                {Math.round(paidPercent)}% paid
                {isMonthly && debt.monthly_amount
                  ? ` · ${formatCurrency(debt.monthly_amount)} / month for ${Math.max(1, Math.ceil(debt.total_amount / debt.monthly_amount))} months`
                  : ''}
              </p>
            </div>
          </div>

          {isMonthly ? (
            <DebtSchedule
              debt={debt}
              payments={payments}
              onChanged={refresh}
              onViewProof={setViewReceipt}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
              <section>
                <Card>
                  <CardHeader>
                    <CardIcon icon={History} />
                    <CardTitle>Transaction History</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <TransactionLedger
                      payments={payments}
                      onViewProof={setViewReceipt}
                      onRemove={setPendingRemove}
                    />
                  </CardBody>
                </Card>
              </section>
              <aside>
                <Card>
                  <CardHeader>
                    <CardIcon icon={Banknote} />
                    <CardTitle>Make a payment</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <LedgerForm idPrefix="ledger" debtId={debt.id} onDone={refresh} />
                  </CardBody>
                </Card>
              </aside>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Remove payment?"
        message="This removes the payment from the ledger and recalculates the debt balance."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={confirmRemovePayment}
        onCancel={() => setPendingRemove(null)}
      />

      <ReceiptViewer
        open={Boolean(viewReceipt)}
        filename={viewReceipt}
        onClose={() => setViewReceipt(null)}
      />
    </Modal>
  )
}
