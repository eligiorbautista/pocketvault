import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Plus, Wallet } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@shared/constants.js'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { Badge } from '@renderer/components/ui/Badge.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { categoryLabel, currentMonthInput, formatCurrency, formatMonth } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

function BudgetForm({ open, initial, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm()
  const category = watch('category')

  useEffect(() => {
    if (open) {
      const known = EXPENSE_CATEGORIES.some((c) => c.value === initial?.category)
      reset({
        category: !initial ? 'food' : known ? initial.category : '__custom__',
        customCategory: initial && !known ? initial.category : '',
        monthly_limit: initial?.monthly_limit ?? ''
      })
    }
  }, [open, initial, reset])

  const onSubmit = async (values) => {
    const resolvedCategory =
      values.category === '__custom__' ? values.customCategory.trim() : values.category
    try {
      await api.budgets.upsert({
        category: resolvedCategory,
        monthly_limit: Number(values.monthly_limit)
      })
      toast('Budget saved', 'success')
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
      title={initial ? 'Edit budget' : 'Set budget'}
      description="Budgets apply to every month for the selected category."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="budget-form" loading={isSubmitting}>
            Save budget
          </Button>
        </div>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Category" htmlFor="budget-category" required>
          <Select id="budget-category" disabled={Boolean(initial)} {...register('category')}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </Select>
        </Field>
        {category === '__custom__' ? (
          <Field
            label="Custom category"
            htmlFor="budget-custom-category"
            error={errors.customCategory?.message}
            required
          >
            <Input
              id="budget-custom-category"
              placeholder="e.g. Pet care"
              disabled={Boolean(initial)}
              hasError={Boolean(errors.customCategory)}
              {...register('customCategory', {
                required: category === '__custom__' ? 'Enter a category name' : false
              })}
            />
          </Field>
        ) : null}
        <Field label="Monthly limit" htmlFor="budget-limit" error={errors.monthly_limit?.message} required>
          <Input
            id="budget-limit"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            hasError={Boolean(errors.monthly_limit)}
            {...register('monthly_limit', {
              required: 'Monthly limit is required',
              validate: (value) => Number(value) > 0 || 'Must be greater than zero'
            })}
          />
        </Field>
      </form>
    </Modal>
  )
}

export default function Budgets() {
  const [month, setMonth] = useState(currentMonthInput())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useApiData(
    () => api.budgets.list(month),
    [month]
  )

  const budgets = data ?? []
  const overBudgets = budgets.filter((budget) => budget.over)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.budgets.remove(pendingDelete.id)
      toast('Budget removed', 'success')
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Set a monthly limit per category and watch your progress."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Set budget
          </Button>
        }
      />

      <Card className="p-4">
        <Field label="Month" htmlFor="budget-month" className="max-w-xs">
          <Input
            id="budget-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || currentMonthInput())}
          />
        </Field>
      </Card>

      {overBudgets.length > 0 ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {overBudgets.length} category{overBudgets.length > 1 ? 'ies' : ''} over budget
            </p>
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-300/90">
              {overBudgets.map((budget) => categoryLabel(budget.category)).join(', ')} exceeded the limit
              for {formatMonth(month)}.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Card>
          <LoadingBlock />
        </Card>
      ) : budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No budgets for this month"
            description="Set a monthly limit for a category to start tracking."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={16} aria-hidden="true" />
                Set budget
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => (
            <Card key={budget.id} className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">
                    {categoryLabel(budget.category)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    {formatCurrency(budget.spent)} of {formatCurrency(budget.monthly_limit)}
                  </p>
                </div>
                {budget.over ? <Badge variant="danger">Over</Badge> : null}
              </div>
              <ProgressBar percent={budget.percent} over={budget.over} />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-gray-400">
                  {budget.over
                    ? `${formatCurrency(Math.abs(budget.remaining))} over`
                    : `${formatCurrency(budget.remaining)} left`}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(budget)
                      setFormOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    onClick={() => setPendingDelete(budget)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BudgetForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove budget?"
        message="This deletes the monthly limit for this category. Existing expenses are not affected."
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
