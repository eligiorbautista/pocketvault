import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Trash2 } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { formatCurrency, formatDate, todayInput } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

function ContributionForm({ goalId, incomeOptions, onDone }) {
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({ defaultValues: { amount: '', date: todayInput(), income_id: '', notes: '' } })

  const onSubmit = async (values) => {
    setBusy(true)
    try {
      await window.api.savings.addContribution(goalId, {
        amount: Number(values.amount),
        date: values.date,
        income_id: values.income_id ? Number(values.income_id) : null,
        notes: values.notes
      })
      toast('Contribution added', 'success')
      reset({ amount: '', date: todayInput(), income_id: '', notes: '' })
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
        <Field label="Amount" htmlFor="contrib-amount" error={errors.amount?.message} required>
          <Input
            id="contrib-amount"
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
        <Field label="Date" htmlFor="contrib-date" error={errors.date?.message} required>
          <Input
            id="contrib-date"
            type="date"
            hasError={Boolean(errors.date)}
            {...register('date', { required: 'Date is required' })}
          />
        </Field>
      </div>
      <Field label="Linked income" htmlFor="contrib-income" hint="Optional">
        <Select id="contrib-income" {...register('income_id')}>
          <option value="">Not linked</option>
          {incomeOptions.map((income) => (
            <option key={income.id} value={income.id}>
              {formatDate(income.date)} {'\u00b7'} {income.source || 'Income'} {'\u00b7'}{' '}
              {formatCurrency(income.amount)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="contrib-notes">
        <Input id="contrib-notes" placeholder="Optional" {...register('notes')} />
      </Field>
      <Button type="submit" size="sm" loading={busy}>
        Add contribution
      </Button>
    </form>
  )
}

export function SavingsDetail({ goalId, open, onClose, onChanged }) {
  const [pendingDelete, setPendingDelete] = useState(null)
  const [removing, setRemoving] = useState(false)

  const goalQuery = useApiData(
    () => (goalId ? window.api.savings.get(goalId) : Promise.resolve(null)),
    [goalId, open]
  )
  const contributionsQuery = useApiData(
    () => (goalId ? window.api.savings.contributions(goalId) : Promise.resolve([])),
    [goalId, open]
  )
  const incomeQuery = useApiData(
    () => (open ? window.api.income.all({}) : Promise.resolve([])),
    [open]
  )

  const goal = goalQuery.data
  const contributions = contributionsQuery.data ?? []
  const incomeOptions = incomeQuery.data ?? []

  const refresh = () => {
    goalQuery.reload()
    contributionsQuery.reload()
    onChanged?.()
  }

  const confirmRemove = async () => {
    if (!pendingDelete) return
    setRemoving(true)
    try {
      await window.api.savings.removeContribution(pendingDelete.id)
      toast('Contribution removed', 'success')
      setPendingDelete(null)
      refresh()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Savings goal" size="lg">
      {goalQuery.loading || !goal ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{goal.goal_name}</p>
                <p className="text-xs text-slate-500">Deadline: {formatDate(goal.deadline)}</p>
              </div>
              <p className="text-sm font-semibold text-accent-700">
                {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
              </p>
            </div>
            <div className="mt-3">
              <ProgressBar percent={goal.percent} />
              <p className="mt-1 text-xs text-slate-500">
                {Math.round(goal.percent)}% funded
                {goal.complete ? ' \u00b7 goal reached!' : ` \u00b7 ${formatCurrency(goal.remaining)} to go`}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Add contribution</h3>
            <ContributionForm goalId={goal.id} incomeOptions={incomeOptions} onDone={refresh} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Contributions</h3>
            {contributions.length === 0 ? (
              <p className="text-sm text-slate-500">No contributions yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {contributions.map((contribution) => (
                  <li key={contribution.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(contribution.amount)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(contribution.date)}
                        {contribution.income_source ? ` \u00b7 from ${contribution.income_source}` : ''}
                        {contribution.notes ? ` \u00b7 ${contribution.notes}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove contribution"
                      onClick={() => setPendingDelete(contribution)}
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
        open={Boolean(pendingDelete)}
        title="Remove contribution?"
        message="This reduces the goal's saved amount."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  )
}
